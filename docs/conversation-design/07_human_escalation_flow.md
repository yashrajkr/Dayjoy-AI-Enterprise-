# Human Escalation Flow

> **Flow type:** `human_escalation`
> **Implementation:** `vapi/flows/vapi-human-escalation-flow.ts`
> **Trigger:** Caller explicitly asks for a human, becomes upset or abusive, hits a 3-fail trigger in another flow, or any of the immediate escalation criteria in the escalation protocols are met.

## 1. Description

The Human Escalation flow is the safety valve of the entire platform. It is invoked when Sarah cannot or should not continue the conversation — when the customer needs a human, when the question is out of scope, or when the situation is sensitive (legal, medical, regulatory).

This flow is **not a regular flow** in the sense that it does not follow the standard `greeting → gather → lookup → propose → confirm → close` anatomy. It is a short, three-step choreography: **acknowledge → summarise → transfer**. The whole flow typically completes in under 90 seconds — its purpose is to get the customer to a human as quickly as possible while preserving the context the human will need.

Every other flow can hand off to this one. The handoff preserves the call context: the customer's identification, the active flow's `collectedData`, and the conversation history all come with the transfer so the human agent picking up does not start from zero.

## 2. Customer Journey

```
                    ┌──────────────────────────┐
                    │  Escalation trigger      │
                    │  detected in any flow    │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  AI acknowledges +       │  "I understand this is important."
                    │  empathises              │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  AI summarises issue     │  (builds callSummary from session
                    │  for the human agent     │   memory + active flow's collectedData)
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Confirm callback number │  "Is +91... the best number?"
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  human_transfer tool     │
                    │  - department            │
                    │  - reason                │
                    │  - priority              │
                    │  - callSummary           │
                    │  - customerName          │
                    │  - customerPhone         │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Notify support team     │  (IN_APP notification + audit interaction)
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Speak transfer phrase   │  "Transferring you now. Please stay on the line."
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Vapi webhook performs   │  (SIP REFER via Vapi REST API)
                    │  the actual transfer     │
                    └──────────────────────────┘
```

## 3. Steps in Detail

| Step | Assistant action | Tool calls |
|---|---|---|
| `acknowledge` | Empathise with the customer using one of the approved escalation phrases. Never argue. Never say "I can't help you". | (none) |
| `summarise` | Build a one-paragraph call summary from the session memory: the customer's stated issue, what Sarah tried, and why it's being escalated. | (none — builds from session memory) |
| `confirm_callback` | Repeat the customer's phone number back and ask "Is this the best number for a callback?" | (none — uses the caller ID or customer record) |
| `transfer` | Call `human_transfer` with `department`, `reason`, `priority`, `callSummary`, `customerName`, `customerPhone`. | `human_transfer` |
| `handoff` | Speak the transfer phrase ("I'm transferring you to {Department} now. Please stay on the line — an agent will be with you shortly."). End the assistant's role in the conversation. | (none — Vapi webhook performs the SIP transfer) |

## 4. Example Conversation

> Mid-`customer_support` call — the customer has been trying to get a refund for 3 turns and is getting frustrated.

```
Rahul:  This is the third time I'm explaining — my refund hasn't
        come through, and I want it sorted now.

Sarah:  I understand this is important, and I'm sorry for the
        frustration. Let me transfer you to a specialist who can
        resolve this immediately. Before I do, let me confirm —
        is +91 98765 43210 still the best number for a callback
        if we get disconnected?

Rahul:  Yes.

Sarah:  [human_transfer(department="customer_service",
            reason="Customer frustrated about delayed refund after
            3 attempts to resolve",
            priority="high",
            callSummary="Customer Rahul Sharma (DJ-7G3K9P) has been
            waiting for a ₹1,200 refund for 21 days. Knowledge base
            refund timeline is 5-7 business days. Customer is upset
            and requesting immediate resolution.",
            customerName="Rahul Sharma",
            customerPhone="+919876543210")]
        I'm transferring you to Customer Service now. Please stay
        on the line — an agent will be with you shortly. Thank you
        for your patience.
```

The IN_APP notification received by the support team:

```
Subject: [Voice Transfer] Customer Service — Customer frustrated about delayed refund after 3 attempts
Body:
  Department: Customer Service
  Reason: Customer frustrated about delayed refund after 3 attempts to resolve
  Priority: high
  Summary: Customer Rahul Sharma (DJ-7G3K9P) has been waiting for a ₹1,200 refund
           for 21 days. Knowledge base refund timeline is 5-7 business days.
           Customer is upset and requesting immediate resolution.
  Customer: Rahul Sharma
  Callback: +919876543210
  Call ID: call_abc123
  Caller: +919876543210
```

## 5. Tools Used

| Tool | When | Why |
|---|---|---|
| `human_transfer` | In `transfer` step | The only tool this flow calls. Updates the VoiceSession to `transferring`, sends the IN_APP notification, writes the audit interaction. |
| `customer_lookup` | (Sometimes) Before `transfer`, if the customer was not identified at call start | Recover the customer identity for the audit trail |
| `distributor_lookup` | (Sometimes) If the caller is a distributor | Recover the distributor identity for the audit trail |

## 6. Escalation Triggers

This flow *is* the escalation — but it is itself triggered by the criteria in the escalation protocols. The full list (from `vapi/prompts/escalation-protocols.ts`):

### Immediate Escalation

- Customer uses abusive, threatening, or discriminatory language.
- Customer mentions a lawsuit, lawyer, or legal action.
- Customer mentions a medical emergency or adverse health event.
- Customer explicitly requests a human.
- Customer mentions a refund amount greater than ₹10,000.
- Customer asks for medical, legal, tax, or financial advice.
- Customer asks a regulatory / compliance question.

### Escalation After 3 Failed Attempts

- Sarah has tried to answer the same question 3 times and the customer is not satisfied.
- The customer says "I don't understand" 3 or more times.
- The customer repeats the same question 3 or more times.

### Department Routing

| Trigger | Department | Priority |
|---|---|---|
| General complaint / order issue | `customer_service` | normal |
| Angry customer | `manager` | urgent |
| Legal / compliance question | `manager` | high |
| Refund > ₹10,000 | `customer_service` | high |
| Medical / health claim | `customer_service` | high |
| Distributor dispute | `business_development` | high |
| Technical issue (website/app/payment) | `technical_support` | normal |
| Bulk / custom pricing | `sales` | normal |
| 3 failed attempts (any flow) | The flow's default department | high |

## 7. Success Criteria

- **Time-to-transfer ≤ 90 seconds** — from the moment the escalation trigger fires to the moment the `human_transfer` tool returns success.
- **Context completeness = 100%** — every transfer must include a `callSummary`, `customerName`, `customerPhone`, and `reason` (audited by sampling).
- **Wrong-department rate ≤ 5%** — fewer than 5% of transfers should be re-routed by the human agent to a different department.
- **Drop rate ≤ 3%** — fewer than 3% of transferred calls should drop during the transfer itself (measured by the Vapi `call.ended` event firing before the human agent connects).
- **Customer satisfaction ≥ 4.0 / 5** — even on escalated calls, the customer should feel heard and well-handled (measured by the post-call survey).

## 8. Edge Cases

- **Customer hangs up before the transfer completes**: the IN_APP notification still fires, so the support team can call back. The `customerPhone` in the notification is the callback number.
- **`human_transfer` tool fails** (e.g., notification service down): Sarah apologises, asks the customer to hold, and retries once. If it fails again, she gives the customer the support number to call directly.
- **Customer wants to be transferred to a specific person**: Sarah explains she cannot route to a specific person; she routes to the department, which will assign the right agent.
- **Customer is calling outside support hours**: Sarah transfers anyway (the call goes to the after-hours queue); she does not promise a specific callback time.
- **Customer is calling about a different issue mid-transfer** (changes topic): Sarah acknowledges the new issue, adds it to the call summary, and proceeds with the transfer — she does not start a new flow.
- **Customer provides a different callback number mid-transfer**: Sarah updates the `customerPhone` in the `human_transfer` call and confirms.
- **Customer asks "Will I be charged for this call?": Sarah clarifies the call is free for the customer; if it's an inbound call to a Dayjoy toll-free number, the company bears the cost.
- **Customer is abusive after the transfer is initiated**: Sarah does not respond — she has already spoken the transfer phrase and the assistant's role in the conversation is over. The webhook will complete the transfer.

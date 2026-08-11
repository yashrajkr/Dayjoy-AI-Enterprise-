# Distributor Support Flow

> **Flow type:** `distributor_support`
> **Implementation:** `vapi/flows/vapi-distributor-support-flow.ts`
> **Trigger:** Existing Dayjoy distributor asks about commissions, rank, downline, payouts, or business operations.

## 1. Description

The Distributor Support flow serves Dayjoy's most valuable callers: the independent distributors who sell products and recruit new distributors. These callers are sophisticated — they know the business, they have a distributor code, and they have specific operational questions: "When is my commission payout?", "What's my current rank?", "How many people are in my downline?", "How do I qualify for the next rank?".

Sarah's job is to **identify the distributor, fetch their live business data, and answer grounded in real numbers** — never from memory. The compensation plan is complex (multiple ranks, multiple bonus types, monthly qualification), and any wrong number Sarah quotes could become a compliance issue. Every percentage, threshold, and qualification requirement must come from `search_knowledge`; every distributor-specific number must come from `distributor_lookup`.

## 2. Customer Journey

```
                    ┌──────────────────────────┐
                    │  Distributor calls       │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Greeting                │  "Hi {name}, I see you're a Dayjoy distributor — code {code}."
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Distributor asks about: │
                    │  - commission / payout   │
                    │  - rank / qualification  │
                    │  - downline / team       │
                    │  - orders / revenue      │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  AI looks up distributor │  (distributor_lookup)
                    │  + searches comp plan    │  (search_knowledge for policy)
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  AI answers with         │  "Your current rank is Silver..."
                    │  real numbers + cites    │  "...to qualify for Gold you need..."
                    └─────────────┬────────────┘
                                  │
                          ┌───────┴────────┐
                          │ Issue resolved?│
                          └───────┬────────┘
                          yes     │     no
                          ┌───────┘       └───────┐
                          ▼                       ▼
              ┌────────────────────┐   ┌────────────────────┐
              │  Close             │   │  Create ticket OR  │
              │                    │   │  transfer to BD    │
              └─────────┬──────────┘   └─────────┬──────────┘
                        │                        │
                        └──────────┬─────────────┘
                                   ▼
                       ┌────────────────────┐
                       │  Close             │
                       └────────────────────┘
```

## 3. Steps in Detail

| Step | Assistant action | Tool calls |
|---|---|---|
| `greeting` | Identify the distributor by caller ID (or ask for their distributor code if not identified). Greet by name + tier. | `distributor_lookup` (already done at call start if caller matched) |
| `gather_question` | Ask what they need help with. Categorise: `commission`, `rank`, `downline`, `orders`, `policy`. | (none) |
| `lookup` | Fetch the distributor's live business data. If the question is about policy/qualification, also search the comp plan. | `distributor_lookup`, `search_knowledge` |
| `answer` | Present the answer with real numbers from `distributor_lookup` + cited policy from `search_knowledge`. Never quote a percentage from memory. | (none — synthesises from prior tool output) |
| `next_steps` | If the distributor wants to act (e.g., dispute a commission, request a payout reissue), offer to create a ticket or transfer to business development. | `create_support_ticket`, `human_transfer` |
| `close` | Mandatory closing question + sign-off. | (none) |

## 4. Example Conversation

```
Sarah:  Hi Rajesh, thanks for calling Dayjoy. I see you're a Silver
        distributor — code DJ48291. How can I help with your business
        today?

Rajesh: I want to know when my November commission will be paid out.

Sarah:  Let me pull up your account. [distributor_lookup(distributorCode="DJ48291")]
        Your November commission of ₹18,450 is scheduled for payout on
        December 10th. The payout will be credited to your registered
        bank account ending in 4521.

Rajesh: OK. And what do I need to do to qualify for Gold this month?

Sarah:  [search_knowledge("Gold rank qualification requirements")]
        According to our compensation plan, to qualify for Gold you
        need: a personal sales volume of at least 1,000 BV, a team
        sales volume of at least 5,000 BV, and at least 2 directly
        sponsored Silver distributors. As of today, your personal
        volume is 780 BV and your team volume is 3,200 BV. You're
        220 BV away on personal and 1,800 BV away on team. Would
        you like me to create a follow-up so our business development
        team can help you with a plan to hit Gold?

Rajesh: Yes, please.

Sarah:  [create_support_ticket(subject="Gold qualification plan for DJ48291",
            description="Distributor Rajesh (DJ48291) is 220 BV short on
            personal and 1,800 BV short on team for Gold qualification.",
            category="account", priority="medium")]
        I've created a follow-up ticket. Your ticket number is C8K2P4M9.
        Our business development team will reach out within 48 hours.
        Is there anything else I can help you with?

Rajesh: No, that's great. Thanks.

Sarah:  Thank you for calling Dayjoy. Have a great day, and best of
        luck with your Gold qualification!
```

## 5. Tools Used

| Tool | When | Why |
|---|---|---|
| `distributor_lookup` | At call start (caller ID) + in `lookup` step (if code is provided) | Fetch live distributor data: tier, commission rate, total orders, revenue, commission earned |
| `search_knowledge` | In `lookup` and `answer` steps | Retrieve comp plan policies, rank qualification requirements, payout schedules |
| `create_support_ticket` | In `next_steps` step | Capture disputes, payout reissue requests, qualification follow-ups |
| `human_transfer` | On escalation trigger | Transfer to `business_development` (default) or `manager` (disputes) |
| `customer_lookup` | Rarely — only if the caller turns out to be a customer, not a distributor | Re-route to the customer support flow |

## 6. Escalation Triggers

| Trigger | Action |
|---|---|
| Distributor disputes a commission amount | Transfer to `business_development` (priority `high`) |
| Distributor alleges a payout is missing | Transfer to `business_development` (priority `high`) + create ticket |
| Distributor asks for legal / regulatory info | Transfer to `manager` (compliance) |
| Distributor is upset / abusive | Transfer to `manager` (priority `urgent`) |
| Distributor asks for an income claim ("how much will I earn?") | Handoff to `business_plan` flow (income disclosure handling) |
| 3 failed attempts to answer | Transfer to `business_development` with call summary |
| `distributor_lookup` returns `found: false` 3 times | Re-route to `lead_collection` (caller may be a prospect) |

## 7. Success Criteria

- **First-call resolution rate ≥ 50%** — distributor's question is answered without a transfer (the rest are inherently complex disputes that need a human).
- **Number accuracy = 100%** — every commission, BV, and rank number Sarah quotes must match the live distributor record (audited by sampling).
- **Policy citation rate = 100%** — every rank/bonus/payout policy Sarah quotes must be traceable to a `search_knowledge` citation.
- **Average handle time ≤ 4 minutes** — the flow completes (or escalates) within 4 minutes for 80% of calls.
- **Distributor CSAT ≥ 4.5 / 5** — distributors are a high-value cohort; the bar is higher than for general customer support.

## 8. Edge Cases

- **Caller is a prospect, not a distributor**: `distributor_lookup` returns `found: false`. Sarah asks if they're interested in becoming a distributor and hands off to the `business_plan` flow.
- **Distributor asks about a downline member's performance**: Sarah cannot share another distributor's data (privacy). She explains this and offers to transfer to business development if the inquiry is legitimate (e.g., a sponsor checking on a direct recruit).
- **Distributor asks about a rank that doesn't exist** (e.g., "Diamond"): Sarah looks it up, finds nothing, says "We don't have a Diamond rank" and lists the actual ranks from the knowledge base.
- **Distributor's data is stale** (e.g., the commission total doesn't match what they see in their portal): Sarah creates a ticket for the data team to investigate; she does not speculate on the cause.
- **Distributor asks about the tax treatment of commissions**: This is a financial advice question — Sarah says "I can't give tax advice. Let me transfer you to a specialist" and transfers to `manager`.
- **Distributor wants to update their bank details**: Sarah explains that bank detail updates must be done via the distributor portal (for security) and offers to send a link via SMS — she does not collect bank details over the phone.

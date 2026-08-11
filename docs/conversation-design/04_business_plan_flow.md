# Business Plan Flow

> **Flow type:** `business_plan`
> **Implementation:** `vapi/flows/vapi-business-plan-flow.ts`
> **Trigger:** Prospect (not yet a distributor) asks about joining Dayjoy, the business opportunity, the compensation plan, or earnings potential.

## 1. Description

The Business Plan flow handles the most compliance-sensitive conversations on the platform: prospects asking how the Dayjoy business works and what they can earn. Direct selling is heavily regulated in India (the Consumer Protection (Direct Selling) Rules, 2022), and the company is legally required to provide an Income Disclosure Statement and to not make unrealistic income claims.

Sarah's job in this flow is to **explain the business accurately, ground every percentage in the compensation plan document, never make an income claim, and route interested prospects to a human business development representative** who can walk them through the signup process. She is allowed to explain the structure (retail profit, team override, performance bonus); she is not allowed to quote income potential.

## 2. Customer Journey

```
                    ┌──────────────────────────┐
                    │  Prospect calls Dayjoy   │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Greeting                │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Prospect asks about:    │
                    │  - joining Dayjoy        │
                    │  - the opportunity       │
                    │  - compensation plan     │
                    │  - earnings potential    │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  AI explains the model   │  (search_knowledge: compensation plan)
                    │  Retail profit, team     │  + references Income Disclosure
                    │  override, bonuses       │
                    └─────────────┬────────────┘
                                  │
                          ┌───────┴────────┐
                          │ Prospect wants │
                          │ to proceed?    │
                          └───────┬────────┘
                          yes     │     no
                          ┌───────┘       └───────┐
                          ▼                       ▼
              ┌────────────────────┐   ┌────────────────────┐
              │  Create lead OR    │   │  Provide info +    │
              │  book appointment  │   │  close             │
              │  with BD team      │   │                    │
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
| `greeting` | Standard greeting. No assumption the caller is a prospect — wait for them to state their intent. | (caller ID lookup already done) |
| `gather_question` | Ask what they'd like to know. Categorise: `opportunity`, `compensation`, `join_process`, `earnings`. | (none) |
| `explain` | Explain the Dayjoy business model at a high level. Reference the Income Disclosure Statement for any earnings question. | `search_knowledge` (compensation plan + Income Disclosure Statement) |
| `qualify` | Ask if the prospect would like to proceed. If yes, offer to capture a lead or schedule a call with the BD team. If no, ask if they have any other questions. | (none) |
| `capture` | If prospect wants to proceed, capture their info as a business lead. Optionally book an appointment with BD. | `create_lead` (interest=`business`), optionally `book_appointment` |
| `close` | Mandatory closing question + sign-off. | (none) |

## 4. Example Conversation

```
Sarah:  Hi, thanks for calling Dayjoy. This is Sarah. How can I help?

Anita:  Hi, I saw an ad about becoming a Dayjoy distributor. Can you
        tell me how it works?

Sarah:  Absolutely. Let me pull up our business overview.
        [search_knowledge("Dayjoy business opportunity overview")]
        Dayjoy is a direct selling company. As a distributor, you
        earn income through three streams: retail profit on products
        you sell, team overrides on sales made by distributors you
        sponsor, and performance bonuses based on your rank. To get
        started, you purchase a starter kit and complete a short
        registration with your sponsor's information. Would you
        like to know more about any of those?

Anita:  How much can I earn?

Sarah:  That's a great question. Earnings vary based on individual
        effort, time committed, and team size, so I can't quote a
        specific number. What I can share is our official Income
        Disclosure Statement, which shows the average earnings at
        each rank. Would you like me to email that to you, or would
        you prefer to schedule a call with our business development
        team? They can walk you through real-world examples.

Anita:  Yes, a call would be great.

Sarah:  Wonderful. Can I get your name, email, and phone number so
        I can have someone reach out?

Anita:  Anita Desai, anita.d@email.com, +91 99887 76655.

Sarah:  Let me confirm — Anita Desai, anita.d@email.com,
        +91 99887 76655. Is that correct?

Anita:  Yes.

Sarah:  [create_lead(firstName="Anita", lastName="Desai",
            email="anita.d@email.com", phone="+919988776655",
            interest="business",
            notes="Wants BD call about the opportunity + Income
            Disclosure Statement",
            goals="Considering becoming a distributor")]
        Perfect! I've saved your information, Anita. Your reference
        number is D5K9P2M8. Our business development team will
        contact you within 24 hours at anita.d@email.com or
        +91 99887 76655. Is there anything else I can help you with?

Anita:  No, that's all. Thank you!

Sarah:  Thank you for calling Dayjoy. Have a great day, and we look
        forward to speaking with you soon!
```

## 5. Tools Used

| Tool | When | Why |
|---|---|---|
| `search_knowledge` | In `explain` step — always | Retrieve the compensation plan, business overview, and Income Disclosure Statement (always cited, never recited from memory) |
| `customer_lookup` | At call start (caller ID) | Check if the prospect is already a customer (so the lead can be linked) |
| `distributor_lookup` | Rarely — only if the caller mentions a distributor code | Check if the caller is already a distributor (in which case, hand off to `distributor_support`) |
| `create_lead` | In `capture` step | Capture the prospect with `interest='business'` and their goals in `notes` |
| `book_appointment` | In `capture` step (optional) | Schedule a BD call if the prospect wants a specific time |
| `human_transfer` | On escalation trigger | Transfer to `business_development` |

## 6. Escalation Triggers

| Trigger | Action |
|---|---|
| Prospect demands a specific income claim ("Just tell me — will I earn ₹1 lakh a month?") | Transfer to `business_development` (compliance: never make income claims) |
| Prospect mentions a competitor and asks for a comparison | Politely decline; offer to transfer to `business_development` for a consultative comparison |
| Prospect asks about the legality of direct selling | Transfer to `manager` (compliance / legal) |
| Prospect is upset / abusive | Transfer to `manager` (priority `urgent`) |
| Prospect asks a tax / GST question | Transfer to `manager` (financial advice — out of scope) |
| 3 failed attempts to explain the comp plan | Transfer to `business_development` with a summary |
| Prospect asks for the sponsor's personal contact info | Decline (privacy) + offer to capture a lead so BD can introduce them |

## 7. Success Criteria

- **Income claim rate = 0%** — Sarah must never quote a specific earnings number that isn't directly from the Income Disclosure Statement (audited by sampling + automated regex check on transcripts for rupee amounts).
- **RAG citation rate = 100%** — every compensation plan percentage Sarah quotes must be traceable to a `search_knowledge` citation.
- **Lead capture rate ≥ 40%** — of prospects who reach the `qualify` step, at least 40% should agree to a follow-up.
- **Income Disclosure Statement reference rate = 100%** — any time a prospect asks about earnings, Sarah must reference the official Income Disclosure Statement.
- **Average handle time ≤ 5 minutes** — the flow is longer than others because of the explanation, but should still complete (or escalate) within 5 minutes for 80% of calls.

## 8. Edge Cases

- **Caller is already a distributor** (caller ID matches a distributor record): re-route to `distributor_support` flow.
- **Prospect asks about a specific competitor's comp plan**: Sarah declines politely ("I can only speak to the Dayjoy plan") and offers to transfer to BD for a consultative comparison.
- **Prospect insists on a guaranteed income**: Sarah explains that direct selling has no guaranteed income, references the Income Disclosure Statement, and offers to transfer to BD if the prospect wants to dig deeper.
- **Prospect asks about product claims made by a distributor** ("My friend said this product cures diabetes"): this is a medical claim — Sarah says "I can't confirm that. Our products are not intended to treat, cure, or prevent any disease" and offers to transfer to `customer_service` to log a compliance concern.
- **Prospect wants to sign up immediately, without a BD call**: Sarah captures the lead with `interest='business'` and explains that a BD representative will call to complete the registration — she cannot collect registration details (including payment for the starter kit) over the phone.
- **Prospect asks for a discount on the starter kit**: Sarah says starter kit prices are fixed and offers to transfer to `business_development` for any promotional offers.
- **Prospect is calling from outside India**: Sarah explains that Dayjoy currently operates only in India; if they're an NRI interested in cross-border opportunities, she captures the lead with a note for the international BD team.

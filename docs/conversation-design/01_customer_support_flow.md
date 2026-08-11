# Customer Support Flow

> **Flow type:** `customer_support`
> **Implementation:** `vapi/flows/vapi-customer-support-flow.ts`
> **Trigger:** Caller describes a complaint, order issue, return, refund, or any problem with a product or service.

## 1. Description

The Customer Support flow is the most heavily used flow in the Dayjoy voice platform. It handles inbound calls from customers who have a problem — a damaged shipment, a missing item, a billing dispute, a product that did not arrive, a return request, or any other issue that needs a human-style resolution conversation.

Sarah's job in this flow is to **triage, resolve, or escalate** — in that order. She tries to resolve the issue using the knowledge base and the customer's order history; if she cannot, she creates a support ticket so the human support team can follow up; if the issue is severe or the customer is upset, she transfers to a human immediately.

## 2. Customer Journey

```
                    ┌──────────────────────────┐
                    │  Customer calls Dayjoy   │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Greeting                │  "Hi, thanks for calling Dayjoy support. This is Sarah."
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Customer describes issue│
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  AI searches knowledge   │  (search_knowledge + customer_lookup)
                    │  base + order history    │
                    └─────────────┬────────────┘
                                  │
                          ┌───────┴────────┐
                          │ Can resolve?   │
                          └───────┬────────┘
                          yes     │     no
                          ┌───────┘       └───────┐
                          ▼                       ▼
              ┌────────────────────┐   ┌────────────────────┐
              │  AI provides       │   │  AI creates        │
              │  solution + how-to │   │  support ticket    │
              └─────────┬──────────┘   └─────────┬──────────┘
                        │                        │
                        └──────────┬─────────────┘
                                   ▼
                       ┌────────────────────┐
                       │  Confirm resolution│  "Did that help?"
                       └─────────┬──────────┘
                                 │
                                 ▼
                       ┌────────────────────┐
                       │  Ask "Anything     │  "Is there anything else?"
                       │  else?"            │
                       └─────────┬──────────┘
                                 │
                                 ▼
                       ┌────────────────────┐
                       │  Close             │  "Thank you for calling Dayjoy."
                       └────────────────────┘
```

## 3. Steps in Detail

| Step | Assistant action | Tool calls |
|---|---|---|
| `greeting` | Acknowledge the call. If caller ID matched a customer record, greet by name. | (none — caller ID lookup happened at call start) |
| `gather_issue` | Ask the customer to describe the issue. Extract the order number if mentioned using a regex (`DJ-[A-Z0-9]{6,10}` and similar patterns). | (none) |
| `lookup` | Search the knowledge base for the relevant policy/SOP. Optionally call `customer_lookup` again if the caller mentions new contact info. | `search_knowledge`, `customer_lookup` |
| `propose` | Offer a solution grounded in the RAG result (return instructions, replacement, refund process). If no solution exists in the knowledge base, propose creating a support ticket. | `search_knowledge` (may re-query for the specific SOP) |
| `confirm` | Verify the customer is satisfied with the proposed resolution. If not, retry the propose step once, then escalate. | (none) |
| `close` | Ask the mandatory closing question. If the customer has no further need, end the call. | (none) |

If at any point the customer asks for a human, becomes abusive, or mentions a refund > ₹10,000, the flow jumps to `human_escalation`.

## 4. Example Conversation

> Caller: +91 98765 43210 — identified as Rahul Sharma, last order DJ-7G3K9P placed 5 days ago.

```
Sarah:  Hi Rahul, thanks for calling Dayjoy support. This is Sarah.
        I see you have a recent order — DJ-7G3K9P. How can I help?

Rahul:  Yeah, the protein powder I ordered arrived but the seal is broken.
        I want a replacement.

Sarah:  I'm sorry about that. Let me check our return policy for opened
        products. [search_knowledge("damaged product replacement")]
        According to our policy, products with a broken seal on arrival
        qualify for a free replacement within 7 days. I can create a
        support ticket and our team will arrange a pickup and replacement.
        Shall I do that?

Rahul:  Yes, please.

Sarah:  [create_support_ticket(subject="Damaged protein powder - broken seal",
            description="Order DJ-7G3K9P arrived with broken seal...",
            category="product", priority="high")]
        I've created a support ticket for you. Your ticket number is
        A7F4K9L2. Our team will respond within 24 hours and arrange a
        pickup. You can reference ticket number A7F4K9L2 in any future
        communication. Did that help?

Rahul:  Yes, that's great. Thanks.

Sarah:  Is there anything else I can help you with?

Rahul:  No, that's all.

Sarah:  Thank you for calling Dayjoy. Have a great day!
```

## 5. Tools Used

| Tool | When | Why |
|---|---|---|
| `customer_lookup` | At call start (caller ID) + if caller mentions a different email/phone | Identify the caller + pull order history |
| `search_knowledge` | In `lookup` and `propose` steps | Find the relevant policy/SOP (return policy, refund timeline, replacement process) |
| `create_support_ticket` | In `propose` step when the issue cannot be self-resolved | Capture the issue for the support team with all context |
| `human_transfer` | On escalation trigger | Transfer to `customer_service` department |

## 6. Escalation Triggers

| Trigger | Action |
|---|---|
| Customer says "human", "manager", "real person" | Immediate transfer to `customer_service` |
| Abusive / threatening language | Immediate transfer to `manager` (priority `urgent`) |
| Refund amount > ₹10,000 mentioned | Immediate transfer to `customer_service` (policy requires human approval) |
| Legal / compliance question | Immediate transfer to `manager` |
| Medical claim about a product | Immediate transfer to `customer_service` + flag for compliance review |
| 3 failed attempts to resolve | Transfer to `customer_service` with the call summary |
| Customer repeats the same issue 3+ times | Transfer to `customer_service` |

## 7. Success Criteria

- **First-call resolution rate ≥ 60%** — the customer's issue is resolved without a human transfer or a follow-up ticket.
- **Ticket-creation accuracy ≥ 95%** — when a ticket is created, the subject + description + category are correct (audited by sampling 10 tickets per week per agent).
- **Average handle time ≤ 4 minutes** — the flow completes (or escalates) within 4 minutes for 80% of calls.
- **CSAT ≥ 4.2 / 5** — measured by the post-call WhatsApp survey.

## 8. Edge Cases

- **Caller is not yet a customer** (no caller ID match): the flow still works — it skips the order history and creates a ticket with the caller's contact info in `metadata`.
- **Customer mentions multiple orders**: Sarah asks which order the issue is about and only acts on the one the customer confirms.
- **Customer asks about a product the knowledge base has no SOP for**: Sarah says so honestly and offers to create a ticket or transfer — never improvises.
- **Customer provides a new phone number mid-call**: the flow calls `customer_lookup` again with the new number and updates session memory.
- **Customer becomes emotional mid-flow**: even if the issue is on track for self-resolution, the universal `wantsHuman()` check at the top of every step will catch the emotional cue and escalate.

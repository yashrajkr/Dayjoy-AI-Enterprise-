# Conversation Design — Overview

> **Phase 5 — Conversation Flow Design**
>
> This folder contains the design documents for the seven conversation flows the Dayjoy AI assistant (Sarah) handles. Each design doc describes the customer journey, the steps inside the flow, the example conversation, the tools used, the escalation triggers, and the success criteria.
>
> The runtime implementations live in `vapi/flows/` (TypeScript). These design docs are the source of truth for **what** each flow does and **why**; the code is the source of truth for **how**.

---

## The Seven Conversation Flows

Sarah routes every caller utterance to one of seven flows. The flow manager (`vapi/flows/vapi-conversation-flow-manager.ts`) detects the intent and dispatches to the matching flow implementation.

| # | Flow | Trigger | File | Design Doc |
|---|---|---|---|---|
| 1 | Customer Support | Complaint, order issue, return, refund, "I have a problem" | `vapi-customer-support-flow.ts` | `01_customer_support_flow.md` |
| 2 | Product Inquiry | Product question, price, features, availability, "do you have..." | `vapi-product-inquiry-flow.ts` | `02_product_inquiry_flow.md` |
| 3 | Distributor Support | Existing distributor asking about commission, rank, downline | `vapi-distributor-support-flow.ts` | `03_distributor_support_flow.md` |
| 4 | Business Plan | Prospect asking about joining, the opportunity, compensation | `vapi-business-plan-flow.ts` | `04_business_plan_flow.md` |
| 5 | Appointment Booking | Customer wants to schedule a call or meeting | `vapi-appointment-booking-flow.ts` | `05_appointment_booking_flow.md` |
| 6 | Lead Collection | Caller wants to leave contact details / be called back | `vapi-lead-collection-flow.ts` | `06_lead_collection_flow.md` |
| 7 | Human Escalation | Caller demands a human, is upset, or hits a 3-fail trigger | `vapi-human-escalation-flow.ts` | `07_human_escalation_flow.md` |

---

## How Intent Detection Works

The flow manager uses a two-stage intent classifier:

1. **Fast path — heuristic** (`heuristicIntent()`). Keyword rules catch the obvious cases:
   - "refund", "complaint", "broken", "wrong" → `customer_support`
   - "price", "cost", "how much", "available" → `product_inquiry`
   - "commission", "downline", "rank" → `distributor_support`
   - "join", "opportunity", "business plan", "earn" → `business_plan`
   - "schedule", "appointment", "book a call" → `appointment_booking`
   - "call me back", "leave my number" → `lead_collection`
   - "human", "manager", "real person", abusive language → `human_escalation`

   The heuristic is deterministic and adds ~0 ms of latency.

2. **Slow path — LLM classifier** (gpt-4o-mini, temperature 0). Used when the heuristic returns low confidence. The classifier is prompted to emit **only** the intent label — no prose — so the result is parsed with a simple string lookup. A confidence threshold of 0.5 rejects ambiguous utterances and asks the caller to clarify.

Once an intent is committed, the flow state is persisted in Redis session memory (`vapi:session:{sessionId}.flowState`). Subsequent utterances in the same call continue the active flow without re-classifying — this prevents flow thrashing when a customer mixes topics.

When a flow completes (`isComplete: true`), the active flow is cleared and the next utterance is re-classified. This is how a customer can ask about a product, then book an appointment, then leave a lead — three flows in one call.

---

## Common Flow Anatomy

Every flow implements the `VapiFlow` interface (`vapi/flows/vapi-flow-types.ts`) and follows the same step-based state machine:

```
            ┌─────────────┐
            │   greeting  │   ← acknowledge the call, set the tone
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │   gather_*  │   ← collect the relevant info from the caller
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │   lookup    │   ← call the appropriate tool(s)
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │   propose   │   ← offer the solution / recommendation
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │   confirm   │   ← verify the customer is satisfied
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │    close    │   ← "Is there anything else?" → end call
            └─────────────┘
```

Not every flow uses every step — `lead_collection` skips `lookup`, `human_escalation` jumps straight to `transfer` — but the step names are consistent across flows so the live-ops dashboard can render a unified "call progress" view.

---

## Universal Rules (apply to every flow)

1. **Caller ID lookup happens once, at call start.** The webhook handler calls `customer_lookup` with the caller's E.164 number before the first flow runs; the result is cached in session memory. No flow re-looks-up the customer mid-call.

2. **Escalation is checked at the top of every step.** Each flow's `execute()` method starts with `if (this.wantsHuman(context.userMessage)) return this.escalate(...)`. This means a customer can interrupt any flow at any step and be transferred — they do not have to wait for the flow to complete.

3. **Important data is repeated back.** Phone numbers, addresses, order numbers, appointment times, and lead names are confirmed by Sarah speaking them back before they are persisted.

4. **The closing question is mandatory.** Every flow ends by asking *"Is there anything else I can help you with?"* before hanging up. This is enforced by the `close` step — it cannot be skipped.

5. **Tool failures degrade gracefully.** If a tool call throws, the flow returns a `speak` field that apologises and offers to transfer to a human — never an unhandled error message.

6. **All steps are logged.** Each step transition is logged with `sessionId`, `flowType`, `step`, and `userMessage` (truncated + PII-redacted) so the live-ops dashboard and the QA team can replay any call.

---

## Design Doc Template

Each design doc in this folder follows the same structure:

1. **Flow name + description** — one-paragraph summary of what the flow does.
2. **Customer journey** — the end-to-end journey from the customer's perspective, as a flowchart.
3. **Steps in detail** — each step in the state machine, with the assistant's script and the tool calls.
4. **Example conversation** — a realistic Dayjoy call transcript showing the flow in action.
5. **Tools used** — which of the eight tools the flow calls and when.
6. **Escalation triggers** — what causes this flow to hand off to a human.
7. **Success criteria** — how we measure whether the flow did its job.
8. **Edge cases** — the weird inputs the flow has to handle.

---

## Cross-Flow Handoffs

Some flows hand off to other flows mid-call. The common handoffs:

| From | To | Trigger |
|---|---|---|
| `product_inquiry` | `lead_collection` | Customer says "I'm interested" after a product recommendation |
| `product_inquiry` | `appointment_booking` | Customer says "Can I book a demo?" |
| `business_plan` | `lead_collection` | Prospect says "I'd like to join" |
| `business_plan` | `appointment_booking` | Prospect says "Let's schedule a call" |
| `customer_support` | `human_escalation` | 3 failed attempts OR abusive language |
| Any flow | `human_escalation` | Caller says "human" / "manager" |

When a handoff happens, the active flow is marked complete (its `collectedData` is preserved in session memory) and the new flow starts at its `greeting` step. The customer does not have to repeat information they have already given — the new flow can read the previous flow's `collectedData` from session memory.

---

## Measuring Flow Quality

Every call is scored on three dimensions, logged to the `voice_analytics` table, and surfaced on the live-ops dashboard:

1. **Completion rate** — did the flow reach its `close` step, or was it interrupted?
2. **Tool success rate** — what fraction of tool calls inside the flow returned `success: true`?
3. **Customer satisfaction** — derived from the post-call survey (optional, sent via WhatsApp) + sentiment analysis on the transcript.

Targets (per the SLOs in `docs/operations/12_ENTERPRISE_KPIS.md`):
- Completion rate ≥ 85%
- Tool success rate ≥ 95%
- CSAT ≥ 4.2 / 5

Flows that miss their targets for a sustained period trigger an alert to the AI ops team, who can pull the transcripts, identify the failing step, and tune the prompt or the tool.

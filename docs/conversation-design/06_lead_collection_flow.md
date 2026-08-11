# Lead Collection Flow

> **Flow type:** `lead_collection`
> **Implementation:** `vapi/flows/vapi-lead-collection-flow.ts`
> **Trigger:** Caller wants to be contacted back, wants to leave contact details, or expresses interest in Dayjoy products or the business opportunity without immediately booking an appointment.

## 1. Description

The Lead Collection flow is the conversion engine. It handles callers who are not yet customers or distributors but have expressed interest — the most valuable signal a voice platform can capture. A lead captured well is a customer or distributor tomorrow; a lead captured poorly (wrong number, wrong email, missing interest area) is wasted pipeline.

Sarah's job in this flow is to **collect the four essential fields (name, phone, email, interest), confirm them by repeating them back, persist the lead with a high-quality score, and set expectations for the follow-up**. She also captures optional context (goals, notes, company) so the business development team can prioritise and personalise the follow-up.

This flow is often the second half of a `product_inquiry` or `business_plan` call — the customer has already heard the pitch, and now they want to be contacted. The handoff between flows preserves context: when the `lead_collection` flow runs after a `product_inquiry`, the product of interest is captured in `notes` automatically.

## 2. Customer Journey

```
                    ┌──────────────────────────┐
                    │  Customer interested in  │
                    │  joining / being called  │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Greeting                │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Collect name            │  "Can I get your name?"
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Collect phone + email   │  "Best phone and email?"
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Collect interest area   │  "Product, business, or both?"
                    │  + goals (optional)      │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Confirm details         │  "Let me confirm..."
                    │  (repeat back)           │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  create_lead tool        │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Provide next steps      │  "Our team will call within 24 hours."
                    │  + reference number      │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Close                   │
                    └──────────────────────────┘
```

## 3. Steps in Detail

| Step | Assistant action | Tool calls |
|---|---|---|
| `greeting` | Standard greeting. If handed off from `product_inquiry` or `business_plan`, acknowledge the context ("I'd be happy to capture your information so we can follow up about the Women's Multi"). | (none — caller ID lookup already done) |
| `gather_name` | Ask for first + last name. Validate it's not just one word or gibberish. | (none) |
| `gather_contact` | Ask for phone + email. Validate the email format. If phone is missing, ask again. | (none) |
| `gather_interest` | Ask what they're interested in: `product`, `business`, or `both`. Optionally capture goals / company. | (none) |
| `confirm` | Repeat back: name, phone, email, interest. Wait for explicit "yes". | (none) |
| `capture` | Call `create_lead`. If it fails, apologise and offer to transfer. | `create_lead` |
| `next_steps` | Tell the customer the reference number + the expected follow-up window (24 hours). | (none) |
| `close` | Mandatory closing question + sign-off. | (none) |

## 4. Example Conversation

> Handed off from a `product_inquiry` call — the customer just asked about the Women's Multi and said "I'd like to be contacted".

```
Sarah:  I'd be happy to capture your information so we can follow
        up about the Women's Multi. Can I get your first and last
        name?

Priya:  Priya Verma.

Sarah:  And the best phone number and email to reach you?

Priya:  +91 98765 43210 and priya.verma@email.com.

Sarah:  And what are you most interested in — our products, the
        business opportunity, or both?

Priya:  Just the products for now.

Sarah:  Let me confirm — Priya Verma, +91 98765 43210,
        priya.verma@email.com, interested in our products. Is
        that correct?

Priya:  Yes.

Sarah:  [create_lead(firstName="Priya", lastName="Verma",
            email="priya.verma@email.com", phone="+919876543210",
            interest="product",
            notes="Interested in Women's Multi ₹549",
            goals="Wants product follow-up")]
        Perfect! I've saved your information, Priya. Your reference
        number is B3K9P7M2. Our team will contact you within 24
        hours at priya.verma@email.com or +91 98765 43210. Thank
        you for your interest in Dayjoy! Is there anything else I
        can help you with?

Priya:  No, that's all. Thanks!

Sarah:  Thank you for calling Dayjoy. Have a great day!
```

## 5. Tools Used

| Tool | When | Why |
|---|---|---|
| `customer_lookup` | At call start + before `create_lead` | Check if the prospect is already a customer (so the lead can be linked) and avoid creating duplicate leads |
| `distributor_lookup` | If the caller mentions a distributor code | Check if the caller is already a distributor (in which case, hand off to `distributor_support`) |
| `create_lead` | In `capture` step | Persist the lead with all details; returns the reference number |
| `human_transfer` | On escalation trigger or tool failure | Transfer to `business_development` or `sales` |

## 6. Escalation Triggers

| Trigger | Action |
|---|---|
| Customer provides a phone number that doesn't match a valid format after 2 attempts | Offer to capture email-only and transfer to BD for phone follow-up |
| Customer wants to provide more info than the flow can capture (long story, multiple interests) | Capture what fits in `notes` + offer to transfer to BD for a proper conversation |
| Customer is upset / abusive | Transfer to `manager` (priority `urgent`) |
| `create_lead` fails 2 times | Transfer to `business_development` with a summary of what was collected |
| Customer explicitly wants to talk to someone now (not be called back) | Transfer to the relevant department |
| Customer mentions they're already a distributor | Hand off to `distributor_support` |

## 7. Success Criteria

- **Lead capture rate ≥ 90%** — of callers who enter this flow, at least 90% should result in a successful `create_lead` call.
- **Data quality ≥ 95%** — captured name, phone, and email must be valid (audited by sampling + automated format checks).
- **Duplicate rate ≤ 5%** — fewer than 5% of captured leads should be duplicates of existing customers or distributors (measured by email/phone match).
- **Average handle time ≤ 2.5 minutes** — the flow is short and transactional.
- **Lead-to-conversion rate ≥ 15%** — of leads captured via voice, at least 15% should convert to a customer or distributor within 30 days (measured by the BD team's CRM).

## 8. Edge Cases

- **Customer provides only a first name**: Sarah asks for the last name ("And your last name?") — she does not create a lead with a single name.
- **Customer provides an email with a typo** (e.g., "priya@gnail.com"): Sarah does not auto-correct; she asks again ("Could you spell the email for me?").
- **Customer provides a phone number without the country code**: Sarah adds +91 (India) automatically and confirms.
- **Customer refuses to give an email**: Sarah captures the lead with phone-only — email is technically required by the schema, so the flow stores a placeholder `no-email@dayjoy.local` and flags the lead for follow-up.
- **Customer wants to leave info for someone else** (e.g., a spouse): Sarah explains she can only capture the caller's info; the spouse should call back themselves.
- **Customer is a minor**: Sarah explains that Dayjoy requires distributors and customers to be 18+, and offers to transfer to BD for clarification.
- **Customer asks to be removed from the database (GDPR-style request)**: Sarah explains that the request will be forwarded to the privacy team and creates a ticket with the request.
- **Customer provides a landline number**: Sarah captures it but warns that follow-up calls to landlines may not always connect; asks for a mobile if possible.
- **Customer wants to update an existing lead** (called back to add info): Sarah asks for the reference number; if provided, she updates the lead via the CRM (currently via a ticket — full update flow is on the roadmap).

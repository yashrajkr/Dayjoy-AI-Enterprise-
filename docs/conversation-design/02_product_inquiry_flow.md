# Product Inquiry Flow

> **Flow type:** `product_inquiry`
> **Implementation:** `vapi/flows/vapi-product-inquiry-flow.ts`
> **Trigger:** Caller asks about a product, price, features, availability, ingredients, or product category.

## 1. Description

The Product Inquiry flow is the sales engine of the voice platform. It handles callers who want to know what Dayjoy sells, how much it costs, what's in it, and whether it's in stock. Sarah's job is to **recommend the right product, ground every claim in the live catalog + knowledge base, and convert interest into a lead or an appointment** — without ever making up a feature, price, or medical claim.

This flow is the canonical example of the RAG-first rule: every product question is answered by calling `search_products` (for live catalog data) and/or `search_knowledge` (for detailed product info, ingredients, usage), then synthesising the answer strictly from the retrieved data.

## 2. Customer Journey

```
                    ┌──────────────────────────┐
                    │  Customer calls Dayjoy   │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Greeting                │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Customer asks about     │  "Do you have an omega-3 supplement?"
                    │  a product / category    │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  AI searches catalog     │  (search_products)
                    │  + knowledge base        │  (search_knowledge for details)
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  AI recommends product   │  "Yes — Omega-3, ₹399, in stock."
                    │  + price + stock         │
                    └─────────────┬────────────┘
                                  │
                          ┌───────┴────────┐
                          │ Customer       │
                          │ interested?    │
                          └───────┬────────┘
                          yes     │     no
                          ┌───────┘       └───────┐
                          ▼                       ▼
              ┌────────────────────┐   ┌────────────────────┐
              │  create_lead       │   │  Ask if anything   │
              │  (or book          │   │  else              │
              │  appointment)      │   │                    │
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
| `greeting` | Standard greeting. If the caller is identified as a distributor, acknowledge their tier. | (caller ID lookup already done) |
| `gather_query` | Ask what product the customer is interested in. If they already named it on the greeting, skip this step. | (none) |
| `search` | Search the live product catalog. If they ask about features / ingredients / usage, also search the knowledge base. | `search_products`, `search_knowledge` |
| `recommend` | Present up to 3 matching products with name, price, and stock status. Read the price from the catalog result — never from memory. | (none — synthesises from prior tool output) |
| `qualify` | Ask if the customer is interested. If yes, route to `lead_collection` (prospect) or `appointment_booking` (wants a demo). If no, go to `close`. | `create_lead` (if prospect) or handoff to `appointment_booking` flow |
| `close` | Mandatory closing question + sign-off. | (none) |

## 4. Example Conversation

```
Sarah:  Hi, thanks for calling Dayjoy. This is Sarah. How can I help?

Priya:  Hi, I'm looking for a multivitamin for daily use. Do you have
        anything like that?

Sarah:  Let me check our catalog. [search_products("multivitamin")]
        I found 3 multivitamins. First, Daily Multi for ₹499 — a
        comprehensive daily multivitamin. Second, Women's Multi for
        ₹549 — formulated for women. Third, Senior Multi for ₹599 —
        for adults over 50. Which one would you like to know more
        about?

Priya:  The Women's Multi. What's in it?

Sarah:  [search_knowledge("Women's Multi ingredients")]
        According to our product catalog, Women's Multi contains
        22 vitamins and minerals including iron, folic acid, and
        calcium. It's priced at ₹549 for a 30-day supply. Would
        you like to know where to buy it?

Priya:  Yes — actually, I'd like to try it. Can someone call me
        back to take my order?

Sarah:  Absolutely. Can I get your name, email, and phone number?

Priya:  Priya Verma, priya.verma@email.com, +91 98765 43210.

Sarah:  Let me confirm — Priya Verma, priya.verma@email.com,
        +91 98765 43210. Is that correct?

Priya:  Yes.

Sarah:  [create_lead(firstName="Priya", lastName="Verma",
            email="priya.verma@email.com", phone="+919876543210",
            interest="product", notes="Interested in Women's Multi ₹549")]
        Perfect! I've saved your information, Priya. Your reference
        number is B3K9P7M2. Our team will contact you within 24 hours.
        Thank you for your interest in Dayjoy! Is there anything else
        I can help you with?

Priya:  No, that's all. Thanks!

Sarah:  Thank you for calling Dayjoy. Have a great day!
```

## 5. Tools Used

| Tool | When | Why |
|---|---|---|
| `search_products` | In `search` step | Live catalog lookup — returns name, SKU, price, category, stock status |
| `search_knowledge` | In `search` step (for features/ingredients/usage) | Detailed product info grounded in the knowledge base |
| `customer_lookup` | At call start + when the caller provides contact info | Identify the caller; avoid duplicate lead capture |
| `create_lead` | In `qualify` step (if prospect expresses interest) | Capture the lead with the product of interest in `notes` |
| `human_transfer` | On escalation trigger | Transfer to `sales` department |

## 6. Escalation Triggers

| Trigger | Action |
|---|---|
| Customer makes a medical claim or asks for medical advice | Immediate transfer to `customer_service` (compliance flag) |
| Customer asks for a bulk / wholesale price | Transfer to `sales` (Sarah cannot quote bulk pricing) |
| Customer asks about a competitor's product | Politely redirect to Dayjoy products; if pressed, transfer to `sales` |
| Customer asks for an income claim ("how much can I earn selling this?") | Handoff to `business_plan` flow (handles income disclosure properly) |
| 3 failed searches for the same product | Transfer to `sales` with a summary |
| `search_products` returns 0 results 3 times | Transfer to `sales` |

## 7. Success Criteria

- **RAG grounding rate = 100%** — every product price + feature quoted by Sarah must be traceable to a `search_products` or `search_knowledge` result (audited by sampling).
- **Lead capture rate ≥ 30%** — of callers who reach the `qualify` step, at least 30% should result in a `create_lead` call.
- **Catalog accuracy ≥ 99%** — prices quoted by Sarah match the live catalog at the time of the call.
- **Average handle time ≤ 3 minutes** — the flow completes (or hands off) within 3 minutes for 80% of calls.

## 8. Edge Cases

- **Customer asks about a discontinued product**: `search_products` returns 0 results; Sarah says "I don't see that product in our current catalog" and offers to recommend an alternative or transfer to sales.
- **Customer asks about a product that exists but is out of stock**: Sarah tells them it's out of stock, offers to capture a lead so they can be notified when it's back, or transfers to sales for an ETA.
- **Customer asks for a discount**: Sarah explains that prices are fixed in the catalog and offers to transfer to sales for bulk / distributor pricing.
- **Customer asks "is this product safe for pregnant women?"**: This is a medical question — Sarah says "I can't give medical advice. Let me transfer you to a specialist who can" and transfers to `customer_service`.
- **Customer asks about multiple products in one call**: The flow loops — each product gets its own `search_products` + `recommend` cycle. At the end, the `qualify` step asks which one(s) the customer wants to proceed with.
- **Caller is an existing distributor**: Sarah mentions their distributor tier and, if relevant, references the distributor price ("As a Silver distributor, you'd pay ₹419 instead of ₹499").

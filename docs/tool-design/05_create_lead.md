# Tool: `create_lead`

> **Implementation:** `vapi/tools/vapi-lead-capture-tool.ts`
> **Spec version:** 1.0
> **Latency budget (p95):** 300 ms

## Purpose

Capture a new lead from a voice call. Creates a row in the Prisma `leads` table with the prospect's contact details, interest area, and any notes from the conversation. This is the **conversion tool** — every call where a prospect expresses interest should end with a `create_lead` call.

The tool also performs a best-effort link to an existing customer record (by email) so the business development team can see the call history in one place. When a link is found, an `Interaction` row is created on the customer record for the audit trail.

## When to Use

The LLM should call `create_lead` when:

- A prospect (not yet a customer or distributor) expresses interest in Dayjoy products — typically after a `product_inquiry` flow.
- A prospect expresses interest in the Dayjoy business opportunity — typically after a `business_plan` flow.
- A caller asks to be contacted back ("Can someone call me?").
- A caller provides their contact info without specifying a need ("Just wanted to leave my number").

The tool is **not** for creating support tickets (use `create_support_ticket`) or scheduling appointments (use `book_appointment`).

## When NOT to Use

- The caller is already a customer — use `customer_lookup` and continue the conversation; the customer record already exists.
- The caller is already a distributor — use `distributor_lookup`.
- The caller has a complaint that needs follow-up — use `create_support_ticket`.
- The caller wants to schedule a specific meeting time — use `book_appointment` (which can also capture a lead, but the appointment is the primary record).
- The caller provides incomplete info (missing name, phone, or email) — the flow's `gather_*` steps must collect the info first; do not call `create_lead` with missing required fields.

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `firstName` | string | Yes | Lead's first name. |
| `lastName` | string | Yes | Lead's last name. |
| `email` | string | Yes | Lead's email address. |
| `phone` | string | Yes | Lead's phone number (E.164 preferred). |
| `interest` | string | Yes | What the prospect is interested in: `product`, `business`, or `both`. |
| `notes` | string | No | Free-form notes from the conversation. |
| `goals` | string | No | Lead's stated goals or motivations. |
| `company` | string | No | Company name (for business leads). |

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "firstName": { "type": "string", "description": "Lead's first name." },
    "lastName": { "type": "string", "description": "Lead's last name." },
    "email": { "type": "string", "description": "Lead's email address." },
    "phone": { "type": "string", "description": "Lead's phone number (E.164 preferred)." },
    "interest": {
      "type": "string",
      "enum": ["product", "business", "both"],
      "description": "What the prospect is interested in."
    },
    "notes": { "type": "string", "description": "Free-form notes from the conversation." },
    "goals": { "type": "string", "description": "Lead's stated goals or motivations." },
    "company": { "type": "string", "description": "Company name (optional, for business leads)." }
  },
  "required": ["firstName", "lastName", "email", "phone", "interest"]
}
```

## Response

### Success

```json
{
  "success": true,
  "data": {
    "leadId": "lead_abc123def456",
    "referenceNumber": "ABC123DE",
    "status": "NEW",
    "interest": "product"
  },
  "speak": "Perfect! I've saved your information, Priya. Your reference number is ABC123DE. Our team will contact you within 24 hours at priya.verma@email.com or +919876543210. Thank you for your interest in Dayjoy!"
}
```

### Failure (missing required fields)

```json
{
  "success": false,
  "error": "firstName, lastName, email, and phone are required",
  "speak": "I'd love to capture your information, but I'm missing some details. Could you give me your first name, last name, email, and phone number?"
}
```

### Failure (database error)

```json
{
  "success": false,
  "error": "Prisma lead.create() threw: Unique constraint violation on email",
  "speak": "I wasn't able to save your information just now. Let me connect you with someone who can help."
}
```

## Error Handling

| Condition | Behaviour |
|---|---|
| Any of `firstName`, `lastName`, `email`, `phone` is empty | Return `success: false` + `speak` asking for the missing info. |
| `context.tenantId` is missing | Return `success: false` + `error` (configuration error). |
| `interest` is missing or invalid | Default to `"both"`. |
| `notes` and `goals` are both provided | Concatenate with ` \| ` separator and store in `metadata.notes`. |
| Prisma `lead.create()` throws (e.g., unique constraint) | Return `success: false` + `speak` apologising + offering to transfer. |
| Best-effort customer link fails | Log a debug message + continue (non-fatal). |

## Integration

The tool writes directly to the Prisma `lead` table:

```typescript
const lead = await this.prisma.lead.create({
  data: {
    tenantId: context.tenantId,
    firstName, lastName, email, phone,
    company: args?.company ?? null,
    status: 'NEW',
    score: 75,  // default — BD team refines later
    metadata: {
      source: 'VOICE',
      interest,
      callId: context.callId ?? null,
      conversationId: context.conversationId ?? null,
      notes: notes || null,
    },
  },
});
```

The `score` field defaults to `75` — a voice lead is high-intent (the prospect called us) and warrants a high score. The BD team can refine it later via the CRM.

After the lead is created, the tool performs a best-effort link to an existing customer with the same email. If a match is found, an `Interaction` row is created on the customer record so the BD team can see the call history in the customer's timeline.

The reference number returned to the customer is the first 8 characters of the lead UUID, uppercased (`lead.id.slice(0, 8).toUpperCase()`). This is short enough to read aloud and unique enough to use as a lookup key.

## Latency + Cost

- **Latency budget (p95):** 300 ms
  - `lead.create()` → ~150 ms
  - Best-effort `customer.findFirst()` + `interaction.create()` → ~150 ms (parallel-safe, non-blocking)
- **Cost per call:** ~$0 (no external API calls)

## Examples

### Example 1 — Product lead (after `product_inquiry` flow)

**LLM call:**
```json
{
  "firstName": "Priya",
  "lastName": "Verma",
  "email": "priya.verma@email.com",
  "phone": "+919876543210",
  "interest": "product",
  "notes": "Interested in Women's Multi ₹549"
}
```

**Result:**
```json
{
  "success": true,
  "data": {
    "leadId": "lead_abc123def456",
    "referenceNumber": "ABC123DE",
    "status": "NEW",
    "interest": "product"
  },
  "speak": "Perfect! I've saved your information, Priya. Your reference number is ABC123DE. Our team will contact you within 24 hours at priya.verma@email.com or +919876543210. Thank you for your interest in Dayjoy!"
}
```

### Example 2 — Business lead (after `business_plan` flow)

**LLM call:**
```json
{
  "firstName": "Anita",
  "lastName": "Desai",
  "email": "anita.d@email.com",
  "phone": "+919988776655",
  "interest": "business",
  "notes": "Wants BD call about the opportunity + Income Disclosure Statement",
  "goals": "Considering becoming a distributor"
}
```

**Result:**
```json
{
  "success": true,
  "data": {
    "leadId": "lead_def456ghi789",
    "referenceNumber": "DEF456GH",
    "status": "NEW",
    "interest": "business"
  },
  "speak": "Perfect! I've saved your information, Anita. Your reference number is DEF456GH. Our team will contact you within 24 hours at anita.d@email.com or +919988776655. Thank you for your interest in Dayjoy!"
}
```

### Example 3 — Missing required fields

**LLM call:**
```json
{
  "firstName": "Priya",
  "lastName": "",
  "email": "priya.verma@email.com",
  "phone": "+919876543210",
  "interest": "product"
}
```

**Result:**
```json
{
  "success": false,
  "error": "firstName, lastName, email, and phone are required",
  "speak": "I'd love to capture your information, but I'm missing some details. Could you give me your first name, last name, email, and phone number?"
}
```

**Sarah says:** "I'd love to capture your information, but I'm missing your last name. Could you give me your full name, please?"

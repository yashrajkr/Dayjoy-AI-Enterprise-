# Tool: `distributor_lookup`

> **Implementation:** `vapi/tools/vapi-distributor-lookup-tool.ts`
> **Spec version:** 1.0
> **Latency budget (p95):** 200 ms

## Purpose

Look up an existing Dayjoy distributor by distributor code, phone number, or email. Returns the distributor's name, code, tier, status, commission rate, total orders, revenue, and commission earned. This is the **distributor identity resolution** tool — it is called when a caller identifies as a distributor (or when the caller ID matches a distributor record) to load their business context into the session memory.

The tool delegates to the backend `DistributorsService.findAll()` method, which queries the Prisma `Distributor` table (with its aggregated order/revenue stats) directly. Like `customer_lookup`, it performs an exact-match filter on top of the service's ILIKE search to prevent partial-code matches.

## When to Use

The LLM (or the webhook handler at call start) should call `distributor_lookup` when:

- A voice call starts AND the caller ID matches a distributor record (the webhook handler tries `customer_lookup` first; if no match, tries `distributor_lookup`).
- The caller identifies as a distributor ("I'm a Dayjoy distributor, my code is DJ48291").
- The caller mentions a distributor code in any flow ("My sponsor's code is DJ12345").
- The `distributor_support` flow needs the distributor's live business data (commission, rank, downline).

## When NOT to Use

- The caller is a **customer** (not a distributor) — use `customer_lookup`.
- The caller is a **prospect** (not yet a distributor) — `distributor_lookup` will return `found: false`; the flow should route to `business_plan` or `lead_collection`.
- The caller asks about another distributor's data — decline for privacy; do not look up.
- The caller asks for a distributor's personal contact info (e.g., their sponsor's phone) — decline for privacy.

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `distributorCode` | string | No* | Dayjoy distributor code (e.g., `DJ48291`). |
| `phoneNumber` | string | No* | Distributor phone number (E.164 preferred: `+91...`). |
| `email` | string | No* | Distributor email address. |

\* At least one of `distributorCode`, `phoneNumber`, or `email` must be provided.

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "distributorCode": {
      "type": "string",
      "description": "Dayjoy distributor code (e.g. \"DJ12345\")."
    },
    "phoneNumber": {
      "type": "string",
      "description": "Distributor phone number (E.164 preferred: +91...)."
    },
    "email": {
      "type": "string",
      "description": "Distributor email address."
    }
  },
  "required": []
}
```

## Response

### Success (distributor found)

```json
{
  "success": true,
  "data": {
    "found": true,
    "distributor": {
      "id": "dist_abc123",
      "distributorCode": "DJ48291",
      "companyName": "Sharma Wellness Pvt. Ltd.",
      "contactPerson": "Rajesh Sharma",
      "email": "rajesh@sharmawellness.in",
      "phone": "+919876543210",
      "tier": "SILVER",
      "status": "ACTIVE",
      "commissionRate": 12.5,
      "totalOrders": 124,
      "revenue": 245000,
      "commissionEarned": 30625
    }
  },
  "speak": "I found your distributor account, Rajesh Sharma, ranked as Silver. Your distributor code is DJ48291. You've placed 124 orders with us. How can I help you with your business today?"
}
```

### Success (distributor not found)

```json
{
  "success": true,
  "data": { "found": false },
  "speak": "I couldn't find a distributor account with that information. Would you like me to connect you with our business development team to learn about becoming a distributor?"
}
```

### Failure (missing arguments)

```json
{
  "success": false,
  "error": "distributorCode, phoneNumber, or email is required",
  "speak": "I'd be happy to look up your distributor account. Could you tell me your distributor code, phone number, or email?"
}
```

### Failure (service down)

```json
{
  "success": false,
  "error": "DistributorsService.findAll() threw: Connection terminated unexpectedly",
  "speak": "I'm having trouble looking up your distributor account right now. Could you tell me your distributor code so I can help you directly?"
}
```

## Error Handling

| Condition | Behaviour |
|---|---|
| All three identifiers are empty | Return `success: false` + `speak` asking for the info. |
| `context.tenantId` is missing | Return `success: false` + `error` (configuration error). |
| `DistributorsService.findAll()` throws | Return `success: false` + `speak` apologising + asking for the distributor code. |
| 0 matches returned | Return `success: true` with `found: false` + `speak` offering to connect with BD. |
| Multiple matches (rare — would mean duplicate codes) | Use the first match (logged for the data team to dedupe). |

## Integration

The tool calls `DistributorsService.findAll({ search, page: 1, limit: 5 }, authUser)` (`backend/distributors/distributors.service.ts`). The service uses Prisma's `where` clause with `ILIKE` contains, so the tool adds a client-side exact-match filter:

```typescript
const match = rows.find((d) => {
  if (code && d.distributorCode === code) return true;
  if (email && d.email?.toLowerCase() === email) return true;
  if (phone && d.phone === phone) return true;
  return false;
});
```

The `tier`, `commissionRate`, `totalOrders`, `revenue`, and `commissionEarned` fields are computed by the service from the distributor's order history + the compensation plan rules. The tool surfaces them verbatim — it does not recompute or validate them.

The `speak` field is formatted by the tool's `formatForVoice()` helper:

- **Found, with tier + orders:** `"I found your distributor account, {name}, ranked as {tier}. Your distributor code is {code}. You've placed {n} orders with us. How can I help you with your business today?"`
- **Found, no orders:** `"I found your distributor account, {name}. Your distributor code is {code}. How can I help you with your business today?"`
- **Found, no contact person:** Uses `companyName` or falls back to `"there"`.

## Latency + Cost

- **Latency budget (p95):** 200 ms (Prisma query + aggregated stats)
- **Cost per call:** ~$0 (no external API calls)

## Examples

### Example 1 — Distributor found by caller ID

**Webhook handler (call start, after `customer_lookup` returned `found: false`):** `distributor_lookup({ phoneNumber: "+919876543210" })`

**Result:**
```json
{
  "success": true,
  "data": {
    "found": true,
    "distributor": {
      "distributorCode": "DJ48291",
      "contactPerson": "Rajesh Sharma",
      "tier": "SILVER",
      "totalOrders": 124
    }
  },
  "speak": "I found your distributor account, Rajesh Sharma, ranked as Silver. Your distributor code is DJ48291. You've placed 124 orders with us. How can I help you with your business today?"
}
```

The webhook handler stores the distributor in session memory; the first flow greets by name + tier.

### Example 2 — Distributor found by code (caller provides it mid-call)

**Customer (mid-call):** "I'm a distributor — my code is DJ48291."

**LLM call:** `distributor_lookup({ distributorCode: "DJ48291" })`

**Result:**
```json
{
  "success": true,
  "data": {
    "found": true,
    "distributor": {
      "distributorCode": "DJ48291",
      "contactPerson": "Rajesh Sharma",
      "tier": "SILVER",
      "commissionRate": 12.5,
      "commissionEarned": 30625
    }
  },
  "speak": "I found your distributor account, Rajesh Sharma, ranked as Silver. Your distributor code is DJ48291. You've placed 124 orders with us. How can I help you with your business today?"
}
```

**Sarah says:** "I found your distributor account, Rajesh. You're ranked as Silver — code DJ48291. How can I help you with your business today?"

### Example 3 — Distributor not found (prospect caller)

**Customer:** "I'm a distributor, my code is DJ99999."

**LLM call:** `distributor_lookup({ distributorCode: "DJ99999" })`

**Result:**
```json
{
  "success": true,
  "data": { "found": false },
  "speak": "I couldn't find a distributor account with that information. Would you like me to connect you with our business development team to learn about becoming a distributor?"
}
```

**Sarah says:** "I couldn't find a distributor account with code DJ99999. Would you like me to connect you with our business development team to learn about becoming a distributor?"

### Example 4 — Sponsor code lookup (privacy-respecting)

**Customer:** "My sponsor is DJ12345 — can you tell me their phone number?"

**Sarah:** "I can't share another distributor's contact details for privacy reasons. If you'd like to reach your sponsor, please use the contact information they gave you when you signed up, or I can transfer you to our business development team to help facilitate the connection."

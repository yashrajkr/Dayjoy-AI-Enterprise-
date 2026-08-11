# Tool: `customer_lookup`

> **Implementation:** `vapi/tools/vapi-customer-lookup-tool.ts`
> **Spec version:** 1.0
> **Latency budget (p95):** 200 ms

## Purpose

Look up an existing Dayjoy customer by phone number or email. Returns the customer's name, type, status, lifetime value, total orders, and last order date. This is the **identity resolution** tool — it is called at the start of every voice call (using the caller's E.164 phone number) to determine who is calling and to load their context into the session memory.

The tool delegates to the backend `CustomersService.findAll()` method, which queries the Prisma `Customer` table (with its lifetime stats aggregation) directly. The tool performs an exact-match filter on top of the service's ILIKE contains search — this prevents a partial phone match from returning the wrong customer.

## When to Use

The LLM (or the webhook handler at call start) should call `customer_lookup` when:

- A voice call starts — the webhook handler calls it with the caller's phone number to identify the caller.
- The customer mentions a different phone number or email mid-call ("Actually, my account is under a different email").
- A flow needs the customer's order history (e.g., `customer_support` flow looking up the order the customer is calling about).
- A flow needs to confirm the customer's identity before performing a write (e.g., before `create_support_ticket` linked to the customer).

## When NOT to Use

- The caller identifies as a **distributor** — use `distributor_lookup` instead.
- The caller is a **prospect** who has never purchased — `customer_lookup` will return `found: false`; the flow should then route to `create_lead`.
- The customer asks about another customer's data — decline for privacy; do not look up.
- The customer asks for their own password / login credentials — decline (the tool does not return credentials, but the LLM should not call it for this purpose).

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `phoneNumber` | string | No* | Customer phone number (E.164 preferred: `+91...`). |
| `email` | string | No* | Customer email address. |

\* At least one of `phoneNumber` or `email` must be provided.

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "phoneNumber": {
      "type": "string",
      "description": "Customer phone number (E.164 preferred: +91...)."
    },
    "email": {
      "type": "string",
      "description": "Customer email address."
    }
  },
  "required": []
}
```

## Response

### Success (customer found)

```json
{
  "success": true,
  "data": {
    "found": true,
    "customer": {
      "id": "cust_abc123",
      "firstName": "Rahul",
      "lastName": "Sharma",
      "email": "rahul.sharma@email.com",
      "phone": "+919876543210",
      "customerType": "INDIVIDUAL",
      "status": "ACTIVE",
      "lifetimeValue": 12450,
      "totalOrders": 8,
      "lastOrderAt": "2025-01-15T10:30:00.000Z"
    }
  },
  "speak": "I found your account, Rahul Sharma. You've placed 8 orders with us — the last one on January 15, 2025. How can I help you today?"
}
```

### Success (customer not found)

```json
{
  "success": true,
  "data": { "found": false },
  "speak": "I couldn't find an account with that information. Would you like me to create a new lead so someone can follow up with you?"
}
```

### Failure (missing arguments)

```json
{
  "success": false,
  "error": "phoneNumber or email is required",
  "speak": "I'd be happy to look up your account. Could you tell me the phone number or email on file?"
}
```

### Failure (service down)

```json
{
  "success": false,
  "error": "CustomersService.findAll() threw: Connection terminated unexpectedly",
  "speak": "I'm having trouble looking up your account right now. Could you tell me your name so I can help you directly?"
}
```

## Error Handling

| Condition | Behaviour |
|---|---|
| Both `phoneNumber` and `email` are empty | Return `success: false` + `speak` asking for the info. |
| `context.tenantId` is missing | Return `success: false` + `error` (configuration error). |
| `CustomersService.findAll()` throws | Return `success: false` + `speak` apologising + offering to proceed without the lookup. |
| 0 matches returned | Return `success: true` with `found: false` + `speak` offering to create a lead. |
| Multiple matches returned (e.g., two customers with the same phone) | Use the first match (logged for the data team to dedupe). |

## Integration

The tool calls `CustomersService.findAll({ search, page: 1, limit: 5 }, authUser)` (`backend/customers/customers.service.ts`). The service uses Prisma's `where` clause with `ILIKE` contains for the search string, so the tool adds a client-side exact-match filter:

```typescript
const match = rows.find((c) => {
  if (email && c.email?.toLowerCase() === email) return true;
  if (phone && c.phone === phone) return true;
  return false;
});
```

This two-step approach (ILIKE search → exact filter) is necessary because:

1. The service is shared with the customer-admin UI, which uses ILIKE for fuzzy search.
2. The voice tool needs an exact match — a partial phone match would return the wrong customer.

The lifetime stats (`lifetimeValue`, `totalOrders`, `lastOrderAt`) are computed by the service from the customer's order history and cached in the `lifetimeStats` field of the response.

The `speak` field is formatted by the tool's `formatForVoice()` helper:

- **Found, with orders:** `"I found your account, {name}. You've placed {n} orders with us — the last one on {date}. How can I help you today?"`
- **Found, no orders:** `"I found your account, {name}. I don't see any orders on your account yet. How can I help you today?"`
- **Found, no name:** `"I found your account."` (rare edge case — usually means the customer record is incomplete)

## Latency + Cost

- **Latency budget (p95):** 200 ms (Prisma query + lifetime stats aggregation)
- **Cost per call:** ~$0 (no external API calls)

## Examples

### Example 1 — Customer found by phone (call start)

**Webhook handler (call start):** `customer_lookup({ phoneNumber: "+919876543210" })`

**Result:**
```json
{
  "success": true,
  "data": {
    "found": true,
    "customer": {
      "id": "cust_abc123",
      "firstName": "Rahul",
      "lastName": "Sharma",
      "email": "rahul.sharma@email.com",
      "phone": "+919876543210",
      "customerType": "INDIVIDUAL",
      "status": "ACTIVE",
      "lifetimeValue": 12450,
      "totalOrders": 8,
      "lastOrderAt": "2025-01-15T10:30:00.000Z"
    }
  },
  "speak": "I found your account, Rahul Sharma. You've placed 8 orders with us — the last one on January 15, 2025. How can I help you today?"
}
```

The webhook handler stores the customer in session memory; the first flow greets the customer by name.

### Example 2 — Customer not found (prospect caller)

**Webhook handler (call start):** `customer_lookup({ phoneNumber: "+919000000000" })`

**Result:**
```json
{
  "success": true,
  "data": { "found": false },
  "speak": "I couldn't find an account with that information. Would you like me to create a new lead so someone can follow up with you?"
}
```

The first flow uses the generic greeting ("Hi, thanks for calling Dayjoy. How can I help?") and may route to `lead_collection` if the caller expresses interest.

### Example 3 — Customer provides a different email mid-call

**Customer (mid-call):** "Actually, my account might be under priya.verma@email.com."

**LLM call:** `customer_lookup({ email: "priya.verma@email.com" })`

**Result:**
```json
{
  "success": true,
  "data": {
    "found": true,
    "customer": {
      "firstName": "Priya",
      "lastName": "Verma",
      "totalOrders": 2,
      "lastOrderAt": "2025-02-01T14:00:00.000Z"
    }
  },
  "speak": "I found your account, Priya Verma. You've placed 2 orders with us — the last one on February 1, 2025. How can I help you today?"
}
```

**Sarah says:** "I found your account, Priya. You've placed 2 orders with us — the last one on February 1. How can I help you today?"

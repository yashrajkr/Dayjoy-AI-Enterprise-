# Tool: `create_support_ticket`

> **Implementation:** `vapi/tools/vapi-support-ticket-tool.ts`
> **Spec version:** 1.0
> **Latency budget (p95):** 300 ms

## Purpose

Create a support ticket for a customer issue, complaint, or technical problem. Creates a row in the Prisma `support_tickets` table with the subject, description, category, and priority. This is the **issue-tracking tool** — it captures problems that need follow-up from the human support team when the AI cannot resolve them in the call.

The tool also creates a linked `Interaction` row on the customer record (if a customer is identified) so the support team has full context — order number, contact info, call ID, conversation ID — when they pick up the ticket.

## When to Use

The LLM should call `create_support_ticket` when:

- A `customer_support` flow reaches the "propose" step and the issue cannot be self-resolved (e.g., the customer's specific case needs a human to review account history).
- A `distributor_support` flow needs to capture a dispute or follow-up for the BD team.
- The customer explicitly asks for a follow-up ("Can you make a note of this?").
- The AI tried to resolve the issue but the customer is not satisfied — the ticket captures what was tried + what's still needed.

## When NOT to Use

- The customer is asking a general product question that `search_knowledge` can answer — answer it, don't create a ticket.
- The customer is asking to schedule a meeting — use `book_appointment`.
- The customer is a prospect expressing interest — use `create_lead`.
- The customer is upset and demands a human — use `human_transfer` (the ticket is implicit in the transfer's call summary).
- The customer is reporting a medical emergency or adverse event — use `human_transfer` (priority `urgent`) and let the human team create the ticket.

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `subject` | string | Yes | Short subject line (max ~80 chars). |
| `description` | string | Yes | Detailed description of the issue. |
| `category` | string | No | Issue category: `product`, `order`, `billing`, `technical`, `account`, `other` (default: `other`). |
| `priority` | string | No | Issue priority: `low`, `medium`, `high`, `urgent` (default: `medium`). Use `urgent` only for billing-disabling or order-blocking issues. |
| `orderNumber` | string | No | Related order number. |
| `customerName` | string | No | Customer name (used when no customer record is linked). |
| `customerEmail` | string | No | Customer email (for follow-up). |
| `customerPhone` | string | No | Customer phone (for follow-up). |

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "subject": { "type": "string", "description": "Short subject line (max ~80 chars)." },
    "description": { "type": "string", "description": "Detailed description of the issue." },
    "category": {
      "type": "string",
      "enum": ["product", "order", "billing", "technical", "account", "other"],
      "description": "Issue category.",
      "default": "other"
    },
    "priority": {
      "type": "string",
      "enum": ["low", "medium", "high", "urgent"],
      "description": "Issue priority. Use \"urgent\" only for billing-disabling or order-blocking issues.",
      "default": "medium"
    },
    "orderNumber": { "type": "string", "description": "Related order number (optional)." },
    "customerName": { "type": "string", "description": "Customer name (used when no customer record is linked)." },
    "customerEmail": { "type": "string", "description": "Customer email (for follow-up)." },
    "customerPhone": { "type": "string", "description": "Customer phone (for follow-up)." }
  },
  "required": ["subject", "description"]
}
```

## Response

### Success

```json
{
  "success": true,
  "data": {
    "ticketId": "ticket_abc123def456",
    "ticketNumber": "ABC123DE",
    "status": "open",
    "priority": "high",
    "category": "product"
  },
  "speak": "I've created a support ticket for you. Your ticket number is ABC123DE. Our team will respond at rahul.sharma@email.com within 24 hours. You can reference ticket number ABC123DE in any future communication. Is there anything else I can help you with?"
}
```

### Failure (missing required fields)

```json
{
  "success": false,
  "error": "subject and description are required",
  "speak": "I'd be happy to create a support ticket for you. Could you briefly describe the issue you're having?"
}
```

### Failure (database error)

```json
{
  "success": false,
  "error": "Prisma supportTicket.create() threw: Connection terminated unexpectedly",
  "speak": "I wasn't able to create the support ticket just now. Let me connect you with someone who can help."
}
```

## Error Handling

| Condition | Behaviour |
|---|---|
| `subject` is empty | Return `success: false` + `speak` asking for a brief description. |
| `description` is empty | Return `success: false` + `speak` asking for a detailed description. |
| `context.tenantId` is missing | Return `success: false` + `error` (configuration error). |
| `priority` is invalid | Default to `"medium"`. |
| `category` is invalid | Default to `"other"`. |
| Prisma `supportTicket.create()` throws | Return `success: false` + `speak` apologising + offering to transfer. |
| Best-effort `interaction.create()` fails | Log a debug message + continue (non-fatal). |

## Integration

The tool writes directly to the Prisma `support_tickets` table:

```typescript
const ticket = await this.prisma.supportTicket.create({
  data: {
    tenantId: context.tenantId,
    customerId: context.customerId ?? null,
    assignedToId: null,             // support team assigns in CRM
    subject,
    description,
    priority: args?.priority ?? 'medium',
    status: 'open',
    category: args?.category ?? 'other',
    channel: 'voice',               // tickets created via voice are tagged
    resolution: null,
    resolvedAt: null,
  },
});
```

The `channel: 'voice'` tag is important — it lets the support team filter voice-originated tickets in their dashboard and track voice-specific metrics (resolution time, escalation rate).

After the ticket is created, the tool writes a linked `Interaction` row on the customer record (if `customerId`, `customerEmail`, or `customerPhone` is available) so the support team has full context:

```typescript
await this.prisma.interaction.create({
  data: {
    tenantId: context.tenantId,
    customerId: context.customerId ?? null,
    userId: context.userId ?? '',
    type: 'CALL',
    subject: `Support ticket ${ticketNumber}: ${subject}`,
    description,
    metadata: {
      ticketId: ticket.id,
      orderNumber: args?.orderNumber ?? null,
      customerName, customerEmail, customerPhone,
      callId, conversationId,
      source: 'VOICE',
    },
  },
});
```

The ticket number returned to the customer is the first 8 characters of the ticket UUID, uppercased (`ticket.id.slice(0, 8).toUpperCase()`). This is short enough to read aloud and unique enough to use as a lookup key in the support portal.

## Latency + Cost

- **Latency budget (p95):** 300 ms
  - `supportTicket.create()` → ~150 ms
  - Best-effort `interaction.create()` → ~150 ms (non-blocking)
- **Cost per call:** ~$0 (no external API calls)

## Examples

### Example 1 — Damaged product (high priority)

**LLM call:**
```json
{
  "subject": "Damaged protein powder - broken seal",
  "description": "Customer Rahul Sharma (order DJ-7G3K9P) received protein powder with a broken seal. Order placed 5 days ago. Customer wants a replacement.",
  "category": "product",
  "priority": "high",
  "orderNumber": "DJ-7G3K9P",
  "customerName": "Rahul Sharma",
  "customerEmail": "rahul.sharma@email.com",
  "customerPhone": "+919876543210"
}
```

**Result:**
```json
{
  "success": true,
  "data": {
    "ticketId": "ticket_abc123def456",
    "ticketNumber": "ABC123DE",
    "status": "open",
    "priority": "high",
    "category": "product"
  },
  "speak": "I've created a support ticket for you. Your ticket number is ABC123DE. Our team will respond at rahul.sharma@email.com within 24 hours. You can reference ticket number ABC123DE in any future communication. Is there anything else I can help you with?"
}
```

### Example 2 — Billing dispute (urgent)

**LLM call:**
```json
{
  "subject": "Double charge on credit card for order DJ-9F2K7M",
  "description": "Customer reports being charged twice for the same order. Order total ₹1,499, charged ₹2,998. Customer has bank statement showing both charges.",
  "category": "billing",
  "priority": "urgent",
  "orderNumber": "DJ-9F2K7M",
  "customerName": "Anita Desai",
  "customerEmail": "anita.d@email.com",
  "customerPhone": "+919988776655"
}
```

**Result:**
```json
{
  "success": true,
  "data": {
    "ticketId": "ticket_def456ghi789",
    "ticketNumber": "DEF456GH",
    "status": "open",
    "priority": "urgent",
    "category": "billing"
  },
  "speak": "I've created a support ticket for you. Your ticket number is DEF456GH. Our team will respond at anita.d@email.com within 24 hours. You can reference ticket number DEF456GH in any future communication. Is there anything else I can help you with?"
}
```

### Example 3 — Missing required fields

**LLM call:**
```json
{
  "subject": "",
  "description": "My order hasn't arrived"
}
```

**Result:**
```json
{
  "success": false,
  "error": "subject and description are required",
  "speak": "I'd be happy to create a support ticket for you. Could you briefly describe the issue you're having?"
}
```

**Sarah says:** "I'd be happy to create a support ticket for you. Could you briefly describe the issue you're having?"

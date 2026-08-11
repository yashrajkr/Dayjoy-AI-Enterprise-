# Tool: `human_transfer`

> **Implementation:** `vapi/tools/vapi-human-transfer-tool.ts`
> **Spec version:** 1.0
> **Latency budget (p95):** 500 ms (includes notification dispatch)

## Purpose

Transfer the call to a human agent. This is the **escalation tool** — it records the transfer intent, notifies the support team with full context, updates the voice session status, and writes an audit interaction on the customer record. The actual SIP transfer (the call handoff) is performed by the Vapi webhook handler via the Vapi REST API, using the assistant's configured `forwardingPhoneNumbers`.

This tool is the most consequential tool in the platform: it ends Sarah's role in the conversation and hands the customer to a human. Every other tool can be retried; this one is terminal for the AI.

## When to Use

The LLM should call `human_transfer` when any of the escalation criteria are met (see `vapi/prompts/escalation-protocols.ts`):

### Immediate escalation
- Customer uses abusive, threatening, or discriminatory language.
- Customer mentions a lawsuit, lawyer, or legal action.
- Customer mentions a medical emergency or adverse health event.
- Customer explicitly requests a human.
- Customer mentions a refund amount greater than ₹10,000.
- Customer asks for medical, legal, tax, or financial advice.
- Customer asks a regulatory or compliance question.

### Escalation after 3 failed attempts
- The LLM has tried to answer the same question 3 times and the customer is still not satisfied.
- The customer says "I don't understand" 3 or more times.
- The customer repeats the same question 3 or more times.

### Flow-specific triggers
- `customer_support` flow: 3 failed resolution attempts.
- `product_inquiry` flow: 3 failed catalog searches.
- `distributor_support` flow: commission dispute or missing payout.
- `business_plan` flow: prospect demands an income claim.

## When NOT to Use

- The customer is asking a question that `search_knowledge` can answer — answer it.
- The customer is asking for a product recommendation — use `search_products`.
- The customer wants to schedule a future call — use `book_appointment`.
- The customer wants to leave contact info — use `create_lead`.
- The customer is frustrated but the issue is still resolvable — try one more `search_knowledge` before escalating.

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `department` | string | Yes | Department to transfer to: `customer_service`, `business_development`, `technical_support`, `manager`, or `sales`. |
| `reason` | string | Yes | Concise reason for the transfer. |
| `priority` | string | No | Transfer priority: `normal`, `high`, or `urgent` (default: `normal`). Use `urgent` for angry customers or legal/medical issues. |
| `callSummary` | string | No | Brief summary of the call so far for the human agent. |
| `customerName` | string | No | Customer name (if known). |
| `customerPhone` | string | No | Customer phone number for callback (if call drops). |

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "department": {
      "type": "string",
      "enum": ["customer_service", "business_development", "technical_support", "manager", "sales"],
      "description": "Department to transfer to."
    },
    "reason": { "type": "string", "description": "Concise reason for the transfer." },
    "priority": {
      "type": "string",
      "enum": ["normal", "high", "urgent"],
      "description": "Transfer priority. Use \"urgent\" for angry customers or legal/medical issues.",
      "default": "normal"
    },
    "callSummary": { "type": "string", "description": "Brief summary of the call so far for the human agent." },
    "customerName": { "type": "string", "description": "Customer name (if known)." },
    "customerPhone": { "type": "string", "description": "Customer phone number for callback (if call drops)." }
  },
  "required": ["department", "reason"]
}
```

## Response

### Success

```json
{
  "success": true,
  "data": {
    "transferred": true,
    "department": "customer_service",
    "departmentLabel": "Customer Service",
    "priority": "high",
    "voiceSessionId": "vsess_abc123"
  },
  "speak": "I'm transferring you to Customer Service now. Please stay on the line — an agent will be with you shortly. Thank you for your patience."
}
```

### Failure (missing required fields)

```json
{
  "success": false,
  "error": "department and reason are required",
  "speak": "I'd like to transfer you to a human agent. Could you tell me briefly what you need help with so I can route you to the right team?"
}
```

### Failure (unknown department)

```json
{
  "success": false,
  "error": "Unknown department: billing",
  "speak": "I'll transfer you to a specialist who can help."
}
```

### Failure (notification service down — non-fatal, transfer still recorded)

The tool's design is that a notification failure is **non-fatal** — the transfer intent is still recorded in the VoiceSession, and the webhook handler still performs the SIP transfer. The notification is best-effort.

## Error Handling

| Condition | Behaviour |
|---|---|
| `department` is empty | Return `success: false` + `speak` asking what they need help with. |
| `reason` is empty | Return `success: false` + `speak` asking what they need help with. |
| `department` is not in the routing map | Return `success: false` + `error` + `speak` offering to transfer to a generic specialist. |
| `context.tenantId` is missing | Return `success: false` + `error` (configuration error). |
| `VoiceSession.update()` fails (session not found) | Log a debug message + continue (non-fatal). |
| `notificationsService.send()` fails | Log a warning + continue (non-fatal). |
| `interaction.create()` fails | Log a debug message + continue (non-fatal). |

## Integration

The tool performs three actions in sequence, each of which is independently fault-tolerant:

### 1. Update the VoiceSession status (best-effort)

```typescript
if (context.callId) {
  try {
    voiceSession = await this.prisma.voiceSession.update({
      where: { callId: context.callId },
      data: {
        status: 'transferring',
        metadata: {
          transferDepartment: department,
          transferReason: reason,
          transferPriority: args?.priority ?? 'normal',
          transferredAt: new Date().toISOString(),
        },
      },
    });
  } catch (sessErr) {
    // Non-fatal — session may not exist yet if transfer fires early.
    this.logger.debug(`VoiceSession not found for callId=${context.callId}`);
  }
}
```

### 2. Send an IN_APP notification to the support team

```typescript
await this.notificationsService.send({
  tenantId: context.tenantId,
  customerId: context.customerId ?? undefined,
  distributorId: context.distributorId ?? undefined,
  type: NotificationType.IN_APP,
  priority: args?.priority === 'urgent' ? 'URGENT'
         : args?.priority === 'high'   ? 'HIGH'
         : 'NORMAL',
  subject: `[Voice Transfer] ${DEPARTMENT_LABELS[department]} — ${reason.slice(0, 60)}`,
  body: [
    `Department: ${DEPARTMENT_LABELS[department]}`,
    `Reason: ${reason}`,
    `Priority: ${args?.priority ?? 'normal'}`,
    args?.callSummary ? `Summary: ${args.callSummary}` : null,
    args?.customerName ? `Customer: ${args.customerName}` : null,
    args?.customerPhone ? `Callback: ${args.customerPhone}` : null,
    context.callId ? `Call ID: ${context.callId}` : null,
    context.phoneNumber ? `Caller: ${context.phoneNumber}` : null,
  ].filter(Boolean).join('\n'),
  metadata: { event: 'voice.human_transfer', department, reason, callId, sessionId, conversationId },
});
```

This notification is what the human agent sees in their queue — it's the handoff context. If the notification fails, the transfer still happens (via the VoiceSession status update), but the human agent picks up without context.

### 3. Write an audit Interaction on the customer record (best-effort)

```typescript
if (context.customerId) {
  try {
    await this.prisma.interaction.create({
      data: {
        tenantId: context.tenantId,
        customerId: context.customerId,
        userId: context.userId ?? '',
        type: 'CALL',
        subject: `Transferred to ${DEPARTMENT_LABELS[department]}`,
        description: reason,
        outcome: 'transferred',
        metadata: { department, priority, callSummary, callId },
      },
    });
  } catch (auditErr) {
    // Non-fatal.
  }
}
```

### 4. The actual SIP transfer

The `human_transfer` tool **does not** perform the SIP transfer itself. It records the intent + notifies the team. The actual transfer is performed by the Vapi webhook handler (`vapi/webhooks/vapi-function-call-handler.ts`), which:

1. Listens for the `function-call` event from Vapi.
2. Sees the `human_transfer` tool was called.
3. Sees the tool returned `success: true`.
4. Triggers the SIP REFER via the Vapi REST API (`POST /call/{callId}/transfer`) using the assistant's configured `forwardingPhoneNumbers` for the department.

This separation of concerns is deliberate: the tool is the "intent layer", the webhook is the "telephony layer". The intent is durable (recorded in the DB); the telephony may fail and be retried.

### Department routing map

```typescript
const DEPARTMENT_LABELS: Record<string, string> = {
  customer_service: 'Customer Service',
  business_development: 'Business Development',
  technical_support: 'Technical Support',
  manager: 'Manager',
  sales: 'Sales',
};
```

## Latency + Cost

- **Latency budget (p95):** 500 ms
  - `voiceSession.update()` → ~100 ms (best-effort, parallel-safe)
  - `notificationsService.send()` → ~300 ms (the slowest — IN_APP dispatch)
  - `interaction.create()` → ~100 ms (best-effort)
- **Cost per call:** ~$0 (no external API calls; the notification is internal)

## Examples

### Example 1 — Customer frustration after 3 failed attempts

**LLM call:**
```json
{
  "department": "customer_service",
  "reason": "Customer frustrated about delayed refund after 3 attempts to resolve",
  "priority": "high",
  "callSummary": "Customer Rahul Sharma (DJ-7G3K9P) has been waiting for a ₹1,200 refund for 21 days. Knowledge base refund timeline is 5-7 business days. Customer is upset and requesting immediate resolution.",
  "customerName": "Rahul Sharma",
  "customerPhone": "+919876543210"
}
```

**Result:**
```json
{
  "success": true,
  "data": {
    "transferred": true,
    "department": "customer_service",
    "departmentLabel": "Customer Service",
    "priority": "high",
    "voiceSessionId": "vsess_abc123"
  },
  "speak": "I'm transferring you to Customer Service now. Please stay on the line — an agent will be with you shortly. Thank you for your patience."
}
```

The support team receives:

```
Subject: [Voice Transfer] Customer Service — Customer frustrated about delayed refund after 3 attempts
Body:
  Department: Customer Service
  Reason: Customer frustrated about delayed refund after 3 attempts to resolve
  Priority: high
  Summary: Customer Rahul Sharma (DJ-7G3K9P) has been waiting for a ₹1,200 refund for 21 days.
           Knowledge base refund timeline is 5-7 business days. Customer is upset and
           requesting immediate resolution.
  Customer: Rahul Sharma
  Callback: +919876543210
  Call ID: call_abc123
  Caller: +919876543210
```

### Example 2 — Abusive customer (urgent, manager)

**LLM call:**
```json
{
  "department": "manager",
  "reason": "Customer using abusive language; demanded to speak to manager",
  "priority": "urgent",
  "callSummary": "Customer became abusive after being told the refund would take 5-7 business days. Demanded to speak to a manager. AI attempted to de-escalate twice; customer continued abusive language.",
  "customerName": "Unknown",
  "customerPhone": "+919000000000"
}
```

**Result:**
```json
{
  "success": true,
  "data": {
    "transferred": true,
    "department": "manager",
    "departmentLabel": "Manager",
    "priority": "urgent",
    "voiceSessionId": "vsess_def456"
  },
  "speak": "I'm transferring you to a manager now. Please stay on the line — an agent will be with you shortly. Thank you for your patience."
}
```

### Example 3 — Missing required fields

**LLM call:**
```json
{
  "department": "",
  "reason": ""
}
```

**Result:**
```json
{
  "success": false,
  "error": "department and reason are required",
  "speak": "I'd like to transfer you to a human agent. Could you tell me briefly what you need help with so I can route you to the right team?"
}
```

**Sarah says:** "I'd like to transfer you to a human agent. Could you tell me briefly what you need help with so I can route you to the right team?"

### Example 4 — Refund over ₹10,000 (compliance trigger)

**LLM call:**
```json
{
  "department": "customer_service",
  "reason": "Refund request ₹15,000 exceeds AI authorisation limit of ₹10,000",
  "priority": "high",
  "callSummary": "Customer Anita Desai is requesting a refund of ₹15,000 for order DJ-9F2K7M (bulk order returned). Refund exceeds AI authorisation limit; human approval required.",
  "customerName": "Anita Desai",
  "customerPhone": "+919988776655"
}
```

**Result:**
```json
{
  "success": true,
  "data": {
    "transferred": true,
    "department": "customer_service",
    "departmentLabel": "Customer Service",
    "priority": "high",
    "voiceSessionId": "vsess_ghi789"
  },
  "speak": "I'm transferring you to Customer Service now. Please stay on the line — an agent will be with you shortly. Thank you for your patience."
}
```

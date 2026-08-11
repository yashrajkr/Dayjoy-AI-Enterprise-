# Tool: `book_appointment`

> **Implementation:** `vapi/tools/vapi-appointment-booking-tool.ts`
> **Spec version:** 1.0
> **Latency budget (p95):** 300 ms

## Purpose

Schedule an appointment with a Dayjoy team member. Creates a row in the Prisma `appointments` table with the title, scheduled date/time, duration, department, and customer contact info. This is the **meeting-creation tool** — it persists the customer's intent to meet with a specific department at a specific time.

The tool does not check team availability (that's the BD team's workflow in the CRM) — it creates the appointment with whatever date + time the customer proposes, and the assigned team member confirms or reschedules via the standard appointment workflow.

## When to Use

The LLM should call `book_appointment` when:

- The customer explicitly asks to schedule a call or meeting ("Can I book a demo?", "I'd like to schedule a call").
- The customer wants to be called back at a specific time (vs. "whenever" — use `create_lead` for that).
- A `product_inquiry` or `business_plan` flow reaches the "would you like to schedule a call?" qualification step and the customer says yes.

## When NOT to Use

- The customer wants to be contacted "sometime" without a specific time — use `create_lead` (the BD team will reach out).
- The customer wants to reschedule or cancel an existing appointment — capture the request via `create_support_ticket` (full reschedule flow is on the roadmap).
- The customer wants to talk to a human right now — use `human_transfer`, not `book_appointment`.
- The customer is asking about the appointment they already booked (status check) — use `customer_lookup` and look at their appointments.

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Short title for the appointment (e.g., `"Product demo"`). |
| `scheduledAt` | string | Yes | Appointment date + time in ISO 8601 (e.g., `"2025-01-15T14:30:00Z"`). |
| `durationMinutes` | integer | No | Duration in minutes (default: 30). |
| `department` | string | Yes | Department the appointment is with: `sales`, `business_development`, `customer_service`, or `technical_support`. |
| `location` | string | No | Physical location for in-person meetings. |
| `meetingLink` | string | No | Video call URL for virtual meetings. |
| `notes` | string | No | Additional notes or agenda items. |
| `customerName` | string | No | Customer name (used when no customer record is linked). |
| `customerEmail` | string | No | Customer email (for confirmation). |
| `customerPhone` | string | No | Customer phone (for reminder call). |

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "description": "Short title for the appointment (e.g. \"Product demo\")." },
    "scheduledAt": { "type": "string", "description": "Appointment date + time in ISO 8601 (e.g. \"2025-01-15T14:30:00Z\")." },
    "durationMinutes": { "type": "integer", "description": "Duration in minutes (default: 30).", "default": 30 },
    "department": {
      "type": "string",
      "enum": ["sales", "business_development", "customer_service", "technical_support"],
      "description": "Department the appointment is with."
    },
    "location": { "type": "string", "description": "Physical location for in-person meetings (optional)." },
    "meetingLink": { "type": "string", "description": "Video call URL for virtual meetings (optional)." },
    "notes": { "type": "string", "description": "Additional notes or agenda items." },
    "customerName": { "type": "string", "description": "Customer name (used when no customer record is linked)." },
    "customerEmail": { "type": "string", "description": "Customer email (for confirmation)." },
    "customerPhone": { "type": "string", "description": "Customer phone (for reminder call)." }
  },
  "required": ["title", "scheduledAt", "department"]
}
```

## Response

### Success

```json
{
  "success": true,
  "data": {
    "appointmentId": "appt_abc123def456",
    "referenceNumber": "ABC123DE",
    "scheduledAt": "2025-01-15T09:00:00.000Z",
    "durationMinutes": 30,
    "status": "scheduled"
  },
  "speak": "Perfect! I've scheduled your appointment for Wednesday, January 15 at 2:30 PM. You'll receive a confirmation email at vikram@officemail.com. We look forward to speaking with you. Is there anything else I can help you with?"
}
```

### Failure (missing title)

```json
{
  "success": false,
  "error": "title is required",
  "speak": "What would you like to schedule the appointment for?"
}
```

### Failure (missing scheduledAt)

```json
{
  "success": false,
  "error": "scheduledAt is required",
  "speak": "When would you like to schedule the appointment? Please give me a date and time."
}
```

### Failure (invalid date)

```json
{
  "success": false,
  "error": "Invalid scheduledAt: next Wednesday",
  "speak": "I didn't catch a valid date and time. Could you repeat that, please?"
}
```

### Failure (past date)

```json
{
  "success": false,
  "error": "scheduledAt is in the past",
  "speak": "That time has already passed. Could you give me a future date and time?"
}
```

### Failure (database error)

```json
{
  "success": false,
  "error": "Prisma appointment.create() threw: Connection terminated unexpectedly",
  "speak": "I wasn't able to schedule the appointment just now. Let me connect you with someone who can help."
}
```

## Error Handling

| Condition | Behaviour |
|---|---|
| `title` is empty | Return `success: false` + `speak` asking what the appointment is for. |
| `scheduledAt` is empty | Return `success: false` + `speak` asking for a date + time. |
| `scheduledAt` is not a valid ISO 8601 date | Return `success: false` + `speak` asking to repeat. |
| `scheduledAt` is in the past | Return `success: false` + `speak` asking for a future date. |
| `context.tenantId` is missing | Return `success: false` + `error` (configuration error). |
| Prisma `appointment.create()` throws | Return `success: false` + `speak` apologising + offering to transfer. |

## Integration

The tool writes directly to the Prisma `appointments` table:

```typescript
const appointment = await this.prisma.appointment.create({
  data: {
    tenantId: context.tenantId,
    customerId: context.customerId ?? null,    // from caller ID lookup
    distributorId: context.distributorId ?? null,
    assignedToId: null,                        // BD team assigns in CRM
    title,
    description: args?.notes ?? null,
    scheduledAt,
    durationMinutes: args?.durationMinutes ?? 30,
    location: args?.location ?? null,
    meetingLink: args?.meetingLink ?? null,
    status: 'scheduled',
    metadata: {
      department: args?.department ?? null,
      customerName: args?.customerName ?? null,
      customerEmail: args?.customerEmail ?? null,
      customerPhone: args?.customerPhone ?? null,
      callId: context.callId ?? null,
      conversationId: context.conversationId ?? null,
      source: 'VOICE',
    },
  },
});
```

The `assignedToId` is intentionally `null` — the appointment is unassigned until a team member picks it up in the CRM. The `metadata.department` field is what the CRM uses to route the appointment to the right queue.

The `speak` field is formatted by the tool's `formatForVoice()` helper:

- **Without email:** `"Perfect! I've scheduled your appointment for {weekday}, {month} {day} at {time}. We look forward to speaking with you. Is there anything else I can help you with?"`
- **With email:** Same as above + `"You'll receive a confirmation email at {email}."`

The date + time are formatted with `toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })` for natural speech ("Wednesday, January 15 at 2:30 PM").

## Latency + Cost

- **Latency budget (p95):** 300 ms (single Prisma insert)
- **Cost per call:** ~$0 (no external API calls)

## Examples

### Example 1 — Successful booking (with email confirmation)

**LLM call:**
```json
{
  "title": "Bulk pricing discussion",
  "scheduledAt": "2025-01-15T14:30:00+05:30",
  "durationMinutes": 30,
  "department": "sales",
  "customerName": "Vikram",
  "customerEmail": "vikram@officemail.com",
  "customerPhone": "+919876543210",
  "notes": "Customer wants bulk pricing for office order"
}
```

**Result:**
```json
{
  "success": true,
  "data": {
    "appointmentId": "appt_abc123def456",
    "referenceNumber": "ABC123DE",
    "scheduledAt": "2025-01-15T09:00:00.000Z",
    "durationMinutes": 30,
    "status": "scheduled"
  },
  "speak": "Perfect! I've scheduled your appointment for Wednesday, January 15 at 2:30 PM. You'll receive a confirmation email at vikram@officemail.com. We look forward to speaking with you. Is there anything else I can help you with?"
}
```

### Example 2 — Successful booking (no email, phone-only confirmation)

**LLM call:**
```json
{
  "title": "Distributor onboarding call",
  "scheduledAt": "2025-01-20T11:00:00+05:30",
  "durationMinutes": 45,
  "department": "business_development",
  "customerName": "Anita",
  "customerPhone": "+919988776655"
}
```

**Result:**
```json
{
  "success": true,
  "data": {
    "appointmentId": "appt_def456ghi789",
    "referenceNumber": "DEF456GH",
    "scheduledAt": "2025-01-20T05:30:00.000Z",
    "durationMinutes": 45,
    "status": "scheduled"
  },
  "speak": "Perfect! I've scheduled your appointment for Monday, January 20 at 11:00 AM. We look forward to speaking with you. Is there anything else I can help you with?"
}
```

### Example 3 — Past date rejected

**LLM call:**
```json
{
  "title": "Product demo",
  "scheduledAt": "2024-12-01T10:00:00Z",
  "department": "sales"
}
```

**Result:**
```json
{
  "success": false,
  "error": "scheduledAt is in the past",
  "speak": "That time has already passed. Could you give me a future date and time?"
}
```

**Sarah says:** "That time has already passed. Could you give me a future date and time?"

# Dayjoy Voice AI — API Documentation

> Complete REST API reference for the Vapi Voice AI module.
> All endpoints (except the webhook) require JWT auth + `voice:*` permission.

**Base URL:** `https://api.dayjoy.ai`

**Version:** 2.0.0  •  **Last updated:** 2025-01

---

## Table of Contents

1. [Authentication](#authentication)
2. [Errors](#errors)
3. [Voice Calls](#voice-calls)
   - [POST /api/voice/calls](#post-apivoicecalls)
   - [GET /api/voice/calls](#get-apivoicecalls)
   - [GET /api/voice/calls/:id](#get-apivoicecallsid)
   - [POST /api/voice/calls/:id/end](#post-apivoicecallsidend)
   - [GET /api/voice/calls/:id/recording](#get-apivoicecallsidrecording)
4. [Sessions](#sessions)
   - [GET /api/voice/sessions/active](#get-apivoicesessionsactive)
5. [Assistants](#assistants)
   - [GET /api/voice/assistants](#get-apivoiceassistants)
   - [POST /api/voice/assistants](#post-apivoiceassistants)
6. [Analytics](#analytics)
   - [GET /api/voice/analytics/dashboard](#get-apivoiceanalyticsdashboard)
   - [GET /api/voice/analytics/calls](#get-apivoiceanalyticscalls)
   - [GET /api/voice/analytics/tools](#get-apivoiceanalyticstools)
7. [Webhook](#webhook)
   - [POST /api/voice/webhook](#post-apivoicewebhook)

---

## Authentication

All endpoints (except `/api/voice/webhook`) require a JWT bearer token
in the `Authorization` header:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://api.dayjoy.ai/api/voice/calls
```

JWTs are issued by `POST /api/auth/login` and expire after 1 hour.
Refresh tokens last 7 days.

### Permissions

| Permission | Description |
|------------|-------------|
| `voice:read` | View calls, sessions, analytics, assistants |
| `voice:create` | Initiate calls, create assistants |
| `voice:update` | End calls, modify assistant config |

Permissions are checked by the `PermissionsGuard` (see
`backend/_shared/security/permissions.guard.ts`). Users with the
`SUPER_ADMIN` role bypass permission checks.

---

## Errors

All errors return a standard error envelope:

```json
{
  "statusCode": 404,
  "message": "Call abc-123 not found",
  "error": "Not Found"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request — invalid body or query params |
| 401 | Unauthorized — missing or invalid JWT |
| 403 | Forbidden — missing required permission |
| 404 | Not found — call/session/assistant doesn't exist |
| 429 | Too many requests — rate limit hit |
| 500 | Internal server error — see Sentry for stack trace |
| 502 | Bad gateway — Vapi API unreachable |

---

## Voice Calls

### POST /api/voice/calls

Initiate an outbound call to a customer.

**Permission:** `voice:create`

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phoneNumber` | string | ✅ | E.164 phone number (e.g. `+15551234567`) |
| `assistantId` | string | ✅ | Vapi assistant ID to use for the call |
| `customerId` | string | ❌ | Dayjoy customer ID (links the call to a customer) |
| `purpose` | string | ❌ | Free-form purpose tag (`follow_up`, `welcome`, etc.) |
| `metadata` | object | ❌ | Arbitrary metadata to attach to the call |

**Example:**

```bash
curl -X POST https://api.dayjoy.ai/api/voice/calls \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+15551234567",
    "assistantId": "asst_dayjoy_support",
    "customerId": "cust_abc123",
    "purpose": "follow_up",
    "metadata": { "campaign": "winter_2025" }
  }'
```

**Response (201 Created):**

```json
{
  "id": "call_xyz789",
  "phoneNumber": "+15551234567",
  "status": "active",
  "metadata": {
    "source": "dayjoy-voice-ai",
    "tenantId": "tenant_001",
    "customerId": "cust_abc123",
    "purpose": "follow_up",
    "initiatedBy": "user_123"
  },
  "sessionId": "ses_uuid_here"
}
```

**Errors:**

| Status | When |
|--------|------|
| 400 | `phoneNumber` is missing or not E.164 |
| 400 | `assistantId` is missing |
| 403 | Caller lacks `voice:create` permission |
| 502 | Vapi API rejected the call request |

---

### GET /api/voice/calls

List voice calls for the current tenant (paginated, filterable).

**Permission:** `voice:read`

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | enum | — | Filter by status: `active`, `ended`, `failed` |
| `phoneNumber` | string | — | Filter by exact phone number |
| `customerId` | string | — | Filter by customer ID |
| `dateFrom` | ISO 8601 | — | Filter calls started after this date |
| `dateTo` | ISO 8601 | — | Filter calls started before this date |
| `limit` | int | 20 | Page size (1-100) |
| `page` | int | 1 | Page number (1-indexed) |

**Example:**

```bash
curl "https://api.dayjoy.ai/api/voice/calls?status=ended&limit=10&page=1" \
  -H "Authorization: Bearer $JWT"
```

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "ses_uuid_1",
      "tenantId": "tenant_001",
      "callId": "call_xyz789",
      "phoneNumber": "+15551234567",
      "status": "ended",
      "direction": "inbound",
      "durationSeconds": 180,
      "startedAt": "2025-01-15T10:00:00Z",
      "endedAt": "2025-01-15T10:03:00Z",
      "customer": { "id": "cust_abc123", "firstName": "John", "lastName": "Doe" },
      "analytics": {
        "callDuration": 180,
        "toolCalls": 3,
        "ragQueries": 2,
        "resolution": "resolved",
        "sentiment": "positive"
      }
    }
  ],
  "total": 124,
  "limit": 10,
  "page": 1,
  "totalPages": 13
}
```

---

### GET /api/voice/calls/:id

Get full details of a specific call, including all transcripts and
analytics.

**Permission:** `voice:read`

**Example:**

```bash
curl https://api.dayjoy.ai/api/voice/calls/ses_uuid_1 \
  -H "Authorization: Bearer $JWT"
```

**Response (200 OK):**

```json
{
  "id": "ses_uuid_1",
  "tenantId": "tenant_001",
  "callId": "call_xyz789",
  "phoneNumber": "+15551234567",
  "status": "ended",
  "direction": "inbound",
  "recordingUrl": "https://recordings.dayjoy.ai/call_xyz789.mp3",
  "transcript": "Full call transcript text...",
  "durationSeconds": 180,
  "startedAt": "2025-01-15T10:00:00Z",
  "endedAt": "2025-01-15T10:03:00Z",
  "customer": {
    "id": "cust_abc123",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+15551234567"
  },
  "transcripts": [
    {
      "id": "tx_1",
      "role": "user",
      "content": "I have a problem with my order",
      "timestamp": "2025-01-15T10:00:05Z"
    },
    {
      "id": "tx_2",
      "role": "assistant",
      "content": "I'd be happy to help. Can you tell me your order number?",
      "timestamp": "2025-01-15T10:00:08Z"
    }
  ],
  "analytics": {
    "id": "an_1",
    "callDuration": 180,
    "talkTime": 120,
    "listenTime": 60,
    "silenceTime": 0,
    "interruptionCount": 0,
    "toolCalls": 3,
    "ragQueries": 2,
    "sentiment": "positive",
    "resolution": "resolved",
    "customerSatisfaction": 5,
    "cost": 0.45
  }
}
```

**Errors:**

| Status | When |
|--------|------|
| 404 | Call ID doesn't exist or doesn't belong to the caller's tenant |

---

### POST /api/voice/calls/:id/end

End an active call. Triggers Vapi's end-call API and marks the local
session as `ended`.

**Permission:** `voice:update`

**Example:**

```bash
curl -X POST https://api.dayjoy.ai/api/voice/calls/ses_uuid_1/end \
  -H "Authorization: Bearer $JWT"
```

**Response (200 OK):**

```json
{
  "success": true
}
```

If the call has already ended, returns:

```json
{
  "success": true,
  "message": "Call already ended"
}
```

---

### GET /api/voice/calls/:id/recording

Get the recording URL for a call.

**Permission:** `voice:read`

**Response (200 OK):**

```json
{
  "recordingUrl": "https://recordings.dayjoy.ai/call_xyz789.mp3"
}
```

**Errors:**

| Status | When |
|--------|------|
| 404 | Call doesn't exist OR recording not yet available |

---

## Sessions

### GET /api/voice/sessions/active

List all currently-active (in-progress) voice sessions for the tenant.
Useful for live dashboards.

**Permission:** `voice:read`

**Example:**

```bash
curl https://api.dayjoy.ai/api/voice/sessions/active \
  -H "Authorization: Bearer $JWT"
```

**Response (200 OK):**

```json
[
  {
    "id": "ses_uuid_active1",
    "callId": "call_active1",
    "phoneNumber": "+15551234567",
    "status": "active",
    "startedAt": "2025-01-15T11:00:00Z",
    "customer": { "id": "cust_abc", "firstName": "Jane" }
  }
]
```

---

## Assistants

### GET /api/voice/assistants

List all configured Vapi assistants.

**Permission:** `voice:read`

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "asst_dayjoy_support",
      "name": "Dayjoy Support Agent",
      "voiceId": "rachel",
      "model": "gpt-4o"
    }
  ]
}
```

> **Note:** The underlying `VapiClientService.listAssistants()` is
> owned by Agent 3. This endpoint may return an empty list until
> the implementation is wired up.

---

### POST /api/voice/assistants

Create a new Vapi assistant.

**Permission:** `voice:create`

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Assistant display name |
| `voiceId` | string | ❌ | Voice ID (default: `rachel`) |
| `model` | string | ❌ | LLM model (default: `gpt-4o`) |
| `firstMessage` | string | ❌ | Greeting spoken when call connects |
| `systemPrompt` | string | ❌ | System prompt for the LLM |
| `recordingEnabled` | boolean | ❌ | Enable call recording (default: true) |
| `metadata` | object | ❌ | Arbitrary metadata |

**Example:**

```bash
curl -X POST https://api.dayjoy.ai/api/voice/assistants \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dayjoy Sales Agent",
    "voiceId": "antoni",
    "model": "gpt-4o",
    "firstMessage": "Hi! This is Alex from Dayjoy Sales. How can I help?",
    "recordingEnabled": true
  }'
```

---

## Analytics

### GET /api/voice/analytics/dashboard

Aggregated metrics for the analytics dashboard. Returns counts +
averages for the current tenant.

**Permission:** `voice:read`

**Response (200 OK):**

```json
{
  "totals": {
    "totalCalls": 1542,
    "activeCalls": 3,
    "completedCalls": 1480,
    "failedCalls": 59,
    "todayCalls": 87
  },
  "averages": {
    "callDuration": 142.5
  },
  "sums": {
    "toolCalls": 4321,
    "ragQueries": 1899
  }
}
```

---

### GET /api/voice/analytics/calls

Paginated call analytics rows. Each row corresponds to a single
completed call with its analytics summary.

**Permission:** `voice:read`

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `resolution` | enum | — | Filter by `resolved`, `escalated`, `abandoned` |
| `dateFrom` | ISO 8601 | — | Filter rows created after this date |
| `dateTo` | ISO 8601 | — | Filter rows created before this date |
| `limit` | int | 20 | Page size (1-100) |
| `page` | int | 1 | Page number |

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "an_1",
      "sessionId": "ses_uuid_1",
      "callDuration": 180,
      "toolCalls": 3,
      "ragQueries": 2,
      "sentiment": "positive",
      "resolution": "resolved",
      "customerSatisfaction": 5,
      "cost": 0.45,
      "createdAt": "2025-01-15T10:03:00Z",
      "session": {
        "id": "ses_uuid_1",
        "phoneNumber": "+15551234567",
        "direction": "inbound"
      }
    }
  ],
  "total": 124,
  "limit": 20,
  "page": 1,
  "totalPages": 7
}
```

---

### GET /api/voice/analytics/tools

Aggregate tool-usage stats for the current tenant.

**Permission:** `voice:read`

**Response (200 OK):**

```json
{
  "totals": {
    "toolCalls": 4321,
    "ragQueries": 1899
  },
  "averages": {
    "toolCallsPerCall": 2.8,
    "ragQueriesPerCall": 1.2
  },
  "message": "Per-tool breakdown requires the ToolUsageTracker table (Agent 4 ownership)"
}
```

> **Note:** Per-tool breakdown (which tools called most, success rates
> per tool) requires the `ToolUsageTracker` table — owned by Agent 4.
> The endpoint returns aggregate totals until that table is wired.

---

## Webhook

### POST /api/voice/webhook

The webhook receiver for Vapi events. **This endpoint is public** —
authentication is via HMAC-SHA256 signature verification, NOT JWT.

**Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `x-vapi-signature` | ✅ | HMAC-SHA256 signature of `<timestamp>.<payload>` |
| `x-vapi-timestamp` | ✅ | Unix timestamp (milliseconds) of when Vapi signed the request |
| `Content-Type` | ✅ | `application/json` |

**Request body:** Varies by event type. Common shape:

```json
{
  "type": "call.started" | "call.ended" | "call.transcript" | "function-call",
  "call": {
    "id": "call_xyz789",
    "phoneNumber": "+15551234567",
    "status": "active"
  },
  "data": { /* event-specific */ }
}
```

#### Event: call.started

Fired when Vapi answers an inbound call or initiates an outbound call.

```json
{
  "type": "call.started",
  "call": {
    "id": "call_xyz789",
    "phoneNumber": "+15551234567",
    "status": "active"
  }
}
```

#### Event: call.ended

Fired when a call ends.

```json
{
  "type": "call.ended",
  "call": {
    "id": "call_xyz789",
    "phoneNumber": "+15551234567",
    "status": "ended"
  },
  "data": {
    "durationSeconds": 180,
    "transcript": "Full transcript text...",
    "recordingUrl": "https://recordings.vapi.ai/call_xyz789.mp3",
    "reason": "customer_hangup"
  }
}
```

#### Event: call.transcript

Fired for each transcript segment (user or assistant).

```json
{
  "type": "call.transcript",
  "call": {
    "id": "call_xyz789",
    "phoneNumber": "+15551234567",
    "status": "active"
  },
  "data": {
    "role": "user",
    "transcript": "I have a problem with my order",
    "timestamp": 1737000000000,
    "isFinal": true
  }
}
```

#### Event: function-call

Fired when the LLM wants to call a tool (function calling).

```json
{
  "type": "function-call",
  "call": {
    "id": "call_xyz789",
    "phoneNumber": "+15551234567",
    "status": "active"
  },
  "data": {
    "functionName": "search_knowledge",
    "parameters": { "query": "return policy" },
    "sessionId": "ses_uuid_1"
  }
}
```

The handler executes the named tool and returns the result; Vapi
passes the result back to the LLM, which generates the spoken reply.

#### Response (200 OK)

```json
{
  "status": "success",
  "eventType": "call.started"
}
```

#### Errors

| Status | When |
|--------|------|
| 401 | Missing `VAPI_WEBHOOK_SECRET` env var (fail-closed) |
| 401 | Invalid signature |
| 401 | Timestamp skew > 5 minutes (replay protection) |
| 400 | Unknown event type |
| 500 | Handler exception (logged to Sentry) |

---

## SDK Example (TypeScript)

```typescript
const DAYJOY_API = 'https://api.dayjoy.ai';

// 1. Login to get JWT
const loginResp = await fetch(`${DAYJOY_API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@dayjoy.ai', password: '...' }),
});
const { accessToken } = await loginResp.json();

// 2. Initiate an outbound call
const callResp = await fetch(`${DAYJOY_API}/api/voice/calls`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    phoneNumber: '+15551234567',
    assistantId: 'asst_dayjoy_support',
    purpose: 'welcome_call',
  }),
});
const call = await callResp.json();
console.log('Call initiated:', call.id);

// 3. Poll for call status
const statusResp = await fetch(`${DAYJOY_API}/api/voice/calls/${call.sessionId}`, {
  headers: { 'Authorization': `Bearer ${accessToken}` },
});
const status = await statusResp.json();
console.log('Status:', status.status);

// 4. End the call manually
await fetch(`${DAYJOY_API}/api/voice/calls/${call.sessionId}/end`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}` },
});
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/voice/webhook` | 1000 requests | per minute per IP |
| All other API endpoints | 100 requests | per minute per user |

Rate-limited responses return HTTP 429 with a `Retry-After` header.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-01 | Full production release — 8 tools, 7 flows, comprehensive tests + docs |
| 1.0.0 | 2024-09 | Initial release with 4 tools + 3 flows |

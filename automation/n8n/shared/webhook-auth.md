# Dayjoy — n8n Webhook Security Pattern

Every Dayjoy backend webhook that triggers an n8n workflow is signed with
HMAC-SHA256. This document defines the **canonical signature scheme** and
the **canonical n8n Code node** that every webhook-triggered workflow in
`workflows/<category>/*.json` embeds as its first processing node.

---

## 1. Why HMAC verification?

n8n production webhook URLs are publicly routable (`https://n8n.dayjoy.ai/webhook/<uuid>`).
A leaked or guessed URL would otherwise let an attacker inject fake
`lead.created` / `customer.created` events into the CRM. HMAC verification
guarantees that **only the Dayjoy backend** (which holds the shared secret)
can trigger workflow execution.

This is **defence-in-depth** on top of:

- HTTPS transport encryption
- The unguessable webhook path UUID (`<n8n auto-generated>`)
- Optional IP allow-listing at the Caddy gateway (`deployment/Caddyfile`)

---

## 2. Signature scheme

### 2.1 Shared secret

A 32-byte hex secret (`DAYJOY_WEBHOOK_SECRET`) provisioned in AWS Secrets
Manager (`dayjoy/prod/N8N_WEBHOOK_SECRET`) and injected into:

- The Dayjoy backend (`DAYJOY_WEBHOOK_SECRET` env var) — used to **sign** outbound payloads
- The n8n container (`DAYJOY_WEBHOOK_SECRET` env var) — used to **verify** inbound payloads

Rotation: every 90 days, dual-publishing both old and new secret for a
24-hour overlap window to avoid dropped webhooks during rotation.

### 2.2 Signing payload

The backend computes the HMAC over **the raw request body bytes** (not a
canonicalised JSON string). This means:

- Field order does not matter
- Whitespace differences between what the backend serialises and what n8n
  receives do not matter (n8n passes raw bytes to the Code node)
- The signature covers exactly the bytes the receiver decodes

### 2.3 Headers

Every webhook request from the backend includes:

| Header | Example | Purpose |
|---|---|---|
| `X-Dayjoy-Signature` | `sha256=4f3a...` | `sha256=` prefix + lowercase hex HMAC digest |
| `X-Dayjoy-Timestamp` | `1736380800` | Unix seconds — request send time |
| `X-Dayjoy-Event` | `lead.created` | Event type for routing / observability |
| `X-Dayjoy-Event-Id` | `01HQ8X...` | Server-side UUID; used for idempotency dedup |
| `X-Dayjoy-Delivery` | `1` | Delivery attempt counter (1, 2, 3 on retries) |
| `Content-Type` | `application/json` | Standard |

### 2.4 Signature computation (backend side)

```typescript
// backend/src/automation/webhook-signer.ts
import crypto from 'crypto';

export function signWebhook(body: Buffer, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

// Usage:
//   const sig = signWebhook(req.body, process.env.DAYJOY_WEBHOOK_SECRET!);
//   fetch(n8nWebhookUrl, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'X-Dayjoy-Signature': sig,
//       'X-Dayjoy-Timestamp': Math.floor(Date.now()/1000).toString(),
//       'X-Dayjoy-Event': 'lead.created',
//       'X-Dayjoy-Event-Id': crypto.randomUUID(),
//       'X-Dayjoy-Delivery': '1',
//     },
//     body: JSON.stringify(payload),
//   });
```

### 2.5 Replay protection

A request is rejected if `|now - X-Dayjoy-Timestamp| > 300` seconds (5
minutes). This prevents replay of an intercepted-but-valid request after
its useful lifetime.

---

## 3. Canonical n8n verification Code node

Every webhook-triggered workflow in this repo embeds the following Code
node as the **second** node (immediately after the Webhook trigger). The
node either:

- Forwards the validated payload to downstream nodes, **or**
- Throws (which n8n surfaces as a workflow error → routed to Error Trigger
  → Slack alert)

### 3.1 Webhook node configuration

The Webhook node is configured with **"Binary Data" = false** and
**"Raw Data" = true** so that n8n exposes both:

- `$json.body` — the parsed JSON payload
- `$binary.data` — the raw body bytes (used for HMAC recomputation)

```
Webhook node parameters:
  httpMethod: POST
  path: <workflow-specific, e.g. lead-capture>
  responseMode: responseNode   ← important: respond AFTER verification
  rawData: true
  options: { binaryPropertyName: "data" }
```

### 3.2 Verification Code node (JavaScript)

```javascript
// Node name: "Verify HMAC Signature"
// Type: n8n-nodes-base.code (JavaScript)
// Input: Webhook node
// Output: success branch (downstream nodes) OR throws

const crypto = require('crypto');

const headers = items[0].json.headers || {};
const bodyStr = items[0].json.bodyRaw || JSON.stringify(items[0].json.body);
const secret = process.env.DAYJOY_WEBHOOK_SECRET;

// ---- 1. Required headers present ----
const signature = headers['x-dayjoy-signature'];
const timestamp = headers['x-dayjoy-timestamp'];
const eventId   = headers['x-dayjoy-event-id'];
const eventType = headers['x-dayjoy-event'];

if (!signature || !timestamp || !eventId || !eventType) {
  throw new Error('Missing required Dayjoy webhook headers');
}

// ---- 2. Replay window (5 minutes) ----
const now = Math.floor(Date.now() / 1000);
const skew = Math.abs(now - parseInt(timestamp, 10));
if (skew > 300) {
  throw new Error(`Webhook timestamp out of window (skew=${skew}s)`);
}

// ---- 3. Constant-time HMAC comparison ----
const expected = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(bodyStr, 'utf8')
  .digest('hex');

const sigBuf  = Buffer.from(signature);
const expBuf  = Buffer.from(expected);
if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
  throw new Error('Invalid webhook signature');
}

// ---- 4. Event type allow-list (per-workflow) ----
const ALLOWED_EVENTS = ['lead.created']; // ← override per workflow
if (!ALLOWED_EVENTS.includes(eventType)) {
  throw new Error(`Unexpected event type: ${eventType}`);
}

// ---- 5. Idempotency dedup (call backend) ----
// The dedup check is performed by the next HTTP Request node, not here.
// We just forward eventId so the downstream node can POST /api/automation/event-dedup.
const payload = items[0].json.body;
payload._meta = { eventId, eventType, receivedAt: new Date().toISOString() };

return [{ json: payload }];
```

### 3.3 Why `bodyRaw` instead of `JSON.stringify(body)`?

n8n may re-serialise the parsed JSON with different key order than the
backend used when signing. To avoid signature mismatches from this, the
Webhook node is configured to expose the raw request body as a string via
`$json.bodyRaw`. In n8n v1.x this is done by setting:

- Webhook node → **Option: Raw Data** = `true`
- Webhook node → **Option: Binary Property** = `data`
- Then in the Code node, read `items[0].binary.data` and convert with
  `await this.helpers.getBinaryDataBuffer(items[0], 'data')` then `.toString('utf8')`

For workflows where exact-byte matching is not critical (e.g., the backend
sends canonical JSON with stable key order), the simpler
`JSON.stringify(items[0].json.body)` path is acceptable. **This repo uses
the raw-bytes path for all CRM/Sales/Lead workflows** to be safe.

### 3.4 n8n Code node binary-aware version (production)

```javascript
// Node name: "Verify HMAC Signature (raw bytes)"
// For workflows that must defend against JSON re-serialisation.

const crypto = require('crypto');

const headers = items[0].json.headers || {};
const secret  = process.env.DAYJOY_WEBHOOK_SECRET;

const signature = headers['x-dayjoy-signature'];
const timestamp = headers['x-dayjoy-timestamp'];
const eventId   = headers['x-dayjoy-event-id'];
const eventType = headers['x-dayjoy-event'];

if (!signature || !timestamp || !eventId || !eventType) {
  throw new Error('Missing required Dayjoy webhook headers');
}

const now = Math.floor(Date.now() / 1000);
if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
  throw new Error('Webhook timestamp out of 5-minute window');
}

// Get the raw body bytes — n8n exposes the unparsed body as binary data
const bodyBuffer = await this.helpers.getBinaryDataBuffer(items[0], 'data');
const expected = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(bodyBuffer)
  .digest('hex');

const sigBuf = Buffer.from(signature);
const expBuf = Buffer.from(expected);
if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
  throw new Error('Invalid webhook signature');
}

const ALLOWED_EVENTS = ['lead.created']; // override per workflow
if (!ALLOWED_EVENTS.includes(eventType)) {
  throw new Error(`Unexpected event type: ${eventType}`);
}

const payload = JSON.parse(bodyBuffer.toString('utf8'));
payload._meta = { eventId, eventType, receivedAt: new Date().toISOString() };

return [{ json: payload }];
```

---

## 4. Responding to the webhook

The Webhook node's **response mode** is set to `responseNode`. A dedicated
**Respond to Webhook** node sits at the very end of the success path and
the very end of the failure path:

| Path | HTTP status | Body |
|---|---|---|
| Success (after downstream sync work) | `200 OK` | `{ "ok": true, "eventId": "..." }` |
| Signature verification failed | `401 Unauthorized` | `{ "error": "invalid_signature" }` |
| Timestamp out of window | `408 Request Timeout` | `{ "error": "stale_timestamp" }` |
| Duplicate event (idempotency) | `200 OK` | `{ "ok": true, "dedup": true }` |
| Unexpected event type | `422 Unprocessable Entity` | `{ "error": "unexpected_event" }` |

> **Why synchronous 200 at the end?** Dayjoy's outbound webhook dispatcher
> retries on non-2xx with exponential backoff (1m, 5m, 15m, 1h, 4h, 12h).
> Returning 200 only after downstream work completes prevents duplicate
> processing at the cost of holding the HTTP connection open. For
> workflows with downstream work > 10s, the workflow returns `202 Accepted`
> immediately after signature verification and processes asynchronously.

---

## 5. Idempotency dedup

The first HTTP Request node after signature verification calls:

```
POST {DAYJOY_API_BASE_URL}/api/automation/event-dedup
Authorization: Bearer <JWT>  (dayjoyApi credential)
Content-Type: application/json

{ "eventId": "{{ $json._meta.eventId }}" }
```

- **201 Created** → first time seen → continue workflow
- **409 Conflict** → duplicate → route to "Respond 200 dedup" node and stop

The backend stores `{eventId, workflowName, receivedAt}` in a 7-day TTL
table (`automation_event_dedup`). 7 days covers the longest backend retry
schedule (12h × 6 attempts ≈ 3 days) with safety margin.

---

## 6. Failure visibility

A failed signature verification is treated as a **security event**:

1. The Code node `throw`s → n8n marks the execution as `error`
2. The global Error Trigger workflow fires → posts to
   `#dayjoy-automation-alerts` Slack with execution ID, workflow name, and
   the (redacted) headers
3. The workflow also calls `POST /api/audit-log`:
   ```json
   {
     "event": "automation.webhook.signature_failed",
     "severity": "HIGH",
     "meta": { "workflow": "Lead Capture Automation", "ip": "<request IP>" }
   }
   ```
4. If 5+ failures from the same IP within 10 minutes → backend auto-blocks
   the IP at the gateway (`deployment/Caddyfile` rate-limit layer)

---

## 7. Testing the verification

### 7.1 Unit test (outside n8n)

```bash
# Generate a valid signature for a sample payload
SECRET="test-secret"
BODY='{"leadId":"abc","firstName":"Jane"}'
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"
TS=$(date +%s)

curl -X POST http://localhost:5678/webhook/lead-capture-test \
  -H "Content-Type: application/json" \
  -H "X-Dayjoy-Signature: $SIG" \
  -H "X-Dayjoy-Timestamp: $TS" \
  -H "X-Dayjoy-Event: lead.created" \
  -H "X-Dayjoy-Event-Id: $(uuidgen)" \
  -d "$BODY"
```

### 7.2 Negative tests (must all 401)

| Test | Expected |
|---|---|
| Missing `X-Dayjoy-Signature` header | 401 `invalid_signature` |
| Wrong secret | 401 `invalid_signature` |
| Tampered body (1 byte flipped) | 401 `invalid_signature` |
| Timestamp 6 minutes old | 408 `stale_timestamp` |
| Timestamp 6 minutes in the future | 408 `stale_timestamp` |
| Valid signature but event=`order.created` on lead workflow | 422 `unexpected_event` |
| Replay same `eventId` twice | 200 `{ "dedup": true }` on second |

---

## 8. Reference workflow snippet

Every webhook-triggered workflow JSON in this repo begins with the
following three nodes in this order:

1. **Webhook** (`n8n-nodes-base.webhook`) — receives POST, exposes raw body
2. **Verify HMAC Signature** (`n8n-nodes-base.code`) — section 3.2 / 3.4 code
3. **Event Dedup Check** (`n8n-nodes-base.httpRequest`) — POST
   `/api/automation/event-dedup`

Downstream business logic starts at node 4.

For a complete worked example, see
[`workflows/leads/lead-capture.json`](../workflows/leads/lead-capture.json)
— it embeds the exact verification node above as its second node.

---

## 9. Secret rotation runbook

1. Generate new secret: `openssl rand -hex 32`
2. Store in AWS Secrets Manager as `dayjoy/prod/N8N_WEBHOOK_SECRET_V2`
3. Update backend env to **accept both** V1 and V2 for verification (24h overlap)
4. Update n8n env to **sign with V2** (n8n only verifies, but keep both during overlap)
5. Wait 24h — confirm no `automation.webhook.signature_failed` audit entries
6. Remove V1 from backend verification allow-list
7. Delete V1 from Secrets Manager
8. Record rotation in `docs/operations/SECRET_ROTATION_LOG.md`

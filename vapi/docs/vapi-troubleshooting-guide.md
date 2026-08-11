# Dayjoy Voice AI — Troubleshooting Guide

> Common issues + step-by-step solutions for the Voice AI service.
> For incidents, see [`vapi-runbooks.md`](vapi-runbooks.md).

**Version:** 2.0.0  •  **Last updated:** 2025-01

---

## Table of Contents

1. [Call Quality Issues](#1-call-quality-issues)
2. [Tool Execution Issues](#2-tool-execution-issues)
3. [Webhook Issues](#3-webhook-issues)
4. [Database Issues](#4-database-issues)
5. [Memory / Session Issues](#5-memory--session-issues)
6. [Performance Issues](#6-performance-issues)
7. [Authentication / Permission Issues](#7-authentication--permission-issues)
8. [Vapi Integration Issues](#8-vapi-integration-issues)
9. [Debug Commands](#9-debug-commands)
10. [Log Analysis](#10-log-analysis)
11. [Performance Tuning](#11-performance-tuning)

---

## 1. Call Quality Issues

### 1.1 Poor audio quality

**Symptoms:**
- Customer reports the AI sounds robotic
- Audio cuts in/out
- Long silences between turns
- Background noise bleeding through

**Possible causes + solutions:**

#### Cause A: Network latency to Vapi

```bash
# Test latency from the customer's region to Vapi
ping api.vapi.ai

# Test bandwidth
speedtest-cli
```

If latency > 200ms, the customer's network is the bottleneck. No
fix from our side — suggest they try a different network.

#### Cause B: Voice settings misconfigured

Check `vapi/deployment/vapi-environment-config.env`:

```bash
VAPI_VOICE_ID=rachel          # Use a high-quality voice
VAPI_TEMPERATURE=0.7          # Lower = more consistent, higher = more expressive
```

In the Vapi dashboard, verify:
- `stability` is between 0.7-0.9 (too low = unstable voice)
- `similarityBoost` is between 0.6-0.8 (too high = artifacts)

#### Cause C: TTS provider overloaded

If using ElevenLabs, check https://status.elevenlabs.io. If they're
degraded, switch to a backup voice provider in the Vapi dashboard.

### 1.2 Call dropping

**Symptoms:**
- Calls disconnect after 30-60 seconds
- Calls drop when the AI is mid-sentence
- "Call ended unexpectedly" in logs

**Possible causes + solutions:**

#### Cause A: Silence timeout too aggressive

```bash
# Current setting
grep SILENCE_TIMEOUT vapi/deployment/vapi-environment-config.env
# VAPI_SILENCE_TIMEOUT_SECONDS=30

# Increase if customers have long pauses (elderly callers, etc.)
# Edit the env file:
# VAPI_SILENCE_TIMEOUT_SECONDS=60
```

#### Cause B: Max call duration exceeded

```bash
# Current setting
grep MAX_DURATION vapi/deployment/vapi-environment-config.env
# VAPI_MAX_DURATION_SECONDS=1800 (30 minutes)

# If legitimate calls exceed this, increase it
# VAPI_MAX_DURATION_SECONDS=3600 (1 hour)
```

#### Cause C: Vapi rate limit hit

Check Vapi dashboard for rate limit warnings. If hitting limits,
upgrade the Vapi plan.

### 1.3 AI not responding

**Symptoms:**
- Customer speaks but AI stays silent
- Long pause then "Are you still there?"
- Call appears active but no conversation

**Possible causes + solutions:**

#### Cause A: STT (speech-to-text) failure

Check Vapi dashboard → Calls → find the call → check STT status.
If Deepgram is failing, switch to Vapi's backup STT provider.

#### Cause B: OpenAI API timeout

```bash
# Test OpenAI API from a pod
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  curl -w "\n%{time_total}\n" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}' \
  https://api.openai.com/v1/chat/completions
```

If OpenAI is slow (> 5 seconds), the AI will appear unresponsive.
Switch to `gpt-4o-mini` for faster responses.

---

## 2. Tool Execution Issues

### 2.1 Tool not executing

**Symptoms:**
- AI says "I don't have that information" when it should call a tool
- `tool_executions` table is empty for a call
- Logs show no `function-call` webhook received

**Possible causes + solutions:**

#### Cause A: Tool not enabled in the Vapi assistant

Check the Vapi dashboard → Assistant → Function calling. All 8 tools
should be listed:
- `search_knowledge`
- `search_products`
- `customer_lookup`
- `distributor_lookup`
- `lead_capture`
- `appointment_booking`
- `create_support_ticket`
- `human_transfer`

If a tool is missing, add it via the Vapi API or dashboard.

#### Cause B: System prompt doesn't mention the tool

The AI won't call a tool unless the system prompt tells it to. Check
`vapi/assistants/vapi-master-system-prompt.md` — every tool should
have a "When to use" description.

#### Cause C: Webhook not reaching the backend

```bash
# Check recent webhooks
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=500 | \
  grep "function-call"

# If no webhooks received, the Vapi dashboard → Settings → Webhooks
# URL may be wrong. It should be:
# https://api.dayjoy.ai/api/voice/webhook
```

### 2.2 Tool returning errors

**Symptoms:**
- Logs show `Tool execution failed: <error>`
- AI says "I'm having trouble looking that up"

**Debug steps:**

```bash
# Find the failing tool call
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=1000 | \
  grep "Tool execution failed" | tail -10

# Get the call ID + tool name, then look at the specific error
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=2000 | \
  grep "<call-id>"
```

Common errors:

| Error | Cause | Fix |
|-------|-------|-----|
| `Query is required` | LLM didn't pass the `query` parameter | Tighten the tool description in Vapi dashboard |
| `Customer not found` | Phone/email doesn't match any customer | Normal — AI should respond gracefully |
| `Database connection failed` | DB pool exhausted | See [Database Issues](#4-database-issues) |
| `RAG service timeout` | RAG pipeline slow or down | Check `RAG_SERVICE_URL` is reachable |
| `Twilio API error` | Twilio credentials bad | Check `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` |

### 2.3 Tool returning wrong data

**Symptoms:**
- AI says the wrong product price
- Customer information is incorrect

**Debug steps:**

```bash
# Test the tool directly
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  curl -X POST http://localhost:3001/api/voice/test-tool \
    -H "Content-Type: application/json" \
    -d '{"tool":"search_products","parameters":{"productName":"Multivitamin"}}'
```

If the tool returns wrong data:
1. Check the underlying data source (DB table, RAG index)
2. Check if there are stale caches
3. Check if the tool's mock implementation is being used (the source
   code has private `mockX` methods that should be replaced with real
   service calls)

---

## 3. Webhook Issues

### 3.1 Webhooks not arriving

**Symptoms:**
- Calls happen but no `VoiceSession` rows in DB
- Vapi dashboard shows calls but our backend has no record

**Debug steps:**

```bash
# 1. Verify the webhook URL is publicly reachable
curl -X POST https://api.dayjoy.ai/api/voice/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"call.started","call":{"id":"test","phoneNumber":"+15551234567","status":"active"}}'
# Should return 401 (signature invalid) — confirms endpoint reachable

# 2. Check Vapi dashboard → Settings → Webhooks
# URL must be: https://api.dayjoy.ai/api/voice/webhook

# 3. Check Ingress
kubectl get ingress -n dayjoy-voice-ai
kubectl describe ingress voice-ai-ingress -n dayjoy-voice-ai
```

### 3.2 Webhooks returning errors

```bash
# Check recent webhook responses
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=1000 | \
  grep "Webhook" | grep -E "error|fail" | tail -20
```

Common errors:

| Error | Fix |
|-------|-----|
| `Invalid signature` | See [runbook §4](vapi-runbooks.md#4-webhook-signature-failure-runbook) |
| `Unknown event type` | Vapi sent an event type we don't handle — add a case in `VapiWebhookService.processWebhook` |
| `Handler exception` | Check the stack trace in Sentry |

### 3.3 Duplicate webhooks

Vapi retries webhooks if it doesn't get a 200 within 5 seconds. If
our backend is slow, the same event may arrive multiple times.

**Symptoms:**
- Duplicate `VoiceTranscript` rows
- Same tool executed twice

**Fix:** The webhook service doesn't currently deduplicate. For
now, ensure the backend responds within 5 seconds. Long-term, add
idempotency via Redis `SETNX` on the event ID.

---

## 4. Database Issues

### 4.1 Connection pool exhausted

**Symptoms:**
- Logs show `PrismaClientInitializationError: Can't reach database server`
- API endpoints return 500
- `pg_stat_activity` shows > 20 active connections

**Debug steps:**

```bash
# Check active connections
kubectl exec -it deployment/postgres -n dayjoy-voice-ai -- \
  psql -U dayjoy -d dayjoy_ai -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Check for idle connections (these are leaking)
kubectl exec -it deployment/postgres -n dayjoy-voice-ai -- \
  psql -U dayjoy -d dayjoy_ai -c \
  "SELECT count(*) FROM pg_stat_activity WHERE state = 'idle';"
```

**Fix:**
- Increase `DATABASE_POOL_SIZE` (default 20)
- Restart pods to clear leaked connections:
  ```bash
  kubectl delete pod -l app=voice-ai -n dayjoy-voice-ai
  ```
- Add pgBouncer for connection pooling (see Docker compose)

### 4.2 Slow queries

```bash
# Find slow queries
kubectl exec -it deployment/postgres -n dayjoy-voice-ai -- \
  psql -U dayjoy -d dayjoy_ai -c \
  "SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;"
```

**Fix:**
- Add missing indexes (check the Prisma schema — every `@@index`
  declaration must exist)
- Run `EXPLAIN ANALYZE` on the slow query
- Consider materialised views for hot aggregations

### 4.3 Missing voice tables

**Symptoms:**
- Logs show `relation "voice_sessions" does not exist`
- API endpoints return 500

**Fix:**

```bash
# Apply the voice schema
cat vapi/config/vapi-database-schema.prisma >> prisma/schema.prisma
pnpm prisma db push
pnpm prisma generate
```

---

## 5. Memory / Session Issues

### 5.1 Session memory not persisting

**Symptoms:**
- AI forgets what the customer said 30 seconds ago
- AI asks the same question twice

**Debug steps:**

```bash
# Check Redis health
kubectl exec -it deployment/redis -n dayjoy-voice-ai -- redis-cli ping

# Check Redis memory
kubectl exec -it deployment/redis -n dayjoy-voice-ai -- \
  redis-cli info memory | grep used_memory_human
```

**Fix:**
- If Redis is down, restart it (AOF will restore sessions)
- If Redis is full, increase `maxmemory` or check eviction policy
  (should be `allkeys-lru`)

### 5.2 Customer profile not loading

**Symptoms:**
- Returning customer gets the "new customer" greeting
- AI doesn't address customer by name

**Debug steps:**

```bash
# Check if the customer profile exists in Redis
kubectl exec -it deployment/redis -n dayjoy-voice-ai -- \
  redis-cli KEYS "customer:*"

# Check the customer profile by phone
kubectl exec -it deployment/redis -n dayjoy-voice-ai -- \
  redis-cli GET "customer:+15551234567"
```

**Fix:**
- If the key is missing, the customer may be calling from a new
  number. The AI will create a new profile on first call.
- If the key exists but the AI doesn't use it, check the
  `CallStartedHandler` — it should call `getCustomerProfile(phone)`
  on every call start.

---

## 6. Performance Issues

### 6.1 High CPU usage

**Symptoms:**
- Pods hitting CPU limit
- HPA scaling continuously
- API latency increasing

**Debug steps:**

```bash
# Per-pod CPU
kubectl top pods -n dayjoy-voice-ai -l app=voice-ai

# Find the CPU-hungry process
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  top -bn1 | head -20
```

**Common causes:**
- JSON parsing of large webhook payloads
- LLM response streaming (CPU-bound)
- pgvector similarity search (consider `ef_search` tuning)

**Fix:**
- Increase CPU limit (k8s)
- Profile with `--inspect` and optimise hot paths
- Cache expensive computations

### 6.2 High memory usage

**Symptoms:**
- Pods OOM-killed (restart count increasing)
- Memory limit hit

**Debug steps:**

```bash
# Per-pod memory
kubectl top pods -n dayjoy-voice-ai -l app=voice-ai

# Heap dump
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  kill -USR2 1  # sends SIGUSR2 to Node.js → heap dump
```

**Common causes:**
- Memory leak in session memory (Map grows unbounded)
- Large transcripts held in memory
- LLM response chunks buffered

**Fix:**
- Add session cleanup on `call.ended`
- Increase memory limit
- Use `--max-old-space-size=512` to bound the heap

### 6.3 High latency

See [High Latency Runbook](vapi-runbooks.md#5-high-latency-runbook).

---

## 7. Authentication / Permission Issues

### 7.1 "Authentication required" error

**Symptoms:**
- API returns 401 Unauthorized
- "Authentication required to check permissions" in logs

**Debug steps:**

```bash
# Verify the JWT is valid
echo $JWT | cut -d. -f2 | base64 -d | jq .

# Check expiry
echo $JWT | cut -d. -f2 | base64 -d | jq .exp
# Compare to current time: date +%s
```

**Fix:**
- If JWT expired, refresh via `POST /api/auth/refresh`
- If JWT signature invalid, check `JWT_SECRET` matches the auth service

### 7.2 "Insufficient permissions" error

**Symptoms:**
- API returns 403 Forbidden
- "Permission denied" in logs

**Debug steps:**

```bash
# Check the user's roles
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  node -e "
    const {PrismaClient} = require('@prisma/client');
    const p = new PrismaClient();
    p.userRole.findMany({
      where: {userId: '<user-id>'},
      include: {role: {include: {permissions: true}}}
    }).then(r => {console.log(JSON.stringify(r, null, 2)); process.exit(0)});
  "
```

**Fix:**
- Assign the required role via the admin dashboard
- Required permissions: `voice:read`, `voice:create`, `voice:update`

---

## 8. Vapi Integration Issues

### 8.1 "VAPI_API_KEY not set"

**Symptoms:**
- Voice AI module logs warning at startup
- All Vapi API calls fail

**Fix:**

```bash
# Check the env var
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  printenv VAPI_API_KEY

# If empty, check the ExternalSecret
kubectl get externalsecret voice-ai-secret -n dayjoy-voice-ai -o yaml
```

If the ExternalSecret is not syncing:
1. Verify the SecretStore is healthy
2. Verify the IRSA role has `secretsmanager:GetSecretValue` permission
3. Check the secret exists in AWS Secrets Manager

### 8.2 Vapi API errors

```bash
# Test the Vapi API directly
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  curl -f -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/calls
```

Common Vapi API errors:

| HTTP | Cause | Fix |
|------|-------|-----|
| 401 | Invalid API key | Rotate the key in Vapi dashboard |
| 402 | Account out of credits | Top up the Vapi account |
| 429 | Rate limit hit | Upgrade Vapi plan or reduce call volume |
| 500 | Vapi server error | Check https://status.vapi.ai |

### 8.3 Phone number not working

**Symptoms:**
- Inbound calls don't connect
- Outbound calls fail with "invalid number"

**Fix:**

```bash
# Check the phone number in Vapi
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  curl -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/phone-numbers | jq
```

If the number is missing or in `error` state, contact Vapi support.

---

## 9. Debug Commands

### Quick health check

```bash
#!/bin/bash
# voice-ai-health-check.sh

echo "=== Pod status ==="
kubectl get pods -n dayjoy-voice-ai -l app=voice-ai

echo "=== Health endpoint ==="
curl -sf https://api.dayjoy.ai/health/ready && echo "OK" || echo "FAIL"

echo "=== Recent errors ==="
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=200 | \
  grep -i error | tail -5

echo "=== Database ==="
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.\$queryRaw\`SELECT 1\`.then(() => console.log('OK')).catch(e => console.log('FAIL', e.message))"

echo "=== Redis ==="
kubectl exec -it deployment/redis -n dayjoy-voice-ai -- redis-cli ping

echo "=== Vapi API ==="
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  curl -sf -o /dev/null -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/calls && echo "OK" || echo "FAIL"
```

### Trace a single call

```bash
# Replace <call-id> with the Vapi call ID
CALL_ID=<call-id>

echo "=== Webhooks received ==="
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=5000 | \
  grep "$CALL_ID"

echo "=== Database records ==="
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  node -e "
    const {PrismaClient} = require('@prisma/client');
    const p = new PrismaClient();
    Promise.all([
      p.voiceSession.findFirst({where: {callId: '$CALL_ID'}, include: {transcripts: true, analytics: true}}),
      p.\$queryRaw\`SELECT * FROM tool_executions WHERE call_id = '$CALL_ID'\`
    ]).then(([s, t]) => {console.log(JSON.stringify({session: s, tools: t}, null, 2)); process.exit(0)});
  "
```

### Run a specific test

```bash
# Run a single test file
pnpm vitest run vapi/tests/vapi-tool-tests.ts

# Run a single test case
pnpm vitest run vapi/tests/vapi-tool-tests.ts -t "should return answer"

# Run with verbose output
pnpm vitest run vapi/tests/vapi-tool-tests.ts --reporter=verbose
```

---

## 10. Log Analysis

### Find errors by severity

```bash
# Last 1000 ERROR logs
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=10000 | \
  jq -R 'fromjson? | select(.level == "error")' | tail -100

# Sentry-style stack traces
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=10000 | \
  jq -R 'fromjson? | select(.stack != null)' | head -50
```

### Trace a single call's logs

```bash
CALL_ID=<call-id>

# All log lines mentioning this call
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=10000 | \
  jq -R 'fromjson? | select(.callId == "$CALL_ID" or .message | tostring | contains("$CALL_ID"))'
```

### Find slow webhooks

```bash
# Webhooks that took > 2 seconds
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=10000 | \
  jq -R 'fromjson? | select(.durationMs != null) | select(.durationMs > 2000)' | \
  jq '{timestamp, type: .eventType, durationMs, callId}'
```

---

## 11. Performance Tuning

### 11.1 Database

```bash
# Increase work_mem for sorts/hashes
ALTER SYSTEM SET work_mem = '64MB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';

# Increase max connections (if needed)
ALTER SYSTEM SET max_connections = 200;

# Reload
SELECT pg_reload_conf();
```

### 11.2 Redis

```bash
# Increase maxmemory
redis-cli CONFIG SET maxmemory 1gb

# Tune eviction policy (already allkeys-lru by default)
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### 11.3 Node.js

```bash
# Increase heap size
node --max-old-space-size=1024 dist/main.js

# Enable compression
node --v8-pool-size=8 dist/main.js
```

### 11.4 Vapi

- Use `gpt-4o-mini` instead of `gpt-4o` for faster responses (lower
  quality, but 3x faster)
- Lower `temperature` to 0.4 for more deterministic responses (less
  re-generation)
- Enable Vapi's response caching for common queries

### 11.5 RAG

- Increase pgvector `ef_search` for better recall (slower)
- Decrease `ef_search` for faster search (lower recall)
- Cache common RAG queries in Redis (5-minute TTL)

```sql
-- Tune pgvector index
SET ivfflat.probes = 10;  -- default 1; higher = better recall, slower
```

---

## Getting Help

If you've tried everything in this guide and the issue persists:

1. **Check the runbooks** — [`vapi-runbooks.md`](vapi-runbooks.md)
   has incident-specific procedures
2. **Search Sentry** — there may be a known issue already filed
3. **Ask in Slack** — `#voice-ai-help`
4. **Page on-call** — PagerDuty schedule `voice-ai-oncall` (for
   production-down situations)
5. **Open a Vapi support ticket** — support@vapi.ai (for Vapi-specific
   issues)

When reporting an issue, always include:
- Call ID (if applicable)
- Timestamp (UTC)
- Symptom (what you observed)
- Steps you've already tried
- Logs / screenshots

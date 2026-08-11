# Dayjoy Voice AI — Operations Runbooks

> Step-by-step playbooks for operating the Voice AI service in
> production. Each runbook is self-contained — print it out and
> follow it during an incident.

**Version:** 2.0.0  •  **Audience:** On-call engineers  •  **Last reviewed:** 2025-01

---

## Table of Contents

1. [Deployment Runbook](#1-deployment-runbook)
2. [Rollback Runbook](#2-rollback-runbook)
3. [Call Failure Runbook](#3-call-failure-runbook)
4. [Webhook Signature Failure Runbook](#4-webhook-signature-failure-runbook)
5. [High Latency Runbook](#5-high-latency-runbook)
6. [Low AI Accuracy Runbook](#6-low-ai-accuracy-runbook)
7. [Escalation Queue Overflow Runbook](#7-escalation-queue-overflow-runbook)
8. [Vapi Outage Runbook](#8-vapi-outage-runbook)
9. [Database Outage Runbook](#9-database-outage-runbook)
10. [Redis Outage Runbook](#10-redis-outage-runbook)
11. [Incident Response Runbook](#11-incident-response-runbook)
12. [Monitoring Runbook](#12-monitoring-runbook)

---

## 1. Deployment Runbook

### When to use
Deploying a new version of the Voice AI service to production.

### Pre-deployment checklist
- [ ] All tests passing (`pnpm vitest run vapi/tests/`)
- [ ] Code reviewed and approved
- [ ] Database migrations tested in staging
- [ ] Environment variables updated (if any new ones)
- [ ] Secrets rotated (if applicable)
- [ ] Stakeholders notified in `#voice-ai-deploys`
- [ ] Off-peak window identified (recommended: 02:00-04:00 UTC)

### Steps

#### 1.1 Backup current state

```bash
# Database backup
kubectl exec -n dayjoy-voice-ai deployment/postgres -- \
  pg_dump -U dayjoy dayjoy_ai > backup-$(date +%Y%m%d-%H%M%S).sql

# Export current deployment manifest (for rollback)
kubectl get deployment voice-ai -n dayjoy-voice-ai -o yaml > \
  deployment-backup-$(date +%Y%m%d).yaml
```

#### 1.2 Deploy new image

```bash
# Update image
kubectl set image deployment/voice-ai \
  voice-ai=dayjoy/voice-ai:$NEW_TAG \
  -n dayjoy-voice-ai

# Watch rollout (max 5 minutes)
kubectl rollout status deployment/voice-ai \
  -n dayjoy-voice-ai \
  --timeout=300s
```

#### 1.3 Run database migrations (if any)

```bash
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  pnpm prisma migrate deploy
```

#### 1.4 Verify deployment

```bash
# Pods running
kubectl get pods -n dayjoy-voice-ai -l app=voice-ai

# Health check
curl -f https://api.dayjoy.ai/health/ready

# Recent logs — should be no ERROR
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=200 | grep -i error

# Place a test call (manual — call the Dayjoy number from your phone)
```

#### 1.5 Post-deployment

- [ ] All pods running (3+)
- [ ] Health checks passing
- [ ] No error spikes in Grafana
- [ ] Test call answered within 5 seconds
- [ ] AI responds to "What products do you have?"
- [ ] Tool execution visible in logs
- [ ] Call ends gracefully

### Rollback criteria

If any of these occur during the first 15 minutes, **rollback immediately**:
- Error rate > 5%
- Call failure rate > 10%
- Pods crash-looping
- Health check failing
- AI not responding to calls

---

## 2. Rollback Runbook

### When to use
A deployment has caused issues and you need to revert to the previous version.

### Steps

#### 2.1 Pause auto-scaling

```bash
kubectl scale deployment/voice-ai --replicas=2 -n dayjoy-voice-ai
```

#### 2.2 Rollback to previous image

```bash
# Rollback to the last deployment
kubectl rollout undo deployment/voice-ai -n dayjoy-voice-ai

# Or rollback to a specific revision
kubectl rollout undo deployment/voice-ai \
  --to-revision=3 \
  -n dayjoy-voice-ai

# Watch rollback
kubectl rollout status deployment/voice-ai -n dayjoy-voice-ai
```

#### 2.3 Rollback database (if needed)

```bash
# Only if a migration broke things — roll back the migration
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  pnpm prisma migrate resolve --rolled-back <migration_name>
```

#### 2.4 Verify rollback

```bash
# Pods running previous version
kubectl get pods -n dayjoy-voice-ai -l app=voice-ai
kubectl describe deployment voice-ai -n dayjoy-voice-ai | grep Image

# Health check
curl -f https://api.dayjoy.ai/health/ready

# Test call
```

#### 2.5 Post-rollback

- [ ] Document incident in `INCIDENTS.md`
- [ ] Schedule blameless post-mortem within 48 hours
- [ ] Notify stakeholders in `#voice-ai-deploys`
- [ ] Create bug ticket for the failed deployment

---

## 3. Call Failure Runbook

### When to use
Alert: `VoiceAIHighCallFailureRate` — call failure rate > 10% over 5 minutes.

### Symptoms
- Customers report calls dropping
- Grafana "Voice AI Overview" shows failed calls > 10%
- Sentry errors reference `VapiClient.createCall` or `VapiClient.endCall`

### Investigation steps

#### 3.1 Check Vapi status

```bash
# Vapi status page
curl -s https://status.vapi.ai/api/v2/status.json | jq

# Or check the Vapi dashboard
open https://dashboard.vapi.ai
```

If Vapi is down → skip to [Vapi Outage Runbook](#8-vapi-outage-runbook).

#### 3.2 Check our backend health

```bash
# Pod status
kubectl get pods -n dayjoy-voice-ai -l app=voice-ai

# Pod restarts (high restart count = crash-looping)
kubectl get pods -n dayjoy-voice-ai -l app=voice-ai -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}'

# Recent logs
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=500 | grep -i error
```

#### 3.3 Check database

```bash
# DB connection pool usage
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.\$queryRaw\`SELECT count(*) FROM pg_stat_activity WHERE state = 'active'\`.then(r => {console.log(r); process.exit(0)})"

# DB CPU/memory
kubectl top pod -n dayjoy-voice-ai -l app=postgres
```

#### 3.4 Check Redis

```bash
# Redis health
kubectl exec -it deployment/redis -n dayjoy-voice-ai -- redis-cli ping

# Redis memory
kubectl exec -it deployment/redis -n dayjoy-voice-ai -- redis-cli info memory
```

### Resolution

| Root cause | Resolution |
|------------|------------|
| Vapi outage | See [Vapi Outage Runbook](#8-vapi-outage-runbook) |
| Pod crash-looping | Restart pods: `kubectl delete pod -l app=voice-ai -n dayjoy-voice-ai` |
| DB connection pool exhausted | Increase `DATABASE_POOL_SIZE` or scale DB |
| Redis unavailable | See [Redis Outage Runbook](#10-redis-outage-runbook) |
| Code bug | Rollback to previous version |

### Post-incident
- [ ] Document failed calls + customer impact
- [ ] File bug ticket
- [ ] Add monitoring alert if not already covered

---

## 4. Webhook Signature Failure Runbook

### When to use
Alert: `VoiceAIWebhookSignatureFailures` — webhook signature verification
failures > 5% over 5 minutes.

### Symptoms
- Logs show "Webhook signature mismatch — rejecting"
- Vapi dashboard shows webhooks returning 401
- Calls aren't being tracked in the database

### Investigation steps

#### 4.1 Verify webhook secret

```bash
# Check the secret in Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id vapi/webhook-secret \
  --query SecretString --output text

# Compare with the secret configured in Vapi dashboard
# (https://dashboard.vapi.ai → Settings → Webhooks)
```

The two secrets MUST match. If they don't:
1. Update the Vapi dashboard with the new secret
2. Update Secrets Manager
3. Restart the voice-ai pods to pick up the new ExternalSecret value

#### 4.2 Check for clock drift

```bash
# Compare pod clock with Vapi's clock
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- date -u

# Vapi timestamps are in the x-vapi-timestamp header (ms since epoch)
# Verify skew is < 5 minutes
```

If clock drift > 5 minutes, the webhook service will reject the
request as a potential replay. Fix NTP on the node.

#### 4.3 Check for replay attacks

```bash
# Look for repeated timestamps in the logs
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=1000 | \
  grep "x-vapi-timestamp" | sort | uniq -c | sort -rn | head

# If a single timestamp appears many times, it's a replay attack
# (or Vapi is misbehaving)
```

### Resolution

| Root cause | Resolution |
|------------|------------|
| Secret mismatch | Update both sides to the same secret, restart pods |
| Clock drift | Fix NTP on the K8s nodes |
| Replay attack | Block the source IP at the WAF; rotate the webhook secret |
| Vapi bug (sending bad signatures) | Open a Vapi support ticket |

### Post-incident
- [ ] Document the timeline
- [ ] If a real attack, file a security incident
- [ ] Add an alert for secret mismatch (proactive check)

---

## 5. High Latency Runbook

### When to use
Alert: `VoiceAIHighLatency` — p95 webhook processing time > 2 seconds
over 5 minutes.

### Symptoms
- Customers experience long silences during calls
- Grafana "Voice AI Overview" shows p95 latency > 2s
- AI takes > 5 seconds to respond

### Investigation steps

#### 5.1 Identify the slow layer

```bash
# Check latency breakdown in Grafana
# Dashboard: Voice AI → Latency Breakdown
# - Webhook receive → handler dispatch
# - Handler dispatch → tool execution
# - Tool execution → DB write
# - DB write → HTTP response
```

#### 5.2 Check database performance

```bash
# Slow queries
kubectl exec -it deployment/postgres -n dayjoy-voice-ai -- \
  psql -U dayjoy -d dayjoy_ai -c "
    SELECT query, mean_exec_time, calls
    FROM pg_stat_statements
    ORDER BY mean_exec_time DESC
    LIMIT 10;
  "

# Missing indexes
kubectl exec -it deployment/postgres -n dayjoy-voice-ai -- \
  psql -U dayjoy -d dayjoy_ai -c "
    SELECT relname, seq_scan, seq_tup_read, idx_scan
    FROM pg_stat_user_tables
    WHERE seq_scan > 0
    ORDER BY seq_tup_read DESC
    LIMIT 10;
  "
```

#### 5.3 Check RAG latency

```bash
# RAG query latency
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=1000 | \
  grep "rag.search" | grep "latency" | tail -20
```

RAG queries should take < 1 second. If they're slow:
- Check OpenAI API latency
- Check pgvector index health
- Consider caching common queries

#### 5.4 Check OpenAI API

```bash
# OpenAI API status
curl -s https://status.openai.com/api/v2/status.json | jq

# OpenAI latency from our pods
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- \
  curl -w "@-" -o /dev/null -s https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

#### 5.5 Check Redis

```bash
# Redis latency
kubectl exec -it deployment/redis -n dayjoy-voice-ai -- \
  redis-cli --latency
```

### Resolution

| Root cause | Resolution |
|------------|------------|
| DB slow queries | Add missing indexes; optimise queries |
| RAG slow | Cache common queries; increase pgvector `ef_search` |
| OpenAI slow | Switch to a faster model (e.g. `gpt-4o-mini`); retry with backoff |
| Redis slow | Scale Redis; check for memory pressure |
| Pod CPU throttled | Increase CPU limit; HPA should scale out |

---

## 6. Low AI Accuracy Runbook

### When to use
Alert: `VoiceAILowAccuracy` — AI accuracy < 80% over 1 hour (measured
by the QA team's call sampling + the AI evaluation pipeline).

### Symptoms
- QA team reports inaccurate responses
- Hallucination rate > 5% in Grafana
- Customers asking "are you sure?" or repeating questions

### Investigation steps

#### 6.1 Identify the failing scenarios

```bash
# Pull recent low-accuracy calls from the QA dashboard
curl https://api.dayjoy.ai/api/voice/analytics/calls \
  -H "Authorization: Bearer $JWT" | \
  jq '.data[] | select(.aiAccuracy < 0.8) | {callId, aiAccuracy, hallucinationRate}'
```

#### 6.2 Categorise the failures

Common patterns:
1. **Hallucination** — AI invented facts not in the knowledge base
2. **Wrong tool** — AI called `search_products` when it should have called `search_knowledge`
3. **Wrong parameters** — AI passed bad query string to the tool
4. **Missed context** — AI didn't use conversation history
5. **Misunderstood intent** — AI detected wrong flow

#### 6.3 Check the knowledge base

```bash
# Run a test RAG query
curl -X POST https://api.dayjoy.ai/api/rag/search \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"query": "return policy", "topK": 5}'
```

If the KB returns irrelevant chunks:
- The KB needs to be re-ingested with cleaner source documents
- The embedding model may need retraining (rare)

#### 6.4 Check the system prompt

```bash
# View the current system prompt
cat vapi/assistants/vapi-master-system-prompt.md
```

If the prompt is too vague, the AI may hallucinate. Tighten the
instructions.

### Resolution

| Root cause | Resolution |
|------------|------------|
| Stale knowledge base | Re-ingest KB with latest product/policy docs |
| Weak system prompt | Tighten instructions; add explicit "don't make up facts" |
| Wrong model | Switch from `gpt-4o-mini` to `gpt-4o` |
| Bad retrieval | Tune RAG `topK` + similarity threshold |
| Edge case | Add to the `VOICE_TEST_CASES` catalog + add a regression test |

### Post-incident
- [ ] Add failing scenario to `vapi/tests/vapi-voice-test-cases.ts`
- [ ] Update the system prompt if needed
- [ ] Re-train the QA team on the new behaviour

---

## 7. Escalation Queue Overflow Runbook

### When to use
Alert: `VoiceAIEscalationQueueOverflow` — escalation queue wait time
> 60 seconds OR queue depth > 20 calls.

### Symptoms
- Customers waiting > 60 seconds for a human agent
- Slack `#voice-escalations` flooded with notifications
- Customer satisfaction dropping

### Investigation steps

#### 7.1 Check human agent availability

```bash
# How many human agents are logged in?
# (Check your ACD / contact center platform)
```

#### 7.2 Check escalation rate

```bash
# Is the AI escalating more than usual?
curl https://api.dayjoy.ai/api/voice/analytics/calls \
  -H "Authorization: Bearer $JWT" | \
  jq '[.data[] | select(.resolution == "escalated")] | length'
```

If escalation rate is > 20% (normal: 5-15%), the AI may be failing
— see [Low AI Accuracy Runbook](#6-low-ai-accuracy-runbook).

### Resolution

#### Short-term (immediate)
1. **Pull in off-shift agents** — page the on-call human support team
2. **Temporarily tighten AI escalation triggers** — only escalate for
   explicit "let me speak to a human" requests
3. **Add a "high call volume" message** — set Vapi's hold music to
   include an apology + estimated wait time

#### Long-term (next sprint)
1. **Hire more agents** — if this is recurring, the team is understaffed
2. **Improve AI accuracy** — reduce escalations by making the AI more capable
3. **Add a callback option** — offer customers a callback instead of holding

---

## 8. Vapi Outage Runbook

### When to use
Vapi.ai is down or returning errors. Confirmed via
https://status.vapi.ai or by checking `VapiClient` errors in logs.

### Symptoms
- Inbound calls not being answered
- Outbound calls failing
- Webhooks not arriving
- Logs show "Vapi API error: 502 Bad Gateway" or timeouts

### Immediate actions

#### 8.1 Confirm the outage

```bash
# Check Vapi status
curl -s https://status.vapi.ai/api/v2/status.json | jq

# Try the Vapi API directly
curl -f -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/calls | jq
```

#### 8.2 Switch to backup mode

If Vapi is fully down:
1. **Update the Dayjoy phone number** to route to a backup number
   (human support queue) — this is done in Twilio directly
2. **Set maintenance mode** on the Voice AI dashboard
3. **Notify stakeholders** in `#voice-ai-incidents`:
   ```
   🚨 VAPI OUTAGE CONFIRMED
   - Started: <time>
   - Impact: All inbound/outbound voice calls failing
   - Mitigation: Calls rerouted to human backup queue (+1-555-...)
   - ETA: Waiting on Vapi status update
   ```

#### 8.3 Monitor Vapi recovery

```bash
# Watch Vapi status every 5 minutes
watch -n 300 'curl -s https://status.vapi.ai/api/v2/status.json | jq'
```

#### 8.4 Restore service

Once Vapi is back:
1. **Update Twilio routing** back to the Vapi number
2. **Disable maintenance mode**
3. **Place a test call** to verify end-to-end
4. **Check for missed calls** — review voicemails and follow up with
   customers who tried to call during the outage

### Post-incident
- [ ] Open a Vapi support ticket asking for RCA
- [ ] Document the outage duration + customer impact
- [ ] Consider a multi-provider fallback (e.g. Retell AI as backup)

---

## 9. Database Outage Runbook

### When to use
PostgreSQL is unreachable or returning errors.

### Symptoms
- All API endpoints returning 500
- Logs show "PrismaClientInitializationError" or connection timeouts
- `pg_isready` failing

### Immediate actions

#### 9.1 Check DB pod

```bash
kubectl get pods -n dayjoy-voice-ai -l app=postgres
kubectl describe pod -n dayjoy-voice-ai -l app=postgres
```

#### 9.2 Check DB storage

```bash
# Is the volume full?
kubectl exec -it deployment/postgres -n dayjoy-voice-ai -- df -h

# Check DB processes
kubectl exec -it deployment/postgres -n dayjoy-voice-ai -- \
  psql -U dayjoy -d dayjoy_ai -c "SELECT * FROM pg_stat_activity;"
```

#### 9.3 Failover (if using a managed DB)

```bash
# AWS RDS failover
aws rds failover-db-cluster \
  --db-cluster-identifier dayjoy-voice-ai-cluster
```

#### 9.4 Restore from backup (last resort)

```bash
# Find the latest snapshot
aws rds describe-db-snapshots \
  --db-instance-identifier dayjoy-voice-ai \
  --query 'DBSnapshots[-1].DBSnapshotIdentifier' \
  --output text

# Restore
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier dayjoy-voice-ai-restored \
  --db-snapshot-identifier <snapshot-id>
```

### Post-incident
- [ ] Document the root cause
- [ ] Add monitoring for the failure mode (disk full, connection leak, etc.)
- [ ] Test the restore procedure (was it as fast as expected?)

---

## 10. Redis Outage Runbook

### When to use
Redis is unreachable or returning errors.

### Symptoms
- Session memory not persisting
- Rate limiting disabled (or failing closed)
- Logs show "Redis connection refused"

### Immediate actions

#### 10.1 Check Redis pod

```bash
kubectl get pods -n dayjoy-voice-ai -l app=redis
kubectl logs -n dayjoy-voice-ai -l app=redis --tail=100
```

#### 10.2 Check Redis memory

```bash
kubectl exec -it deployment/redis -n dayjoy-voice-ai -- \
  redis-cli info memory
```

If `used_memory > maxmemory`, Redis is evicting keys (which is
expected with `allkeys-lru` policy). If evictions are too aggressive,
increase the memory limit.

#### 10.3 Restart Redis (if crashed)

```bash
kubectl delete pod -l app=redis -n dayjoy-voice-ai
```

Redis will restart with AOF recovery — sessions will be restored
from the append-only file.

### Impact assessment

- **Inbound calls:** Will still work (Vapi doesn't depend on Redis),
  but session memory won't persist between webhook events. The AI
  may repeat itself or lose context.
- **Outbound calls:** Will work.
- **Rate limiting:** Will fail open (allow all requests) — this is a
  security risk if the outage lasts long.

### Post-incident
- [ ] Document the root cause
- [ ] Consider Redis Cluster (HA) if outages are recurring

---

## 11. Incident Response Runbook

### Severity levels

| Severity | Impact | Response time | Example |
|----------|--------|---------------|---------|
| **SEV-1** | Total outage | 5 min | Vapi down, no calls working |
| **SEV-2** | Major degradation | 15 min | 30%+ call failure rate |
| **SEV-3** | Minor degradation | 1 hour | Latency p95 > 3s but calls work |
| **SEV-4** | Cosmetic / Nuisance | 1 business day | Dashboard typo |

### Incident commander

For SEV-1 and SEV-2, an **incident commander (IC)** is assigned.
The IC:
1. Coordinates the response
2. Is the single point of communication with stakeholders
3. Documents the timeline
4. Calls the post-mortem

### Communication channels

- **Engineering:** `#voice-ai-incidents` (Slack)
- **Stakeholders:** `#voice-ai-status` (Slack)
- **Customer comms:** Coordinate with PR + support team
- **Status page:** Update https://status.dayjoy.ai

### Post-mortem (within 48 hours)

Use the blameless post-mortem template:

```markdown
# Post-Mortem: <incident-name>

## Summary
<1-2 paragraph summary>

## Timeline
- HH:MM UTC — Alert fired
- HH:MM UTC — On-call engaged
- HH:MM UTC — Root cause identified
- HH:MM UTC — Mitigation applied
- HH:MM UTC — Service restored

## Root Cause
<technical explanation>

## Impact
- Duration: <X minutes>
- Customers affected: <Y>
- Calls missed: <Z>
- Revenue impact: <$>

## What went well
- <thing 1>
- <thing 2>

## What went wrong
- <thing 1>
- <thing 2>

## Action items
- [ ] <action 1> (owner: @name, due: date)
- [ ] <action 2> (owner: @name, due: date)
```

---

## 12. Monitoring Runbook

### Daily checks (5 minutes)

1. **Grafana "Voice AI Overview"** — verify all panels green
2. **Sentry** — no unresolved errors
3. **Slack `#voice-ai-alerts`** — review overnight alerts
4. **Vapi dashboard** — call volume matches forecast

### Weekly checks (30 minutes)

1. **QA accuracy report** — review the 5% call sample
2. **Cost report** — verify cost per call is within budget
3. **Escalation review** — read 5 escalated call transcripts to spot AI weaknesses
4. **Capacity planning** — review HPA events; is the fleet scaling appropriately?

### Monthly checks (2 hours)

1. **Disaster recovery drill** — restore DB backup to staging; verify
2. **Load test** — run `vapi/tests/vapi-load-tests.ts` against staging
3. **Security review** — rotate webhook secret; review access logs
4. **Documentation review** — update runbooks if procedures changed

### Alert routing

| Alert | Routes to | Page? |
|-------|-----------|-------|
| `VoiceAIHighErrorRate` | PagerDuty: voice-ai-oncall | ✅ |
| `VoiceAIHighLatency` | PagerDuty: voice-ai-oncall | ✅ |
| `VoiceAIPodRestart` | Slack: #voice-ai-alerts | ❌ |
| `VoiceAIPodNotReady` | PagerDuty: voice-ai-oncall | ✅ |
| `VoiceAILowAccuracy` | Slack: #voice-ai-alerts | ❌ (business hours) |
| `VoiceAIEscalationQueueOverflow` | PagerDuty: voice-ai-oncall | ✅ |
| `VoiceAIWebhookSignatureFailures` | PagerDuty: voice-ai-oncall | ✅ |
| `Redis unavailable` | PagerDuty: voice-ai-oncall | ✅ |
| `DB connection pool exhausted` | PagerDuty: voice-ai-oncall | ✅ |

---

## On-call resources

- **Runbook:** this file (`vapi/docs/vapi-runbooks.md`)
- **Troubleshooting:** `vapi/docs/vapi-troubleshooting-guide.md`
- **Production checklist:** `vapi/deployment/vapi-production-checklist.md`
- **Vapi dashboard:** https://dashboard.vapi.ai
- **Vapi status:** https://status.vapi.ai
- **Vapi support:** support@vapi.ai
- **Internal Slack:** `#voice-ai-oncall`, `#voice-ai-help`
- **PagerDuty:** schedule `voice-ai-oncall`

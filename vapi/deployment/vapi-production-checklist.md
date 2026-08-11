# Vapi Voice AI — Production Checklist

> **Use this checklist for every production deployment.** Every box must
> be checked (or explicitly N/A'd with a justification) before promoting
> a release to production. The checklist is split into Pre-Deployment
> (must pass before traffic is allowed), Post-Deployment smoke tests
> (must pass within 15 minutes of go-live), and 24-hour monitoring
> windows.
>
> **Version:** 2.0.0  •  **Last updated:** 2025-01  •  **Owner:** Voice AI Platform Team

---

## 1. Pre-Deployment

### 1.1 Vapi Configuration

- [ ] Vapi account created at https://dashboard.vapi.ai
- [ ] API key generated and stored in AWS Secrets Manager (key: `vapi/api-key`)
- [ ] Webhook secret generated and stored in AWS Secrets Manager (key: `vapi/webhook-secret`)
- [ ] Assistant created in Vapi dashboard (or via `POST /api/voice/assistants`)
- [ ] Webhook URL configured in Vapi: `https://api.dayjoy.ai/api/voice/webhook`
- [ ] Webhook events subscribed: `call.started`, `call.ended`, `call.transcript`, `function-call`
- [ ] Phone number purchased or ported in Vapi
- [ ] Test inbound call answered by the assistant
- [ ] Test outbound call initiated via `POST /api/voice/calls`
- [ ] Voice ID configured (`rachel` or approved equivalent)
- [ ] Model configured (`gpt-4o` with temperature 0.7)
- [ ] First message reviewed and approved by Product
- [ ] End-call phrases configured (`goodbye`, `that's all`, etc.)
- [ ] Silence timeout set to 30 seconds
- [ ] Max call duration set to 1800 seconds (30 minutes)

### 1.2 Backend Application

- [ ] `VAPI_API_KEY` env var set (resolved from Secrets Manager via ExternalSecret)
- [ ] `VAPI_WEBHOOK_SECRET` env var set (resolved from Secrets Manager)
- [ ] `VAPI_ASSISTANT_ID` env var set
- [ ] `VAPI_WEBHOOK_URL` env var set to `https://api.dayjoy.ai/api/voice/webhook`
- [ ] Voice AI service deployed and `/health/ready` returns 200
- [ ] Webhook endpoint reachable from public internet (test from outside VPC)
- [ ] HMAC signature verification tested with both valid AND invalid signatures
- [ ] HMAC signature verification tested with stale timestamp (> 5 min) — must reject
- [ ] Redis available for session memory (`REDIS_URL` reachable)
- [ ] Database migrations applied (`voice_sessions`, `voice_transcripts`, `voice_analytics`, `tool_executions` tables)
- [ ] OpenAI API key set (`OPENAI_API_KEY`)
- [ ] RAG service reachable (`RAG_SERVICE_URL`)

### 1.3 Database

- [ ] `voice_sessions` table exists with indexes on `tenant_id`, `call_id`, `customer_id`, `status`, `started_at`
- [ ] `voice_transcripts` table exists with indexes on `session_id`, `tenant_id`, `timestamp`
- [ ] `voice_analytics` table exists with indexes on `session_id`, `tenant_id`, `sentiment`, `resolution`, `created_at`
- [ ] `tool_executions` table exists with indexes on `session_id`, `tenant_id`, `tool_name`, `created_at`
- [ ] Row-Level Security (RLS) policies enabled on all voice tables — tenant isolation enforced
- [ ] pgvector extension installed (for embeddings column on knowledge chunks)
- [ ] Connection pool size set to ≥ 20 (`DATABASE_POOL_SIZE=20`)
- [ ] Backup strategy configured (daily snapshots + WAL archiving)
- [ ] Restore tested at least once in the last 30 days

### 1.4 RAG (Knowledge Base)

- [ ] Knowledge base ingested: products catalog, return policy, shipping policy, FAQ
- [ ] Knowledge base ingested: compensation plan documents
- [ ] Knowledge base ingested: distributor onboarding guide
- [ ] `search_knowledge` tool tested with at least 20 representative queries
- [ ] Response latency < 3 seconds p95 for RAG queries
- [ ] Citations returned for every successful query
- [ ] Hallucination spot-check: AI response is grounded in retrieved context
- [ ] Empty-result case returns graceful "I couldn't find…" response (not a crash)

### 1.5 Tools (Function Calling)

Each tool must be tested end-to-end via the webhook pipeline:

- [ ] `search_knowledge` — executes and returns citations
- [ ] `search_products` — returns product list with price + benefits
- [ ] `customer_lookup` — looks up by phone, email, or order number
- [ ] `distributor_lookup` — looks up by distributor code
- [ ] `lead_capture` — creates lead row in DB
- [ ] `appointment_booking` — creates appointment row in DB
- [ ] `create_support_ticket` — creates ticket row in DB
- [ ] `human_transfer` — triggers call transfer to human agent

### 1.6 Conversation Flows

Each flow must be tested with at least 2 test scenarios (happy + edge):

- [ ] Customer Support Flow — complaint → ticket creation
- [ ] Customer Support Flow — frustrated customer → escalation
- [ ] Product Inquiry Flow — product question → search → present
- [ ] Product Inquiry Flow — price question → search → present
- [ ] Business Opportunity Flow — explain → qualify → capture lead
- [ ] Business Opportunity Flow — explain → schedule appointment
- [ ] Appointment Booking Flow — collect date/time → book
- [ ] Lead Collection Flow — collect info → create lead
- [ ] Human Escalation Flow — summarise → transfer
- [ ] Human Escalation Flow — abusive customer → transfer

### 1.7 Memory System

- [ ] Session memory initializes on `call.started`
- [ ] Conversation history persists across webhook events within a call
- [ ] Customer profile loads on call start (returning customer recognised)
- [ ] Session memory clears on `call.ended`
- [ ] Memory statistics endpoint returns correct counts

### 1.8 Monitoring

- [ ] Prometheus scraping `/metrics` (ServiceMonitor deployed)
- [ ] Grafana dashboard "Voice AI Overview" imported and visible
- [ ] Grafana dashboard "Voice AI Tools" imported and visible
- [ ] Grafana dashboard "Voice AI Quality" imported and visible
- [ ] Alerts configured:
  - [ ] High call failure rate (> 5% over 5 min)
  - [ ] High webhook latency (p95 > 2 sec over 5 min)
  - [ ] Low AI accuracy (< 80% over 1 hour)
  - [ ] High hallucination rate (> 5% over 1 hour)
  - [ ] Vapi API errors (any 5xx from Vapi over 5 min)
  - [ ] Redis unavailable
  - [ ] Database connection pool exhausted
  - [ ] Pod restart count > 3 in 1 hour
- [ ] Sentry DSN configured (`SENTRY_DSN`)
- [ ] Log aggregation (Loki or CloudWatch) ingesting application logs
- [ ] Log retention set to 30 days minimum

### 1.9 Security

- [ ] Webhook signature verification is UNCONDITIONAL in production (no bypass)
- [ ] `NODE_ENV=production` — never `development` in prod
- [ ] Rate limiting on webhook endpoint (`RATE_LIMIT_WEBHOOK_MAX=1000` per minute)
- [ ] Phone number validation on `POST /api/voice/calls`
- [ ] PII redaction in logs (phone numbers, emails, customer names)
- [ ] Call recordings encrypted at rest (KMS-managed key)
- [ ] Database connections encrypted (TLS required)
- [ ] Redis connections encrypted (TLS required)
- [ ] All secrets sourced from AWS Secrets Manager via ExternalSecrets (NOT plaintext K8s Secrets)
- [ ] Container runs as non-root user (UID 1001)
- [ ] NetworkPolicy restricts ingress to voice-ai pods from nginx-ingress + monitoring only
- [ ] CORS configured to allow only approved origins

### 1.10 Testing

- [ ] All unit tests passing (`vitest run vapi/tests/vapi-tool-tests.ts vapi/tests/vapi-flow-tests.ts vapi/tests/vapi-memory-tests.ts vapi/tests/vapi-webhook-tests.ts`)
- [ ] All integration tests passing (`vitest run vapi/tests/vapi-rag-integration-tests.ts`)
- [ ] E2E test call successful (`vitest run vapi/tests/vapi-e2e-tests.ts`)
- [ ] Load test passed (100 concurrent calls — `vitest run vapi/tests/vapi-load-tests.ts`)
- [ ] Voice test cases all pass (`vitest run vapi/tests/vapi-voice-test-cases.ts`)
- [ ] Failover test passed: kill a pod, verify in-flight calls continue
- [ ] Manual smoke test call placed and answered
- [ ] Manual escalation test: AI transfers to human successfully

### 1.11 Documentation

- [ ] `vapi/docs/vapi-README.md` reviewed
- [ ] `vapi/docs/vapi-api-documentation.md` reviewed
- [ ] `vapi/docs/vapi-runbooks.md` reviewed by on-call engineer
- [ ] `vapi/docs/vapi-troubleshooting-guide.md` reviewed by on-call engineer
- [ ] `vapi/docs/vapi-architecture.md` reviewed
- [ ] `vapi/docs/vapi-monitoring-checklist.md` reviewed
- [ ] `vapi/docs/vapi-user-guide.md` reviewed by Product

---

## 2. Deployment Steps

### 2.1 Pre-Flight

```bash
# 1. Backup database
pg_dump -h $DB_HOST -U $DB_USER dayjoy_ai > backup-$(date +%Y%m%d-%H%M%S).sql

# 2. Tag the release in Git
git tag -a v$(date +%Y%m%d-%H%M%S) -m "Production deploy"

# 3. Confirm the image is in the registry
docker pull dayjoy/voice-ai:$IMAGE_TAG
```

### 2.2 Deploy

```bash
# Kubernetes (preferred)
kubectl set image deployment/voice-ai voice-ai=dayjoy/voice-ai:$IMAGE_TAG -n dayjoy-voice-ai
kubectl rollout status deployment/voice-ai -n dayjoy-voice-ai --timeout=300s

# Or Docker Compose (staging only)
docker-compose -f vapi/deployment/vapi-docker-config.yml up -d voice-ai
```

### 2.3 Run Migrations (if any)

```bash
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- pnpm prisma migrate deploy
```

### 2.4 Verify Deployment

```bash
# Pods running
kubectl get pods -n dayjoy-voice-ai -l app=voice-ai

# Health check
curl -f https://api.dayjoy.ai/health/ready

# Recent logs — no ERROR spikes
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=200 | grep -i error
```

---

## 3. Post-Deployment Smoke Tests (within 15 minutes)

### 3.1 Functional Smoke Tests

- [ ] Inbound test call answered within 5 seconds
- [ ] AI responds to "What products do you have?" with product list
- [ ] `search_knowledge` tool executes (visible in logs + `tool_executions` table)
- [ ] `search_products` tool executes (visible in `tool_executions` table)
- [ ] Call ends gracefully when caller says "goodbye"
- [ ] VoiceSession row created in DB with `status=ended`
- [ ] VoiceTranscript rows created (≥ 2 messages)
- [ ] VoiceAnalytics row created with `callDuration > 0`
- [ ] Recording URL populated (if recording enabled)

### 3.2 Outbound Call Test

- [ ] `POST /api/voice/calls` returns 201 with call ID
- [ ] Outbound call connects within 30 seconds
- [ ] VoiceSession row created with `direction=outbound`

### 3.3 Escalation Test

- [ ] Caller says "let me speak to a human"
- [ ] AI triggers `human_transfer` tool
- [ ] Call transferred to human queue
- [ ] Transfer logged in `tool_executions` table

---

## 4. First 24 Hours — Monitoring Window

### 4.1 Hourly Checks (first 4 hours)

- [ ] Grafana "Voice AI Overview" dashboard — no error spikes
- [ ] Avg call latency < 3 seconds
- [ ] AI accuracy > 80% (from quality dashboard)
- [ ] Call success rate > 90%
- [ ] No Sentry errors above baseline
- [ ] No pod restarts

### 4.2 4-Hour Checks

- [ ] Review escalated calls — were they appropriate escalations?
- [ ] Review failed calls — root cause documented for each
- [ ] Check Redis memory usage < 80% of limit
- [ ] Check DB connection pool — no saturation events

### 4.3 24-Hour Review

- [ ] Daily call volume matches forecast ± 20%
- [ ] Avg call duration within expected range (60-300 seconds)
- [ ] Tool success rate > 95%
- [ ] RAG query success rate > 95%
- [ ] Customer satisfaction (post-call survey) > 4.0 / 5
- [ ] No PII leaked in logs (run PII scanner on log sample)
- [ ] Cost per call within budget

---

## 5. Rollback Plan

### 5.1 Triggers (rollback if ANY of these occur)

- Error rate > 5% sustained for 5 minutes
- Call failure rate > 10%
- AI accuracy drops below 70%
- Webhook latency p95 > 5 seconds
- Critical bug discovered (data loss, security breach, PII exposure)
- Vapi integration broken (calls not connecting)

### 5.2 Rollback Steps

```bash
# 1. Pause auto-scaling
kubectl scale deployment/voice-ai --replicas=2 -n dayjoy-voice-ai

# 2. Rollback to previous image
kubectl rollout undo deployment/voice-ai -n dayjoy-voice-ai

# 3. Watch rollback
kubectl rollout status deployment/voice-ai -n dayjoy-voice-ai

# 4. Verify health
curl -f https://api.dayjoy.ai/health/ready

# 5. (If DB migration issue) Roll back the migration
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- pnpm prisma migrate resolve --rolled-back <migration_name>
```

### 5.3 Post-Rollback

- [ ] Confirm all pods running previous version
- [ ] Confirm health checks passing
- [ ] Place test call — verify functionality
- [ ] Document incident in `INCIDENTS.md`
- [ ] Schedule blameless post-mortem within 48 hours

---

## 6. On-Call Resources

- [ ] Runbook (`vapi/docs/vapi-runbooks.md`) bookmarked
- [ ] Vapi dashboard access (https://dashboard.vapi.ai) — verify login
- [ ] AWS console access — verify can view Secrets Manager, CloudWatch
- [ ] Grafana dashboard access — verify can view Voice AI dashboards
- [ ] PagerDuty schedule set for Voice AI on-call rotation
- [ ] Escalation contacts in Slack channel `#voice-ai-oncall`
- [ ] Vapi support contact (account manager + support@vapi.ai)
- [ ] Dayjoy business escalation contact (for high-priority customer issues)

---

## 7. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Deploying engineer | | | |
| On-call engineer | | | |
| Product owner | | | |
| Security reviewer | | | |

---

**Status:** Ready for deployment
**Version:** 2.0.0
**Last Updated:** 2025-01
**Next Review:** 2025-04

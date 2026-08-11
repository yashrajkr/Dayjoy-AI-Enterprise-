# Dayjoy AI Enterprise — Production Runbook

> **Audience:** DevOps engineers, SRE on-call, release captains.
> **Scope:** End-to-end production-readiness procedure for the Dayjoy AI
> Enterprise platform — NestJS backend, Next.js portals, PostgreSQL + pgvector,
> Redis, RAG pipeline, Vapi voice, WhatsApp Business Cloud API, website chat
> widget, n8n automation, Kubernetes deployment.
> **Status:** Source of truth for all production launches. Update this document
> whenever a step is added, removed, or its acceptance criteria change.

---

## 0. How to use this runbook

This runbook describes the **22-step production-readiness procedure** that takes
the Dayjoy AI platform from a fresh `git clone` all the way to a verified,
SLO-meeting production deployment. Each step has a corresponding executable
script in `scripts/production/step-NN-*.sh`. The orchestrator
`scripts/production/setup-all.sh` runs them in order and tracks progress in
`scripts/production/.progress`.

There are three ways to consume this document:

1. **As a tutorial** — read top-to-bottom the first time you onboard.
2. **As a checklist** — every step has explicit *Acceptance criteria*; tick them
   off as you verify.
3. **As an incident reference** — the *Rollback procedures* and *Emergency
   contacts* sections at the bottom cover break-glass actions.

A core mental model that runs throughout this document is the distinction
between **three levels of "done"**:

| Level | Meaning | Example |
|-------|---------|---------|
| **Code exists** | The feature is implemented and merges without errors. | `vapi/webhooks/vapi-webhook-controller.ts` is on `main`. |
| **Integration works** | The feature connects to its external dependency in a non-prod environment and produces the expected output. | A test Vapi call hits the webhook and the lead appears in the `leads` table. |
| **Production verified** | The feature has been exercised against the real production environment by real users, with monitoring and SLOs in place, for at least 7 consecutive days. | Voice calls from paying customers have a 92%+ AI accuracy and < 500 ms p95 latency for 7 days. |

Most production incidents happen because teams conflate these three levels.
**A merged PR is not "done". A green CI build is not "done". A passing staging
smoke test is not "done".** Only the third row — *production verified* — counts
as "done" for a feature flagged for GA.

---

## 1. Pre-flight inventory

Before you run `setup-all.sh`, you must have the following. Anything missing
will block one or more steps; collect it all up-front to avoid mid-run
interruptions.

### 1.1 Workstation prerequisites

| Tool | Minimum version | Verify |
|------|-----------------|--------|
| Node.js | 22.x | `node --version` |
| pnpm | 8.15+ | `pnpm --version` |
| Python | 3.12+ | `python3 --version` |
| Docker | 24+ | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |
| kubectl | 1.28+ | `kubectl version --client` |
| Helm | 3.13+ | `helm version` |
| AWS CLI v2 | latest | `aws --version` |
| jq | 1.6+ | `jq --version` |
| curl | any | `curl --version` |

Install any missing tools before starting. On macOS: `brew install node pnpm
python@3.12 docker kubectl helm awscli jq curl`. On Linux: use your package
manager or the official install scripts.

### 1.2 Credentials and accounts

You need login access to every one of these services. Collect the credentials
*before* you start, not during:

- **GitHub** — write access to the dayjoy-ai-enterprise repo
- **AWS** — IAM user or role with `eks:*`, `ec2:*`, `rds:*`, `elasticache:*`,
  `route53:*`, `secretsmanager:*`, `s3:*`, `inspector2:*` permissions
- **OpenAI** — API key starting with `sk-`, billing configured, GPT-4o and
  `text-embedding-3-small` enabled
- **Vapi** — dashboard access at https://dashboard.vapi.ai, REST API key
- **Meta for Developers** — WhatsApp Business Cloud API app, System User token
  with `whatsapp_business_messaging` permission
- **Twilio** — Account SID + Auth Token + a purchased phone number (for SMS
  fallback)
- **SendGrid or AWS SES** — SMTP credentials (SendGrid: `apikey` username)
- **Firebase** — project with Cloud Messaging enabled (FCM push)
- **Google Cloud** — OAuth client ID/secret for Calendar API
- **Stripe / Razorpay** — only if collecting payments at launch
- **Sentry** — organization + project DSN
- **PagerDuty** — service ID for S0/S1 alert routing
- **Domain registrar / Route 53** — ability to edit DNS for `dayjoy.ai`,
  `api.dayjoy.ai`, `chat.dayjoy.ai`, `admin.dayjoy.ai`, `customer.dayjoy.ai`,
  `distributor.dayjoy.ai`, `employee.dayjoy.ai`

### 1.3 Infrastructure

The production Terraform stack (`deployment/terraform/environments/production/`)
must already be applied. Verify:

```bash
cd deployment/terraform/environments/production
terraform plan -detailed-exitcode   # exit code 0 = no drift
```

You should have:

- EKS cluster (1.28+) with node groups in 2+ AZs
- RDS PostgreSQL 15 with the `pgvector` extension pre-installed
- ElastiCache Redis 7
- S3 buckets: `dayjoy-ai-uploads`, `dayjoy-ai-backups`
- ALB with HTTPS listener + ACM certificate
- Route 53 hosted zone for `dayjoy.ai`
- KMS key for field-level encryption
- Secrets Manager secret `dayjoy/prod` containing all `.env` values

### 1.4 The `.env` file

Copy `.env.production.template` to `.env` and fill in every placeholder. Then
validate with step 01:

```bash
cp .env.production.template .env
$EDITOR .env                # fill in real values
bash scripts/production/step-01-environment.sh
```

The step 01 script will not let you proceed until every *critical* variable
(JWT_SECRET, ENCRYPTION_KEY, OPENAI_API_KEY, DATABASE_URL, REDIS_URL) passes
validation.

---

## 2. The 22 steps

For each step we describe: **goal**, **commands to run**, **expected output**,
**common failures**, and **acceptance criteria**.

### Step 01 — Environment Validation

**Goal:** guarantee the `.env` file at the project root has every
security-critical variable set to a real value before any infrastructure is
touched.

**Commands:**

```bash
bash scripts/production/step-01-environment.sh
```

**Expected output:** a green/red/yellow checklist, then
`✅ Step 1 complete` with `Errors: 0`.

**Common failures:**

- `JWT_SECRET is still the placeholder` — you forgot to generate a real secret.
  Fix: `sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env`
- `OPENAI_API_KEY must start with 'sk-'` — your key has whitespace or is from
  the wrong organization. Strip whitespace and verify at
  https://platform.openai.com/api-keys.
- `ENCRYPTION_KEY must be 64 hex chars` — regenerate with
  `openssl rand -hex 32`.

**Acceptance criteria:** Errors = 0. Warnings are allowed if you understand
them (e.g. you intentionally skip the WhatsApp channel).

---

### Step 02 — Infrastructure (Postgres + Redis + MinIO)

**Goal:** stand up the local Docker infrastructure and verify it is healthy.

**Commands:**

```bash
bash scripts/production/step-02-infrastructure.sh
```

**Expected output:** `docker compose up -d` for postgres/redis/(minio), then a
health-poll loop, then `pgvector extension 'vector' is installed`, then
`Redis responded PONG`, then `✅ Step 2 complete`.

**Common failures:**

- `dayjoy-postgres did not become healthy within 120s` — usually a stale volume
  from a previous incompatible Postgres major version. Fix:
  `docker compose down -v && docker compose up -d postgres redis`.
- `could not create pgvector extension` — you're using plain `postgres:15`
  instead of `pgvector/pgvector:pg15`. Edit `docker-compose.yml` and re-run.
- Port 5432/6379 already in use by a host-installed Postgres/Redis. Stop the
  host service or change the port mapping.

**Acceptance criteria:** all three containers report `healthy`, pgvector
extension exists, Redis PING returns PONG.

---

### Step 03 — Database Migrations + Seed

**Goal:** apply all SQL migrations in numeric order, generate the Prisma
client, run the seed, verify SUPER_ADMIN exists, and capture the seeded
`DEFAULT_TENANT_ID`.

**Commands:**

```bash
bash scripts/production/step-03-database.sh
```

**Expected output:** each numbered SQL file in `database/migrations/` is
applied (001 through 014), triggers/functions/views applied, Prisma client
generated, seed runs, SUPER_ADMIN count > 0, and a banner prints the
`DEFAULT_TENANT_ID` UUID (and writes it into `.env` automatically if blank).

**Common failures:**

- `migration 0XX failed completely` — usually because an earlier migration
  created an object that a later one tries to recreate without `IF NOT EXISTS`.
  Diagnose: `docker exec -it dayjoy-postgres psql -U dayjoy -d dayjoy_ai -f
  database/migrations/0XX_*.sql` and read the error.
- `pnpm db:seed` exits non-zero — almost always because the OpenAI embeddings
  call failed during seed (rate limit, bad key). Verify `OPENAI_API_KEY` works
  with `curl https://api.openai.com/v1/models -H "Authorization: Bearer $KEY"`.
- `no SUPER_ADMIN user found after seed` — inspect
  `database/seed/seed.ts`; the seed may have a feature flag that needs to be
  enabled.

**Acceptance criteria:** 14 migrations applied, Prisma client generated,
SUPER_ADMIN present, `DEFAULT_TENANT_ID` printed and persisted.

---

### Step 04 — Backend Startup + Auth Smoke Test

**Goal:** start the NestJS backend, verify `/health` returns `success:true`,
and confirm login works with the default SUPER_ADMIN credentials.

**Commands:**

```bash
bash scripts/production/step-04-backend.sh
```

**Expected output:** backend PID logged, port 3000 accepts connections,
`/health` JSON contains `"success":true`, login returns an `accessToken`,
token cached to `.admin-token` for use by later steps.

**Common failures:**

- `backend did not bind :3000 within 90s` — check `.backend.log` for stack
  traces. Most common cause: a missing required env var that the config schema
  rejects.
- `/health did not return success:true` — usually because a downstream
  (database or Redis) is not reachable from the backend process. The health
  endpoint reports per-dependency status; read the JSON.
- `login did not return an accessToken` — credentials mismatch. If you rotated
  the SUPER_ADMIN password, set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`
  in `.env`.

**Acceptance criteria:** `/health` 200 + `success:true`; access token acquired
and cached.

---

### Step 05 — RAG Ingest + Retrieval Smoke Test

**Goal:** ingest the knowledge base into `rag_chunks`, verify ≥ 1500 rows,
issue a test query, and assert the top chunk similarity > 0.7.

**Commands:**

```bash
bash scripts/production/step-05-rag.sh
```

**Expected output:** ingest runs (may take several minutes — it makes OpenAI
embedding API calls per chunk), row count printed, test query returns chunks
with similarity > 0.7.

**Common failures:**

- `rag_chunks only has N rows (need >= 1500)` — ingest was interrupted. Check
  for OpenAI rate-limit 429 responses in stdout; consider chunking the ingest
  with `--batch-size 100` and `--rate-limit 50`.
- `best similarity 0.42 is below 0.7 threshold` — usually means pgvector index
  wasn't built. Verify:
  `docker exec dayjoy-postgres psql -U dayjoy -d dayjoy_ai -c "\di rag_chunks"`
  should show an `ivfflat` or `hnsw` index on the embedding column.

**Acceptance criteria:** ≥ 1500 rows in `rag_chunks`; top similarity > 0.7 on a
representative query.

---

### Step 06 — AI Conversation + Tool Call

**Goal:** create a conversation, send a message that triggers a tool call,
verify the response references the tool result, and confirm token usage is
logged.

**Commands:**

```bash
bash scripts/production/step-06-ai.sh
```

**Expected output:** new conversation created, message sent, response contains
return-policy content (proving the tool executed), `ai_usage_events` (or
`ai_messages`) row count > 0 for the new conversation.

**Common failures:**

- `no token usage record found` — the AI service isn't persisting usage. Check
  `backend/ai/ai.service.ts` writes to the table configured in
  `database/migrations/006_ai.sql`.
- Tool didn't fire — the test message may not have matched the tool trigger
  pattern. Inspect the assistant's tool registry in
  `backend/ai/tools.service.ts`.

**Acceptance criteria:** response references tool output; token usage row
exists.

---

### Step 07 — Vapi Voice AI Integration

**Goal:** if `VAPI_API_KEY` is set, create (or reuse) a Vapi assistant and
register the webhook URL; otherwise print setup instructions and exit 0.

**Commands:**

```bash
bash scripts/production/step-07-vapi.sh
```

**Expected output:** either a graceful skip with setup instructions, or a new
assistant created with its ID persisted to `.env`, plus the configured webhook
URL and phone number printed.

**Common failures:**

- HTTP 401 from Vapi — token expired or wrong dashboard. Re-issue from
  https://dashboard.vapi.ai.
- HTTP 429 — Vapi rate limit; wait and retry.

**Acceptance criteria:** assistant ID present in `.env`; webhook URL printed
for manual dashboard configuration.

---

### Step 08 — WhatsApp Business Cloud API

**Goal:** if `WHATSAPP_TOKEN` is set, verify webhook subscription, send a test
message, and poll delivery; otherwise print setup instructions and exit 0.

**Commands:**

```bash
bash scripts/production/step-08-whatsapp.sh
```

**Expected output:** subscription endpoint reachable, test message `wamid`
returned, delivery polled for up to 60 s.

**Common failures:**

- `(#100) invalid phone number` — recipient not in E.164 format or has not
  opted in to your business.
- `(#10) permission denied` — your token lacks
  `whatsapp_business_messaging`. Re-issue as a System User token.

**Acceptance criteria:** message accepted; delivered or at least sent.

---

### Step 09 — Website Chat Widget

**Goal:** build `apps/website-chat`, generate the embed snippet, print it for
the marketing team, and smoke-test the widget loads on a test page.

**Commands:**

```bash
bash scripts/production/step-09-website.sh
```

**Expected output:** build succeeds, snippet printed to stdout and saved to
`.website-chat-snippet.html`, headless smoke test confirms a 200 from the
widget page.

**Acceptance criteria:** snippet file created; smoke HTTP 200.

---

### Steps 10–12 — Customer / Distributor / Employee Portals

**Goal:** for each portal, build it, boot it, log in with the appropriate
seeded role, and verify the key view loads.

**Commands:**

```bash
bash scripts/production/step-10-customer-portal.sh
bash scripts/production/step-11-distributor-portal.sh
bash scripts/production/step-12-employee-portal.sh
```

**Expected output per step:** build OK, port bound, login succeeds (token
acquired), key view returns 200/302.

**Common failures:**

- Build fails with "Cannot find module @dayjoy/shared" — run `pnpm install`
  at the repo root and re-run.
- Login returns 401 — the seeded test user for that role isn't in the DB.
  Inspect `database/seed/seed.ts` and add the missing user, or override via
  `CUSTOMER_TEST_EMAIL` / `DISTRIBUTOR_TEST_EMAIL` / `EMPLOYEE_TEST_EMAIL`.

**Acceptance criteria:** all 3 portals build and pass their login + view check.

---

### Step 13 — Admin Dashboard

**Goal:** build `apps/admin-dashboard`, smoke-test all 13 first-class views,
verify the ⌘K command palette is bundled, and confirm an admin action creates
an audit-log entry.

**Commands:**

```bash
bash scripts/production/step-13-admin-dashboard.sh
```

**Expected output:** build OK, 13/13 views return 200/302, command palette
marker found in the bundle, audit log grew after an admin GET request.

**Acceptance criteria:** 13/13 views pass; ⌘K marker present; audit log
captures at least one new entry.

---

### Step 14 — n8n Automation

**Goal:** deploy n8n via its docker-compose, import 8 reference workflows, and
verify the Lead Capture workflow fires on a test webhook.

**Commands:**

```bash
bash scripts/production/step-14-n8n.sh
```

**Expected output:** n8n container healthy on :5678, 8 workflows imported, test
webhook fired, lead row created in `leads`.

**Common failures:**

- Import fails with "workflow already exists" — non-fatal; n8n updates in
  place.
- Webhook returns empty — the workflow is inactive. Activate it in the n8n UI
  (the script attempts `n8n update:workflow --all --active=true`).

**Acceptance criteria:** ≥ 1 webhook fired and lead row in DB (or warning if
async).

---

### Step 15 — Notifications

**Goal:** verify SMTP, Twilio SMS, FCM push, and Google Calendar integrations,
sending one test message per configured channel.

**Commands:**

```bash
bash scripts/production/step-15-notifications.sh
```

**Expected output:** for each channel, either a green check (sent/queued) or a
yellow warning (skipped — credentials missing). At least one channel must
succeed.

**Acceptance criteria:** ≥ 1 of 4 channels verified; 0 critical failures.

---

### Step 16 — Monitoring (Prometheus + Grafana + Sentry)

**Goal:** deploy Prometheus/Grafana/Loki, verify `/metrics` is scraped,
provision 4 dashboards, configure Sentry DSN, and submit a test error event.

**Commands:**

```bash
bash scripts/production/step-16-monitoring.sh
```

**Expected output:** Prometheus ready on :9090, Grafana on :3030, `/metrics`
exposes Prometheus format, at least one target up, dashboards listed, Sentry
test event submitted (or graceful skip if DSN unset).

**Acceptance criteria:** Prometheus scrapes backend; Sentry test event
accepted (or skipped with DSN missing).

---

### Step 17 — Security Hardening

**Goal:** run 5 security checks: RDS SG not 0.0.0.0/0, no plain K8s Secret
manifests, JTI blocklist enforces logout, Snyk clean, AWS Inspector clean.

**Commands:**

```bash
bash scripts/production/step-17-security.sh
```

**Expected output:** per-check pass/crit/soft tally; final summary with
critical vs soft failure counts.

**Common failures:**

- `JTI blocklist not enforced (pre=200, post=200)` — `JwtBlocklistService` is
  not wired into the JWT strategy. Check `backend/auth/strategies/jwt.strategy.ts`
  and `backend/_shared/security/jwt-blocklist.service.ts`.
- Snyk reports High — fix the package or add a `snyk` ignore with an expiry and
  a ticket link.

**Acceptance criteria:** 0 critical failures. Soft failures (tools not
installed) are allowed but should be remediated before launch.

---

### Step 18 — Testing (unit/integration/e2e/load)

**Goal:** run the full test pyramid and assert coverage ≥ 80% and p95
latency < 500 ms.

**Commands:**

```bash
bash scripts/production/step-18-testing.sh
```

**Expected output:** unit/integration tests pass, coverage line printed,
Playwright e2e passes, load test runs, p95 latency printed.

**Common failures:**

- `coverage N% is below 80%` — add tests or generate the coverage report with
  `vitest run --coverage`.
- `p95 720ms exceeds 500ms budget` — profile the slow endpoint; usually a
  missing DB index or N+1 query. Check `database/migrations/012_indexes.sql`.

**Acceptance criteria:** all tests green; coverage ≥ 80%; p95 < 500 ms.

---

### Step 19 — Staging Deployment

**Goal:** deploy the Helm chart to the staging EKS cluster, wait for all pods
Ready, verify ingress + TLS, and assert public `/health` returns 200.

**Commands:**

```bash
bash scripts/production/step-19-staging.sh
```

**Expected output:** helm release installed, pods Ready, certificate Ready,
public `https://staging.dayjoy.ai/health` returns 200.

**Common failures:**

- Pods CrashLoopBackOff — `kubectl describe pod` and check events. Most often
  a missing ExternalSecret or wrong image tag.
- Certificate not Ready — cert-manager can't solve the HTTP-01 challenge. Verify
  the ingress hostname resolves to the ALB.

**Acceptance criteria:** all pods Ready; public `/health` 200.

---

### Step 20 — Pilot Plan (human-driven)

**Goal:** this step is intentionally non-automated. It writes a 7-day pilot
plan to `.pilot-plan.md` for the on-call operator to execute manually.

**Commands:**

```bash
bash scripts/production/step-20-pilot.sh
```

**Expected output:** the plan is written and a summary printed.

**Acceptance criteria:** plan file exists; operator has read it and
acknowledged in the team chat.

---

### Step 21 — Production Blue-Green Deploy

**Goal:** deploy the green release, smoke-test it via port-forward, switch the
ALB target group, perform Route 53 DNS cutover, and keep blue warm for 24 h.

**Commands:**

```bash
bash scripts/production/step-21-production.sh
```

**Expected output:** GREEN helm release deployed and Ready, port-forward smoke
tests pass (health + login), ALB switched, Route 53 updated, public `/health`
200, BLUE release still has pods (warm rollback).

**Common failures:**

- Green smoke test fails — do not switch the ALB. Roll back the green release
  with `helm uninstall dayjoy-green -n dayjoy-prod` and re-investigate.
- Public `/health` non-200 after cutover — switch the ALB back to blue
  immediately (this is exactly why we keep blue warm).

**Acceptance criteria:** public production URL serves 200; blue warm; 24 h
teardown scheduled.

---

### Step 22 — Production Verification + 7-day SLO Watch

**Goal:** exercise all 4 channels (website order, voice call, WhatsApp, widget)
and then sample SLOs daily for 7 consecutive days.

**Commands:**

```bash
bash scripts/production/step-22-verification.sh
```

**Expected output:** 4/4 channels verified, then 7 daily SLO samples logged to
`.slo-watch.log`, each day either all-PASS or with at least one FAIL flagged.

**Acceptance criteria:** all 7 days PASS for all 4 SLOs
(p95 < 500 ms; uptime ≥ 99.9%; AI accuracy ≥ 92%; CSAT ≥ 4.5).

---

## 3. The orchestrator: `setup-all.sh`

The orchestrator runs any contiguous range of steps with progress tracking.

```bash
# Full run
bash scripts/production/setup-all.sh

# Start from step 5
bash scripts/production/setup-all.sh --from 5

# Stop at step 13
bash scripts/production/setup-all.sh --to 13

# Run just step 7
bash scripts/production/setup-all.sh --only 7

# Resume from the last failed step
bash scripts/production/setup-all.sh --continue

# See the plan without executing
bash scripts/production/setup-all.sh --dry-run --from 4 --to 9

# List all steps
bash scripts/production/setup-all.sh --list
```

Progress is appended to `scripts/production/.progress` in the format
`step|status|started_at|finished_at`. On failure, the orchestrator prints the
failing step number and the exact re-run command.

---

## 4. Rollback procedures

### 4.1 Application-level rollback (Helm)

If a production deploy misbehaves and you need to revert to the previous
release within the 24 h warm-blue window:

```bash
# 1. Switch the ALB listener back to BLUE's target group
aws elbv2 modify-listener --listener-arn "$ALB_LISTENER_ARN" \
  --default-actions Type=forward,TargetGroupArn="$BLUE_TG_ARN"

# 2. Revert DNS to BLUE's ALB
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{\
    "Name":"api.dayjoy.ai.","Type":"CNAME","TTL":60,\
    "ResourceRecords":[{"Value":"'"$BLUE_ALB_DNS"'"}]}}]}'

# 3. Uninstall GREEN to free resources
helm uninstall dayjoy-green -n dayjoy-prod
```

If the 24 h window has expired and BLUE is gone, use Helm's history:

```bash
helm history dayjoy-blue -n dayjoy-prod
helm rollback dayjoy-blue <REVISION> -n dayjoy-prod
```

### 4.2 Database rollback

If a bad migration was deployed:

1. **Stop the backend** to prevent further writes.
2. Restore from the most recent pre-deploy backup:
   ```bash
   bash deployment/scripts/restore-postgres.sh \
     s3://dayjoy-ai-backups/$(date -u +%Y/%m/%d)/pre-deploy.sql.gz
   ```
3. Roll back the Prisma migration record:
   ```bash
   docker exec dayjoy-postgres psql -U dayjoy -d dayjoy_ai -c \
     "DELETE FROM _prisma_migrations WHERE migration='0XX_bad_migration';"
   ```
4. Restart the backend and verify `/health`.

### 4.3 RAG rollback

If a bad ingest corrupted `rag_chunks`:

```bash
docker exec dayjoy-postgres psql -U dayjoy -d dayjoy_ai -c \
  "TRUNCATE rag_chunks, rag_documents CASCADE;"
pnpm --filter rag ingest -- --source packages/knowledge-base/
```

### 4.4 n8n rollback

n8n workflows are versioned in `automation/n8n/workflows/`. To revert:

```bash
git checkout <previous-commit> -- automation/n8n/workflows/
# Re-run step 14 to re-import
bash scripts/production/step-14-n8n.sh
```

### 4.5 Channel kill-switch

If a channel (voice, WhatsApp, website chat) is misbehaving and you need to
disable it without a full deploy:

- **Voice:** set `FEATURE_HUMAN_TRANSFER=false` and `VAPI_API_KEY=` (empty),
  then restart the backend. Inbound calls will go to the fallback number.
- **WhatsApp:** set `FEATURE_WHATSAPP_BOT=false` and restart.
- **Website chat:** set `NEXT_PUBLIC_VOICE_WIDGET_URL=` and rebuild the widget;
  the snippet will fail to boot on the marketing site.

---

## 5. Emergency contacts / incident runbook

### 5.1 Severity definitions

| Sev | Definition | Acknowledge SLA | Resolve SLA |
|-----|------------|----------------|-------------|
| S0 | Production down, data loss, security breach | 5 min | 1 h |
| S1 | Core channel broken for > 10% of users | 15 min | 4 h |
| S2 | Feature broken with workaround | 1 h | 1 business day |
| S3 | Cosmetic / minor UX | 1 business day | next sprint |

### 5.2 On-call rotation

| Role | Primary | Secondary |
|------|---------|-----------|
| Release captain | <name> | <name> |
| Backend on-call | <name> | <name> |
| Frontend on-call | <name> | <name> |
| DBA / data on-call | <name> | <name> |
| Security on-call | <name> | <name> |
| Comms / customer-facing | <name> | <name> |

*(Fill in names before each launch. Store the live rotation in PagerDuty
schedule `dayjoy-prod-oncall`.)*

### 5.3 Incident command sequence

1. **Detect** — PagerDuty pages the primary on-call.
2. **Acknowledge** within the Sev SLA.
3. **Open a Slack war-room** channel `#inc-<YYYYMMDD>-<short-description>`.
4. **Assign an incident commander** (usually the release captain). The IC does
   not write code; they coordinate.
5. **Communicate** — post a status update to `#dayjoy-status` every 30 min
   during Sev 0/1, or whenever status changes.
6. **Mitigate** — prefer rollback (Section 4) over fix-forward for Sev 0/1.
7. **Resolve** — confirm recovery via `step-22-verification.sh` channel
   checks.
8. **Post-mortem** — within 5 business days, write a blameless post-mortem in
   `docs/postmortems/YYYY-MM-DD-<incident>.md` covering: timeline, root cause,
   impact, contributing factors, action items with owners and due dates.

### 5.4 External vendor escalation

| Vendor | Support URL | Account ID |
|--------|------------|------------|
| Vapi | support@vapi.ai / Discord | `<account>` |
| Meta (WhatsApp) | https://developers.facebook.com/support/ | `<waba-id>` |
| Twilio | https://support.twilio.com | `<account-sid>` |
| OpenAI | https://help.openai.com | `<org-id>` |
| AWS | https://console.aws.amazon.com/support | `<account-id>` |
| SendGrid | https://support.sendgrid.com | `<subuser>` |
| Sentry | support@sentry.io | `<org-slug>` |

### 5.5 Common incident playbooks

**"Voice calls dropping after 30 s"** — Vapi `silenceTimeoutSeconds` is too
aggressive. Increase `VAPI_SILENCE_TIMEOUT` to 45 in `.env`, restart backend,
redeploy via `step-21-production.sh`.

**"WhatsApp not replying"** — verify webhook subscription is still active:
`curl https://graph.facebook.com/v18.0/<waba-id>/subscribed_apps -H
"Authorization: Bearer $WHATSAPP_TOKEN"`. Re-subscribe if empty.

**"AI responses degraded"** — check OpenAI status page; if degraded, switch
`OPENAI_MODEL` to a fallback (e.g. `gpt-4o-mini`) temporarily.

**"Database CPU 100%"** — check `pg_stat_activity` for long-running queries;
kill the offender with `pg_terminate_backend(<pid>)`. Add the missing index
retroactively.

**"Redis OOM"** — `docker exec dayjoy-redis redis-cli --bigkeys` to find the
largest keys; verify TTLs are set on session keys.

---

## 6. The "code exists / integration works / production verified" framework

Every feature ticket in the Dayjoy AI backlog must carry one of these three
labels. A ticket is only *closed* when it reaches **production verified**.

### 6.1 Code exists

Definition: the implementation is merged to `main`, all CI checks pass,
the code is reviewed. **No infrastructure has touched it.**

Acceptance: green CI build on `main`.

### 6.2 Integration works

Definition: in a non-production environment (local Docker, or staging), the
feature connects to its real external dependency and produces the expected
output. **No real users have exercised it.**

Acceptance: the corresponding step script (4–17) passes against staging with
real (but not customer-facing) credentials.

### 6.3 Production verified

Definition: real users (pilot or GA) have exercised the feature in production,
monitoring is in place, and SLOs have been met for ≥ 7 consecutive days.

Acceptance: `step-22-verification.sh` reports all 4 SLOs PASS for 7 days, plus
a green check from the on-call engineer in the launch sign-off doc.

**A feature is never "launched" by virtue of a deploy. It is launched by virtue
of 7 green SLO days.** If a feature reaches step 21 but the pilot (step 20)
or the 7-day watch (step 22) reveals problems, the feature is **not** launched
— it is rolled back and re-qualified.

---

## 7. Sign-off

Before declaring production verified, the following must sign in
`docs/launch-signoff.md`:

- [ ] Release captain — all 22 steps passed
- [ ] Backend on-call — `/health` green for 24 h
- [ ] DBA — backups verified restorable
- [ ] Security on-call — step 17 has 0 critical findings
- [ ] Comms — customer announcement sent
- [ ] Product owner — pilot success criteria met (step 20)

Only after all six sign-off boxes are ticked is the launch considered
complete.

---

*Last updated: see `git log` for this file. Maintain this document alongside
the step scripts — they are a single source of truth together.*

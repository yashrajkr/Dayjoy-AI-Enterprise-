# Dayjoy AI Enterprise — Production-Readiness Roadmap

**Generated:** 2026-08-07
**Scope:** What remains AFTER code consolidation/organization is complete, to take the platform from "MVP / pre-pilot" to "production-deployable".

---

## 0. Executive Summary — Where You Actually Stand

After analyzing all 6 uploaded ZIPs, here is the honest state of your codebase:

| Artifact | Files | Real state | Verdict |
|---|---|---|---|
| `DayJoy_AI_Voice_Assistant` | 496 | Real FastAPI + Next.js implementation, 834 tests, 21 migrations, real Vapi/Twilio/WhatsApp integration | **~70% production-ready** — best asset |
| `dayjoy-enterprise-ai-main` | 124 | NestJS scaffold with **broken Prisma schema** (4 missing models), snake_case field bugs in every service, dead RBAC, vapor RAG, 0 tests | **Non-functional — abandon or rewrite** |
| `artifacts-1of4` + `artifacts-2of2_final` | 200 .md | Strategic planning docs (architecture, research, business model) | **Reference material — do not execute as code** |
| `artifacts-3of4` + `artifacts-4of4` | 63 Vapi files + 31 Express files + 25 RAG files | All 63 spec'd Vapi files present, but **mock-backed tools, in-memory state, pseudo-tests** | **Scaffold — needs real implementation wiring** |

### Critical strategic decision (must make FIRST)

You have **three overlapping codebases** doing the same thing. You cannot ship all three. Pick one:

| Option | Recommendation | Why |
|---|---|---|
| **A. Standardize on `DayJoy_AI_Voice_Assistant` (FastAPI/Python)** | **Recommended** | 10× more complete, real tests, real migrations, real RAG, real voice/telephony/WhatsApp. Has infra. |
| B. Rewrite `enterprise-ai-main` (NestJS) from scratch | Only if you have a hard TypeScript requirement | Currently non-functional; ~3-4 months to reach parity with Option A |
| C. Hybrid: FastAPI backend + thin NestJS BFF | Only if you need TypeScript for a frontend gateway | Adds complexity; only justified by org constraints |

**The plan below assumes Option A** — consolidate on the FastAPI codebase as the source of truth, treat the Vapi artifacts as reference patterns to port into Python, and discard the NestJS scaffold.

---

## 1. Production-Readiness Roadmap (8 Phases)

### Phase 0 — Foundation Fixes (BLOCKING, 1-2 weeks)

These must be done before ANY other work. Nothing else matters if these are broken.

| # | Task | Why it's blocking | Effort |
|---|---|---|---|
| 0.1 | **Pick canonical codebase** (see §0 above) | You cannot ship 3 overlapping backends | Decision only |
| 0.2 | **Delete the NestJS scaffold** OR freeze it as reference | Its broken schema and snake_case bugs will confuse future contributors | 0.5 day |
| 0.3 | **Consolidate Prisma schemas** if keeping any TS code | 5 conflicting schema files exist across artifacts | 1 day |
| 0.4 | **Remove committed artifacts**: `apps/backend/test.db` (2.8MB), `test_verify.db` (3.7MB), `.coverage` (106KB), `apps/frontend/tsconfig.tsbuildinfo` (1.2MB) | ~8MB binary noise in repo; violates `.gitignore` | 0.5 day |
| 0.5 | **Delete duplicate files**: `START_HERE.md` == `ZIP_README.md`; `scripts/backup_postgres.sh` vs `backup-db.sh`; all `(2)`/`(3)` duplicate files in artifacts | Clutter makes maintenance harder | 0.5 day |
| 0.6 | **Reconcile self-audit docs** — `docs/FINAL_AUDIT_REPORT.md`, `PRODUCTION_READINESS_CHECKLIST.md`, `REPOSITORY_AUDIT_REPORT.md` contain **15+ verifiably false claims** (LangGraph, Cohere, OPA, Presidio, WAF, KMS, Vault, PDB, SecurityContext — none exist) | False claims will mislead ops team and auditors | 1 day |

**Acceptance criteria:** Single codebase, single schema, clean repo, honest docs.

---

### Phase 1 — Security Hardening (CRITICAL, 1-2 weeks)

The audit found **3 critical security vulnerabilities** that must be fixed before any production traffic.

| # | Vulnerability | Severity | Fix | Effort |
|---|---|---|---|---|
| 1.1 | **RDS security group open to `0.0.0.0/0` on port 5432** (`infra/terraform/modules/rds/main.tf` line 27) | 🔴 Critical | Restrict ingress to EKS node group security group only | 0.5 day |
| 1.2 | **K8s Secret has plaintext `SECRET_KEY: "CHANGE_ME_IN-production"`** (`infra/k8s/base/manifests.yaml` line 48) | 🔴 Critical | Adopt ExternalSecrets Operator + AWS Secrets Manager (or SealedSecrets) | 2 days |
| 1.3 | **OAuth2 codes/refresh-tokens stored in process memory** (`services/oauth_service.py`) — breaks under multi-replica LB | 🔴 Critical | Move to Redis with TTL; implement JTI blocklist for JWT revocation | 2 days |
| 1.4 | **JWT has no revocation blocklist** — `oauth_service.py` line 178 acknowledges this | 🟡 High | Redis-based JTI blocklist checked on every request | 1 day |
| 1.5 | **Webhook signature verification bypassable** in dev mode / when secret unset (Vapi artifacts `vapi-webhook-service.ts`) | 🟡 High | Enforce verification unconditionally in production; remove dev bypass | 0.5 day |
| 1.6 | **CSRF protection missing** — `cookie-parser` is a dependency but `csurf` is not | 🟡 High | Add CSRF tokens for cookie-based auth flows | 1 day |
| 1.7 | **No rate-limit-per-user** — only per-IP | 🟡 Medium | Add per-user rate limit using Redis sliding window (already have `rate_limit.py` infrastructure) | 1 day |
| 1.8 | **No PII detection/redaction** despite README claims | 🟡 Medium | Integrate Microsoft Presidio or AWS Comprehend for PII redaction in logs and RAG ingestion | 3 days |
| 1.9 | **`AllExceptionsFilter` logs JSON-stringified exception** — potential secret leakage | 🟡 Medium | Sanitize sensitive fields before logging; add a redaction allowlist | 0.5 day |
| 1.10 | **No Pod SecurityContext** in K8s manifests | 🟡 Medium | Add `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]` | 0.5 day |
| 1.11 | **No PodDisruptionBudget** in K8s | 🟡 Medium | Add PDB (`minAvailable: 2`) for backend and frontend Deployments | 0.5 day |
| 1.12 | **No ServiceAccount + IRSA** in K8s | 🟡 Medium | Create dedicated ServiceAccount per service with IAM roles for service accounts | 1 day |
| 1.13 | **Brute-force protection exists but check coverage** — verify all auth endpoints (login, password reset, MFA) are covered | 🟢 Low | Audit + add tests | 0.5 day |
| 1.14 | **Secret rotation story missing** — no key rotation for JWT, DB creds, API keys | 🟡 Medium | Document rotation runbook; implement dual-key JWT validation window | 2 days |
| 1.15 | **`requirePermission` is a TODO stub** in Vapi artifacts `authenticate.ts` | 🟡 High | Implement actual permission check against RBAC tables | 1 day |

**Acceptance criteria:** Pass an external security audit (e.g., AWS Inspector, Snyk, OWASP ZAP). No Critical/High findings.

---

### Phase 2 — Schema & Data Layer (1-2 weeks)

The data layer has correctness and integrity issues that will cause silent data corruption.

| # | Task | Why | Effort |
|---|---|---|---|
| 2.1 | **Add missing Prisma models** to `enterprise-ai-main` schema (IF keeping any TS code): `Distributor`, `Interaction`, `FollowUp`, `AiMemory`, `TenantConfig`, `RagEmbedding`, `RagQuery` | `prisma generate` currently fails | 1 day |
| 2.2 | **Fix snake_case vs camelCase field access** in every NestJS service | Every service writes `tenant_id` but Prisma exposes `tenantId` — nothing compiles | 2 days (mechanical refactor) |
| 2.3 | **Add `CREATE TYPE "OrderStatus"`** to SQL migration `002_business_tables.sql` | Migration references an enum that doesn't exist | 0.5 day |
| 2.4 | **Reconcile `OrderStatus` enum values** — Prisma has 4, SQL comment mentions 7 | Inconsistent state machine | 0.5 day |
| 2.5 | **Enable pgvector properly** — schema uses `Bytes?` for embeddings, not `Unsupported("vector(1536)")` | Vector similarity search won't work; "RAG with pgvector" claim is false | 1 day |
| 2.6 | **Add missing composite indexes** — `Conversation(tenantId, startedAt)`, `Message(conversationId, createdAt)`, `OrderItem(productId)`, `Lead(tenantId, status)` | Analytics queries do full table scans | 1 day |
| 2.7 | **Replace soft-delete via status string** with `deletedAt: DateTime?` timestamp | Current approach makes audit impossible; can't distinguish "deleted" from "inactive" | 2 days (migration + service refactor) |
| 2.8 | **Fix `Customer.status` casing** — schema says `"active"` lowercase, every service writes `'ACTIVE'` uppercase | Silent data inconsistency | 0.5 day |
| 2.9 | **Add `User.role` denormalized field OR fix `RolesGuard`** to read from `UserRole` join | Current `RolesGuard` always denies — every `@Roles('ADMIN')` endpoint returns 403 | 1 day |
| 2.10 | **Add audit log table with hash chaining** — `services/audit.py` is 73 lines with no visible chaining despite claims | Compliance requirement (GDPR/DPDP) | 2 days |
| 2.11 | **Add DB connection retry/backoff** in `PrismaService.onModuleInit` | App crashes if DB unavailable at boot | 0.5 day |
| 2.12 | **Enable graceful shutdown hooks** — `enableShutdownHooks(app)` is defined but never called from `main.ts` | Pods terminate mid-request | 0.5 day |

**Acceptance criteria:** `prisma generate` succeeds, `prisma migrate deploy` is idempotent, all services compile, all existing tests still pass.

---

### Phase 3 — Stub Implementations (3-4 weeks)

This is the biggest body of work. The "complete" appearance hides many stubs.

#### 3.1 Voice/Telephony provider stubs (7 of 9 providers raise `NotImplementedError`)

| Provider | File | Decision |
|---|---|---|
| Vapi | `voice/providers/vapi_provider.py` (632L) | ✅ Complete — keep |
| Twilio | `telephony/providers/twilio_provider.py` (842L) | ✅ Complete — keep |
| Retell | `voice/providers/retell_provider.py` (64L) | **Implement OR delete** |
| Bland | `voice/providers/bland_provider.py` (60L) | **Implement OR delete** |
| LiveKit | `voice/providers/livekit_provider.py` (60L) | **Implement OR delete** |
| Pipecat | `voice/providers/pipecat_provider.py` (60L) | **Implement OR delete** |
| Plivo | `telephony/providers/plivo_provider.py` (91L) | **Implement OR delete** |
| Exotel | `telephony/providers/exotel_provider.py` (94L) | **Implement OR delete** |
| Knowlarity | `telephony/providers/knowlarity_provider.py` (91L) | **Implement OR delete** |

**Recommendation:** Delete the 7 stubs. Ship with Vapi + Twilio only. Add providers only when you have a business reason + a contract with that provider. Stubs that raise `NotImplementedError` at runtime are worse than no code (they create false confidence in route availability).

**Effort:** 0.5 day to delete + update provider registry. (Implementing each provider later: ~3-5 days each.)

#### 3.2 Vapi artifacts — replace mock implementations

The 63 Vapi artifact files are scaffold-grade. Every tool's `execute()` returns hardcoded mocks. To make them production-ready:

| Module | Current state | Work needed | Effort |
|---|---|---|---|
| Module 3 — Tools (10 files) | All 8 tools return mocks (`mockSearch()`, `mockCreate()`) | Wire to real Prisma models + RAG service + calendar API + telephony transfer | 5 days |
| Module 4 — Webhooks (6 files) | Broken import paths (`./handlers/` subdir doesn't exist) | Fix imports; enforce signature verification; add idempotency keys | 2 days |
| Module 5 — Flows (6 files) | Intent detection is `string.includes('order')` substring matching | Replace with LLM-based intent classification or use Vapi's built-in function-calling | 3 days |
| Module 6 — Memory (5 files) | In-process `Map`s — lost on restart, inconsistent across replicas | Wire to Redis (session memory) + Postgres (customer profiles) | 2 days |
| Module 7 — Analytics (6 files) | Shape-only; depends on unbacked loggers/tracker/metrics | Wire to DB-backed call logs; expose Prometheus metrics; build Grafana dashboards | 4 days |
| Module 8 — Tests (8 files) | Pseudo-tests that assert their own hardcoded mocks | Rewrite with Vitest/Jest `expect()` against real service instances | 4 days |

**Subtotal: ~20 days**

#### 3.3 Backend service stubs

| Service | Issue | Fix | Effort |
|---|---|---|---|
| `marketplace_payments.py` line 126 | Hardcoded `"destination": "acct_seller_placeholder"` | Implement real Stripe Connect seller onboarding + Express account creation | 3 days |
| `ai/tools.service.ts` | Returns `{success:true}` for every tool | Implement real tool registry + execution | 3 days |
| `notifications/notifications.service.ts` | Only logs; no provider calls | Wire email (SendGrid/AWS SES), SMS (Twilio), WhatsApp (Meta), push (FCM), in-app (WebSocket) | 5 days |
| `auth.service.ts` | `logout()`, `requestPasswordReset()`, `resetPassword()`, `verifyEmail()` are no-ops | Implement real flows with token storage + email sending | 3 days |
| `ai/conversations.service.ts` `sendMessage()` | Only persists user input; no LLM call | Wire to LLM gateway; add streaming; add RAG retrieval; add function calling | 5 days |
| `knowledge/knowledge.service.ts` | Writes literal zero vectors `new Array(1536).fill(0)` | Implement real embedding generation + vector similarity search | 4 days |
| `mcp.py` `/tools/{id}/invoke` | Only records invocation; doesn't execute | Actually execute MCP tool calls | 3 days |

**Subtotal: ~26 days**

#### 3.4 Missing core capabilities

| Capability | Status | Build effort |
|---|---|---|
| **RAG pipeline** (in `enterprise-ai-main`) | Vapor — schema only, zero implementation | 10 days (or just use the FastAPI RAG pipeline which IS complete) |
| **WebSocket / real-time chat** | No `@nestjs/websockets`, no Socket.IO | 4 days |
| **File upload handler** | `UPLOAD_MAX_SIZE` env exists but no Multer | 1 day |
| **API documentation (OpenAPI/Swagger)** | No `@nestjs/swagger` | 2 days |
| **Multi-LLM support** | Only OpenAI env; README claims Anthropic/Google/Azure | 3 days (or use FastAPI which already has 4 providers) |
| **GDPR data export / right to erasure** | Claimed but no endpoints | 3 days |
| **CSAT collection** | Prometheus rule references `customer_satisfaction_score` but nothing records it | 2 days |
| **Tenant onboarding flow** | No public endpoint to create a Tenant | 2 days |

**Subtotal: ~27 days**

**Phase 3 total: ~73 days (~15 weeks)** — this is the bulk of remaining work.

---

### Phase 4 — Test Coverage (2-3 weeks, parallel with Phase 3)

The FastAPI backend has 834 tests. The NestJS scaffold has 0. The Vapi artifacts have pseudo-tests. The frontend has 12 tests.

| # | Task | Why | Effort |
|---|---|---|---|
| 4.1 | **Frontend tests** — only 3 files exist (`button.test.tsx`, `utils.test.ts`, `constants.test.ts`); `hooks/` and `types/` dirs are empty | No confidence in UI changes | 5 days (add React Testing Library tests for top 20 components + pages) |
| 4.2 | **E2E tests** — only 3 Playwright tests exist | Critical user journeys untested | 3 days (login, dashboard, voice call flow, RAG query, order placement) |
| 4.3 | **Load tests** — `load_test_api.py` exists but audit claims "Locust" (false) | Don't know breaking point | 2 days (write Locust scenarios for /voice, /rag/query, /auth/login) |
| 4.4 | **Contract tests** for Vapi/Twilio/WhatsApp webhooks | Webhook regressions are silent | 2 days |
| 4.5 | **Multi-tenant isolation tests** — verify no cross-tenant data leaks | Critical security property | 2 days |
| 4.6 | **Chaos tests** — kill DB, kill Redis, kill Vapi mid-call | Resilience validation | 2 days |
| 4.7 | **Rewrite Vapi artifact pseudo-tests** with real assertions | Current tests can never fail | 4 days |
| 4.8 | **Add mutation testing** (Stryker for TS, mutmut for Python) | Verify test quality, not just coverage | 2 days |
| 4.9 | **Coverage gate in CI** — fail build if coverage drops below 70% | Prevent regression | 0.5 day |

**Acceptance criteria:** Backend ≥80% line coverage, frontend ≥60%, E2E covers all critical journeys, load test proves 100 RPS sustained.

---

### Phase 5 — Observability & Ops (1-2 weeks)

You have Prometheus rules but no dashboards, no alert routing, no log aggregation.

| # | Task | Why | Effort |
|---|---|---|---|
| 5.1 | **Build Grafana dashboards** — provisioning config exists but NO JSON dashboards | Grafana starts empty | 3 days (API overview, voice/telephony, RAG, DB, infra, business KPIs) |
| 5.2 | **Wire Alertmanager** — `prometheus.yml` has `alertmanagers: targets: []` | Alerts fire but go nowhere | 1 day (configure routing to PagerDuty/Slack) |
| 5.3 | **Structured logging** — FastAPI uses structlog ✅, but NestJS uses `console.log` | Logs not searchable | 2 days (winston + JSON format + correlation IDs) |
| 5.4 | **Log aggregation** — no Loki/CloudWatch/ELK config | Can't search logs across pods | 2 days (Loki + Promtail, or CloudWatch Logs) |
| 5.5 | **Distributed tracing** — no OpenTelemetry | Can't trace requests across services | 2 days (OTel SDK + Jaeger/Tempo) |
| 5.6 | **Error tracking** — no Sentry | Frontend/backend errors not aggregated | 0.5 day |
| 5.7 | **Health checks** — FastAPI has `/health/{,live,ready}` ✅, NestJS has none | K8s can't detect unhealthy pods | 1 day |
| 5.8 | **Runbooks** — `docs/runbooks/incident-response.md` exists but is thin | On-call has no guidance | 2 days (one runbook per alert) |
| 5.9 | **SLO/SLI definitions** — none exist | Can't measure service quality | 1 day |
| 5.10 | **Synthetic monitoring** — none | Can't detect regional outages | 1 day |

**Acceptance criteria:** Mean time to detection (MTTD) < 5 minutes for any critical alert; dashboards cover all SLOs; runbooks exist for every alert.

---

### Phase 6 — CI/CD & Deployment (1-2 weeks)

| # | Task | Why | Effort |
|---|---|---|---|
| 6.1 | **Replace placeholder ECR registry** `123456789.dkr.ecr.ap-south-1.amazonaws.com` | CI will fail | 0.5 day |
| 6.2 | **Add secret scanning** (gitleaks/trufflehog) in CI | Prevent secret leaks | 0.5 day |
| 6.3 | **Add SAST** (Bandit for Python, Semgrep for TS) | Catch vulnerabilities early | 1 day |
| 6.4 | **Add dependency scanning** (Dependabot, Snyk) | Stay ahead of CVEs | 0.5 day |
| 6.5 | **Add DAST** (OWASP ZAP) in staging | Catch runtime vulns | 1 day |
| 6.6 | **Container scanning** (Trivy) in CI | Catch base image vulns | 0.5 day |
| 6.7 | **Infrastructure as Code scanning** (checkov/tfsec) | Catch infra misconfigurations | 0.5 day |
| 6.8 | **Add K8s manifests to `kustomize apply` in CD** | Currently only Docker Compose | 2 days |
| 6.9 | **Add ArgoCD or Flux for GitOps** | Manual kubectl is error-prone | 3 days |
| 6.10 | **Blue/green or canary deployment** | Currently rolling update only | 3 days |
| 6.11 | **Database migration rollback strategy** | Alembic down migrations exist but no rollback runbook | 1 day |
| 6.12 | **Backup automation + restore testing** | `backup_postgres.sh` exists but not scheduled; restore never tested | 2 days |

**Acceptance criteria:** Push to `main` → automated build → test → scan → deploy to staging → manual promote to prod. Rollback < 5 minutes.

---

### Phase 7 — Infrastructure Completion (1-2 weeks)

Terraform is starter-grade. K8s is partial.

| # | Task | Why | Effort |
|---|---|---|---|
| 7.1 | **Add AWS KMS module** | "AES-256 via KMS" is claimed but not implemented | 1 day |
| 7.2 | **Add AWS WAF + ALB** | Ingress uses nginx only; no WAF | 2 days |
| 7.3 | **Add Route53 + ACM** | DNS and TLS not in Terraform | 1 day |
| 7.4 | **Add AWS Secrets Manager / Parameter Store** + ExternalSecrets integration | K8s Secrets are plaintext | 2 days |
| 7.5 | **Add IRSA (IAM Roles for Service Accounts)** | Pods use default SA | 1 day |
| 7.6 | **Add DynamoDB lock table** for Terraform state | Concurrent Terraform runs corrupt state | 0.5 day |
| 7.7 | **Add CloudWatch alarms** | No AWS-level alerting | 1 day |
| 7.8 | **Add SNS topics** for alerts | Alertmanager can't reach AWS | 0.5 day |
| 7.9 | **Add EKS node group auto-scaling config** | Currently fixed node count | 0.5 day |
| 7.10 | **Add S3 bucket versioning + lifecycle + encryption** | Backup bucket has none of these | 0.5 day |
| 7.11 | **Add cert-manager CR** (not just annotation) | TLS automation incomplete | 1 day |
| 7.12 | **Add ServiceMonitor for Prometheus Operator** | K8s manifest references it but doesn't create it | 0.5 day |
| 7.13 | **Add PersistentVolume for backend uploads** | Currently ephemeral | 0.5 day |
| 7.14 | **Multi-region readiness** (if required) — read replicas, cross-region failover | "Multi-region Ready" claim is false | 5 days (or defer to v2) |

**Acceptance criteria:** `terraform plan` clean; `terraform apply` produces a working prod environment; all resources encrypted, least-privilege IAM, no public exposure except ALB/WAF.

---

### Phase 8 — Documentation Reconciliation (1 week)

| # | Task | Why | Effort |
|---|---|---|---|
| 8.1 | **Rewrite `FINAL_AUDIT_REPORT.md`** with accurate file/test counts and honest maturity ratings | Contains 15+ false claims | 1 day |
| 8.2 | **Rewrite `PRODUCTION_READINESS_CHECKLIST.md`** — remove claims about LangGraph/Cohere/OPA/Presidio/WAF/KMS/Vault that don't exist | Auditors will catch these | 1 day |
| 8.3 | **Add ADRs** for major decisions (only 1 ADR exists: monorepo choice) | Future maintainers lack context | 2 days (one ADR per major architectural decision) |
| 8.4 | **Consolidate the 200 strategic markdown docs** from artifacts into `docs/architecture/` | Currently scattered across 4 ZIPs | 2 days |
| 8.5 | **Generate API docs from OpenAPI spec** | Currently only hand-written READMEs | 1 day |
| 8.6 | **Write onboarding doc** for new engineers | None exists | 1 day |
| 8.7 | **Write ops runbook** covering deploy/rollback/backup/restore/incident | Currently scattered | 2 days |

**Acceptance criteria:** Every claim in docs is verifiable against code; new engineer can onboard in < 1 day; on-call can handle any alert using runbooks.

---

## 2. Consolidated Timeline

| Phase | Duration | Can run in parallel? | Critical path? |
|---|---|---|---|
| Phase 0 — Foundation | 1-2 weeks | No (blocks everything) | ✅ Yes |
| Phase 1 — Security | 1-2 weeks | After Phase 0 | ✅ Yes |
| Phase 2 — Schema | 1-2 weeks | Parallel with Phase 1 | ✅ Yes |
| Phase 3 — Stubs | 15 weeks | After Phase 2 (the big one) | ✅ Yes |
| Phase 4 — Tests | 2-3 weeks | Parallel with Phase 3 | No |
| Phase 5 — Observability | 1-2 weeks | Parallel with Phase 3 | No |
| Phase 6 — CI/CD | 1-2 weeks | Parallel with Phase 3 | No |
| Phase 7 — Infra | 1-2 weeks | Parallel with Phase 3 | No |
| Phase 8 — Docs | 1 week | After Phase 3 | No |

**Critical path: Phase 0 → 1 → 2 → 3 → 8 = ~21 weeks (~5 months) for 1 engineer.**

**With 3-4 engineers in parallel: ~10-12 weeks (~3 months).**

---

## 3. Priority Matrix — What to Do First

If you can only do 10 things in the next 4 weeks, do these (in order):

1. **Decide on canonical codebase** (Phase 0.1) — 1 hour decision, saves months
2. **Fix RDS open to internet** (Phase 1.1) — 0.5 day, critical vuln
3. **Move OAuth2 state to Redis** (Phase 1.3) — 2 days, critical for multi-replica
4. **Add JWT revocation blocklist** (Phase 1.4) — 1 day, security
5. **Add PodSecurityContext + PDB + ServiceAccount** (Phase 1.10-1.12) — 2 days, K8s hardening
6. **Adopt ExternalSecrets** (Phase 1.2) — 2 days, removes plaintext secrets
7. **Delete the 7 voice/telephony provider stubs** (Phase 3.1) — 0.5 day, reduces surface
8. **Implement real RAG** in NestJS OR adopt FastAPI RAG (Phase 3.4) — 10 days, core value prop
9. **Build Grafana dashboards** (Phase 5.1) — 3 days, observability
10. **Reconcile audit docs with reality** (Phase 8.1-8.2) — 2 days, honesty

**4-week sprint deliverable:** A single, deployable codebase with no critical security vulns, real RAG, working observability, and honest docs.

---

## 4. What NOT to Do

1. **Don't try to ship all 3 codebases.** Pick one. The other two will create conflicts, double maintenance, and confusion.
2. **Don't implement all 7 telephony stubs.** Delete them. Add providers only when you have a business contract.
3. **Don't trust the self-audit docs.** 15+ false claims. Rewrite them.
4. **Don't add new features until Phase 0-2 are done.** A broken schema + open RDS = no foundation.
5. **Don't skip the Vapi artifact rewrite.** Mock-backed tools that return `id: 'mock-1'` will fail silently in production calls.
6. **Don't deploy to prod without ExternalSecrets.** Plaintext K8s Secrets in git = guaranteed breach.
7. **Don't skip load testing.** You don't know your breaking point. The "Locust ready" claim is false.
8. **Don't treat the 200 strategic markdown docs as executable specs.** They're planning material. The code is the source of truth.

---

## 5. Definition of "Production-Ready"

A checklist you can actually verify (unlike the current one):

### Security
- [ ] RDS not publicly accessible
- [ ] All K8s Secrets sourced from ExternalSecrets/SealedSecrets
- [ ] OAuth2 state in Redis with TTL
- [ ] JWT revocation blocklist active
- [ ] All webhooks verify signatures unconditionally
- [ ] Pod Security Standards enforced
- [ ] IRSA on all service accounts
- [ ] No `0.0.0.0/0` security groups
- [ ] All storage encrypted with KMS
- [ ] WAF on ALB
- [ ] Pass OWASP ZAP scan with 0 High/Critical

### Reliability
- [ ] All services have `/health/live` and `/health/ready`
- [ ] HPA on all Deployments
- [ ] PDB on all Deployments
- [ ] Blue/green or canary deploy
- [ ] Backup runs daily, restore tested monthly
- [ ] Multi-AZ DB
- [ ] Graceful shutdown tested
- [ ] Circuit breakers on all external calls

### Observability
- [ ] Grafana dashboards for: API, DB, Redis, voice, RAG, K8s, business
- [ ] Alertmanager routes to PagerDuty/Slack
- [ ] Structured JSON logs shipped to Loki/CloudWatch
- [ ] OpenTelemetry traces on all requests
- [ ] Sentry for error tracking
- [ ] SLOs defined and measured
- [ ] Runbook for every alert

### Testing
- [ ] Backend ≥80% coverage
- [ ] Frontend ≥60% coverage
- [ ] E2E covers all critical journeys
- [ ] Load test proves target RPS
- [ ] Multi-tenant isolation tested
- [ ] Chaos test: DB down, Redis down, provider down

### Documentation
- [ ] Every doc claim verified against code
- [ ] ADRs for all major decisions
- [ ] API docs generated from OpenAPI
- [ ] Onboarding doc for new engineers
- [ ] Ops runbook covering all common incidents

### CI/CD
- [ ] Push to main → staging automatically
- [ ] Manual promotion to prod
- [ ] Rollback < 5 minutes
- [ ] Secret scanning, SAST, DAST, dependency scanning all green
- [ ] Container scanning all green
- [ ] IaC scanning all green

---

## 6. Final Recommendation

**Stop organizing. Start fixing.**

You have spent significant effort collecting artifacts, writing docs, and structuring the repo. The organization work has diminishing returns now. The bottleneck is **implementation gaps and security vulnerabilities**, not file structure.

The single highest-leverage action you can take today:

> **Decide that `DayJoy_AI_Voice_Assistant` (FastAPI) is the canonical codebase. Delete the NestJS scaffold. Treat the Vapi artifacts as reference patterns to port into Python. Then start Phase 1 (security) immediately.**

Everything else follows from that decision.

---

*End of roadmap.*

# Production Release Checklist — Dayjoy AI Enterprise

Use this checklist before every production release. Each item must be checked off by the responsible owner. A release may NOT proceed until every required item (marked **[required]**) is complete.

**Release version:** `v____.______.______`
**Release manager:** ____________________
**Target date:** ____________________
**Status:** ☐ Planning  ☐ In Validation  ☐ Sign-off  ☐ Deploying  ☐ Done

---

## 1. Code Quality **[required]**

- [ ] All unit tests passing (0 failures)
- [ ] All integration tests passing
- [ ] All API tests passing
- [ ] All E2E tests passing
- [ ] Code coverage ≥ 80% line, 75% branch on changed files
- [ ] No ESLint errors (warnings reviewed)
- [ ] No TypeScript errors (`tsc --noEmit` clean)
- [ ] No skipped tests (`it.skip` / `describe.skip`)
- [ ] Code review approved by 2 reviewers (one senior+)
- [ ] CHANGELOG.md updated with user-facing changes
- [ ] Version bumped in `package.json` (all workspaces)

**Owner:** QA lead
**Evidence:** Link to CI run: ____________________

---

## 2. Security **[required]**

- [ ] Security tests passing (authentication, authorization, RBAC)
- [ ] SQL injection tests passing
- [ ] XSS tests passing (stored + reflected)
- [ ] CSRF tests passing
- [ ] Rate limiting verified (per-email, per-IP, per-endpoint)
- [ ] Secrets not in code (Gitleaks scan clean)
- [ ] SSL/TLS configured (cert valid ≥ 30 days)
- [ ] Snyk scan: 0 critical / 0 high vulnerabilities
- [ ] Semgrep scan: 0 high findings
- [ ] Pen test findings from last quarter resolved or risk-accepted
- [ ] OWASP Top 10 review complete
- [ ] JWT secret rotated in last 90 days
- [ ] Refresh token rotation enabled
- [ ] Password policy enforced (min 8 chars, mixed case, number, symbol)
- [ ] Account lockout after 5 failed attempts
- [ ] Session timeout ≤ 24 hours
- [ ] CORS allow-list reviewed (no `*`)
- [ ] Helmet security headers enabled (CSP, HSTS, X-Frame-Options, etc.)

**Owner:** Security engineer
**Evidence:** Snyk report: ____  Semgrep report: ____  Gitleaks: ____

---

## 3. Performance **[required for minor/major releases]**

- [ ] Load test passed (100 concurrent users, p95 < 500ms)
- [ ] Stress test passed (500 concurrent users, ≥ 95% success)
- [ ] Stress test passed (1000 concurrent users, ≥ 80% success, no 5xx)
- [ ] Soak test passed (1 hour sustained load, memory growth < 50MB)
- [ ] API p95 latency < 500ms
- [ ] API p99 latency < 2s
- [ ] AI response latency < 3s (RAG query)
- [ ] AI streaming first token < 500ms
- [ ] Lighthouse score > 90 (customer portal)
- [ ] Lighthouse score > 85 (admin dashboard)
- [ ] No >10% regression vs previous release
- [ ] Database query p95 < 100ms (slow query log reviewed)

**Owner:** DevOps engineer
**Evidence:** Load test report: ____  Lighthouse report: ____

---

## 4. Database **[required]**

- [ ] All migrations applied to staging
- [ ] All migrations applied to production (runbook ready)
- [ ] Migrations are reversible (down-migration tested)
- [ ] Seed data loaded (test tenants, test users, test products)
- [ ] Row-Level Security policies verified
- [ ] Backup tested (restore to a test DB + verify row count)
- [ ] Restore tested (full restore + point-in-time recovery)
- [ ] Indexes reviewed (no missing indexes on hot paths)
- [ ] Slow query log reviewed (no queries > 1s)
- [ ] Connection pool size tuned (default 10, max 20)
- [ ] Replication lag < 1s

**Owner:** DevOps engineer
**Evidence:** Migration log: ____  Backup test: ____

---

## 5. AI / RAG **[required]**

- [ ] RAG retrieval accuracy > 80% (top-3)
- [ ] RAG precision@5 > 0.6
- [ ] RAG mean reciprocal rank (MRR) > 0.7
- [ ] Citation accuracy > 90% (cited articles are relevant)
- [ ] Hallucination rate < 5% (manual spot-check of 50 responses)
- [ ] Tool selection accuracy > 85% (correct tool per intent)
- [ ] AI response latency < 3s
- [ ] AI streaming first token < 500ms
- [ ] Memory persists across conversations (long-term memory)
- [ ] Conversation history scoped to authenticated user
- [ ] Out-of-domain questions handled gracefully (no hallucination)
- [ ] Multilingual inputs handled (Hindi, Hinglish)
- [ ] OpenAI API key valid + rate limit headroom verified
- [ ] OpenAI fallback model configured (gpt-4o → gpt-4o-mini)
- [ ] RAG index rebuilt (no stale chunks)

**Owner:** AI engineer
**Evidence:** AI eval report: ____  Hallucination spot-check: ____

---

## 6. Channels **[required]**

### 6.1 Voice AI (Vapi)

- [ ] Voice AI tests passing
- [ ] Voice webhook rate limit verified (1000/min)
- [ ] Voice call latency < 2s (greeting to first AI response)
- [ ] Voice transcription accuracy > 90% (manual spot-check)
- [ ] Voice → human transfer works (transfer queue + SLA)
- [ ] Voice call recording enabled + stored
- [ ] Voice call summary generated within 1 min of call end
- [ ] Vapi API key valid
- [ ] Vapi assistant ID configured per environment
- [ ] Telephony number provisioned + verified

### 6.2 WhatsApp AI

- [ ] WhatsApp AI tests passing
- [ ] WhatsApp webhook signature verification enabled
- [ ] WhatsApp message template approved (for outbound outside 24h window)
- [ ] WhatsApp message queue retry logic verified
- [ ] WhatsApp → human handoff works
- [ ] WhatsApp Cloud API token valid
- [ ] WhatsApp Business phone number verified
- [ ] WhatsApp conversation appears in admin console within 5s

### 6.3 Website AI

- [ ] Website AI tests passing
- [ ] Chat widget loads on all portal pages
- [ ] All AI tools functional (search_products, search_knowledge, create_lead, book_appointment, create_support_ticket, human_transfer, customer_lookup)
- [ ] Voice input button functional (Web Speech API)
- [ ] Voice output functional (TTS toggle)
- [ ] Streaming response works (SSE)
- [ ] Citations render as clickable cards

**Owner:** QA engineer
**Evidence:** Channel test reports: ____

---

## 7. Portals **[required]**

### 7.1 Customer Portal

- [ ] Customer portal tests passing
- [ ] Login + register + forgot-password + reset-password flows work
- [ ] Dashboard renders with name + orders + AI + notifications + recommendations
- [ ] Products browse + search + filter + sort + detail + add-to-cart
- [ ] Orders list + detail + tracking timeline + invoice download + return
- [ ] AI assistant chat + voice + WhatsApp + history
- [ ] Support home + tickets + FAQ + knowledge base
- [ ] Mobile responsive verified (iPhone SE, Pixel 5, iPad)

### 7.2 Distributor Portal

- [ ] Distributor portal tests passing
- [ ] Dashboard with sales + commission + team + goal charts
- [ ] Team tree (expand/collapse + detail)
- [ ] Sales dashboard with date range + export
- [ ] Earnings dashboard with breakdown + payout history
- [ ] Commissions list with status filter + detail
- [ ] Leads pipeline (kanban) + create + detail + convert

### 7.3 Employee Portal

- [ ] Employee portal tests passing
- [ ] Dashboard with KPIs + today's tasks + recent tickets
- [ ] Tasks list + create + detail + mark complete
- [ ] CRM lookup (customers + distributors + leads)
- [ ] Tickets list + detail + reply + change status
- [ ] Attendance check-in/out + history + leave application

### 7.4 Admin Dashboard

- [ ] Admin dashboard tests passing
- [ ] Dashboard with KPIs + charts + activity feed + system health
- [ ] User management (list + create + edit + delete + role assignment)
- [ ] Analytics (overview + voice + AI + sales)
- [ ] All admin endpoints RBAC-enforced (ADMIN + SUPER_ADMIN only)

**Owner:** QA engineer
**Evidence:** Portal test reports: ____

---

## 8. Infrastructure **[required]**

- [ ] Docker images built + pushed to registry (tagged with version)
- [ ] Kubernetes manifests applied to staging
- [ ] Kubernetes manifests reviewed for production
- [ ] Horizontal Pod Autoscaler configured (CPU > 70%, memory > 80%)
- [ ] Pod Disruption Budget configured (min 2 replicas available)
- [ ] Resource requests + limits set (CPU + memory)
- [ ] Liveness probe configured (fails on OOM)
- [ ] Readiness probe configured (fails when DB/Redis unreachable)
- [ ] Monitoring dashboards configured (Grafana)
  - [ ] Dayjoy Overview
  - [ ] Dayjoy AI Quality
  - [ ] Dayjoy Performance Benchmarks
  - [ ] Dayjoy Voice AI
  - [ ] Dayjoy WhatsApp
- [ ] Alerts configured (PagerDuty + Slack)
  - [ ] API error rate > 1% for 5 min → page
  - [ ] API p95 latency > 1s for 5 min → page
  - [ ] DB connection pool exhausted → page
  - [ ] Redis unreachable → page
  - [ ] Disk usage > 80% → page
  - [ ] Cert expiry < 14 days → Slack
- [ ] Log aggregation working (Loki / ELK)
- [ ] Distributed tracing enabled (OpenTelemetry)
- [ ] Health checks passing (`/api/health` returns 200)
- [ ] CDN configured (Cloudflare) for static assets
- [ ] WAF rules active (Cloudflare)
- [ ] DDoS protection enabled
- [ ] DNS records updated (A, AAAA, CNAME, MX, TXT for SPF, DKIM, DMARC)

**Owner:** DevOps engineer
**Evidence:** Manifests PR: ____  Dashboard URLs: ____

---

## 9. Automation (n8n + Webhooks) **[required]**

- [ ] n8n workflows imported to production
- [ ] n8n workflows activated
- [ ] Webhook URLs configured (point to production, not staging)
- [ ] Webhook URLs match the reverse-proxy path (`/?XTransformPort=...`)
- [ ] Error handling verified (failed workflow retries + alerts)
- [ ] Monitoring workflows active (daily health check, alert on failure)
- [ ] Workflow secrets rotated (no staging secrets in production)
- [ ] Workflow ownership documented (who owns each workflow)

**Owner:** DevOps engineer
**Evidence:** n8n workflow list: ____

---

## 10. Documentation **[required]**

- [ ] README.md updated (if user-facing changes)
- [ ] CHANGELOG.md updated
- [ ] API documentation updated (Swagger / OpenAPI)
- [ ] Deployment runbook updated (if infra changes)
- [ ] Rollback runbook updated (if migration changes)
- [ ] On-call runbook updated (if alerting changes)
- [ ] User-facing changelog (for customer emails / blog post)
- [ ] Training docs updated (if UI changes)
- [ ] This checklist filled out for the release

**Owner:** Tech writer + release manager
**Evidence:** Docs PRs: ____

---

## 11. Manual Smoke Test (Production) **[required]**

Run the full smoke test from `RELEASE_VALIDATION_GUIDE.md` §6 against **production** within 1 hour of deployment.

- [ ] Customer portal smoke test (10 items)
- [ ] Distributor portal smoke test (8 items)
- [ ] Employee portal smoke test (7 items)
- [ ] Admin dashboard smoke test (6 items)
- [ ] Voice AI smoke test (6 items)
- [ ] WhatsApp AI smoke test (5 items)

**Owner:** QA engineer + product manager
**Evidence:** Smoke test report: ____

---

## 12. Final Sign-off **[required]**

Each sign-off is a comment on the release ticket with the format:

```
<role> sign-off — Release vX.Y.Z
All checks pass. APPROVED for release.
— <name>, <date>
```

- [ ] **QA lead** sign-off (test suite + smoke test)
- [ ] **Security team** sign-off (security scan + pen test)
- [ ] **DevOps** sign-off (infra + monitoring + rollback plan)
- [ ] **Product manager** sign-off (feature completeness)
- [ ] **Engineering manager** sign-off (final go/no-go)

---

## 13. Rollback Plan **[required]**

- [ ] Rollback plan documented (app + DB + config)
- [ ] Rollback commands tested in staging
- [ ] Rollback triggers defined (error rate > 5%, p95 > 2s, Sev-1 bug)
- [ ] On-call engineer briefed on rollback procedure
- [ ] Rollback drill completed in last quarter

**Rollback commands:**

```bash
# App
kubectl set image deployment/dayjoy-backend dayjoy-backend=registry.dayjoy.ai/dayjoy-backend:v<PREV> -n production

# DB (if migration was applied)
prisma migrate resolve --rolled-back <migration_name> --schema database/prisma/schema.prisma

# Config
kubectl rollout undo configmap/dayjoy-config -n production
kubectl rollout restart deployment/dayjoy-backend -n production
```

**Rollback decision-maker:** On-call engineer (no need to wait for sign-off if the triggers are met).

---

## 14. Post-Release **[required]**

- [ ] 24-hour monitoring complete (on-call engineer)
- [ ] No Sev-1 / Sev-2 incidents in first 24 hours
- [ ] 1-week performance + smoke test against production complete
- [ ] Release retro scheduled (within 1 week)
- [ ] Release notes published (blog / email / in-app)
- [ ] Customer support briefed on new features
- [ ] Status page updated (if any incidents)

---

## Sign-off Block

```
Release version: v____.______.______
Release date:    ____ / ____ / ______

QA lead:           ____________________  Date: __________
Security engineer: ____________________  Date: __________
DevOps engineer:   ____________________  Date: __________
Product manager:   ____________________  Date: __________
Engineering mgr:   ____________________  Date: __________

Final decision:    ☐ GO   ☐ NO-GO   ☐ HOLD

Reason (if NO-GO or HOLD):
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________
```

---

## Appendix: Quick Reference Commands

```bash
# Run the full test suite
pnpm test

# Run security tests
cd testing && pnpm test:security

# Run edge-case tests
cd testing && pnpm test:edge-cases

# Run performance tests (against staging)
PERF_BASE_URL=https://staging.dayjoy.ai pnpm --filter dayjoy-testing test:performance

# Run AI evaluation tests
cd testing && pnpm test:ai-eval

# Run portal tests (per portal)
cd testing && E2E_CUSTOMER_BASE_URL=http://localhost:3005 npx playwright test portals/customer

# Run E2E tests
pnpm test:e2e

# Generate coverage report
pnpm --filter backend test:coverage

# Security scans
pnpm audit --audit-level=high
semgrep --config=p/owasp-top-ten .
gitleaks detect --source .

# Deploy to production
kubectl apply -f deployment/k8s/ -n production
kubectl rollout status deployment/dayjoy-backend -n production

# Rollback
kubectl rollout undo deployment/dayjoy-backend -n production
```

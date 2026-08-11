# Dayjoy AI Enterprise — Release Validation Guide

Pre-release validation process for every Dayjoy AI Enterprise Platform release. Followed before any build is promoted to production.

---

## Table of Contents

1. [Release Types](#1-release-types)
2. [Pre-Release Validation Process](#2-pre-release-validation-process)
3. [Test Suite Execution](#3-test-suite-execution)
4. [Performance Benchmarks](#4-performance-benchmarks)
5. [Security Scan](#5-security-scan)
6. [Manual Smoke Test](#6-manual-smoke-test)
7. [Sign-off Process](#7-sign-off-process)
8. [Rollback Plan](#8-rollback-plan)
9. [Post-Release Monitoring](#9-post-release-monitoring)

---

## 1. Release Types

| Type      | Cadence           | Validation Level                 | Downtime Expected |
| --------- | ----------------- | -------------------------------- | ----------------- |
| Hotfix    | As needed         | Subset of validation (§3 + §6)   | None (rolling)    |
| Patch     | Weekly            | Full validation                  | None (rolling)    |
| Minor     | Monthly           | Full validation + performance    | None (rolling)    |
| Major     | Quarterly         | Full validation + canary period  | <5 min (DB step)  |

This guide applies to **all** release types. Hotfixes may skip §4 (performance) + §5 (security scan) if the fix is urgent, but must still pass §3 + §6.

---

## 2. Pre-Release Validation Process

The release manager follows this checklist in order. Each step has a "owner" — the person responsible for completing + signing off.

### Step 1: Branch + Version Bump

**Owner:** Release manager

```bash
# Create the release branch
git checkout -b release/v1.4.0

# Bump the version in package.json (all workspaces)
pnpm version minor --no-git-tag-version  # or "patch" / "major"

# Update CHANGELOG.md
# Commit + push
git add -A
git commit -m "chore: bump version to 1.4.0"
git push origin release/v1.4.0
```

### Step 2: Run the Full Test Suite

**Owner:** QA engineer

Run every test category (see §3). All tests must pass. Any failure blocks the release.

### Step 3: Performance Benchmarks

**Owner:** DevOps engineer

Run the performance suite against staging (see §4). Results must not regress more than 10% from the previous release.

### Step 4: Security Scan

**Owner:** Security engineer

Run Snyk + Semgrep (see §5). No new high/critical vulnerabilities.

### Step 5: Manual Smoke Test

**Owner:** QA engineer + product manager

Run through the manual smoke test checklist (see §6) in the staging environment.

### Step 6: Sign-off

**Owner:** Release manager

Collect sign-offs from QA lead, security, DevOps, product manager (see §7).

### Step 7: Deploy

**Owner:** DevOps engineer

Follow the deployment runbook (in `deployment/`). Canary to 5% → 25% → 50% → 100% over 1 hour.

### Step 8: Post-Release Monitoring

**Owner:** On-call engineer

Monitor dashboards + alerts for 24 hours after the release (see §9).

---

## 3. Test Suite Execution

Run every command below. ALL must pass with zero failures. Skipped tests count as failures.

### 3.1 Lint + Typecheck

```bash
pnpm lint
pnpm typecheck
```

**Pass criteria:** Zero errors. Warnings are allowed but should be reviewed.

### 3.2 Unit Tests

```bash
pnpm --filter backend test
pnpm --filter customer-portal test
pnpm --filter distributor-portal test
pnpm --filter employee-portal test
pnpm --filter admin-dashboard test
pnpm --filter rag test
pnpm --filter vapi test
pnpm --filter whatsapp-ai test
```

**Pass criteria:** 100% pass. Coverage ≥ 80% line / 75% branch on changed files.

### 3.3 Integration Tests

```bash
docker compose -f docker-compose.test.yml up -d
pnpm --filter backend test:e2e
docker compose -f docker-compose.test.yml down -v
```

**Pass criteria:** 100% pass.

### 3.4 Security Tests

```bash
cd testing && pnpm test:security
```

**Pass criteria:** 100% pass. No SQLi / XSS / CSRF / rate-limit bypass detected.

### 3.5 Edge-Case Tests

```bash
cd testing && pnpm test:edge-cases
```

**Pass criteria:** 100% pass.

### 3.6 AI Evaluation Tests

```bash
cd testing && pnpm test:ai-eval
```

**Pass criteria:**
- Response accuracy: ≥ 90% of test cases pass keyword assertions
- Tool selection: ≥ 85% accuracy
- RAG precision: MRR > 0.7, Precision@5 > 0.6
- Latency: simple query <2s, RAG query <5s

### 3.7 Portal Tests (Playwright)

```bash
# Start each portal dev server, then:
cd testing
E2E_CUSTOMER_BASE_URL=http://localhost:3005 npx playwright test portals/customer
E2E_DISTRIBUTOR_BASE_URL=http://localhost:3006 npx playwright test portals/distributor
E2E_EMPLOYEE_BASE_URL=http://localhost:3007 npx playwright test portals/employee
E2E_ADMIN_BASE_URL=http://localhost:3001 npx playwright test portals/admin
```

**Pass criteria:** 100% pass on Chromium. ≥ 95% pass on WebKit + Mobile Chrome (cosmetic failures may be deferred with PM approval).

### 3.8 Full E2E

```bash
docker compose up -d
pnpm test:e2e
```

**Pass criteria:** 100% pass.

### 3.9 Recording Results

Record the test results in the release ticket:

```
## Test Results — Release v1.4.0

| Suite             | Pass | Fail | Skip | Coverage |
| ----------------- | ---- | ---- | ---- | -------- |
| Backend unit      | 487  | 0    | 0    | 84.2%    |
| Customer unit     | 124  | 0    | 0    | 67.1%    |
| Distributor unit  | 86   | 0    | 0    | 64.3%    |
| Employee unit     | 92   | 0    | 0    | 62.8%    |
| Admin unit        | 78   | 0    | 0    | 61.5%    |
| Integration       | 142  | 0    | 0    | n/a      |
| Security          | 187  | 0    | 0    | n/a      |
| Edge cases        | 105  | 0    | 0    | n/a      |
| AI evaluation     | 47   | 0    | 0    | n/a      |
| Portal (4 suites) | 312  | 0    | 0    | n/a      |
| E2E               | 38   | 0    | 0    | n/a      |
```

---

## 4. Performance Benchmarks

Run the performance suite against staging with the new build deployed.

### 4.1 Load Tests

```bash
PERF_BASE_URL=https://staging.dayjoy.ai \
  pnpm --filter dayjoy-testing test:performance -- load.test.ts
```

**Pass criteria:**

| Metric                          | SLO        |
| ------------------------------- | ---------- |
| 100 concurrent GETs p95 latency | < 500ms    |
| 50 concurrent AI queries p95    | < 5s       |
| Mixed workload success rate     | > 95%      |
| Error rate under load           | < 1%       |

### 4.2 Stress Tests

```bash
PERF_BASE_URL=https://staging.dayjoy.ai \
  pnpm --filter dayjoy-testing test:performance -- stress.test.ts
```

**Pass criteria:**

| Metric                              | SLO         |
| ----------------------------------- | ----------- |
| 500 concurrent users success rate   | ≥ 95%       |
| 1000 concurrent users success rate  | ≥ 80%       |
| No 5xx errors under stress          | 0           |
| Recovery time after stress          | < 2s        |

### 4.3 Soak Test (Minor + Major releases only)

```bash
PERF_BASE_URL=https://staging.dayjoy.ai \
  pnpm --filter dayjoy-testing test:performance -- soak.test.ts
```

**Pass criteria:**

| Metric                              | SLO          |
| ----------------------------------- | ------------ |
| Memory growth over 1 hour           | < 50MB       |
| p95 latency at end vs start         | < 2x         |
| Error rate over 1 hour              | < 0.1%       |

### 4.4 Regression Check

Compare this release's benchmarks against the previous release. A regression of >10% on any metric blocks the release.

```bash
# Generate the benchmark JSON
PERF_BASE_URL=https://staging.dayjoy.ai \
  pnpm --filter dayjoy-testing test:performance -- --reporter=json > perf-v1.4.0.json

# Compare against the previous release
node scripts/compare-perf.js perf-v1.3.0.json perf-v1.4.0.json
```

---

## 5. Security Scan

### 5.1 Snyk (Dependency Scan)

```bash
pnpm audit --audit-level=high
```

**Pass criteria:** No high or critical vulnerabilities in production dependencies. Medium vulnerabilities are allowed with a follow-up ticket.

### 5.2 Semgrep (Static Analysis)

```bash
semgrep --config=p/owasp-top-ten --config=p/nodejs --config=p/typescript .
```

**Pass criteria:** Zero high/critical findings. Medium findings are allowed with a follow-up ticket.

### 5.3 Secret Scan

```bash
gitleaks detect --source . --report-path secrets.json
```

**Pass criteria:** Zero secrets detected.

### 5.4 SSL/TLS Check

```bash
testssl --severity HIGH https://staging.dayjoy.ai
```

**Pass criteria:** All checks pass. Certificate is valid for ≥ 30 more days.

### 5.5 Recording Results

```
## Security Scan Results — Release v1.4.0

| Scan        | Findings (Critical / High / Medium / Low) |
| ----------- | ----------------------------------------- |
| Snyk        | 0 / 0 / 2 / 5                              |
| Semgrep     | 0 / 0 / 1 / 3                              |
| Gitleaks    | 0 / 0 / 0 / 0                              |
| SSL/TLS     | All pass                                   |
```

---

## 6. Manual Smoke Test

Run through the following checklist in the staging environment. Each item should take 1–2 minutes. The full smoke test takes ~30 minutes.

### 6.1 Customer Portal Smoke Test

- [ ] Login as a customer (customer@example.com / Customer#2024)
- [ ] Dashboard renders with welcome message + recent orders
- [ ] Browse products → search "wellness" → see results
- [ ] Open a product → click "Add to cart" → cart badge increments
- [ ] Open cart → see the line item → checkout (use mock payment)
- [ ] Open orders → see the new order at the top
- [ ] Open AI assistant → send "What is the return policy?" → get a response
- [ ] Open support → create a ticket → see it in the ticket list
- [ ] Logout → redirected to login page

### 6.2 Distributor Portal Smoke Test

- [ ] Login as a distributor (distributor@dayjoy.ai / Distributor#2024)
- [ ] Dashboard renders with sales + commission + team KPIs
- [ ] Open team page → see downline tree
- [ ] Open sales page → see trend chart + top products
- [ ] Open commissions page → see commission list
- [ ] Open leads page → see kanban → create a new lead
- [ ] Convert the lead → see success message
- [ ] Logout

### 6.3 Employee Portal Smoke Test

- [ ] Login as an employee (employee@dayjoy.ai / Employee#2024)
- [ ] Dashboard renders with KPIs + today's tasks + recent tickets
- [ ] Open tasks page → see task list → mark one complete
- [ ] Open tickets page → see ticket list → open one → reply
- [ ] Open CRM → search for a customer → see results
- [ ] Open attendance → check in → check out
- [ ] Logout

### 6.4 Admin Dashboard Smoke Test

- [ ] Login as an admin (admin@dayjoy.ai / Admin#2024)
- [ ] Dashboard renders with KPIs + charts + activity feed + system health
- [ ] Open users page → search for a user → edit their role
- [ ] Open analytics page → see voice / AI / sales tabs
- [ ] Create a new user → see them in the list
- [ ] Logout

### 6.5 Voice AI Smoke Test

- [ ] Call the staging voice number (+91 XXXXX XXXXX)
- [ ] Greeting plays ("Hi, this is Dayjoy AI...")
- [ ] Say "I want to know about the return policy"
- [ ] AI responds with the policy summary
- [ ] Say "Talk to a human" → call is queued for transfer
- [ ] Hang up → call summary appears in the admin dashboard within 1 min

### 6.6 WhatsApp AI Smoke Test

- [ ] Send "Hi" to the staging WhatsApp number
- [ ] AI responds with a greeting
- [ ] Send "Where is my order?" → AI responds with order status
- [ ] Send "I have a complaint" → AI creates a support ticket + confirms
- [ ] Verify the conversation appears in the admin WhatsApp console

### 6.7 Recording Smoke Test Results

```
## Manual Smoke Test — Release v1.4.0

**Tester:** <name>
**Date:** 2024-05-15
**Environment:** staging (v1.4.0-rc.3)

### Customer Portal
- [x] Login
- [x] Dashboard
- [x] Products browse + search
- [x] Add to cart + checkout
- [x] Orders list
- [x] AI assistant
- [x] Support ticket creation
- [x] Logout

### Distributor Portal
- [x] Login + dashboard
- [x] Team tree
- [x] Sales chart
- [x] Commissions list
- [x] Lead pipeline + create + convert
- [x] Logout

(continue for all sections)

**Issues found:** 0
**Smoke test result:** PASS
```

---

## 7. Sign-off Process

### 7.1 Required Sign-offs

| Role               | Sign-off required for              |
| ------------------ | --------------------------------- |
| QA lead            | Test suite + smoke test           |
| Security engineer  | Security scan                     |
| DevOps engineer    | Performance + deployment readiness|
| Product manager    | Feature completeness + smoke test |
| Engineering manager| Final go/no-go                    |

### 7.2 Sign-off Format

Each sign-off is recorded as a comment on the release ticket:

```
## QA Sign-off — Release v1.4.0

**Tester:** <name>
**Date:** 2024-05-15

All test suites pass:
- Backend unit: 487/487
- Integration: 142/142
- Security: 187/187
- Edge cases: 105/105
- AI evaluation: 47/47
- Portal (4 suites): 312/312
- E2E: 38/38

Manual smoke test: PASS (0 issues)

Coverage: 84.2% line / 78.6% branch (meets target)

**Decision:** APPROVED for release.
```

### 7.3 Sign-off Rejection

Any sign-off may be rejected. Rejection blocks the release until the issue is resolved. The rejection comment must include:

1. The specific issue (failed test, perf regression, smoke test failure, etc.)
2. The remediation plan
3. The expected re-sign-off date

### 7.4 Final Go/No-Go

The release manager schedules a 30-minute go/no-go meeting after all sign-offs are collected. The meeting:

1. Reviews the release ticket
2. Confirms all sign-offs are in
3. Confirms the rollback plan is ready (§8)
4. Makes the final go/no-go decision

If "go", the release manager tags the release + notifies DevOps to deploy.

---

## 8. Rollback Plan

Every release must have a documented rollback plan BEFORE deployment.

### 8.1 Application Rollback

```bash
# Roll back to the previous Docker image tag
kubectl set image deployment/dayjoy-backend \
  dayjoy-backend=registry.dayjoy.ai/dayjoy-backend:v1.3.2 \
  -n production

# Wait for the rollout to complete
kubectl rollout status deployment/dayjoy-backend -n production
```

**Expected time:** 2 minutes.

### 8.2 Database Rollback

If the release included a Prisma migration:

```bash
# 1. Apply the down-migration
prisma migrate resolve --rolled-back <migration_name> \
  --schema database/prisma/schema.prisma

# 2. Restore from backup (if data was lost)
pg_restore --dbname $DATABASE_URL \
  --clean --if-exists \
  /backups/dayjoy_ai_2024-05-15_10-00.sql
```

**Expected time:** 5–30 minutes (depending on backup size).

### 8.3 Configuration Rollback

If the release included config changes (env vars, feature flags):

```bash
# Revert the ConfigMap
kubectl rollout undo configmap/dayjoy-config -n production

# Restart pods to pick up the reverted config
kubectl rollout restart deployment/dayjoy-backend -n production
```

**Expected time:** 3 minutes.

### 8.4 Rollback Triggers

Roll back immediately if ANY of:

- Error rate > 5% for 5 consecutive minutes
- p95 latency > 2s for 5 consecutive minutes
- Any Sev-1 bug is reported
- The on-call engineer decides to roll back (gut feel counts)

### 8.5 Rollback Drill

A rollback drill is run quarterly to verify the rollback plan works. The drill:

1. Picks a non-critical time (Sunday 2 AM IST)
2. Deploys a "bad" release (one that returns 500s)
3. Verifies the alerts fire
4. Rolls back
5. Verifies the system recovers
6. Documents the drill results

---

## 9. Post-Release Monitoring

### 9.1 First 24 Hours

The on-call engineer monitors:

- **Grafana dashboards:** "Dayjoy Overview", "Dayjoy AI Quality", "Dayjoy Performance Benchmarks"
- **Alerts:** any Sev-1/2 alert triggers a page
- **Slack:** `#releases`, `#incidents`, `#bug-reports`
- **Status page:** status.dayjoy.ai (update within 15 min of any incident)

### 9.2 First Week

The QA team runs:

- The full performance suite against production (off-peak hours)
- A subset of the E2E suite against production (read-only paths)
- A manual smoke test on production (same checklist as §6)

### 9.3 Release Retro

Within 1 week of the release, the release manager schedules a 30-minute retro:

- What went well
- What didn't go well
- Action items for the next release

---

## Appendix A: Release Ticket Template

```markdown
---
**Title:** Release v1.4.0
**Owner:** <release manager>
**Target date:** 2024-05-20
**Status:** In Progress
---

## Scope

- Feature A (#1234)
- Feature B (#1235)
- Bug fixes: #1236, #1237, #1238

## Validation

- [ ] Lint + typecheck pass
- [ ] Unit tests pass (link to CI run)
- [ ] Integration tests pass
- [ ] Security tests pass
- [ ] Edge-case tests pass
- [ ] AI evaluation tests pass
- [ ] Portal tests pass
- [ ] E2E tests pass
- [ ] Coverage meets target

## Performance

- [ ] Load tests pass
- [ ] Stress tests pass
- [ ] Soak test passes (minor/major only)
- [ ] No >10% regression vs v1.3.0

## Security

- [ ] Snyk clean
- [ ] Semgrep clean
- [ ] Gitleaks clean
- [ ] SSL/TLS valid

## Manual Smoke Test

- [ ] Customer portal
- [ ] Distributor portal
- [ ] Employee portal
- [ ] Admin dashboard
- [ ] Voice AI
- [ ] WhatsApp AI

## Sign-offs

- [ ] QA lead
- [ ] Security engineer
- [ ] DevOps engineer
- [ ] Product manager
- [ ] Engineering manager (final go/no-go)

## Rollback Plan

- App rollback: <command>
- DB rollback: <command>
- Config rollback: <command>
- Rollback triggers: error rate >5%, p95 >2s, Sev-1 bug

## Deployment

- Canary: 5% at <time>, 25% at <time>, 50% at <time>, 100% at <time>
- Verified by: <name>

## Post-Release

- [ ] 24h monitoring complete
- [ ] 1-week perf + smoke test complete
- [ ] Retro scheduled
```

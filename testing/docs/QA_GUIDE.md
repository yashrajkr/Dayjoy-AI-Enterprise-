# Dayjoy AI Enterprise — QA Guide

This guide is the canonical reference for how quality is defined, measured, and enforced on the Dayjoy AI Enterprise Platform. It is owned by the QA team and updated whenever the test strategy, tooling, or coverage targets change.

---

## 1. Testing Strategy

### 1.1 Test Pyramid

We follow a classic test pyramid with three tiers. The proportions below are guidelines — individual modules may deviate when justified.

| Tier            | Proportion | Tooling                  | Run Frequency            |
| --------------- | ---------- | ------------------------ | ------------------------ |
| Unit            | 60%        | Vitest + @nestjs/testing | Every commit (CI)        |
| Integration     | 30%        | Vitest + supertest       | Every PR (CI)            |
| End-to-end      | 10%        | Playwright               | Nightly + pre-release    |

### 1.2 Coverage Targets

| Surface                  | Line Coverage | Branch Coverage |
| ------------------------ | ------------- | --------------- |
| Backend (`backend/`)     | ≥ 80%         | ≥ 75%           |
| RAG (`rag/`)             | ≥ 80%         | ≥ 75%           |
| Frontend portals         | ≥ 60%         | ≥ 55%           |
| Voice (Vapi)             | ≥ 70%         | ≥ 65%           |
| WhatsApp                 | ≥ 70%         | ≥ 65%           |
| Critical paths (E2E)     | 100% manual   | n/a             |

Coverage is enforced by `vitest --coverage` and reported as a comment on every PR. A drop of more than 2% on a changed file blocks the merge.

### 1.3 Quality Gates

A PR may not merge until ALL of the following pass:

1. **Lint** — `pnpm lint` (ESLint + Prettier) with zero errors
2. **Type check** — `pnpm typecheck` (tsc --noEmit) with zero errors
3. **Unit tests** — 100% pass, no skipped tests
4. **Integration tests** — 100% pass
5. **Coverage** — meets the targets above for changed files
6. **Code review** — at least 2 reviewers, one of whom is a senior engineer
7. **Security scan** — Snyk + Semgrep clean (no high/critical vulnerabilities)

---

## 2. Test Categories

The Dayjoy test suite is organised into the following categories. Each lives in its own subfolder under `testing/` and has its own command + CI job.

### 2.1 Unit Tests (`backend/**/*.spec.ts`, `apps/**/*.test.tsx`)

**Purpose:** Verify individual functions + classes in isolation. All external dependencies are mocked.

**Examples:**

- `auth.service.spec.ts` — `AuthService.login()` with mocked Prisma + Redis
- `ai.service.spec.ts` — `AiService.findAll()` with mocked Prisma
- `permissions.guard.spec.ts` — RBAC guard with mocked Reflector + Prisma
- `cart.store.test.tsx` — Zustand store with mocked localStorage

**Run:**

```bash
pnpm --filter backend test          # backend unit tests
pnpm --filter customer-portal test  # frontend unit tests
pnpm --filter distributor-portal test
pnpm --filter employee-portal test
pnpm --filter admin-dashboard test
```

### 2.2 Integration Tests (`backend/test/*.e2e.spec.ts`, `apps/**/tests/integration/`)

**Purpose:** Verify modules work together with real DB + Redis (Docker Compose) but mocked external APIs (OpenAI, Vapi, WhatsApp).

**Examples:**

- `auth.e2e.spec.ts` — full login → refresh → logout flow with real Postgres + Redis
- `orders.e2e.spec.ts` — create order → add items → checkout → invoice with real DB
- `ai.e2e.spec.ts` — conversation create → send message → retrieve history with real DB

**Run:**

```bash
docker compose up -d postgres redis
pnpm --filter backend test:e2e
```

### 2.3 API Tests (`testing/security/`, `testing/edge-cases/`)

**Purpose:** Verify HTTP-level contracts: status codes, response shapes, error envelopes, security headers, edge-case inputs.

**Examples:**

- `authentication.test.ts` — login / logout / refresh lifecycle
- `authorization.test.ts` — RBAC enforcement across every endpoint
- `sql-injection.test.ts` — 15 SQLi payloads × every input vector
- `xss.test.ts` — 15 XSS payloads × every stored + reflected surface
- `csrf.test.ts` — token enforcement + rotation
- `rate-limiting.test.ts` — per-email / per-IP / per-endpoint limits

**Run:**

```bash
pnpm --filter dayjoy-testing test:security
pnpm --filter dayjoy-testing test:edge-cases
```

### 2.4 Portal Tests (`testing/portals/`)

**Purpose:** Verify each portal's UI renders + behaves correctly end-to-end. Uses Playwright against a live portal dev server with the mock backend.

**Coverage:**

- **Customer Portal** — auth, dashboard, products, orders, AI assistant, support
- **Distributor Portal** — dashboard, team, sales, earnings, commissions, leads
- **Employee Portal** — dashboard, tasks, CRM, tickets, attendance
- **Admin Dashboard** — dashboard, users, analytics

**Run:**

```bash
# Start the customer portal dev server
pnpm --filter customer-portal dev &

# Run the portal tests
cd testing && npx playwright test portals/customer
```

### 2.5 Performance Tests (`testing/performance/`)

**Purpose:** Verify the system meets its latency + throughput SLOs under expected + peak load.

**Sub-categories:**

- **Load tests** — normal expected load (100 concurrent users)
- **Stress tests** — beyond expected load (500–1000 concurrent users)
- **Soak tests** — sustained load over 1 hour (memory leak detection)
- **Scalability tests** — horizontal scaling (1 → 2 → 4 replicas)

**Run:**

```bash
pnpm --filter dayjoy-testing test:performance
```

### 2.6 AI Evaluation (`testing/ai-eval/`)

**Purpose:** Verify the AI assistant's quality across five dimensions:

- **Response accuracy** — 20+ test cases with expected keywords
- **Tool selection** — correct tool invoked per intent (7 tool types)
- **Memory accuracy** — short-term + long-term memory persistence
- **RAG precision** — Top-1/3/5 accuracy, MRR, Precision@K
- **Latency** — simple query <2s, RAG query <5s, streaming first token <500ms

**Run:**

```bash
pnpm --filter dayjoy-testing test:ai-eval
```

### 2.7 End-to-End Tests (`testing/e2e/`)

**Purpose:** Verify the full user journey from browser → frontend → API → DB → external services. Uses Playwright with the real browser.

**Examples:**

- `dashboard.spec.ts` — admin logs in → sees KPIs → navigates to customers
- `customer-order.spec.ts` — customer logs in → browses → adds to cart → checks out
- `distributor-lead.spec.ts` — distributor logs in → creates lead → converts to customer

**Run:**

```bash
pnpm test:e2e
```

---

## 3. Test Environment

### 3.1 Unit Tests

- **Backend:** in-memory mocks (`createMockPrismaService`, `createMockRedis`)
- **Frontend:** jsdom (Vitest's `environment: 'jsdom'`)
- **No external services required** — runs in <30 seconds total

### 3.2 Integration Tests

- **Database:** Docker Compose Postgres 16 on port 5432 (database `dayjoy_ai_test`)
- **Redis:** Docker Compose Redis 7 on port 6379 (db 1 for tests)
- **External APIs:** mocked via `nock` or `msw`

```bash
docker compose -f docker-compose.test.yml up -d
pnpm --filter backend test:e2e
docker compose -f docker-compose.test.yml down -v
```

### 3.3 E2E Tests

- **Full stack** — Docker Compose with backend + frontend + Postgres + Redis + MinIO
- **Browser** — Playwright-managed Chromium + WebKit
- **Test data** — seeded via `database/seed/seed.ts` against a dedicated test tenant

### 3.4 Performance Tests

- **Staging backend** — the performance tests run against the staging environment (not the mock)
- **Load generator** — the tests themselves use `Promise.all` + `fetch` (no external load tool needed)
- **Metrics** — captured via the backend's Prometheus endpoint + Grafana dashboard

---

## 4. Running Tests

### 4.1 Locally

```bash
# Everything (unit + integration)
pnpm test

# Just backend unit tests
pnpm --filter backend test

# Just frontend unit tests
pnpm --filter customer-portal test

# Integration tests (needs Docker)
docker compose up -d postgres redis
pnpm --filter backend test:e2e

# E2E
pnpm test:e2e

# Performance (against staging)
pnpm --filter dayjoy-testing test:performance

# AI evaluation (against staging or mock)
pnpm --filter dayjoy-testing test:ai-eval

# Coverage report
pnpm --filter backend test:coverage
open backend/coverage/index.html
```

### 4.2 CI (GitHub Actions)

The CI pipeline is defined in `.github/workflows/`. It runs in this order:

1. **lint + typecheck** (parallel, ~1 min)
2. **unit tests** (per workspace, parallel, ~3 min)
3. **integration tests** (sequential, ~5 min)
4. **security tests** (~2 min)
5. **edge-case tests** (~2 min)
6. **coverage report** (uploaded as artifact)
7. **E2E** (only on `main` + release branches, ~10 min)
8. **performance** (nightly cron only, ~30 min)
9. **AI evaluation** (nightly cron only, ~15 min)

A PR is mergeable once steps 1–6 pass. Steps 7–9 run on the merge commit.

---

## 5. Test Data Management

### 5.1 Fixtures (static)

Located in `testing/helpers/fixtures.ts`. Used by every test that needs a stable, deterministic dataset:

- 12 users (1 per role + locked / pending / terminated / cross-tenant)
- 4 products (across 4 categories, 1 out-of-stock)
- 4 orders (1 per status)
- 3 support tickets (1 per status)
- 3 leads (1 per pipeline stage)
- 2 commissions (paid + pending)
- 3 tasks (open / in-progress / done)
- 2 attendance records (checked-in / completed)
- 3 FAQs + 2 KB articles

### 5.2 Factories (dynamic)

For tests that need unique data per run (e.g. registration tests), use the factory pattern:

```typescript
function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: `usr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    email: `test-${Date.now()}@example.com`,
    password: 'TestPass#2024',
    firstName: 'Test',
    lastName: 'User',
    ...overrides,
  };
}
```

### 5.3 Database Seeding

Integration + E2E tests run against a seeded test database:

```bash
DATABASE_URL=postgres://localhost/dayjoy_ai_test pnpm db:seed
```

The seed script (`database/seed/seed.ts`) is idempotent — running it twice produces the same state.

### 5.4 Cleanup

- **Unit tests:** no cleanup needed (mocks are reset between cases via `beforeEach`)
- **Integration tests:** the test database is wiped between test files via a `beforeAll` hook
- **E2E tests:** the test tenant is reset between test runs via a `__mock/reset` API call

---

## 6. Continuous Integration

### 6.1 PR Pipeline (runs on every PR)

1. Lint + typecheck
2. Unit tests (per workspace)
3. Integration tests
4. Security tests
5. Edge-case tests
6. Coverage report

**Mergeable when:** all 6 pass + 2 code reviews.

### 6.2 Nightly Pipeline (runs at 02:00 UTC)

1. Full unit + integration suite
2. E2E suite
3. Performance tests (load + stress + soak)
4. AI evaluation suite
5. Security scan (Snyk + Semgrep)
6. Dependency audit (`pnpm audit`)

**Failure handling:** the on-call engineer is paged if nightly fails. A tracking issue is created automatically.

### 6.3 Pre-Release Pipeline (runs on release branch creation)

1. Everything from nightly
2. Manual smoke test (see `RELEASE_VALIDATION_GUIDE.md`)
3. Sign-off from QA lead + security + DevOps + product manager

---

## 7. Reporting

### 7.1 Coverage

- **Provider:** v8 (Vitest's default)
- **Reporters:** text (terminal), json (CI artifact), html (browseable)
- **Location:** `backend/coverage/`, `apps/*/coverage/`
- **Trend:** tracked in a Google Sheet, updated nightly

### 7.2 Test Results

- **Format:** JUnit XML (CI) + HTML (local)
- **Location:** `test-results/junit.xml`, `test-results/index.html`
- **Retention:** 90 days in CI artifact storage

### 7.3 Performance Benchmarks

- **Tool:** `vitest --reporter=json` + a custom benchmark parser
- **Metrics:** p50, p95, p99 latency; throughput (req/s); error rate
- **Trend:** Grafana dashboard "Dayjoy Performance Benchmarks"
- **Alerts:** p95 latency regression >20% triggers a Slack alert

### 7.4 AI Quality

- **Metrics:** response accuracy %, tool selection accuracy %, RAG MRR, hallucination rate
- **Trend:** Grafana dashboard "Dayjoy AI Quality"
- **Alerts:** accuracy drop >5% triggers a Slack alert to the AI team

---

## 8. Roles & Responsibilities

| Role             | Responsibility                                                       |
| ---------------- | ------------------------------------------------------------------- |
| QA Engineer      | Owns this guide + the test suite; reviews test plans                |
| Backend Engineer | Writes unit + integration tests for their module                    |
| Frontend Engineer| Writes unit tests for their portal; reviews portal E2E specs        |
| AI Engineer      | Writes + maintains the AI evaluation suite                          |
| DevOps           | Maintains CI pipelines + test infrastructure                       |
| Security         | Owns the security test suite; reviews threat models                |

---

## 9. Tooling

| Tool                | Purpose                              | Version |
| ------------------- | ----------------------------------- | ------- |
| Vitest              | Unit + integration test runner       | ^2.1.0  |
| @nestjs/testing     | Backend DI test module               | ^10.4.0 |
| @testing-library/react | Frontend component testing        | ^16.0.0 |
| Playwright          | E2E + portal tests                   | ^1.47.0 |
| supertest           | HTTP-level assertions                | ^7.0.0  |
| msw                 | Mock Service Worker (frontend)       | ^2.0.0  |
| Snyk                | Dependency vulnerability scanning    | latest  |
| Semgrep             | Static security analysis             | latest  |
| Lighthouse          | Frontend performance auditing         | latest  |

---

## 10. Test Anti-Patterns (Avoid)

1. **Testing the mock, not the code.** A test that asserts `prisma.user.findUnique` was called is testing the mock, not the code. Assert on the return value or the observable side effect.
2. **Shared state across tests.** Tests must be independent. Use `beforeEach` to reset state, not `beforeAll`.
3. **Sleep-based waits.** Prefer `waitFor` / `expect(...).toBeVisible({ timeout })` over `setTimeout`. Sleeps make tests flaky + slow.
4. **Brittle selectors.** Prefer `getByRole` + `getByLabel` over CSS selectors. CSS classes change; semantic roles don't.
5. **Testing implementation details.** Don't assert on internal function names or private methods. Assert on public behaviour.
6. **Skipping failing tests.** A skipped test is a known-broken contract. Fix it or delete it — never leave it skipped.
7. **100% coverage chasing.** 100% line coverage doesn't mean 100% behaviour coverage. Focus on meaningful assertions, not coverage numbers.

---

## 11. Change Log

| Date       | Change                                                  | Author       |
| ---------- | ------------------------------------------------------ | ------------ |
| 2024-05-15 | Initial QA Guide created                               | QA team      |
| 2024-05-20 | Added AI evaluation section                            | AI team      |
| 2024-05-25 | Added performance benchmarks reporting                 | DevOps       |
| 2024-06-01 | Added portal tests section (4 portals)                 | QA team      |
| 2024-06-10 | Tightened coverage targets (80% line, 75% branch)      | QA lead      |

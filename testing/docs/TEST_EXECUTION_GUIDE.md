# Dayjoy AI Enterprise — Test Execution Guide

Step-by-step guide for running the Dayjoy test suite locally and in CI. Pick the section that matches your goal.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start: Run Everything](#2-quick-start-run-everything)
3. [Running Unit Tests](#3-running-unit-tests)
4. [Running Integration Tests](#4-running-integration-tests)
5. [Running Security Tests](#5-running-security-tests)
6. [Running Edge-Case Tests](#6-running-edge-case-tests)
7. [Running Performance Tests](#7-running-performance-tests)
8. [Running AI Evaluation Tests](#8-running-ai-evaluation-tests)
9. [Running Portal Tests (Playwright)](#9-running-portal-tests-playwright)
10. [Running E2E Tests](#10-running-e2e-tests)
11. [Generating Coverage Reports](#11-generating-coverage-reports)
12. [Debugging Failed Tests](#12-debugging-failed-tests)
13. [CI Configuration](#13-ci-configuration)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

### 1.1 Local Development

| Tool      | Version  | Install                                              |
| --------- | -------- | --------------------------------------------------- |
| Node.js   | ≥ 18.0.0 | https://nodejs.org/                                  |
| pnpm      | ≥ 8.15.0 | `npm install -g pnpm`                                |
| Docker    | ≥ 24.0   | https://docs.docker.com/get-docker/                  |
| Postgres  | ≥ 16     | (via Docker Compose — no local install needed)       |
| Redis     | ≥ 7      | (via Docker Compose — no local install needed)       |
| Playwright| latest   | `npx playwright install` (run once after checkout)   |

### 1.2 First-Time Setup

```bash
# Clone the repo
git clone <repo-url> dayjoy-ai-enterprise
cd dayjoy-ai-enterprise

# Install dependencies
pnpm install

# Install Playwright browsers
cd testing/e2e && npx playwright install && cd ../..

# Copy env vars
cp .env.example .env
# Edit .env to set your local DATABASE_URL, REDIS_URL, OPENAI_API_KEY, etc.

# Start Postgres + Redis
docker compose up -d postgres redis

# Apply DB schema
pnpm db:generate
pnpm db:migrate

# Seed the DB
pnpm db:seed
```

---

## 2. Quick Start: Run Everything

```bash
# Run the entire test suite (unit + integration, no E2E/perf)
pnpm test

# Run lint + typecheck too
pnpm lint && pnpm typecheck && pnpm test
```

Expected runtime: ~5 minutes.

---

## 3. Running Unit Tests

### 3.1 Backend Unit Tests

```bash
# All backend unit tests
pnpm --filter backend test

# A specific spec file
pnpm --filter backend test -- auth/auth.service.spec.ts

# Watch mode (re-runs on file change)
pnpm --filter backend test:watch
```

### 3.2 Frontend Unit Tests

```bash
# Customer portal
pnpm --filter customer-portal test

# Distributor portal
pnpm --filter distributor-portal test

# Employee portal
pnpm --filter employee-portal test

# Admin dashboard
pnpm --filter admin-dashboard test
```

### 3.3 What They Cover

- Service-layer business logic (mocked Prisma + Redis)
- Zod / class-validator DTO validation
- Zustand store reducers
- React component rendering (Testing Library)

---

## 4. Running Integration Tests

Integration tests need a real Postgres + Redis. Use Docker Compose:

```bash
# Start the test DB + Redis
docker compose -f docker-compose.test.yml up -d

# Run the integration suite
pnpm --filter backend test:e2e

# Tear down (optional — keeps the DB between runs for speed)
docker compose -f docker-compose.test.yml down -v
```

### 4.1 What They Cover

- Full request lifecycle (controller → service → Prisma → DB)
- Real Postgres queries (no mocked Prisma)
- Real Redis rate-limiting + session blocklist
- Cross-module flows (auth → orders → invoices)

---

## 5. Running Security Tests

The security tests run against the in-memory mock backend (no Docker required):

```bash
cd testing

# Install testing-suite dependencies (first time only)
pnpm install

# Run all security tests
pnpm test:security

# Run a specific security test
pnpm test:security -- authentication.test.ts

# Run with verbose output
pnpm test:security -- --reporter=verbose
```

### 5.1 What They Cover

- Authentication (login / logout / refresh / password reset)
- Authorization (RBAC enforcement across every endpoint)
- SQL injection (15 payloads × every input vector)
- XSS (15 payloads × stored + reflected surfaces)
- CSRF (token enforcement + rotation)
- Rate limiting (per-email / per-IP / per-endpoint)

---

## 6. Running Edge-Case Tests

```bash
cd testing

# All edge cases (100+ scenarios)
pnpm test:edge-cases

# A specific edge-case category
pnpm test:edge-cases -- customer.test.ts
pnpm test:edge-cases -- distributor.test.ts
pnpm test:edge-cases -- employee.test.ts
pnpm test:edge-cases -- admin.test.ts
pnpm test:edge-cases -- system.test.ts
```

---

## 7. Running Performance Tests

Performance tests run against either the mock backend (hermetic) or the staging backend (realistic). The default is the mock backend.

### 7.1 Hermetic (Mock Backend)

```bash
cd testing
pnpm test:performance
```

### 7.2 Against Staging

```bash
# 1. Set the staging URL
export PERF_BASE_URL=https://staging.dayjoy.ai

# 2. Run the load tests
pnpm test:performance -- load.test.ts

# 3. Run the stress tests (WARNING: may impact staging performance)
pnpm test:performance -- stress.test.ts

# 4. Run the soak tests (WARNING: takes 1 hour)
pnpm test:performance -- soak.test.ts
```

### 7.3 Interpreting Results

The tests print a summary table:

```
✓ Load — 100 concurrent GET /api/products (all 200, <5s)  [245ms]
  → successRate=100%, p95=42ms, throughput=408 req/s
```

If a test fails, the assertion message tells you which SLO was violated:

```
expected 5234 to be less than 5000  (p95 latency regression)
```

---

## 8. Running AI Evaluation Tests

```bash
cd testing
pnpm test:ai-eval

# Specific dimension
pnpm test:ai-eval -- response-accuracy.test.ts
pnpm test:ai-eval -- tool-selection.test.ts
pnpm test:ai-eval -- memory-accuracy.test.ts
pnpm test:ai-eval -- rag-precision.test.ts
pnpm test:ai-eval -- latency.test.ts
```

### 8.1 Running Against Production OpenAI

By default the AI eval suite uses the mock backend (no OpenAI calls). To run against real OpenAI:

```bash
export OPENAI_API_KEY=sk-...
export AI_EVAL_LIVE=1
pnpm test:ai-eval
```

This will incur OpenAI API costs (~$2 per full run).

---

## 9. Running Portal Tests (Playwright)

Portal tests target a live portal dev server. Start the dev server first, then run the tests.

### 9.1 Customer Portal

```bash
# Terminal 1: start the dev server
pnpm --filter customer-portal dev

# Terminal 2: run the portal tests
cd testing
E2E_CUSTOMER_BASE_URL=http://localhost:3005 npx playwright test portals/customer
```

### 9.2 Distributor Portal

```bash
pnpm --filter distributor-portal dev &
cd testing
E2E_DISTRIBUTOR_BASE_URL=http://localhost:3006 npx playwright test portals/distributor
```

### 9.3 Employee Portal

```bash
pnpm --filter employee-portal dev &
cd testing
E2E_EMPLOYEE_BASE_URL=http://localhost:3007 npx playwright test portals/employee
```

### 9.4 Admin Dashboard

```bash
pnpm --filter admin-dashboard dev &
cd testing
E2E_ADMIN_BASE_URL=http://localhost:3001 npx playwright test portals/admin
```

### 9.5 UI Mode (Interactive)

```bash
cd testing
npx playwright test --ui
```

This opens a browser UI where you can step through tests, watch them run, and inspect failures.

---

## 10. Running E2E Tests

E2E tests run the full stack (frontend + backend + DB + Redis). They're the slowest suite.

```bash
# Start the full stack
docker compose up -d

# Wait for health
curl http://localhost:8000/api/health  # wait for {"status":"ok"}

# Run the E2E suite
pnpm test:e2e

# Run a specific spec
cd testing/e2e && npx playwright test dashboard.spec.ts
```

### 10.1 Viewing the HTML Report

```bash
cd testing/e2e
npx playwright show-report
```

This opens a browser with screenshots, videos, and traces for every test.

---

## 11. Generating Coverage Reports

```bash
# Backend coverage
pnpm --filter backend test:coverage
open backend/coverage/index.html

# Frontend coverage (per portal)
pnpm --filter customer-portal test:coverage
open apps/customer-portal/coverage/index.html
```

### 11.1 Coverage Thresholds

The CI build fails if coverage drops below:

| Surface                  | Line  | Branch |
| ------------------------ | ----- | ------ |
| Backend                  | 80%   | 75%    |
| RAG                      | 80%   | 75%    |
| Frontend portals         | 60%   | 55%    |

---

## 12. Debugging Failed Tests

### 12.1 Run a Single Test

```bash
# Vitest (unit/integration/security/perf/ai-eval/edge-cases)
pnpm test -- -t "should return 200 + accessToken"

# Playwright (portal/e2e)
npx playwright test -g "login page renders"
```

### 12.2 Verbose Output

```bash
pnpm test -- --reporter=verbose
```

### 12.3 Vitest UI

```bash
pnpm test:watch -- --ui
```

### 12.4 Playwright Trace Viewer

```bash
# After a failed Playwright run:
npx playwright show-trace test-results/.../trace.zip
```

### 12.5 Common Failures

| Symptom                              | Likely Cause                                | Fix                                          |
| ------------------------------------ | ------------------------------------------ | -------------------------------------------- |
| `ECONNREFUSED 127.0.0.1:5432`        | Postgres not running                        | `docker compose up -d postgres`              |
| `ECONNREFUSED 127.0.0.1:6379`        | Redis not running                           | `docker compose up -d redis`                 |
| `Cannot find module '@prisma/client'`| Prisma not generated                        | `pnpm db:generate`                           |
| `JWT_SECRET is not defined`          | Missing .env                                | `cp .env.example .env` + fill in values      |
| `Browser was not found`              | Playwright browsers not installed           | `npx playwright install`                     |
| Test passes locally, fails in CI     | Timezone or env-var difference              | Compare `process.env` between local + CI      |
| Flaky test (passes 80% of the time)  | Race condition or sleep-based wait          | Replace `setTimeout` with `waitFor`           |

---

## 13. CI Configuration

### 13.1 Workflow Files

- `.github/workflows/ci.yml` — runs on every PR (lint + unit + integration + security + edge-case)
- `.github/workflows/nightly.yml` — runs at 02:00 UTC (full suite + perf + AI eval)
- `.github/workflows/release.yml` — runs on release branch creation (full suite + manual smoke)

### 13.2 CI Caching

- **pnpm store** — cached by `actions/setup-node@v4` with `cache: 'pnpm'`
- **Playwright browsers** — cached by `actions/cache@v4` keyed on `playwright.config.ts` hash
- **Docker layers** — cached by `docker/build-push-action@v5` with `cache-from: type=gha`

### 13.3 Parallelism

- Unit tests run in parallel across 4 workers per workspace
- Integration tests run sequentially (shared DB)
- Portal tests run in parallel across 3 projects (chromium, webkit, mobile-chrome)

### 13.4 Fail-Fast

CI is configured with `fail-fast: false` so all test failures are reported in a single run (not stopped at the first failure).

---

## 14. Troubleshooting

### 14.1 "Test runner out of memory"

```bash
# Increase Node's heap limit
NODE_OPTIONS=--max-old-space-size=4096 pnpm test
```

### 14.2 "Too many open files"

On macOS, the default `ulimit -n` is 256. Bump it:

```bash
ulimit -n 10240
pnpm test
```

### 14.3 "Port 3000 already in use"

```bash
# Find the process
lsof -i :3000

# Kill it
kill -9 <pid>
```

### 14.4 "Docker daemon not running"

```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker
```

### 14.5 "pnpm install fails with peer dep errors"

```bash
pnpm install --shamefully-hoist
```

### 14.6 Reporting a Test Infrastructure Bug

Open an issue in the `dayjoy-ai-enterprise` repo with:

1. The exact command you ran
2. The full error output
3. Your OS + Node version (`node --version`)
4. The output of `pnpm --version` and `docker --version`

---

## Appendix A: Test Suite Cheat Sheet

| Command                                          | Suite              | Runtime     | Needs Docker |
| ------------------------------------------------ | ------------------ | ----------- | ------------ |
| `pnpm --filter backend test`                     | Backend unit       | ~30s        | No           |
| `pnpm --filter customer-portal test`             | Customer unit      | ~20s        | No           |
| `pnpm --filter backend test:e2e`                 | Backend integration| ~3min       | Yes          |
| `pnpm --filter dayjoy-testing test:security`     | Security           | ~30s        | No           |
| `pnpm --filter dayjoy-testing test:edge-cases`   | Edge cases         | ~30s        | No           |
| `pnpm --filter dayjoy-testing test:performance`  | Performance        | ~5min       | No (mock)    |
| `pnpm --filter dayjoy-testing test:ai-eval`      | AI evaluation      | ~2min       | No (mock)    |
| `npx playwright test portals/customer`           | Customer portal    | ~2min       | No           |
| `pnpm test:e2e`                                  | Full E2E           | ~10min      | Yes          |

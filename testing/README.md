# Dayjoy AI Enterprise — Testing

This folder contains the **production testing framework** for the Dayjoy AI Enterprise Platform. It complements the per-workspace unit + integration tests that live alongside their source code (`backend/*.spec.ts`, `apps/*/tests/`).

## Structure

```
testing/
├── README.md                    ← this file
├── production-checklist.md      ← pre-release release checklist (14 sections)
├── package.json                 ← testing-suite dependencies + scripts
├── vitest.config.ts             ← shared Vitest config (security/perf/ai-eval/edge-cases)
├── tsconfig.json                ← shared TypeScript config
│
├── helpers/                     ← shared test infrastructure
│   ├── fixtures.ts              ← static test data (12 users, 4 products, 4 orders, ...)
│   ├── mock-backend.ts          ← in-memory mock NestJS backend (zero-dep, <5ms startup)
│   ├── http.ts                  ← fetch wrapper + concurrent() + sustained() helpers
│   ├── mock-external.ts         ← OpenAI / Vapi / WhatsApp / RAG retriever mocks
│   └── index.ts                 ← barrel export
│
├── portals/                     ← portal E2E tests (Playwright)
│   ├── playwright.config.ts
│   ├── customer/                ← 6 test files (auth, dashboard, products, orders, AI, support)
│   ├── distributor/             ← 6 test files (dashboard, team, sales, earnings, commissions, leads)
│   ├── employee/                ← 5 test files (dashboard, tasks, crm, tickets, attendance)
│   └── admin/                   ← 3 test files (dashboard, users, analytics)
│
├── security/                    ← 7 test files
│   ├── authentication.test.ts
│   ├── authorization.test.ts
│   ├── rbac.test.ts
│   ├── sql-injection.test.ts
│   ├── xss.test.ts
│   ├── csrf.test.ts
│   └── rate-limiting.test.ts
│
├── performance/                 ← 4 test files
│   ├── load.test.ts             ← normal expected load (100 concurrent)
│   ├── stress.test.ts           ← beyond expected load (500-1000 concurrent)
│   ├── soak.test.ts             ← sustained load (memory leak detection)
│   └── scalability.test.ts      ← horizontal scaling (1/2/4 replicas)
│
├── ai-eval/                     ← 5 test files
│   ├── response-accuracy.test.ts   ← 20+ test cases with keyword assertions
│   ├── tool-selection.test.ts      ← 7 tool types + multi-step flows
│   ├── memory-accuracy.test.ts     ← short-term + long-term memory
│   ├── rag-precision.test.ts       ← Top-K accuracy, MRR, Precision@K
│   └── latency.test.ts             ← simple <2s, RAG <5s, streaming <500ms
│
├── edge-cases/                  ← 5 test files, 100+ scenarios
│   ├── customer.test.ts         ← 25 scenarios
│   ├── distributor.test.ts      ← 20 scenarios
│   ├── employee.test.ts         ← 20 scenarios
│   ├── admin.test.ts            ← 15 scenarios
│   └── system.test.ts           ← 20 scenarios
│
├── docs/                        ← QA documentation
│   ├── QA_GUIDE.md              ← testing strategy + categories + coverage targets
│   ├── TEST_EXECUTION_GUIDE.md  ← how to run each test category locally + CI
│   ├── BUG_REPORTING_GUIDE.md   ← severity levels + bug report template + SLA
│   └── RELEASE_VALIDATION_GUIDE.md ← pre-release validation process + sign-offs
│
└── e2e/                         ← existing Playwright E2E tests
    ├── playwright.config.ts
    ├── dashboard.spec.ts
    └── package.json
```

## Quick Start

```bash
# Install testing-suite dependencies
cd testing && pnpm install

# Run all security + edge-case + ai-eval tests (hermetic, <2 min)
pnpm test

# Run a specific category
pnpm test:security
pnpm test:edge-cases
pnpm test:ai-eval
pnpm test:performance

# Run portal tests (Playwright — needs the portal dev server running)
E2E_CUSTOMER_BASE_URL=http://localhost:3005 npx playwright test portals/customer
```

## Coverage Targets

| Surface                  | Line  | Branch |
| ------------------------ | ----- | ------ |
| Backend (`backend/`)     | ≥ 80% | ≥ 75%  |
| RAG (`rag/`)             | ≥ 80% | ≥ 75%  |
| Frontend portals         | ≥ 60% | ≥ 55%  |
| Critical paths (E2E)     | 100% manual | n/a |

See `docs/QA_GUIDE.md` for the full testing strategy.

## Documentation

- **QA strategy + categories:** `docs/QA_GUIDE.md`
- **How to run tests:** `docs/TEST_EXECUTION_GUIDE.md`
- **Bug reporting + SLA:** `docs/BUG_REPORTING_GUIDE.md`
- **Release validation + sign-offs:** `docs/RELEASE_VALIDATION_GUIDE.md`
- **Production release checklist:** `production-checklist.md`

## Test Counts

| Category          | Files | Test Cases (approx) |
| ----------------- | ----- | ------------------- |
| Portal (Playwright) | 20  | 150+                |
| Security          | 7     | 200+                |
| Performance       | 4     | 40+                 |
| AI Evaluation     | 5     | 80+                 |
| Edge Cases        | 5     | 100+                |
| **Total**         | **41** | **570+**           |

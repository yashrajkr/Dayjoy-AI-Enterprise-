# Task: `rag-agent-h-eval-security-docs` — RAG Evaluation + Security + Tests + Docs

**Agent:** full-stack-developer
**Task ID:** rag-agent-h-eval-security-docs
**Working directory:** `/home/z/my-project/build/dayjoy-ai-enterprise/`
**Date:** 2026-08-06

## Scope

This agent (H) owns four areas of the RAG system:

1. **`rag/evaluation/`** — Evaluation framework (precision, recall, hallucination, accuracy, latency, citation accuracy)
2. **`rag/security/`** — Access control, document permissions, tenant isolation
3. **`rag/tests/`** — Integration + unit + AI evaluation tests + fixtures
4. **`rag/docs/`** — Comprehensive documentation (README, setup, ingestion, evaluation, API reference, chunking strategy)

## Coordination notes

- **Agent F** owns `rag/loaders/`, `rag/ingestion/`, `rag/embeddings/`, `rag/vector-store/`. Did NOT touch.
- **Agent G** owns `rag/retriever/`, `rag/prompts/`, `rag/context-builder/`, `rag/search/`, `rag/response-pipeline/`, `rag/memory/`. Did NOT touch.
  - **Important:** Agent G has moved `llm-gateway-service.ts` and `response-processing-service.ts` (plus their configs) to `rag/response-pipeline/`. The originals in `rag/evaluation/` are now backward-compat re-export stubs (already in place — verified via `diff`). I did NOT need to create new stubs.
- **Agent B** owns `backend/` modules. Did NOT touch.

## Files created (21 new files)

### Evaluation framework (`rag/evaluation/`)

| File | Purpose |
|---|---|
| `evaluation-service.ts` | `EvaluationService` with `evaluateQuery()`, `runEvaluationSuite()`, `getAggregateMetrics()`, `getDashboard()`. Computes 6 core metrics: precision (LLM-judge per chunk), recall (feedback heuristic), hallucination (LLM-judge), accuracy (feedback + LLM self-assessment), latency (pass-through), citation accuracy (parse `[n](chunkId)` citations). Uses `gpt-4o-mini` for relevance judge, `gpt-4o` for hallucination + accuracy. Fail-safe defaults on judge errors. |
| `evaluation.controller.ts` | `EvaluationController` with 4 endpoints under `/api/rag/evaluation`: `POST /queries/:queryId`, `POST /suites/:suiteId/run`, `GET /metrics`, `GET /dashboard`. All require `ai:read` permission via `@RequirePermissions`. |
| `evaluation.module.ts` | Wires controller + service. Prisma + OPENAI_CLIENT come from global modules. |

### Security (`rag/security/`)

| File | Purpose |
|---|---|
| `document-permissions.service.ts` | `DocumentPermissionsService` — per-document access control via `metadata.restrictions` block (roles + userIds). Tenant isolation is the primary boundary; super-admin bypass within same tenant. Batch helpers: `filterAccessibleChunks` (used by retrieval to drop inaccessible chunks before LLM context) and `filterAccessibleDocuments` (used by listing endpoints). Single round-trip batch load + parallel permission check. |
| `rag-security.guard.ts` | `RagSecurityGuard` — NestJS guard applied per-controller after `JwtAuthGuard`. Looks for `documentId` in params/body/query, or `chunkIds[]` in body. Rejects with 403 if user can't access. Logs denials at WARN for audit. |
| `tenant-isolation.interceptor.ts` | `TenantIsolationInterceptor` — stamps `request.tenantId` from JWT, rejects body/query `tenantId` mismatch with 403 (super-admin exempt). Runs after guards (so `request.user` is populated). |
| `security.module.ts` | Wires the three providers + exports them for per-controller use. |

### Tests (`rag/tests/`)

| File | Purpose |
|---|---|
| `unit/evaluation-service.spec.ts` | 14 unit tests for `EvaluationService`. Mocks Prisma + OpenAI. Covers: evaluateQuery happy path, 404 cross-tenant, 400 no response, precision (0/0.5/1.0), recall (positive/negative/null), hallucination fail-safe (1.0 on error, 0.5 on bad JSON), accuracy (feedback short-circuit + LLM fallback), citation accuracy (no citations = 1.0, mixed = 0.5, bare numeric), runEvaluationSuite (aggregation + failure isolation), getAggregateMetrics (zero-state + populated). |
| `unit/document-permissions.spec.ts` | 16 unit tests for `DocumentPermissionsService`. Covers: not-found user/doc, cross-tenant denial (even for super-admin), super-admin bypass (denormalized role + userRoles join), public document, role-restricted (allow + deny), user-restricted (allow + deny), expired UserRole ignored, canAccessSource, filterAccessibleChunks (order preservation + drop inaccessible), filterAccessibleDocuments. |
| `evaluation/evaluation.spec.ts` | Static-analysis spec over the fixtures. Validates the `expected-queries.json` set against the sample doc + FAQ: every expected substring is in the corpus, every "mustNotContain" is absent, every section reference exists. Also documents the quality thresholds (green/yellow/red per metric) used by the evaluation guide. |
| `integration/rag-pipeline.integration.spec.ts` | End-to-end RAG pipeline integration test (mocked). Covers: ingest → query → evaluate flow, citation integrity (fake chunk ID → 0.0), document-permission filtering on retrieve path, hallucination trap queries (hedged response → low score), fixture-corpus coverage. |
| `integration/ingestion.integration.spec.ts` | Ingestion pipeline integration test (mocked). Covers: chunking produces > 1 chunk, single-chunk short docs, chunk size never exceeds 1000 tokens, persistence (one ragChunk per chunk with correct metadata), tenant isolation in writes, re-ingestion (delete + recreate), permission boundary (same-tenant readable, cross-tenant not). |
| `fixtures/sample-document.txt` | Plain-text sample: Dayjoy product catalogue + distributor onboarding + compensation plan + customer support. ~2 KB. |
| `fixtures/sample-faq.md` | Markdown sample: FAQ covering orders, returns, refunds, product info, distributor queries, account security. ~3 KB. |
| `fixtures/expected-queries.json` | 10 labelled queries with `expectedContains` / `mustNotContain` / `relevantSection` / `expectedCitationCount`, plus 3 hallucination-trap queries that should be hedged. |

### Docs (`rag/docs/`)

| File | Purpose |
|---|---|
| `README.md` | Comprehensive RAG readme: overview, ASCII architecture diagram, folder structure, pipeline flow, setup, usage examples, API endpoints, configuration, performance (latency budget + cost + scaling), evaluation summary, security summary, "where to go next" nav. |
| `SETUP_GUIDE.md` | Step-by-step setup: prerequisites (pgvector install, OpenAI key), env vars, DB setup (migrations + Prisma generate + HNSW index), installing deps, first ingestion, first query, verification, troubleshooting (8 common issues). |
| `INGESTION_GUIDE.md` | How to ingest: 6 supported file types, 4 ingestion methods (single JSON, file upload, batch, programmatic), chunking strategy summary, metadata best practices (including `restrictions` ACL block + anti-patterns), re-ingestion, deletion (soft + hard), troubleshooting. |
| `EVALUATION_GUIDE.md` | How to evaluate: 6 metrics explained (formula + interpretation + why-it-matters), single-query eval, suite runs, interpreting results (dashboard + thresholds), improving performance based on metrics (per-metric fixes), automated evaluation (scheduled suite + CI regression gate + streaming eval). |
| `CHUNKING_STRATEGY.md` | Comprehensive chunking deep-dive: why chunk, 1000/200 default rationale, hierarchical vs flat, per-content recipes, tuning (empirical + corpus-aware + anti-patterns), chunk metadata, token estimation, DB schema + indexes, common failure modes. (The original `chunking-strategy-docs.md` covering the 512-token config is left in place — this new doc supersedes it with the 1000-token default.) |
| `API_REFERENCE.md` | Complete API reference: auth + envelope, 11 endpoints (ingest × 4, search × 4, evaluation × 4) with method, path, permission, request body, response body, examples, error codes. Plus standard error code table. |

## Key design decisions

1. **Fail-safe evaluation.** When an LLM-judge call fails or returns bad JSON, the metric helpers apply sensible defaults (hallucination = 1.0 on error, 0.5 on bad JSON; accuracy = 0.5 on error) rather than aborting the whole evaluation. This means a transient OpenAI outage shows up as red metrics, not 500 errors — which is the right tradeoff for a monitoring tool.

2. **Tenant isolation as the primary boundary.** `DocumentPermissionsService.canAccessDocumentRow` checks tenant match BEFORE super-admin bypass. A super-admin in tenant A can never read tenant B's documents. This is the correct order per `docs/database/14_DATABASE_SECURITY.md` §4 (Access Control Model).

3. **Batch permission checks.** `filterAccessibleChunks` and `filterAccessibleDocuments` load all candidate rows in a single Prisma round-trip, then fan out the per-item permission check in parallel. This is O(1) DB round-trips + O(N) parallel user-role lookups, rather than O(N) sequential lookups. Critical for retrieval where N=5–20 chunks per query.

4. **Citations support two formats.** `[1](chunkId)` (explicit) and `[1]` (bare numeric). Bare numeric citations are valid iff the index falls within the retrieved chunk range. This matches what the response-processing pipeline emits.

5. **Evaluation suites are client-defined.** There's no `rag_evaluation_suites` table — the suite definition (name + queryIds) lives in the request body, and `suiteId` is just a label echoed in the response. This keeps the schema simple and lets QA engineers script suites from CI without DB setup.

6. **Dashboard live-re-evaluation is opt-in via `sampleSize`.** Each sampled query triggers ~6 LLM calls, so the default is 10 (≈ $0.12 per page load). Callers can lower it for interactive use or schedule off-peak evaluations.

7. **Test isolation via mocks.** All tests use the shared `createMockPrismaService` helper + a hand-rolled OpenAI mock. No real DB or OpenAI calls — the suite runs in CI without external dependencies. The integration tests are "integration" in the sense that they exercise the full evaluation → permission → citation contract, not in the sense of hitting live services.

8. **Backward-compat re-exports already in place.** Verified via `diff` that Agent G has already converted the original `rag/evaluation/llm-gateway-*.ts` and `response-processing-*.ts` files into re-export stubs pointing at `rag/response-pipeline/`. No new stubs needed.

## Out-of-scope items noted for future agents

1. **`EvaluationModule` is NOT imported by `app.module.ts` yet.** That's intentional — `app.module.ts` is owned by Agent E. When Agent E (or whoever wires the final app) is ready, they add `EvaluationModule` and `RagSecurityModule` to the `imports` array.

2. **The `RagSecurityGuard` and `TenantIsolationInterceptor` are NOT registered globally.** They're meant to be applied per-controller (e.g. `@UseGuards(JwtAuthGuard, PermissionsGuard, RagSecurityGuard)` + `@UseInterceptors(TenantIsolationInterceptor)`) on the RAG document/search controllers owned by Agent G. This keeps the security policy explicit at the point of use.

3. **No `rag_evaluations` persistence table yet.** `evaluateQuery()` returns the metrics but doesn't persist them. The dashboard re-evaluates on the fly. For production, add a `rag_evaluations` table + queue-based async evaluation (see `EVALUATION_GUIDE.md` §6.3). This is on the roadmap.

4. **Recall uses feedback heuristics.** Without ground-truth labels for the corpus, recall is approximated: positive feedback → 1.0, negative → 0.3, null → 0.7. When a labelled evaluation dataset becomes available, `calculateRecall` is the right place to plug in real `relevantChunkIds` lookup.

5. **`RagModule` (owned by Agent F) doesn't import `EvaluationModule` or `RagSecurityModule`.** This is correct — those modules are wired at the `app.module.ts` level, not the `RagModule` level. The comment in `rag.module.ts` says `rag/evaluation/` is "owned by Agent G" — that was true before this task landed; it's now owned by Agent H (me).

# Dayjoy AI Enterprise — RAG System

> Production-grade Retrieval-Augmented Generation (RAG) pipeline for the
> Dayjoy AI Enterprise platform. Multi-tenant, pgvector-backed, OpenAI-powered,
> and instrumented end-to-end with evaluation, security, and observability.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Folder Structure](#3-folder-structure)
4. [Pipeline Flow](#4-pipeline-flow)
5. [Setup](#5-setup)
6. [Usage Examples](#6-usage-examples)
7. [API Endpoints](#7-api-endpoints)
8. [Configuration](#8-configuration)
9. [Performance Considerations](#9-performance-considerations)
10. [Evaluation](#10-evaluation)
11. [Security](#11-security)
12. [Where to Go Next](#12-where-to-go-next)

---

## 1. Overview

The RAG system turns Dayjoy's unstructured knowledge — product
catalogues, FAQ markdown, distributor onboarding PDFs, policy docs —
into grounded, citation-backed answers for the AI agents powering the
customer / distributor / employee experience.

**Key properties:**

| Property | Implementation |
|---|---|
| **Multi-tenant** | Every `rag_sources`, `rag_documents`, `rag_chunks`, `rag_queries` row carries a `tenant_id`. Tenant isolation is enforced at the ORM layer (`TenantMiddleware`), the guard layer (`RagSecurityGuard`), and the interceptor layer (`TenantIsolationInterceptor`). |
| **Vector-backed** | Chunks are embedded with OpenAI `text-embedding-3-small` (1536-dim) and stored in PostgreSQL via the `pgvector` extension. Retrieval is cosine-similarity over an HNSW index. |
| **Citation-grounded** | Every answer carries `[n](chunkId)`-style citations that point back to the retrieved chunks. The evaluation framework's `citationAccuracy` metric surfaces broken citations. |
| **Hallucination-monitored** | An LLM-judge audits every evaluated response against the retrieved context, producing a `[0, 1]` hallucination score. |
| **Document-permissioned** | Per-document `metadata.restrictions` block can scope a document to specific roles or users. The retrieval pipeline drops inaccessible chunks *before* they're sent to the LLM. |
| **Observable** | Every query is persisted with `latencyMs`, `confidence`, and `feedback`. The `/api/rag/evaluation/dashboard` endpoint surfaces live + aggregate metrics. |

**Stack:** NestJS 10 + TypeScript 5 + Prisma 6 + PostgreSQL 16 (pgvector) + OpenAI SDK 4.

---

## 2. Architecture Diagram

```
                       ┌────────────────────────────────────────┐
                       │              Client / Agent            │
                       │   (WhatsApp AI, Voice AI, Web Chat)    │
                       └───────────────────┬────────────────────┘
                                           │  POST /api/rag/search
                                           ▼
       ┌───────────────────────────────────────────────────────────────┐
       │                       API Gateway (Caddy)                     │
       │  TLS termination · rate limiting · tenant header injection    │
       └───────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
       ┌───────────────────────────────────────────────────────────────┐
       │                       NestJS Application                      │
       │                                                               │
       │  ┌─────────────────────────────────────────────────────────┐ │
       │  │                  Middleware Chain                       │ │
       │  │  RequestId → Security → Tenant → RequestLogging         │ │
       │  └─────────────────────────────────────────────────────────┘ │
       │                                                               │
       │  ┌─────────────────────────────────────────────────────────┐ │
       │  │                  Guards (per-controller)                │ │
       │  │  JwtAuthGuard → PermissionsGuard → RagSecurityGuard     │ │
       │  └─────────────────────────────────────────────────────────┘ │
       │                                                               │
       │  ┌─────────────────────────────────────────────────────────┐ │
       │  │              Interceptors (per-controller)              │ │
       │  │  TenantIsolationInterceptor → MetricsInterceptor        │ │
       │  │  → LoggingInterceptor → TimeoutInterceptor              │ │
       │  └─────────────────────────────────────────────────────────┘ │
       │                                                               │
       │  ┌─────────────────────────────────────────────────────────┐ │
       │  │                    RAG Pipeline                         │ │
       │  │                                                         │ │
       │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │ │
       │  │  │ Loaders  │→ │ Chunking │→ │Embeddings│→ │Vector   │ │ │
       │  │  │ (F)      │  │ (F)      │  │ (F)      │  │ Store(F)│ │ │
       │  │  └──────────┘  └──────────┘  └──────────┘  └────┬────┘ │ │
       │  │                                                   │      │ │
       │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────▼────┐ │ │
       │  │  │ Retriever│← │ Prompt   │← │ Context  │← │ Search  │ │ │
       │  │  │ (G)      │  │ Assembly │  │ Builder  │  │ (G)     │ │ │
       │  │  └────┬─────┘  │ (G)      │  │ (G)      │  └─────────┘ │ │
       │  │       │        └────┬─────┘  └──────────┘              │ │
       │  │       │             │                                   │ │
       │  │  ┌────▼─────────────▼────┐   ┌──────────────────────┐  │ │
       │  │  │  Response Pipeline    │   │  Memory (G)          │  │ │
       │  │  │  (LLM Gateway +       │   │  (per-conversation)  │  │ │
       │  │  │   Processing)         │   └──────────────────────┘  │ │
       │  │  └───────────┬───────────┘                             │ │
       │  └──────────────┼─────────────────────────────────────────┘ │
       │                 │                                           │
       │  ┌──────────────▼─────────────────────────────────────────┐ │
       │  │              Evaluation Framework (H)                  │ │
       │  │  Precision · Recall · Hallucination · Accuracy         │ │
       │  │  Latency · Citation accuracy · Suite runner · Dashboard│ │
       │  └────────────────────────────────────────────────────────┘ │
       │                                                               │
       │  ┌──────────────────────────────────────────────────────────┐│
       │  │              Security Framework (H)                     ││
       │  │  DocumentPermissionsService · RagSecurityGuard           ││
       │  │  TenantIsolationInterceptor                              ││
       │  └──────────────────────────────────────────────────────────┘│
       └───────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
       ┌───────────────────────────────────────────────────────────────┐
       │                    PostgreSQL 16 (pgvector)                   │
       │                                                               │
       │  rag_sources · rag_documents · rag_chunks (vector(1536))     │
       │  rag_embeddings · rag_queries                                 │
       │                                                               │
       │  HNSW index on rag_chunks.embedding for cosine similarity    │
       └───────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
       ┌───────────────────────────────────────────────────────────────┐
       │                          OpenAI API                           │
       │  text-embedding-3-small (1536-dim) · gpt-4o · gpt-4o-mini    │
       └───────────────────────────────────────────────────────────────┘
```

Agent ownership is denoted in parentheses: **(F)** = Agent F (ingestion),
**(G)** = Agent G (retrieval/response), **(H)** = Agent H (this scope —
evaluation + security + tests + docs).

---

## 3. Folder Structure

```
rag/
├── README.md                        ← you are here
├── docs/                            ← comprehensive documentation
│   ├── README.md                    (this file)
│   ├── SETUP_GUIDE.md
│   ├── INGESTION_GUIDE.md
│   ├── EVALUATION_GUIDE.md
│   ├── CHUNKING_STRATEGY.md
│   ├── API_REFERENCE.md
│   └── (existing per-component docs: chunking-strategy-docs.md,
│        embeddings-pipeline-docs.md, retrieval-pipeline-docs.md,
│        prompt-assembly-docs.md, llm-gateway-docs.md,
│        response-processing-docs (none yet), complete-pipeline-docs.md,
│        vector-store-docs.md)
│
├── loaders/                         ← file loaders (Agent F)
├── ingestion/                       ← chunking pipeline (Agent F)
├── embeddings/                      ← embedding pipeline (Agent F)
├── vector-store/                    ← pgvector store (Agent F)
│
├── retriever/                       ← retrieval pipeline (Agent G)
├── prompts/                         ← prompt assembly (Agent G)
├── context-builder/                 ← context builder (Agent G)
├── search/                          ← search controller (Agent G)
├── response-pipeline/               ← LLM gateway + response processing (Agent G)
├── memory/                          ← per-conversation memory (Agent G)
│
├── evaluation/                      ← evaluation framework (Agent H — this scope)
│   ├── evaluation-service.ts
│   ├── evaluation.controller.ts
│   ├── evaluation.module.ts
│   ├── complete-pipeline-service.ts    (existing scaffold)
│   ├── llm-gateway-config.ts           (existing scaffold)
│   ├── llm-gateway-service.ts          (existing scaffold — Agent G will move to response-pipeline/)
│   ├── llm-gateway-tests.ts            (existing scaffold)
│   ├── response-processing-config.ts   (existing scaffold)
│   └── response-processing-service.ts  (existing scaffold — Agent G will move to response-pipeline/)
│
├── security/                        ← access control + tenant isolation (Agent H)
│   ├── document-permissions.service.ts
│   ├── rag-security.guard.ts
│   ├── tenant-isolation.interceptor.ts
│   └── security.module.ts
│
└── tests/                           ← integration + unit + fixtures (Agent H)
    ├── integration/
    │   ├── rag-pipeline.integration.spec.ts
    │   └── ingestion.integration.spec.ts
    ├── evaluation/
    │   └── evaluation.spec.ts
    ├── unit/
    │   ├── evaluation-service.spec.ts
    │   └── document-permissions.spec.ts
    └── fixtures/
        ├── sample-document.txt
        ├── sample-faq.md
        └── expected-queries.json
```

---

## 4. Pipeline Flow

A single RAG query travels through the system in eight steps. Each
step is owned by a specific agent and persists its output to a
specific table:

```
User question
    │
    ▼ 1. Search controller validates input, calls RagQuery.create()
    │   → rag_queries row inserted with status=pending
    │
    ▼ 2. Retrieval pipeline (Agent G)
    │   • Embed the query (OpenAI text-embedding-3-small)
    │   • pgvector cosine similarity search → top-K chunks
    │   • Tenant filter + document-permission filter applied here
    │
    ▼ 3. Context builder (Agent G)
    │   • Merge top-K chunks into a single context window
    │   • Respect token budget (default 4096 tokens)
    │   • Track citation ↔ chunkId mapping
    │
    ▼ 4. Prompt assembly (Agent G)
    │   • System prompt: Dayjoy master prompt + agent-specific prompt
    │   • User prompt: question + context + citation instructions
    │
    ▼ 5. LLM gateway (Agent G — currently in evaluation/, moving to response-pipeline/)
    │   • Route to provider (OpenAI / Anthropic / Google / Azure)
    │   • Apply fallback policy on error
    │   • Return content + token usage + latency
    │
    ▼ 6. Response processing (Agent G — currently in evaluation/, moving to response-pipeline/)
    │   • Extract citations from response text
    │   • Validate: toxicity / PII / hallucination heuristics
    │   • Stream chunks to client if streaming mode
    │
    ▼ 7. RagQuery.update()
    │   → responseText, latencyMs, confidence, retrievedChunkIds persisted
    │
    ▼ 8. (Optional, async) Evaluation framework (Agent H — this scope)
        • EvaluateQuery(queryId) computes the six core metrics
        • LLM-judge calls (gpt-4o for hallucination/accuracy,
          gpt-4o-mini for per-chunk relevance)
        • Result can be persisted or streamed to the dashboard
```

---

## 5. Setup

See [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) for the complete step-by-step
walkthrough. The short version:

```bash
# 1. Install dependencies (already done if you have backend/node_modules)
pnpm install --filter backend

# 2. Configure environment
cp .env.example .env
# Edit .env: set OPENAI_API_KEY, DATABASE_URL, JWT_SECRET, etc.

# 3. Apply database migrations (creates rag_* tables + pgvector extension)
pnpm --filter backend db:migrate:deploy

# 4. Generate the Prisma client
pnpm --filter backend db:generate

# 5. Start the backend
pnpm --filter backend start:dev

# 6. Ingest your first document
curl -X POST http://localhost:3000/api/rag/ingest \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"...","title":"My first doc","content":"Hello RAG"}'

# 7. Query it
curl -X POST http://localhost:3000/api/rag/search \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is in this doc?"}'

# 8. Evaluate the response
curl -X POST http://localhost:3000/api/rag/evaluation/queries/$QUERY_ID \
  -H "Authorization: Bearer $JWT"
```

---

## 6. Usage Examples

### 6.1 Ingest a markdown file

```typescript
// Using the API directly
await fetch('/api/rag/ingest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({
    sourceId: 'src-faq',
    title: 'Customer FAQ',
    content: faqMarkdown,        // raw markdown string
    metadata: {
      restrictions: { roles: ['CUSTOMER', 'DISTRIBUTOR'] },  // optional ACL
    },
  }),
});
```

### 6.2 Query the knowledge base

```typescript
const res = await fetch('/api/rag/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({
    query: 'What is the return policy?',
    topK: 5,
    agentId: 'agent-customer-support',   // optional — selects prompt template
  }),
});
const { data } = await res.json();
// data.responseText = "Dayjoy offers a 7-day return policy on unopened
//                       products [1](chunk-abc). To initiate a return..."
// data.citations = [{ number: 1, chunkId: 'chunk-abc', documentTitle: 'FAQ' }]
```

### 6.3 Evaluate a single query

```bash
curl -X POST http://localhost:3000/api/rag/evaluation/queries/$QUERY_ID \
  -H "Authorization: Bearer $JWT"
```

```json
{
  "success": true,
  "data": {
    "queryId": "q-001",
    "tenantId": "tenant-A",
    "evaluatedAt": "2026-08-06T19:30:00.000Z",
    "metrics": {
      "precision": 1.0,
      "recall": 1.0,
      "hallucinationScore": 0.1,
      "accuracyScore": 1.0,
      "latencyMs": 850,
      "citationAccuracy": 1.0
    }
  }
}
```

### 6.4 Run an evaluation suite

```bash
curl -X POST http://localhost:3000/api/rag/evaluation/suites/regression-v1/run \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"regression-v1","queryIds":["q-001","q-002","q-003"]}'
```

### 6.5 Pull the dashboard

```bash
curl http://localhost:3000/api/rag/evaluation/dashboard?sampleSize=10 \
  -H "Authorization: Bearer $JWT"
```

---

## 7. API Endpoints

Full reference in [`API_REFERENCE.md`](./API_REFERENCE.md). Quick index:

| Method | Path | Description |
|---|---|---|
| `POST`   | `/api/rag/ingest`                  | Ingest a single document |
| `POST`   | `/api/rag/ingest/batch`            | Ingest multiple documents |
| `POST`   | `/api/rag/ingest/upload`           | Upload a file (multipart) |
| `DELETE` | `/api/rag/ingest/:documentId`      | Delete a document + its chunks |
| `POST`   | `/api/rag/search`                  | Run a RAG query |
| `POST`   | `/api/rag/search/stream`           | Stream a RAG response (SSE) |
| `GET`    | `/api/rag/search/history`          | Paginated query history |
| `POST`   | `/api/rag/search/:queryId/feedback`| Thumb-up / thumb-down a response |
| `POST`   | `/api/rag/evaluation/queries/:queryId`     | Evaluate a single query |
| `POST`   | `/api/rag/evaluation/suites/:suiteId/run`  | Run an evaluation suite |
| `GET`    | `/api/rag/evaluation/metrics`              | Aggregate metrics |
| `GET`    | `/api/rag/evaluation/dashboard`            | Dashboard payload |

All endpoints require a valid JWT (`Authorization: Bearer <token>`).
Most require the `ai:read` or `ai:chat` permission (enforced by
`PermissionsGuard`).

---

## 8. Configuration

Environment variables consumed by the RAG system:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | yes | OpenAI API key. Used for embeddings + chat completions + LLM-judge calls. |
| `DATABASE_URL` | yes | PostgreSQL connection string. Must point at a database with the `vector` extension enabled. |
| `JWT_SECRET` | yes | JWT signing secret (shared with the auth module). |
| `ANTHROPIC_API_KEY` | no | Optional. Enables Anthropic as a fallback LLM provider. |
| `GOOGLE_API_KEY` | no | Optional. Enables Google Gemini as a fallback LLM provider. |
| `AZURE_OPENAI_API_KEY` | no | Optional. Azure OpenAI key for enterprise Azure deployments. |
| `AZURE_OPENAI_API_BASE` | no | Required if `AZURE_OPENAI_API_KEY` is set. |
| `AZURE_OPENAI_API_VERSION` | no | Azure OpenAI API version (default `2023-05-15`). |
| `RAG_CHUNK_SIZE_TOKENS` | no | Chunk size in tokens (default 1000). |
| `RAG_CHUNK_OVERLAP_TOKENS` | no | Chunk overlap in tokens (default 200). |
| `RAG_RETRIEVAL_TOP_K` | no | Number of chunks to retrieve (default 5). |
| `RAG_CONTEXT_MAX_TOKENS` | no | Context window budget (default 4096). |
| `RAG_EVALUATION_SAMPLE_SIZE` | no | Dashboard live-re-eval sample size (default 10, max 50). |

The full chunking / embedding / retrieval / LLM-gateway configs live
in their respective `*-config.ts` files under `rag/`.

---

## 9. Performance Considerations

### 9.1 Latency budget

A typical RAG query takes 800–2000 ms end-to-end. The budget breaks
down as:

| Step | Typical (ms) | Notes |
|---|---|---|
| Query embedding (OpenAI) | 100–200 | Network-bound. Cacheable. |
| pgvector cosine search | 20–50 | HNSW index, 5 chunks. |
| Prompt assembly | <5 | In-memory. |
| LLM generation (gpt-4o) | 600–1500 | Dominates total latency. |
| Response processing | <10 | Citation extraction + validation. |
| Persistence (RagQuery.update) | 5–15 | Single-row update. |

The dashboard's `averageLatencyMs` metric tracks this end-to-end.

### 9.2 Cost

| Operation | Cost (per 1K tokens) |
|---|---|
| Embedding (`text-embedding-3-small`) | $0.00002 |
| Generation (`gpt-4o`) | $0.005 |
| Generation (`gpt-4o-mini`, used for relevance judge) | $0.00015 |
| Hallucination / accuracy judge (`gpt-4o`) | $0.005 |

A typical query uses ≈500 prompt tokens + 200 completion tokens of
generation ($0.0035) plus ≈300 tokens of relevance judging
($0.000045 × 5 chunks). The dashboard's `cost` field (in the LLM
gateway) tracks this per-query.

### 9.3 Scaling

- **Vertical:** pgvector's HNSW index is in-memory and benefits from
  more RAM. A `db.r6g.2xlarge` (64 GB) comfortably handles 10M chunks.
- **Horizontal:** Read replicas can serve retrieval queries; writes
  go to the primary. The `tenant_id` index makes per-tenant queries
  selective enough that a single primary handles most workloads.
- **Async ingestion:** Ingesting large documents (>1 MB) should go
  through a job queue (BullMQ / SQS) so the API can return 202
  immediately. The current implementation is synchronous; the queue
  is on the roadmap.

---

## 10. Evaluation

See [`EVALUATION_GUIDE.md`](./EVALUATION_GUIDE.md) for the complete
guide. Quick summary of the six metrics:

| Metric | What it measures | Target |
|---|---|---|
| `precision` | Fraction of retrieved chunks the LLM-judge marks relevant. | ≥ 0.8 |
| `recall` | Approximation of how much of the relevant corpus was retrieved. | ≥ 0.7 |
| `hallucinationScore` | LLM-judge score for ungrounded claims. 0 = grounded. | ≤ 0.2 |
| `accuracyScore` | Overall response correctness. | ≥ 0.85 |
| `latencyMs` | Round-trip latency. | ≤ 2000 ms |
| `citationAccuracy` | Fraction of citations pointing at retrieved chunks. | ≥ 0.95 |

---

## 11. Security

See `docs/architecture/10_SECURITY_ARCHITECTURE.md` and
`docs/database/14_DATABASE_SECURITY.md` for the full security model.
RAG-specific enforcement lives in `rag/security/`:

- **`DocumentPermissionsService`** — per-document role/user
  restrictions via `metadata.restrictions`. Super-admin bypass
  (within the same tenant).
- **`RagSecurityGuard`** — NestJS guard applied per-controller.
  Rejects with 403 if the user can't access the document referenced
  in the request.
- **`TenantIsolationInterceptor`** — stamps `request.tenantId` from
  the JWT and rejects any body/query `tenantId` that doesn't match
  (super-admin exempt).
- **`filterAccessibleChunks`** — used by the retrieval pipeline to
  drop inaccessible chunks *before* LLM context assembly. Prevents
  both context leakage and bogus citations.

---

## 12. Where to Go Next

- **New to the codebase?** Read [`SETUP_GUIDE.md`](./SETUP_GUIDE.md)
  end-to-end, then run the sample ingestion in §6.1.
- **Ingesting your first document?** [`INGESTION_GUIDE.md`](./INGESTION_GUIDE.md)
  covers file types, chunking strategy, metadata best practices, and
  troubleshooting.
- **Measuring quality?** [`EVALUATION_GUIDE.md`](./EVALUATION_GUIDE.md)
  walks through every metric, how to run a suite, and how to
  interpret the dashboard.
- **Tuning chunk size?** [`CHUNKING_STRATEGY.md`](./CHUNKING_STRATEGY.md)
  explains the 1000-token / 200-overlap default and when to deviate.
- **Building a client?** [`API_REFERENCE.md`](./API_REFERENCE.md) has
  every endpoint with request/response examples and error codes.
- **Securing a new RAG route?** Apply `RagSecurityGuard` +
  `TenantIsolationInterceptor` per-controller — see
  `rag/security/security.module.ts` for the wiring.

---

**Maintained by:** Agent H (`rag-agent-h-eval-security-docs`) in
coordination with Agent F (ingestion) and Agent G (retrieval/response).

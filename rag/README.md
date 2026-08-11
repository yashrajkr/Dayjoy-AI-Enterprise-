# Dayjoy AI Enterprise — RAG Module

> Production-grade Retrieval-Augmented Generation pipeline for the
> Dayjoy AI Enterprise platform. Multi-tenant, pgvector-backed,
> OpenAI-powered, and instrumented end-to-end with evaluation,
> security, and observability.

This folder is consumed by the NestJS backend via the **`RagModule`**
(see [`rag.module.ts`](./rag.module.ts)). It is built and owned by
three parallel agents:

| Agent | Scope | Folders |
|---|---|---|
| **Agent F** — Ingestion | Loaders, chunking, embeddings, vector store, ingestion orchestration | `loaders/`, `ingestion/`, `embeddings/`, `vector-store/` |
| **Agent G** — Query | Retrieval, context assembly, prompt assembly, response pipeline, search API, conversation memory | `retriever/`, `context-builder/`, `prompts/`, `response-pipeline/`, `search/`, `memory/` |
| **Agent H** — Eval + Security | RAG evaluation framework, document permissions, tenant isolation | `evaluation/`, `security/` |

For the full design document, see [`docs/README.md`](./docs/README.md).

---

## 1. What it does

The RAG module turns Dayjoy's unstructured knowledge — product
catalogues, FAQ markdown, distributor onboarding PDFs, policy docs —
into grounded, citation-backed answers for the AI agents powering the
customer / distributor / employee experience.

**Two flows:**

1. **Ingestion** — load a document (PDF/DOCX/MD/Text/CSV/HTML) → chunk
   it (token-aware) → embed every chunk (OpenAI `text-embedding-3-*`)
   → store in PostgreSQL `rag_chunks` + `rag_embeddings` (pgvector
   `vector(1536)` column).

2. **Query** — retrieve relevant chunks (hybrid: vector + keyword via
   Reciprocal Rank Fusion) → build context (chunks + conversation
   history + long-term memories + customer profile) → assemble LLM
   prompt (system persona + context + question) → call LLM
   (multi-provider gateway) → process response (extract citations,
   validate against chunks, detect hallucination, score confidence).

**Cross-cutting concerns:**

- **Evaluation** (`rag/evaluation/`) — six-metric framework (precision,
  recall, hallucination, accuracy, latency, citation accuracy) with
  LLM-judge + dashboard endpoints under `/api/rag/evaluation/**`.
- **Security** (`rag/security/`) — per-document role / user /
  tenant access control + NestJS guard + tenant-isolation interceptor.

---

## 2. Folder structure

```
rag/
├── rag.module.ts                 # Top-level module — wires every service
│
├── loaders/                      # Agent F — document format loaders
│   ├── loaders.module.ts         #   + DocumentLoaderFactory
│   ├── document-loader.interface.ts
│   ├── loader.factory.ts
│   ├── pdf.loader.ts · docx.loader.ts · markdown.loader.ts
│   ├── text.loader.ts · csv.loader.ts · html.loader.ts
│   └── loaders.spec.ts
│
├── ingestion/                    # Agent F — chunking + ingestion orchestration
│   ├── ingestion-service.ts      #   load → chunk → embed → store
│   ├── ingestion.controller.ts   #   /api/rag/ingest/**
│   ├── ingestion.dto.ts
│   ├── chunking-service.ts       #   token-aware hierarchical chunker
│   ├── chunking-config.ts
│   ├── chunking-schema.sql
│   ├── ingestion-service.spec.ts · chunking-service.spec.ts
│   └── chunking-tests.ts · chunking-e2e-tests.ts
│
├── embeddings/                   # Agent F — OpenAI embeddings wrapper
│   ├── embeddings-service.ts     #   embed / embedBatch / embedQuery
│   ├── embeddings-config.ts
│   ├── embeddings-pipeline.ts    #   standalone (non-DI) pipeline
│   ├── embeddings-service.spec.ts
│   └── embeddings-tests.ts · embeddings-pipeline-tests.ts
│
├── vector-store/                 # Agent F — pgvector persistence + search
│   ├── vector-store-service.ts   #   insertChunks · similaritySearch · keywordSearch
│   ├── vector-store-config.ts
│   ├── vector-store-indexes.sql  #   HNSW + GIN index DDL
│   ├── vector-store-service.spec.ts
│   └── vector-store-tests.ts
│
├── retriever/                    # Agent G — hybrid retrieval (vector + keyword + RRF)
│   ├── retrieval-service.ts      #   retrieve · retrieveHybrid · mergeResults (RRF)
│   ├── retrieval-pipeline.ts     #   conversation-aware enhancement + fallback
│   ├── retrieval-config.ts
│   ├── retrieval-service.spec.ts
│   └── retrieval-tests.ts
│
├── context-builder/              # Agent G — assembles LLM context payload
│   ├── context-builder.service.ts#   chunks + history + memories + profile
│   ├── context-builder.config.ts
│   ├── context-builder.module.ts
│   ├── context-builder-service.spec.ts
│   └── (BuiltContext shape)
│
├── prompts/                      # Agent G — system + user prompt assembly
│   ├── prompt-assembly-service.ts#   buildSystemPrompt · buildUserPrompt · buildMessagesForLLM
│   ├── prompt-assembly-config.ts
│   ├── prompt-assembly-service.spec.ts
│   ├── prompt-assembly-tests.ts
│   ├── prompt-templates/         #   6 markdown templates (voice, whatsapp, web, ...)
│   └── *.md                      #   legacy single-prompt templates
│
├── response-pipeline/            # Agent G — full response pipeline
│   ├── response-pipeline.service.ts #   retrieve → context → prompt → LLM → process
│   ├── llm-gateway-service.ts    #   multi-provider gateway (OpenAI / Anthropic / Google)
│   ├── response-processing-service.ts # citations · hallucination · confidence
│   ├── llm-gateway-config.ts · response-processing-config.ts
│   ├── response-pipeline.module.ts
│   └── response-pipeline-service.spec.ts
│
├── search/                       # Agent G — public RAG search API
│   ├── search.service.ts         #   search · searchStreaming · getHistory · recordFeedback
│   ├── search.controller.ts      #   /api/rag/search · /stream · /history · /:id/feedback
│   ├── search.dto.ts
│   ├── search.module.ts
│   └── search-service.spec.ts
│
├── memory/                       # Agent G — conversation memory (short + long term)
│   ├── conversation-memory.service.ts # getShortTerm · getLongTerm · saveMemory · summarize · extract
│   ├── memory.module.ts
│   └── conversation-memory-service.spec.ts
│
├── evaluation/                   # Agent H — RAG evaluation framework
│   ├── evaluation-service.ts     #   6 metrics + suite runner + dashboard
│   ├── evaluation.controller.ts  #   /api/rag/evaluation/**
│   ├── evaluation.module.ts
│   ├── complete-pipeline-service.ts #   legacy (broken imports — slated for removal)
│   ├── llm-gateway-*.ts · response-processing-*.ts # backward-compat re-exports
│   ├── llm-gateway-tests.ts
│   └── (specs live in tests/)
│
├── security/                     # Agent H — RAG security (permissions + tenant isolation)
│   ├── document-permissions.service.ts # per-doc role/user/tenant access control
│   ├── rag-security.guard.ts     #   @UseGuards(JwtAuthGuard, PermissionsGuard, RagSecurityGuard)
│   ├── tenant-isolation.interceptor.ts # stamps tenantId · rejects cross-tenant writes
│   └── security.module.ts        #   exports RagSecurityModule
│
├── tests/                        # Cross-cutting specs + fixtures
│   ├── unit/                     #   evaluation-service.spec.ts · document-permissions.spec.ts
│   ├── integration/              #   ingestion.integration.spec.ts · rag-pipeline.integration.spec.ts
│   ├── evaluation/               #   evaluation.spec.ts (fixture-driven)
│   └── fixtures/                 #   sample-faq.md · sample-document.txt · expected-queries.json
│
└── docs/                         # Long-form documentation
    ├── README.md                 #   full design document
    ├── SETUP_GUIDE.md
    ├── INGESTION_GUIDE.md
    ├── EVALUATION_GUIDE.md
    ├── API_REFERENCE.md
    ├── CHUNKING_STRATEGY.md
    ├── vector-store-docs.md
    ├── embeddings-pipeline-docs.md
    ├── retrieval-pipeline-docs.md
    ├── prompt-assembly-docs.md
    ├── llm-gateway-docs.md
    ├── response-processing-docs.md
    └── complete-pipeline-docs.md
```

---

## 3. How to use it

### 3.1 Wire it into the backend

Import `RagModule` from `app.module.ts` (or any feature module that
needs RAG):

```typescript
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    // ... other modules
    RagModule,
  ],
  // ...
})
export class AppModule {}
```

`RagModule` exports every public service — you can inject any of them
into your providers:

```typescript
constructor(
  private readonly searchService: SearchService,
  private readonly ingestionService: IngestionService,
  private readonly retrievalService: RetrievalService,
  private readonly evaluationService: EvaluationService,
  private readonly documentPermissions: DocumentPermissionsService,
) {}
```

For feature modules that only need a slice, import a sub-module
directly instead of the full `RagModule`:

```typescript
import { SearchModule } from '../rag/search/search.module';
import { MemoryModule } from '../rag/memory/memory.module';

@Module({ imports: [SearchModule, MemoryModule] })
export class ConversationsModule {}
```

### 3.2 Ingest a document

```bash
# Inline text
curl -X POST http://localhost:3000/api/rag/ingest \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceName": "product-faq",
    "title": "Dayjoy Premium Health Tonic — FAQ",
    "content": "Recommended dosage: 15 ml twice daily after meals...",
    "format": "markdown"
  }'

# File upload (multipart/form-data)
curl -X POST http://localhost:3000/api/rag/ingest/upload \
  -H "Authorization: Bearer $JWT" \
  -F "file=@./docs/faq.pdf" \
  -F "sourceName=product-faq" \
  -F "title=Dayjoy FAQ PDF"
```

Permissions: requires `knowledge:create` (admin-only).

### 3.3 Search

```bash
# One-shot
curl -X POST http://localhost:3000/api/rag/search \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the recommended dosage?",
    "agentId": "agent-uuid-optional",
    "conversationId": "conv-uuid-optional"
  }'

# Streaming (SSE)
curl -N -X POST http://localhost:3000/api/rag/search/stream \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "query": "Tell me about the product" }'
```

Permissions: requires `ai:chat` for search, `ai:read` for history.

### 3.4 Evaluate

```bash
# Evaluate a single query (must already have a responseText)
curl -X POST http://localhost:3000/api/rag/evaluation/queries/$QUERY_ID \
  -H "Authorization: Bearer $JWT"

# Run an evaluation suite (batch)
curl -X POST http://localhost:3000/api/rag/evaluation/suites/regression-v1/run \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "regression-v1",
    "queryIds": ["uuid-1", "uuid-2", "uuid-3"]
  }'

# Aggregate metrics over a time window
curl "http://localhost:3000/api/rag/evaluation/metrics?startDate=2026-01-01&endDate=2026-02-01" \
  -H "Authorization: Bearer $JWT"

# Dashboard
curl "http://localhost:3000/api/rag/evaluation/dashboard?sampleSize=10" \
  -H "Authorization: Bearer $JWT"
```

Permissions: requires `ai:read` (admins / QA / analysts).

### 3.5 Apply per-document security

Wire `RagSecurityGuard` + `TenantIsolationInterceptor` onto any
controller that touches RAG documents:

```typescript
import { RagSecurityGuard } from '../rag/security/rag-security.guard';
import { TenantIsolationInterceptor } from '../rag/security/tenant-isolation.interceptor';

@Controller('api/rag/documents')
@UseGuards(JwtAuthGuard, PermissionsGuard, RagSecurityGuard)
@UseInterceptors(TenantIsolationInterceptor)
export class RagDocumentsController { ... }
```

`DocumentPermissionsService` can also be injected directly to filter
retrieved chunks at the service layer (`filterAccessibleChunks`).

---

## 4. Backend integration points

| Backend consumer | RAG service injected | Purpose |
|---|---|---|
| `KnowledgeService` (backend/knowledge) | `IngestionService`, `SearchService`, `EmbeddingsService`, `VectorStoreService`, `RetrievalService` | Knowledge management UI ingests + queries RAG |
| `ConversationsService` (backend/ai) | `RetrievalService`, `ConversationMemoryService`, `ResponsePipelineService` | AI chat uses RAG for grounded replies + memory |
| `AnalyticsService` (backend/analytics) | `EvaluationService` | Analytics dashboard surfaces RAG evaluation metrics |
| `AdminController` (backend/admin) | `DocumentPermissionsService` | Admin UI manages per-document access rules |

All RAG services depend on:
- `PrismaService` (global, provided by `PrismaModule`)
- `OPENAI_CLIENT` token (global, provided by `SharedAiModule`)

---

## 5. Tests

153 tests across three suites (runnable via `vitest`):

| Suite | Files | Tests |
|---|---|---|
| Agent F (ingestion) | `loaders.spec.ts`, `ingestion-service.spec.ts`, `chunking-service.spec.ts`, `embeddings-service.spec.ts`, `vector-store-service.spec.ts` | 80 |
| Agent G (query) | `retrieval-service.spec.ts`, `context-builder-service.spec.ts`, `prompt-assembly-service.spec.ts`, `search-service.spec.ts`, `response-pipeline-service.spec.ts`, `conversation-memory-service.spec.ts` | 59 |
| Agent H (eval + security) | `tests/unit/evaluation-service.spec.ts`, `tests/unit/document-permissions.spec.ts`, `tests/evaluation/evaluation.spec.ts` | 14 |

Run all RAG tests:

```bash
# From the repo root (requires the main vitest config to include rag/**)
pnpm vitest run rag/
```

---

## 6. Configuration

| Env var | Default | Used by |
|---|---|---|
| `OPENAI_API_KEY` | (required) | `SharedAiModule` — `OPENAI_CLIENT` token |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | `EmbeddingsService` |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | `LLMGatewayService` (default routing) |
| `RAG_CHUNK_SIZE_TOKENS` | `512` | `ChunkingService` |
| `RAG_CHUNK_OVERLAP_TOKENS` | `64` | `ChunkingService` |
| `RAG_TOP_K` | `8` | `RetrievalService` |
| `RAG_RRF_K` | `60` | `RetrievalService` (RRF fusion constant) |

Per-service config defaults live alongside each service
(`*-config.ts` files).

---

## 7. References

- Design document: [`docs/README.md`](./docs/README.md)
- Setup guide: [`docs/SETUP_GUIDE.md`](./docs/SETUP_GUIDE.md)
- Ingestion guide: [`docs/INGESTION_GUIDE.md`](./docs/INGESTION_GUIDE.md)
- Evaluation guide: [`docs/EVALUATION_GUIDE.md`](./docs/EVALUATION_GUIDE.md)
- API reference: [`docs/API_REFERENCE.md`](./docs/API_REFERENCE.md)
- Architecture: `docs/architecture/` (repo root)
- Database schema: `database/prisma/schema.prisma`

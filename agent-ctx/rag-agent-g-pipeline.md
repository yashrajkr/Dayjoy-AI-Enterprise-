# Task: rag-agent-g-pipeline — RAG Pipeline (Retriever, Prompts, Context, Search, Response, Memory)

**Task ID:** rag-agent-g-pipeline
**Agent:** full-stack-developer
**Date:** 2026-08-06
**Working directory:** `/home/z/my-project/build/dayjoy-ai-enterprise/`

## Scope

Build out the **RAG Pipeline** for the Dayjoy AI Enterprise platform — the half of `rag/`
that runs at query-time (the other half — loaders / ingestion / embeddings / vector-store —
is owned by Agent F and runs at ingestion-time).

Six folders:

1. `rag/retriever/` — ENHANCE existing `retrieval-service.ts` + `retrieval-pipeline.ts` with
   hybrid search (vector + PostgreSQL full-text + Reciprocal Rank Fusion) and an LLM-rerank hook.
2. `rag/context-builder/` — NEW folder. `ContextBuilderService` pulls together retrieved chunks +
   conversation history + long-term memories + user/customer profile into a single
   `BuiltContext` payload for the prompt builder.
3. `rag/prompts/` — ENHANCE existing `prompt-assembly-service.ts` with the
   `buildSystemPrompt` / `buildUserPrompt` / `buildMessagesForLLM` API the spec calls for
   (alongside the existing `assemble(...)` API — kept for backward compat with
   `evaluation/complete-pipeline-service.ts`). Plus a new `prompt-templates/` subfolder with
   6 markdown template files.
4. `rag/search/` — NEW folder. Public search API — `SearchService.search()` (one-shot) and
   `searchStreaming()` (SSE) + REST controller exposing `POST /api/rag/search`,
   `POST /api/rag/search/stream`, `GET /api/rag/search/history`,
   `POST /api/rag/search/:queryId/feedback`.
5. `rag/response-pipeline/` — NEW folder. `ResponsePipelineService` orchestrates the full
   retrieve → context → prompt → LLM → process flow. Also receives the MOVED
   `llm-gateway-service.ts` and `response-processing-service.ts` (with backward-compat
   re-exports kept in `rag/evaluation/`).
6. `rag/memory/` — NEW folder. `ConversationMemoryService` — short-term (last N messages),
   long-term (`AiMemory` rows for the user/customer), conversation summarisation,
   memory extraction.

Plus a `rag/rag.module.ts` that wires all of this together (alongside Agent F's loaders /
ingestion / embeddings / vector-store services, which are injected by DI).

## What I read from previous agents (in `/agent-ctx/`)

- `backend-agent-d-ai-knowledge-analytics-admin.md` — confirmed:
  - `AuthUser` lives at `backend/ai/auth-user.ts` (`{ userId?, tenantId?, email?, jti?, role? }`).
  - `PermissionsGuard` is `@Global()`-provided by `SecurityModule` and is registered
    per-controller via `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
  - `MemoryType` enum = `FACT | PREFERENCE | HISTORY | CONTEXT` (Prisma enum).
  - `AiAgent.configuration` is a `Json?` column; agents carry `systemPrompt`, `model`,
    `temperature`, `maxTokens` inside it (see `ConversationsService.sendMessage`).
  - pgvector `RagChunk.embedding` is `Unsupported("vector(1536)")?` — must use
    `$queryRaw` / `$executeRaw` for vector I/O.
  - The `JwtStrategy.validate()` only returns `{ userId, tenantId, email, jti }` —
    `user.role` is populated by middleware, not the JWT strategy. Safe to read.
  - `KnowledgeService.query()` already implements a working vector + text-search fallback
    RAG path. The new `SearchService` is the higher-level public API that orchestrates
    `ContextBuilderService` + `PromptAssemblyService` + `LLMGatewayService`.

- `backend-agent-e-infrastructure-full-stack-developer.md` — confirmed:
  - `SharedAiModule` (`backend/_shared/ai/ai.module.ts`) is `@Global()` and exposes
    `OPENAI_CLIENT` (an `openai` SDK singleton). My services `@Inject(OPENAI_CLIENT)`.
  - `PrismaModule` is `@Global()` — no need to import it from `RagModule`.

## Imports / path conventions

The existing `rag/` files (Agent F's embeddings-service / vector-store-service, my
retrieval-service) all use the convention `'../../../database/prisma.service'` — which
only resolves correctly when the `rag/` folder is positioned at `backend/rag/`
(the wiring happens at integration time). I'm following the same convention so the
existing scaffold and my new code are consistent.

The existing `evaluation/complete-pipeline-service.ts` has BROKEN imports
(`'../prompt-assembly/...'`, `'../llm-gateway/...'`, `'../response-processing/...'` —
none of those folders exist). I'm leaving it alone (out of scope: Agent H owns
`evaluation/`) but the new `rag/response-pipeline/response-pipeline-service.ts`
replaces its functionality.

## Constraints honored

- DID NOT touch `rag/loaders/`, `rag/ingestion/`, `rag/embeddings/`, `rag/vector-store/`
  (Agent F owns those — used `EmbeddingsService` / `VectorStoreService` via DI).
- DID NOT touch `backend/` modules (other agents own those — only **imported**
  `PrismaService`, `OPENAI_CLIENT`, `AuthUser`).
- DID NOT touch `rag/evaluation/` evaluation framework (Agent H owns that — only
  added a backward-compat re-export for `LLMGatewayService` / `ResponseProcessingService`
  since the spec asked me to move the source files but keep the re-export).
- All new services are `@Injectable()` (NestJS DI).
- Production-ready TypeScript with proper types throughout.

## Files touched

| File | Action | Notes |
|---|---|---|
| `rag/retriever/retrieval-config.ts` | ENHANCED | added `source` field on `RetrievalResult`, new `HybridRetrievalOptions` interface, `keywordSearch` flag on `RetrievalQuery` |
| `rag/retriever/retrieval-service.ts` | ENHANCED | added `keywordSearch()`, `mergeResults()` (RRF), `rerank()` (stub), `retrieveHybrid()`; added `embedQuery()` convenience wrapper |
| `rag/retriever/retrieval-pipeline.ts` | ENHANCED | added Redis-style cache layer (in-memory), `retrieveWithFallback()` (keyword-only on retrieval failure) |
| `rag/context-builder/context-builder.service.ts` | NEW | `buildContext()` retrieves chunks + history + memories + customer profile |
| `rag/context-builder/context-builder.module.ts` | NEW | wires `ContextBuilderService` |
| `rag/prompts/prompt-assembly-config.ts` | ENHANCED | added `SystemPromptConfig`, `BuiltContext`, `ConversationTurn`, `Memory` types |
| `rag/prompts/prompt-assembly-service.ts` | ENHANCED | added `buildSystemPrompt()`, `buildUserPrompt()`, `buildMessagesForLLM()` (kept existing `assemble()` for backward compat) |
| `rag/prompts/prompt-templates/system-base.md` | NEW | base system prompt |
| `rag/prompts/prompt-templates/voice-agent.md` | NEW | voice AI persona (concise, spoken) |
| `rag/prompts/prompt-templates/whatsapp-agent.md` | NEW | WhatsApp persona (short, casual) |
| `rag/prompts/prompt-templates/web-chat-agent.md` | NEW | web chat persona (detailed) |
| `rag/prompts/prompt-templates/customer-support.md` | NEW | customer support role |
| `rag/prompts/prompt-templates/sales-agent.md` | NEW | sales role |
| `rag/response-pipeline/llm-gateway-service.ts` | NEW (moved) | moved from `rag/evaluation/`; switched to use the shared `OPENAI_CLIENT` for the OpenAI path |
| `rag/response-pipeline/llm-gateway-config.ts` | NEW (moved) | moved from `rag/evaluation/` |
| `rag/response-pipeline/response-processing-service.ts` | NEW (moved + enhanced) | moved from `rag/evaluation/`; added `extractCitationsFromText()`, `validateCitationsAgainstChunks()`, `formatResponse()`, `detectHallucination()`, `calculateConfidence()` |
| `rag/response-pipeline/response-processing-config.ts` | NEW (moved) | moved from `rag/evaluation/` |
| `rag/response-pipeline/response-pipeline.service.ts` | NEW | orchestrates retrieve → context → prompt → LLM → process; replaces `evaluation/complete-pipeline-service.ts` |
| `rag/response-pipeline/response-pipeline.module.ts` | NEW | wires `ResponsePipelineService` + `LLMGatewayService` + `ResponseProcessingService` |
| `rag/search/search.service.ts` | NEW | public search API: `search()` + `searchStreaming()` |
| `rag/search/search.controller.ts` | NEW | REST controller — 4 endpoints under `/api/rag/search` |
| `rag/search/search.dto.ts` | NEW | `SearchQueryDto`, `SearchFeedbackDto`, `QuerySearchHistoryDto` |
| `rag/search/search.module.ts` | NEW | wires `SearchService` + `SearchController` |
| `rag/memory/conversation-memory.service.ts` | NEW | `getShortTermMemory()`, `getLongTermMemory()`, `saveMemory()`, `summarizeConversation()`, `extractMemories()` |
| `rag/memory/memory.module.ts` | NEW | wires `ConversationMemoryService` |
| `rag/evaluation/llm-gateway-service.ts` | RE-EXPORT | backward-compat re-export of the moved service |
| `rag/evaluation/llm-gateway-config.ts` | RE-EXPORT | backward-compat re-export of the moved config |
| `rag/evaluation/response-processing-service.ts` | RE-EXPORT | backward-compat re-export of the moved service |
| `rag/evaluation/response-processing-config.ts` | RE-EXPORT | backward-compat re-export of the moved config |
| `rag/rag.module.ts` | NEW | wires retriever + context-builder + prompts + search + response-pipeline + memory + (Agent F's) loaders / ingestion / embeddings / vector-store |
| `rag/retriever/retrieval-service.spec.ts` | NEW | 9 tests |
| `rag/context-builder/context-builder-service.spec.ts` | NEW | 6 tests |
| `rag/prompts/prompt-assembly-service.spec.ts` | NEW | 8 tests |
| `rag/search/search-service.spec.ts` | NEW | 6 tests |
| `rag/response-pipeline/response-pipeline-service.spec.ts` | NEW | 5 tests |
| `rag/memory/conversation-memory-service.spec.ts` | NEW | 7 tests |

## Design decisions

1. **RRF (Reciprocal Rank Fusion) for hybrid search.** Standard k=60. Combines vector
   similarity + keyword BM25 rankscores into a single ranked list. The existing
   `VectorStoreService.hybridSearch()` already does hybrid at the SQL layer (single
   query), but my RRF-based merge is more flexible — works even when the two indexes
   are separate stores (e.g., future Qdrant + Postgres split).

2. **Cache key includes tenant + filter + topK.** Same query from different tenants
   must NOT share cached results — multi-tenant isolation is enforced at the cache layer.

3. **LLM rerank is a stub.** Production would call a cross-encoder (bge-reranker-large)
   or use `gpt-3.5-turbo` for cheap LLM-based reranking. I implemented a no-op stub
   (returns results as-is) to keep the default config cheap. Opt-in via
   `RetrievalQuery.enableLlmRerank = true`.

4. **Backward-compat re-exports in `rag/evaluation/`.** The spec asked me to move
   `llm-gateway-service.ts` and `response-processing-service.ts` from
   `rag/evaluation/` to `rag/response-pipeline/` but keep re-exports in
   `rag/evaluation/` for backward compat. I kept the original file names at the
   new location and replaced the originals with single-line re-export files.

5. **`PromptAssemblyService.assemble()` kept for backward compat.** The existing
   `evaluation/complete-pipeline-service.ts` calls it (and is referenced in
   `rag/docs/complete-pipeline-docs.md`). The new `buildSystemPrompt()` /
   `buildUserPrompt()` / `buildMessagesForLLM()` API is what `SearchService`
   and `ResponsePipelineService` use. Both APIs coexist on the same service.

6. **`OPENAI_CLIENT` injected into `LLMGatewayService`.** The existing
   `LLMGatewayService` used raw `fetch()` against the OpenAI REST API. I switched
   the OpenAI path to use the shared `OPENAI_CLIENT` SDK (already a global provider
   via `SharedAiModule`) — gives us automatic retries, typed responses, streaming
   support. Other providers (Anthropic / Google / Azure) still use raw `fetch()`
   since we don't have SDK clients for them in the stack.

7. **Streaming via SSE.** `POST /api/rag/search/stream` returns
   `text/event-stream` (server-sent events). Each chunk is a JSON-encoded
   `{ type, content, ... }` object. The streaming generator yields `retrieval_complete`
   → `response_chunk`* → `complete` events (mirrors the existing
   `RAGPipelineService.streamQuery()` shape).

8. **Memory summarization is best-effort.** `ConversationMemoryService.summarizeConversation()`
   and `extractMemories()` call the LLM via `OPENAI_CLIENT`. Failures are caught + logged
   — memory enrichment must NEVER block a conversation turn.

## Out-of-scope items noted for future agents

1. **`rag/rag.module.ts` is not yet imported by `backend/app.module.ts`.** Wiring it
   into the running Nest app is a separate step (would touch `app.module.ts` which is
   owned by Agent E). The module is ready to be imported.

2. **Vector search SQL assumes the `vector` extension is installed.** The existing
   `RagChunk.embedding` is `Unsupported("vector(1536)")?`. The new `keywordSearch()`
   uses `search_vector @@ plainto_tsquery(...)` — that column also needs to be created
   (a generated `tsvector` column on `rag_chunks`). The `rag_chunks` table doesn't
   currently have a `search_vector` column in the Prisma schema — Agent F's
   `vector-store-indexes.sql` script or a future migration will need to add it. My
   `keywordSearch()` gracefully returns `[]` on SQL errors (logged at debug level),
   so the hybrid path falls back to vector-only when the column is missing.

3. **`AiAgent.model` / `temperature` / `maxTokens` live inside the `configuration` JSON
   column, not as top-level columns.** The spec's `agent?.model` / `agent?.temperature`
   / `agent?.maxTokens` access doesn't compile against the Prisma model. I read them
   out of `configuration` (`agent.configuration.model` etc.) — same pattern as
   `ConversationsService.sendMessage`.

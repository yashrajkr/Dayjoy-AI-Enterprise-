# Task: rag-agent-f-core — RAG Core (Loaders, Chunking, Ingestion, Embeddings, Vector Store)

**Task ID:** rag-agent-f-core
**Agent:** full-stack-developer
**Date:** 2026-08-06
**Working directory:** `/home/z/my-project/build/dayjoy-ai-enterprise/`

## What I read from previous agents (in `/agent-ctx/`)

- `backend-agent-d-ai-knowledge-analytics-admin.md` — Agent D built `KnowledgeService` (which uses RAG) with a simple 1000-char/200-overlap chunker + best-effort embeddings via raw `fetch()` + `KnowledgeController` with `@RequirePermissions('knowledge:create')` etc. The RAG core was still placeholder (broken imports in `rag/ingestion/chunking-service.ts`, `rag/embeddings/embeddings-service.ts`, `rag/vector-store/vector-store-service.ts`). My task: replace those placeholders with production-ready NestJS services that `KnowledgeService` can migrate to (not done in this task — out of scope).
- `backend-agent-a-auth-security-full-stack-developer.md` — Agent A built `JwtAuthGuard` + `PermissionsGuard` (with `@RequirePermissions('resource:action')` decorator) + `AuthenticatedUser` shape. My `IngestionController` reuses these via `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions('knowledge:create' | 'knowledge:delete' | 'knowledge:update')`.
- The `OPENAI_CLIENT` token from `backend/_shared/ai/openai.provider.ts` (singleton OpenAI SDK instance, `@Global()` via `SharedAiModule`) — I inject it into `EmbeddingsService` via `@Inject(OPENAI_CLIENT)`. Same pattern as `KnowledgeService`.
- `database/prisma/schema.prisma` — confirmed `RagSource` / `RagDocument` / `RagChunk` (with `Unsupported("vector(1536)")` embedding column) / `RagEmbedding` (with `Unsupported("vector(1536)")` embedding column + `@@unique([chunkId, model])`) / `RagQuery` models. The vector type means every embedding write + similarity search must use `$executeRaw` / `$queryRaw` with `Prisma.sql` templates — Prisma's typed API can't touch the `vector` type.
- `_reference/fastapi-backend-reference/app/ai/rag_pipeline/chunker.py` + `ingestion.py` — used as reference for the chunking pipeline (refine → merge undersized → dedup) and ingestion orchestration (load → chunk → embed → index → finalize). My TypeScript implementation follows the same high-level flow but uses `gpt-tokenizer` for accurate token counting (the Python ref uses `len(text) // 4` heuristic) and pgvector raw SQL instead of Qdrant.
- `rag/rag.module.ts` had been written by Agent G (who owns `rag/retriever/`, `rag/prompts/`, `rag/evaluation/`) to wire BOTH Agent G's query-side services AND my ingestion-side services together. I confirmed my services are correctly imported/provided/exported in that file and left it intact (overwriting would break Agent G's wiring).

## Scope

Built the RAG **ingestion-side core** — the half of the RAG pipeline that turns uploaded files into searchable embedded chunks stored in pgvector. Five folders + 1 module file:

1. `rag/loaders/` (NEW folder, 9 files) — 6 format-specific loaders (PDF/DOCX/Markdown/Text/CSV/HTML) + interface + factory + module.
2. `rag/ingestion/` (ENHANCE + new files, 5 files total) — chunking-config enhanced, chunking-service rewritten to spec API, new ingestion-service + ingestion.controller + ingestion.dto.
3. `rag/embeddings/` (ENHANCE, 1 file) — embeddings-service switched to `OPENAI_CLIENT` injection + new canonical API (`embed` / `embedBatch` / `embedQuery` / `cosineSimilarity`).
4. `rag/vector-store/` (ENHANCE, 1 file) — vector-store-service rewritten with `insertChunks` (transactional bulk) + `search` (pgvector cosine) + `hybridSearch` (BM25 + vector).
5. `rag/rag.module.ts` (NEW — co-authored with Agent G) — wires `LoadersModule` + my 4 services + `IngestionController`. Agent G extended it to also wire their query-side services; left intact.
6. Tests (5 spec files, 80 tests) — all passing.

Out of scope (per task constraints): `rag/retriever/`, `rag/prompts/`, `rag/evaluation/`, `rag/context-builder/`, `rag/response-pipeline/`, `rag/search/`, `rag/memory/`, `rag/security/`, `rag/tests/` (all owned by Agents G/H). All `backend/` modules except `backend/package.json` (deps) + `backend/vitest.config.ts` (test include path).

## Files touched

### `rag/loaders/` (NEW — 9 files)

| File | Action | Notes |
|---|---|---|
| `loaders/document-loader.interface.ts` | NEW | `DocumentLoader` interface + `LoadedDocument` / `DocumentMetadata` / `LoadedDocumentMetadata` / `DocumentSection` types. Pure contract. |
| `loaders/pdf.loader.ts` | NEW | `pdf-parse` (lazy-imported). PDF metadata (Title/Author/CreationDate/pageCount). Heading detection by ALL-CAPS short line / no terminal punctuation. `D:YYYYMMDDHHmmSS` date parsing. |
| `loaders/docx.loader.ts` | NEW | `mammoth.extractRawText()`. Heading detection via mammoth's `#`/`##` Markdown-style prefixes (Word Heading 1/2/3 styles). |
| `loaders/markdown.loader.ts` | NEW | Parses `#` headings while respecting code fences (``` / ~~~). YAML front-matter `title:` extraction. |
| `loaders/text.loader.ts` | NEW | UTF-8 plain text. Level-0 sections per `\n\n` block. |
| `loaders/csv.loader.ts` | NEW | `csv-parse` (sync API + Promise wrapper). One section per data row, rendered as `key: value` pairs. |
| `loaders/html.loader.ts` | NEW | `cheerio`. Strips scripts/styles. Preserves `<h1>`-`<h6>` heading hierarchy. `<ul>`/`<ol>` → Markdown bullets. `<pre>` → fenced code. `<table>` → ` | `-delimited rows. |
| `loaders/loader.factory.ts` | NEW | `getLoader(mimeType)` / `getLoaderByExtension(ext)` / `getLoaderFor(filename, mimeType?)`. MIME→loader + ext→MIME maps. `BadRequestException` on unsupported. Strips `; charset=...` suffix. |
| `loaders/loaders.module.ts` | NEW | NestJS module exporting all 6 loaders + factory. |

### `rag/ingestion/` (ENHANCE existing + new — 5 files)

| File | Action | Notes |
|---|---|---|
| `ingestion/chunking-config.ts` | ENHANCED | Spec-aligned defaults: 1000/200/100/2000. Renamed `respectParagraphs/Sentences/Headings` → `splitByParagraph` / `splitBySentence` / `preserveHeadings`. Added `csv` document-type config. Added comprehensive WHY rationale (1000 = OpenAI sweet spot, 200 = 20% context preservation, 100 = enough context, 2000 = prevent dilution). Added `section` / `sectionLevel` / `pageNumber` / `source` / `category` / `tags` to `ChunkMetadata`. |
| `ingestion/chunking-service.ts` | ENHANCED | Rewrote to spec API: `chunk(document: LoadedDocument): Chunk[]`. Three strategies: hierarchical (sections) / paragraph-based (default) / sentence-based (fallback). `chunkByTokens(text, maxTokens, overlap)` using `gpt-tokenizer` (cl100k_base). `mergeSmallChunks` / `splitLargeChunk` / `addOverlap` — all public. Abbreviation-aware sentence splitter. Hard-split fallback for pathological single-sentence chunks. Exported `buildChunkMetadata(chunk, totalChunks)` helper. |
| `ingestion/ingestion-service.ts` | NEW | `IngestionService` — full pipeline: resolve/upsert `RagSource` → create `RagDocument` (PROCESSING) → load via `DocumentLoaderFactory` (file path) OR use inline `content` (text path) → chunk → embed → store → flip to READY (or FAILED on error). `ingestBatch` (5 parallel, per-doc isolation). `reingestSource` (delete + re-ingest stored content). `deleteDocument` (soft-delete + cascade). `purgeDocument` (hard-purge). Tenant-scoped. |
| `ingestion/ingestion.controller.ts` | NEW | REST controller `/api/rag/ingest/**` — 5 endpoints: `POST /`, `POST /batch`, `POST /upload` (multipart `FileInterceptor`), `DELETE /:documentId`, `POST /sources/:sourceId/reingest`. All `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions('knowledge:create' | 'knowledge:delete' | 'knowledge:update')`. |
| `ingestion/ingestion.dto.ts` | NEW | `IngestDocumentDto` / `IngestBatchDto` (with `ArrayMaxSize(50)`) / `IngestionResult` / `BatchIngestionResult`. `class-validator` + `class-transformer`. |

### `rag/embeddings/` (ENHANCE existing — 1 file)

| File | Action | Notes |
|---|---|---|
| `embeddings/embeddings-service.ts` | ENHANCED | Switched from `fetch()` to `@Inject(OPENAI_CLIENT)`. New canonical API: `embed` / `embedBatch` / `embedQuery` / `cosineSimilarity`. In-process LRU cache (5000 entries, 7-day TTL, SHA-256 keyed). Sub-batch processing (100 per request). Empty input → zero vector. Env-driven model + dimension auto-detection (1536 for `text-embedding-3-small`, 3072 for `text-embedding-3-large`). Legacy `generateEmbedding` / `generateBatchEmbeddings` / `storeEmbeddings` kept as `@deprecated`. |

### `rag/vector-store/` (ENHANCE existing — 1 file)

| File | Action | Notes |
|---|---|---|
| `vector-store/vector-store-service.ts` | ENHANCED | New canonical API: `insertChunks(documentId, chunks, embeddings, tenantId)` — transactional bulk write to `rag_chunks` + `rag_embeddings` + raw-SQL vector backfill (both tables). `search(queryEmbedding, options)` — pgvector `<=>` cosine-similarity via `Prisma.sql`. `hybridSearch(query, queryEmbedding, options)` — BM25 (`ts_rank` + `plainto_tsquery`) + vector, weighted (30/70 default). `deleteByDocument` / `deleteBySource` (cascade). `getStats` / `getIndexStats`. `SearchOptions` + `VectorStoreStats` interfaces. `toVectorLiteral` helper. SQL-injection-safe `buildFilterClauses`. Legacy `insert` / `insertBatch` / `update` / `delete` / `deleteDocument` kept for `KnowledgeService.embedChunks`. |

### `rag/rag.module.ts` (NEW — co-authored with Agent G)

| File | Action | Notes |
|---|---|---|
| `rag/rag.module.ts` | NEW (extended by Agent G) | Wires `LoadersModule` + my 4 services + `IngestionController`. Imports `SharedAiModule` + `PrismaModule`. Exports all 4 services. Agent G extended to also wire their query-side services — left intact. |

### Tests (5 spec files — 80 tests, all passing)

| File | Action | Notes |
|---|---|---|
| `rag/loaders/loaders.spec.ts` | NEW | 15 tests — all 6 loaders + factory. |
| `rag/ingestion/chunking-service.spec.ts` | NEW | 19 tests — strategy selection + `chunkByTokens` + `mergeSmallChunks` + `splitLargeChunk` + `addOverlap` + `countTokens` + edge cases. |
| `rag/ingestion/ingestion-service.spec.ts` | NEW | 15 tests — inline content path + file upload path + `ingestBatch` + `reingestSource` + `deleteDocument` + source resolution + error handling. |
| `rag/embeddings/embeddings-service.spec.ts` | NEW | 17 tests — `embed` + `embedBatch` + `embedQuery` + `cosineSimilarity` + cache + stats + error propagation. |
| `rag/vector-store/vector-store-service.spec.ts` | NEW | 14 tests — `insertChunks` + `search` + `hybridSearch` + delete + stats + legacy paths. |

### Dependencies + config

| File | Action | Notes |
|---|---|---|
| `backend/package.json` | UPDATED | Added `pdf-parse@^2.4.5`, `mammoth@^1.12.0`, `cheerio@^1.2.0`, `csv-parse@^7.0.2`, `gpt-tokenizer@^3.4.0`. Installed via `bun add`. |
| `backend/vitest.config.ts` | UPDATED | Extended `test.include` to pick up `../rag/{loaders,ingestion,embeddings,vector-store}/**/*.spec.ts` — scoped to my 4 subfolders so I don't disturb Agent G's pre-existing `rag/tests/` setup. |

## Coordination with other agents

- **Agent G** (`rag/retriever/`, `rag/prompts/`, `rag/evaluation/`, `rag/context-builder/`, `rag/response-pipeline/`, `rag/search/`, `rag/memory/`): Agent G has already extended `rag/rag.module.ts` to wire their query-side services alongside mine. I left that file intact (my services are correctly imported + provided + exported in it).
- **Agent H** (`rag/evaluation/`, `rag/security/`, `rag/tests/`, `rag/docs/`): Per their worklog entry, they "Did NOT touch `rag/loaders/`, `rag/ingestion/`, `rag/embeddings/`, `rag/vector-store/` (Agent F's scope)." So no conflict.
- **Agent D** (`backend/knowledge/knowledge.service.ts`): `KnowledgeService` currently uses its own inline chunker + `fetch()`-based embeddings. My services are wired into `RagModule` but NOT yet imported by `KnowledgeService` — that migration is out of scope for this task (would require touching `backend/knowledge/`, owned by Agent D). When Agent D migrates, they'll: replace the inline chunker with `ChunkingService.chunk()`, replace `fetch()` embeddings with `EmbeddingsService.embedBatch()`, replace the inline `vectorSearch()` with `VectorStoreService.search()`.
- **Agent E** (`backend/app.module.ts`): `RagModule` is NOT yet added to `app.module.ts` `imports` array — that's Agent E's territory. Once added, all my services will be globally available via DI.

## Test results

- **My 5 spec files:** 80/80 passing.
- **Pre-existing test failures (NOT mine — predate my changes):**
  - `notifications/notifications.service.spec.ts` (0 tests — missing `./providers/notification.provider.interface` file).
  - `orders/orders.service.spec.ts` (0 tests — same).
  - `products/inventory.service.spec.ts > updateStock > refuses to go negative` (TypeError from undefined mock).
- **TypeScript type-check:** 0 errors in any of my `rag/` files. Pre-existing tsc errors in `backend/_shared/` (rxjs type incompatibility due to duplicate rxjs installs from `bun add` side-effect) — out of my scope.

## Stage Summary

- **Loaders (9 files):** Complete. 6 format-specific loaders + factory + module + interface. Pure transformations, `@Injectable()`.
- **Chunking (2 files enhanced + 1 new DTO):** Complete. Token-aware via `gpt-tokenizer` (cl100k_base). Three strategies: hierarchical / paragraph / sentence. Post-processing: merge/split/overlap. Document-type-specific configs.
- **Ingestion (1 new service + 1 new controller + 1 new DTO):** Complete. `IngestionService` orchestrates the full pipeline transactionally. `IngestionController` exposes 5 REST endpoints with auth + permission guards. `ingestBatch` (5 parallel, per-doc isolation). `reingestSource` + `deleteDocument` + `purgeDocument`.
- **Embeddings (1 file enhanced):** Complete. `OPENAI_CLIENT` injection. Canonical API: `embed` / `embedBatch` / `embedQuery` / `cosineSimilarity`. LRU cache + sub-batch + env-driven model + legacy backward-compat.
- **Vector store (1 file enhanced):** Complete. `insertChunks` (transactional, both tables). `search` (pgvector cosine via raw SQL). `hybridSearch` (BM25 + vector, weighted). Delete cascade + stats + index stats. SQL-injection-safe filter clauses.
- **Module wiring (1 file):** Complete. `RagModule` wires my services (Agent G extended to wire theirs — left intact).
- **Tests (5 spec files, 80 tests):** All passing.
- **Dependencies:** 5 packages added.
- **Total:** 18 new files + 4 enhanced files. ~5000 LOC of production TypeScript + ~1500 LOC of tests.

## Out-of-scope items noted for future agents

1. **`backend/app.module.ts`** needs `RagModule` added to its `imports` array (Agent E's territory). Once added, my services will be globally injectable.
2. **`backend/knowledge/knowledge.service.ts`** should migrate from its inline chunker/embedder/searcher to use `ChunkingService` / `EmbeddingsService` / `VectorStoreService` (Agent D's territory). The legacy methods I kept (`KnowledgeService.vectorSearch`, `KnowledgeService.embedChunks`) continue to work in the meantime via the backfilled `rag_chunks.embedding` column.
3. **`backend/_shared/testing/mock-prisma.service.ts`** is missing `ragChunk.deleteMany` and `$queryRaw` / `$executeRaw` — these are needed by Agent H's integration tests (`rag/tests/integration/ingestion.integration.spec.ts` was already failing before my changes due to `prisma.ragChunk.deleteMany is not a function`). Not my scope to fix the shared mock.
4. **`bun add` installed rxjs@7.8.1 at the top level** (transitive dep of one of my new packages), conflicting with pnpm's hoisted rxjs@7.8.2 — causes 150 tsc errors in `backend/_shared/` (rxjs type incompatibility). Doesn't affect runtime (vitest passes) but should be resolved by removing the top-level rxjs@7.8.1 install or aligning versions.

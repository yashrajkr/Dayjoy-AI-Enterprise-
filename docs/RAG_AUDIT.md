# RAG System — World-Class Production Audit

> **Auditor**: Principal AI/RAG Architect
> **Subject**: Dayjoy AI Enterprise RAG module at `/home/z/my-project/build-zip/rag/`
> **Mode**: Read-only audit — no files modified
> **Date**: 2025

---

## Executive Summary

- **World-class score: 5.4 / 10** — a solid, well-architected mid-stage RAG
  system with strong fundamentals (token-aware chunking, hybrid search via
  RRF, multi-tenant security, LLM-judge evaluation, multi-provider LLM
  gateway with streaming) but **three runtime-fatal bugs** in the
  retrieval path that would prevent the system from working end-to-end
  in production as-shipped, plus several missing world-class
  capabilities (no real reranker, no OCR, no query rewriting, no PII
  redaction at ingestion, no encryption at rest, no Redis-backed cache).

- **Comparison to industry leaders**: The architecture *maps* onto what
  OpenAI Assistants / Cohere / Pinecone / enterprise RAG platforms ship
  — same 6-stage pipeline (ingest → chunk → embed → store → retrieve →
  generate), same primitives (pgvector + HNSW + GIN, RRF fusion,
  LLM-judge eval). What it lacks vs. world-class is **(a) execution
  correctness** in the retriever, **(b) production hardening**
  (Redis cache, circuit breaker, retry/backoff, rate-limit enforcement,
  encryption at rest), and **(c) retrieval quality upgrades** (real
  cross-encoder reranker, HyDE / multi-query fanout, query rewriting).

- **Critical gaps (must-fix for production): 8** — including 3
  runtime-fatal bugs in the retriever, no real reranker, no OCR, no
  PII redaction at ingestion, no encryption at rest, no circuit
  breaker, no Redis cache.

- **Already good: 19 capabilities** — listed at the end. The bones are
  right; the muscles need work.

---

## What world-class RAG looks like

A production-grade RAG system has ten dimensions. Each is benchmarked
below against the Dayjoy implementation.

| # | Dimension | World-class bar | Dayjoy status |
|---|---|---|---|
| 1 | Document ingestion | Multi-format + OCR + table extraction + layout-aware chunking | 6 formats, **no OCR, no table extraction** |
| 2 | Intelligent chunking | Semantic + section-based + overlap + metadata | Token-aware hierarchical ✓ (strong) |
| 3 | Embedding strategy | Multi-vector (dense + sparse) + query expansion + hybrid | OpenAI-only, no multi-vector |
| 4 | Vector store | pgvector/Qdrant + HNSW + filtering + batch | pgvector + HNSW + GIN ✓ |
| 5 | Retrieval | Query rewriting + multi-query + cross-encoder rerank + citations | RRF hybrid ✓, **rerank is keyword-overlap heuristic**, no query rewriting |
| 6 | Context assembly | Token budget + source diversity + dedup | Token budget ✓, **no dedup, no diversity** |
| 7 | Generation | Prompt templates + grounded citations + hallucination detection | All present ✓ |
| 8 | Evaluation | precision@k, recall, faithfulness, relevancy, automated | 6 metrics ✓, **2 are feedback-heuristics not real metrics** |
| 9 | Monitoring | Latency, retrieval quality, cost | Stats present ✓, no Prometheus/OTel export |
| 10 | Caching | Embedding + query + semantic cache | In-memory `Map` only — **no Redis** |

---

## Current implementation analysis

### 1. Ingestion pipeline — **Score: 6.5 / 10**

**What exists**

- **6 format loaders** via `DocumentLoaderFactory` (`loaders/loader.factory.ts:17-41`):
  PDF (`pdf-parse`), DOCX (`mammoth`), Markdown, plain text, CSV (`csv-parse`),
  HTML (`cheerio`). MIME-type → loader map with extension fallback.
- **Section / heading preservation** in every loader:
  - Markdown walks `#`/`##` lines and respects code fences (`markdown.loader.ts:52-99`).
  - HTML walks `<h1>`-`<h6>` + `<p>` + `<ul>` + `<table>` + `<pre>` and
    converts lists to `- ` bullets, tables to `|`-delimited rows
    (`html.loader.ts:60-132`).
  - DOCX relies on mammoth emitting Markdown-style headings
    (`docx.loader.ts:71-108`).
  - PDF uses a font-style heuristic (ALL-CAPS short line → H1, short
    line without terminal punctuation → H1) — `pdf.loader.ts:101-112`.
- **Token-aware chunking** (`ingestion/chunking-service.ts`) using
  `gpt-tokenizer` cl100k_base (matches GPT-4 / `text-embedding-3-*`).
  Three strategies picked per document:
  1. **Hierarchical** — one chunk per loader-detected section; oversized
     sections sub-split at sentence boundaries (`chunking-service.ts:275-292`).
  2. **Paragraph** — split on `\n\n`, accumulate to `chunkSize`
     (`chunking-service.ts:299-340`).
  3. **Sentence** — fallback for unstructured text (`chunking-service.ts:347-350`).
  Plus post-processing: merge under-sized chunks, split over-sized ones,
  add overlap (`chunking-service.ts:107-117, 185-258`).
- **Per-document-type chunking config** (`chunking-config.ts:82-141`):
  PDF/DOCX/MD = 1000 tokens / 200 overlap, HTML = 800 / 160, CSV =
  400 / 0 (one row per chunk).
- **Metadata preservation**: `documentId`, `tenantId`, `source`,
  `category`, `tags`, `pageNumber`, `section`, `sectionLevel`,
  `documentTitle`, `documentType`, plus computed `hasCode`/`hasTable`/
  `hasList` flags (`chunking-service.ts:356-381, 496-520`).
- **Batch ingestion** with `Promise.allSettled` and 5-doc concurrency
  (`ingestion-service.ts:176-209`). Per-document transactional — a
  failure rolls back chunks via `prisma.$transaction`
  (`vector-store-service.ts:86-133`).
- **Reingest** path for swapping chunking/embedding strategy
  (`ingestion-service.ts:221-256`).

**What's missing**

- **No OCR** for scanned PDFs. `pdf-parse` returns empty text on image
  PDFs. Acknowledged in `docs/INGESTION_GUIDE.md:30`:
  > `pdf-loader` | Uses `pdf-parse`. OCR not supported — scanned PDFs
  > return empty text.
- **No table extraction**. PDF tables become flat text via `pdf-parse`.
  The HTML loader does flatten `<table>` to `|`-delimited rows
  (`html.loader.ts:115-127`) but that's lossy and there's no
  structured table representation preserved in chunk metadata.
- **No layout-aware chunking** — no pdfjs-dist text-layer coordinates,
  no column detection, no reading-order preservation. The PDF page
  number is a *coarse approximation* `Math.floor(i/3) + 1`
  (`pdf.loader.ts:85`) — the comment honestly admits this:
  > `pdf-parse` doesn't expose per-block page numbers without resorting
  > to a more capable engine (pdfjs-dist with text-layer coordinates).
- **No PPTX, XLSX, EML, RTF, EPUB** support — only the 6 formats above.
- **No URL / sitemap ingestion** despite `RagSourceType.WEBSITE` being
  declared (`ingestion.dto.ts:21`) — there's no fetcher/crawler.
- **Language detection is hardcoded** `'en'` in every loader
  (`pdf.loader.ts:55`, `docx.loader.ts:60`, etc.) — Indian-market
  product (Dayjoy is a wellness/D2C brand) but no Hindi / Hinglish
  support at ingestion.
- **No deduplication** of near-identical documents at ingestion
  (no content-hash check before embedding).

---

### 2. Embedding strategy — **Score: 5.0 / 10**

**What exists**

- **OpenAI-only** embedding via the shared `OPENAI_CLIENT` SDK
  (`embeddings/embeddings-service.ts:100-103`). Default model
  `text-embedding-3-small` (1536 dims); auto-detects `3-large` (3072)
  and `ada-002` (1536) from env var (`embeddings-service.ts:62-69`).
- **Batch embedding** with sub-batching at `batchSize=100`
  (`embeddings-service.ts:131-188`). Preserves input order, serves
  cache hits first, then calls the API in 100-text slices.
- **In-memory LRU-ish cache** keyed by SHA-256(text), 7-day TTL, 5,000
  entry cap with oldest-eviction (`embeddings-service.ts:52-54, 89-96,
  330-344`). Cache hits bypass the API call entirely.
- **Stats tracking**: `totalEmbeddings`, `totalTokens`, `cacheHits`,
  `cacheMisses`, `apiCalls`, `averageLatencyMs`, `errors`
  (`embeddings-service.ts:313-324`).
- **Pure-math cosine similarity** helper exposed for in-memory reranking
  (`embeddings-service.ts:204-220`).
- **Configurable** dimensions and model via `OPENAI_EMBEDDING_MODEL` env
  var.

**What's missing**

- **No multi-vector embeddings**. The `rag_embeddings` table is set up
  for "multi-model embeddings" (one chunk → many embeddings) per the
  vector-store docstring (`vector-store-service.ts:22-26`), but only
  one model is wired. No sparse vectors (SPLADE/BGE-M3), no ColBERT
  token-level vectors.
- **No query expansion** — the query is embedded as-is. No HyDE, no
  synonym expansion, no LLM-based query rewriting before embedding.
- **Rate limiting is configured but NOT enforced**.
  `embeddings-config.ts:54-56` declares `maxRequestsPerMinute: 100`
  and `maxTokensPerMinute: 50000`, but neither value is ever read by
  `EmbeddingsService`. No token bucket, no 429-backoff. A burst of
  ingestions will hit OpenAI's actual RPM limit and start failing.
- **`maxRetries: 3, retryDelayMs: 1000`** in config
  (`embeddings-config.ts:51-52`) is also **never used** — the service
  relies on the OpenAI SDK's built-in retries, which is fine but the
  config is misleading dead code.
- **Cache is process-local** — a `Map` in the service instance. Not
  shared across pod restarts or horizontal replicas. A 3-pod deployment
  has 3× the cache-miss rate.
- **No cost tracking** — `EmbeddingStats.totalCost` field exists
  (`embeddings-config.ts:126`) but is never populated (`initializeStats`
  sets it to 0 and nothing increments it — `embeddings-service.ts:313-324`).
- **Token estimation uses `Math.ceil(text.length / 4)`**
  (`embeddings-service.ts:346-350`) — wrong for CJK / Hindi text.
  The chunker correctly uses `gpt-tokenizer`, but the embeddings
  service uses the cheap heuristic for stats.

---

### 3. Vector store — **Score: 7.0 / 10**

**What exists**

- **pgvector** with `vector(1536)` columns on both `rag_chunks.embedding`
  (legacy codepath) and `rag_embeddings.embedding` (preferred multi-model
  codepath). Raw SQL via `Prisma.sql` because Prisma can't write the
  `vector` type (`vector-store-service.ts:71-136`).
- **HNSW index** for cosine similarity with sensible defaults:
  `m=16, ef_construction=64, ef_search=40`
  (`vector-store-indexes.sql:13-16`). IVFFlat is documented as an
  alternative for >1M vectors.
- **GIN index** for BM25 full-text on `to_tsvector('english', content)`
  (`vector-store-indexes.sql:26-28`).
- **GIN index** on `metadata` JSONB and a composite
  `(tenant_id, document_id)` index for filtered queries
  (`vector-store-indexes.sql:31-36`).
- **Hybrid search** in a single SQL CTE — vector_scores + bm25_scores
  joined and weighted `0.3 * BM25 + 0.7 * vector`
  (`vector-store-service.ts:203-266`, `vector-store-config.ts:56-60`).
- **Filtering** by `documentId`, `sourceId`, `documentType`, `category`,
  `hasCode`, `hasTable`, `hasList`, `minTokenCount`, `maxTokenCount`
  (`vector-store-service.ts:428-466`).
- **Multi-tenant isolation** at the SQL layer — every query has
  `WHERE c.tenant_id = ${tenantId}` parameterised.
- **Batch insert** in a transaction with rollback on failure
  (`vector-store-service.ts:71-136`).
- **Index stats endpoint** — `getIndexStats()` reads `COUNT(*)` +
  `pg_relation_size` (`vector-store-service.ts:397-416`).

**What's missing**

- **No Qdrant / Weaviate / Pinecone alternative** — pgvector only.
  Fine for ≤10M vectors; for larger scale, HNSW build time and RAM
  become painful.
- **HNSW parameters are never re-tuned**. `m=16, ef_construction=64,
  ef_search=40` are the pgvector defaults — world-class systems tune
  these per dataset (e.g. `m=32, ef_construction=128` for higher
  recall at the cost of build time). No benchmarking script present.
- **No partitioning** by `tenant_id` — the schema doc mentions it as a
  comment (`vector-store-indexes.sql:66-67`) but it's not implemented.
  A single 50M-row `rag_chunks` table across all tenants will degrade.
- **Dual-write tech debt**: `insertChunks` writes the vector to BOTH
  `rag_chunks.embedding` and `rag_embeddings.embedding`
  (`vector-store-service.ts:117-131`) — kept alive "for the legacy
  KnowledgeService codepath". This doubles write amplification and
  storage.
- **SQL-injection risk in filter builder**. `buildFilterClauses`
  (`vector-store-service.ts:428-466`) uses `escapeLiteral` (single-quote
  doubling) instead of `Prisma.sql` parameterisation for filter values.
  The main queries parameterise, but filters bypass it. A malicious
  `category` or `documentType` value with a backslash-escape sequence
  could break out.
- **`avgSearchTimeMs` is hardcoded `0.5`** in `getIndexStats`
  (`vector-store-service.ts:413`) — placeholder never wired to real
  query logs.
- **No approximate count** for `getStats` — `prisma.ragChunk.count` is
  an exact count, slow on large tables.

---

### 4. Retriever — **Score: 4.0 / 10** (would be 6/10 if the bugs were fixed)

**What exists**

- **Hybrid retrieval via Reciprocal Rank Fusion** — the *right*
  algorithm. Vector leg + keyword leg run in parallel via
  `Promise.allSettled`, fused with `score = Σ 1/(k + rank)`, `k=60`
  (the standard RRF constant from the original paper)
  (`retriever/retrieval-service.ts:172-218, 339-369`,
  `retrieval-config.ts:58-63`).
- **Graceful degradation**: vector leg failure → keyword-only fallback;
  keyword leg failure → vector-only; both fail → empty
  (`retrieval-service.ts:198-213`).
- **Over-fetch for fusion** — `overFetchFactor: 2` means the vector leg
  retrieves `2 × topK` candidates before fusion
  (`retrieval-config.ts:62`).
- **Caching** by SHA-256 of `{query, tenantId, filters, topK,
  enableHybrid}` — 1h TTL, tenant-isolated by construction
  (`retrieval-service.ts:537-546`).
- **Conversation-aware query enhancement** in the pipeline wrapper —
  concatenates the last 3 history messages onto the query
  (`retrieval-pipeline.ts:203-216`).
- **Pipeline-level keyword-only fallback** if the entire retrieval
  throws (`retrieval-pipeline.ts:108-145`).
- **Stats**: `totalQueries`, `averageLatencyMs`, `averageResultsCount`,
  `cacheHits/Misses`, `rerankEnabled`, `hybridEnabled`,
  `keywordFallbacks`, `errors`.

**Critical bugs (runtime-fatal)**

1. **`vectorStoreService.similaritySearch` does not exist.**
   `retrieval-service.ts:240` calls
   `this.vectorStoreService.similaritySearch(queryEmbedding, filters,
   topK, threshold)`, but `VectorStoreService` only exposes `search`,
   `hybridSearch`, `searchWithFilters`, `insert`, `insertBatch`,
   `update`, `delete` (verified at
   `vector-store-service.ts:153, 203, 273, 328, 343, 355, 362`). The
   method is `undefined`, so the call throws `TypeError:
   this.vectorStoreService.similaritySearch is not a function`. **The
   entire retrieval pipeline crashes here at runtime.** The unit tests
   pass because `retrieval-service.spec.ts:50` mocks
   `similaritySearch: vi.fn().mockResolvedValue([sampleResult])` — the
   mock hides the missing method.

2. **Document status mismatch in keyword leg.**
   `retrieval-service.ts:296` queries `WHERE d.status = 'processed'`
   (lowercase), but the document status enum is `'READY' | 'PROCESSING'
   | 'FAILED' | 'DELETED'` (uppercase) — see `ingestion.dto.ts:111`
   and `ingestion-service.ts:138`. The keyword leg will **never match
   any document**. Even if bug #1 were fixed, hybrid retrieval would
   silently degrade to vector-only.

3. **`search_vector` column does not exist.**
   `retrieval-service.ts:292, 297` queries
   `c.search_vector @@ plainto_tsquery(...)`, but neither
   `chunking-schema.sql` nor `vector-store-indexes.sql` creates a
   `search_vector` column. The GIN index in
   `vector-store-indexes.sql:26-28` is on the *expression*
   `to_tsvector('english', content)`, not a stored generated column.
   The keyword leg will throw `column c.search_vector does not exist`.

**What's missing (even after the bugs are fixed)**

- **No real reranker.** The "rerank" step is a 1-line keyword-overlap
  heuristic: `rerankScore = 0.3 * keywordMatch + 0.7 * similarity`
  (`retrieval-service.ts:397-414`). No BGE-reranker, no Cohere Rerank,
  no cross-encoder. The config declares `model:
  'bge-reranker-large'` (`retrieval-config.ts:68`) but it's never
  loaded — pure documentation. The "LLM rerank" path
  (`enableLlmRerank=true`) is a stub that **explicitly returns results
  unchanged**: `'LLM rerank requested but not yet implemented —
  returning as-is'` (`retrieval-service.ts:391-395`).
- **No query rewriting** — no HyDE, no sub-query generation, no
  multi-query fanout. `retrieveBatch` exists
  (`retrieval-pipeline.ts:225-248`) but no caller fans out sub-queries;
  it's just a parallel-retrieval helper.
- **No query expansion** at the embedding layer (see §2).
- **No citation tracking at retrieval time** — citations are extracted
  post-hoc from the LLM response text by regex (`response-processing-
  service.ts:149-189`). The retriever doesn't tag chunks with stable
  citation IDs that survive fusion.
- **No source diversity** in fusion — RRF naturally promotes chunks
  that appear in both legs, but there's no explicit diversification
  (MMR / lambda-loss) to avoid returning 5 chunks from the same
  document.
- **No deduplication** of near-identical chunks (e.g. same paragraph
  ingested twice across documents). The `cosineSimilarity` helper
  exists (`embeddings-service.ts:204`) but isn't applied in fusion.
- **Token estimation uses `length / 4`** (`retrieval-service.ts:553`)
  — wrong for CJK / Hindi.
- **Cache is process-local** — same problem as embeddings.

---

### 5. Prompt assembly — **Score: 7.0 / 10**

**What exists**

- **Well-structured system prompt builder** with 5 sections
  (`prompt-assembly-service.ts:73-83`): Role, Instructions, Knowledge
  Context, Rules, Available Tools. Empty sections are skipped.
- **6 channel-specific markdown templates** under
  `prompts/prompt-templates/`: `system-base.md`, `voice-agent.md`,
  `web-chat-agent.md`, `sales-agent.md`, `customer-support.md`,
  `whatsapp-agent.md`. Loaded lazily and cached
  (`prompt-assembly-service.ts:160-176`).
- **Citation enforcement** in the system prompt
  (`prompts/prompt-templates/system-base.md:9, 26-32`):
  > Always cite your sources using `[1]`, `[2]`, etc.
  > When you use information from the context, end the relevant
  > sentence with `[N]` where N matches the citation number.
- **Numbered context blocks** with source attribution
  (`prompt-assembly-service.ts:219-230`):
  ```
  [1] (Source: Wellness Pack Guide)
  Take 2 tablets daily with water.
  ```
- **Conversation history replayed as separate messages** (not flattened
  into one user prompt) — `buildMessagesForLLM` produces a proper
  Chat Completions `messages[]` array with `system` → history turns →
  final `user` (`prompt-assembly-service.ts:122-150`).
- **Long-term memories rendered with type** (`prompt-assembly-service.ts:
  251-259`): `- key (fact): value` so the LLM knows whether each
  memory is a fact / preference / history / context.
- **Token budget enforcement** — `truncateContextToFit` drops chunks
  until under `maxTotalTokens` (`prompt-assembly-service.ts:449-495`).
- **Legacy `assemble(...)` API** kept for backward compat with the
  broken `complete-pipeline-service.ts`.

**What's missing**

- **No real token counting** — `estimateTokens` uses `length / 4`
  (`prompt-assembly-service.ts:515-517`). For CJK / Hindi this
  under-counts by ~2.5×, so the truncation logic will overflow the
  model's context window. The chunker has `gpt-tokenizer` available —
  it should be shared with the prompt assembler.
- **No prompt template versioning** — templates are flat `.md` files
  with no version metadata. Changing a template silently affects every
  tenant.
- **No A/B test support** — no way to route a fraction of traffic to
  an alternate template.
- **No prompt caching** — every search rebuilds the system prompt from
  scratch. OpenAI's prompt caching (automatic for prompts ≥1024 tokens)
  helps, but the assembly cost is still paid.
- **No few-shot examples** in templates — world-class RAG systems
  include 2-3 ideal responses in the system prompt to anchor citation
  style.

---

### 6. Evaluation — **Score: 6.0 / 10**

**What exists**

- **Six-metric framework** (`evaluation/evaluation-service.ts:18-32`):
  1. **Precision** — LLM-judge (`gpt-4o-mini`) scores each retrieved
     chunk's relevance; `precision = relevant / retrieved`
     (`evaluation-service.ts:341-351, 502-528`).
  2. **Recall** — heuristic from user feedback (`evaluation-service.ts:
     365-369`).
  3. **Hallucination score** — LLM-judge (`gpt-4o`) returns
     `{hallucination_score, unsupported_claims}` as strict JSON
     (`evaluation-service.ts:379-410`).
  4. **Accuracy** — feedback short-circuit + LLM self-assessment
     (`evaluation-service.ts:424-451`).
  5. **Latency** — pass-through from the persisted `RagQuery.latencyMs`
     (`evaluation-service.ts:457-459`).
  6. **Citation accuracy** — regex-extracts `[n]` and `[n](chunkId)`
     markers, validates each against the retrieved chunk set
     (`evaluation-service.ts:474-491`).
- **Suite runner** — batch-evaluates a list of query IDs in parallel,
  aggregates averages, captures per-query failures
  (`evaluation-service.ts:164-201`).
- **Aggregate metrics** over a time window — total queries, average
  latency, average confidence, feedback distribution, citation
  coverage (`evaluation-service.ts:207-270`).
- **Dashboard endpoint** — recent queries + live re-evaluation of a
  sample (`evaluation-service.ts:280-327`).
- **Multi-tenant safety** — every read scoped by `user.tenantId`;
  cross-tenant lookups return 404 (`evaluation-service.ts:91-93`).
- **JSON-mode judge calls** — `response_format: { type: 'json_object' }`
  with `temperature: 0` for deterministic judgements
  (`evaluation-service.ts:554-571`).
- **Fail-safe defaults** — judge failures default to "hallucinated"
  (`evaluation-service.ts:129-132`) and "neutral accuracy"
  (`evaluation-service.ts:133-136`).

**What's missing**

- **Recall is not a real metric.** It's a 3-value heuristic:
  `feedback='positive' → 1.0`, `'negative' → 0.3`, otherwise `0.7`
  (`evaluation-service.ts:365-369`). Without ground-truth labels for
  the full corpus, recall is undefined. World-class systems maintain
  a labelled evaluation dataset (50-200 queries with known-relevant
  chunk IDs) and compute true recall. The code comments admit this:
  > When a richer ground-truth set becomes available (e.g. a labelled
  > evaluation dataset), this method is the right place to plug in
  > `relevantChunkIds` lookup instead of the feedback heuristic.
- **Accuracy is also feedback-short-circuited** (`positive → 1.0,
  negative → 0.2`) — same problem. The LLM self-assessment fallback
  doesn't see the retrieved context, so it can't judge groundedness.
- **No NDCG, MRR, or MAP** — only precision@k (binary relevance from
  the judge). World-class systems track NDCG@10 to capture ranking
  quality, not just presence.
- **No context relevance / context precision** metric — i.e. "of the
  chunks retrieved, what fraction actually contributed to the answer?"
  The citation-coverage metric is a weak proxy.
- **No answer faithfulness** as a separate metric from hallucination
  (Ragas-style: "is every claim in the answer supported by a
  retrieved chunk?"). The hallucination score conflates the two.
- **No automated regression CI** — the suite runner exists but isn't
  wired to a scheduled job or PR check.
- **`getDashboard` re-evaluates up to 50 queries on every call**
  (`evaluation-service.ts:284, 300-308`) — each evaluation is 6 LLM
  calls (1 precision-per-chunk + 1 hallucination + 1 accuracy). At
  `sampleSize=10` that's ~80 LLM calls per dashboard load. No caching.
- **No comparison/trend view** — metrics are point-in-time only, no
  historical baseline to detect regressions.

---

### 7. LLM gateway — **Score: 6.0 / 10**

**What exists**

- **Multi-provider abstraction** — OpenAI (via SDK), Anthropic, Google,
  Azure (via `fetch`) (`response-pipeline/llm-gateway-service.ts:129-144,
  340-521`). Single `generate(request)` API.
- **Intelligent routing** by complexity (`low/medium/high` based on
  prompt word count) → routes to `gpt-3.5-turbo` / `claude-3-sonnet` /
  `gpt-4o` (`llm-gateway-config.ts:107-123`,
  `llm-gateway-service.ts:296-335`).
- **Automatic fallback** — primary provider failure → configured
  fallback provider (`llm-gateway-service.ts:179-191, 526-543`).
  Fallback chain: OpenAI → Anthropic → Google → OpenAI
  (`llm-gateway-config.ts:73-103`).
- **Streaming** — `generateStream` returns an `AsyncGenerator` of
  token deltas. OpenAI path uses the SDK's `stream: true` +
  `stream_options.include_usage` (`llm-gateway-service.ts:201-269`).
  Other providers fall back to non-streaming + single-chunk emit.
- **Caching** — SHA-256 of `{prompt, systemPrompt, messages, model,
  temperature}` → cached response for 1h, max 10k entries
  (`llm-gateway-service.ts:585-594`, `llm-gateway-config.ts:132-136`).
- **Cost tracking** — per-model pricing table multiplied by token
  usage (`llm-gateway-service.ts:548-565`). Stats include
  `totalCost`, `providerUsage`, `modelUsage`, `averageLatencyMs`,
  `cacheHits/Misses`, `fallbacks`, `errors`
  (`llm-gateway-service.ts:69-87, 570-572`).
- **Token usage** captured from each provider's response shape
  (`llm-gateway-service.ts:360-364, 413-417, 462-466, 513-517`).
- **`SearchService` persists every query** to `ragQuery` with
  `latencyMs`, `retrievedChunkIds`, `responseText`, `confidence`
  (`search/search.service.ts:236-256`).
- **Feedback endpoint** — `POST /api/rag/search/:queryId/feedback`
  updates the `feedback` column (`search.service.ts:462-485`).
- **Streaming pipeline event** — `retrieval_complete` is emitted
  *before* the first token so the client can render citations
  early (`response-pipeline.service.ts:228-235`,
  `search.service.ts:326-335`).

**What's missing**

- **No circuit breaker.** A failing provider (e.g. OpenAI 5xx storm)
  will trigger fallback on *every* request, doubling cost and
  latency. World-class gateways open a circuit after N consecutive
  failures and short-circuit to the fallback for a cooldown period.
- **No retry-with-backoff.** The config declares `maxRetries: 3,
  retryDelayMs: 1000` (`llm-gateway-config.ts:128-129`) but these
  values are **never read** by the gateway. On a transient 429/503,
  the gateway immediately falls back to another provider rather than
  retrying the same one with exponential backoff. The OpenAI SDK's
  built-in retries help for the OpenAI path but not for Anthropic /
  Google / Azure (which use raw `fetch` with no retry).
- **No rate-limit enforcement.** The gateway tracks `totalRequests`
  and `totalTokens` but never throttles. A spike will hit provider
  rate limits and start failing.
- **No token counting before the call.** `maxTokens: 1000` is the
  only budget. There's no preflight check that `prompt + history +
  context ≤ model.contextWindow - maxTokens`. A 200K-token context
  will 400 at the API.
- **No semantic cache** — cache key is exact-string SHA-256. Two
  paraphrased queries ("what's the dosage?" vs "how much should I
  take?") produce different cache keys even though they'd benefit
  from the same answer. World-class systems use embedding-similarity
  cache (e.g. GPTCache).
- **Cache is process-local** — same problem as embeddings.
- **Cost tracking is approximate** — the pricing table
  (`llm-gateway-service.ts:549-561`) has hardcoded per-1K-token rates
  that don't distinguish input vs output pricing (gpt-4o is $5/1M
  input + $15/1M output — the code uses a single $0.005/1K blended
  rate). Pricing drifts as providers update; no config-driven
  pricing.
- **No per-tenant cost guardrails** — no daily/monthly spend caps.
  A single chatty tenant can exhaust the OpenAI budget for everyone.
- **Anthropic / Google / Azure paths don't support streaming** — they
  fall back to non-streaming and emit the full response as a single
  chunk (`llm-gateway-service.ts:208-217`). For WhatsApp / voice
  agents this is a UX regression.
- **No tool-calling / function-calling support** in the gateway
  abstraction — `LLMRequest` has no `tools` field
  (`llm-gateway-config.ts:149-167`). The RAG system can't call back
  into Dayjoy's product/customer/order tools.
- **Hardcoded model list** — `gpt-4o, gpt-4-turbo, gpt-3.5-turbo,
  claude-3-opus, claude-3-sonnet, claude-3-haiku, gemini-pro,
  gemini-ultra`. Missing: `gpt-4o-mini`, `gpt-4o-2024-08-06`,
  `claude-3-5-sonnet`, `claude-3-5-haiku`, `gemini-1.5-pro`,
  `gemini-1.5-flash`. The model list will drift from reality.

---

### 8. Security — **Score: 6.0 / 10**

**What exists**

- **Tenant isolation enforced at three layers**:
  1. **SQL layer** — every `rag_chunks` / `rag_documents` /
     `rag_embeddings` query has `WHERE tenant_id = ${tenantId}`
     parameterised (`vector-store-service.ts:177, 227, 240, 295`).
  2. **Cache layer** — `tenantId` is part of the SHA-256 cache key
     (`retrieval-service.ts:537-546`), so the same query from
     different tenants produces different keys.
  3. **HTTP layer** — `TenantIsolationInterceptor` stamps
     `request.tenantId` from the JWT and rejects cross-tenant writes
     with `403 Forbidden` (`security/tenant-isolation.interceptor.ts:
     75-90`).
- **Per-document access control** via `DocumentPermissionsService`
  (`security/document-permissions.service.ts`):
  - `metadata.restrictions.roles[]` — allow-list of roles.
  - `metadata.restrictions.userIds[]` — allow-list of users.
  - `tenantScoped: true` — default-on tenant boundary.
  - Super-admin bypass *within the same tenant* (line 136-141).
  - `filterAccessibleChunks(userId, chunkIds[])` — single-round-trip
    batch filter used to drop inaccessible chunks *before* they reach
    the LLM (lines 252-286).
- **NestJS guard** — `RagSecurityGuard` enforces document-level
  permissions on RAG endpoints, with bulk-chunk awareness
  (`security/rag-security.guard.ts:65-127`).
- **PII detection on LLM output** — regex for SSN, credit card (16
  digits), email, phone (`response-processing-service.ts:540-549`).
  Wired into `validation.hasPII` on every response.
- **Hallucination flag** on every response
  (`response-processing-service.ts:222-277`).
- **Audit logging** — denials logged at WARN level in
  `RagSecurityGuard` and `DocumentPermissionsService`.

**What's missing**

- **No PII detection/redaction at ingestion.** PII is checked only on
  the LLM *response* (`response-processing-service.ts:519-520`). If a
  user uploads a document containing SSNs / credit card numbers /
  Aadhaar numbers, those get embedded and stored in pgvector
  unredacted. The docs explicitly acknowledge this:
  > Don't put PII in metadata. Metadata is not encrypted at rest.
  (`docs/INGESTION_GUIDE.md:226`)
- **No encryption at rest** for embeddings, chunks, or metadata. The
  `vector(1536)` column is plaintext. No `pgcrypto`, no envelope
  encryption, no KMS integration. A DB backup leak exposes every
  ingested document.
- **No field-level encryption** for sensitive metadata fields
  (customer IDs, internal URLs).
- **PII regex is naive** — `\b\d{16}\b` for credit cards misses
  grouped formats (`4111 1111 1111 1111`), `\b\d{3}-\d{2}-\d{4}\b`
  for SSN misses `XXX XX XXXX`. No Luhn check. No India-specific PII
  (Aadhaar `\d{12}`, PAN `[A-Z]{5}\d{4}[A-Z]`).
- **Toxicity check is a stub** — `checkToxicity` always returns
  `false` (`response-processing-service.ts:554-556`). Comment admits:
  > placeholder — integrate with Perspective API.
- **`filterAccessibleChunks` is not called by the retrieval pipeline.**
  `ContextBuilderService.buildContext` calls
  `retrievalService.retrieve(...)` which returns chunks filtered only
  by `tenantId` at the SQL layer — `filterAccessibleChunks` is never
  invoked. A user without the `DISTRIBUTOR_MANAGER` role could
  receive chunks from a role-restricted document *if* their retrieval
  query happened to surface them. **This is a real authorization
  bypass** for tenants that use `metadata.restrictions.roles`.
- **No prompt-injection defense.** A malicious document ingested into
  the knowledge base could contain "Ignore previous instructions and
  ..." — it would be retrieved and injected verbatim into the LLM
  context. No detection, no sanitisation.
- **No rate limiting on the search endpoint** — a single tenant can
  hammer `POST /api/rag/search` and exhaust the OpenAI budget.
- **JWT-based auth assumed but no per-IP throttling.**

---

## Critical gaps (must fix for production)

1. **🚨 BUG: `VectorStoreService.similaritySearch` does not exist.**
   `retriever/retrieval-service.ts:240` calls
   `this.vectorStoreService.similaritySearch(...)`. The actual methods
   are `search`, `hybridSearch`, `searchWithFilters`
   (`vector-store-service.ts:153, 203, 273`). Tests pass because the
   mock provides `similaritySearch: vi.fn()` (`retrieval-service.spec.ts:50`).
   **The retrieval pipeline crashes at runtime.** Fix: rename the call
   to `search()` (which takes `(queryEmbedding, options: SearchOptions)`),
   or add a `similaritySearch` alias to `VectorStoreService`.

2. **🚨 BUG: keyword leg queries `d.status = 'processed'` (lowercase)**
   but the document status enum is `'READY' | 'PROCESSING' | 'FAILED'
   | 'DELETED'` (uppercase). The keyword leg will *never* return
   results (`retriever/retrieval-service.ts:296`). Fix: change to
   `d.status = 'READY'`.

3. **🚨 BUG: `c.search_vector` column does not exist.**
   The keyword leg queries `c.search_vector @@ plainto_tsquery(...)`
   (`retrieval-service.ts:292, 297`), but neither
   `chunking-schema.sql` nor `vector-store-indexes.sql` creates a
   `search_vector` column. The GIN index is on the *expression*
   `to_tsvector('english', content)`. Fix: either add a generated
   `search_vector tsvector GENERATED ALWAYS AS
   (to_tsvector('english', content)) STORED` column + GIN index on it,
   or rewrite the keyword leg to use the expression directly
   (`to_tsvector('english', c.content) @@ plainto_tsquery(...)`).

4. **🚨 BUG: `EmbeddingPipelineService.processDocument` calls
   non-existent methods.** `embeddings/embeddings-pipeline.ts:38`
   calls `chunkingService.chunkDocument(...)` — `ChunkingService`
   has no such method (only `chunk()` and `chunkByTokens()`). Line 62
   calls `embeddingsService.storeEmbeddings(...)` which is a no-op
   (deprecated). Line 73 sets `status: 'embedded'` (not in the
   `'READY' | 'PROCESSING' | 'FAILED' | 'DELETED'` enum). This
   pipeline is dead code — it's not wired in `rag.module.ts` — but
   it's a landmine if anyone imports it. Fix: delete the file or
   refactor to call `IngestionService.ingestDocument()`.

5. **🚨 AUTHZ BYPASS: `filterAccessibleChunks` is not called by the
   retrieval pipeline.** `ContextBuilderService.buildContext` →
   `RetrievalService.retrieve` → `VectorStoreService.search` filters
   by `tenantId` only. Per-document role/user restrictions
   (`metadata.restrictions`) are not enforced. Fix: after retrieval,
   call `documentPermissions.filterAccessibleChunks(userId,
   chunkIds)` and drop inaccessible chunks before they reach the LLM.

6. **No real reranker.** The "rerank" step is `0.3 * keywordMatch +
   0.7 * similarity` (`retrieval-service.ts:405`). No BGE-reranker /
   Cohere Rerank / cross-encoder. Fix: integrate
   `bge-reranker-large` (self-hosted via HuggingFace + ONNX) or
   Cohere Rerank API; replace the heuristic.

7. **No OCR for scanned PDFs.** Acknowledged in
   `docs/INGESTION_GUIDE.md:30`. Fix: add Tesseract or a cloud OCR
   (Google Document AI, AWS Textract, Azure Form Recognizer) fallback
   when `pdf-parse` returns empty text.

8. **No encryption at rest.** Embeddings, chunks, and metadata are
   plaintext in pgvector. Fix: enable `pgcrypto` for sensitive
   metadata fields; use envelope encryption (KMS-managed data key)
   for chunk content; consider column-level encryption for embeddings
   if the threat model warrants it.

---

## Recommended upgrades (to reach world-class)

1. **Add a cross-encoder reranker** (BGE-reranker-large or Cohere
   Rerank 3). This alone typically lifts precision@5 by 10-20 points.
   Wire it into `RetrievalService.rerank` behind a feature flag.

2. **Implement query rewriting / HyDE / multi-query fanout.** Use a
   cheap LLM (`gpt-4o-mini`) to generate 3-5 paraphrases of the user
   query, embed each, retrieve, and fuse with RRF across all legs.
   The `retrieveBatch` helper already exists — wire it up.

3. **Add OCR + table extraction.** Replace `pdf-parse` with
   `unstructured-io` or `pdfjs-dist` + a table-extraction library
   (`camelot`, `tabula-py`, or AWS Textract for cloud). Preserve
   tables as structured JSON in chunk metadata.

4. **Add a real evaluation dataset.** Curate 100-200 queries with
   human-labelled relevant chunk IDs. Compute true recall, NDCG@10,
   MRR. Wire `EvaluationService.calculateRecall` to the labelled set
   instead of the feedback heuristic. Add Ragas-style faithfulness +
   answer relevancy metrics.

5. **Move caches to Redis.** Embedding cache, retrieval cache, LLM
   cache, response cache are all in-process `Map`s. A 3-pod deployment
   has 3× the cache-miss rate and 3× the OpenAI spend on cacheable
   queries. Redis with TTL + LRU eviction gives shared cache across
   pods and survives restarts.

6. **Add a circuit breaker + retry-with-backoff to the LLM gateway.**
   Use `opossum` or hand-roll. Open the circuit after 5 consecutive
   failures; short-circuit to fallback for 30s; half-open probe. Add
   exponential backoff (`1s, 2s, 4s, 8s`) for 429/503 before falling
   back. Actually read the `maxRetries: 3, retryDelayMs: 1000` config
   that's currently dead.

7. **Add PII redaction at ingestion.** Run Microsoft Presidio or AWS
   Comprehend on every chunk before embedding. Redact SSN / credit
   card / Aadhaar / PAN / email / phone with placeholders. Store the
   redaction map in a separate encrypted table for reversible
   redaction.

8. **Add token counting with the real tokenizer.** Replace
   `Math.ceil(text.length / 4)` in `prompt-assembly-service.ts:515`,
   `context-builder.service.ts` (`tokensPerChar: 0.25`), and
   `retrieval-service.ts:553` with `gpt-tokenizer.encode(text).length`
   (the chunker already uses this library). This is critical for CJK
   / Hindi content where the heuristic under-counts by 2.5×.

9. **Add prompt-injection defense.** Sanitize retrieved chunks before
   injecting into the prompt — wrap in `<retrieved_context>` XML
   tags, add a system-prompt instruction to treat the content as data
   not instructions, and optionally run a classifier to detect
   injection attempts.

10. **Add per-tenant cost guardrails.** Track daily/monthly token
    spend per tenant in a `tenant_usage` table. Reject new requests
    with `429` when a tenant exceeds their quota. Surface usage on
    the admin dashboard.

11. **Add source diversity (MMR) in context assembly.** After fusion,
    apply Maximal Marginal Relevance to avoid returning 5 chunks from
    the same document. `λ=0.5` balances relevance vs diversity.

12. **Add field-level encryption for embeddings.** Use pgcrypto's
    `pgp_sym_encrypt` with a KMS-rotated key, or envelope-encrypt
    the vector at the application layer before INSERT.

13. **Tune HNSW parameters per dataset.** Benchmark `m ∈ {16, 24, 32}`
    and `ef_construction ∈ {64, 128, 256}` against a labelled
    evaluation set. Pick the configuration that maximises recall@10
    within a latency budget.

14. **Add prompt template versioning + A/B testing.** Store templates
    in a `rag_prompt_templates` table with `version`, `status` (draft
    / active / archived), and `traffic_fraction`. Route requests
    through a `TemplateRouter` that picks the active variant.

15. **Add an OpenTelemetry trace** spanning ingestion → chunking →
    embedding → storage → retrieval → LLM → response processing.
    Export to Jaeger / Honeycomb / Datadog. The stats objects are a
    good start but they're in-process counters, not distributed
    traces.

---

## What's already good

1. **Token-aware chunking** with `gpt-tokenizer` (cl100k_base) —
   correct for GPT-4 / `text-embedding-3-*`, unlike character-based
   chunkers (`ingestion/chunking-service.ts:457-466`).
2. **Three chunking strategies** (hierarchical / paragraph / sentence)
   picked per document, with post-processing (merge small, split
   large, add overlap) — `chunking-service.ts:89-121`.
3. **Per-document-type chunking config** — PDF/DOCX/MD use 1000/200,
   HTML uses 800/160, CSV uses 400/0 (one row per chunk)
   (`chunking-config.ts:82-141`).
4. **6 format loaders** with MIME-type + extension fallback
   (`loaders/loader.factory.ts`).
5. **Section/heading preservation** in MD/HTML/DOCX loaders —
   citations carry a `section` breadcrumb.
6. **pgvector + HNSW + GIN** indexes — the right primitives
   (`vector-store-indexes.sql`).
7. **Hybrid search via Reciprocal Rank Fusion** — the de-facto
   standard, parameter-free, robust to score-scale mismatch
   (`retrieval-service.ts:339-369`).
8. **Multi-tenant isolation at SQL + cache + HTTP layers** —
   defence-in-depth.
9. **Per-document role/user restrictions** with super-admin bypass
   (`DocumentPermissionsService`).
10. **LLM-judge evaluation** with `gpt-4o-mini` for cheap relevance
    calls and `gpt-4o` for hallucination/accuracy
    (`evaluation-service.ts:57-59`).
11. **Citation extraction + validation** against retrieved chunks
    (`response-processing-service.ts:149-201`).
12. **Hallucination detection** — both heuristic (word-overlap) in
    `ResponseProcessingService` and LLM-judge in `EvaluationService`.
13. **Multi-provider LLM gateway** with routing, fallback, streaming,
    cost tracking (`response-pipeline/llm-gateway-service.ts`).
14. **Streaming pipeline** with `retrieval_complete` event emitted
    before the first token (`response-pipeline.service.ts:188-287`,
    `search.service.ts:277-413`).
15. **Confidence scoring** — weighted blend of citation coverage,
    top similarity, and source diversity (`response-processing-
    service.ts:294-324`).
16. **In-memory caches** at every layer (embedding / retrieval / LLM
    / response) with TTL + LRU eviction.
17. **Stats tracking** on every service — `getStats()` returns
    running counters for ops dashboards.
18. **153 tests** across three suites (Agent F ingestion, Agent G
    query, Agent H eval+security) — `README.md:326-332`.
19. **Honest documentation** — bugs and limitations are called out in
    code comments (e.g. `pdf.loader.ts:23-27` admits the page-number
    heuristic, `retrieval-service.ts:391-394` admits LLM rerank is a
    stub, `embeddings-service.ts:280-290` admits `storeEmbeddings` is
    a no-op).

---

## Appendix: file-by-file evidence index

| Finding | File | Lines |
|---|---|---|
| `similaritySearch` missing method called | `retriever/retrieval-service.ts` | 240 |
| Actual `VectorStoreService` methods | `vector-store/vector-store-service.ts` | 153, 203, 273 |
| Mock that hides the bug | `retriever/retrieval-service.spec.ts` | 50 |
| `d.status = 'processed'` lowercase mismatch | `retriever/retrieval-service.ts` | 296 |
| Status enum (uppercase) | `ingestion/ingestion.dto.ts` | 111 |
| `c.search_vector` column queried | `retriever/retrieval-service.ts` | 292, 297 |
| No `search_vector` in schema DDL | `ingestion/chunking-schema.sql`, `vector-store/vector-store-indexes.sql` | — |
| GIN index on expression, not column | `vector-store/vector-store-indexes.sql` | 26-28 |
| `chunkDocument` missing method called | `embeddings/embeddings-pipeline.ts` | 38 |
| `storeEmbeddings` is a no-op | `embeddings/embeddings-service.ts` | 284-290 |
| `filterAccessibleChunks` not called by retrieval | `context-builder/context-builder.service.ts` | 86 |
| Rerank is keyword-overlap heuristic | `retriever/retrieval-service.ts` | 397-414 |
| LLM rerank is a stub | `retriever/retrieval-service.ts` | 391-395 |
| No OCR | `loaders/pdf.loader.ts` | 38 (`pdf-parse` only) |
| No encryption at rest | `docs/INGESTION_GUIDE.md` | 226 |
| PII regex on response only | `response-pipeline/response-processing-service.ts` | 519-520, 540-549 |
| `maxRetries` config never read | `response-pipeline/llm-gateway-config.ts` | 128-129 |
| `maxRequestsPerMinute` never enforced | `embeddings/embeddings-config.ts` | 54-55 |
| Token heuristic `length / 4` | `prompts/prompt-assembly-service.ts` | 515-517 |
| Token heuristic `tokensPerChar: 0.25` | `context-builder/context-builder.config.ts` | 129 |
| Recall is feedback heuristic | `evaluation/evaluation-service.ts` | 365-369 |
| Accuracy is feedback short-circuit | `evaluation/evaluation-service.ts` | 425-426 |
| Dual-write tech debt | `vector-store/vector-store-service.ts` | 117-131 |
| SQL filter escape (not parameterised) | `vector-store/vector-store-service.ts` | 428-466 |
| Cost table hardcoded + wrong for gpt-4o | `response-pipeline/llm-gateway-service.ts` | 549-561 |

---

*End of audit. No files were modified. All evidence is cited by file
path and line number for verification.*

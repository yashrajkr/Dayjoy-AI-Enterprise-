# Enterprise RAG & Knowledge Management — Architecture

> Stage 2 Step 2 — Production-grade Retrieval-Augmented Generation with multi-tenant
> vector search, hybrid retrieval, re-ranking, citations, and hallucination prevention.

## 1. Overview

The Enterprise RAG system lets every tenant (customer company) upload its own
knowledge — PDFs, DOCX, websites, FAQs, manual entries — and have the AI
answer questions using **only** that tenant's information, with citations and
confidence scoring. Knowledge from one tenant is **never** accessible to
another tenant.

### Key properties

| Property | How it's enforced |
|---|---|
| **Multi-tenancy** | Every table has `organization_id`; every vector DB search includes `organization_id` in its filter; the vector store rejects filters without it. |
| **Hallucination prevention** | Confidence score < threshold → return "I don't know" fallback instead of letting the LLM fabricate. |
| **Citations** | Every retrieved chunk includes a structured citation (document, page, heading, snippet, score). |
| **Provider-agnostic** | Embeddings (OpenAI / BGE local / fake) and vector DB (Qdrant / pgvector / memory) are both swappable via env vars. |
| **Async ingestion** | Long-running ingestion (large PDFs, web crawls) runs as background jobs with progress tracking. |
| **Versioning** | Re-uploading the same source creates a new version; old versions are retained for audit. |
| **Audit** | Every search is logged in `rag_search_logs` for analytics (success rate, latency, citations). |

## 2. Architecture diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (Next.js)                         │
│   Knowledge Library · Upload · Search · Document Detail · Sources   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ /api/v1/knowledge/*
┌──────────────────────────────▼──────────────────────────────────────┐
│                          FastAPI Backend                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │            KnowledgeRAGService (orchestrator)                │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  │   │
│  │  │ IngestionService│  │ RetrievalPipeline│  │  Analytics   │  │   │
│  │  └────────┬────────┘  └────────┬────────┘  └──────────────┘  │   │
│  └───────────┼─────────────────────┼─────────────────────────────┘   │
│              │                     │                                  │
│  ┌───────────▼──────────┐  ┌──────▼──────────────┐                   │
│  │ Document Processors  │  │  Embedding Provider │                   │
│  │ PDF/DOCX/TXT/MD/CSV/ │  │  (OpenAI / BGE /    │                   │
│  │ JSON/HTML/Web/FAQ    │  │   fake)             │                   │
│  └───────────┬──────────┘  └──────────┬──────────┘                   │
│              │                         │                              │
│  ┌───────────▼─────────────────────────▼──────────┐                   │
│  │              Vector Store                       │                   │
│  │   (Qdrant / pgvector / in-memory)               │                   │
│  └─────────────────────────────────────────────────┘                   │
│              │                                                         │
│  ┌───────────▼──────────────────────────────────────┐                  │
│  │   PostgreSQL (metadata, chunks, jobs, logs)      │                  │
│  │   - knowledge_documents                          │                  │
│  │   - document_versions                            │                  │
│  │   - document_chunks                              │                  │
│  │   - knowledge_sources                            │                  │
│  │   - embeddings_metadata                          │                  │
│  │   - ingestion_jobs                               │                  │
│  │   - rag_search_logs                              │                  │
│  └──────────────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. Database schema (Stage 2 Step 2 — migration 0008)

| Table | Purpose | Tenant isolation |
|---|---|---|
| `knowledge_documents` | Top-level documents (one per upload/URL/FAQ) | `organization_id` (indexed) |
| `document_versions` | Version history (one row per re-upload) | `organization_id` |
| `document_chunks` | Semantic chunks (unit of retrieval) | `organization_id` |
| `knowledge_sources` | External sources (web crawl, FAQ collection) | `organization_id` |
| `embeddings_metadata` | Per-chunk embedding audit (model, dim, cost) | `organization_id` |
| `ingestion_jobs` | Background ingestion job tracking | `organization_id` |
| `rag_search_logs` | Per-search analytics (latency, confidence) | `organization_id` |

All tables use UUID primary keys + `created_at` / `updated_at` timestamps.
Migration is reversible (`alembic downgrade -1`).

## 4. Document ingestion pipeline

```
Upload (file / URL / FAQ / manual)
   │
   ▼
1. Validate (size, MIME, extension)
   │
   ▼
2. Create KnowledgeDocument row (status=pending)
   │  (If source_uri or content_sha256 matches an existing
   │   document for this tenant, create a NEW VERSION instead.)
   ▼
3. Format-specific processor
   │  - PDF: pypdf → page-by-page text + page numbers
   │  - DOCX: python-docx → heading-aware paragraphs
   │  - TXT/MD: paragraph split + heading detection
   │  - CSV: one chunk per row (with header context)
   │  - JSON: one chunk per object/array element
   │  - HTML: strip tags + heading-aware chunking
   │  - Web: crawl (bounded) → HTML processor per page
   │  - FAQ: Q&A pair → one chunk per pair
   ▼
4. Smart chunker
   │  - Respect MAX_CHUNK_SIZE / CHUNK_OVERLAP
   │  - Merge undersized chunks (MIN_CHUNK_SIZE)
   │  - Detect language per chunk (Unicode script heuristic)
   │  - Compute content_sha256 for dedup
   │  - Remove exact duplicates (by hash)
   │  - Remove near-duplicates (Jaccard similarity ≥ threshold)
   ▼
5. Embedding provider (batched)
   │  - openai: text-embedding-3-small (1536d) / 3-large (3072d)
   │  - bge_local: BAAI/bge-small-en-v1.5 (384d, on-prem, no API)
   │  - fake: deterministic hash vectors (testing only)
   ▼
6. Vector DB upsert (Qdrant / pgvector / memory)
   │  - One point per chunk
   │  - Payload includes: organization_id, document_id, chunk_id,
   │    chunk_index, text, title, category, tags, language, page,
   │    heading_path, source_uri, embedding_model, created_at
   │  - Payload indexes on organization_id, document_id, chunk_id,
   │    category, language, source_id, tags
   ▼
7. Persist DocumentChunk + EmbeddingsMetadata rows
   ▼
8. Update KnowledgeDocument (status=ready, chunk_count, etc.)
   ▼
9. Create DocumentVersion snapshot
```

## 5. Retrieval pipeline

```
User query (e.g., "What is the return policy?")
   │
   ▼
1. Build VectorSearchFilter (organization_id REQUIRED)
   │  + optional: document_ids, categories, tags, languages, source_ids
   ▼
2. Embed query via embedding provider
   ▼
3. Vector search (top_k=RETRIEVAL_TOP_K, default 20)
   │  - Qdrant: HNSW index with Cosine distance
   │  - Filter by organization_id (tenant isolation)
   ▼
4. Keyword search (Postgres ILIKE on document_chunks.text)
   │  - Simple BM25-style scoring (matched terms / total query terms)
   ▼
5. Hybrid fusion (weighted: 70% semantic + 30% keyword by default)
   ▼
6. Re-rank by hybrid_score, take top RERANK_TOP_K (default 5)
   ▼
7. Load DocumentChunk + KnowledgeDocument rows for citation rendering
   ▼
8. Confidence scoring
   │  - Weighted average of top-K scores (top result counts more)
   │  - Stability penalty (variance across top-K)
   │  - Keyword coverage (query terms in top-3 results)
   │  - Diversity bonus (distinct documents contributing)
   ▼
9. Hallucination prevention
   │  - If confidence < CONFIDENCE_THRESHOLD (default 0.55)
   │    → return fallback "I don't have enough information..."
   │  - If top_score < MIN_SIMILARITY_THRESHOLD (default 0.55)
   │    → return fallback
   ▼
10. Assemble LLM context (respect MAX_CONTEXT_TOKENS, default 4000)
   │  - Numbered citations with title, page, heading, snippet
   ▼
11. Log to rag_search_logs (query, latency, confidence, citations)
   ▼
Return: { results, citations, context, confidence, was_fallback, answer? }
```

## 6. Tenant isolation (defense in depth)

Tenant isolation is enforced at **four** layers:

1. **Database layer** — every tenant-scoped table has `organization_id` as a
   non-null indexed column. All queries from the service layer filter by it.
2. **Application layer** — `KnowledgeRAGService` methods require
   `organization_id` as a keyword-only argument; `get_document`,
   `delete_document`, `update_document` all verify the document belongs to
   the caller's org.
3. **Vector DB layer** — `VectorStore.search()` and `delete_by_filter()`
   raise `VectorStoreError` if the filter lacks `organization_id`. Qdrant
   payload filters enforce this server-side.
4. **API layer** — every endpoint resolves the caller's org from their JWT
   (via `UserOrganizationRepository`) and passes it through.

Cross-tenant access is impossible: even if a user knows another tenant's
document UUID, the `get_document` call filters by `organization_id` and
raises `NotFoundError`.

## 7. Configuration

All settings are in `app/core/config.py` and documented in `.env.example`.

### Critical settings

| Setting | Default | Purpose |
|---|---|---|
| `VECTOR_DB_PROVIDER` | `memory` | `qdrant`, `pgvector`, or `memory` (tests only) |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant HTTP API URL |
| `QDRANT_API_KEY` | (empty) | Required for Qdrant Cloud |
| `EMBEDDING_PROVIDER` | `fake` | `openai`, `bge_local`, or `fake` (tests only) |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI model name |
| `EMBEDDING_DIMENSION` | `1536` | Must match model output |
| `MAX_CHUNK_SIZE` | `1000` | Max chars per chunk |
| `CHUNK_OVERLAP` | `200` | Char overlap between adjacent chunks |
| `RETRIEVAL_TOP_K` | `20` | Initial vector search depth |
| `RERANK_TOP_K` | `5` | Final chunks after re-ranking |
| `MIN_SIMILARITY_THRESHOLD` | `0.55` | Below → fallback |
| `CONFIDENCE_THRESHOLD` | `0.55` | Below → fallback |
| `MAX_UPLOAD_FILE_SIZE_MB` | `50` | Per-file upload limit |

### Production validation

`Settings.validate_production()` enforces:
- `VECTOR_DB_PROVIDER != memory` (must use Qdrant or pgvector)
- `EMBEDDING_PROVIDER != fake` (must use OpenAI or BGE)

## 8. Manual setup

### Option A: Docker Compose (recommended for local dev)

```bash
# 1. Set your OpenAI API key
export OPENAI_API_KEY=sk-...

# 2. Start the full stack (Postgres, Redis, Qdrant, backend, frontend)
docker compose up -d

# 3. Run the migration
docker compose exec backend alembic upgrade head

# 4. Open the app
open http://localhost:3000/knowledge
```

### Option B: Local development (no Docker)

```bash
# 1. Start Qdrant (one of:)
docker run -p 6333:6333 qdrant/qdrant:v1.11.0
# OR install via brew: brew install qdrant && qdrant

# 2. Install backend deps including RAG extras
cd apps/backend
pip install -e ".[rag,dev]"

# 3. Configure .env
cp .env.example .env
# Edit .env: set VECTOR_DB_PROVIDER=qdrant, EMBEDDING_PROVIDER=openai, OPENAI_API_KEY=...

# 4. Run migration + start backend
alembic upgrade head
uvicorn app.main:app --reload

# 5. Start frontend
cd ../frontend
pnpm install
pnpm dev
```

### Configuring Qdrant

- **Local**: `QDRANT_URL=http://localhost:6333` (no API key needed)
- **Qdrant Cloud**: `QDRANT_URL=https://xyz.qdrant.io:6333` + `QDRANT_API_KEY=...`
- **Collection naming**: `{QDRANT_COLLECTION_PREFIX}_shared` (e.g. `dayjoyai_shared`)
  - All tenants share one collection; tenant isolation is via payload filters.
  - To switch to per-tenant collections, modify `_get_collection_name()` in `retrieval.py` and `ingestion.py`.

### Configuring embeddings

| Provider | Pros | Cons | Setup |
|---|---|---|---|
| `openai` | Best quality, hosted, no setup | $0.02/1M tokens (3-small), per-token cost, requires API key | `pip install openai` + `OPENAI_API_KEY=sk-...` |
| `bge_local` | Free, on-prem, no network, privacy | Slower (CPU), 384-1024d, ~500MB model download | `pip install sentence-transformers` + `BGE_MODEL_NAME=BAAI/bge-small-en-v1.5` |
| `fake` | Zero setup, deterministic, free | Not semantic — only useful for tests | (default — no setup needed) |

### Adding a new embedding provider

1. Create `app/ai/embeddings/xxx_provider.py` subclassing `EmbeddingProvider`
2. Implement: `embed_texts()`, `embed_query()`, `get_info()`, `is_available()`, `from_settings()`
3. Register in `EMBEDDING_PROVIDER_REGISTRY` (in `app/ai/embeddings/__init__.py`)
4. Add config keys to `Settings` and `.env.example`

### Adding a new vector DB

1. Create `app/ai/vector_store/xxx_store.py` subclassing `VectorStore`
2. Implement: `ensure_collection()`, `upsert()`, `delete()`, `delete_by_filter()`, `search()`, `count()`, `fetch()`, `close()`, `from_settings()`
3. Register in `VECTOR_STORE_REGISTRY` (in `app/ai/vector_store/__init__.py`)
4. Add config keys to `Settings` and `.env.example`

### Adding a new document format

1. Create `app/ai/document_processors/xxx_processor.py` subclassing `DocumentProcessor`
2. Implement: `process_bytes()` (and `process_text()` if applicable)
3. Register in `PROCESSOR_REGISTRY` (in `app/ai/document_processors/__init__.py`)
4. Add the extension to `ALLOWED_UPLOAD_EXTENSIONS` and MIME types to `ALLOWED_UPLOAD_MIME_TYPES`

## 9. API endpoints

All endpoints are under `/api/v1/knowledge` and require JWT auth.

### Documents

| Method | Path | Purpose |
|---|---|---|
| POST | `/documents` | Upload file (multipart/form-data) |
| POST | `/documents/json` | Upload text/URL/FAQ (JSON body) |
| GET | `/documents` | List documents (filterable) |
| GET | `/documents/{id}` | Get document detail |
| PATCH | `/documents/{id}` | Update metadata |
| DELETE | `/documents/{id}` | Delete (soft by default, `?hard=true` for hard) |
| GET | `/documents/{id}/status` | Get ingestion status |
| GET | `/documents/{id}/versions` | Get version history |
| GET | `/documents/{id}/chunks` | Get document chunks (paginated) |
| POST | `/documents/{id}/reindex` | Re-index (delete old + re-ingest) |
| POST | `/documents/{id}/refresh` | Refresh embeddings |

### Search & citations

| Method | Path | Purpose |
|---|---|---|
| POST | `/search` | RAG search (returns results + citations + context + confidence) |
| POST | `/citations` | Get full citations for chunk IDs |

### Sources

| Method | Path | Purpose |
|---|---|---|
| GET | `/sources` | List sources |
| POST | `/sources` | Create source |
| DELETE | `/sources/{id}` | Delete source (`?delete_documents=true` to also delete docs) |

### Manual entry + analytics + config

| Method | Path | Purpose |
|---|---|---|
| POST | `/manual` | Create manual knowledge entry (typed text) |
| GET | `/analytics` | Get RAG analytics (doc counts, search stats, confidence) |
| GET | `/config` | Get RAG configuration (read-only, no secrets) |

## 10. UI screens

| Page | Path | Purpose |
|---|---|---|
| Knowledge Library | `/knowledge` | List documents, analytics summary, filters, manual entry |
| Upload | `/knowledge/upload` | File / URL / FAQ / Text upload tabs |
| Search | `/knowledge/search` | RAG search with results, citations, context, confidence |
| Document Detail | `/knowledge/[id]` | Chunks, versions, processing status, metadata tabs |
| Sources | `/knowledge/sources` | Manage external sources (web, FAQ, etc.) |

## 11. Background processing

Long-running ingestion jobs (large PDFs, multi-page web crawls) should run
asynchronously. The system supports two modes:

1. **Synchronous (default for small uploads)** — `auto_ingest=True` runs
   ingestion in the request thread. Suitable for files < 5 MB and short
   text/URL/FAQ uploads.
2. **Background worker** — set `auto_ingest=False` on upload, then call
   `KnowledgeRAGService.run_ingestion(document_id, content)` from a worker.

The worker can be:
- A Celery worker (recommended for production)
- An `asyncio.create_task()` spawned from the FastAPI request (quick start)
- A separate Python process reading from a job queue

Job state is tracked in `ingestion_jobs` (status, progress, current_step,
error). The `/documents/{id}/status` endpoint exposes this for UI polling.

### Worker example (Celery-style)

```python
from app.ai.rag_pipeline import KnowledgeRAGService
from app.core.database import AsyncSessionLocal

async def process_ingestion_job(document_id: str, content: bytes | str):
    async with AsyncSessionLocal() as session:
        svc = KnowledgeRAGService(session)
        try:
            await svc.run_ingestion(uuid.UUID(document_id), content)
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

## 12. Security

- **File validation**: extension + MIME type allow-list, size limit (50 MB default)
- **Tenant isolation**: 4-layer enforcement (DB, app, vector DB, API)
- **Input sanitization**: query length capped (2000 chars), no SQL injection
  (SQLAlchemy parameterized queries), no XSS (React escapes by default)
- **Malware-safe upload hooks**: file content is parsed in isolated processors
  that never execute embedded scripts (HTML processor strips `<script>` tags,
  PDF processor uses pypdf which doesn't execute JavaScript)
- **No secrets in code**: all API keys / URLs come from env vars via Pydantic Settings

## 13. Analytics

Per-search analytics are logged in `rag_search_logs`:

| Field | Purpose |
|---|---|
| `query`, `query_hash` | What was searched (PII-safe hash for aggregate queries) |
| `filters` | What filters were applied |
| `results_count` | How many chunks were returned |
| `top_score`, `avg_score` | Best / mean similarity scores |
| `confidence` | Overall confidence (0-1) |
| `citations_count`, `citations` | How many citations + the citations themselves |
| `retrieval_latency_ms`, `reranking_latency_ms`, `total_latency_ms` | Timing breakdown |
| `was_fallback`, `fallback_reason` | Whether we returned "I don't know" |
| `was_successful` | True if not fallback |
| `embedding_model`, `vector_db` | Which providers were used |

The `/analytics` endpoint aggregates these into 30-day rollups:
- Document counts by status
- Total indexed chunks
- Total searches, successful searches, success rate
- Average latency, average confidence
- Total citations used

## 14. Testing

55 tests in `app/tests/test_rag_knowledge.py` covering:

- Embedding providers (Fake, OpenAI mocking, BGE optional)
- Vector store (in-memory + Qdrant mocked)
- Document processors (PDF / DOCX / TXT / MD / CSV / JSON / HTML / Web / FAQ)
- Smart chunker (overlap, dedup, language detection)
- Ingestion pipeline (parse → chunk → embed → index)
- Retrieval pipeline (hybrid search, rerank, citations, confidence)
- Hallucination prevention (low-confidence fallback)
- **Tenant isolation** (cross-tenant queries return nothing)
- API endpoints (upload, list, search, delete, versions, sources, analytics)
- File validation (size, MIME, extension)

Run with:
```bash
cd apps/backend
DATABASE_URL="sqlite+aiosqlite:///./test.db" python -m pytest app/tests/test_rag_knowledge.py -v
```

## 15. Future enhancements (documented placeholders)

- **OCR** for scanned PDFs: `ENABLE_OCR` + `OCR_PROVIDER` settings exist
  (currently no-op). Add a Tesseract / AWS Textract / Google Vision adapter.
- **Per-tenant vector collections**: switch from shared collection to
  `{prefix}_{org_slug}` per tenant (modify `_get_collection_name()`).
- **Re-ranking model**: add a cross-encoder re-ranker (e.g. bge-reranker-base)
  between steps 5 and 6 of retrieval.
- **Confluence / Notion / Google Drive sources**: source types are registered;
  implement sync adapters.
- **Incremental re-indexing**: detect changed chunks (by content_sha256) and
  only re-embed those, not the whole document.

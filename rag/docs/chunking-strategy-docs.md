# RAG Chunking Strategy Documentation

## Overview

Chunking is the process of breaking down documents into smaller, semantically meaningful pieces that can be:
- Embedded efficiently
- Retrieved accurately
- Used as context for LLM responses

**Poor chunking = poor retrieval = poor AI responses.**

---

## Chunking Configuration

### Default Settings

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Chunk Size** | 512 tokens | Optimal for embeddings (ada-002) and LLM context |
| **Chunk Overlap** | 50 tokens (≈10%) | Maintains context continuity without redundancy |
| **Min Chunk Size** | 128 tokens | Avoids creating tiny, useless chunks |
| **Max Chunk Size** | 1024 tokens | Hard limit to prevent oversized chunks |

### Document Type Specific Settings

| Type | Chunk Size | Overlap | Notes |
|------|------------|---------|-------|
| **PDF** | 512 | 50 | Standard config, handles formatting artifacts |
| **DOCX** | 512 | 50 | Standard config, preserves structure |
| **HTML** | 384 | 38 | Smaller chunks due to noise from tags |
| **Markdown** | 512 | 50 | Well-structured, standard config |
| **Plain Text** | 512 | 50 | No heading detection, relies on paragraphs |

---

## Chunking Strategy Justification

### Why 512 tokens?

| Chunk Size | Pros | Cons |
|------------|------|------|
| 128 tokens | Very precise retrieval, low cost | May lose context, more chunks to manage |
| **512 tokens** | **Optimal balance: good context, efficient embeddings** | **Best for most use cases** |
| 1024 tokens | More context per chunk | Less precise retrieval, higher embedding cost |
| 2048+ tokens | Maximum context | Poor retrieval precision, expensive |

**512 tokens is optimal because:**
1. Fits well within embedding model optimal range (OpenAI ada-002 performs best at 512-1024 tokens)
2. Provides enough context for semantic understanding
3. Balances retrieval precision (smaller = more precise) with context completeness
4. Efficient for LLM context windows (5 chunks × 512 = 2560 tokens, leaving room for prompt + response)

### Why 50 token overlap?

| Overlap | Pros | Cons |
|---------|------|------|
| 0 tokens | Minimum storage, no redundancy | Lost context between chunks |
| **50 tokens** | **Maintains context continuity, minimal redundancy** | **Optimal trade-off** |
| 100+ tokens | Maximum context preservation | Wastes storage, more embeddings to compute |

**50 tokens (≈10%) is optimal because:**
1. Prevents important context from being lost at chunk boundaries
2. Ensures sentences/paragraphs aren't split awkwardly
3. Minimal storage overhead (~10% increase)
4. Improves retrieval recall without significant cost

### Why respect paragraphs and sentences?

1. **Semantic coherence**: Paragraphs and sentences are natural semantic units
2. **Better retrieval**: Chunks that respect boundaries retrieve more relevant context
3. **LLM comprehension**: LLMs understand complete thoughts better than fragments
4. **Citation quality**: Easier to cite complete paragraphs than partial sentences

### Why different config per document type?

1. **HTML**: Contains more noise (tags, scripts), so smaller chunks (384 tokens) improve precision
2. **PDF**: Often has formatting artifacts, needs careful cleaning
3. **Markdown**: Already well-structured, can use standard config
4. **Plain text**: No headings, relies on paragraphs/sentences

---

## Chunk Metadata

Each chunk preserves rich metadata for better retrieval and context:

| Field | Type | Description |
|-------|------|-------------|
| `documentId` | string | Reference to parent document |
| `documentTitle` | string | Human-readable document title |
| `documentType` | string | Source type (pdf, docx, html, md, text) |
| `chunkIndex` | number | Position in document (0-indexed) |
| `totalChunks` | number | Total chunks in document |
| `heading` | string? | Heading if chunk starts with one |
| `headingLevel` | number? | Heading level (1-6 for markdown) |
| `paragraphIndex` | number? | Paragraph position |
| `tokenCount` | number | Estimated token count |
| `hasCode` | boolean | Whether chunk contains code |
| `hasTable` | boolean | Whether chunk contains table |
| `hasList` | boolean | Whether chunk contains list |
| `language` | string | Detected language (default: 'en') |

---

## Chunking Pipeline

```
Document Content
    ↓
Pre-process (normalize, clean, remove artifacts)
    ↓
Split into Semantic Units (headings, paragraphs, sentences)
    ↓
Group Units into Chunks (respecting size limits)
    ↓
Add Overlap (50 tokens from previous chunk)
    ↓
Generate Metadata (heading, paragraph, code detection, etc.)
    ↓
Output: ChunkedDocument[]
```

---

## Database Schema

### Table: `ai.rag_chunks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Multi-tenant isolation |
| `document_id` | UUID | FK to rag_documents |
| `chunk_index` | INTEGER | Position in document |
| `content` | TEXT | Chunk text content |
| `embedding` | VECTOR(1536) | OpenAI ada-002 embedding |
| `metadata` | JSONB | Chunk metadata |
| `token_count` | INTEGER | Token count |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### Indexes

- `idx_rag_chunks_tenant` – Tenant isolation
- `idx_rag_chunks_document` – Document lookup
- `idx_rag_chunks_content_search` – Full-text search (GIN trigram)
- `idx_rag_chunks_embedding` – Vector similarity search (HNSW, pgvector)

---

## Testing

### Unit Tests

- ✅ Chunk creation with correct size
- ✅ Paragraph boundary respect
- ✅ Overlap between chunks
- ✅ Heading detection in markdown
- ✅ Code detection
- ✅ Metadata generation

### Integration Tests (e2e)

- ✅ Real document chunking end-to-end
- ✅ Database persistence
- ✅ Cleanup and teardown

---

## Performance Considerations

### Token Estimation

- Uses simple approximation: `tokens ≈ characters / 4`
- For production accuracy, integrate `tiktoken` library
- Trade-off: speed vs. accuracy

### Memory Efficiency

- Streams large documents to avoid loading entire content
- Processes chunks incrementally
- Batches database inserts

### Scalability

- Horizontal scaling via tenant isolation
- Parallel chunking of multiple documents
- Async processing with job queues (recommended for production)

---

## Next Steps

After chunking, proceed to:

1. **Embedding Pipeline** – Generate embeddings for all chunks
2. **Vector Store** – Store embeddings in pgvector
3. **Retrieval** – Implement similarity search
4. **Prompt Assembly** – Build context from retrieved chunks

---

## Files Generated

- `chunking.config.ts` – Configuration and types
- `chunking.service.ts` – Core chunking logic
- `rag-chunking-schema.sql` – Database schema
- `chunking.service.spec.ts` – Unit tests
- `chunking.e2e-spec.ts` – Integration tests

---

**Ready for Step 5: Embedding Pipeline Implementation**
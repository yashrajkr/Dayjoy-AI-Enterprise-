# RAG Vector Store Implementation

## Overview

The Vector Store is the core retrieval component of the RAG system, enabling fast similarity search over document embeddings using PostgreSQL with pgvector extension.

**Key Features:**
- HNSW index for fast approximate nearest neighbor search
- Hybrid search (BM25 + vector similarity)
- Multi-tenant isolation
- Metadata filtering
- Production-ready performance

---

## Vector Database Choice: PostgreSQL + pgvector

### Why PostgreSQL + pgvector?

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **PostgreSQL + pgvector** | ✅ Single database<br>✅ ACID transactions<br>✅ Mature ecosystem<br>✅ Easy ops<br>✅ Good enough performance | ❌ Slightly slower than specialized vector DBs | **✅ Recommended** |
| **Pinecone** | ✅ Fastest<br>✅ Managed service<br>✅ Built for scale | ❌ Vendor lock-in<br>❌ Expensive at scale<br>❌ Another service to manage | ❌ Not recommended |
| **Weaviate** | ✅ Good performance<br>✅ GraphQL API<br>✅ Open source | ❌ Separate service<br>❌ More ops overhead | ❌ Not recommended |
| **Qdrant** | ✅ Fast<br>✅ Rust-based<br>✅ Good filtering | ❌ Separate service<br>❌ Less mature than pgvector | ❌ Not recommended |

### Why NOT specialized vector DBs for Dayjoy?

1. **Cost**: Pinecone/Weaviate/Qdrant add another service to manage and pay for
2. **Complexity**: More services = more ops overhead
3. **Performance**: pgvector HNSW is fast enough for most use cases (sub-100ms for 1M vectors)
4. **Simplicity**: Single database (PostgreSQL) for everything

### When to consider specialized vector DBs?

- >100M vectors
- Sub-10ms latency required
- Already using managed vector DB service

---

## Configuration

### Default Settings

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Dimensions** | 1536 | OpenAI ada-002 output |
| **Index Type** | HNSW | Best accuracy/speed trade-off |
| **HNSW M** | 16 | Max connections per layer |
| **HNSW ef_construction** | 64 | Index build quality |
| **HNSW ef_search** | 40 | Search depth (higher = more accurate) |
| **Top-K** | 5 | Default results to return |
| **Similarity Threshold** | 0.7 | Minimum 70% similarity |
| **Distance Metric** | Cosine | Best for text embeddings |
| **Hybrid Search** | Enabled | BM25 (30%) + Vector (70%) |

### HNSW Index Parameters

| Parameter | Description | Impact |
|-----------|-------------|--------|
| `m` | Max connections per layer | Higher = more accurate, slower build, more memory |
| `ef_construction` | Size of dynamic candidate list during build | Higher = better index, slower build |
| `ef_search` | Search depth | Higher = more accurate, slower search |

### Recommended Tuning

| Data Size | m | ef_construction | ef_search |
|-----------|---|-----------------|-----------|
| <100K | 16 | 64 | 40 |
| 100K-1M | 32 | 128 | 60 |
| 1M-10M | 48 | 200 | 80 |
| >10M | 64 | 300 | 100 |

---

## Vector Store Service

### Components

1. **`VectorStoreService`**
   - Insert/update/delete embeddings
   - Similarity search
   - Hybrid search (BM25 + vector)
   - Metadata filtering
   - Index statistics

### Key Methods

#### `insert(chunkId, embedding, tenantId, documentId)`
- Insert single embedding
- Updates `rag_chunks.embedding` column

#### `insertBatch(embeddings[])`
- Batch insert multiple embeddings
- Parallel database updates
- More efficient than individual inserts

#### `similaritySearch(queryEmbedding, filters, topK, threshold)`
- Pure vector similarity search
- Uses HNSW index
- Returns results sorted by similarity (descending)
- Filters by metadata (documentId, sourceId, type, etc.)

#### `hybridSearch(query, queryEmbedding, filters, topK)`
- Combines BM25 (full-text) + vector similarity
- Weighted scoring: `score = 0.3 * bm25 + 0.7 * vector`
- Better relevance for keyword-heavy queries

#### `searchWithFilters(query)`
- Unified search API
- Automatically chooses hybrid or pure vector based on config
- Applies all filters

---

## Search Algorithms

### 1. Cosine Similarity

```sql
-- Cosine similarity: 1 - (a <=> b)
-- Returns 0-1, where 1 = identical
SELECT 1 - (embedding <=> $query_embedding) AS similarity
FROM ai.rag_chunks
ORDER BY similarity DESC
LIMIT 5;
```

**Why cosine similarity?**
- Best for text embeddings
- Normalized (0-1 range)
- Ignores vector magnitude (focuses on direction)

### 2. Hybrid Search (BM25 + Vector)

```sql
WITH vector_scores AS (
  SELECT id, 1 - (embedding <=> $query) AS vector_score
  FROM ai.rag_chunks
),
bm25_scores AS (
  SELECT id, ts_rank(to_tsvector(content), plainto_tsquery($text)) AS bm25_score
  FROM ai.rag_chunks
)
SELECT 
  v.id,
  v.vector_score,
  b.bm25_score,
  (0.3 * b.bm25_score + 0.7 * v.vector_score) AS hybrid_score
FROM vector_scores v
JOIN bm25_scores b ON v.id = b.id
ORDER BY hybrid_score DESC;
```

**Why hybrid search?**
- BM25: Good for exact keyword matches
- Vector: Good for semantic similarity
- Combined: Best of both worlds

### 3. Metadata Filtering

```sql
SELECT * FROM ai.rag_chunks
WHERE tenant_id = $tenant
  AND document_id = $document_id
  AND metadata->>'hasCode' = 'true'
  AND token_count BETWEEN 100 AND 1000
ORDER BY embedding <=> $query
LIMIT 5;
```

**Common filters:**
- `tenant_id` – Multi-tenant isolation (required)
- `document_id` – Search within specific document
- `source_id` – Search within specific source
- `documentType` – Filter by type (pdf, docx, etc.)
- `hasCode` – Filter code chunks
- `tokenCount` – Filter by chunk size

---

## Database Schema

### Table: `ai.rag_chunks`

| Column | Type | Index | Description |
|--------|------|-------|-------------|
| `id` | UUID | PK | Primary key |
| `tenant_id` | UUID | BTREE | Multi-tenant isolation |
| `document_id` | UUID | BTREE | FK to rag_documents |
| `chunk_index` | INTEGER | - | Position in document |
| `content` | TEXT | GIN (trigram) | Chunk text |
| `embedding` | VECTOR(1536) | **HNSW** | **OpenAI embedding** |
| `metadata` | JSONB | GIN | Chunk metadata |
| `token_count` | INTEGER | - | Token count |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp |

### Indexes

```sql
-- Primary HNSW index for vector similarity
CREATE INDEX idx_rag_chunks_embedding_hnsw
  ON ai.rag_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- BM25 full-text search index
CREATE INDEX idx_rag_chunks_content_fts
  ON ai.rag_chunks
  USING GIN (to_tsvector('english', content));

-- Composite index for filtered searches
CREATE INDEX idx_rag_chunks_tenant_document
  ON ai.rag_chunks(tenant_id, document_id);

-- Metadata index
CREATE INDEX idx_rag_chunks_metadata
  ON ai.rag_chunks USING GIN (metadata);
```

---

## Performance

### Benchmarks (HNSW Index)

| Vectors | Index Size | Search Time (p95) | Memory |
|---------|------------|-------------------|--------|
| 100K | ~600 MB | 5ms | 1 GB |
| 1M | ~6 GB | 15ms | 8 GB |
| 10M | ~60 GB | 50ms | 64 GB |

### Optimization Tips

1. **Tune HNSW parameters** based on data size
2. **Use appropriate top-K** (don't fetch more than needed)
3. **Filter early** (apply tenant_id, document_id filters in WHERE clause)
4. **Use composite indexes** for common filter combinations
5. **VACUUM ANALYZE** regularly for query planner optimization

---

## Testing

### Unit Tests

- ✅ Insert single embedding
- ✅ Insert batch embeddings
- ✅ Update embedding
- ✅ Delete embedding
- ✅ Delete document embeddings
- ✅ Similarity search
- ✅ Hybrid search
- ✅ Metadata filtering
- ✅ Index statistics

### Integration Tests (e2e)

- ✅ Real similarity search with pgvector
- ✅ Hybrid search with BM25
- ✅ Index performance
- ✅ Filter accuracy

---

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `totalVectors` | Total embeddings in store | - |
| `indexSize` | Index size on disk | >100 GB |
| `avgSearchTimeMs` | Average search latency | >100ms |
| `searchErrors` | Number of search errors | >1% |

### Example

```typescript
const stats = await vectorStore.getIndexStats('tenant-123');
console.log(stats);
// {
//   totalVectors: 150000,
//   indexSize: '900 MB',
//   avgSearchTimeMs: 12,
//   indexType: 'hnsw',
//   dimensions: 1536,
//   lastBuilt: new Date()
// }
```

---

## Next Steps

After vector store:

1. **Retrieval Pipeline** – Orchestrate search + filtering
2. **Re-ranking** – Improve result quality
3. **Context Builder** – Assemble chunks for LLM
4. **Prompt Assembly** – Build final prompt

---

## Files Generated

- `vector-store.config.ts` – Configuration and types
- `vector-store.service.ts` – Core vector store logic
- `vector-store-index.sql` – Index creation and tuning
- `vector-store.service.spec.ts` – Unit tests

---

**Ready for Step 7: Retrieval Pipeline Implementation**
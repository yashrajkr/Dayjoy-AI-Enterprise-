# RAG Embedding Pipeline Documentation

## Overview

The Embedding Pipeline transforms text chunks into dense vector representations (embeddings) that enable semantic search and retrieval. This is the core of the RAG system.

**Pipeline Flow:**
```
Document → Chunking → Embedding Generation → Vector Storage → Retrieval
```

---

## Configuration

### Default Settings (OpenAI ada-002)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Model** | `text-embedding-ada-002` | Best performance/cost ratio |
| **Dimensions** | 1536 | ada-002 output size |
| **Batch Size** | 100 | Balance between speed and API limits |
| **Max Retries** | 3 | Handle transient API failures |
| **Timeout** | 30s | Prevent hanging requests |
| **Rate Limit** | 100 RPM | Conservative to avoid hitting 3000 RPM limit |
| **Cache TTL** | 7 days | Balance freshness vs. cost savings |

### Supported Providers

1. **OpenAI** (default)
   - Model: `text-embedding-ada-002`
   - Cost: $0.0001 / 1K tokens
   - Limits: 3000 requests/min, 1M tokens/min

2. **Azure OpenAI**
   - Requires: `AZURE_OPENAI_API_BASE`, `AZURE_OPENAI_API_KEY`
   - Same model, different endpoint

3. **Local Models** (Ollama, vLLM)
   - Models: `nomic-embed-text`, `mxbai-embed-large`, etc.
   - Cost: Free (self-hosted)
   - Performance: Varies by model

---

## Embedding Pipeline Service

### Components

1. **`EmbeddingsService`**
   - Generates embeddings via API
   - Manages caching
   - Tracks statistics
   - Handles batching

2. **`EmbeddingPipelineService`**
   - Orchestrates complete pipeline
   - Processes documents end-to-end
   - Manages database updates
   - Handles errors and retries

### Key Methods

#### `generateEmbedding(text, chunkId, tenantId)`
- Generates single embedding
- Checks cache first
- Calls embedding API
- Updates statistics

#### `generateBatchEmbeddings(chunks[])`
- Processes multiple chunks
- Respects batch size limits
- Parallel API calls
- Returns batch statistics

#### `processDocument(documentId, tenantId)`
- Complete pipeline:
  1. Load document
  2. Chunk document
  3. Save chunks
  4. Generate embeddings
  5. Store embeddings
  6. Update document status

#### `processBatchDocuments(documentIds[], tenantId)`
- Processes multiple documents
- Returns aggregate results
- Handles failures gracefully

---

## Caching Strategy

### Why Cache?

- **Cost savings**: Avoid re-generating embeddings for same text
- **Speed**: Cache hits are instant (~1ms vs ~500ms API call)
- **Rate limits**: Reduce API calls

### Cache Implementation

- **Key**: SHA-256 hash of text
- **Value**: Embedding vector + metadata
- **TTL**: 7 days (configurable)
- **Storage**: In-memory (Map)

### Cache Invalidation

- Clear cache when:
  - Model changes
  - Document is updated
  - Manual cache clear requested

### Example

```typescript
// First call (cache miss)
const result1 = await embeddingsService.generateEmbedding(
  'What is Dayjoy?',
  'chunk-123',
  'tenant-123',
);
// result1.cached = false

// Second call with same text (cache hit)
const result2 = await embeddingsService.generateEmbedding(
  'What is Dayjoy?',
  'chunk-456',
  'tenant-123',
);
// result2.cached = true
// result2.embedding === result1.embedding
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
| `content` | TEXT | Chunk text |
| `embedding` | VECTOR(1536) | **OpenAI ada-002 embedding** |
| `metadata` | JSONB | Chunk metadata |
| `token_count` | INTEGER | Token count |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### Indexes

```sql
-- Standard indexes
CREATE INDEX idx_rag_chunks_tenant ON ai.rag_chunks(tenant_id);
CREATE INDEX idx_rag_chunks_document ON ai.rag_chunks(document_id);
CREATE INDEX idx_rag_chunks_content_search ON ai.rag_chunks USING GIN (content gin_trgm_ops);

-- Vector similarity index (HNSW)
CREATE INDEX idx_rag_chunks_embedding 
  ON ai.rag_chunks USING hnsw (embedding vector_cosine_ops);
```

---

## Performance Optimization

### Batch Processing

- **Batch size**: 100 chunks per API call
- **Parallel calls**: Process multiple batches concurrently
- **Throughput**: ~1000 embeddings/minute

### Cost Optimization

| Strategy | Savings |
|----------|---------|
| **Caching** | 20-40% (repeated queries) |
| **Batch processing** | 10-20% (fewer API calls) |
| **Chunk optimization** | 10-15% (optimal chunk size) |

### Latency Optimization

- **Async processing**: Don't block on API calls
- **Caching**: Instant for repeated text
- **Batching**: Fewer round trips
- **Parallel processing**: Multiple documents at once

---

## Monitoring & Metrics

### Statistics Tracked

| Metric | Description |
|--------|-------------|
| `totalEmbeddings` | Total embeddings generated |
| `totalTokens` | Total tokens processed |
| `totalCost` | Total cost in USD |
| `cacheHits` | Number of cache hits |
| `cacheMisses` | Number of cache misses |
| `apiCalls` | Number of API calls |
| `averageLatencyMs` | Average latency per embedding |
| `errors` | Number of errors |

### Example

```typescript
const stats = embeddingsService.getStats();
console.log(stats);
// {
//   totalEmbeddings: 1500,
//   totalTokens: 750000,
//   totalCost: 0.075,  // $0.075 for 750K tokens
//   cacheHits: 300,
//   cacheMisses: 1200,
//   apiCalls: 12,
//   averageLatencyMs: 450,
//   errors: 2
// }
```

---

## Error Handling

### Retry Strategy

- **Max retries**: 3
- **Delay**: 1 second between retries
- **Backoff**: Exponential (1s, 2s, 4s)

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `RateLimitError` | Too many API calls | Implement backoff, reduce batch size |
| `TimeoutError` | API call too slow | Increase timeout, reduce batch size |
| `InvalidRequestError` | Bad input | Validate text before embedding |
| `AuthenticationError` | Invalid API key | Check environment variables |

### Graceful Degradation

- On persistent failures:
  - Mark document as `failed`
  - Log error details
  - Continue processing other documents
  - Alert on error threshold

---

## Testing

### Unit Tests

- ✅ Single embedding generation
- ✅ Batch embedding generation
- ✅ Caching behavior
- ✅ Statistics tracking
- ✅ Error handling
- ✅ Token estimation

### Integration Tests (e2e)

- ✅ Complete document pipeline
- ✅ Database persistence
- ✅ Error scenarios
- ✅ Batch processing

---

## Cost Estimation

### OpenAI ada-002 Pricing

- **$0.0001 per 1K tokens**

### Example Calculation

| Document | Tokens | Cost |
|----------|--------|------|
| 100-page PDF | ~25,000 | $0.0025 |
| 1000-page PDF | ~250,000 | $0.025 |
| 10,000 pages | ~2.5M | $0.25 |
| 100,000 pages | ~25M | $2.50 |

### Cost Reduction Tips

1. **Enable caching**: Re-embed only changed content
2. **Optimal chunking**: Avoid redundant chunks
3. **Batch processing**: Reduce API overhead
4. **Local models**: Free for self-hosted

---

## Next Steps

After embedding generation:

1. **Vector Store** – Optimize similarity search
2. **Retrieval** – Implement hybrid search
3. **Ranking** – Re-rank retrieved chunks
4. **Prompt Assembly** – Build context for LLM

---

## Files Generated

- `embeddings.config.ts` – Configuration and types
- `embeddings.service.ts` – Core embedding logic
- `embeddings-pipeline.service.ts` – Pipeline orchestration
- `embeddings.service.spec.ts` – Unit tests
- `embeddings-pipeline.service.spec.ts` – Integration tests

---

**Ready for Step 6: Vector Store Implementation**
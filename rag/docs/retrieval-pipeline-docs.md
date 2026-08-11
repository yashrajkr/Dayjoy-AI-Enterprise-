# RAG Retrieval Pipeline Documentation

## Overview

The Retrieval Pipeline orchestrates the complete retrieval process from user query to LLM-ready context.

**Pipeline Flow:**
```
User Query
    ↓
Query Embedding
    ↓
Vector Similarity Search
    ↓
Metadata Filtering
    ↓
Re-ranking (Optional)
    ↓
Top-K Selection
    ↓
Context Building
    ↓
LLM-Ready Context
```

---

## Configuration

### Default Settings

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Initial Top-K** | 10 | Retrieve more initially for better selection |
| **Final Top-K** | 5 | Return top 5 after re-ranking |
| **Similarity Threshold** | 0.7 | Minimum 70% similarity |
| **Re-ranking** | Enabled | Improves relevance |
| **Max Context Tokens** | 4000 | Leave room for prompt + response |
| **Max Chunks** | 10 | Prevent context overload |
| **Cache TTL** | 1 hour | Balance freshness vs. speed |

---

## Retrieval Service

### Components

1. **`RetrievalService`**
   - Query embedding generation
   - Vector similarity search
   - Re-ranking
   - Context building
   - Caching

2. **`RetrievalPipelineService`**
   - Complete pipeline orchestration
   - AI conversation integration
   - Conversation history context
   - Batch retrieval

### Key Methods

#### `retrieve(query)`
- Complete retrieval pipeline
- Returns ranked chunks with scores

#### `buildContext(query, results)`
- Builds LLM-ready context
- Respects token limits
- Formats with source metadata

#### `retrieveWithContext(query)`
- Retrieve + build context in one call
- Main entry point for AI agents

#### `retrieveForAI(query, tenantId, agentId, topK)`
- Optimized for AI agent usage
- Filters by agent (optional)
- Default re-ranking enabled

---

## Re-ranking

### Why Re-rank?

Vector similarity alone doesn't always capture relevance:
- **Query**: "How do I reset my password?"
- **High similarity chunk**: "Password reset is available in settings" (generic)
- **More relevant chunk**: "To reset password: 1. Go to settings 2. Click reset" (step-by-step)

### Re-ranking Strategy

**Default (Simple):**
```typescript
rerankScore = 0.3 * keyword_match + 0.7 * vector_similarity
```

**Production (Cross-Encoder):**
```python
# Using BGE reranker or similar
from sentence_transformers import CrossEncoder

model = CrossEncoder('bge-reranker-large')
pairs = [(query, chunk.content) for chunk in chunks]
scores = model.predict(pairs)
```

### Re-ranking Models

| Model | Speed | Accuracy | Cost |
|-------|-------|----------|------|
| **Keyword + Similarity** | Fast | Good | Free |
| **BGE Reranker** | Medium | Excellent | Free |
| **Cross-Encoder** | Slow | Best | Free |

**Recommendation:** Start with keyword + similarity, upgrade to BGE reranker for production.

---

## Context Building

### Strategy

1. **Sort chunks** by final score (descending)
2. **Select chunks** until token limit reached
3. **Format** with source metadata
4. **Return** structured context

### Example

```typescript
// Input: 10 chunks
const chunks = [
  { content: '...', similarity: 0.95, metadata: {...} },
  { content: '...', similarity: 0.92, metadata: {...} },
  // ...
];

// Output: Context
const context = {
  query: 'What is the return policy?',
  chunks: [
    'Return policy content 1',
    'Return policy content 2',
    // ...
  ],
  metadata: [
    { source: 'policy.pdf', documentTitle: 'Return Policy', chunkIndex: 0 },
    { source: 'policy.pdf', documentTitle: 'Return Policy', chunkIndex: 1 },
  ],
  totalTokens: 850,
  formattedContext: `---\nSource: Return Policy (Chunk 1)\n---\nReturn policy content 1\n\n---\nSource: Return Policy (Chunk 2)\n---\nReturn policy content 2`,
};
```

### Token Limits

| Component | Tokens | Purpose |
|-----------|--------|---------|
| **Context** | 4000 | Retrieved knowledge |
| **System Prompt** | 500 | Instructions, persona |
| **User Query** | 200 | Actual question |
| **Response** | 1000 | LLM answer |
| **Total** | 5700 | Within GPT-4 8K limit |

---

## Caching

### Cache Strategy

- **Key**: SHA-256 hash of (query + filters + topK)
- **Value**: Ranked chunks + scores
- **TTL**: 1 hour (configurable)
- **Storage**: In-memory Map

### Cache Invalidation

Clear cache when:
- New documents ingested
- Documents updated/deleted
- Embedding model changed
- Manual cache clear requested

### Example

```typescript
// First query (cache miss)
const result1 = await retrievalService.retrieve({
  query: 'What is Dayjoy?',
  tenantId: 'tenant-123',
});
// result1.cached = false

// Same query within 1 hour (cache hit)
const result2 = await retrievalService.retrieve({
  query: 'What is Dayjoy?',
  tenantId: 'tenant-123',
});
// result2.cached = true
// result2.chunks === result1.chunks
```

---

## Conversation History Integration

### With Context

```typescript
const history = [
  'User: I need help with my order',
  'Assistant: Sure, what\'s your order number?',
];

const result = await retrievalPipeline.retrieveWithContext(
  'My order is #12345',
  'tenant-123',
  history,
);

// Enhanced query: "I need help with my order Sure, what's your order number? My order is #12345"
// Better retrieval due to full context
```

### Without Context

```typescript
const result = await retrievalPipeline.retrieveForAI(
  'My order is #12345',
  'tenant-123',
);

// Query: "My order is #12345"
// May miss order-related context
```

**Recommendation:** Always include conversation history for better retrieval.

---

## Performance

### Latency Breakdown

| Step | Latency (p95) |
|------|---------------|
| Query embedding | 200ms |
| Vector search | 20ms |
| Re-ranking | 50ms |
| Context building | 5ms |
| **Total** | **~275ms** |

### Optimization Tips

1. **Cache query embeddings** (repeated queries)
2. **Use appropriate top-K** (don't retrieve more than needed)
3. **Enable re-ranking** (improves relevance, small latency cost)
4. **Batch retrieval** (for multiple queries)

---

## Testing

### Unit Tests

- ✅ Query retrieval
- ✅ Caching behavior
- ✅ Re-ranking
- ✅ Context building
- ✅ Token limit enforcement
- ✅ Metadata filtering
- ✅ Statistics tracking

### Integration Tests (e2e)

- ✅ Complete pipeline
- ✅ Conversation history integration
- ✅ Error handling
- ✅ Batch retrieval

---

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `totalQueries` | Total retrieval queries | - |
| `averageLatencyMs` | Average retrieval latency | >500ms |
| `averageResultsCount` | Average chunks retrieved | <3 or >10 |
| `cacheHits` | Cache hit count | - |
| `cacheMisses` | Cache miss count | - |
| `rerankEnabled` | Re-ranking usage count | - |

### Example

```typescript
const stats = retrievalService.getStats();
console.log(stats);
// {
//   totalQueries: 1500,
//   averageLatencyMs: 275,
//   averageResultsCount: 5.2,
//   cacheHits: 300,
//   cacheMisses: 1200,
//   rerankEnabled: 1400
// }
```

---

## Usage Examples

### Basic Retrieval

```typescript
const result = await retrievalPipeline.execute({
  query: 'What is the return policy?',
  tenantId: 'tenant-123',
  topK: 5,
});

console.log(result.context.formattedContext);
// ---\nSource: Return Policy (Chunk 1)\n---\nReturns accepted within 30 days...
```

### AI Agent Retrieval

```typescript
const result = await retrievalPipeline.retrieveForAI(
  'How do I reset my password?',
  'tenant-123',
  'support-agent',  // Optional: filter by agent
  5,
);

// Use result.context.formattedContext in LLM prompt
```

### With Conversation History

```typescript
const history = [
  'User: I need help with my order',
  'Assistant: I\'d be happy to help. What\'s your order number?',
];

const result = await retrievalPipeline.retrieveWithContext(
  'Order #12345 hasn\'t arrived',
  'tenant-123',
  history,
);

// Enhanced retrieval with full context
```

---

## Next Steps

After retrieval pipeline:

1. **Prompt Assembly** – Build final LLM prompt with context
2. **LLM Integration** – Connect to LLM gateway
3. **Response Generation** – Generate AI response
4. **Citation Tracking** – Track which chunks were used

---

## Files Generated

- `retrieval.config.ts` – Configuration and types
- `retrieval.service.ts` – Core retrieval logic
- `retrieval-pipeline.service.ts` – Pipeline orchestration
- `retrieval.service.spec.ts` – Unit tests

---

**Ready for Step 8: Prompt Assembly Implementation**
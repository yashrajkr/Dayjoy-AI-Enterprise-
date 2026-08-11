# Tool: `search_knowledge`

> **Implementation:** `vapi/tools/vapi-search-knowledge-tool.ts`
> **Spec version:** 1.0
> **Latency budget (p95):** 1500 ms

## Purpose

Search the Dayjoy knowledge base for product information, company policies, FAQs, standard operating procedures (SOPs), and compensation plan details. This is the **RAG (Retrieval-Augmented Generation) entry point** — the single most important tool in the platform because it grounds every product, policy, and business answer in retrieved context, preventing hallucination.

The tool delegates to the backend `KnowledgeService.query()` method, which runs the full RAG pipeline: embed the query → vector-search the knowledge chunks → re-rank the top results → synthesise a grounded answer with citations.

## When to Use

The LLM should call `search_knowledge` **before** answering any of the following question types:

- Customer asks about a product (features, ingredients, usage, side effects, pricing context).
- Customer asks about a policy (returns, refunds, shipping, privacy, warranty).
- Customer asks about the compensation plan (rank qualifications, bonus structure, payout schedule).
- Customer asks about the business opportunity (how to join, starter kit, sponsor process).
- Customer asks about a FAQ ("Where can I buy Dayjoy products?", "Do you ship internationally?").
- Customer asks about an SOP (how to file a return, how to track an order, how to update bank details).

The system prompt enforces this — the RAG integration prompt explicitly says: *"ALWAYS call the search_knowledge tool before answering product/business questions."*

## When NOT to Use

- The customer is asking a purely transactional question that doesn't need knowledge ("What's my order status?") — use `customer_lookup` instead.
- The customer is asking about a specific product's live price or stock — use `search_products` (catalogue is more authoritative for live data).
- The customer is asking for medical, legal, or financial advice — escalate to `human_transfer`; do not search the knowledge base.
- The customer is asking about a competitor — decline and offer to transfer.
- The query is a greeting or chitchat ("Hi", "How are you?") — no search needed.

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Concise search query (2–6 words works best). Examples: `"return policy"`, `"starter kit price"`, `"BV calculation"`. Avoid full sentences — they dilute the retrieval signal. |
| `topK` | integer | No | Number of chunks to retrieve (default: 3, max: 10). Higher values increase recall but slow down the synthesis. |

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Concise search query (2-6 words works best). Examples: \"return policy\", \"starter kit price\", \"BV calculation\"."
    },
    "topK": {
      "type": "integer",
      "description": "Number of chunks to retrieve (default: 3).",
      "default": 3
    }
  },
  "required": ["query"]
}
```

## Response

### Success (with citations)

```json
{
  "success": true,
  "data": {
    "answer": "According to our return policy, you can return items within 30 days of purchase in their original packaging. Refunds are processed within 5-7 business days after the return is received.",
    "citations": [
      {
        "chunkId": "chunk_abc123",
        "documentId": "doc_returns_policy",
        "documentTitle": "Returns & Refunds Policy",
        "content": "Customers may return any unopened product within 30 days of purchase for a full refund...",
        "score": 0.92
      },
      {
        "chunkId": "chunk_def456",
        "documentId": "doc_refund_sop",
        "documentTitle": "Refund Processing SOP",
        "content": "Refunds are processed within 5-7 business days after the returned item is received at the warehouse...",
        "score": 0.87
      }
    ],
    "queryId": "qry_xyz789",
    "latencyMs": 1240
  },
  "speak": "According to our return policy, you can return items within 30 days of purchase in their original packaging. Refunds are processed within 5-7 business days after the return is received."
}
```

### Success (no citations — escalate via `speak`)

```json
{
  "success": true,
  "data": {
    "answer": "No relevant information found.",
    "citations": [],
    "queryId": "qry_xyz790",
    "latencyMs": 980
  },
  "speak": "I don't have that information in my knowledge base right now. Let me transfer you to a human agent who can help."
}
```

### Failure (RAG pipeline down)

```json
{
  "success": false,
  "error": "KnowledgeService.query() threw: Connection refused to vector DB",
  "speak": "I'm having trouble searching our knowledge base right now. Could I transfer you to a human agent?"
}
```

### Failure (missing query)

```json
{
  "success": false,
  "error": "Query is required",
  "speak": "I'm sorry, I didn't catch what you're looking for. Could you repeat that?"
}
```

## Error Handling

| Condition | Behaviour |
|---|---|
| `query` is empty or whitespace | Return `success: false` + `speak` asking the customer to repeat. |
| `context.tenantId` is missing | Return `success: false` + `error` (no `speak` — this is a configuration error, not a customer-facing issue). |
| `KnowledgeService.query()` throws | Return `success: false` + `speak` apologising + offering to transfer. |
| No citations returned | Return `success: true` with an empty `citations` array + a `speak` field that offers to transfer. |
| Synthesised answer matches `/no relevant information/i` | Treat as escalation: set `speak` to the transfer offer. |

## Integration

The tool calls `KnowledgeService.query()` (`backend/knowledge/knowledge.service.ts`), which runs the full RAG pipeline:

```
search_knowledge(query)
      │
      ▼
KnowledgeService.query()
      │
      ├─▶ embedQuery()           → OpenAI text-embedding-3-small
      │
      ├─▶ vectorSearch()         → pgvector cosine similarity top-K
      │
      ├─▶ reRank()               → Cohere rerank-english-v3 (top-K → top-3)
      │
      ├─▶ buildPrompt()          → assemble system + retrieved chunks + query
      │
      ├─▶ synthesise()           → GPT-4o-mini with grounded-answer prompt
      │
      └─▶ persistQuery()         → save RagQuery row + RagFeedback (initial)

Returns: { answer, citations, queryId, latencyMs }
```

The `queryId` is persisted in the `rag_queries` table and is used by the feedback loop (`docs/ai/15_AI_LEARNING_FEEDBACK.md`) — when a customer gives a thumbs-down on a knowledge answer, the feedback is linked to the `queryId` so the AI ops team can debug the retrieval.

## Latency + Cost

- **Latency budget (p95):** 1500 ms
  - Embedding: ~100 ms
  - Vector search: ~150 ms
  - Re-ranking: ~250 ms
  - Synthesis: ~800 ms (LLM call)
  - Persistence: ~100 ms
- **Cost per call (approx):**
  - Embedding: ~$0.0001 (OpenAI text-embedding-3-small)
  - Re-ranking: ~$0.0002 (Cohere rerank)
  - Synthesis: ~$0.001 (GPT-4o-mini, ~500 tokens in + ~150 out)
  - Total: ~$0.0013 per call (~₹0.11)

## Examples

### Example 1 — Successful knowledge retrieval

**Customer:** "What's your return policy?"

**LLM call:** `search_knowledge({ query: "return policy" })`

**Result:**
```json
{
  "success": true,
  "data": {
    "answer": "According to our return policy, you can return items within 30 days of purchase in their original packaging. Refunds are processed within 5-7 business days.",
    "citations": [{ "chunkId": "...", "documentTitle": "Returns & Refunds Policy", "score": 0.92 }],
    "queryId": "qry_abc"
  },
  "speak": "According to our return policy, you can return items within 30 days of purchase in their original packaging. Refunds are processed within 5-7 business days."
}
```

**Sarah says:** "According to our return policy, you can return items within 30 days of purchase in their original packaging. Refunds are processed within 5-7 business days. Would you like me to help you start a return?"

### Example 2 — No relevant context (escalation)

**Customer:** "What's the BV on the new Omega-3 product?"

**LLM call:** `search_knowledge({ query: "Omega-3 BV" })`

**Result:**
```json
{
  "success": true,
  "data": {
    "answer": "No relevant information found.",
    "citations": [],
    "queryId": "qry_def"
  },
  "speak": "I don't have that information in my knowledge base right now. Let me transfer you to a human agent who can help."
}
```

**Sarah says:** "I don't see that specific product in my system right now. Let me connect you with someone who can provide that information. Would you like me to transfer you?"

### Example 3 — RAG pipeline failure

**Customer:** "How do I calculate my team's BV?"

**LLM call:** `search_knowledge({ query: "BV calculation team" })`

**Result:**
```json
{
  "success": false,
  "error": "Connection refused to vector DB",
  "speak": "I'm having trouble searching our knowledge base right now. Could I transfer you to a human agent?"
}
```

**Sarah says:** "I'm having trouble searching our knowledge base right now. Could I transfer you to a human agent?"

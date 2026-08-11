# RAG System — Chunking Strategy

> Deep dive into how the Dayjoy RAG pipeline splits documents into
> chunks, why the defaults are what they are, and when to deviate.

This document *extends* the existing
[`chunking-strategy-docs.md`](./chunking-strategy-docs.md) (which
covers the original 512-token configuration). The defaults have since
been revised to **1000 tokens / 200 overlap** — this guide explains
the new rationale and adds hierarchical vs. flat chunking, per-content
recipes, and tuning guidance.

---

## Table of Contents

1. [Why Chunk at All?](#1-why-chunk-at-all)
2. [The Default: 1000 Tokens / 200 Overlap](#2-the-default-1000-tokens--200-overlap)
3. [Hierarchical vs. Flat Chunking](#3-hierarchical-vs-flat-chunking)
4. [When to Use Each Strategy](#4-when-to-use-each-strategy)
5. [Tuning Chunk Size for Your Content](#5-tuning-chunk-size-for-your-content)
6. [Chunk Metadata](#6-chunk-metadata)
7. [Token Estimation](#7-token-estimation)
8. [Database Schema & Indexes](#8-database-schema--indexes)
9. [Common Failure Modes](#9-common-failure-modes)

---

## 1. Why Chunk at All?

Chunking is the process of breaking down documents into smaller,
semantically meaningful pieces that can be:

- **Embedded efficiently** — embedding models have an optimal input
  length (typically 512–8192 tokens). Beyond that, embedding quality
  degrades and cost grows.
- **Retrieved accurately** — vector similarity search returns the
  *K most similar chunks*. If chunks are too large, the similarity
  signal is diluted across many topics. If they're too small, the
  signal is too narrow to answer the question.
- **Used as LLM context** — the LLM needs enough context to answer
  but not so much that it gets distracted (or that the prompt exceeds
  the context window).

**Poor chunking = poor retrieval = poor AI responses.** This is the
single most impactful tunable in the RAG pipeline.

---

## 2. The Default: 1000 Tokens / 200 Overlap

| Parameter | Value | Rationale |
|---|---|---|
| **Chunk size** | 1000 tokens | Balances embedding quality, retrieval precision, and LLM context budget. |
| **Chunk overlap** | 200 tokens (20%) | Maintains context continuity across chunk boundaries without excessive redundancy. |
| **Min chunk size** | 128 tokens | Chunks smaller than this are merged with the previous chunk to avoid tiny fragments. |
| **Max chunk size** | 2048 tokens | Hard limit — chunks larger than this are force-split even if a semantic boundary hasn't been reached. |

### 2.1 Why 1000 tokens (not 512, not 2048)?

| Chunk size | Pros | Cons |
|---|---|---|
| **256 tokens** | Maximum retrieval precision; each chunk is highly focused. | Too little context per chunk — the LLM can't answer from a single chunk. Requires retrieving more chunks (higher cost). |
| **512 tokens** | Good embedding quality (within `text-embedding-3-small`'s sweet spot). | Borderline for context — many real-world answers span 600–800 tokens of source material. |
| **1000 tokens** ✅ | Sufficient context for most answers; efficient embeddings; good retrieval precision. | Slightly above the embedding model's optimal range, but quality degradation is negligible. |
| **2048 tokens** | Maximum context per chunk; fewer chunks to manage. | Retrieval precision drops (similarity signal diluted); prompt budget consumed faster. |
| **4096+ tokens** | One chunk per section/document. | Vector similarity becomes meaningless; you're essentially doing keyword search. |

**The 1000-token default** is the result of empirical tuning against
the Dayjoy product catalogue + FAQ corpus. It produces:

- ~5 chunks per 5 KB of source text.
- ~3 retrieved chunks sufficient to answer most product/FAQ questions.
- ~3000 tokens of context per query (3 chunks × 1000 tokens), well
  within the LLM context budget.

### 2.2 Why 200-token overlap (not 0, not 500)?

| Overlap | Pros | Cons |
|---|---|---|
| **0 tokens** | Minimum storage; no redundant embeddings. | Sentences/paragraphs split at the boundary are lost — retrieval can find neither half. |
| **50 tokens** | Tiny overlap; catches most sentence boundaries. | Misses longer paragraphs that span the boundary. |
| **200 tokens** ✅ | Catches paragraph boundaries; minimal redundancy (~20% storage overhead). | Some chunks repeat content; embedding cost ~20% higher. |
| **500 tokens** | Maximum context preservation. | 50% storage overhead; chunks become highly redundant, which *hurts* retrieval precision. |

**200 tokens (20% of chunk size)** is the sweet spot found across
multiple RAG benchmarks (Anthropic's, LlamaIndex's, LangChain's
defaults all converge on 10–25% overlap).

### 2.3 Why respect paragraph + sentence boundaries?

Even with overlap, splitting mid-sentence produces chunks that are
hard for the LLM to interpret. The chunker:

1. Walks the document looking for paragraph breaks (`\n\n`).
2. Groups paragraphs into chunks up to the target size.
3. If a single paragraph exceeds the chunk size, falls back to
   sentence boundaries (`.`, `!`, `?`).
4. If a single sentence exceeds the chunk size, force-splits at the
   token level (rare — only in pathological content like legal
   run-on sentences).

This means the 1000-token target is a *soft* limit — actual chunk
sizes vary from ~500 to ~1500 tokens depending on the natural
paragraph structure of the source.

---

## 3. Hierarchical vs. Flat Chunking

The default chunker is **flat**: every chunk is independent, and the
only link between chunks is `documentId` + `chunkIndex`. This is
simple, fast, and works well for most content.

**Hierarchical chunking** (a.k.a. "small-to-big" or "parent-child"
retrieval) is an alternative pattern:

### 3.1 How hierarchical chunking works

1. **Parent chunks** — large chunks (e.g. 2000 tokens) that capture
   broad context.
2. **Child chunks** — small chunks (e.g. 250 tokens) that are
   embedded and retrieved.
3. At retrieval time, the *child* chunk is matched, but the *parent*
   chunk is returned to the LLM.

```
Document
  ├── Parent chunk 1 (2000 tokens)
  │     ├── Child 1a (250 tokens)  ← embedded
  │     ├── Child 1b (250 tokens)  ← embedded
  │     ├── Child 1c (250 tokens)  ← embedded
  │     └── Child 1d (250 tokens)  ← embedded
  ├── Parent chunk 2 (2000 tokens)
  │     ├── Child 2a (250 tokens)  ← embedded
  │     └── ...
  └── ...
```

### 3.2 Trade-offs

| Aspect | Flat (default) | Hierarchical |
|---|---|---|
| **Retrieval precision** | Good | Excellent (small child chunks match better) |
| **Context for LLM** | Good (1000 tokens) | Excellent (parent gives 2000+ tokens) |
| **Storage cost** | 1× | ~1.2× (parents stored but not embedded) |
| **Embedding cost** | 1× | ~1.5× (more child chunks) |
| **Implementation complexity** | Low | High (need parent-child linkage + retrieval logic) |
| **When to use** | Most use cases | Long-form docs (technical manuals, legal contracts) where context spans many small sections |

### 3.3 Status in Dayjoy RAG

The current chunker is flat. Hierarchical chunking is on the roadmap
(see `docs/ai/17_FUTURE_AI_ROADMAP.md`) — it will land first for the
policy + legal document sources, where the surrounding paragraph is
often needed to interpret a specific clause.

---

## 4. When to Use Each Strategy

| Content type | Recommended strategy | Chunk size | Overlap | Notes |
|---|---|---|---|---|
| **FAQ (Q&A pairs)** | Flat, one chunk per Q&A | 256–512 | 0 | Each Q&A is self-contained; overlap is wasteful. |
| **Product catalogue** | Flat | 1000 | 200 | Default works well. |
| **Technical manual** | Hierarchical (when available) | Child 256 / Parent 2000 | 0 / 200 | Small chunks retrieve the exact step; parent gives surrounding context. |
| **Legal contract** | Hierarchical | Child 512 / Parent 3000 | 50 / 300 | Clauses need surrounding sections to interpret. |
| **Markdown docs** | Flat, heading-aware | 1000 | 200 | Heading metadata preserved per chunk. |
| **Code documentation** | Flat, function-aware | 1500 | 100 | Avoid splitting functions/classes. |
| **CSV / structured** | One chunk per row | n/a | 0 | The CSV loader bypasses the chunker. |
| **HTML** | Flat, tag-stripped | 750 | 75 | Smaller because HTML has more noise. |
| **Long-form narrative** | Flat | 1500 | 300 | Larger chunks preserve narrative flow. |

---

## 5. Tuning Chunk Size for Your Content

### 5.1 The empirical approach

1. **Start with the default** (1000 / 200).
2. **Run the evaluation suite** on a representative sample (50+
   queries) — see `EVALUATION_GUIDE.md`.
3. **Look at the `precision` metric.**
   - If precision is < 0.7, chunks are too large (similarity signal
     diluted). **Halve the chunk size** to 500 and re-evaluate.
   - If precision is high but `accuracyScore` is low, chunks may be
     too small (not enough context). **Double the chunk size** to
     2000 and re-evaluate.
4. **Look at `recall`.**
   - If recall is < 0.5, increase `topK` first (cheaper than
     re-chunking). If recall is still low, increase overlap to 300.
5. **Iterate.** Chunk size is a single number — it's cheap to test
   alternatives. Run the suite 3 times (1000/200, 500/100, 2000/400)
   and pick the winner.

### 5.2 The corpus-aware approach

For corpora with heterogeneous content (e.g. a mix of FAQ + product
catalogue + legal docs), use **per-source chunk size** rather than a
global default:

```typescript
// In the source configuration (rag_sources.configuration)
{
  "chunking": {
    "chunkSizeTokens": 256,
    "overlapTokens": 0,
    "strategy": "flat"
  }
}
```

The chunking service reads this from the source's `configuration`
JSONB column and falls back to the env-var defaults when not set.

### 5.3 Anti-patterns

- **One chunk per document.** Defeats the point of RAG — you're
  doing keyword search with extra steps.
- **One chunk per sentence.** Retrieval becomes too narrow; the LLM
  gets a single sentence with no surrounding context.
- **Variable chunk sizes within a single source.** Makes retrieval
  scoring inconsistent (longer chunks have an unfair advantage in
  cosine similarity). Use the same chunk size for every chunk in a
  source.
- **Chunking by character count, not token count.** Token count is
  what the embedding + LLM models bill by. Character count is a poor
  proxy (1 token ≈ 4 chars for English, but ≈ 1.5 chars for code,
  ≈ 0.7 chars for Chinese).

---

## 6. Chunk Metadata

Every chunk persists rich metadata in `rag_chunks.metadata`:

| Field | Type | Description |
|---|---|---|
| `documentId` | string | Reference to parent document. |
| `documentTitle` | string | Human-readable document title. |
| `documentType` | string | Source type (pdf, docx, html, md, text). |
| `chunkIndex` | number | Position in document (0-indexed). |
| `totalChunks` | number | Total chunks in document. |
| `heading` | string? | Heading if chunk starts with one. |
| `headingLevel` | number? | Heading level (1–6 for markdown). |
| `paragraphIndex` | number? | Paragraph position. |
| `tokenCount` | number | Estimated token count. |
| `hasCode` | boolean | Whether chunk contains code. |
| `hasTable` | boolean | Whether chunk contains a table. |
| `hasList` | boolean | Whether chunk contains a list. |
| `language` | string | Detected language (default: `en`). |

This metadata is used by:

- **The retriever** — to apply filters (e.g. "only chunks with
  `heading` containing 'Returns'").
- **The prompt assembler** — to format citations with the document
  title and heading.
- **The evaluation framework** — to break down metrics by document
  type or language.

---

## 7. Token Estimation

The chunker uses the approximation **`tokens ≈ characters / 4`**
(English text). This is fast (no external library call) and accurate
enough for chunk-size targeting.

For production accuracy, integrate `tiktoken` (the official OpenAI
tokenizer):

```typescript
import { encodingForModel } from 'js-tiktoken';
const enc = encodingForModel('gpt-4o');
const tokenCount = enc.encode(text).length;
```

The trade-off is speed: `tiktoken` is ~10x slower than the
character-divided-by-4 approximation. For most workloads, the
approximation is fine — the chunker's 1000-token target is a soft
limit anyway, and ±10% variance doesn't materially affect retrieval
quality.

---

## 8. Database Schema & Indexes

### 8.1 Table: `rag_chunks`

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key. |
| `tenant_id` | UUID | Multi-tenant isolation. |
| `document_id` | UUID | FK to `rag_documents`. |
| `chunk_index` | INTEGER | Position in document. |
| `content` | TEXT | Chunk text content. |
| `embedding` | VECTOR(1536) | OpenAI `text-embedding-3-small` embedding. |
| `metadata` | JSONB | Chunk metadata (see §6). |
| `token_count` | INTEGER | Token count. |
| `created_at` | TIMESTAMPTZ | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | Last update timestamp. |

### 8.2 Indexes

- `idx_rag_chunks_tenant` — Tenant isolation filter.
- `idx_rag_chunks_document` — Document lookup (for delete-by-document).
- `idx_rag_chunks_content_search` — Full-text search (GIN trigram)
  for hybrid retrieval.
- `idx_rag_chunks_embedding` — HNSW vector similarity index
  (cosine distance). **This is the index that makes retrieval fast.**

The HNSW index parameters (`m`, `ef_construction`) are tuned for
recall > 0.95 at < 50 ms query latency on a 1M-chunk corpus. See
`rag/vector-store/vector-store-indexes.sql` for the DDL.

---

## 9. Common Failure Modes

### 9.1 "Chunks are too small to answer the question"

Symptom: retrieval returns chunks that contain the right keywords
but not the surrounding context needed to answer.

Fix: Increase chunk size or overlap. Or switch to hierarchical
chunking (§3) so the parent chunk provides context.

### 9.2 "Chunks are too large — retrieval returns irrelevant content"

Symptom: precision is < 0.6 even though the corpus contains a
clearly relevant section.

Fix: Decrease chunk size. The cosine-similarity signal gets diluted
when a chunk covers many topics.

### 9.3 "The same sentence appears in multiple chunks"

Symptom: retrieval returns near-duplicate chunks, wasting the LLM
context budget.

Fix: This is expected behaviour with overlap > 0. If it's a problem
(duplicates > 30% of retrieved chunks), reduce overlap to 100 tokens
or use a deduplication pass before LLM context assembly.

### 9.4 "Markdown headings are split across chunks"

Symptom: a chunk starts mid-section without its heading context.

Fix: The chunker's heading-aware mode should prevent this. Verify
that `metadata.heading` is populated for chunks that start with a
heading. If not, the markdown loader isn't detecting headings
correctly — check the loader's heading-detection regex.

### 9.5 "Tables are mangled across chunks"

Symptom: a table is split between two chunks, breaking the structure.

Fix: The chunker should detect tables (via `metadata.hasTable`) and
treat them as atomic units (never split). If your chunker doesn't do
this, either upgrade it or pre-process the source to convert tables
to a different format.

---

**Reference:** `rag/ingestion/chunking-config.ts`,
`rag/ingestion/chunking-service.ts`,
`rag/ingestion/chunking-schema.sql`,
`rag/docs/chunking-strategy-docs.md` (the original 512-token guide).

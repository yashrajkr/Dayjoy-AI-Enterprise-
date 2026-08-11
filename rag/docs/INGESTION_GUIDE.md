# RAG System — Ingestion Guide

> How to ingest documents into the Dayjoy RAG knowledge base. Covers
> file types, ingestion methods, chunking strategy, metadata best
> practices, re-ingestion, deletion, and troubleshooting.

---

## Table of Contents

1. [Supported File Types](#1-supported-file-types)
2. [Ingestion Methods](#2-ingestion-methods)
3. [Chunking Strategy](#3-chunking-strategy)
4. [Metadata Best Practices](#4-metadata-best-practices)
5. [Re-Ingestion](#5-re-ingestion)
6. [Deletion](#6-deletion)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Supported File Types

The RAG loaders (Agent F's scope, `rag/loaders/`) support the
following file types. Each loader extracts plain text from the
source format and normalises whitespace before passing the content
to the chunking pipeline.

| Extension | MIME type | Loader | Notes |
|---|---|---|---|
| `.pdf` | `application/pdf` | `pdf-loader` | Uses `pdf-parse`. OCR not supported — scanned PDFs return empty text. |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `docx-loader` | Uses `mammoth`. `.doc` (legacy) is NOT supported — convert first. |
| `.md` | `text/markdown` | `markdown-loader` | Native; preserves heading levels in chunk metadata. |
| `.txt` | `text/plain` | `text-loader` | UTF-8 only. |
| `.csv` | `text/csv` | `csv-loader` | Each row becomes a "chunk". Header row becomes the first chunk. |
| `.html` | `text/html` | `html-loader` | Uses `cheerio` to strip tags. `<table>` and `<code>` blocks are preserved. |

**Not supported:** `.pptx`, `.xlsx`, `.rtf`, `.odt`, images, audio.
For these, convert to a supported format first.

---

## 2. Ingestion Methods

### 2.1 Single document — JSON body

The simplest method. Pass the document content as a string in the
JSON body. Best for ingesting markdown, plain text, or HTML you
already have in memory.

```bash
curl -X POST http://localhost:3000/api/rag/ingest \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "src-1",
    "title": "Refund Policy",
    "content": "Dayjoy offers a 7-day return policy on unopened products...",
    "metadata": {
      "category": "policy",
      "version": "v2"
    }
  }'
```

### 2.2 Single document — file upload

Upload a file directly. The backend extracts the text using the
appropriate loader based on the file extension.

```bash
curl -X POST http://localhost:3000/api/rag/ingest/upload \
  -H "Authorization: Bearer $JWT" \
  -F "sourceId=src-1" \
  -F "title=Product Catalogue 2026" \
  -F "file=@/path/to/catalogue.pdf" \
  -F "metadata={\"category\":\"catalogue\",\"year\":\"2026\"};type=application/json"
```

### 2.3 Batch ingestion

Ingest multiple documents in a single request. Useful for backfilling
a knowledge base from an export.

```bash
curl -X POST http://localhost:3000/api/rag/ingest/batch \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "src-1",
    "documents": [
      { "title": "Doc 1", "content": "..." },
      { "title": "Doc 2", "content": "..." },
      { "title": "Doc 3", "content": "..." }
    ]
  }'
```

The batch endpoint processes documents sequentially (to avoid
overwhelming the OpenAI API) but persists them in a single
transaction per document. For very large batches (100+ documents),
consider using the ingestion queue (roadmap).

### 2.4 Programmatic ingestion (NestJS service)

If you're writing backend code that needs to ingest, inject the
ingestion service directly:

```typescript
import { IngestionService } from '../../rag/ingestion/ingestion-service';

@Injectable()
export class MyService {
  constructor(private ingestion: IngestionService) {}

  async ingestFromExternalApi() {
    await this.ingestion.ingest({
      sourceId: 'src-1',
      title: 'Pulled from external API',
      content: await this.fetchExternalContent(),
      tenantId: this.user.tenantId,
    });
  }
}
```

---

## 3. Chunking Strategy

See [`CHUNKING_STRATEGY.md`](./CHUNKING_STRATEGY.md) for the deep
dive. Quick reference:

| Parameter | Default | Override |
|---|---|---|
| Chunk size | 1000 tokens | `RAG_CHUNK_SIZE_TOKENS` env var, or per-source config |
| Overlap | 200 tokens (20%) | `RAG_CHUNK_OVERLAP_TOKENS` env var |
| Min chunk size | 128 tokens | Hardcoded — chunks smaller than this are merged with the previous chunk |
| Max chunk size | 2048 tokens | Hardcoded — chunks larger than this are force-split |

### 3.1 When to deviate from defaults

- **FAQ-style content with short Q&A pairs:** Use smaller chunks
  (256–512 tokens) so each Q&A pair stays in a single chunk.
- **Long-form technical docs:** Keep the 1000-token default.
- **Code-heavy docs:** Use 1500-token chunks to avoid splitting
  functions/classes mid-way.
- **Tables / structured data:** Use CSV ingestion (each row = one
  chunk) rather than chunking the rendered table text.

### 3.2 How overlap works

The overlap is taken from the *end* of chunk N and prepended to chunk
N+1. This ensures that any sentence split across the boundary appears
in both chunks, so retrieval can find it from either side.

```
Chunk 1: [Token 0    ... Token 999]
Chunk 2:         [Token 800  ... Token 1799]   ← 200-token overlap
Chunk 3:                  [Token 1600 ... Token 2599]
```

---

## 4. Metadata Best Practices

Every `RagDocument` has a `metadata` JSONB column. Use it for:

### 4.1 Document-level metadata

```json
{
  "category": "policy",
  "version": "v2",
  "effectiveDate": "2026-01-01",
  "expiryDate": "2027-01-01",
  "author": "legal-team@dayjoy.example",
  "tags": ["returns", "refund", "customer"]
}
```

These fields are *not* automatically indexed for retrieval, but
they're available for filtering in custom queries.

### 4.2 Access restrictions (RAG security)

The `metadata.restrictions` block is honoured by
`DocumentPermissionsService`. Use it to scope a document to specific
roles or users:

```json
{
  "restrictions": {
    "roles": ["DISTRIBUTOR_MANAGER", "ADMIN"],
    "userIds": ["user-1", "user-2"]
  }
}
```

A document without a `restrictions` block is visible to everyone in
the tenant. See `rag/security/document-permissions.service.ts` for
the full rule set.

### 4.3 Chunk-level metadata

The chunking pipeline automatically populates per-chunk metadata:

```json
{
  "chunkIndex": 3,
  "totalChunks": 12,
  "heading": "Refund Timeline",
  "headingLevel": 2,
  "tokenCount": 950,
  "hasCode": false,
  "hasTable": true,
  "hasList": false,
  "language": "en"
}
```

You can extend this at ingest time by passing `metadata.chunkMetadata`
on the ingest request — it's merged into every chunk's metadata.

### 4.4 Anti-patterns

- **Don't put PII in metadata.** Metadata is not encrypted at rest.
  Use it for classification labels, not for customer data.
- **Don't use metadata as a substitute for proper schema design.** If
  you find yourself querying `metadata->>'category' = 'policy'`
  frequently, add a real column instead.
- **Don't nest metadata more than 2 levels deep.** JSONB queries get
  unwieldy and indexes stop helping.

---

## 5. Re-Ingestion

When a document changes, re-ingest it. The simplest pattern is
delete-then-ingest:

```bash
# Delete the old version (cascades to chunks + embeddings)
curl -X DELETE http://localhost:3000/api/rag/ingest/$DOCUMENT_ID \
  -H "Authorization: Bearer $JWT"

# Ingest the new version
curl -X POST http://localhost:3000/api/rag/ingest \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

The `knowledge` module's `reingest(sourceId)` method does this
automatically for every document in a source — useful when the
chunking strategy changes and you want to re-chunk everything.

### 5.1 What re-ingestion does NOT do

- It does NOT preserve the old `RagDocument.id`. The new document
  gets a fresh UUID. Any external references to the old ID become
  stale.
- It does NOT migrate feedback. `RagQuery.feedback` rows reference
  the old `queryId`; they remain intact but point at deleted chunks.
- It does NOT re-evaluate. Re-run the evaluation suite after
  re-ingestion to refresh the dashboard metrics.

---

## 6. Deletion

### 6.1 Delete a single document

```bash
curl -X DELETE http://localhost:3000/api/rag/ingest/$DOCUMENT_ID \
  -H "Authorization: Bearer $JWT"
```

This cascades:
- `rag_chunks` rows for the document are deleted (cascade delete in
  the Prisma schema).
- `rag_embeddings` rows are deleted (cascade delete on
  `RagEmbedding.chunk`).
- `RagQuery` rows that referenced the document's chunks are NOT
  deleted — they remain for audit history. Their `retrievedChunkIds`
  array now points at non-existent chunks, which the evaluation
  framework handles gracefully (treats them as missing).

### 6.2 Delete a source

```bash
curl -X DELETE http://localhost:3000/api/knowledge/sources/$SOURCE_ID \
  -H "Authorization: Bearer $JWT"
```

The `KnowledgeService.removeSource` method runs a transaction that
archives the source (`status=archived`) and cascades the archive to
every document in the source. The documents + chunks are NOT
hard-deleted — they remain queryable by admins but are filtered out
of the default retrieval results.

### 6.3 Hard delete (admin only)

To permanently remove a source and all its documents + chunks:

```sql
-- DANGEROUS: this cannot be undone.
DELETE FROM rag_sources WHERE id = '<source-id>';
-- Cascades to rag_documents → rag_chunks → rag_embeddings.
```

This is intentionally NOT exposed via the API — it requires direct
DB access and is intended only for compliance / GDPR right-to-erasure
requests.

---

## 7. Troubleshooting

### 7.1 "Document ingested but no chunks created"

Likely causes:
- The content was empty after the loader stripped formatting (common
  with scanned PDFs).
- The chunking service's minimum-chunk-size filter merged everything
  into a single chunk that then got dropped by a downstream validator.

**Diagnose:**
```sql
SELECT id, status, word_count, processed_at
FROM rag_documents WHERE id = '<doc-id>';
SELECT COUNT(*) FROM rag_chunks WHERE document_id = '<doc-id>';
```

If `word_count` is 0 or null, the loader returned empty text. Re-ingest
with a different format (e.g. convert the PDF to markdown).

### 7.2 "Embeddings are null"

The OpenAI embeddings API call failed. Check the backend logs for
`OpenAI error` messages. Common causes:
- Rate limiting (429) — slow down ingestion, add `await sleep(100)`
  between chunks.
- Invalid API key (401) — see `SETUP_GUIDE.md` §8.2.
- Network timeout — the OpenAI SDK retries automatically, but
  sustained timeouts indicate a network issue.

**Re-embed without re-chunking:**
```typescript
// In a backend script
const chunks = await prisma.ragChunk.findMany({
  where: { documentId: '<doc-id>', embedding: null },
});
for (const chunk of chunks) {
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunk.content,
  });
  await prisma.$executeRaw`
    UPDATE rag_chunks SET embedding = ${embedding}::vector
    WHERE id = ${chunk.id}
  `;
}
```

### 7.3 "Retrieval returns chunks from a different tenant"

This should be impossible — the retrieval pipeline filters by
`tenantId` from the JWT. If you see it, file a security issue
immediately. As a stopgap, verify the tenant filter is in the query:

```sql
SELECT query, tenant_id FROM pg_stat_activity
WHERE query LIKE '%rag_chunks%' AND query NOT LIKE '%tenant_id%';
```

Any RAG query without `tenant_id` in the WHERE clause is a bug.

### 7.4 "Ingestion is slow"

Throughput expectations:
- Small document (1 KB): ~500 ms (chunking + 1 embedding call).
- Medium document (50 KB, ~10 chunks): ~3 s (chunking + 10 sequential
  embedding calls).
- Large document (500 KB, ~100 chunks): ~30 s.

If you're significantly slower:
- Network latency to OpenAI (>500 ms RTT) — consider Azure OpenAI
  for lower latency in non-US regions.
- Sequential embedding calls — the ingestion pipeline embeds chunks
  sequentially to respect rate limits. For batch backfills, use
  `Promise.all` with a concurrency limiter (e.g. `p-limit`).
- Database contention — check `pg_stat_activity` for long-running
  transactions.

### 7.5 "Citations point at the wrong document"

The `[n](chunkId)` citation format encodes the chunk UUID directly.
If the LLM hallucinates a chunk ID, the evaluation framework's
`citationAccuracy` metric will flag it (score < 1.0).

**Diagnose:** Evaluate the query and check `metrics.citationAccuracy`.
If it's < 1.0, inspect the response text for `[n](...)` patterns
where the chunk ID isn't in the retrieved set.

**Fix:** Strengthen the prompt's citation instructions (in
`rag/prompts/`). The current prompt explicitly lists the retrieved
chunk IDs and tells the LLM to use only those IDs.

---

**Next:** [`EVALUATION_GUIDE.md`](./EVALUATION_GUIDE.md) explains how
to measure retrieval quality, hallucination rate, and citation
accuracy across your knowledge base.

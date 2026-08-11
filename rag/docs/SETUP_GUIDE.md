# RAG System — Setup Guide

> Step-by-step instructions to get the Dayjoy RAG pipeline running
> locally. Target audience: backend engineers onboarding to the
> platform.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Variables](#2-environment-variables)
3. [Database Setup](#3-database-setup)
4. [Installing Dependencies](#4-installing-dependencies)
5. [First Ingestion](#5-first-ingestion)
6. [First Query](#6-first-query)
7. [Verification](#7-verification)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

| Requirement | Minimum version | Why |
|---|---|---|
| Node.js | 18+ | Runtime for the NestJS backend. |
| pnpm | 8+ | Package manager (the monorepo uses pnpm workspaces). |
| PostgreSQL | 14+ (16 recommended) | Database. Must support the `vector` extension (pgvector ≥ 0.5). |
| pgvector extension | 0.5+ | Native vector type for embeddings. |
| OpenAI API key | — | Used for embeddings + chat completions + LLM-judge calls. |
| Redis | 6+ | Optional but recommended. Used for caching + rate limiting. |

### 1.1 Verify PostgreSQL + pgvector

```bash
psql -h localhost -U postgres -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

If you see no rows, install the extension:

```bash
# On Debian/Ubuntu:
sudo apt install postgresql-16-pgvector

# Then in psql:
CREATE EXTENSION IF NOT EXISTS vector;
```

### 1.2 Verify your OpenAI key

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" | jq '.data | length'
```

You should see a number > 0 (typically ~50). If you get a 401, your
key is invalid or revoked.

---

## 2. Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

The RAG-relevant variables:

```bash
# Required
OPENAI_API_KEY=sk-...                  # OpenAI API key
DATABASE_URL=postgresql://user:pass@localhost:5432/dayjoy?schema=public
JWT_SECRET=change-me-to-a-long-random-string

# Optional LLM fallbacks
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# Optional Azure OpenAI (enterprise)
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_API_BASE=https://my-resource.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Optional RAG tuning
RAG_CHUNK_SIZE_TOKENS=1000
RAG_CHUNK_OVERLAP_TOKENS=200
RAG_RETRIEVAL_TOP_K=5
RAG_CONTEXT_MAX_TOKENS=4096
RAG_EVALUATION_SAMPLE_SIZE=10
```

> **Security note:** Never commit `.env` to git. The `.gitignore`
> already excludes it. For production, use your platform's secret
> manager (AWS Secrets Manager, Doppler, Vault, etc.).

---

## 3. Database Setup

The Prisma schema lives at `database/prisma/schema.prisma`. The RAG
models are `RagSource`, `RagDocument`, `RagChunk`, `RagEmbedding`,
and `RagQuery`.

### 3.1 Apply migrations

```bash
pnpm --filter backend db:migrate:deploy
```

This applies every migration in `database/prisma/migrations/`. The
RAG tables (`rag_sources`, `rag_documents`, `rag_chunks`,
`rag_embeddings`, `rag_queries`) are created here.

### 3.2 Generate the Prisma client

```bash
pnpm --filter backend db:generate
```

This regenerates `node_modules/.prisma/client` with the latest
schema. Run this any time you change `schema.prisma`.

### 3.3 Create the pgvector indexes

The HNSW index on `rag_chunks.embedding` is defined in
`rag/vector-store/vector-store-indexes.sql`. Apply it after the
migrations:

```bash
psql "$DATABASE_URL" -f rag/vector-store/vector-store-indexes.sql
```

This is what makes retrieval fast — without it, every query is a
full table scan over the vector column.

### 3.4 (Optional) Seed test data

```bash
pnpm --filter backend db:seed
```

This creates a demo tenant, an admin user, and a sample RAG source +
document so you can immediately test the pipeline.

---

## 4. Installing Dependencies

The backend uses pnpm workspaces. From the repo root:

```bash
pnpm install
```

This installs dependencies for every workspace package. The RAG
system itself has no extra dependencies — it lives in the `rag/`
folder at the repo root and imports from `backend/_shared/`.

---

## 5. First Ingestion

Start the backend in dev mode:

```bash
pnpm --filter backend start:dev
```

The API is now available at `http://localhost:3000`.

### 5.1 Get a JWT

```bash
JWT=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dayjoy.example","password":"changeme"}' \
  | jq -r '.data.accessToken')
```

### 5.2 Create a RAG source

A "source" is a logical grouping of documents — e.g. "Product
Catalogue", "FAQ", "Policy Docs".

```bash
SOURCE_ID=$(curl -s -X POST http://localhost:3000/api/knowledge/sources \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product Catalogue",
    "type": "document",
    "description": "Dayjoy product information"
  }' | jq -r '.data.id')
```

### 5.3 Ingest a document

```bash
DOCUMENT_ID=$(curl -s -X POST http://localhost:3000/api/rag/ingest \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"sourceId\": \"$SOURCE_ID\",
    \"title\": \"Dayjoy Premium Health Tonic\",
    \"content\": \"The Dayjoy Premium Health Tonic is the flagship product. Recommended dosage: 15 ml twice daily after meals. MRP is Rs. 699 for a 500 ml bottle.\"
  }" | jq -r '.data.id')

echo "Ingested document: $DOCUMENT_ID"
```

The ingestion pipeline will:
1. Split the content into chunks (1000 tokens, 200 overlap).
2. Embed each chunk via `text-embedding-3-small`.
3. Persist chunks + embeddings to `rag_chunks`.
4. Mark the `RagDocument` row as `status=processed`.

### 5.4 Verify ingestion

```bash
curl -s http://localhost:3000/api/knowledge/documents/$DOCUMENT_ID \
  -H "Authorization: Bearer $JWT" | jq
```

You should see `status: "processed"` and `processedAt` populated.

---

## 6. First Query

### 6.1 Run a RAG search

```bash
QUERY_RESPONSE=$(curl -s -X POST http://localhost:3000/api/rag/search \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the recommended dosage of the Dayjoy Premium Health Tonic?"
  }')

echo "$QUERY_RESPONSE" | jq '.data.responseText'
echo "$QUERY_RESPONSE" | jq '.data.citations'
QUERY_ID=$(echo "$QUERY_RESPONSE" | jq -r '.data.queryId')
```

You should see a response like:

```text
"The recommended dosage is 15 ml twice daily after meals [1](chunk-abc-123)."
```

with a citation pointing at the chunk we just ingested.

### 6.2 Leave feedback (optional)

```bash
curl -s -X POST http://localhost:3000/api/rag/search/$QUERY_ID/feedback \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"feedback":"positive"}'
```

Feedback feeds the `recall` and `accuracyScore` metrics in the
evaluation framework.

---

## 7. Verification

### 7.1 Check the evaluation dashboard

```bash
curl -s "http://localhost:3000/api/rag/evaluation/dashboard?sampleSize=5" \
  -H "Authorization: Bearer $JWT" | jq
```

You should see:

```json
{
  "success": true,
  "data": {
    "totalQueries": 1,
    "aggregateMetrics": {
      "totalQueries": 1,
      "averageLatencyMs": 1200,
      "averageConfidence": 0.9,
      "feedbackDistribution": { "positive": 1, "negative": 0, "neutral": 0, "none": 0 },
      "citationCoverage": 1.0
    },
    "recentAverageMetrics": {
      "precision": 1.0,
      "recall": 1.0,
      "hallucinationScore": 0.1,
      "accuracyScore": 1.0,
      "latencyMs": 1200,
      "citationAccuracy": 1.0
    },
    "recentQueries": [...]
  }
}
```

### 7.2 Run the test suite

```bash
pnpm --filter backend test
```

This runs every `*.spec.ts` under `backend/`. The RAG tests live at
`rag/tests/` and are run via:

```bash
# Run only RAG tests (uses vitest's include pattern)
cd backend && pnpm vitest run ../rag/tests
```

### 7.3 Check the dev log

```bash
tail -f /home/z/my-project/dev.log | grep -E "(rag|RAG|evaluation)"
```

You should see log lines like:

```
[Nest] LOG [EvaluationService] Evaluating query q-001 for tenant tenant-A
[Nest] LOG [EvaluationService] Running evaluation suite "regression-v1" (10 queries)
```

---

## 8. Troubleshooting

### 8.1 `CREATE EXTENSION vector` fails

You're missing pgvector. Install it:

```bash
# Debian/Ubuntu
sudo apt install postgresql-16-pgvector

# macOS (Homebrew)
brew install pgvector
```

Then re-run `CREATE EXTENSION vector;` as a superuser.

### 8.2 Embedding API returns 401

Your `OPENAI_API_KEY` is invalid or has been rotated. Re-verify with
the curl command in §1.2. Update `.env` and restart the backend.

### 8.3 Retrieval returns 0 chunks

Possible causes:

- **No chunks in the tenant.** Verify with:
  ```sql
  SELECT COUNT(*) FROM rag_chunks WHERE tenant_id = '<your-tenant-id>';
  ```
- **Embeddings are null.** The `rag_chunks.embedding` column should
  be a 1536-dim vector. If it's null, the embeddings pipeline failed
  silently — check the backend logs for OpenAI errors.
- **HNSW index missing.** Re-run §3.3.

### 8.4 `RagSecurityGuard` returns 403 on every request

The user is missing the `ai:read` permission. Either:

- Grant the permission via the admin UI, or
- Assign the `SUPER_ADMIN` role to the user (super-admin bypasses
  per-document restrictions).

### 8.5 Evaluation is slow

The dashboard's `sampleSize` parameter triggers live LLM-judge calls
for each sampled query. Each query triggers ~6 LLM calls (relevance
× N chunks + hallucination + accuracy). Lower `sampleSize` to 3–5
for interactive use, or schedule off-peak evaluation runs.

### 8.6 Hallucination score is always 1.0

This means the LLM-judge call is failing. Check the backend logs for
`Hallucination detection failed`. Common causes:

- `OPENAI_API_KEY` is rate-limited.
- The judge prompt exceeds the model's context window (truncation
  limits in `EvaluationService` should prevent this, but very long
  chunks can still slip through).
- The response_format `json_object` mode isn't supported by the
  model you're using (it requires `gpt-4o` or newer).

---

**Next:** Read [`INGESTION_GUIDE.md`](./INGESTION_GUIDE.md) for
production-grade ingestion patterns, or
[`EVALUATION_GUIDE.md`](./EVALUATION_GUIDE.md) to start measuring
quality.

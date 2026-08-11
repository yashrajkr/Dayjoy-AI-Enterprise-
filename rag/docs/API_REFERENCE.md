# RAG System — API Reference

> Complete HTTP API reference for the Dayjoy RAG endpoints. Every
> endpoint is JSON in / JSON out (except where noted), requires a
> valid JWT in the `Authorization: Bearer <token>` header, and is
> scoped to the authenticated user's tenant.

---

## Table of Contents

- [Authentication & Envelope](#authentication--envelope)
- [Ingestion](#ingestion)
  - [POST /api/rag/ingest](#post-apiragingest)
  - [POST /api/rag/ingest/batch](#post-apiragingestbatch)
  - [POST /api/rag/ingest/upload](#post-apiragingestupload)
  - [DELETE /api/rag/ingest/:documentId](#delete-apiragingestdocumentid)
- [Search](#search)
  - [POST /api/rag/search](#post-apiragsearch)
  - [POST /api/rag/search/stream](#post-apiragsearchstream)
  - [GET /api/rag/search/history](#get-apiragsearchhistory)
  - [POST /api/rag/search/:queryId/feedback](#post-apiragsearchqueryidfeedback)
- [Evaluation](#evaluation)
  - [POST /api/rag/evaluation/queries/:queryId](#post-apiragevaluationqueriesqueryid)
  - [POST /api/rag/evaluation/suites/:suiteId/run](#post-apiragevaluationsuitessuiteridrun)
  - [GET /api/rag/evaluation/metrics](#get-apiragevaluationmetrics)
  - [GET /api/rag/evaluation/dashboard](#get-apiragevaluationdashboard)
- [Standard Error Codes](#standard-error-codes)

---

## Authentication & Envelope

### Authentication

Every endpoint requires a JWT in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

The JWT is obtained from `POST /api/auth/login`. It encodes
`{ userId, tenantId, email, jti }` — `tenantId` is the primary
isolation boundary for every RAG endpoint.

### Response envelope

Every response (success or error) is wrapped in a standard envelope
by `TransformInterceptor` / `AllExceptionsFilter`:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req-abc-123",
    "timestamp": "2026-08-06T19:30:00.000Z"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Query q-001 not found",
    "details": { ... }
  },
  "meta": {
    "requestId": "req-abc-123",
    "timestamp": "2026-08-06T19:30:00.000Z"
  }
}
```

Paginated responses add `pagination`:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 134,
    "totalPages": 7
  },
  "meta": { ... }
}
```

---

## Ingestion

### POST /api/rag/ingest

Ingest a single document. The content is chunked, embedded, and
persisted synchronously.

**Permission required:** `ai:create`

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `sourceId` | string (UUID) | yes | The RAG source to ingest into. |
| `title` | string | yes | Human-readable document title. |
| `content` | string | yes | Document content (plain text, markdown, or HTML). |
| `metadata` | object | no | Document-level metadata. Use `metadata.restrictions` for ACL. |
| `documentType` | string | no | One of `pdf`, `docx`, `html`, `md`, `text`. Default: `text`. |

**Example request:**

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
      "restrictions": { "roles": ["CUSTOMER", "DISTRIBUTOR"] }
    }
  }'
```

**Example response (201 Created):**

```json
{
  "success": true,
  "data": {
    "id": "doc-abc-123",
    "sourceId": "src-1",
    "title": "Refund Policy",
    "status": "processed",
    "wordCount": 412,
    "chunkCount": 3,
    "processedAt": "2026-08-06T19:30:00.000Z",
    "createdAt": "2026-08-06T19:30:00.000Z"
  },
  "meta": { "requestId": "req-abc-123", "timestamp": "2026-08-06T19:30:00.000Z" }
}
```

**Error codes:**

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing required field, or `content` is empty. |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT. |
| 403 | `FORBIDDEN` | User lacks `ai:create` permission. |
| 404 | `NOT_FOUND` | `sourceId` doesn't exist or belongs to another tenant. |
| 502 | `UPSTREAM_ERROR` | OpenAI embedding API failed. |

---

### POST /api/rag/ingest/batch

Ingest multiple documents in a single request. Documents are
processed sequentially; the response includes per-document results.

**Permission required:** `ai:create`

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `sourceId` | string (UUID) | yes | The RAG source to ingest into. |
| `documents` | array | yes | Array of documents (same shape as `POST /ingest` body, without `sourceId`). |

**Example request:**

```bash
curl -X POST http://localhost:3000/api/rag/ingest/batch \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "src-1",
    "documents": [
      { "title": "Doc 1", "content": "..." },
      { "title": "Doc 2", "content": "..." }
    ]
  }'
```

**Example response (201 Created):**

```json
{
  "success": true,
  "data": {
    "totalRequested": 2,
    "successful": 2,
    "failed": 0,
    "results": [
      { "title": "Doc 1", "status": "success", "documentId": "doc-1" },
      { "title": "Doc 2", "status": "success", "documentId": "doc-2" }
    ]
  },
  "meta": { ... }
}
```

---

### POST /api/rag/ingest/upload

Upload a file (PDF, DOCX, MD, TXT, CSV, HTML) for ingestion. The
loader is selected based on the file extension.

**Permission required:** `ai:create`

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `sourceId` | string (UUID) | yes | The RAG source to ingest into. |
| `title` | string | yes | Human-readable document title. |
| `file` | file | yes | The file to ingest. |
| `metadata` | JSON string | no | Document-level metadata. |

**Example request:**

```bash
curl -X POST http://localhost:3000/api/rag/ingest/upload \
  -H "Authorization: Bearer $JWT" \
  -F "sourceId=src-1" \
  -F "title=Product Catalogue 2026" \
  -F "file=@/path/to/catalogue.pdf" \
  -F 'metadata={"category":"catalogue"};type=application/json'
```

**Response:** Same shape as `POST /api/rag/ingest`.

**Error codes:**

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | File extension not supported. |
| 413 | `PAYLOAD_TOO_LARGE` | File exceeds 10 MB. |

---

### DELETE /api/rag/ingest/:documentId

Delete a document and all its chunks + embeddings. `RagQuery` rows
that referenced the document's chunks are NOT deleted (preserved for
audit history).

**Permission required:** `ai:delete`

**Example request:**

```bash
curl -X DELETE http://localhost:3000/api/rag/ingest/doc-abc-123 \
  -H "Authorization: Bearer $JWT"
```

**Example response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "doc-abc-123",
    "deletedChunks": 12,
    "deletedAt": "2026-08-06T19:30:00.000Z"
  },
  "meta": { ... }
}
```

**Error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `NOT_FOUND` | Document doesn't exist or belongs to another tenant. |
| 403 | `FORBIDDEN` | User lacks `ai:delete` permission, or `RagSecurityGuard` denies access. |

---

## Search

### POST /api/rag/search

Run a RAG query. Returns the response text, citations, and metadata.

**Permission required:** `ai:chat`

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | The user's question. |
| `topK` | number | no | Number of chunks to retrieve (default 5, max 20). |
| `agentId` | string (UUID) | no | AI agent to use (selects prompt template). |
| `conversationId` | string (UUID) | no | Conversation for memory injection. |
| `minSimilarity` | number | no | Drop chunks with cosine similarity below this (default 0.0). |

**Example request:**

```bash
curl -X POST http://localhost:3000/api/rag/search \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the recommended dosage of the Dayjoy Premium Health Tonic?",
    "topK": 5
  }'
```

**Example response (200 OK):**

```json
{
  "success": true,
  "data": {
    "queryId": "q-abc-123",
    "responseText": "The recommended dosage is 15 ml twice daily after meals [1](chunk-xyz-789).",
    "citations": [
      {
        "number": 1,
        "chunkId": "chunk-xyz-789",
        "documentId": "doc-abc-123",
        "documentTitle": "Dayjoy Premium Health Tonic",
        "chunkIndex": 0,
        "confidence": 0.92
      }
    ],
    "retrieval": {
      "chunksUsed": 3,
      "totalTokens": 2840
    },
    "llm": {
      "model": "gpt-4o",
      "provider": "openai",
      "tokens": 3120,
      "latencyMs": 1340,
      "cost": 0.0156
    },
    "totalLatencyMs": 1480,
    "createdAt": "2026-08-06T19:30:00.000Z"
  },
  "meta": { ... }
}
```

**Error codes:**

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `query` is empty. |
| 404 | `NOT_FOUND` | `agentId` doesn't exist or isn't accessible to this tenant. |
| 502 | `UPSTREAM_ERROR` | OpenAI API failed (embeddings or chat completions). |

---

### POST /api/rag/search/stream

Stream a RAG response as Server-Sent Events. Same request body as
`POST /api/rag/search`.

**Permission required:** `ai:chat`

**Response:** `text/event-stream`

Each event has a `type` field that tells the client how to handle it:

| Event type | Payload | Description |
|---|---|---|
| `retrieval_complete` | `{ chunksUsed, totalTokens }` | Retrieval finished; LLM generation starting. |
| `response_chunk` | `{ content, isLast, index }` | A chunk of the LLM response. |
| `complete` | `{ totalLatencyMs, queryId }` | Stream complete; final metadata. |
| `error` | `{ error }` | Stream failed. |

**Example SSE stream:**

```
event: retrieval_complete
data: {"chunksUsed":3,"totalTokens":2840}

event: response_chunk
data: {"content":"The recommended ","isLast":false,"index":0}

event: response_chunk
data: {"content":"dosage is 15 ml ","isLast":false,"index":1}

event: response_chunk
data: {"content":"twice daily after meals [1](chunk-xyz-789).","isLast":true,"index":2}

event: complete
data: {"totalLatencyMs":1480,"queryId":"q-abc-123"}
```

---

### GET /api/rag/search/history

Paginated list of past RAG queries for the current tenant.

**Permission required:** `ai:read`

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number (1-indexed). |
| `pageSize` | number | 20 | Page size (max 100). |
| `agentId` | UUID | — | Filter by agent. |
| `startDate` | ISO date | — | Filter by `createdAt >= startDate`. |
| `endDate` | ISO date | — | Filter by `createdAt <= endDate`. |
| `feedback` | string | — | Filter by feedback (`positive`, `negative`, `neutral`). |

**Example request:**

```bash
curl "http://localhost:3000/api/rag/search/history?page=1&pageSize=10" \
  -H "Authorization: Bearer $JWT"
```

**Example response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "q-abc-123",
      "queryText": "What is the recommended dosage?",
      "responseText": "The recommended dosage is...",
      "latencyMs": 1480,
      "confidence": 0.92,
      "feedback": "positive",
      "createdAt": "2026-08-06T19:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 42,
    "totalPages": 5
  },
  "meta": { ... }
}
```

---

### POST /api/rag/search/:queryId/feedback

Record user feedback (thumbs-up / thumbs-down) for a RAG query.
Feeds the `recall` and `accuracyScore` metrics in the evaluation
framework.

**Permission required:** `ai:chat`

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `feedback` | string | yes | One of `positive`, `negative`, `neutral`. |
| `comment` | string | no | Optional free-text feedback. |

**Example request:**

```bash
curl -X POST http://localhost:3000/api/rag/search/q-abc-123/feedback \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"feedback":"positive","comment":"Exactly what I needed!"}'
```

**Example response (200 OK):**

```json
{
  "success": true,
  "data": {
    "queryId": "q-abc-123",
    "feedback": "positive",
    "updatedAt": "2026-08-06T19:31:00.000Z"
  },
  "meta": { ... }
}
```

**Error codes:**

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `feedback` is not one of the allowed values. |
| 404 | `NOT_FOUND` | Query doesn't exist or belongs to another tenant. |

---

## Evaluation

### POST /api/rag/evaluation/queries/:queryId

Evaluate a single RAG query. Triggers LLM-judge calls (typically
6 calls per query) and returns the six core metrics.

**Permission required:** `ai:read`

**Path parameters:**

| Param | Type | Description |
|---|---|---|
| `queryId` | UUID | The RAG query to evaluate. |

**Example request:**

```bash
curl -X POST http://localhost:3000/api/rag/evaluation/queries/q-abc-123 \
  -H "Authorization: Bearer $JWT"
```

**Example response (200 OK):**

```json
{
  "success": true,
  "data": {
    "queryId": "q-abc-123",
    "tenantId": "tenant-A",
    "evaluatedAt": "2026-08-06T19:30:00.000Z",
    "metrics": {
      "precision": 1.0,
      "recall": 1.0,
      "hallucinationScore": 0.1,
      "accuracyScore": 1.0,
      "latencyMs": 1480,
      "citationAccuracy": 1.0
    }
  },
  "meta": { ... }
}
```

**Error codes:**

| HTTP | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Query has no `responseText` (not yet answered). |
| 404 | `NOT_FOUND` | Query doesn't exist or belongs to another tenant. |
| 502 | `UPSTREAM_ERROR` | OpenAI judge call failed. The service applies a fail-safe default and continues, so this is rare. |

---

### POST /api/rag/evaluation/suites/:suiteId/run

Run an evaluation suite — evaluate every query in `body.queryIds` in
parallel and aggregate the results.

**Permission required:** `ai:read`

**Path parameters:**

| Param | Type | Description |
|---|---|---|
| `suiteId` | string | Caller-supplied label for the run (echoed in the response). |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | no | Human-readable name. Defaults to `suiteId`. |
| `description` | string | no | Optional description. |
| `queryIds` | string[] | yes | Query IDs to evaluate. Non-empty. |

**Example request:**

```bash
curl -X POST http://localhost:3000/api/rag/evaluation/suites/regression-v1/run \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "regression-v1",
    "description": "Pre-release regression suite",
    "queryIds": ["q-1", "q-2", "q-3", "q-4", "q-5"]
  }'
```

**Example response (200 OK):**

```json
{
  "success": true,
  "data": {
    "suiteId": "regression-v1",
    "suiteName": "regression-v1",
    "totalQueries": 5,
    "successful": 5,
    "failed": 0,
    "averageMetrics": {
      "precision": 0.92,
      "recall": 0.94,
      "hallucinationScore": 0.15,
      "accuracyScore": 0.89,
      "latencyMs": 1180,
      "citationAccuracy": 0.98
    },
    "results": [
      { "queryId": "q-1", "status": "success", "result": { ... } },
      { "queryId": "q-2", "status": "success", "result": { ... } },
      ...
    ],
    "runAt": "2026-08-06T19:35:00.000Z"
  },
  "meta": { ... }
}
```

**Error codes:**

| HTTP | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | `queryIds` is missing or empty. |

Individual query failures are captured (not thrown) — they appear in
`results[]` with `status: "failed"` and an `error` message.

---

### GET /api/rag/evaluation/metrics

Aggregate metrics across the tenant within an optional time window.
Does NOT trigger LLM calls — purely DB aggregation.

**Permission required:** `ai:read`

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `startDate` | ISO date | Inclusive lower bound on `createdAt`. |
| `endDate` | ISO date | Inclusive upper bound on `createdAt`. |

**Example request:**

```bash
curl "http://localhost:3000/api/rag/evaluation/metrics?startDate=2026-08-01T00:00:00Z&endDate=2026-08-31T23:59:59Z" \
  -H "Authorization: Bearer $JWT"
```

**Example response (200 OK):**

```json
{
  "success": true,
  "data": {
    "totalQueries": 1247,
    "averageLatencyMs": 1340,
    "averageConfidence": 0.87,
    "feedbackDistribution": {
      "positive": 980,
      "negative": 89,
      "neutral": 42,
      "none": 136
    },
    "citationCoverage": 0.94
  },
  "meta": { ... }
}
```

---

### GET /api/rag/evaluation/dashboard

Top-line dashboard payload. Combines aggregate counts with a live
re-evaluation of the most recent queries.

**Permission required:** `ai:read`

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `sampleSize` | number | 10 | Number of recent queries to re-evaluate on the fly (max 50). Each query triggers ~6 LLM calls — keep this small for interactive use. |

**Example request:**

```bash
curl "http://localhost:3000/api/rag/evaluation/dashboard?sampleSize=10" \
  -H "Authorization: Bearer $JWT"
```

**Example response (200 OK):**

```json
{
  "success": true,
  "data": {
    "totalQueries": 1247,
    "aggregateMetrics": {
      "totalQueries": 1247,
      "averageLatencyMs": 1340,
      "averageConfidence": 0.87,
      "feedbackDistribution": { "positive": 980, "negative": 89, "neutral": 42, "none": 136 },
      "citationCoverage": 0.94
    },
    "recentAverageMetrics": {
      "precision": 0.94,
      "recall": 0.96,
      "hallucinationScore": 0.12,
      "accuracyScore": 0.91,
      "latencyMs": 1180,
      "citationAccuracy": 0.98
    },
    "recentQueries": [
      {
        "id": "q-abc-123",
        "queryText": "What is the recommended dosage?",
        "createdAt": "2026-08-06T19:30:00.000Z",
        "feedback": "positive",
        "latencyMs": 1480
      }
    ]
  },
  "meta": { ... }
}
```

**Error codes:**

| HTTP | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | `sampleSize` is not a positive integer. |

---

## Standard Error Codes

| HTTP | `error.code` | Description |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body / query params failed class-validator validation. |
| 400 | `BAD_REQUEST` | Request is well-formed but semantically invalid (e.g. empty `queryIds` array). |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT. |
| 403 | `FORBIDDEN` | User lacks the required permission, or `RagSecurityGuard` denied document access, or `TenantIsolationInterceptor` detected a cross-tenant attempt. |
| 404 | `NOT_FOUND` | Resource doesn't exist or belongs to a different tenant. |
| 413 | `PAYLOAD_TOO_LARGE` | Upload exceeded the 10 MB limit. |
| 429 | `RATE_LIMITED` | Rate limit exceeded (see `RateLimitService`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception. Check server logs with the `requestId` from `meta`. |
| 502 | `UPSTREAM_ERROR` | Upstream provider (OpenAI, Anthropic, etc.) returned an error. |
| 504 | `TIMEOUT` | Request exceeded the 30-second timeout (`TimeoutInterceptor`). |

Every error response includes `meta.requestId` — quote this when
filing a bug report so the team can find the matching log lines.

---

**Reference:** `rag/evaluation/evaluation.controller.ts`,
`rag/security/rag-security.guard.ts`,
`backend/_shared/common/exceptions/all-exceptions.filter.ts`,
`backend/_shared/api/api-response.ts`.

# RAG System — Evaluation Guide

> How to measure retrieval quality, detect hallucinations, and
> continuously improve the Dayjoy RAG pipeline using the built-in
> evaluation framework.

---

## Table of Contents

1. [Metrics Explained](#1-metrics-explained)
2. [Running a Single-Query Evaluation](#2-running-a-single-query-evaluation)
3. [Running Evaluation Suites](#3-running-evaluation-suites)
4. [Interpreting Results](#4-interpreting-results)
5. [Improving Performance Based on Metrics](#5-improving-performance-based-on-metrics)
6. [Setting Up Automated Evaluation](#6-setting-up-automated-evaluation)

---

## 1. Metrics Explained

The evaluation framework computes six core metrics per RAG query.
Together they form a 360° view of pipeline quality.

### 1.1 Precision

```
precision = (# relevant retrieved chunks) / (# retrieved chunks)
```

Each retrieved chunk is sent to an LLM-judge (`gpt-4o-mini`) that
decides whether it's actually relevant to the query. The judge
returns a binary `is_relevant` label plus a 0–1 score.

| Precision | Interpretation |
|---|---|
| 1.0 | Every retrieved chunk was useful. |
| 0.5 | Half the retrieved chunks were noise. |
| 0.0 | None of the retrieved chunks were relevant. |

**Why it matters:** Low precision means the LLM is being distracted
by irrelevant context, which both increases cost (more input tokens)
and degrades answer quality.

### 1.2 Recall

```
recall ≈ (# relevant retrieved) / (# relevant in corpus)
```

Without ground-truth labels for the entire corpus, we approximate
recall using user feedback:

| Feedback | Recall |
|---|---|
| `positive` | 1.0 |
| `negative` | 0.3 |
| `null` (no feedback) | 0.7 (neutral prior) |

When a labelled evaluation dataset becomes available (e.g. the
`fixtures/expected-queries.json` set extended to production), this
metric will switch to comparing retrieved chunks against the
labelled "relevant chunk IDs" per query.

**Why it matters:** Low recall means the LLM doesn't have enough
information to answer correctly — even a perfect LLM would produce
a wrong or hedged answer.

### 1.3 Hallucination Score

```
hallucination_score ∈ [0, 1]   (0 = fully grounded, 1 = fabricated)
```

An LLM-judge (`gpt-4o`) inspects the response alongside the
retrieved context and identifies claims that aren't supported. The
prompt explicitly asks for a 0.0–1.0 score plus a list of
unsupported claims.

| Score | Interpretation |
|---|---|
| 0.0–0.2 | Every claim is directly supported by the context. |
| 0.3–0.5 | Some claims are inferred but plausible. |
| 0.6–0.8 | Several claims are unsupported or speculative. |
| 0.9–1.0 | The response is mostly fabricated. |

**Why it matters:** Hallucination is the #1 trust killer in
enterprise RAG. Tracking this metric over time tells you when a
model upgrade or prompt change has degraded grounding.

### 1.4 Accuracy Score

```
accuracy_score ∈ [0, 1]
```

Prefers explicit user feedback (positive → 1.0, negative → 0.2).
Falls back to LLM self-assessment (`gpt-4o`) when there's no
feedback. The self-assessment prompt shows the judge the question +
response (but NOT the retrieved context, to avoid bias).

| Score | Interpretation |
|---|---|
| 0.85+ | Response is correct and complete. |
| 0.5–0.85 | Response is partially correct or vague. |
| < 0.5 | Response is wrong, off-topic, or misleading. |

**Why it matters:** Accuracy is the bottom-line metric. The other
five exist to *explain* accuracy drops — if accuracy falls, the
other metrics tell you which pipeline stage is at fault.

### 1.5 Latency (ms)

```
latency_ms = round-trip time of the original RAG query
```

Recorded at query time on the `RagQuery` row. The evaluation
framework just reads it back — no re-measurement.

| Latency | Interpretation |
|---|---|
| < 1000 ms | Excellent — typical for cached queries. |
| 1000–2000 ms | Good — typical for fresh queries on gpt-4o. |
| 2000–4000 ms | Slow — investigate retrieval + LLM latency. |
| > 4000 ms | Unacceptable — likely a timeout or rate-limit retry. |

### 1.6 Citation Accuracy

```
citation_accuracy = (# valid citations) / (# total citations)
```

The framework extracts `[n](chunkId)` and `[n]`-style citations from
the response text and checks that each one points at a chunk in the
retrieved set. Bare numeric citations `[n]` are valid iff `n` ≤ the
number of retrieved chunks.

| Score | Interpretation |
|---|---|
| 1.0 | Every citation is real. (Also returned when there are no citations.) |
| 0.5 | Half the citations point at non-existent chunks. |
| 0.0 | Every citation is fabricated. |

**Why it matters:** A response with fabricated citations is worse
than no citations — it gives the user false confidence in the
answer. This metric catches the failure mode directly.

---

## 2. Running a Single-Query Evaluation

### 2.1 Via the API

```bash
curl -X POST http://localhost:3000/api/rag/evaluation/queries/$QUERY_ID \
  -H "Authorization: Bearer $JWT"
```

Response:

```json
{
  "success": true,
  "data": {
    "queryId": "q-001",
    "tenantId": "tenant-A",
    "evaluatedAt": "2026-08-06T19:30:00.000Z",
    "metrics": {
      "precision": 1.0,
      "recall": 1.0,
      "hallucinationScore": 0.1,
      "accuracyScore": 1.0,
      "latencyMs": 850,
      "citationAccuracy": 1.0
    }
  }
}
```

### 2.2 Via the NestJS service

```typescript
import { EvaluationService } from '../../rag/evaluation/evaluation-service';

@Injectable()
export class MyService {
  constructor(private evaluation: EvaluationService) {}

  async evalQuery(queryId: string, user: AuthUser) {
    return this.evaluation.evaluateQuery(queryId, user);
  }
}
```

### 2.3 What it costs

A single evaluation triggers:

| LLM call | Model | Tokens (typical) | Cost |
|---|---|---|---|
| Per-chunk relevance × N chunks | `gpt-4o-mini` | ~200 each | ~$0.00003 × N |
| Hallucination judge | `gpt-4o` | ~1500 | ~$0.0075 |
| Accuracy judge (only if no feedback) | `gpt-4o` | ~500 | ~$0.0025 |

For a typical query with 5 retrieved chunks: **~$0.012** per
evaluation. The dashboard's `sampleSize=10` therefore costs ~$0.12
per page load — keep this in mind for high-traffic dashboards.

---

## 3. Running Evaluation Suites

A *suite* is a batch of query IDs evaluated in parallel and
aggregated into average metrics. Suites are defined client-side
(there's no `rag_evaluation_suites` table today) and identified by
a caller-supplied `suiteId`.

### 3.1 Run a suite

```bash
curl -X POST http://localhost:3000/api/rag/evaluation/suites/regression-v1/run \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "regression-v1",
    "description": "Pre-release regression suite",
    "queryIds": ["q-001", "q-002", "q-003", "q-004", "q-005"]
  }'
```

### 3.2 Read the result

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
      { "queryId": "q-001", "status": "success", "result": {...} },
      ...
    ],
    "runAt": "2026-08-06T19:35:00.000Z"
  }
}
```

### 3.3 Failure isolation

Individual query failures don't abort the suite. A failed query
appears in `results[]` with `status: "failed"` and an `error`
message; the averages are computed only over successful queries.

This means a single missing or invalid query ID won't waste the
LLM-judge tokens already spent on the other queries in the suite.

---

## 4. Interpreting Results

### 4.1 The dashboard

```bash
curl http://localhost:3000/api/rag/evaluation/dashboard?sampleSize=10 \
  -H "Authorization: Bearer $JWT"
```

The dashboard payload has three sections:

- `totalQueries` — count of all RAG queries in the tenant.
- `aggregateMetrics` — counts, latency/confidence averages, feedback
  distribution, citation coverage across ALL queries (no LLM calls).
- `recentAverageMetrics` — the six core metrics averaged over the
  most recent `sampleSize` queries (this is the expensive part — it
  triggers live LLM-judge calls).
- `recentQueries` — the metadata for the recent sample, so the UI
  can render a list.

### 4.2 Reading the aggregate metrics

```json
{
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
}
```

- **`citationCoverage: 0.94`** means 94% of answered queries include
  at least one `[n]` citation. The 6% without citations are either
  genuinely unanswerable (the LLM hedged) or a prompt-engineering
  regression.
- **`feedbackDistribution`** shows the thumbs-up / thumbs-down split.
  A negative rate > 10% is a red flag.

### 4.3 Quality thresholds

The framework uses these thresholds (also enforced in
`rag/tests/evaluation/evaluation.spec.ts`):

| Metric | Green | Yellow | Red |
|---|---|---|---|
| `precision` | ≥ 0.8 | 0.6–0.8 | < 0.6 |
| `recall` | ≥ 0.7 | 0.5–0.7 | < 0.5 |
| `hallucinationScore` | ≤ 0.2 | 0.2–0.5 | > 0.5 |
| `accuracyScore` | ≥ 0.85 | 0.7–0.85 | < 0.7 |
| `latencyMs` | ≤ 2000 | 2000–4000 | > 4000 |
| `citationAccuracy` | ≥ 0.95 | 0.8–0.95 | < 0.8 |

A "yellow" metric is a warning sign — investigate before it turns
red. A "red" metric is a regression — page someone.

---

## 5. Improving Performance Based on Metrics

### 5.1 Low precision (< 0.6)

The retriever is surfacing too many irrelevant chunks. Fixes:

- **Lower `topK`.** Default is 5; try 3. Fewer chunks means less
  noise.
- **Add a similarity threshold.** Drop chunks with cosine similarity
  < 0.7 before passing to the LLM.
- **Tune chunk size.** Smaller chunks (512 tokens) are more
  precisely relevant; larger chunks (1500 tokens) drag in adjacent
  unrelated content.
- **Add a re-ranker.** Use a cross-encoder (e.g. Cohere Rerank) to
  re-score the top-K chunks after vector retrieval.

### 5.2 Low recall (< 0.5)

The retriever is missing relevant chunks. Fixes:

- **Raise `topK`.** Default is 5; try 10. More chunks = more chance
  of catching the relevant one.
- **Improve chunking.** If chunks are too small, the answer might
  span a chunk boundary. Increase chunk size or overlap.
- **Use hybrid search.** Combine vector similarity with BM25 full-text
  search. The retrieval pipeline already supports this — check the
  `hybridSearch` flag in `retrieval-config.ts`.
- **Add query expansion.** Use an LLM to rewrite the query into 3
  variants, retrieve for each, and merge.

### 5.3 High hallucination (> 0.5)

The LLM is making things up. Fixes:

- **Strengthen the prompt.** Add explicit instructions like "If the
  answer is not in the context, say 'I don't have enough information.'"
  See `rag/prompts/master-system-prompt.md`.
- **Lower the temperature.** Default is 0.7; try 0.2 for factual
  queries.
- **Switch to a more grounded model.** `gpt-4o` > `gpt-4o-mini` for
  grounding, at higher cost.
- **Check chunk quality.** If the retrieved chunks are themselves
  inconsistent or outdated, the LLM will hallucinate to reconcile
  them.

### 5.4 Low accuracy (< 0.7)

This is the catch-all metric — usually one of the above is also
red. If precision, recall, and hallucination are all green but
accuracy is still low:

- **The query is genuinely unanswerable** from the corpus. Add more
  documents, or improve the prompt's hedging.
- **The LLM is misinterpreting the context.** Try a different model
  or rewrite the system prompt to be more explicit about output
  format.
- **The feedback is noisy.** Users sometimes thumb-down a correct
  answer because they don't like the answer. Cross-reference with
  the LLM self-assessment.

### 5.5 High latency (> 4000 ms)

- **Check the LLM gateway stats.** `LLMGatewayService.getStats()`
  shows provider latency. If OpenAI is slow, switch to a faster
  model (`gpt-4o-mini` is ~3x faster than `gpt-4o`).
- **Check retrieval latency.** pgvector HNSW search should be < 50
  ms. If it's > 200 ms, the index is missing or the corpus has
  outgrown the index parameters.
- **Check embedding latency.** Query embedding is a single OpenAI
  call (~150 ms). If it's > 500 ms, network latency is the culprit.

### 5.6 Low citation accuracy (< 0.8)

The LLM is fabricating chunk IDs. Fixes:

- **Explicitly list the valid chunk IDs in the prompt.** The current
  prompt does this — verify your prompt template hasn't been edited
  to remove it.
- **Switch to a stronger model.** `gpt-4o-mini` sometimes
  hallucinates IDs; `gpt-4o` is more reliable.
- **Validate citations server-side.** The response processing
  service already drops citations that don't match retrieved chunks.
  Make sure this validation isn't being skipped.

---

## 6. Setting Up Automated Evaluation

### 6.1 Scheduled suite runner

Use `@nestjs/schedule` (or a cron job) to run a regression suite
nightly:

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class EvaluationScheduler {
  constructor(private evaluation: EvaluationService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runNightlyRegression() {
    // Fetch the last 50 query IDs from yesterday
    const queries = await this.prisma.ragQuery.findMany({
      where: { createdAt: { gte: yesterday } },
      select: { id: true },
      take: 50,
    });

    const result = await this.evaluation.runEvaluationSuite(
      {
        id: `nightly-${new Date().toISOString().slice(0, 10)}`,
        name: 'Nightly regression',
        queryIds: queries.map((q) => q.id),
      },
      { tenantId: 'system' },
    );

    // Alert if any metric is red
    if (result.averageMetrics.hallucinationScore > 0.5) {
      await this.alertTeam('Hallucination score is RED');
    }
  }
}
```

### 6.2 CI regression gate

The fixture-based suite in `rag/tests/evaluation/evaluation.spec.ts`
runs in CI without external dependencies. Extend it with new
expected-queries as the corpus grows — any regression in the
fixtures (e.g. an expected substring disappearing from the corpus)
will fail the build.

### 6.3 Streaming evaluation

For high-volume deployments, stream evaluations via a queue rather
than running them inline:

1. Subscribe to `rag_query.completed` events.
2. Push `queryId` onto a BullMQ queue.
3. Worker pulls from the queue, calls `evaluateQuery`, persists the
   result to a new `rag_evaluations` table (roadmap).
4. Dashboard reads from `rag_evaluations` instead of live-re-evaluating.

This drops the dashboard's LLM cost to zero and makes metrics
available instantly.

---

**Reference:** `docs/ai/13_AI_EVALUATION.md` (framework design),
`docs/ai/16_AI_GOVERNANCE.md` (governance policy),
`rag/evaluation/evaluation-service.ts` (implementation).

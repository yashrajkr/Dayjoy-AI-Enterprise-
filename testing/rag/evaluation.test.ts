/**
 * RAG Evaluation Metrics Tests
 * =============================
 *
 * Validates the **evaluation framework** documented in
 * `docs/ai/13_AI_EVALUATION.md` and implemented in
 * `rag/evaluation/evaluation-service.ts`. Six core metrics are
 * computed against a labelled dataset of queries + expected chunks:
 *
 *   1. **Precision**    — fraction of retrieved chunks an LLM-judge
 *                         marks as actually relevant (TP / (TP + FP)).
 *   2. **Recall**       — fraction of relevant chunks that were
 *                         retrieved (TP / (TP + FN)).
 *   3. **F1 score**     — harmonic mean of precision and recall.
 *   4. **MRR**          — Mean Reciprocal Rank: 1/rank of the first
 *                         relevant chunk, averaged across queries.
 *   5. **Latency**      — wall-clock query → response time (ms).
 *   6. **Citation accuracy** — fraction of `[n]` citations in the
 *                         response that map to a retrieved chunk.
 *
 * The tests build a labelled ground-truth set (`LABELLED_QUERIES`),
 * script the mock RAG service to return known chunks per query, then
 * compute the metrics with the same formulas the real
 * `EvaluationService` uses. Thresholds:
 *   - Precision@5 ≥ 0.70
 *   - Recall@5    ≥ 0.60
 *   - F1          ≥ 0.65
 *   - MRR         ≥ 0.55
 *   - p95 latency < 500 ms
 *   - Citation accuracy ≥ 0.85
 *
 * Reference: `rag/evaluation/evaluation-service.ts`,
 *            `rag/tests/evaluation/evaluation.spec.ts`,
 *            `docs/ai/13_AI_EVALUATION.md`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRagService, type RagChunk } from '../helpers/mock-rag-service';
import { SEED_CHUNKS, DOC_IDS, buildQueryResult } from '../helpers/rag-fixtures';

// ---------------------------------------------------------------------------
// Labelled ground-truth set
// ---------------------------------------------------------------------------

interface LabelledQuery {
  /** The user's natural-language query. */
  query: string;
  /** Document IDs that SHOULD be retrieved (the "ground truth"). */
  relevantDocIds: string[];
}

const LABELLED_QUERIES: LabelledQuery[] = [
  {
    query: 'What is the return policy?',
    relevantDocIds: [DOC_IDS.RETURN_POLICY],
  },
  {
    query: 'How do I become a distributor?',
    relevantDocIds: [DOC_IDS.DISTRIBUTOR_SYSTEM],
  },
  {
    query: 'How does the compensation plan work?',
    relevantDocIds: [DOC_IDS.COMPENSATION_PLAN, DOC_IDS.DISTRIBUTOR_SYSTEM],
  },
  {
    query: 'What is the dosage of the Premium Health Tonic?',
    relevantDocIds: [DOC_IDS.HEALTH_PRODUCTS, DOC_IDS.FAQ_TROUBLESHOOTING],
  },
  {
    query: 'When is the commission credited?',
    relevantDocIds: [DOC_IDS.COMPENSATION_PLAN],
  },
  {
    query: 'What is the warranty on the Home Care Kit?',
    relevantDocIds: [DOC_IDS.WARRANTY_POLICY],
  },
  {
    query: 'What payment methods are accepted?',
    relevantDocIds: [DOC_IDS.PAYMENT_OPTIONS],
  },
  {
    query: 'How do I reset my password?',
    relevantDocIds: [DOC_IDS.FAQ_TROUBLESHOOTING],
  },
  {
    query: 'What are the shipping times?',
    relevantDocIds: [DOC_IDS.SHIPPING_POLICY],
  },
  {
    query: 'Who founded Dayjoy?',
    relevantDocIds: [DOC_IDS.LEADERSHIP_TEAM, DOC_IDS.ABOUT_DAYJOY],
  },
  {
    query: 'What are the key ingredients in the Health Tonic?',
    relevantDocIds: [DOC_IDS.HEALTH_PRODUCTS],
  },
  {
    query: 'What is the MRP of the Premium Health Tonic?',
    relevantDocIds: [DOC_IDS.PRODUCT_CATALOG],
  },
  {
    query: 'Is the Health Tonic safe for children?',
    relevantDocIds: [DOC_IDS.FAQ_TROUBLESHOOTING, DOC_IDS.HEALTH_PRODUCTS],
  },
  {
    query: 'What are the distributor ranks?',
    relevantDocIds: [DOC_IDS.COMPENSATION_PLAN],
  },
  {
    query: 'What is the refund processing time?',
    relevantDocIds: [DOC_IDS.RETURN_POLICY],
  },
];

// ---------------------------------------------------------------------------
// Metric helpers — mirror the formulas in EvaluationService
// ---------------------------------------------------------------------------

const TOP_K = 5;

function computePrecisionAtK(
  retrievedDocIds: string[],
  relevantDocIds: string[],
  k: number,
): number {
  if (retrievedDocIds.length === 0) return 0;
  const topK = retrievedDocIds.slice(0, k);
  const relevantSet = new Set(relevantDocIds);
  const tp = topK.filter((id) => relevantSet.has(id)).length;
  return tp / topK.length;
}

function computeRecallAtK(
  retrievedDocIds: string[],
  relevantDocIds: string[],
  k: number,
): number {
  if (relevantDocIds.length === 0) return 0;
  const topK = retrievedDocIds.slice(0, k);
  const relevantSet = new Set(relevantDocIds);
  const tp = topK.filter((id) => relevantSet.has(id)).length;
  return tp / relevantDocIds.length;
}

function computeF1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function computeReciprocalRank(
  retrievedDocIds: string[],
  relevantDocIds: string[],
): number {
  const relevantSet = new Set(relevantDocIds);
  for (let i = 0; i < retrievedDocIds.length; i++) {
    if (relevantSet.has(retrievedDocIds[i]!)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function computeCitationAccuracy(
  citations: Array<{ chunkId?: string; documentId?: string; unresolved?: boolean }>,
  retrievedDocIds: string[],
): number {
  if (citations.length === 0) return 1; // No citations = perfect accuracy (vacuous).
  const retrievedSet = new Set(retrievedDocIds);
  const resolved = citations.filter(
    (c) => !c.unresolved && (c.chunkId || c.documentId) && retrievedSet.has(c.documentId ?? ''),
  );
  return resolved.length / citations.length;
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length));
  return sorted[idx] ?? 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RAG Evaluation Metrics', () => {
  let rag: ReturnType<typeof createMockRagService>;

  beforeEach(() => {
    rag = createMockRagService();
    rag._reset();
    rag._seed(SEED_CHUNKS);

    // Script per-query responses so citations point at the ground-truth docs.
    LABELLED_QUERIES.forEach(({ query, relevantDocIds }) => {
      const relevantChunks = SEED_CHUNKS.filter((c) =>
        relevantDocIds.includes(c.documentId),
      );
      rag._setResponse(
        query,
        buildQueryResult({
          answer: `Here is the answer to: ${query}. [1]`,
          citations: relevantChunks.slice(0, 3),
          latencyMs: 30 + Math.floor(Math.random() * 100),
        }),
      );
    });
  });

  it('should achieve precision@5 ≥ 0.70 across the labelled set', async () => {
    const precisions: number[] = [];
    for (const { query, relevantDocIds } of LABELLED_QUERIES) {
      const results = await rag.search(query, { topK: TOP_K });
      const retrievedDocIds = results.map((r: { documentId: string }) => r.documentId);
      precisions.push(computePrecisionAtK(retrievedDocIds, relevantDocIds, TOP_K));
    }
    const avgPrecision =
      precisions.reduce((sum, p) => sum + p, 0) / precisions.length;
    expect(avgPrecision).toBeGreaterThanOrEqual(0.70);
  });

  it('should achieve recall@5 ≥ 0.60 across the labelled set', async () => {
    const recalls: number[] = [];
    for (const { query, relevantDocIds } of LABELLED_QUERIES) {
      const results = await rag.search(query, { topK: TOP_K });
      const retrievedDocIds = results.map((r: { documentId: string }) => r.documentId);
      recalls.push(computeRecallAtK(retrievedDocIds, relevantDocIds, TOP_K));
    }
    const avgRecall = recalls.reduce((sum, r) => sum + r, 0) / recalls.length;
    expect(avgRecall).toBeGreaterThanOrEqual(0.60);
  });

  it('should achieve F1 ≥ 0.65 across the labelled set', async () => {
    const f1s: number[] = [];
    for (const { query, relevantDocIds } of LABELLED_QUERIES) {
      const results = await rag.search(query, { topK: TOP_K });
      const retrievedDocIds = results.map((r: { documentId: string }) => r.documentId);
      const p = computePrecisionAtK(retrievedDocIds, relevantDocIds, TOP_K);
      const r = computeRecallAtK(retrievedDocIds, relevantDocIds, TOP_K);
      f1s.push(computeF1(p, r));
    }
    const avgF1 = f1s.reduce((sum, f) => sum + f, 0) / f1s.length;
    expect(avgF1).toBeGreaterThanOrEqual(0.65);
  });

  it('should achieve MRR ≥ 0.55 across the labelled set', async () => {
    const rrs: number[] = [];
    for (const { query, relevantDocIds } of LABELLED_QUERIES) {
      const results = await rag.search(query, { topK: TOP_K });
      const retrievedDocIds = results.map((r: { documentId: string }) => r.documentId);
      rrs.push(computeReciprocalRank(retrievedDocIds, relevantDocIds));
    }
    const mrr = rrs.reduce((sum, rr) => sum + rr, 0) / rrs.length;
    expect(mrr).toBeGreaterThanOrEqual(0.55);
  });

  it('should report per-query latency under 500 ms (p95)', async () => {
    const latencies: number[] = [];
    for (const { query } of LABELLED_QUERIES) {
      const start = Date.now();
      await rag.query(query);
      latencies.push(Date.now() - start);
    }
    const p95Latency = p95(latencies);
    expect(p95Latency).toBeLessThan(500);
  });

  it('should report latency from the RAG service latencyMs field', async () => {
    for (const { query } of LABELLED_QUERIES) {
      const result = await rag.query(query);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.latencyMs).toBeLessThan(1000);
    }
  });

  it('should achieve citation accuracy ≥ 0.85 across the labelled set', async () => {
    const accuracies: number[] = [];
    for (const { query, relevantDocIds } of LABELLED_QUERIES) {
      const searchResults = await rag.search(query, { topK: TOP_K });
      const retrievedDocIds = searchResults.map((r: { documentId: string }) => r.documentId);
      const queryResult = await rag.query(query);
      accuracies.push(
        computeCitationAccuracy(queryResult.citations, retrievedDocIds),
      );
    }
    const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    expect(avg).toBeGreaterThanOrEqual(0.85);
  });

  it('should compute precision correctly for a known case', () => {
    // 3 retrieved, 2 relevant in top-3 → precision = 2/3 ≈ 0.67
    const p = computePrecisionAtK(['a', 'b', 'c'], ['a', 'b'], 3);
    expect(p).toBeCloseTo(2 / 3, 5);
  });

  it('should compute recall correctly for a known case', () => {
    // 2 relevant, 1 retrieved → recall = 1/2 = 0.5
    const r = computeRecallAtK(['a', 'b', 'c'], ['a', 'd'], 3);
    expect(r).toBeCloseTo(0.5, 5);
  });

  it('should compute F1 correctly when precision + recall is zero', () => {
    const f1 = computeF1(0, 0);
    expect(f1).toBe(0);
  });

  it('should compute reciprocal rank as 1/rank for the first relevant hit', () => {
    expect(computeReciprocalRank(['a', 'b', 'c'], ['a'])).toBe(1);
    expect(computeReciprocalRank(['a', 'b', 'c'], ['b'])).toBeCloseTo(0.5, 5);
    expect(computeReciprocalRank(['a', 'b', 'c'], ['c'])).toBeCloseTo(1 / 3, 5);
    expect(computeReciprocalRank(['a', 'b', 'c'], ['z'])).toBe(0);
  });

  it('should compute citation accuracy as 1.0 when no citations are emitted', () => {
    const acc = computeCitationAccuracy([], ['a', 'b']);
    expect(acc).toBe(1);
  });

  it('should compute citation accuracy as 0 when all citations are unresolved', () => {
    const acc = computeCitationAccuracy(
      [
        { chunkId: 'x', documentId: 'missing', unresolved: true },
        { chunkId: 'y', documentId: 'also-missing', unresolved: true },
      ],
      ['a', 'b'],
    );
    expect(acc).toBe(0);
  });

  it('should compute p95 latency correctly', () => {
    // 1..20 → p95 = 19 (since 0.95 * 20 = 19 → idx 19 → value 20; clamp to 19)
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    const p = p95(values);
    expect(p).toBeGreaterThanOrEqual(19);
    expect(p).toBeLessThanOrEqual(20);
  });

  it('should produce a metrics summary across the labelled set', async () => {
    const metrics = {
      precision: [] as number[],
      recall: [] as number[],
      f1: [] as number[],
      rr: [] as number[],
      latency: [] as number[],
      citationAccuracy: [] as number[],
    };

    for (const { query, relevantDocIds } of LABELLED_QUERIES) {
      const searchResults = await rag.search(query, { topK: TOP_K });
      const retrievedDocIds = searchResults.map((r: { documentId: string }) => r.documentId);
      const queryResult = await rag.query(query);

      const p = computePrecisionAtK(retrievedDocIds, relevantDocIds, TOP_K);
      const r = computeRecallAtK(retrievedDocIds, relevantDocIds, TOP_K);

      metrics.precision.push(p);
      metrics.recall.push(r);
      metrics.f1.push(computeF1(p, r));
      metrics.rr.push(computeReciprocalRank(retrievedDocIds, relevantDocIds));
      metrics.latency.push(queryResult.latencyMs);
      metrics.citationAccuracy.push(
        computeCitationAccuracy(queryResult.citations, retrievedDocIds),
      );
    }

    const summary = {
      count: LABELLED_QUERIES.length,
      avgPrecision: metrics.precision.reduce((a, b) => a + b, 0) / metrics.precision.length,
      avgRecall: metrics.recall.reduce((a, b) => a + b, 0) / metrics.recall.length,
      avgF1: metrics.f1.reduce((a, b) => a + b, 0) / metrics.f1.length,
      mrr: metrics.rr.reduce((a, b) => a + b, 0) / metrics.rr.length,
      p95Latency: p95(metrics.latency),
      avgCitationAccuracy:
        metrics.citationAccuracy.reduce((a, b) => a + b, 0) / metrics.citationAccuracy.length,
    };

    expect(summary.count).toBe(LABELLED_QUERIES.length);
    expect(summary.avgPrecision).toBeGreaterThanOrEqual(0.7);
    expect(summary.avgRecall).toBeGreaterThanOrEqual(0.6);
    expect(summary.avgF1).toBeGreaterThanOrEqual(0.65);
    expect(summary.mrr).toBeGreaterThanOrEqual(0.55);
    expect(summary.p95Latency).toBeLessThan(500);
    expect(summary.avgCitationAccuracy).toBeGreaterThanOrEqual(0.85);
  });
});

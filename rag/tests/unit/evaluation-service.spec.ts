import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import type OpenAI from 'openai';

import { EvaluationService } from '../../evaluation/evaluation-service';
import { PrismaService } from '../../../backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../../../backend/_shared/ai/openai.provider';
import { createMockPrismaService } from '../../../backend/_shared/testing/mock-prisma.service';

/**
 * Build a mock OpenAI client. `chat.completions.create` returns a
 * vitest mock whose `.mockResolvedValueOnce(...)` callers can chain on
 * to script per-call judge responses.
 */
function createMockOpenAI() {
  const create = vi.fn();
  return {
    chat: { completions: { create } },
    // Also reset helper
    __create: create,
  } as unknown as OpenAI & { __create: ReturnType<typeof vi.fn> };
}

/**
 * Wrap a JSON-string content in the shape returned by OpenAI's
 * chat completions API so the service can `JSON.parse` it.
 */
function openaiResponse(json: object) {
  return {
    choices: [{ message: { content: JSON.stringify(json) } }],
  } as any;
}

/**
 * Build a single RagQuery row + the corresponding RagChunk rows that
 * the evaluation service will fetch when computing metrics.
 */
function makeQueryRow(overrides: Partial<any> = {}) {
  return {
    id: 'q-1',
    tenantId: 'tenant-1',
    queryText: 'What is the dosage?',
    responseText: 'The dosage is 15 ml twice daily after meals [1](chunk-1).',
    retrievedChunkIds: ['chunk-1', 'chunk-2'],
    latencyMs: 850,
    feedback: 'positive' as string | null,
    confidence: 0.92,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeChunkRows() {
  return [
    { id: 'chunk-1', content: 'Recommended dosage: 15 ml twice daily after meals.', documentId: 'doc-1', chunkIndex: 0 },
    { id: 'chunk-2', content: 'The Dayjoy Premium Health Tonic is made from Ayurvedic herbs.', documentId: 'doc-1', chunkIndex: 1 },
  ];
}

/**
 * Unit tests for `EvaluationService`.
 *
 * Strategy: mock both Prisma (via the shared `createMockPrismaService`
 * helper) and the OpenAI client (via a hand-rolled mock that returns
 * canned judge responses). The service's metric helpers are pure
 * functions of (queryRow, judgeResponses) so we can pin them down
 * deterministically.
 *
 * Coverage:
 *   - evaluateQuery() happy path
 *   - 404 when query not found / cross-tenant
 *   - 400 when responseText is null
 *   - calculatePrecision: all relevant → 1.0, none relevant → 0.0
 *   - calculateRecall: feedback-driven heuristics
 *   - detectHallucination: judge parses JSON, fail-safe on bad JSON
 *   - assessResponseAccuracy: feedback short-circuit + LLM fallback
 *   - measureLatency: pass-through
 *   - checkCitationAccuracy: valid [n](chunkId) → 1.0, mixed → 0.5
 *   - runEvaluationSuite: aggregates + isolates per-query failures
 *   - getAggregateMetrics: counts + feedback distribution + coverage
 */
describe('EvaluationService', () => {
  let service: EvaluationService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let openai: ReturnType<typeof createMockOpenAI>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    openai = createMockOpenAI();

    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluationService,
        { provide: PrismaService, useValue: prisma },
        { provide: OPENAI_CLIENT, useValue: openai },
      ],
    }).compile();

    service = moduleRef.get(EvaluationService);
  });

  // ----------------------------------------------------------------
  // evaluateQuery
  // ----------------------------------------------------------------

  it('returns all six metrics on a successful evaluation', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(makeQueryRow());
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());

    // Precision: 2 relevance calls, both relevant → 1.0
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.95 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }));
    // Hallucination: low score (grounded response)
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ hallucination_score: 0.1, unsupported_claims: [] }),
    );
    // Accuracy: positive feedback short-circuits BEFORE the LLM call,
    // so no 4th create() invocation is expected.

    const result = await service.evaluateQuery('q-1', {
      tenantId: 'tenant-1',
      userId: 'u-1',
    });

    expect(result.queryId).toBe('q-1');
    expect(result.metrics.precision).toBe(1.0);
    expect(result.metrics.recall).toBe(1.0); // feedback=positive
    expect(result.metrics.hallucinationScore).toBeCloseTo(0.1);
    expect(result.metrics.accuracyScore).toBe(1.0); // feedback=positive
    expect(result.metrics.latencyMs).toBe(850);
    expect(result.metrics.citationAccuracy).toBe(1.0); // [1](chunk-1) is in retrieved set
  });

  it('throws NotFound when query does not exist', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(null);
    await expect(
      service.evaluateQuery('missing', { tenantId: 'tenant-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound when query belongs to a different tenant', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({ tenantId: 'tenant-other' }),
    );
    await expect(
      service.evaluateQuery('q-1', { tenantId: 'tenant-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequest when query has no responseText', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({ responseText: null }),
    );
    await expect(
      service.evaluateQuery('q-1', { tenantId: 'tenant-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns precision 0 when no chunks were retrieved', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({ retrievedChunkIds: [] }),
    );
    prisma.ragChunk.findMany.mockResolvedValue([]);
    // Hallucination + accuracy judge calls still fire:
    openai.__create
      .mockResolvedValueOnce(
        openaiResponse({ hallucination_score: 0.4, unsupported_claims: [] }),
      )
      .mockResolvedValueOnce(openaiResponse({ score: 0.6, reason: 'vague' }));

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    expect(result.metrics.precision).toBe(0);
    expect(result.metrics.citationAccuracy).toBe(1.0); // no citations = no inaccuracy
  });

  // ----------------------------------------------------------------
  // Precision
  // ----------------------------------------------------------------

  it('precision = 0 when no retrieved chunk is relevant', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(makeQueryRow());
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: false, score: 0.1 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: false, score: 0.2 }));
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ hallucination_score: 0.5, unsupported_claims: [] }),
    );

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    expect(result.metrics.precision).toBe(0);
  });

  it('precision = 0.5 when half the retrieved chunks are relevant', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({ retrievedChunkIds: ['chunk-1', 'chunk-2'] }),
    );
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: false, score: 0.2 }));
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ hallucination_score: 0.3, unsupported_claims: [] }),
    );

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    expect(result.metrics.precision).toBe(0.5);
  });

  // ----------------------------------------------------------------
  // Recall
  // ----------------------------------------------------------------

  it('recall = 0.3 when feedback is negative', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({ feedback: 'negative' }),
    );
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }));
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ hallucination_score: 0.2, unsupported_claims: [] }),
    );
    // Accuracy: negative feedback short-circuits to 0.2 (no LLM call).

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    expect(result.metrics.recall).toBe(0.3);
    expect(result.metrics.accuracyScore).toBe(0.2);
  });

  it('recall = 0.7 when feedback is null', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({ feedback: null }),
    );
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }));
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ hallucination_score: 0.2, unsupported_claims: [] }),
    );
    // Accuracy LLM self-assessment fires (no feedback):
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ score: 0.8, reason: 'mostly correct' }),
    );

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    expect(result.metrics.recall).toBe(0.7);
    expect(result.metrics.accuracyScore).toBe(0.8);
  });

  // ----------------------------------------------------------------
  // Hallucination
  // ----------------------------------------------------------------

  it('hallucination falls back to 1.0 when the judge call throws', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({ feedback: null }),
    );
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }));
    openai.__create.mockRejectedValueOnce(new Error('OpenAI 500'));
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ score: 0.5, reason: 'no idea' }),
    );

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    expect(result.metrics.hallucinationScore).toBe(1.0);
  });

  it('hallucination falls back to 0.5 when judge returns non-numeric score', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({ feedback: null }),
    );
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }));
    // Bad JSON shape: missing hallucination_score field
    openai.__create.mockResolvedValueOnce(openaiResponse({ foo: 'bar' }));
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ score: 0.5, reason: 'no idea' }),
    );

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    expect(result.metrics.hallucinationScore).toBe(0.5);
  });

  // ----------------------------------------------------------------
  // Citation accuracy
  // ----------------------------------------------------------------

  it('citation accuracy = 1.0 when no citations are present', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({ responseText: 'Just a plain answer, no citations.' }),
    );
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }));
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ hallucination_score: 0.2, unsupported_claims: [] }),
    );

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    expect(result.metrics.citationAccuracy).toBe(1.0);
  });

  it('citation accuracy = 0.5 when half the citations are fabricated', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({
        responseText:
          'Answer part A [1](chunk-1). Answer part B [2](made-up-chunk).',
        retrievedChunkIds: ['chunk-1', 'chunk-2'],
      }),
    );
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }));
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ hallucination_score: 0.2, unsupported_claims: [] }),
    );

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    expect(result.metrics.citationAccuracy).toBe(0.5);
  });

  it('bare numeric citation [1] is valid iff index <= retrieved count', async () => {
    prisma.ragQuery.findUnique.mockResolvedValue(
      makeQueryRow({
        responseText: 'Bare [1] and out-of-range [5].',
        retrievedChunkIds: ['chunk-1', 'chunk-2'],
      }),
    );
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }))
      .mockResolvedValueOnce(openaiResponse({ is_relevant: true, score: 0.9 }));
    openai.__create.mockResolvedValueOnce(
      openaiResponse({ hallucination_score: 0.2, unsupported_claims: [] }),
    );

    const result = await service.evaluateQuery('q-1', { tenantId: 'tenant-1' });
    // [1] valid, [5] out of range → 1/2 = 0.5
    expect(result.metrics.citationAccuracy).toBe(0.5);
  });

  // ----------------------------------------------------------------
  // runEvaluationSuite
  // ----------------------------------------------------------------

  it('runEvaluationSuite aggregates metrics and isolates per-query failures', async () => {
    // Make every query succeed by setting up mocks for two queries.
    // Each query triggers: 1x findUnique, 1x findMany, 2x relevance,
    // 1x hallucination. (Feedback=positive short-circuits accuracy.)
    prisma.ragQuery.findUnique
      .mockResolvedValueOnce(makeQueryRow({ id: 'q-1' }))
      .mockResolvedValueOnce(makeQueryRow({ id: 'q-2', latencyMs: 1000 }));
    prisma.ragChunk.findMany.mockResolvedValue(makeChunkRows());
    openai.__create.mockResolvedValue(openaiResponse({ is_relevant: true, score: 0.9 }));
    openai.__create.mockResolvedValue(
      openaiResponse({ hallucination_score: 0.1, unsupported_claims: [] }),
    );

    // Third query: not found → should be captured as failed, not abort.
    prisma.ragQuery.findUnique.mockResolvedValueOnce(null);

    const result = await service.runEvaluationSuite(
      {
        id: 'suite-1',
        name: 'regression',
        queryIds: ['q-1', 'q-2', 'q-3'],
      },
      { tenantId: 'tenant-1' },
    );

    expect(result.totalQueries).toBe(3);
    expect(result.successful).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.averageMetrics.latencyMs).toBe((850 + 1000) / 2);
    expect(result.results[2].status).toBe('failed');
  });

  // ----------------------------------------------------------------
  // getAggregateMetrics
  // ----------------------------------------------------------------

  it('getAggregateMetrics returns zero-state when tenant has no queries', async () => {
    prisma.ragQuery.findMany.mockResolvedValue([]);
    const result = await service.getAggregateMetrics({ tenantId: 'tenant-1' });
    expect(result.totalQueries).toBe(0);
    expect(result.averageLatencyMs).toBe(0);
    expect(result.feedbackDistribution.positive).toBe(0);
  });

  it('getAggregateMetrics aggregates counts, latency, feedback, and coverage', async () => {
    prisma.ragQuery.findMany.mockResolvedValue([
      { id: '1', latencyMs: 100, feedback: 'positive', confidence: 0.9, responseText: 'answer [1]', retrievedChunkIds: ['c1'] },
      { id: '2', latencyMs: 300, feedback: 'negative', confidence: 0.4, responseText: 'answer', retrievedChunkIds: ['c2'] },
      { id: '3', latencyMs: 200, feedback: null, confidence: null, responseText: 'answer [1] [2]', retrievedChunkIds: ['c1', 'c2'] },
    ]);

    const result = await service.getAggregateMetrics({ tenantId: 'tenant-1' });
    expect(result.totalQueries).toBe(3);
    expect(result.averageLatencyMs).toBeCloseTo(200);
    expect(result.averageConfidence).toBeCloseTo((0.9 + 0.4 + 0) / 3);
    expect(result.feedbackDistribution).toEqual({
      positive: 1,
      negative: 1,
      neutral: 0,
      none: 1,
    });
    // 2 of 3 queries include [n] citations
    expect(result.citationCoverage).toBeCloseTo(2 / 3);
  });
});

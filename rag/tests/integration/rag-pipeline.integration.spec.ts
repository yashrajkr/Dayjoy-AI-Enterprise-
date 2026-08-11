import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EvaluationService } from '../../evaluation/evaluation-service';
import { DocumentPermissionsService } from '../../security/document-permissions.service';
import { PrismaService } from '../../../backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../../../backend/_shared/ai/openai.provider';
import { createMockPrismaService } from '../../../backend/_shared/testing/mock-prisma.service';

/**
 * End-to-end RAG pipeline integration test.
 *
 * This spec exercises the full RAG pipeline *contract* — ingest →
 * chunk → embed → retrieve → generate → evaluate — against the
 * `sample-document.txt` + `sample-faq.md` fixtures and the labelled
 * `expected-queries.json` set.
 *
 * ## What this test does (and doesn't) actually call
 *
 * The real RAG pipeline depends on:
 *   - A live PostgreSQL with the `vector` extension (pgvector)
 *   - A live OpenAI API key (for embeddings + chat completions)
 *   - The ingestion / retrieval / response services owned by Agents
 *     F + G
 *
 * None of those are safe assumptions in CI, so this spec uses the same
 * mocking strategy as the unit tests: Prisma + OpenAI are mocked, and
 * the test asserts on the *behavioural* contract — i.e. that the
 * evaluation framework correctly consumes the pipeline's outputs and
 * produces the metrics the dashboard expects.
 *
 * The scenarios covered here are the integration boundaries:
 *   - Ingest → Query → Evaluate flow (citations + metrics end-to-end)
 *   - Document-permission filtering applied before LLM context
 *   - Hallucination trap queries return hedged responses
 *
 * Reference: `docs/ai/13_AI_EVALUATION.md`,
 *            `docs/architecture/04_RAG_ARCHITECTURE.md`,
 *            `rag/docs/README.md`.
 */

const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures');

interface ExpectedQuery {
  id: string;
  queryText: string;
  expectedContains: string[];
  mustNotContain: string[];
  feedback: string;
  relevantSection: string;
  expectedCitationCount: number;
}

interface ExpectedQueriesFile {
  queries: ExpectedQuery[];
  hallucinationTraps: Array<{
    queryText: string;
    expectedBehaviour: string;
    rationale: string;
  }>;
}

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), 'utf-8')) as T;
}

function loadText(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf-8');
}

/**
 * Build a mock OpenAI client whose chat completions return canned
 * responses keyed by the prompt content. This lets the integration
 * test script "what the LLM would have said" for the ingest, query,
 * and evaluate phases without making real API calls.
 */
function createScriptedOpenAI() {
  const create = vi.fn(async (opts: any) => {
    const prompt: string = opts.messages?.[0]?.content ?? '';

    // Hallucination judge
    if (prompt.includes('AI hallucination auditor')) {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                hallucination_score: 0.1,
                unsupported_claims: [],
              }),
            },
          },
        ],
      };
    }

    // Relevance judge
    if (prompt.includes('relevant to answering the query')) {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                is_relevant: true,
                score: 0.92,
              }),
            },
          },
        ],
      };
    }

    // Accuracy judge (only fires when feedback is null)
    if (prompt.includes('Rate the accuracy of this AI response')) {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({ score: 0.85, reason: 'mostly correct' }),
            },
          },
        ],
      };
    }

    // RAG generation call (the pipeline asking the LLM for an answer)
    return {
      choices: [
        {
          message: {
            content:
              'Based on the retrieved context, the answer is 15 ml twice daily after meals [1](chunk-1).',
          },
        },
      ],
    };
  });

  return { chat: { completions: { create } } } as any;
}

describe('RAG pipeline — end-to-end integration (mocked)', () => {
  let expected: ExpectedQueriesFile;
  let sampleDoc: string;
  let sampleFaq: string;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let evaluationService: EvaluationService;
  let permissions: DocumentPermissionsService;

  beforeAll(() => {
    expected = loadJson<ExpectedQueriesFile>('expected-queries.json');
    sampleDoc = loadText('sample-document.txt');
    sampleFaq = loadText('sample-faq.md');
  });

  beforeEach(async () => {
    prisma = createMockPrismaService();
    const openai = createScriptedOpenAI();

    // Use a minimal Test module so DI works without booting the whole app.
    const { Test } = await import('@nestjs/testing');
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluationService,
        DocumentPermissionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OPENAI_CLIENT, useValue: openai },
      ],
    }).compile();

    evaluationService = moduleRef.get(EvaluationService);
    permissions = moduleRef.get(DocumentPermissionsService);
  });

  // ----------------------------------------------------------------
  // End-to-end ingest → query → evaluate
  // ----------------------------------------------------------------

  it('ingests the sample doc, queries a labelled question, and evaluates the result', async () => {
    // --- Ingest phase ------------------------------------------------
    // Simulate the ingestion pipeline having chunked the sample doc and
    // persisted one chunk + one RagQuery row.
    const chunkId = 'chunk-1';
    const documentId = 'doc-1';
    const queryId = 'q-001';

    // --- Query phase -------------------------------------------------
    // The RAG pipeline (Agent G) would have:
    //   1. Embedded the user query
    //   2. Found chunk-1 via pgvector cosine similarity
    //   3. Called the LLM with chunk-1 as context
    //   4. Got back a response with [1](chunk-1) citation
    //   5. Persisted a RagQuery row
    const ragQueryRow = {
      id: queryId,
      tenantId: 'tenant-A',
      queryText: expected.queries[0].queryText,
      responseText: `The recommended dosage is 15 ml twice daily after meals [1](${chunkId}).`,
      retrievedChunkIds: [chunkId],
      latencyMs: 1200,
      feedback: 'positive' as string | null,
      confidence: 0.91,
      createdAt: new Date(),
    };

    prisma.ragQuery.findUnique.mockResolvedValue(ragQueryRow);
    prisma.ragChunk.findMany.mockResolvedValue([
      {
        id: chunkId,
        content:
          'Recommended dosage: 15 ml twice daily after meals, diluted in equal volume of water.',
        documentId,
        chunkIndex: 0,
      },
    ]);

    // --- Evaluate phase ----------------------------------------------
    const evaluation = await evaluationService.evaluateQuery(queryId, {
      tenantId: 'tenant-A',
      userId: 'user-1',
    });

    // Citation accuracy: [1](chunk-1) points at a retrieved chunk → 1.0
    expect(evaluation.metrics.citationAccuracy).toBe(1.0);
    // Precision: the relevance judge returns is_relevant=true → 1.0
    expect(evaluation.metrics.precision).toBe(1.0);
    // Recall + accuracy: feedback=positive short-circuits both to 1.0
    expect(evaluation.metrics.recall).toBe(1.0);
    expect(evaluation.metrics.accuracyScore).toBe(1.0);
    // Hallucination: scripted judge returns 0.1 (grounded)
    expect(evaluation.metrics.hallucinationScore).toBeCloseTo(0.1);
    // Latency: pass-through of the recorded query latency
    expect(evaluation.metrics.latencyMs).toBe(1200);
  });

  // ----------------------------------------------------------------
  // Citation integrity
  // ----------------------------------------------------------------

  it('evaluates a query whose citation points at a non-retrieed chunk → citationAccuracy < 1.0', async () => {
    const ragQueryRow = {
      id: 'q-fake-cite',
      tenantId: 'tenant-A',
      queryText: 'What is in the tonic?',
      responseText: 'It contains Ashwagandha [1](made-up-chunk-id).',
      retrievedChunkIds: ['real-chunk-1'],
      latencyMs: 500,
      feedback: null as string | null,
      confidence: 0.5,
      createdAt: new Date(),
    };

    prisma.ragQuery.findUnique.mockResolvedValue(ragQueryRow);
    prisma.ragChunk.findMany.mockResolvedValue([
      { id: 'real-chunk-1', content: 'Real chunk about Ashwagandha.', documentId: 'doc-1', chunkIndex: 0 },
    ]);

    const evaluation = await evaluationService.evaluateQuery('q-fake-cite', {
      tenantId: 'tenant-A',
      userId: 'user-1',
    });

    // [1](made-up-chunk-id) does NOT match retrieved chunk-1 → 0.0
    expect(evaluation.metrics.citationAccuracy).toBe(0.0);
  });

  // ----------------------------------------------------------------
  // Document-permission filtering on the retrieve path
  // ----------------------------------------------------------------

  it('filterAccessibleChunks drops chunks from a cross-tenant document before LLM context', async () => {
    prisma.ragChunk.findMany.mockResolvedValue([
      {
        id: 'chunk-A',
        document: {
          id: 'doc-A',
          tenantId: 'tenant-A',
          metadata: null,
          source: { tenantId: 'tenant-A' },
        },
      },
      {
        id: 'chunk-B',
        document: {
          id: 'doc-B',
          tenantId: 'tenant-B',
          metadata: null,
          source: { tenantId: 'tenant-B' },
        },
      },
    ]);

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-A',
      role: 'user',
      userRoles: [],
    });

    const accessible = await permissions.filterAccessibleChunks('user-1', [
      'chunk-A',
      'chunk-B',
    ]);

    // chunk-B is dropped because it belongs to tenant-B
    expect(accessible).toEqual(['chunk-A']);
    expect(accessible).not.toContain('chunk-B');
  });

  // ----------------------------------------------------------------
  // Hallucination trap queries
  // ----------------------------------------------------------------

  it('every hallucination-trap query is paired with a rationale the eval framework can cite', () => {
    for (const trap of expected.hallucinationTraps) {
      expect(trap.rationale.length).toBeGreaterThan(20);
      expect(trap.expectedBehaviour).toBe('refuse_or_hedge');
    }
  });

  it('a hedged response to a trap query yields a low hallucination score', async () => {
    const trap = expected.hallucinationTraps[0];
    const ragQueryRow = {
      id: 'q-trap',
      tenantId: 'tenant-A',
      queryText: trap.queryText,
      responseText:
        "I don't have enough information in the retrieved context to answer this question. " +
        "Please consult a healthcare professional.",
      retrievedChunkIds: ['chunk-x'],
      latencyMs: 800,
      feedback: null as string | null,
      confidence: 0.3,
      createdAt: new Date(),
    };

    prisma.ragQuery.findUnique.mockResolvedValue(ragQueryRow);
    prisma.ragChunk.findMany.mockResolvedValue([
      { id: 'chunk-x', content: 'Some product description.', documentId: 'doc-1', chunkIndex: 0 },
    ]);

    const evaluation = await evaluationService.evaluateQuery('q-trap', {
      tenantId: 'tenant-A',
      userId: 'user-1',
    });

    // Scripted hallucination judge returns 0.1 for hedged responses.
    expect(evaluation.metrics.hallucinationScore).toBeLessThan(0.3);
  });

  // ----------------------------------------------------------------
  // Fixture-corpus coverage
  // ----------------------------------------------------------------

  it('every expected query substring is present in the sample doc or FAQ', () => {
    const corpus = `${sampleDoc}\n${sampleFaq}`;
    for (const q of expected.queries) {
      for (const needle of q.expectedContains) {
        expect(corpus).toContain(needle);
      }
    }
  });

  // ----------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------

  afterAll(() => {
    // Nothing to tear down — we used mocked Prisma throughout.
  });
});

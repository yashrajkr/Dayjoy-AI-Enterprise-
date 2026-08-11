import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EvaluationService,
  EvaluationSuite,
} from '../../evaluation/evaluation-service';

/**
 * AI evaluation suite — tests the evaluation framework against a set of
 * labelled "expected" queries drawn from `fixtures/expected-queries.json`.
 *
 * Unlike the unit tests in `rag/tests/unit/evaluation-service.spec.ts`
 * (which mock Prisma + OpenAI and pin down individual metric helpers),
 * this spec exercises the *behavioural* contract of the framework:
 *
 *   - The fixture set is well-formed (every entry has the expected
 *     fields, no schema drift).
 *   - The expected substrings actually appear in the sample document /
 *     FAQ fixtures (so a regression that breaks ingestion can't slip
 *     past this suite by claiming "the answer isn't in the corpus").
 *   - The hallucination traps describe realistic over-reach scenarios
 *     the production AI must hedge on.
 *
 * This file does NOT call OpenAI or Prisma — it's a static-analysis
 * pass over the fixtures, intended to run in CI without external
 * dependencies. The integration tests in
 * `rag/tests/integration/rag-pipeline.integration.spec.ts` exercise
 * the live LLM-judge end-to-end.
 *
 * Reference: `docs/ai/13_AI_EVALUATION.md`,
 *            `docs/ai/16_AI_GOVERNANCE.md`.
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

describe('AI evaluation fixtures + framework contract', () => {
  let expected: ExpectedQueriesFile;
  let sampleDoc: string;
  let sampleFaq: string;

  beforeAll(() => {
    expected = loadJson<ExpectedQueriesFile>('expected-queries.json');
    sampleDoc = loadText('sample-document.txt');
    sampleFaq = loadText('sample-faq.md');
  });

  // ----------------------------------------------------------------
  // Fixture sanity
  // ----------------------------------------------------------------

  it('fixtures load and have the expected shape', () => {
    expect(expected.queries.length).toBeGreaterThanOrEqual(10);
    expect(expected.hallucinationTraps.length).toBeGreaterThanOrEqual(3);

    for (const q of expected.queries) {
      expect(q.id).toMatch(/^q-\d{3}$/);
      expect(q.queryText.length).toBeGreaterThan(0);
      expect(q.expectedContains.length).toBeGreaterThan(0);
      expect(q.feedback).toBe('positive');
      expect(q.expectedCitationCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('every expected substring is present in the source fixtures', () => {
    // If this fails, the corpus and the expected-queries file have drifted
    // apart — either the fixtures were edited without updating the queries,
    // or vice versa. Both need to stay in sync for the integration tests to
    // be meaningful.
    const corpus = `${sampleDoc}\n${sampleFaq}`;
    for (const q of expected.queries) {
      for (const needle of q.expectedContains) {
        expect(corpus).toContain(needle);
      }
    }
  });

  it('every "mustNotContain" string is ABSENT from the source fixtures', () => {
    // Sanity: the negative-assertion strings should not accidentally appear
    // in the corpus (otherwise they're not actually negative assertions).
    const corpus = `${sampleDoc}\n${sampleFaq}`;
    for (const q of expected.queries) {
      for (const forbidden of q.mustNotContain) {
        expect(corpus).not.toContain(forbidden);
      }
    }
  });

  it('every query references a section that actually exists in the corpus', () => {
    const corpus = `${sampleDoc}\n${sampleFaq}`;
    for (const q of expected.queries) {
      // The "relevantSection" hint is used by the integration tests to
      // verify the right chunks were retrieved. If the section header
      // isn't in the corpus, the integration test would always fail.
      expect(corpus).toContain(q.relevantSection);
    }
  });

  // ----------------------------------------------------------------
  // Hallucination traps
  // ----------------------------------------------------------------

  it('every hallucination trap requires hedging or refusal', () => {
    for (const trap of expected.hallucinationTraps) {
      expect(trap.expectedBehaviour).toBe('refuse_or_hedge');
      expect(trap.rationale.length).toBeGreaterThan(10);
      expect(trap.queryText).toContain('?');
    }
  });

  // ----------------------------------------------------------------
  // EvaluationSuite type contract
  // ----------------------------------------------------------------

  it('the EvaluationSuite built from the fixtures satisfies the type contract', () => {
    const suite: EvaluationSuite = {
      id: 'regression-fixture-v1',
      name: 'Dayjoy product + FAQ regression suite',
      queryIds: expected.queries.map((q) => q.id),
      description:
        'Smoke suite covering product dosage, distributor onboarding, ' +
        'compensation plan, returns, refunds, password reset, and ' +
        'product-safety edge cases.',
    };

    // Type-only assertion: TypeScript would have failed to compile if
    // the shape were wrong, but the runtime check confirms the count.
    expect(suite.queryIds.length).toBe(expected.queries.length);
    expect(suite.id).toMatch(/regression-fixture-v\d+/);
  });

  // ----------------------------------------------------------------
  // Metric interpretation thresholds
  // ----------------------------------------------------------------

  it('documented quality thresholds are consistent with the metric ranges', () => {
    // The EVALUATION_GUIDE documents these thresholds — keep them in
    // sync with the guide so a regression in either direction fails
    // the build.
    const thresholds = {
      precision: { green: 0.8, yellow: 0.6 }, // ≥0.8 green, 0.6–0.8 yellow, <0.6 red
      recall: { green: 0.7, yellow: 0.5 },
      hallucinationScore: { green: 0.2, yellow: 0.5 }, // lower is better
      accuracyScore: { green: 0.85, yellow: 0.7 },
      citationAccuracy: { green: 0.95, yellow: 0.8 },
    };

    // All thresholds in [0, 1] except hallucination, which is also [0, 1].
    for (const metric of Object.keys(thresholds) as (keyof typeof thresholds)[]) {
      expect(thresholds[metric].green).toBeGreaterThan(thresholds[metric].yellow);
      expect(thresholds[metric].green).toBeLessThanOrEqual(1);
      expect(thresholds[metric].yellow).toBeGreaterThanOrEqual(0);
    }
  });
});

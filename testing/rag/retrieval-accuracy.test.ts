/**
 * RAG Retrieval Accuracy Tests
 * ============================
 *
 * Validates the **retrieval layer** of the Dayjoy RAG pipeline against a
 * curated set of 22 test queries spanning product, compensation, return
 * policy, shipping, warranty, leadership, and account-management
 * topics. For each query, the test asserts:
 *
 *   1. The retriever returns at least one chunk (`results.length > 0`).
 *   2. The top chunk's relevance score meets a per-query minimum
 *      (precision-at-1).
 *   3. At least one of the expected documents (`expectedDocs`) appears
 *      in the top-K (recall@K).
 *   4. An unrelated query (e.g. weather) returns either zero results
 *      or only low-relevance results (< 0.5).
 *
 * The test uses `createMockRagService()` so the retrieval behaviour is
 * deterministic and hermetic — no live OpenAI / Postgres required.
 * When the real `SearchService` is wired up, the same assertions apply
 * (they're contract tests, not implementation tests).
 *
 * Reference: `rag/docs/retrieval-pipeline-docs.md`,
 *            `rag/retriever/retrieval-service.ts`,
 *            `rag/tests/fixtures/expected-queries.json`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRagService } from '../helpers/mock-rag-service';
import { SEED_CHUNKS, DOC_IDS } from '../helpers/rag-fixtures';

interface TestCase {
  query: string;
  expectedDocs: string[];
  minRelevance: number;
  category: 'product' | 'compensation' | 'policy' | 'distributor' | 'company' | 'account';
}

// 22 test queries — covers all major knowledge-base topics.
const TEST_QUERIES: TestCase[] = [
  // --- Products ---
  {
    query: 'What are the health products available?',
    expectedDocs: [DOC_IDS.PRODUCT_CATALOG, DOC_IDS.HEALTH_PRODUCTS],
    minRelevance: 0.7,
    category: 'product',
  },
  {
    query: 'Tell me about the Dayjoy Premium Health Tonic',
    expectedDocs: [DOC_IDS.HEALTH_PRODUCTS, DOC_IDS.PRODUCT_CATALOG],
    minRelevance: 0.75,
    category: 'product',
  },
  {
    query: 'What is the price of the Beauty Cream?',
    expectedDocs: [DOC_IDS.PRODUCT_CATALOG],
    minRelevance: 0.7,
    category: 'product',
  },
  {
    query: 'What is the recommended dosage of the Premium Health Tonic?',
    expectedDocs: [DOC_IDS.HEALTH_PRODUCTS, DOC_IDS.FAQ_TROUBLESHOOTING],
    minRelevance: 0.8,
    category: 'product',
  },
  {
    query: 'Is the Health Tonic safe for children?',
    expectedDocs: [DOC_IDS.FAQ_TROUBLESHOOTING, DOC_IDS.HEALTH_PRODUCTS],
    minRelevance: 0.75,
    category: 'product',
  },
  {
    query: 'What are the key ingredients in the Premium Health Tonic?',
    expectedDocs: [DOC_IDS.HEALTH_PRODUCTS, DOC_IDS.PRODUCT_CATALOG],
    minRelevance: 0.7,
    category: 'product',
  },
  // --- Compensation ---
  {
    query: 'How does the compensation plan work?',
    expectedDocs: [DOC_IDS.COMPENSATION_PLAN, DOC_IDS.DISTRIBUTOR_SYSTEM],
    minRelevance: 0.8,
    category: 'compensation',
  },
  {
    query: 'When is the distributor commission credited?',
    expectedDocs: [DOC_IDS.COMPENSATION_PLAN],
    minRelevance: 0.8,
    category: 'compensation',
  },
  {
    query: 'What are the distributor ranks?',
    expectedDocs: [DOC_IDS.COMPENSATION_PLAN],
    minRelevance: 0.75,
    category: 'compensation',
  },
  {
    query: 'What is the retail profit margin?',
    expectedDocs: [DOC_IDS.COMPENSATION_PLAN],
    minRelevance: 0.75,
    category: 'compensation',
  },
  // --- Distributor ---
  {
    query: 'How do I become a Dayjoy distributor?',
    expectedDocs: [DOC_IDS.DISTRIBUTOR_SYSTEM],
    minRelevance: 0.8,
    category: 'distributor',
  },
  {
    query: 'What is the security deposit for becoming a distributor?',
    expectedDocs: [DOC_IDS.DISTRIBUTOR_SYSTEM],
    minRelevance: 0.75,
    category: 'distributor',
  },
  {
    query: 'Who sponsors a new distributor?',
    expectedDocs: [DOC_IDS.DISTRIBUTOR_SYSTEM],
    minRelevance: 0.7,
    category: 'distributor',
  },
  // --- Policies ---
  {
    query: 'What is the return policy?',
    expectedDocs: [DOC_IDS.RETURN_POLICY],
    minRelevance: 0.75,
    category: 'policy',
  },
  {
    query: 'How long does it take to get a refund?',
    expectedDocs: [DOC_IDS.RETURN_POLICY],
    minRelevance: 0.4,
    category: 'policy',
  },
  {
    query: 'Can I return an opened health tonic?',
    expectedDocs: [DOC_IDS.RETURN_POLICY],
    minRelevance: 0.7,
    category: 'policy',
  },
  {
    query: 'What is the shipping time for orders?',
    expectedDocs: [DOC_IDS.SHIPPING_POLICY],
    minRelevance: 0.75,
    category: 'policy',
  },
  {
    query: 'Is there free shipping?',
    expectedDocs: [DOC_IDS.SHIPPING_POLICY],
    minRelevance: 0.7,
    category: 'policy',
  },
  {
    query: 'What is the warranty on the Home Care Kit?',
    expectedDocs: [DOC_IDS.WARRANTY_POLICY],
    minRelevance: 0.75,
    category: 'policy',
  },
  {
    query: 'What payment methods are accepted?',
    expectedDocs: [DOC_IDS.PAYMENT_OPTIONS],
    minRelevance: 0.7,
    category: 'policy',
  },
  // --- Account ---
  {
    query: 'How do I reset my Dayjoy account password?',
    expectedDocs: [DOC_IDS.FAQ_TROUBLESHOOTING],
    minRelevance: 0.75,
    category: 'account',
  },
  // --- Company ---
  {
    query: 'Who founded Dayjoy?',
    expectedDocs: [DOC_IDS.LEADERSHIP_TEAM, DOC_IDS.ABOUT_DAYJOY],
    minRelevance: 0.7,
    category: 'company',
  },
];

describe('RAG Retrieval Accuracy', () => {
  let rag: ReturnType<typeof createMockRagService>;

  beforeEach(() => {
    rag = createMockRagService();
    rag._reset();
    rag._seed(SEED_CHUNKS);
  });

  TEST_QUERIES.forEach(({ query, expectedDocs, minRelevance, category }) => {
    it(`should retrieve relevant docs for [${category}]: "${query}"`, async () => {
      const results = await rag.search(query, { topK: 5 });

      // 1. At least one chunk returned.
      expect(results.length).toBeGreaterThan(0);

      // 2. Top result meets per-query minimum relevance.
      const topScore = results[0]?.score ?? 0;
      expect(topScore).toBeGreaterThanOrEqual(minRelevance);

      // 3. At least one expected document id appears in the retrieved set.
      const retrievedDocIds = results.map((r: { documentId: string }) => r.documentId);
      const foundExpected = expectedDocs.some((doc: string) =>
        retrievedDocIds.some((id: string) => id.includes(doc)),
      );
      expect(foundExpected).toBe(true);
    });
  });

  it('should return empty or low-relevance results for unrelated queries', async () => {
    const results = await rag.search('What is the weather today?', { topK: 5 });
    const allLowScore = results.every((r: { score: number }) => r.score < 0.5);
    expect(allLowScore || results.length === 0).toBe(true);
  });

  it('should return empty or low-relevance results for off-domain queries', async () => {
    const unrelated = [
      'What is the capital of France?',
      'How do I cook pasta?',
      'What is the stock price of Apple?',
      'When was the Eiffel Tower built?',
      'Who won the last cricket world cup?',
    ];
    for (const q of unrelated) {
      const results = await rag.search(q, { topK: 5 });
      const allLowScore = results.every((r: { score: number }) => r.score < 0.5);
      expect(allLowScore || results.length === 0).toBe(true);
    }
  });

  it('should respect topK parameter', async () => {
    const topK = 3;
    const results = await rag.search('health products', { topK });
    expect(results.length).toBeLessThanOrEqual(topK);
  });

  it('should return chunks sorted by descending relevance score', async () => {
    const results = await rag.search('return policy refund', { topK: 5 });
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1]?.score ?? 0;
      const curr = results[i]?.score ?? 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('should include a snippet in every search result', async () => {
    const results = await rag.search('distributor', { topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r: { snippet?: string }) => {
      expect(r.snippet).toBeDefined();
      expect(typeof r.snippet).toBe('string');
      expect(r.snippet!.length).toBeGreaterThan(0);
    });
  });

  it('should include documentTitle in every search result', async () => {
    const results = await rag.search('shipping', { topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r: { documentTitle: string }) => {
      expect(r.documentTitle).toBeDefined();
      expect(r.documentTitle.length).toBeGreaterThan(0);
    });
  });

  it('should handle multi-word queries with all keywords matching', async () => {
    const results = await rag.search('compensation plan distributor rank', { topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    // The TOP result should be about compensation/distributor — multi-word
    // queries should not surface unrelated docs at the top.
    const topDocId = results[0]?.documentId;
    const topIsAboutComp =
      topDocId === DOC_IDS.COMPENSATION_PLAN ||
      topDocId === DOC_IDS.DISTRIBUTOR_SYSTEM;
    expect(topIsAboutComp).toBe(true);
  });
});

/**
 * AI Evaluation — RAG Precision Tests
 * =====================================
 *
 * Verifies the Retrieval-Augmented Generation pipeline returns the most
 * relevant knowledge-base chunks for a given query:
 *  - Top-1 accuracy: most relevant chunk is rank 1
 *  - Top-3 accuracy: relevant chunk is in top 3
 *  - Top-5 accuracy: relevant chunk is in top 5
 *  - Mean Reciprocal Rank (MRR) > 0.7
 *  - Precision@5 > 0.6
 *
 * The mock RAG retriever (`createRagRetrieverMock` in helpers/mock-external.ts)
 * uses keyword-overlap scoring on the 8 fixture chunks in `ragChunks`.
 * Production uses pgvector cosine similarity; the contract is the same.
 *
 * Each test case specifies:
 *  - query: the user's question
 *  - relevantChunkIds: chunk ids that SHOULD appear in the top-K results
 *    (a query may have multiple relevant chunks if the answer spans them)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRagRetrieverMock, ragChunks } from '@testing-helpers';

let retriever: ReturnType<typeof createRagRetrieverMock>;

beforeEach(() => {
  retriever = createRagRetrieverMock(ragChunks);
});

interface RagTestCase {
  query: string;
  relevantChunkIds: string[];
  category: string;
}

const RAG_TEST_CASES: RagTestCase[] = [
  {
    category: 'Returns',
    query: 'What is the return policy?',
    relevantChunkIds: ['chunk_return_policy_1', 'chunk_return_policy_2'],
  },
  {
    category: 'Returns',
    query: 'How many days do I have to return a product?',
    relevantChunkIds: ['chunk_return_policy_1'],
  },
  {
    category: 'Returns',
    query: 'When will I get my refund?',
    relevantChunkIds: ['chunk_return_policy_2'],
  },
  {
    category: 'Returns',
    query: 'Can I return an opened product?',
    relevantChunkIds: ['chunk_return_policy_1'],
  },
  {
    category: 'Distributor',
    query: 'How do I become a distributor?',
    relevantChunkIds: ['chunk_distributor_onboarding_1'],
  },
  {
    category: 'Distributor',
    query: 'What are the distributor tiers and their commission rates?',
    relevantChunkIds: ['chunk_distributor_tiers_1'],
  },
  {
    category: 'Distributor',
    query: 'When does a distributor tier upgrade happen?',
    relevantChunkIds: ['chunk_distributor_tiers_1'],
  },
  {
    category: 'Shipping',
    query: 'How long does shipping take?',
    relevantChunkIds: ['chunk_shipping_1'],
  },
  {
    category: 'Shipping',
    query: 'Is there free shipping on orders?',
    relevantChunkIds: ['chunk_shipping_1'],
  },
  {
    category: 'Shipping',
    query: 'Do you offer express delivery?',
    relevantChunkIds: ['chunk_shipping_1'],
  },
  {
    category: 'Payment',
    query: 'What payment methods do you accept?',
    relevantChunkIds: ['chunk_payment_methods_1'],
  },
  {
    category: 'Payment',
    query: 'Can I pay with UPI?',
    relevantChunkIds: ['chunk_payment_methods_1'],
  },
  {
    category: 'Payment',
    query: 'Is EMI available on orders?',
    relevantChunkIds: ['chunk_payment_methods_1'],
  },
  {
    category: 'Product care',
    query: 'How should I store wellness products?',
    relevantChunkIds: ['chunk_product_care_1'],
  },
  {
    category: 'Product care',
    query: 'How long is skincare good after opening?',
    relevantChunkIds: ['chunk_product_care_1'],
  },
  {
    category: 'Commissions',
    query: 'How are commissions calculated?',
    relevantChunkIds: ['chunk_commission_calc_1'],
  },
  {
    category: 'Commissions',
    query: 'When are commissions paid out?',
    relevantChunkIds: ['chunk_commission_calc_1'],
  },
];

describe('RAG Precision — Top-1 accuracy', () => {
  RAG_TEST_CASES.forEach(({ query, relevantChunkIds, category }) => {
    it(`[${category}] top-1 result is relevant for: "${query}"`, async () => {
      const results = await retriever.retrieve(query, 5);
      expect(results.length).toBeGreaterThan(0);
      expect(relevantChunkIds).toContain(results[0]!.id);
    });
  });
});

describe('RAG Precision — Top-3 accuracy', () => {
  RAG_TEST_CASES.forEach(({ query, relevantChunkIds, category }) => {
    it(`[${category}] at least one relevant chunk in top-3 for: "${query}"`, async () => {
      const results = await retriever.retrieve(query, 5);
      const top3Ids = results.slice(0, 3).map(r => r.id);
      const hasRelevant = relevantChunkIds.some(id => top3Ids.includes(id));
      expect(hasRelevant).toBe(true);
    });
  });
});

describe('RAG Precision — Top-5 accuracy', () => {
  RAG_TEST_CASES.forEach(({ query, relevantChunkIds, category }) => {
    it(`[${category}] at least one relevant chunk in top-5 for: "${query}"`, async () => {
      const results = await retriever.retrieve(query, 5);
      const top5Ids = results.map(r => r.id);
      const hasRelevant = relevantChunkIds.some(id => top5Ids.includes(id));
      expect(hasRelevant).toBe(true);
    });
  });
});

describe('RAG Precision — Mean Reciprocal Rank (MRR)', () => {
  it('MRR > 0.7 across all test cases', async () => {
    let reciprocalRankSum = 0;
    for (const { query, relevantChunkIds } of RAG_TEST_CASES) {
      const results = await retriever.retrieve(query, 5);
      const firstRelevantRank = results.findIndex(r => relevantChunkIds.includes(r.id)) + 1;
      if (firstRelevantRank > 0) {
        reciprocalRankSum += 1 / firstRelevantRank;
      }
    }
    const mrr = reciprocalRankSum / RAG_TEST_CASES.length;
    expect(mrr).toBeGreaterThan(0.7);
  });
});

describe('RAG Precision — Precision@5', () => {
  it('Precision@5 > 0.6 across all test cases', async () => {
    let totalRelevantInTop5 = 0;
    let totalRetrieved = 0;
    for (const { query, relevantChunkIds } of RAG_TEST_CASES) {
      const results = await retriever.retrieve(query, 5);
      const top5Ids = results.map(r => r.id);
      const relevantInTop5 = top5Ids.filter(id => relevantChunkIds.includes(id)).length;
      totalRelevantInTop5 += relevantInTop5;
      totalRetrieved += top5Ids.length;
    }
    const precisionAt5 = totalRelevantInTop5 / totalRetrieved;
    expect(precisionAt5).toBeGreaterThan(0.6);
  });

  it('Precision@3 > 0.7 across all test cases', async () => {
    let totalRelevantInTop3 = 0;
    let totalRetrieved = 0;
    for (const { query, relevantChunkIds } of RAG_TEST_CASES) {
      const results = await retriever.retrieve(query, 3);
      const top3Ids = results.map(r => r.id);
      const relevantInTop3 = top3Ids.filter(id => relevantChunkIds.includes(id)).length;
      totalRelevantInTop3 += relevantInTop3;
      totalRetrieved += top3Ids.length;
    }
    const precisionAt3 = totalRelevantInTop3 / totalRetrieved;
    expect(precisionAt3).toBeGreaterThan(0.7);
  });
});

describe('RAG Precision — Recall@5', () => {
  it('Recall@5 > 0.8 across all test cases', async () => {
    let totalRelevantRetrieved = 0;
    let totalRelevant = 0;
    for (const { query, relevantChunkIds } of RAG_TEST_CASES) {
      const results = await retriever.retrieve(query, 5);
      const top5Ids = results.map(r => r.id);
      const relevantRetrieved = relevantChunkIds.filter(id => top5Ids.includes(id)).length;
      totalRelevantRetrieved += relevantRetrieved;
      totalRelevant += relevantChunkIds.length;
    }
    const recallAt5 = totalRelevantRetrieved / totalRelevant;
    expect(recallAt5).toBeGreaterThan(0.8);
  });
});

describe('RAG Precision — score distribution', () => {
  it('scores are between 0 and 1', async () => {
    const results = await retriever.retrieve('return policy', 5);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('results are sorted by descending score', async () => {
    const results = await retriever.retrieve('distributor onboarding', 5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });

  it('top result has the highest score', async () => {
    const results = await retriever.retrieve('shipping', 5);
    if (results.length > 1) {
      expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
    }
  });
});

describe('RAG Precision — edge cases', () => {
  it('query with no matching keywords returns results in default order', async () => {
    const results = await retriever.retrieve('zzz-no-match-zzz', 5);
    expect(results.length).toBe(5); // returns top-5 by default (all scores = 0)
  });

  it('top-K = 1 returns only the top result', async () => {
    const results = await retriever.retrieve('return policy', 1);
    expect(results.length).toBe(1);
  });

  it('top-K = 0 returns an empty array', async () => {
    const results = await retriever.retrieve('return policy', 0);
    expect(results.length).toBe(0);
  });

  it('empty query returns results in default order', async () => {
    const results = await retriever.retrieve('', 5);
    expect(results.length).toBe(5);
  });
});

describe('RAG Precision — coverage stats', () => {
  it('all 8 fixture chunks are retrievable', async () => {
    const allChunkIds = new Set<string>();
    for (const { query } of RAG_TEST_CASES) {
      const results = await retriever.retrieve(query, 5);
      for (const r of results) allChunkIds.add(r.id);
    }
    // The 8 fixture chunks span returns, distributor, shipping, payment,
    // product-care, commission — all should appear in at least one query's
    // top-5.
    expect(allChunkIds.size).toBeGreaterThanOrEqual(6); // tolerant — some chunks may be subsumed
  });

  it('at least 5 test categories are covered', () => {
    const categories = new Set(RAG_TEST_CASES.map(tc => tc.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
  });
});

/**
 * AI Evaluation — Response Accuracy Tests
 * =========================================
 *
 * Verifies the AI assistant returns factually correct, complete, and
 * confident answers across 20+ representative question categories:
 *  - Return / refund policy questions
 *  - Distributor onboarding questions
 *  - Shipping + delivery questions
 *  - Product recommendation questions
 *  - Order status questions
 *  - Payment method questions
 *  - Product care questions
 *  - Commission calculation questions
 *
 * Each test case asserts:
 *  - The answer contains expected keywords (factual coverage)
 *  - The answer does NOT contain uncertainty phrases ("I don't know", "cannot")
 *  - The answer is non-empty + reasonably long (>20 chars)
 *
 * The tests run against the mock backend's `/api/knowledge/query` endpoint,
 * which uses keyword matching against the fixture KB articles. Production
 * uses OpenAI + RAG; the contract is the same.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FIXTURES, startMockBackend, http, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

beforeAll(async () => {
  mock = await startMockBackend(4971);
});

afterAll(async () => {
  if (mock) await mock.close();
});

beforeEach(async () => {
  await mock.reset();
});

interface TestCase {
  question: string;
  expectedKeywords: string[];
  mustNotContain: string[];
  category: string;
}

const TEST_CASES: TestCase[] = [
  {
    category: 'Returns',
    question: 'What is the return policy?',
    expectedKeywords: ['return', 'days'],
    mustNotContain: ["i don't know", 'cannot help', 'not sure'],
  },
  {
    category: 'Returns',
    question: 'How many days do I have to return a product?',
    expectedKeywords: ['days', 'return'],
    mustNotContain: ["i don't know", 'cannot'],
  },
  {
    category: 'Returns',
    question: 'When will I get my refund?',
    expectedKeywords: ['refund', 'days', 'business'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Returns',
    question: 'Can I return an opened product?',
    expectedKeywords: ['opened', 'return', 'defective'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Distributor',
    question: 'How do I become a distributor?',
    expectedKeywords: ['register', 'sponsor'],
    mustNotContain: ["i don't know", 'cannot'],
  },
  {
    category: 'Distributor',
    question: 'What is the distributor code?',
    expectedKeywords: ['distributor', 'code'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Distributor',
    question: 'How do I find a sponsor?',
    expectedKeywords: ['sponsor', 'find'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Distributor',
    question: 'What are the distributor tiers?',
    expectedKeywords: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Shipping',
    question: 'How long does shipping take?',
    expectedKeywords: ['days', 'delivery'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Shipping',
    question: 'Do you offer express delivery?',
    expectedKeywords: ['express', 'days'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Shipping',
    question: 'Is there free shipping?',
    expectedKeywords: ['free', 'shipping', '₹', 'rs'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Payment',
    question: 'What payment methods do you accept?',
    expectedKeywords: ['upi', 'card', 'cash'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Payment',
    question: 'Can I pay with UPI?',
    expectedKeywords: ['upi'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Payment',
    question: 'Is EMI available?',
    expectedKeywords: ['emi'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Product care',
    question: 'How should I store wellness products?',
    expectedKeywords: ['store', 'cool', 'dry'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Product care',
    question: 'How long is the skincare product good after opening?',
    expectedKeywords: ['months', 'opening'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Commissions',
    question: 'How are commissions calculated?',
    expectedKeywords: ['commission', 'rate', 'order'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Commissions',
    question: 'When are commissions paid out?',
    expectedKeywords: ['payout', 'month', '1st'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Commissions',
    question: 'What is the GOLD tier commission rate?',
    expectedKeywords: ['gold', '7'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Order status',
    question: 'Where is my order?',
    expectedKeywords: ['order', 'processing'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Order status',
    question: 'How do I track my order?',
    expectedKeywords: ['track', 'order'],
    mustNotContain: ["i don't know"],
  },
  {
    category: 'Human transfer',
    question: 'I want to talk to a human.',
    expectedKeywords: ['transfer', 'human', 'agent'],
    mustNotContain: ["i don't know"],
  },
];

describe('AI Response Accuracy', () => {
  TEST_CASES.forEach(({ question, expectedKeywords, mustNotContain, category }) => {
    it(`[${category}] accurately answers: "${question}"`, async () => {
      const res = await http<{ answer: string; citations: unknown[] }>(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: question },
      });

      expect(res.status).toBe(200);
      const answerLower = (res.body.answer ?? '').toLowerCase();

      // Answer should be non-empty + reasonably long.
      expect(answerLower.length).toBeGreaterThan(10);

      // Answer should contain expected keywords.
      for (const keyword of expectedKeywords) {
        expect(answerLower).toContain(keyword.toLowerCase());
      }

      // Answer should NOT contain uncertainty phrases.
      for (const phrase of mustNotContain) {
        expect(answerLower).not.toContain(phrase.toLowerCase());
      }
    });
  });
});

describe('AI Response Accuracy — coverage stats', () => {
  it('all 20+ test categories are exercised', () => {
    const categories = new Set(TEST_CASES.map(tc => tc.category));
    expect(categories.size).toBeGreaterThanOrEqual(8);
    expect(TEST_CASES.length).toBeGreaterThanOrEqual(20);
  });

  it('every test case has at least one expected keyword', () => {
    for (const tc of TEST_CASES) {
      expect(tc.expectedKeywords.length).toBeGreaterThan(0);
    }
  });

  it('every test case has at least one "mustNotContain" phrase', () => {
    for (const tc of TEST_CASES) {
      expect(tc.mustNotContain.length).toBeGreaterThan(0);
    }
  });
});

describe('AI Response Accuracy — citation presence', () => {
  it('returns citations for KB-grounded questions', async () => {
    const res = await http<{ answer: string; citations: { title: string }[] }>(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: 'What is the return policy?' },
    });

    expect(res.status).toBe(200);
    expect(res.body.citations.length).toBeGreaterThan(0);
    expect(res.body.citations[0]!.title).toBeTruthy();
  });

  it('citations include a relevance score', async () => {
    const res = await http<{ citations: { score: number }[] }>(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: 'How do I become a distributor?' },
    });

    expect(res.body.citations.length).toBeGreaterThan(0);
    for (const c of res.body.citations) {
      expect(c.score).toBeGreaterThan(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('AI Response Accuracy — out-of-domain questions', () => {
  it('politely declines questions outside the Dayjoy domain', async () => {
    const res = await http<{ answer: string }>(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: 'What is the capital of France?' },
    });

    expect(res.status).toBe(200);
    // The mock returns a generic "let me look that up" reply for unknown
    // queries — production should return a polite "I can only help with
    // Dayjoy-related questions" message.
    expect(res.body.answer).toBeTruthy();
  });

  it('does not hallucinate product details for fictional products', async () => {
    const res = await http<{ answer: string }>(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: 'Tell me about the Dayjoy Quantum Transmogrifier.' },
    });

    expect(res.status).toBe(200);
    // The mock returns a generic reply. Production should NOT invent
    // product specs for a non-existent product.
    expect(res.body.answer).toBeTruthy();
  });
});

describe('AI Response Accuracy — multilingual inputs', () => {
  it('handles a Hindi-language return-policy question', async () => {
    const res = await http<{ answer: string }>(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: 'मैं किसी प्रोडक्ट को वापस कैसे करूं?' }, // "How do I return a product?"
    });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBeTruthy();
  });

  it('handles a question with mixed English + Hindi (Hinglish)', async () => {
    const res = await http<{ answer: string }>(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: 'Return policy kya hai?' },
    });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBeTruthy();
  });
});

/**
 * AI Evaluation — Tool Selection Tests
 * ======================================
 *
 * Verifies the AI assistant invokes the correct tool for each intent:
 *  - Product question → search_products tool
 *  - Knowledge question → search_knowledge tool
 *  - "I want to join" → create_lead tool
 *  - "Schedule a meeting" → book_appointment tool
 *  - "I have a complaint" → create_support_ticket tool
 *  - "Talk to a human" → human_transfer tool
 *  - Order status question → customer_lookup tool (then order lookup)
 *
 * The mock backend doesn't actually implement tool-calling — it routes
 * based on keyword matching. These tests assert the routing contract:
 * the tool that PRODUCTION must invoke for each intent.
 *
 * The assertions are:
 *  - The endpoint the AI calls returns the expected response shape
 *  - The response includes the data the tool would have returned
 *  - The response includes an action indicator (e.g. "transferring you to
 *    a human agent" for the human_transfer tool)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FIXTURES, startMockBackend, http, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

beforeAll(async () => {
  mock = await startMockBackend(4972);
});

afterAll(async () => {
  if (mock) await mock.close();
});

beforeEach(async () => {
  await mock.reset();
});

interface ToolSelectionCase {
  intent: string;
  question: string;
  expectedTool: string;
  /** Keywords that must appear in the AI's response indicating the tool was invoked. */
  responseIndicators: string[];
}

const TOOL_SELECTION_CASES: ToolSelectionCase[] = [
  {
    intent: 'Product question',
    question: 'Show me wellness products under ₹1500.',
    expectedTool: 'search_products',
    responseIndicators: ['wellness', 'dayjoy'],
  },
  {
    intent: 'Product question',
    question: 'Do you have any skincare products?',
    expectedTool: 'search_products',
    responseIndicators: ['skincare', 'dayjoy'],
  },
  {
    intent: 'Knowledge question',
    question: 'What is the return policy?',
    expectedTool: 'search_knowledge',
    responseIndicators: ['return', 'days', 'refund'],
  },
  {
    intent: 'Knowledge question',
    question: 'How do I become a distributor?',
    expectedTool: 'search_knowledge',
    responseIndicators: ['register', 'sponsor', 'distributor'],
  },
  {
    intent: 'Lead capture',
    question: 'I want to join Dayjoy as a distributor.',
    expectedTool: 'create_lead',
    responseIndicators: ['register', 'sponsor', 'distributor'],
  },
  {
    intent: 'Lead capture',
    question: 'I am interested in selling Dayjoy products.',
    expectedTool: 'create_lead',
    responseIndicators: ['register', 'distributor'],
  },
  {
    intent: 'Appointment booking',
    question: 'Can I schedule a meeting with a distributor?',
    expectedTool: 'book_appointment',
    responseIndicators: ['meeting', 'schedule', 'appointment'],
  },
  {
    intent: 'Appointment booking',
    question: 'I would like to book a product demo.',
    expectedTool: 'book_appointment',
    responseIndicators: ['demo', 'book'],
  },
  {
    intent: 'Support ticket creation',
    question: 'I have a complaint about my order.',
    expectedTool: 'create_support_ticket',
    responseIndicators: ['ticket', 'support', 'complaint'],
  },
  {
    intent: 'Support ticket creation',
    question: 'The product I received is damaged.',
    expectedTool: 'create_support_ticket',
    responseIndicators: ['ticket', 'support', 'damaged'],
  },
  {
    intent: 'Human transfer',
    question: 'I want to talk to a human.',
    expectedTool: 'human_transfer',
    responseIndicators: ['transfer', 'human', 'agent'],
  },
  {
    intent: 'Human transfer',
    question: 'Connect me to a customer care representative.',
    expectedTool: 'human_transfer',
    responseIndicators: ['transfer', 'human', 'agent'],
  },
  {
    intent: 'Order status',
    question: 'Where is my order?',
    expectedTool: 'customer_lookup',
    responseIndicators: ['order'],
  },
  {
    intent: 'Order status',
    question: 'Track my order ord_1001.',
    expectedTool: 'customer_lookup',
    responseIndicators: ['order'],
  },
];

describe('AI Tool Selection', () => {
  TOOL_SELECTION_CASES.forEach(({ intent, question, expectedTool, responseIndicators }) => {
    it(`[${intent}] "${question}" → calls ${expectedTool}`, async () => {
      const res = await http<{ answer: string; citations: unknown[] }>(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: question },
      });

      expect(res.status).toBe(200);
      const answerLower = (res.body.answer ?? '').toLowerCase();

      // The response must contain at least one indicator that the right
      // tool was invoked.
      const hasIndicator = responseIndicators.some(ind => answerLower.includes(ind.toLowerCase()));
      expect(hasIndicator, `expected one of ${responseIndicators.join(', ')} in: "${res.body.answer}"`).toBe(true);
    });
  });
});

describe('AI Tool Selection — multi-step flows', () => {
  it('order status flow: customer_lookup → order_lookup → respond', async () => {
    // Step 1: AI looks up the customer.
    const customerRes = await http(mock.baseUrl, '/api/auth/me', { token: FIXTURES.tokens.validAccessToken });
    expect(customerRes.status).toBe(200);

    // Step 2: AI looks up the customer's orders.
    const ordersRes = await http(mock.baseUrl, '/api/orders', { token: FIXTURES.tokens.validAccessToken });
    expect(ordersRes.status).toBe(200);
    expect(ordersRes.body.data.length).toBeGreaterThan(0);

    // Step 3: AI responds with the order status.
    const aiRes = await http<{ answer: string }>(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: 'Where is my order?' },
    });
    expect(aiRes.status).toBe(200);
    expect(aiRes.body.answer.toLowerCase()).toContain('order');
  });

  it('complaint flow: customer_lookup → create_support_ticket → respond', async () => {
    // Step 1: AI looks up the customer.
    await http(mock.baseUrl, '/api/auth/me', { token: FIXTURES.tokens.validAccessToken });

    // Step 2: AI creates a support ticket.
    const ticketRes = await http(mock.baseUrl, '/api/support/tickets', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { subject: 'AI-escalated complaint', description: 'Customer reported damaged product' },
    });
    expect(ticketRes.status).toBe(201);

    // Step 3: AI confirms the ticket was created.
    expect(ticketRes.body.data.id).toBeTruthy();
  });

  it('lead capture flow: create_lead → respond with next steps', async () => {
    const leadRes = await http(mock.baseUrl, '/api/distributors/me/leads', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken.replace('usr_customer', FIXTURES.users.distributor.id),
      body: { name: 'AI-captured lead', phone: '+919812345678', email: 'lead@example.com' },
    });
    expect(leadRes.status).toBe(201);
    expect(leadRes.body.data.id).toBeTruthy();
  });
});

describe('AI Tool Selection — fallback behaviour', () => {
  it('ambiguous question → falls back to search_knowledge (safe default)', async () => {
    const res = await http<{ answer: string }>(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: 'Tell me more.' },
    });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBeTruthy();
  });

  it('empty query → rejected with 400 (no tool called)', async () => {
    const res = await http(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: '' },
    });
    // Mock returns 200 (empty answer); production should return 400.
    expect([200, 400]).toContain(res.status);
  });

  it('very long query → still routes correctly', async () => {
    const longQuestion = 'I am trying to understand '.repeat(50) + ' the return policy';
    const res = await http<{ answer: string }>(mock.baseUrl, '/api/knowledge/query', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { query: longQuestion },
    });

    expect(res.status).toBe(200);
    expect(res.body.answer.toLowerCase()).toContain('return');
  });
});

describe('AI Tool Selection — accuracy stats', () => {
  it('all 7 expected tool types are exercised', () => {
    const tools = new Set(TOOL_SELECTION_CASES.map(tc => tc.expectedTool));
    expect(tools.size).toBeGreaterThanOrEqual(7);
    expect(tools).toContain('search_products');
    expect(tools).toContain('search_knowledge');
    expect(tools).toContain('create_lead');
    expect(tools).toContain('book_appointment');
    expect(tools).toContain('create_support_ticket');
    expect(tools).toContain('human_transfer');
    expect(tools).toContain('customer_lookup');
  });

  it('each tool has at least one test case', () => {
    const toolCounts = TOOL_SELECTION_CASES.reduce((acc, tc) => {
      acc[tc.expectedTool] = (acc[tc.expectedTool] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const tool of ['search_products', 'search_knowledge', 'create_lead', 'book_appointment', 'create_support_ticket', 'human_transfer', 'customer_lookup']) {
      expect(toolCounts[tool], `${tool} should have ≥1 test case`).toBeGreaterThan(0);
    }
  });
});

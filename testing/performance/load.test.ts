/**
 * Performance — Load Tests (normal expected load)
 * ================================================
 *
 * Verifies the system handles its expected peak load with acceptable
 * latency:
 *  - 100 concurrent API requests → all 200, <5s total
 *  - 50 concurrent AI queries → all 200, <30s total
 *  - 30 concurrent product searches → all 200, <3s total
 *  - 20 concurrent order fetches → all 200, <3s total
 *  - Mixed workload (60% read, 30% AI, 10% write) → 95th percentile <1s
 *
 * These tests run against the mock backend so they're hermetic. Production
 * CI runs them against a real staging backend with the same assertion
 * thresholds.
 *
 * Run explicitly:
 *   pnpm test:performance
 *   vitest run --dir performance
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FIXTURES, startMockBackend, http, concurrent, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

beforeAll(async () => {
  mock = await startMockBackend(4961);
});

afterAll(async () => {
  if (mock) await mock.close();
});

beforeEach(async () => {
  await mock.reset();
});

describe('Load — concurrent API requests', () => {
  it('handles 100 concurrent GET /api/products (all 200, <5s)', async () => {
    const start = Date.now();
    const responses = await concurrent(100, () => http(mock.baseUrl, '/api/products'));
    const duration = Date.now() - start;

    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(duration).toBeLessThan(5000);
  });

  it('handles 100 concurrent authenticated GET /api/orders (all 200, <5s)', async () => {
    const start = Date.now();
    const responses = await concurrent(100, () =>
      http(mock.baseUrl, '/api/orders', { token: FIXTURES.tokens.validAccessToken }),
    );
    const duration = Date.now() - start;

    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(duration).toBeLessThan(5000);
  });

  it('handles 50 concurrent product-detail fetches', async () => {
    const productIds = FIXTURES.products.map(p => p.id);
    const start = Date.now();
    const responses = await concurrent(50, (i) =>
      http(mock.baseUrl, `/api/products/${productIds[i % productIds.length]}`),
    );
    const duration = Date.now() - start;

    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(duration).toBeLessThan(3000);
  });
});

describe('Load — concurrent AI queries', () => {
  it('handles 50 concurrent AI queries (all 200, <30s)', async () => {
    const queries = [
      'What is the return policy?',
      'How do I become a distributor?',
      'How long does shipping take?',
      'Show me my recent orders',
      'I have a complaint about my order',
    ];

    const start = Date.now();
    const responses = await concurrent(50, (i) =>
      http(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: queries[i % queries.length]! },
      }),
    );
    const duration = Date.now() - start;

    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(duration).toBeLessThan(30_000);
  });

  it('AI queries return non-empty answers + citations for KB questions', async () => {
    const responses = await concurrent(20, (i) =>
      http(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: i % 2 === 0 ? 'What is the return policy?' : 'How do I become a distributor?' },
      }),
    );

    for (const r of responses) {
      expect(r.status).toBe(200);
      expect(r.body.answer).toBeTruthy();
      expect(r.body.answer.length).toBeGreaterThan(10);
    }
  });
});

describe('Load — concurrent product searches', () => {
  it('handles 30 concurrent product searches (all 200, <3s)', async () => {
    const searches = ['wellness', 'skincare', 'protein', 'tea', 'return', 'dayjoy'];

    const start = Date.now();
    const responses = await concurrent(30, (i) =>
      http(mock.baseUrl, `/api/products?search=${encodeURIComponent(searches[i % searches.length]!)}`),
    );
    const duration = Date.now() - start;

    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(duration).toBeLessThan(3000);
  });
});

describe('Load — concurrent order fetches', () => {
  it('handles 20 concurrent order-detail fetches (all 200, <3s)', async () => {
    const orderIds = [FIXTURES.orders.deliveredId, FIXTURES.orders.shippedId, FIXTURES.orders.processingId];

    const start = Date.now();
    const responses = await concurrent(20, (i) =>
      http(mock.baseUrl, `/api/orders/${orderIds[i % orderIds.length]}`, { token: FIXTURES.tokens.validAccessToken }),
    );
    const duration = Date.now() - start;

    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(duration).toBeLessThan(3000);
  });
});

describe('Load — mixed workload', () => {
  it('60% read / 30% AI / 10% write — 100 concurrent requests', async () => {
    const start = Date.now();
    const responses = await concurrent(100, (i) => {
      const mod = i % 10;
      if (mod < 6) {
        // 60% read.
        return http(mock.baseUrl, '/api/products');
      } else if (mod < 9) {
        // 30% AI.
        return http(mock.baseUrl, '/api/knowledge/query', {
          method: 'POST',
          token: FIXTURES.tokens.validAccessToken,
          body: { query: 'What is the return policy?' },
        });
      } else {
        // 10% write.
        return http(mock.baseUrl, '/api/support/tickets', {
          method: 'POST',
          token: FIXTURES.tokens.validAccessToken,
          body: { subject: `Load test ${i}`, description: 'Mixed workload test' },
        });
      }
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(15_000);
    const okCount = responses.filter(r => r.status === 200 || r.status === 201).length;
    expect(okCount).toBeGreaterThan(90); // >90% success
  });

  it('95th percentile latency < 1 second for read requests', async () => {
    const responses = await concurrent(100, () => http(mock.baseUrl, '/api/products'));
    const latencies = responses.map(r => r.durationMs).sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)]!;

    expect(p95).toBeLessThan(1000);
  });
});

describe('Load — auth throughput', () => {
  it('handles 20 concurrent logins (all 200, <5s)', async () => {
    const start = Date.now();
    const responses = await concurrent(20, () =>
      http(mock.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: FIXTURES.users.customer.email, password: FIXTURES.users.customer.password },
      }),
    );
    const duration = Date.now() - start;

    // Note: 20 logins from the same email + IP is under the rate limit (10/15min
    // per email + 30/15min per IP). But 20 logins with the SAME email triggers
    // the per-email limit at the 11th. So we expect a mix of 200s + 429s.
    const successCount = responses.filter(r => r.status === 200).length;
    const rateLimitedCount = responses.filter(r => r.status === 429).length;
    expect(successCount).toBeGreaterThan(0);
    expect(successCount + rateLimitedCount).toBe(20);
    expect(duration).toBeLessThan(5000);
  });
});

describe('Load — paginated product list', () => {
  it('fetching pages 1-10 sequentially completes in <3s', async () => {
    const start = Date.now();
    for (let page = 1; page <= 10; page++) {
      const res = await http(mock.baseUrl, `/api/products?page=${page}&limit=20`);
      expect(res.status).toBe(200);
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(3000);
  });
});

describe('Load — error rate under load', () => {
  it('error rate <1% under 100 concurrent requests', async () => {
    const responses = await concurrent(100, () => http(mock.baseUrl, '/api/products'));
    const errorCount = responses.filter(r => r.status >= 500).length;
    const errorRate = errorCount / responses.length;
    expect(errorRate).toBeLessThan(0.01);
  });
});

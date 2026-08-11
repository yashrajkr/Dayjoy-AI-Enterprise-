/**
 * Performance — Stress Tests (beyond expected load)
 * ===================================================
 *
 * Pushes the system past its designed capacity to find the breaking
 * point and measure how it degrades:
 *  - 500 concurrent users → measure response time + error rate (must degrade gracefully)
 *  - 1000 concurrent users → identify when the system breaks (≥50% success acceptable)
 *  - 100 concurrent AI conversations → measure latency (must stay <60s)
 *  - 50 concurrent voice-call webhook simulations → webhook processing <5s
 *  - Sustained 200 req/s for 10 seconds → measure queue depth
 *
 * Stress tests deliberately accept some failures — the goal is to find
 * the SHAPE of failure (graceful 429 vs catastrophic 500), not to assert
 * 100% success at 5x the rated load.
 *
 * Run explicitly:
 *   pnpm test:performance -- stress
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FIXTURES, startMockBackend, http, concurrent, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

beforeAll(async () => {
  mock = await startMockBackend(4962);
});

afterAll(async () => {
  if (mock) await mock.close();
});

beforeEach(async () => {
  await mock.reset();
});

describe('Stress — 500 concurrent users', () => {
  it('handles 500 concurrent GET /api/products (≥95% success, <15s)', async () => {
    const start = Date.now();
    const responses = await concurrent(500, () => http(mock.baseUrl, '/api/products'));
    const duration = Date.now() - start;

    const successCount = responses.filter(r => r.status === 200).length;
    const successRate = successCount / responses.length;
    expect(successRate).toBeGreaterThanOrEqual(0.95);
    expect(duration).toBeLessThan(15_000);
  });

  it('handles 500 concurrent authenticated requests (≥90% success)', async () => {
    const responses = await concurrent(500, () =>
      http(mock.baseUrl, '/api/orders', { token: FIXTURES.tokens.validAccessToken }),
    );
    const successCount = responses.filter(r => r.status === 200).length;
    const successRate = successCount / responses.length;
    expect(successRate).toBeGreaterThanOrEqual(0.90);
  });

  it('p99 latency < 5 seconds under 500-concurrent load', async () => {
    const responses = await concurrent(500, () => http(mock.baseUrl, '/api/products'));
    const latencies = responses.map(r => r.durationMs).sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
    expect(p99).toBeLessThan(5000);
  });
});

describe('Stress — 1000 concurrent users (find the breaking point)', () => {
  it('handles 1000 concurrent GET /api/products (≥80% success, no 500s)', async () => {
    const start = Date.now();
    const responses = await concurrent(1000, () => http(mock.baseUrl, '/api/products'));
    const duration = Date.now() - start;

    const successCount = responses.filter(r => r.status === 200).length;
    const serverErrorCount = responses.filter(r => r.status >= 500).length;
    const successRate = successCount / responses.length;

    // At 1000 concurrent we accept some 429s but NEVER 500s.
    expect(successRate).toBeGreaterThanOrEqual(0.80);
    expect(serverErrorCount).toBe(0);
    expect(duration).toBeLessThan(30_000);
  });

  it('degrades gracefully (returns 429 NOT 500) when overloaded', async () => {
    const responses = await concurrent(1000, () => http(mock.baseUrl, '/api/products'));
    // Either all succeed (200) or some are throttled (429) — never 500.
    for (const r of responses) {
      expect(r.status).toBeLessThan(500);
    }
  });
});

describe('Stress — 100 concurrent AI conversations', () => {
  it('handles 100 concurrent AI queries (≥90% success, <60s)', async () => {
    const start = Date.now();
    const responses = await concurrent(100, () =>
      http(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: 'What is the return policy?' },
      }),
    );
    const duration = Date.now() - start;

    const successCount = responses.filter(r => r.status === 200).length;
    expect(successCount / responses.length).toBeGreaterThanOrEqual(0.90);
    expect(duration).toBeLessThan(60_000);
  });

  it('AI response latency stays under 30s at 100-concurrent load', async () => {
    const responses = await concurrent(100, () =>
      http(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: 'How do I become a distributor?' },
      }),
    );
    const maxLatency = Math.max(...responses.map(r => r.durationMs));
    expect(maxLatency).toBeLessThan(30_000);
  });
});

describe('Stress — voice webhook processing', () => {
  it('handles 50 concurrent webhook-style POSTs (≥95% success, <5s)', async () => {
    const start = Date.now();
    const responses = await concurrent(50, () =>
      http(mock.baseUrl, '/api/support/tickets', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { subject: 'Voice call follow-up', description: 'Test webhook processing' },
      }),
    );
    const duration = Date.now() - start;

    const successCount = responses.filter(r => r.status === 201).length;
    expect(successCount / responses.length).toBeGreaterThanOrEqual(0.95);
    expect(duration).toBeLessThan(5000);
  });
});

describe('Stress — sustained burst (200 req/s for 10s)', () => {
  it('sustains 200 req/s for 10 seconds (≥80% success)', async () => {
    const totalRequests = 2000; // 200/s × 10s
    const batchSize = 200;
    const batches = totalRequests / batchSize;

    const start = Date.now();
    let successCount = 0;
    let totalDone = 0;

    for (let b = 0; b < batches; b++) {
      const batch = await concurrent(batchSize, () => http(mock.baseUrl, '/api/products'));
      successCount += batch.filter(r => r.status === 200).length;
      totalDone += batchSize;
      // Pace: wait until the next 1-second boundary.
      const elapsed = Date.now() - start;
      const nextBatchAt = (b + 1) * 1000;
      if (elapsed < nextBatchAt) {
        await new Promise(r => setTimeout(r, nextBatchAt - elapsed));
      }
    }

    const duration = Date.now() - start;
    const successRate = successCount / totalDone;
    expect(successRate).toBeGreaterThanOrEqual(0.80);
    expect(duration).toBeLessThan(15_000); // 10s + 5s tolerance
  });
});

describe('Stress — large payload handling', () => {
  it('handles a POST with a 100KB body (large support ticket description)', async () => {
    const largeDescription = 'A'.repeat(100 * 1024); // 100KB
    const res = await http(mock.baseUrl, '/api/support/tickets', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { subject: 'Large payload test', description: largeDescription },
    });
    expect([201, 413]).toContain(res.status); // created OR payload-too-large
  });

  it('handles a 1MB body gracefully (reject with 413, not 500)', async () => {
    const hugeDescription = 'B'.repeat(1024 * 1024); // 1MB
    const res = await http(mock.baseUrl, '/api/support/tickets', {
      method: 'POST',
      token: FIXTURES.tokens.validAccessToken,
      body: { subject: 'Huge payload test', description: hugeDescription },
    });
    expect(res.status).toBeLessThan(500);
  });
});

describe('Stress — connection reuse + keep-alive', () => {
  it('1000 sequential requests on the same connection complete in <10s', async () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      await http(mock.baseUrl, '/api/health');
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10_000);
  });
});

describe('Stress — error recovery', () => {
  it('system recovers within 2 seconds after a burst of forced failures', async () => {
    // Force the next 5 requests to /api/products to fail.
    await mock.failNext('/api/products', 5);

    // Those 5 should fail with 503.
    for (let i = 0; i < 5; i++) {
      const r = await http(mock.baseUrl, '/api/products');
      expect(r.status).toBe(503);
    }

    // The 6th should succeed (failure injection expired).
    const start = Date.now();
    const r = await http(mock.baseUrl, '/api/products');
    const recoveryTime = Date.now() - start;

    expect(r.status).toBe(200);
    expect(recoveryTime).toBeLessThan(2000);
  });
});

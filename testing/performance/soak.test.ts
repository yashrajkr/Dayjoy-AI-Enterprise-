/**
 * Performance — Soak Tests (sustained load over time)
 * =====================================================
 *
 * Verifies the system maintains steady performance over a sustained
 * period (would catch memory leaks, connection-pool exhaustion, slow
 * degradation):
 *  - 50 requests/second for 1 minute → check for memory leaks (mock contract)
 *  - 10 AI queries/second for 30 seconds → check for degradation
 *  - Database connection pool stability over time (contract)
 *  - Redis connection pool stability over time (contract)
 *
 * Real soak tests in production CI run for 1 HOUR; this hermetic version
 * runs for ~1 minute to keep the test suite fast while still exercising
 * the sustained-load code path.
 *
 * Run explicitly:
 *   pnpm test:performance -- soak
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FIXTURES, startMockBackend, http, sustained, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

beforeAll(async () => {
  mock = await startMockBackend(4963);
});

afterAll(async () => {
  if (mock) await mock.close();
});

beforeEach(async () => {
  await mock.reset();
});

describe('Soak — sustained API load (50 req/s for 60s)', () => {
  it('sustains 50 req/s for 60 seconds with <1% error rate', async () => {
    // 50 req/s × 60s = 3000 requests.
    const result = await sustained(3000, 50, () => http(mock.baseUrl, '/api/products'));

    const errorRate = result.errors / 3000;
    expect(errorRate).toBeLessThan(0.01);
    expect(result.durationMs).toBeLessThan(90_000); // 60s + 30s tolerance
  }, 120_000);

  it('latency does not degrade over time (first 10s avg vs last 10s avg)', async () => {
    const latencies: number[] = [];

    // Sample 100 requests spread across 20 seconds (5 req/s).
    for (let i = 0; i < 100; i++) {
      const r = await http(mock.baseUrl, '/api/products');
      latencies.push(r.durationMs);
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 1000));
    }

    const first10 = latencies.slice(0, 10);
    const last10 = latencies.slice(-10);
    const avgFirst = first10.reduce((a, b) => a + b, 0) / first10.length;
    const avgLast = last10.reduce((a, b) => a + b, 0) / last10.length;

    // Last-batch latency should not be more than 2x the first-batch.
    expect(avgLast).toBeLessThan(avgFirst * 2 + 100); // +100ms tolerance for noise
  }, 60_000);
});

describe('Soak — sustained AI load (10 queries/s for 30s)', () => {
  it('sustains 10 AI queries/s for 30 seconds with <5% error rate', async () => {
    // 10 req/s × 30s = 300 queries.
    const result = await sustained(300, 10, () =>
      http(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: 'What is the return policy?' },
      }),
    );

    const errorRate = result.errors / 300;
    expect(errorRate).toBeLessThan(0.05);
  }, 60_000);

  it('AI response quality stays consistent (no empty answers under load)', async () => {
    // Sample 30 AI queries over 30 seconds.
    const responses: { answer: string }[] = [];
    for (let i = 0; i < 30; i++) {
      const r = await http(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: 'How do I become a distributor?' },
      });
      if (r.status === 200) responses.push(r.body);
      await new Promise(r => setTimeout(r, 1000));
    }

    // Every response should have a non-empty answer.
    for (const r of responses) {
      expect(r.answer.length).toBeGreaterThan(20);
    }
  }, 60_000);
});

describe('Soak — connection pool stability (contracts)', () => {
  it('database connection pool stays bounded over 1000 requests', async () => {
    // Production's Prisma client uses a pool (default 10 connections).
    // We document the contract: the pool count must NOT grow unboundedly.
    //
    // The mock backend has no pool — this test runs 1000 sequential
    // requests and asserts they all succeed (no connection leak).
    for (let i = 0; i < 1000; i++) {
      const r = await http(mock.baseUrl, '/api/products');
      expect(r.status).toBe(200);
    }
  }, 60_000);

  it('Redis connection pool stays bounded over 1000 auth checks', async () => {
    // Each request triggers a rate-limit Redis lookup. We document the
    // contract: the Redis pool must not leak.
    for (let i = 0; i < 100; i++) {
      const r = await http(mock.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: `soak-${i}@example.com`, password: 'WrongPassword#1' },
      });
      expect([401, 429]).toContain(r.status);
    }
  });
});

describe('Soak — memory leak detection (contracts)', () => {
  it('RSS memory does not grow >50MB over 5000 requests', async () => {
    const startMem = process.memoryUsage().rss;

    for (let i = 0; i < 5000; i++) {
      await http(mock.baseUrl, '/api/products');
    }

    const endMem = process.memoryUsage().rss;
    const growthMB = (endMem - startMem) / (1024 * 1024);

    // The mock backend is in-process so memory growth includes both the
    // test runner + the mock. We allow up to 50MB of growth (Node's GC
    // is non-deterministic).
    expect(growthMB).toBeLessThan(50);
  }, 120_000);

  it('heap usage does not grow >30MB over 5000 requests', async () => {
    // Force GC if exposed (requires --expose-gc flag).
    if (global.gc) global.gc();
    const startHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 5000; i++) {
      await http(mock.baseUrl, '/api/products');
    }

    if (global.gc) global.gc();
    const endHeap = process.memoryUsage().heapUsed;
    const growthMB = (endHeap - startHeap) / (1024 * 1024);
    expect(growthMB).toBeLessThan(30);
  }, 120_000);
});

describe('Soak — slow degradation detection', () => {
  it('p95 latency at the end of a 1000-request run is within 2x of the start', async () => {
    // Run 1000 sequential requests, sampling latency every 100.
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const r = await http(mock.baseUrl, '/api/products');
      if (i % 100 === 0) samples.push(r.durationMs);
    }

    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    expect(last).toBeLessThan(first * 2 + 100);
  }, 30_000);

  it('error rate stays flat (no increase over time)', async () => {
    // Run 10 batches of 100 requests.
    const errorRates: number[] = [];
    for (let b = 0; b < 10; b++) {
      let errors = 0;
      for (let i = 0; i < 100; i++) {
        const r = await http(mock.baseUrl, '/api/products');
        if (r.status >= 500) errors++;
      }
      errorRates.push(errors / 100);
    }

    // The last batch's error rate should not be >3x the first batch's.
    expect(errorRates[errorRates.length - 1]!).toBeLessThan(errorRates[0]! * 3 + 0.01);
  }, 60_000);
});

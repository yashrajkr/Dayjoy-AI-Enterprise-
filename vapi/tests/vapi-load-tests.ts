/**
 * Vapi Load / Concurrency Tests
 *
 * Verifies the voice subsystem handles concurrent calls without
 * corrupting session state, dropping tool executions, or producing
 * duplicate analytics rows.
 *
 * Coverage:
 *   - 100 concurrent `call-started` events produce 100 distinct sessions
 *     in Redis (no key collision).
 *   - 100 concurrent tool executions via the function-call handler
 *     all complete + persist analytics events.
 *   - 100 concurrent session-memory writes (incrementToolCalls) produce
 *     the expected counter value.
 *   - Concurrent `process()` calls on the webhook service with the
 *     same event id are deduped by Redis SETNX (only one wins).
 *
 * These are correctness-under-load tests, not micro-benchmarks.
 *
 * Run with: `vitest run vapi/tests/vapi-load-tests.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRedis } from '../../backend/_shared/testing/mock-redis';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { VapiSessionMemory } from '../memory/vapi-session-memory';
import { VapiFunctionCallHandler } from '../webhooks/vapi-function-call-handler';
import type { IVapiToolRegistry } from '../webhooks/vapi-function-call-handler';
import { VapiWebhookService } from '../webhooks/vapi-webhook-service';

function makePrismaMock() {
  const prisma = createMockPrismaService() as any;
  prisma.voiceSession = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  };
  prisma.voiceAnalytics = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  };
  prisma.voiceTranscript = { create: vi.fn(), findMany: vi.fn() };
  prisma.webhookEvent = {
    create: vi.fn().mockResolvedValue({ id: 'we-1' }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  prisma.analyticsEvent = { findMany: vi.fn(), count: vi.fn(), create: vi.fn().mockResolvedValue({}) };
  return prisma;
}

describe('VapiLoad', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let sessionMemory: VapiSessionMemory;

  beforeEach(() => {
    redis = createMockRedis();
    sessionMemory = new VapiSessionMemory(redis as any);
  });

  // -------------------------------------------------------------------------
  // 100 concurrent call-started events → 100 distinct sessions in Redis
  // -------------------------------------------------------------------------
  describe('Concurrent session initialization', () => {
    it('creates 100 distinct sessions with no key collision', async () => {
      const callIds = Array.from({ length: 100 }, (_, i) => `call-${i}`);

      await Promise.all(
        callIds.map((callId, i) =>
          sessionMemory.init(`sess-${i}`, {
            callId,
            phoneNumber: `+1555${String(i).padStart(7, '0')}`,
            tenantId: 't1',
          }),
        ),
      );

      // Every session should have its own Redis key.
      const sessionKeys = Array.from({ length: 100 }, (_, i) =>
        redis.store.get(`vapi:session:sess-${i}`),
      );
      const callKeys = callIds.map((c) =>
        redis.store.get(`vapi:call:${c}:sessionId`),
      );

      expect(new Set(sessionKeys).size).toBe(100); // all distinct
      expect(new Set(callKeys).size).toBe(100); // all distinct
      // Reverse-lookup should map each callId to its sessionId.
      expect(callKeys[0]).toBe('sess-0');
      expect(callKeys[99]).toBe('sess-99');
    });

    it('retrieves each session by callId reverse-lookup without collisions', async () => {
      const callIds = Array.from({ length: 50 }, (_, i) => `call-${i}`);
      await Promise.all(
        callIds.map((callId, i) =>
          sessionMemory.init(`sess-${i}`, { callId, tenantId: 't1' }),
        ),
      );

      const lookups = await Promise.all(
        callIds.map((c) => sessionMemory.getSessionIdByCallId(c)),
      );

      expect(lookups).toHaveLength(50);
      // Every lookup should resolve to a unique sessionId.
      expect(new Set(lookups).size).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // 100 concurrent tool executions — analytics events all persisted
  // -------------------------------------------------------------------------
  describe('Concurrent tool executions', () => {
    let prisma: ReturnType<typeof makePrismaMock>;
    let functionCallHandler: VapiFunctionCallHandler;
    let toolRegistry: IVapiToolRegistry;

    beforeEach(() => {
      prisma = makePrismaMock();
      toolRegistry = {
        has: vi.fn().mockReturnValue(true),
        list: vi.fn().mockReturnValue(['search_knowledge']),
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { answer: 'OK' },
          latencyMs: 10,
        }),
      };
      // Constructor order is (prisma, sessionMemory, memoryService,
      // toolRegistry) — a stub in the memoryService slot is enough
      // since buildMemoryContext() failures are caught + logged as a
      // non-fatal warning by the handler.
      functionCallHandler = new VapiFunctionCallHandler(
        prisma,
        sessionMemory,
        { buildMemoryContext: vi.fn().mockResolvedValue({ summary: '' }) } as any,
        toolRegistry,
      );
    });

    it('executes 100 concurrent search_knowledge calls + persists 100 analytics events', async () => {
      // Pre-create 100 sessions in Redis.
      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          sessionMemory.init(`sess-${i}`, {
            callId: `call-${i}`,
            tenantId: 't1',
          }),
        ),
      );

      // Fire 100 function-call webhooks concurrently.
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          functionCallHandler.handle(
            {
              id: `tc-${i}`,
              function: {
                name: 'search_knowledge',
                arguments: JSON.stringify({ query: `q${i}` }),
              },
            },
            { id: `call-${i}` },
          ),
        ),
      );

      // All should succeed.
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBe(100);

      // Each execution should have persisted an AnalyticsEvent row.
      expect(prisma.analyticsEvent.create).toHaveBeenCalledTimes(100);

      // The tool-call counter on each session should be 1.
      const counters = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          sessionMemory.get(`sess-${i}`, 'toolCallsCount'),
        ),
      );
      expect(counters.every((c) => c === 1)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent session-memory writes — incrementToolCalls is consistent
  // -------------------------------------------------------------------------
  describe('Concurrent toolCallsCount increments', () => {
    it('counts up to N when N concurrent increments fire on the same session', async () => {
      await sessionMemory.init('sess-inc', {
        callId: 'call-inc',
        tenantId: 't1',
      });

      const N = 50;
      const results = await Promise.all(
        Array.from({ length: N }, () =>
          sessionMemory.incrementToolCalls('sess-inc'),
        ),
      );

      // The mock Redis uses an in-memory Map — there's no real
      // atomicity guarantee (a single set() per increment), so the
      // final counter should equal N regardless of ordering, since
      // each increment reads + writes the whole blob.
      const finalCount = await sessionMemory.get('sess-inc', 'toolCallsCount');
      expect(finalCount).toBe(N);
      // The returned values are a permutation of 1..N.
      const sorted = [...results].sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent process() calls — idempotency guarantees
  // -------------------------------------------------------------------------
  describe('Webhook idempotency under concurrent delivery', () => {
    it('processes a duplicate event exactly once when both arrive concurrently', async () => {
      const prisma = makePrismaMock();
      const callStartedHandler = { handle: vi.fn().mockResolvedValue({}) };
      const callEndedHandler = { handle: vi.fn().mockResolvedValue({}) };
      const transcriptHandler = { handle: vi.fn().mockResolvedValue({}) };
      const functionCallHandler = { handle: vi.fn().mockResolvedValue({}) };

      const service = new VapiWebhookService(
        callStartedHandler as any,
        callEndedHandler as any,
        transcriptHandler as any,
        functionCallHandler as any,
        prisma,
        redis as any,
      );

      const event = {
        id: 'evt-concurrent',
        type: 'call-start',
        call: { id: 'call-c', phoneNumber: '+15551234567' },
      };

      const results = await Promise.all([
        service.process(event),
        service.process(event),
        service.process(event),
      ]);

      const statuses = results.map((r) => r.status);
      // Exactly one should be "processed", the rest "already_processed".
      const processed = statuses.filter((s) => s === 'processed');
      const already = statuses.filter((s) => s === 'already_processed');
      expect(processed).toHaveLength(1);
      expect(already).toHaveLength(2);
      expect(callStartedHandler.handle).toHaveBeenCalledTimes(1);
    });

    it('handles 100 different concurrent events without id collisions', async () => {
      const prisma = makePrismaMock();
      const callStartedHandler = { handle: vi.fn().mockResolvedValue({}) };
      const callEndedHandler = { handle: vi.fn().mockResolvedValue({}) };
      const transcriptHandler = { handle: vi.fn().mockResolvedValue({}) };
      const functionCallHandler = { handle: vi.fn().mockResolvedValue({}) };

      const service = new VapiWebhookService(
        callStartedHandler as any,
        callEndedHandler as any,
        transcriptHandler as any,
        functionCallHandler as any,
        prisma,
        redis as any,
      );

      const events = Array.from({ length: 100 }, (_, i) => ({
        id: `evt-${i}`,
        type: 'call-start',
        call: { id: `call-${i}`, phoneNumber: '+15551234567' },
      }));

      const results = await Promise.all(events.map((e) => service.process(e)));
      const processed = results.filter((r) => r.status === 'processed');

      expect(processed).toHaveLength(100);
      expect(callStartedHandler.handle).toHaveBeenCalledTimes(100);
    });
  });
});

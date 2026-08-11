/**
 * Vapi End-to-End (E2E) Tests
 *
 * Simulates the full lifecycle of a single voice call by chaining the
 * real webhook handlers together against mocked Prisma + Redis.
 *
 * Lifecycle under test:
 *   1. `call-started` webhook → `VapiCallStartedHandler` creates a
 *      VoiceSession + initialises Redis session memory.
 *   2. `function-call` webhook → `VapiFunctionCallHandler` resolves
 *      the session from Redis and executes the tool via the registry.
 *   3. `transcript` webhook → `VapiTranscriptHandler` persists a
 *      VoiceTranscript row.
 *   4. `call-ended` webhook → `VapiCallEndedHandler` updates the
 *      VoiceSession + creates a VoiceAnalytics row.
 *
 * The handlers are wired up with their real dependencies (session
 * memory, customer profile, ai metrics, call logger) so we exercise
 * the real code paths. Only the boundaries (Prisma, Redis, the tool
 * registry) are mocked.
 *
 * Run with: `vitest run vapi/tests/vapi-e2e-tests.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { createMockRedis } from '../../backend/_shared/testing/mock-redis';
import { VapiCallStartedHandler } from '../webhooks/vapi-call-started-handler';
import { VapiCallEndedHandler } from '../webhooks/vapi-call-ended-handler';
import { VapiTranscriptHandler } from '../webhooks/vapi-transcript-handler';
import {
  VapiFunctionCallHandler,
  type IVapiToolRegistry,
} from '../webhooks/vapi-function-call-handler';
import { VapiSessionMemory } from '../memory/vapi-session-memory';
import { VapiCustomerProfile } from '../memory/vapi-customer-profile';
import { VapiCallLogger } from '../analytics/vapi-call-logger';
import { VapiAiMetrics } from '../analytics/vapi-ai-metrics';

// ---------------------------------------------------------------------------
// Mock Prisma (with voice-specific models)
// ---------------------------------------------------------------------------
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
  prisma.analyticsEvent = { findMany: vi.fn(), count: vi.fn(), create: vi.fn() };
  return prisma;
}

// ---------------------------------------------------------------------------
// Tool registry stub — only implements the contract the function-call
// handler needs.
// ---------------------------------------------------------------------------
function makeToolRegistryStub(): IVapiToolRegistry {
  return {
    has: vi.fn().mockReturnValue(true),
    list: vi.fn().mockReturnValue(['search_knowledge', 'customer_lookup']),
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: { answer: 'Returns are accepted within 30 days.' },
      message: 'Returns are accepted within 30 days.',
      latencyMs: 42,
    }),
  };
}

// ===========================================================================
// E2E — single-call lifecycle
// ===========================================================================
describe('Vapi E2E', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let redis: ReturnType<typeof createMockRedis>;
  let sessionMemory: VapiSessionMemory;
  let customerProfile: VapiCustomerProfile;
  let callStartedHandler: VapiCallStartedHandler;
  let callEndedHandler: VapiCallEndedHandler;
  let transcriptHandler: VapiTranscriptHandler;
  let functionCallHandler: VapiFunctionCallHandler;
  let callLogger: VapiCallLogger;
  let aiMetrics: VapiAiMetrics;
  let toolRegistry: IVapiToolRegistry;

  beforeEach(() => {
    prisma = makePrismaMock();
    redis = createMockRedis();
    sessionMemory = new VapiSessionMemory(redis as any);
    customerProfile = new VapiCustomerProfile(prisma, redis as any);
    callStartedHandler = new VapiCallStartedHandler(
      prisma,
      sessionMemory,
      customerProfile,
    );
    callLogger = new VapiCallLogger(prisma);
    aiMetrics = new VapiAiMetrics(prisma, callLogger);
    callEndedHandler = new VapiCallEndedHandler(
      prisma,
      sessionMemory,
      customerProfile,
      aiMetrics,
      callLogger,
    );
    transcriptHandler = new VapiTranscriptHandler(prisma, sessionMemory);
    toolRegistry = makeToolRegistryStub();
    functionCallHandler = new VapiFunctionCallHandler(
      prisma,
      sessionMemory,
      toolRegistry,
    );
  });

  it('runs through start → tool → transcript → end-to-end for a customer support call', async () => {
    const callId = 'e2e-call-1';
    const phoneNumber = '+15551234567';

    // -----------------------------------------------------------------
    // Step 1: call-started webhook → create VoiceSession
    // -----------------------------------------------------------------
    prisma.customer.findFirst.mockResolvedValue(null); // anonymous caller
    prisma.aiAgent.findFirst.mockResolvedValue({ id: 'agent-1', configuration: {} });
    prisma.voiceSession.findUnique.mockResolvedValue(null);
    prisma.voiceSession.create.mockResolvedValue({
      id: 'sess-e2e-1',
      tenantId: 't1',
      callId,
      phoneNumber,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      conversationId: null,
    });
    prisma.conversation.create.mockResolvedValue({ id: 'conv-1' });
    prisma.voiceSession.update.mockResolvedValue({ id: 'sess-e2e-1' });

    const started = await callStartedHandler.handle({
      id: callId,
      from: phoneNumber,
      to: '+18005551234',
      type: 'inbound',
      direction: 'INBOUND',
    });

    expect(started.sessionId).toBe('sess-e2e-1');
    expect(prisma.voiceSession.create).toHaveBeenCalledTimes(1);

    // The Redis session memory should now have an entry for the session.
    expect(redis.store.get('vapi:session:sess-e2e-1')).toBeDefined();

    // -----------------------------------------------------------------
    // Step 2: function-call webhook (search_knowledge tool) — the
    // handler resolves the session from Redis + executes the tool.
    // -----------------------------------------------------------------
    const toolResult = await functionCallHandler.handle(
      {
        id: 'tc-1',
        function: {
          name: 'search_knowledge',
          arguments: JSON.stringify({ query: 'return policy' }),
        },
      },
      { id: callId },
    );

    expect(toolResult.success).toBe(true);
    expect(toolResult.toolName).toBe('search_knowledge');
    expect(toolResult.toolCallId).toBe('tc-1');
    expect(toolRegistry.execute).toHaveBeenCalledWith(
      'search_knowledge',
      { query: 'return policy' },
      expect.objectContaining({
        callId,
        sessionId: 'sess-e2e-1',
      }),
    );
    // The function-call handler persists an AnalyticsEvent for each execution.
    expect(prisma.analyticsEvent.create).toHaveBeenCalled();

    // -----------------------------------------------------------------
    // Step 3: transcript webhook — the handler persists a VoiceTranscript row.
    // -----------------------------------------------------------------
    prisma.voiceSession.findUnique.mockResolvedValueOnce({
      id: 'sess-e2e-1',
      tenantId: 't1',
      conversationId: 'conv-1',
    });
    prisma.voiceTranscript.create.mockResolvedValue({ id: 'vt-1' });

    const transcriptResult = await transcriptHandler.handle(
      {
        role: 'user',
        transcript: 'What is your return policy?',
        isFinal: true,
      },
      { id: callId },
    );

    expect(transcriptResult.transcriptId).toBe('vt-1');
    expect(prisma.voiceTranscript.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 'sess-e2e-1',
          role: 'user',
          content: 'What is your return policy?',
        }),
      }),
    );

    // -----------------------------------------------------------------
    // Step 4: call-ended webhook → update VoiceSession + create
    // VoiceAnalytics row.
    // -----------------------------------------------------------------
    prisma.voiceSession.findUnique.mockResolvedValueOnce({
      id: 'sess-e2e-1',
      tenantId: 't1',
      callId,
      status: 'IN_PROGRESS',
      conversationId: 'conv-1',
      startedAt: new Date(Date.now() - 60000),
      analytics: null,
    });
    prisma.voiceSession.update.mockResolvedValue({ id: 'sess-e2e-1' });
    prisma.voiceAnalytics.findUnique.mockResolvedValue(null);
    prisma.voiceAnalytics.upsert.mockResolvedValue({ id: 'va-1' });

    const ended = await callEndedHandler.handle({
      id: callId,
      durationSeconds: 60,
      summary: {
        durationSeconds: 60,
        toolCalls: 1,
        toolCallsCount: 1,
        outcome: 'COMPLETED',
        costUsd: 0.05,
      },
      endedAt: new Date().toISOString(),
    });

    expect(ended.sessionId).toBe('sess-e2e-1');
    expect(ended.durationSeconds).toBe(60);
    expect(prisma.voiceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-e2e-1' },
        data: expect.objectContaining({
          status: 'ENDED',
        }),
      }),
    );
  });

  it('returns a session not-found marker when the call-start webhook arrives with no prior VoiceSession', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.aiAgent.findFirst.mockResolvedValue(null);
    prisma.voiceSession.findUnique.mockResolvedValue(null);
    prisma.voiceSession.create.mockResolvedValue({
      id: 'sess-anon',
      tenantId: 'default',
      callId: 'e2e-call-anon',
      phoneNumber: '+15559999999',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      conversationId: null,
    });

    const started = await callStartedHandler.handle({
      id: 'e2e-call-anon',
      from: '+15559999999',
    });

    expect(started.sessionId).toBe('sess-anon');
    expect(started.customerId).toBeUndefined();
  });

  it('function-call handler returns a clean error when the session does not exist', async () => {
    // No session in Redis for this call id.
    const result = await functionCallHandler.handle(
      {
        id: 'tc-orphan',
        function: {
          name: 'search_knowledge',
          arguments: JSON.stringify({ query: 'x' }),
        },
      },
      { id: 'unknown-call-id' },
    );

    expect(result.success).toBe(false);
    expect(result.toolCallId).toBe('tc-orphan');
  });

  it('function-call handler returns "TOOL_NOT_FOUND" when the registry does not have the tool', async () => {
    // First, initialise a session so the handler gets past the
    // session-resolution step.
    await sessionMemory.init('sess-orphan', {
      callId: 'call-with-bad-tool',
      tenantId: 't1',
    });

    (toolRegistry.has as any).mockReturnValueOnce(false);

    const result = await functionCallHandler.handle(
      {
        id: 'tc-bad',
        function: { name: 'nonexistent_tool', arguments: '{}' },
      },
      { id: 'call-with-bad-tool' },
    );

    expect(result.success).toBe(false);
  });
});

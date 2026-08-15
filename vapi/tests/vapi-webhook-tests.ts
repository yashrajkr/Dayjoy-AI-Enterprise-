/**
 * Vapi Webhook Tests
 *
 * Real unit tests for the webhook handling layer. Coverage:
 *
 *   1. `VapiWebhookService.verifySignature()` — valid/invalid/tampered
 *      signatures, missing headers, replay protection, secret-not-
 *      configured failure, test-env bypass.
 *   2. `VapiWebhookService.process()` — routing to each handler
 *      (call-started, call-ended, transcript, function-call), unknown
 *      event types, idempotency via Redis SETNX.
 *
 * The four event handlers are stubbed (`{} as any`) for the routing
 * tests so we focus on the service's verify + dispatch logic. The
 * signature-verification tests run the *real* `verifySignature` code
 * path (the only test-env escape hatch is `NODE_ENV === 'test'`).
 *
 * Run with: `vitest run vapi/tests/vapi-webhook-tests.ts`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import { createMockRedis } from '../../backend/_shared/testing/mock-redis';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { VapiWebhookService } from '../webhooks/vapi-webhook-service';
import {
  computeValidVapiSignature,
  mockWebhookEvent,
} from './vapi-test-setup';

// ---------------------------------------------------------------------------
// Mock Prisma with the voice-specific models
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
// Env setup / teardown
// ---------------------------------------------------------------------------
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

beforeEach(() => {
  // Tests want to exercise the REAL verification path by default.
  process.env.NODE_ENV = 'production';
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  process.env.VAPI_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
});

// ===========================================================================
// Signature Verification
// ===========================================================================
describe('VapiWebhook', () => {
  describe('verifySignature', () => {
    let service: VapiWebhookService;

    beforeEach(() => {
      process.env.VAPI_WEBHOOK_SECRET = 'test-secret';
      service = new VapiWebhookService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        makePrismaMock(),
        createMockRedis() as any,
      );
    });

    it('accepts a valid HMAC-SHA256 signature', async () => {
      const payload = JSON.stringify({
        type: 'call.started',
        call: { id: 'c1' },
      });
      const { signature, timestamp } = computeValidVapiSignature(
        payload,
        'test-secret',
      );

      const valid = await service.verifySignature(payload, signature, timestamp);
      expect(valid).toBe(true);
    });

    it('rejects a tampered signature', async () => {
      const payload = JSON.stringify({
        type: 'call.started',
        call: { id: 'c2' },
      });
      const { timestamp } = computeValidVapiSignature(payload, 'test-secret');
      const tamperedSignature = 'a'.repeat(64); // wrong but well-formed

      const valid = await service.verifySignature(
        payload,
        tamperedSignature,
        timestamp,
      );
      expect(valid).toBe(false);
    });

    it('rejects a missing signature header', async () => {
      const payload = JSON.stringify({ type: 'call.started' });
      const valid = await service.verifySignature(payload, '', Date.now().toString());
      expect(valid).toBe(false);
    });

    it('rejects a missing timestamp header', async () => {
      const payload = JSON.stringify({ type: 'call.started' });
      const valid = await service.verifySignature(payload, 'somesig', '');
      expect(valid).toBe(false);
    });

    it('rejects a replayed payload whose timestamp is too far in the past', async () => {
      const payload = JSON.stringify({ type: 'call.started' });
      // 10 minutes ago — outside the 5-minute window
      const oldTs = Date.now() - 10 * 60 * 1000;
      const { signature, timestamp } = computeValidVapiSignature(
        payload,
        'test-secret',
        oldTs,
      );

      const valid = await service.verifySignature(payload, signature, timestamp);
      expect(valid).toBe(false);
    });

    it('bypasses verification only when NODE_ENV === "test"', async () => {
      process.env.NODE_ENV = 'test';
      const valid = await service.verifySignature(
        'whatever',
        'invalid-sig',
        '0',
      );
      expect(valid).toBe(true);
    });

    it('does NOT bypass in development', async () => {
      process.env.NODE_ENV = 'development';
      const valid = await service.verifySignature(
        'whatever',
        'invalid-sig',
        Date.now().toString(),
      );
      expect(valid).toBe(false);
    });

    it('throws UnauthorizedException when the secret is not configured', async () => {
      process.env.VAPI_WEBHOOK_SECRET = '';
      // Re-instantiate so the cached `webhookSecret` is undefined.
      const serviceWithoutSecret = new VapiWebhookService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        makePrismaMock(),
        createMockRedis() as any,
      );

      await expect(
        serviceWithoutSecret.verifySignature(
          'payload',
          'sig',
          Date.now().toString(),
        ),
      ).rejects.toThrow(/Webhook secret not configured/i);
    });
  });

  // =========================================================================
  // Shared-secret verification (X-Vapi-Secret) — Vapi's default auth
  // mechanism for `assistant.server.secret`, distinct from the HMAC path.
  // =========================================================================
  describe('verifySharedSecret', () => {
    let service: VapiWebhookService;

    beforeEach(() => {
      process.env.VAPI_WEBHOOK_SECRET = 'test-secret';
      service = new VapiWebhookService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        makePrismaMock(),
        createMockRedis() as any,
      );
    });

    it('accepts a matching secret', () => {
      expect(service.verifySharedSecret('test-secret')).toBe(true);
    });

    it('rejects a mismatched secret', () => {
      expect(service.verifySharedSecret('wrong-secret')).toBe(false);
    });

    it('rejects an empty/undefined header', () => {
      expect(service.verifySharedSecret(undefined)).toBe(false);
    });

    it('returns false when VAPI_WEBHOOK_SECRET is unset', () => {
      process.env.VAPI_WEBHOOK_SECRET = '';
      const serviceWithoutSecret = new VapiWebhookService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        makePrismaMock(),
        createMockRedis() as any,
      );
      expect(serviceWithoutSecret.verifySharedSecret('anything')).toBe(false);
    });
  });

  // =========================================================================
  // Routing — process()
  // =========================================================================
  describe('process (event routing)', () => {
    let callStartedHandler: any;
    let callEndedHandler: any;
    let transcriptHandler: any;
    let functionCallHandler: any;
    let prisma: any;
    let redis: ReturnType<typeof createMockRedis>;
    let service: VapiWebhookService;

    beforeEach(() => {
      // Bypass signature verification for routing tests — we exercise
      // the real verifySignature path in the section above.
      process.env.NODE_ENV = 'test';

      callStartedHandler = { handle: vi.fn().mockResolvedValue({ sessionId: 's1' }) };
      callEndedHandler = { handle: vi.fn().mockResolvedValue({ sessionId: 's1', outcome: 'COMPLETED' }) };
      transcriptHandler = { handle: vi.fn().mockResolvedValue({ transcriptId: 't1' }) };
      functionCallHandler = { handle: vi.fn().mockResolvedValue({ toolCallId: 'tc1', success: true }) };

      prisma = makePrismaMock();
      redis = createMockRedis();

      service = new VapiWebhookService(
        callStartedHandler,
        callEndedHandler,
        transcriptHandler,
        functionCallHandler,
        prisma,
        redis as any,
      );
    });

    it('routes call-start to the call-started handler', async () => {
      const event = mockWebhookEvent('call-start', 'call-1', '+15551234567');
      const result = await service.process(event);

      expect(callStartedHandler.handle).toHaveBeenCalled();
      expect(result.status).toBe('processed');
    });

    it('routes call-started (alternative spelling) to the call-started handler', async () => {
      const event = mockWebhookEvent('call-started', 'call-1', '+15551234567');
      await service.process(event);

      expect(callStartedHandler.handle).toHaveBeenCalled();
    });

    it('routes call-end to the call-ended handler', async () => {
      const event = mockWebhookEvent('call-end', 'call-1', '+15551234567');
      await service.process(event);

      expect(callEndedHandler.handle).toHaveBeenCalled();
    });

    it('routes transcript to the transcript handler', async () => {
      const event = {
        type: 'transcript',
        call: { id: 'call-1' },
        message: { role: 'user', transcript: 'hello' },
      };
      await service.process(event);

      expect(transcriptHandler.handle).toHaveBeenCalled();
    });

    it('routes function-call to the function-call handler', async () => {
      const event = {
        type: 'function-call',
        call: { id: 'call-1' },
        toolCall: { id: 'tc1', function: { name: 'search_knowledge', arguments: '{"query":"x"}' } },
      };
      await service.process(event);

      expect(functionCallHandler.handle).toHaveBeenCalled();
    });

    it('acknowledges status-update without invoking any handler', async () => {
      const event = mockWebhookEvent('status-update', 'call-1', '+15551234567');
      const result = await service.process(event);

      expect(result.status).toBe('processed');
      expect(callStartedHandler.handle).not.toHaveBeenCalled();
      expect(callEndedHandler.handle).not.toHaveBeenCalled();
    });

    it('returns "unknown_event_type" for an unrecognised event type', async () => {
      const event = mockWebhookEvent('mystery-event', 'call-1', '+15551234567');
      const result = await service.process(event);

      expect(result.status).toBe('processed');
      // The handler returns `{ status: 'unknown_event_type', type }` from
      // the router — the outer service wraps it as `{ status: 'processed', data: ... }`.
      expect(result.data).toMatchObject({ status: 'unknown_event_type' });
    });

    it('returns "already_processed" when the same event id arrives twice (idempotency)', async () => {
      const event = {
        id: 'evt-duplicate',
        type: 'call-start',
        call: { id: 'call-1', phoneNumber: '+15551234567' },
      };

      const first = await service.process(event);
      const second = await service.process(event);

      expect(first.status).toBe('processed');
      expect(second.status).toBe('already_processed');
      // The handler should have only been invoked once.
      expect(callStartedHandler.handle).toHaveBeenCalledTimes(1);
    });

    it('persists a webhook audit row for every event', async () => {
      const event = {
        id: 'evt-audit',
        type: 'call-start',
        call: { id: 'call-1', phoneNumber: '+15551234567' },
      };

      await service.process(event);

      expect(prisma.webhookEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'VAPI',
            eventType: 'call-start',
            processed: false,
          }),
        }),
      );
    });

    it('marks the audit row as processed after the handler succeeds', async () => {
      const event = {
        id: 'evt-mark-processed',
        type: 'call-start',
        call: { id: 'call-1', phoneNumber: '+15551234567' },
      };

      await service.process(event);

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            processed: true,
          }),
        }),
      );
    });

    it('records the error on the audit row when the handler throws', async () => {
      callStartedHandler.handle.mockRejectedValueOnce(new Error('handler crashed'));

      const event = {
        id: 'evt-error',
        type: 'call-start',
        call: { id: 'call-1', phoneNumber: '+15551234567' },
      };

      await expect(service.process(event)).rejects.toThrow('handler crashed');

      // The error-update call should have `error` set.
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            processed: true,
            error: expect.stringContaining('handler crashed'),
          }),
        }),
      );
    });

    it('handles the function-call event with toolCalls array', async () => {
      const event = {
        type: 'function-call',
        call: { id: 'call-1' },
        toolCalls: [
          { id: 'tc1', function: { name: 'search_knowledge', arguments: '{}' } },
          { id: 'tc2', function: { name: 'search_products', arguments: '{}' } },
        ],
      };
      await service.process(event);

      // Every tool call in the batch is executed — Vapi expects a
      // `results` entry per toolCallId it sent, not just the first.
      expect(functionCallHandler.handle).toHaveBeenCalledTimes(2);
    });

    it('returns "no_tool_call" when a function-call event has no toolCalls', async () => {
      const event = {
        type: 'function-call',
        call: { id: 'call-1' },
      };
      const result = await service.process(event);

      expect(result.data).toMatchObject({ status: 'no_tool_call' });
      expect(functionCallHandler.handle).not.toHaveBeenCalled();
    });

    it('routes tool-calls (current Vapi event name) using toolCallList, executing every call and shaping results', async () => {
      functionCallHandler.handle
        .mockResolvedValueOnce({ toolCallId: 'tc1', toolName: 'search_knowledge', success: true, result: { answer: 'x' }, latencyMs: 5 })
        .mockResolvedValueOnce({ toolCallId: 'tc2', toolName: 'search_products', success: true, result: { items: [] }, latencyMs: 5 });

      const event = {
        type: 'tool-calls',
        call: { id: 'call-1' },
        toolCallList: [
          { id: 'tc1', name: 'search_knowledge', parameters: { query: 'x' } },
          { id: 'tc2', name: 'search_products', parameters: { query: 'y' } },
        ],
      };
      const result = await service.process(event);

      expect(functionCallHandler.handle).toHaveBeenCalledTimes(2);
      expect(result.data.results).toEqual([
        { toolCallId: 'tc1', name: 'search_knowledge', result: JSON.stringify({ answer: 'x' }) },
        { toolCallId: 'tc2', name: 'search_products', result: JSON.stringify({ items: [] }) },
      ]);
    });

    it('routes a status-update with status "in-progress" to the call-started handler', async () => {
      const event = {
        type: 'status-update',
        status: 'in-progress',
        call: { id: 'call-1', customer: { number: '+15551234567' } },
      };
      await service.process(event);

      expect(callStartedHandler.handle).toHaveBeenCalled();
    });

    it('acknowledges a status-update with status "ringing" without invoking the call-started handler', async () => {
      const event = {
        type: 'status-update',
        status: 'ringing',
        call: { id: 'call-1' },
      };
      const result = await service.process(event);

      expect(result.data).toMatchObject({ status: 'acknowledged', callStatus: 'ringing' });
      expect(callStartedHandler.handle).not.toHaveBeenCalled();
    });

    it('routes end-of-call-report to the call-ended handler with a normalized summary', async () => {
      const event = {
        type: 'end-of-call-report',
        endedReason: 'customer-ended-call',
        call: { id: 'call-1', startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:05:00.000Z' },
        artifact: { transcript: 'AI: hi\nUser: bye', recording: { recordingUrl: 'https://x/y.mp3' } },
        cost: 0.42,
      };
      await service.process(event);

      expect(callEndedHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'call-1',
          durationSeconds: 300,
          recordingUrl: 'https://x/y.mp3',
          transcript: 'AI: hi\nUser: bye',
          summary: expect.objectContaining({ outcome: 'COMPLETED', costUsd: 0.42 }),
        }),
        event,
      );
    });
  });

  // =========================================================================
  // Real crypto cross-check (timingSafeEqual contract)
  // =========================================================================
  describe('verifySignature — crypto contract', () => {
    it('uses HMAC-SHA256 over `${timestamp}.${payload}`', async () => {
      process.env.VAPI_WEBHOOK_SECRET = 'crypto-secret';
      const service = new VapiWebhookService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        makePrismaMock(),
        createMockRedis() as any,
      );

      const payload = '{"type":"call.started"}';
      const timestamp = Date.now().toString();
      const expected = crypto
        .createHmac('sha256', 'crypto-secret')
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      const valid = await service.verifySignature(payload, expected, timestamp);
      expect(valid).toBe(true);
    });
  });
});

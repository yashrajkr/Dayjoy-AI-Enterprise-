/**
 * Channel Tests — Shared Mock Factories
 * =====================================
 *
 * Centralised mock builders for the four AI-channel test suites (RAG,
 * Voice AI / Vapi, WhatsApp AI, Website AI). All external dependencies
 * — OpenAI, Vapi REST API, Meta WhatsApp Cloud API, Postgres (Prisma),
 * Redis (ioredis), `fetch`, Web Speech API — are mocked so the tests
 * are hermetic, deterministic, and run in CI without secrets.
 *
 * The factories re-use the existing `backend/_shared/testing/` mocks
 * (`mock-prisma.service`, `mock-redis`) so the channel tests stay in
 * sync with the rest of the backend's unit test surface.
 *
 * ## Usage
 *
 * ```ts
 * import { describe, it, expect, beforeEach } from 'vitest';
 * import { createMockPrisma, createMockOpenAI } from '@channel-helpers/mocks';
 *
 * describe('RAG search', () => {
 *   let prisma: ReturnType<typeof createMockPrisma>;
 *   beforeEach(() => { prisma = createMockPrisma(); });
 *   // ...
 * });
 * ```
 */

import { vi } from 'vitest';
export { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
export { createMockRedis } from '../../backend/_shared/testing/mock-redis';

// Re-export with shorter aliases used across the channel test files.
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { createMockRedis } from '../../backend/_shared/testing/mock-redis';

/** Convenience alias — `createMockPrisma()` reads cleaner in tests. */
export const createMockPrisma = createMockPrismaService;

// ---------------------------------------------------------------------------
// OpenAI — chat completions + embeddings
// ---------------------------------------------------------------------------

export interface ScriptedOpenAIOptions {
  /** Canned chat-completion content. */
  chatContent?: string;
  /** Canned embedding vector length (default 1536 — `text-embedding-3-small`). */
  embeddingDimensions?: number;
  /** Number of embedding vectors the mock returns per `embeddings.create` call. */
  embeddingCount?: number;
  /** Token-usage numbers reported back on chat completions. */
  chatUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Build a mock OpenAI SDK client. Defaults return a non-empty assistant
 * message and a 1536-d zero vector — tests override per-call with
 * `mockResolvedValueOnce` / `mockImplementationOnce`.
 */
export function createMockOpenAI(opts: ScriptedOpenAIOptions = {}) {
  const dims = opts.embeddingDimensions ?? 1536;
  const count = opts.embeddingCount ?? 1;
  const usage = opts.chatUsage ?? { prompt_tokens: 50, completion_tokens: 50, total_tokens: 100 };

  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          id: 'chatcmpl_mock',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: opts.chatContent ?? 'Mock assistant response.' },
              finish_reason: 'stop',
            },
          ],
          usage,
        }),
      },
    },
    embeddings: {
      create: vi.fn().mockResolvedValue({
        object: 'list',
        data: Array.from({ length: count }, (_, i) => ({
          index: i,
          embedding: new Array(dims).fill(0),
        })),
        usage: { prompt_tokens: 8, total_tokens: 8 },
      }),
    },
  };
}

/** Type alias matching the shape returned by `createMockOpenAI`. */
export type MockOpenAI = ReturnType<typeof createMockOpenAI>;

// ---------------------------------------------------------------------------
// Mock fetch — for Vapi REST API + Meta WhatsApp Cloud API
// ---------------------------------------------------------------------------

export interface MockFetchOptions {
  /** Default response status. */
  status?: number;
  /** Default response body (will be JSON.stringified unless `raw` is set). */
  body?: unknown;
  /** Bypass JSON.stringify and return this raw text. */
  raw?: string;
  /** Default response headers. */
  headers?: Record<string, string>;
}

/**
 * Build a mock `globalThis.fetch`. Each call records `(url, init)` on
 * `mock.calls` so tests can assert on request shape.
 *
 * Per-call overrides: `mockFetch.mockResolvedValueOnce({ status, body, ... })`.
 */
export function createMockFetch(opts: MockFetchOptions = {}) {
  const status = opts.status ?? 200;
  const headers = opts.headers ?? { 'content-type': 'application/json' };
  const raw = opts.raw;
  const body = opts.body ?? { ok: true };

  return vi.fn(async (_url: any, _init?: any) => {
    const text = raw ?? JSON.stringify(body);
    // Build a real Response object so the mock satisfies the
    // `globalThis.fetch` signature contract.
    return new Response(text, {
      status,
      headers: new Headers(headers),
    });
  });
}

// ---------------------------------------------------------------------------
// Vapi REST client mock
// ---------------------------------------------------------------------------

/**
 * Mock for the Vapi REST client surface — covers createCall, getCall,
 * endCall, listCalls, getTranscript, getRecording + webhook signature
 * verification. Matches `vapi/config/vapi-client-service.ts` contract.
 */
export function createMockVapiClient() {
  return {
    createCall: vi.fn().mockResolvedValue({
      id: 'call_mock',
      phoneNumber: '+919876543210',
      status: 'active',
      metadata: { source: 'dayjoy-voice-ai' },
    }),
    getCall: vi.fn().mockResolvedValue({
      id: 'call_mock',
      phoneNumber: '+919876543210',
      status: 'in-progress',
      recordingUrl: 'https://recordings.example.com/call_mock.mp3',
      transcript: 'mock transcript',
      durationSeconds: 120,
      metadata: {},
    }),
    endCall: vi.fn().mockResolvedValue(undefined),
    listCalls: vi.fn().mockResolvedValue({ calls: [], total: 0 }),
    getTranscript: vi.fn().mockResolvedValue([
      { role: 'assistant', content: 'Hello, how can I help you today?' },
      { role: 'user', content: 'I want to know about products.' },
      { role: 'assistant', content: 'Sure, let me look that up for you.' },
    ]),
    getRecording: vi.fn().mockResolvedValue('https://recordings.example.com/call_mock.mp3'),
    getConfig: vi.fn().mockReturnValue({
      apiKey: 'mock-key',
      apiBaseUrl: 'https://api.vapi.ai',
      voiceAgent: { name: 'Dayjoy Support Agent' },
    }),
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    handleWebhookEvent: vi.fn(),
  };
}

/** Type alias matching the shape returned by `createMockVapiClient`. */
export type MockVapiClient = ReturnType<typeof createMockVapiClient>;

// ---------------------------------------------------------------------------
// Meta WhatsApp Cloud API client mock
// ---------------------------------------------------------------------------

/**
 * Mock for the Meta WhatsApp Cloud API client surface — covers sendText,
 * sendTemplate, sendInteractive, sendMedia, uploadMedia, downloadMedia,
 * verifyWebhookSignature. Matches `whatsapp-ai/README.md` contract.
 */
export function createMockWhatsAppClient() {
  return {
    // Outbound
    sendText: vi.fn().mockResolvedValue({
      messaging_product: 'whatsapp',
      contacts: [{ input: '+919876543210', wa_id: '919876543210' }],
      messages: [{ id: 'wamid.mock123', status: 'sent' }],
    }),
    sendTemplate: vi.fn().mockResolvedValue({
      messaging_product: 'whatsapp',
      messages: [{ id: 'wamid.tpl.mock', status: 'sent' }],
    }),
    sendInteractive: vi.fn().mockResolvedValue({
      messaging_product: 'whatsapp',
      messages: [{ id: 'wamid.interactive.mock', status: 'sent' }],
    }),
    sendMedia: vi.fn().mockResolvedValue({
      messaging_product: 'whatsapp',
      messages: [{ id: 'wamid.media.mock', status: 'sent' }],
    }),
    // Media
    uploadMedia: vi.fn().mockResolvedValue({ id: 'media_mock_1' }),
    downloadMedia: vi.fn().mockResolvedValue({
      buffer: Buffer.from('mock-binary'),
      mimeType: 'image/jpeg',
      sha256: 'mock-sha256',
      id: 'media_mock_1',
      filename: 'image.jpg',
    }),
    // Webhook
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    parseWebhookEvent: vi.fn().mockReturnValue({ type: 'unknown', raw: {} }),
    // Misc
    getPhoneNumberId: vi.fn().mockReturnValue('mock_phone_id'),
    getBusinessAccount: vi.fn().mockReturnValue({ id: 'mock_ba_id', name: 'Dayjoy Test' }),
  };
}

/** Type alias matching the shape returned by `createMockWhatsAppClient`. */
export type MockWhatsAppClient = ReturnType<typeof createMockWhatsAppClient>;

// ---------------------------------------------------------------------------
// Crypto helper — valid HMAC-SHA256 signatures for webhook tests
// ---------------------------------------------------------------------------

import { createHmac } from 'node:crypto';

/**
 * Compute a valid HMAC-SHA256 signature for a webhook payload. Mirrors
 * Vapi's signature scheme (`<timestamp>.<payload>`) and Meta's
 * `X-Hub-Signature-256=sha256=<hex>` header convention.
 *
 * @param payload raw request body string
 * @param secret  webhook signing secret
 * @param timestamp optional — defaults to now
 */
export function computeValidSignature(
  payload: string,
  secret: string,
  timestamp: number = Date.now(),
): { signature: string; timestamp: string } {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return { signature, timestamp: timestamp.toString() };
}

/** Compute the `X-Hub-Signature-256` header value Meta sends. */
export function computeMetaSignature(payload: string, appSecret: string): string {
  return 'sha256=' + createHmac('sha256', appSecret).update(payload).digest('hex');
}

// ---------------------------------------------------------------------------
// Generic test fixtures
// ---------------------------------------------------------------------------

/** Build a minimal `AuthUser`-shaped object for tests. */
export function makeUser(overrides: Record<string, any> = {}) {
  return {
    userId: 'u1',
    tenantId: 't1',
    email: 'tester@dayjoy.ai',
    role: 'ADMIN',
    ...overrides,
  };
}

/** Build a minimal `ToolContext` for Vapi tool tests. */
export function makeToolContext(overrides: Record<string, any> = {}) {
  return {
    tenantId: 't1',
    userId: 'u1',
    customerId: 'cust-1',
    conversationId: 'conv-1',
    callId: 'call-1',
    sessionId: 'sess-1',
    phoneNumber: '+919876543210',
    ...overrides,
  };
}

/** Wait helper for tests that need to yield to the event loop. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

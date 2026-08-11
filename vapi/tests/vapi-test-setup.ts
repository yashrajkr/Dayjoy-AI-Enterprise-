/**
 * Vapi Test Setup
 *
 * Comprehensive test configuration and utilities for the Vapi Voice AI module.
 *
 * Provides:
 *   - `createTestModule` — NestJS TestingModule with Prisma/Redis/OpenAI mocked
 *   - `createMockOpenAI` — mocks `OpenAI` SDK chat + embeddings calls
 *   - `createMockVapiClient` — mocks `VapiClientService` (createCall, getCall, endCall, ...)
 *   - `createMockVapiWebhookService` — mocks the webhook service for E2E tests
 *   - Helpers: `mockWebhookEvent`, `mockToolCallRequest`, `mockFlowState`,
 *     `generateTestPhoneNumber`, `generateTestCallId`, `wait`
 *
 * Tests in this folder consume the shared mocks from
 * `backend/_shared/testing/` so they stay in sync with the rest of the
 * backend's unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { vi } from 'vitest';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { createMockRedis } from '../../backend/_shared/testing/mock-redis';

// ---------------------------------------------------------------------------
// Test module factory
// ---------------------------------------------------------------------------

/**
 * Build a NestJS TestingModule with the standard infra providers (Prisma,
 * Redis, OpenAI) pre-mocked. Extra providers passed in are appended.
 *
 * Usage:
 *   const moduleRef = await createTestModule([
 *     SearchKnowledgeTool,
 *     { provide: 'RAG_SERVICE', useValue: mockRag },
 *   ]);
 *   const tool = moduleRef.get(SearchKnowledgeTool);
 */
export async function createTestModule(providers: any[]): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ...providers,
      { provide: 'PrismaService', useValue: createMockPrismaService() },
      { provide: 'REDIS_CLIENT', useValue: createMockRedis() },
      { provide: 'OPENAI_CLIENT', useValue: createMockOpenAI() },
    ],
  }).compile();

  return moduleRef;
}

/**
 * Same as {@link createTestModule} but bootstraps an `INestApplication`
 * — useful for supertest-style E2E tests.
 */
export async function createTestApplication(
  providers: any[],
): Promise<{ module: TestingModule; app: INestApplication }> {
  const module = await createTestModule(providers);
  const app = module.createNestApplication();
  await app.init();
  return { module, app };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Mock the OpenAI SDK shape used by `_shared/ai/openai.provider.ts`.
 *
 * Returns an object with `chat.completions.create` and `embeddings.create`,
 * both `vi.fn()`s. Defaults are sensible; tests can override the mock
 * resolution per-call.
 */
export function createMockOpenAI() {
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
              message: { role: 'assistant', content: 'Mock assistant response' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 50,
            total_tokens: 100,
          },
        }),
      },
    },
    embeddings: {
      create: vi.fn().mockResolvedValue({
        object: 'list',
        data: [
          {
            index: 0,
            embedding: new Array(1536).fill(0),
          },
        ],
        usage: { prompt_tokens: 8, total_tokens: 8 },
      }),
    },
  };
}

/**
 * Mock `VapiClientService` — covers the public surface used by the
 * voice controller and webhook handlers (createCall, getCall, endCall,
 * listCalls, getTranscript, getRecording).
 *
 * Each method is a `vi.fn()` so individual tests can assert call args
 * or override the resolution.
 */
export function createMockVapiClient() {
  return {
    createCall: vi.fn().mockResolvedValue({
      id: 'call_mock',
      phoneNumber: '+15551234567',
      status: 'active',
      metadata: { source: 'dayjoy-voice-ai' },
    }),
    getCall: vi.fn().mockResolvedValue({
      id: 'call_mock',
      phoneNumber: '+15551234567',
      status: 'in-progress',
      recordingUrl: 'https://recordings.example.com/call_mock.mp3',
      transcript: 'mock transcript',
      durationSeconds: 120,
      metadata: {},
    }),
    endCall: vi.fn().mockResolvedValue(undefined),
    getTranscript: vi.fn().mockResolvedValue('mock transcript'),
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

/**
 * Mock the `VapiWebhookService` for E2E tests that want to assert on the
 * controller layer without invoking the actual handler chain.
 */
export function createMockVapiWebhookService() {
  return {
    processWebhook: vi.fn().mockResolvedValue({ success: true, data: {} }),
    verifySignature: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Mock the conversation flow manager for tests that exercise webhook
 * handlers without coupling to the (heavy) flow logic.
 */
export function createMockFlowManager() {
  return {
    detectIntent: vi.fn().mockReturnValue({
      intent: 'product_inquiry',
      confidence: 0.85,
      entities: {},
    }),
    createConversationState: vi.fn().mockReturnValue({
      flowType: 'product_inquiry',
      currentStep: 'greeting',
      context: {},
      data: {},
      completedSteps: [],
      metadata: {
        callId: 'test-call',
        sessionId: 'test-session',
        phoneNumber: '+15551234567',
        startedAt: new Date(),
      },
    }),
    processMessage: vi.fn().mockResolvedValue({
      success: true,
      message: 'Mock flow response',
    }),
    getConversationState: vi.fn().mockReturnValue(null),
    completeConversation: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Event/request fixtures
// ---------------------------------------------------------------------------

/**
 * Build a Vapi webhook event fixture.
 *
 * @example
 *   const event = mockWebhookEvent('call.started', 'call_123', '+15551234567');
 */
export function mockWebhookEvent(
  type: string,
  callId: string,
  phoneNumber: string,
  data?: any,
): any {
  return {
    type,
    call: {
      id: callId,
      phoneNumber,
      status: type === 'call.ended' ? 'ended' : 'active',
    },
    data,
  };
}

/**
 * Build a tool-call request fixture matching `ToolCallRequest`.
 */
export function mockToolCallRequest(
  toolName: string,
  parameters: any,
  callId: string = 'test-call',
  sessionId: string = 'test-session',
): any {
  return {
    toolName,
    parameters,
    callId,
    sessionId,
  };
}

/**
 * Build a flow-state fixture matching `FlowState`.
 */
export function mockFlowState(
  flowType: string,
  callId: string,
  phoneNumber: string,
): any {
  return {
    flowType,
    currentStep: 'greeting',
    context: {},
    data: {},
    completedSteps: [],
    metadata: {
      callId,
      sessionId: callId,
      phoneNumber,
      startedAt: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateTestPhoneNumber(): string {
  return `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`;
}

export function generateTestCallId(): string {
  return `test-call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Compute a valid HMAC-SHA256 signature for a webhook payload — used
 * by tests that need to verify the *real* `verifySignature()` code path
 * (not the bypass branch) with a known-good signature.
 */
export function computeValidVapiSignature(
  payload: string,
  secret: string,
  timestamp: number = Date.now(),
): { signature: string; timestamp: string } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return { signature, timestamp: timestamp.toString() };
}

/**
 * Lightweight logger for the pseudo-runner tests (kept for back-compat
 * with the existing runAllXTests() entry points).
 */
export class TestLogger {
  static log(message: string): void {
    console.log(`[TEST] ${message}`);
  }

  static error(message: string): void {
    console.error(`[TEST ERROR] ${message}`);
  }

  static success(message: string): void {
    console.log(`✅ [TEST PASS] ${message}`);
  }

  static fail(message: string): void {
    console.error(`❌ [TEST FAIL] ${message}`);
  }
}

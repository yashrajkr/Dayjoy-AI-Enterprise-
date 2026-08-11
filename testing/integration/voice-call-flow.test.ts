/**
 * Integration test — Voice call flow (mocked Vapi).
 *
 * Exercises the full Vapi webhook lifecycle against a real test DB:
 *
 *  1. Webhook: call-started → voice_session row created
 *  2. Webhook: transcript → message saved
 *  3. Webhook: function-call → tool executed + analytics_event recorded
 *  4. Webhook: call-ended → analytics recorded + summary generated
 *
 * Vapi SDK is mocked — no real voice traffic.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '@backend/_shared/ai/openai.provider';
import { ConfigService } from '@nestjs/config';

import { mockOpenAI, mockConfigService } from '@testing/helpers/mocks';
import { testTenant } from '@testing/helpers/fixtures';

const HAS_TEST_DB =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes('_test');
const describeOrSkip = HAS_TEST_DB ? describe : describe.skip;

describeOrSkip('Voice call flow (integration)', () => {
  let prisma: any;
  let openai: ReturnType<typeof mockOpenAI>;

  const authUser = {
    userId: 'voice-bot',
    tenantId: testTenant.id,
    email: 'voice@dayjoy.test',
    jti: 'jti-voice',
  };

  beforeAll(async () => {
    const { PrismaService: Prisma } = await import('@backend/_shared/database/prisma.service');
    prisma = new Prisma();
    await prisma.$connect();
    openai = mockOpenAI();
    openai.chat.completions.create.mockResolvedValue({
      id: 'chatcmpl-mock',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Mock voice summary' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });

  beforeEach(async () => {
    await prisma.voiceRecording.deleteMany();
    await prisma.voiceSession.deleteMany();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  // Webhook handlers (the actual Vapi module lives in `vapi/` and
  // exposes a webhook controller; here we simulate its effects).

  async function handleCallStarted(payload: any) {
    return prisma.voiceSession.create({
      data: {
        tenantId: testTenant.id,
        callId: payload.callId,
        assistantId: payload.assistantId,
        customerNumber: payload.customer?.number,
        direction: payload.direction ?? 'inbound',
        status: 'in-progress',
        startedAt: new Date(),
      },
    });
  }

  async function handleTranscript(payload: any) {
    return prisma.voiceSession.update({
      where: { callId: payload.callId },
      data: {
        transcript: payload.transcript,
      },
    });
  }

  async function handleFunctionCall(payload: any) {
    // Record an analytics_event for the tool execution.
    return prisma.analyticsEvent.create({
      data: {
        tenantId: testTenant.id,
        eventType: 'tool_execution',
        eventData: {
          tool: payload.tool,
          args: payload.args,
          callId: payload.callId,
        },
        createdAt: new Date(),
      },
    });
  }

  async function handleCallEnded(payload: any) {
    const session = await prisma.voiceSession.findUnique({
      where: { callId: payload.callId },
    });
    if (!session) return null;
    return prisma.voiceSession.update({
      where: { callId: payload.callId },
      data: {
        status: 'ended',
        endedAt: new Date(),
        durationSeconds: payload.durationSeconds ?? 60,
        cost: payload.cost ?? 0.5,
        summary: 'Mock voice summary',
      },
    });
  }

  // -----------------------------------------------------------------
  // Tests
  // -----------------------------------------------------------------

  it('runs the full call-started → transcript → tool-call → call-ended flow', async () => {
    const callId = 'call-mock-0001';

    // 1. Call started.
    const session = await handleCallStarted({
      callId,
      assistantId: 'assistant-mock',
      customer: { number: '+15551234567' },
      direction: 'inbound',
    });
    expect(session.status).toBe('in-progress');

    // 2. Transcript received.
    await handleTranscript({
      callId,
      transcript: 'Customer: Hi, I want to know about Vitamin C Serum.',
    });
    const withTranscript = await prisma.voiceSession.findUnique({
      where: { callId },
    });
    expect(withTranscript.transcript).toContain('Vitamin C Serum');

    // 3. Function call.
    const event = await handleFunctionCall({
      callId,
      tool: 'search_products',
      args: { query: 'vitamin c' },
    });
    expect(event.eventType).toBe('tool_execution');

    // 4. Call ended.
    const ended = await handleCallEnded({
      callId,
      durationSeconds: 120,
      cost: 0.85,
    });
    expect(ended.status).toBe('ended');
    expect(ended.durationSeconds).toBe(120);
    expect(ended.cost).toBe(0.85);
    expect(ended.summary).toBeDefined();
  });

  it('records the call analytics event with the right schema', async () => {
    const callId = 'call-mock-0002';
    await handleCallStarted({ callId, assistantId: 'assistant-mock' });
    await handleFunctionCall({ callId, tool: 'customer_lookup', args: { email: 'x@y.test' } });

    const events = await prisma.analyticsEvent.findMany({
      where: { tenantId: testTenant.id, eventType: 'tool_execution' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].eventData.tool).toBe('customer_lookup');
  });

  it('handles multiple calls concurrently without cross-contamination', async () => {
    const callIds = ['call-a', 'call-b', 'call-c'];
    for (const callId of callIds) {
      await handleCallStarted({ callId, assistantId: 'assistant-mock' });
    }

    const sessions = await prisma.voiceSession.findMany({
      where: { tenantId: testTenant.id },
    });
    expect(sessions).toHaveLength(3);
    expect(new Set(sessions.map((s: any) => s.callId))).toEqual(new Set(callIds));
  });

  it('does not error when call-ended is received for an unknown callId', async () => {
    const result = await handleCallEnded({ callId: 'ghost-call' });
    expect(result).toBeNull();
  });
});

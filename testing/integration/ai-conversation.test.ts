/**
 * Integration test — AI conversation flow.
 *
 * Exercises the full AI conversation lifecycle against a real test DB
 * (with OpenAI mocked):
 *
 *  1. Create conversation → send message → AI responds → tool call →
 *     follow-up.
 *  2. Memory persists across conversations.
 *  3. Conversation end → summarise.
 *
 * Requires `DATABASE_URL` pointing at a writable test DB.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { ConversationsService } from '@backend/ai/conversations.service';
import { MemoryService } from '@backend/ai/memory.service';
import { ToolsService } from '@backend/ai/tools.service';
import { AiService } from '@backend/ai/ai.service';
import { KnowledgeService } from '@backend/knowledge/knowledge.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '@backend/_shared/ai/openai.provider';
import { ConfigService } from '@nestjs/config';

import { mockOpenAI, mockConfigService } from '@testing/helpers/mocks';
import { testTenant } from '@testing/helpers/fixtures';

const HAS_TEST_DB =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes('_test');
const describeOrSkip = HAS_TEST_DB ? describe : describe.skip;

describeOrSkip('AI conversation flow (integration)', () => {
  let conversations: ConversationsService;
  let memory: MemoryService;
  let tools: ToolsService;
  let ai: AiService;
  let prisma: any;
  let openai: ReturnType<typeof mockOpenAI>;

  const authUser = {
    userId: 'user-ai-1',
    tenantId: testTenant.id,
    email: 'ai@dayjoy.test',
    jti: 'jti-ai-flow',
  };

  let agent: any;

  beforeAll(async () => {
    const { PrismaService: Prisma } = await import('@backend/_shared/database/prisma.service');
    prisma = new Prisma();
    await prisma.$connect();

    openai = mockOpenAI();
    // Stub the chat completion to return a deterministic reply.
    openai.chat.completions.create.mockImplementation(async (opts: any) => {
      const lastMsg = opts.messages[opts.messages.length - 1];
      return {
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4o-mock',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: `Mock reply to: "${String(lastMsg?.content ?? '').slice(0, 40)}"`,
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
    });

    const knowledgeStub = {
      query: vi.fn().mockResolvedValue({
        answer: 'mock answer',
        citations: [],
        latencyMs: 5,
      }),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        MemoryService,
        ToolsService,
        AiService,
        { provide: PrismaService, useValue: prisma },
        { provide: OPENAI_CLIENT, useValue: openai },
        { provide: KnowledgeService, useValue: knowledgeStub },
        { provide: ConfigService, useValue: mockConfigService() },
      ],
    }).compile();
    conversations = moduleRef.get(ConversationsService);
    memory = moduleRef.get(MemoryService);
    tools = moduleRef.get(ToolsService);
    ai = moduleRef.get(AiService);
  });

  beforeEach(async () => {
    await prisma.aiMemory.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.aiAgent.deleteMany();

    agent = await ai.create(
      {
        name: 'Test Agent',
        type: 'CUSTOMER_SUPPORT',
        systemPrompt: 'You are a helpful assistant.',
      } as any,
      authUser,
    );
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('runs the create → send → respond → tool-call → end → summarise flow', async () => {
    // Create conversation.
    const conv = await conversations.create(
      { agentId: agent.id, channel: 'WEBSITE' } as any,
      authUser,
    );
    expect(conv.status).toBe('active');

    // Send a message.
    const res1 = await conversations.sendMessage(
      conv.id,
      { content: 'Hello, I have a question' } as any,
      authUser,
    );
    expect(res1.userMessage.role).toBe('user');
    expect(res1.assistantMessage.role).toBe('assistant');
    expect(res1.assistantMessage.content).toContain('Mock reply');

    // OpenAI was called with the system prompt + the user message.
    expect(openai.chat.completions.create).toHaveBeenCalled();
    const llmArg = openai.chat.completions.create.mock.calls[0][0];
    const sysMsg = llmArg.messages.find((m: any) => m.role === 'system');
    expect(sysMsg).toBeDefined();
    expect(sysMsg.content).toContain('helpful assistant');

    // Send a follow-up.
    const res2 = await conversations.sendMessage(
      conv.id,
      { content: 'Tell me more' } as any,
      authUser,
    );
    expect(res2.userMessage.content).toBe('Tell me more');

    // Execute a tool for the conversation (search_knowledge).
    await tools.executeForConversation(
      'search_knowledge',
      { query: 'how to use vitamin c' },
      conv.id,
      authUser,
    );

    // End the conversation → summary.
    const ended = await conversations.endConversation(conv.id, authUser);
    expect(ended.status).toBe('ended');
    expect(ended.summary).toBeDefined();

    // Message count should reflect 2 user + 2 assistant = 4.
    const msgCount = await prisma.message.count({
      where: { conversationId: conv.id },
    });
    expect(msgCount).toBeGreaterThanOrEqual(4);
  });

  it('persists memory across conversations and injects it into the LLM context', async () => {
    // First conversation — create a memory.
    const conv1 = await conversations.create(
      { agentId: agent.id, channel: 'WEBSITE' } as any,
      authUser,
    );
    await memory.create(
      {
        agentId: agent.id,
        type: 'PREFERENCE',
        content: 'Customer prefers email over SMS',
        importance: 0.9,
      } as any,
      authUser,
    );

    // Second conversation — the memory should be injected into the LLM call.
    const conv2 = await conversations.create(
      { agentId: agent.id, channel: 'WEBSITE' } as any,
      authUser,
    );
    await conversations.sendMessage(
      conv2.id,
      { content: 'How should I contact you?' } as any,
      authUser,
    );

    const llmArg = openai.chat.completions.create.mock.calls[
      openai.chat.completions.create.mock.calls.length - 1
    ][0];
    const sysMsg = llmArg.messages.find((m: any) => m.role === 'system');
    // The system prompt should be augmented with memory context.
    expect(sysMsg.content).toContain('email over SMS');
  });

  it('getHistory returns messages in chronological order', async () => {
    const conv = await conversations.create(
      { agentId: agent.id, channel: 'WEBSITE' } as any,
      authUser,
    );

    // Send 3 messages.
    for (let i = 0; i < 3; i++) {
      await conversations.sendMessage(
        conv.id,
        { content: `Message ${i + 1}` } as any,
        authUser,
      );
    }

    const history = await conversations.getHistory(
      conv.id,
      { page: 1, limit: 50 },
      authUser,
    );

    // 3 user + 3 assistant = 6 messages.
    expect(history.data).toHaveLength(6);
    // Chronological order.
    for (let i = 1; i < history.data.length; i++) {
      expect(history.data[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        history.data[i - 1].createdAt.getTime(),
      );
    }
  });
});

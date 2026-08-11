import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ConversationsService } from './conversations.service';
import { MemoryService } from './memory.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../_shared/ai/openai.provider';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { CreateConversationDto, ChannelType } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { QueryHistoryDto } from './dto/query-history.dto';
import { AuthUser } from './auth-user';

/**
 * Builds a minimal stub of the OpenAI client that mirrors the surface
 * used by `ConversationsService.sendMessage` (`chat.completions.create`).
 */
function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello there!' } }],
          usage: { total_tokens: 42 },
        }),
      },
    },
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      }),
    },
  };
}

/**
 * ConversationsService unit tests.
 *
 * Covers:
 *  - findAll (pagination + filters + tenant scoping)
 *  - findOne (last 50 messages + tenant isolation / 404)
 *  - create (agent existence + tenant match; context JSON parse)
 *  - sendMessage (user message persisted → LLM called → assistant
 *    message persisted; system prompt augmented with memories)
 *  - endConversation (status=ended + endedAt stamped)
 *  - getHistory (paginated, order=asc/desc)
 *  - deleteConversation (status=deleted)
 */
describe('ConversationsService', () => {
  let service: ConversationsService;
  // `prisma` is typed `any` because we extend the shared mock inline
  // with extra methods (`conversation.count`, `message.count`) that
  // aren't on the static mock type. Runtime behaviour is unaffected.
  let prisma: any;
  let memoryService: { getContextForConversation: ReturnType<typeof vi.fn> };
  let openai: ReturnType<typeof createMockOpenAI>;
  const user: AuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    // Extend the shared mock with the additional Prisma methods that
    // `ConversationsService` uses (`conversation.count`, `message.count`).
    // Done inline so we don't have to modify the shared `_shared/testing`
    // helper (off-limits per the task scope).
    Object.assign(prisma.conversation, {
      count: vi.fn().mockResolvedValue(0),
      delete: vi.fn().mockResolvedValue({}),
    });
    Object.assign(prisma.message, {
      count: vi.fn().mockResolvedValue(0),
    });
    memoryService = {
      getContextForConversation: vi.fn().mockResolvedValue([]),
    };
    openai = createMockOpenAI();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MemoryService, useValue: memoryService },
        { provide: OPENAI_CLIENT, useValue: openai },
      ],
    }).compile();

    service = moduleRef.get(ConversationsService);
  });

  describe('findAll', () => {
    it('returns paginated conversations with agent/customer/user includes', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        { id: 'c1', tenantId: 't1', agent: { id: 'a1' } },
      ]);
      prisma.conversation.count.mockResolvedValue(1);

      const query: QueryConversationsDto = { page: 1, limit: 10, agentId: 'a1' };
      const result = await service.findAll(query, user);

      expect(result.data).toHaveLength(1);
      const args = prisma.conversation.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t1');
      expect(args.where.agentId).toBe('a1');
      expect(args.include.agent).toBe(true);
      expect(args.include._count).toEqual({ select: { messages: true } });
    });
  });

  describe('findOne', () => {
    it('returns the conversation with the last 50 messages', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        messages: [{ id: 'm1' }],
      });

      const result = await service.findOne('c1', user);
      expect(result.id).toBe('c1');

      const args = prisma.conversation.findUnique.mock.calls[0][0];
      expect(args.include.messages.take).toBe(50);
    });

    it('throws NotFoundException when tenantId does not match', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 'other',
      });
      await expect(service.findOne('c1', user)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a conversation after verifying the agent belongs to the tenant', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({ id: 'a1', tenantId: 't1' });
      prisma.conversation.create.mockImplementation(async ({ data }: any) => ({
        id: 'c1',
        ...data,
      }));

      const dto: CreateConversationDto = {
        agentId: 'a1',
        channel: ChannelType.WEB,
      };
      const result = await service.create(dto, user);

      expect(result.id).toBe('c1');
      const call = prisma.conversation.create.mock.calls[0][0];
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.agentId).toBe('a1');
      expect(call.data.userId).toBe('u1');
      expect(call.data.status).toBe('active');
    });

    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          { agentId: 'missing', channel: ChannelType.WEB },
          user,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('parses context JSON when supplied', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({ id: 'a1', tenantId: 't1' });
      prisma.conversation.create.mockImplementation(async ({ data }: any) => ({
        id: 'c1',
        ...data,
      }));

      await service.create(
        {
          agentId: 'a1',
          channel: ChannelType.WEB,
          context: '{"foo":"bar"}',
        },
        user,
      );

      const call = prisma.conversation.create.mock.calls[0][0];
      expect(call.data.context).toEqual({ foo: 'bar' });
    });
  });

  describe('sendMessage', () => {
    const dto: SendMessageDto = { content: 'Hi' };

    it('persists the user message, calls OpenAI, and persists the assistant reply', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        agent: {
          configuration: {
            systemPrompt: 'You are a test bot.',
            model: 'gpt-4o',
            temperature: 0.5,
          },
        },
        messages: [],
      });
      prisma.message.create
        .mockResolvedValueOnce({ id: 'm-user', role: 'user', content: 'Hi' })
        .mockResolvedValueOnce({ id: 'm-asst', role: 'assistant', content: 'Hello there!' });

      const result = await service.sendMessage('c1', dto, user);

      expect(result.userMessage.id).toBe('m-user');
      expect(result.assistantMessage.id).toBe('m-asst');

      // User message persisted first.
      const userCall = prisma.message.create.mock.calls[0][0];
      expect(userCall.data.role).toBe('user');
      expect(userCall.data.content).toBe('Hi');

      // LLM called with system prompt + user message.
      const llmCall = openai.chat.completions.create.mock.calls[0][0];
      expect(llmCall.messages[0].role).toBe('system');
      expect(llmCall.messages[0].content).toContain('You are a test bot.');
      expect(llmCall.messages[llmCall.messages.length - 1]).toEqual({
        role: 'user',
        content: 'Hi',
      });

      // Assistant message persisted with tokensUsed.
      const asstCall = prisma.message.create.mock.calls[1][0];
      expect(asstCall.data.role).toBe('assistant');
      expect(asstCall.data.tokensUsed).toBe(42);
    });

    it('augments the system prompt with retrieved memories', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        agent: { configuration: { systemPrompt: 'Base.' } },
        messages: [],
      });
      memoryService.getContextForConversation.mockResolvedValue([
        { type: 'PREFERENCE', key: 'lang', value: 'en' },
      ]);
      prisma.message.create.mockResolvedValue({ id: 'm1' });

      await service.sendMessage('c1', dto, user);

      const llmCall = openai.chat.completions.create.mock.calls[0][0];
      expect(llmCall.messages[0].content).toContain('What you know about this user');
      expect(llmCall.messages[0].content).toContain('lang = en');
    });

    it('still returns the user message even when memory retrieval throws', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        agent: { configuration: null },
        messages: [],
      });
      memoryService.getContextForConversation.mockRejectedValue(new Error('boom'));
      prisma.message.create.mockResolvedValue({ id: 'm1' });

      // Should NOT throw — memory is best-effort.
      const result = await service.sendMessage('c1', dto, user);
      expect(result.userMessage.id).toBe('m1');
    });

    it('throws NotFoundException when the conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.sendMessage('missing', dto, user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('endConversation', () => {
    it('flips status to `ended` and stamps endedAt', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
      prisma.conversation.update.mockResolvedValue({});

      await service.endConversation('c1', user);

      const call = prisma.conversation.update.mock.calls[0][0];
      expect(call.data.status).toBe('ended');
      expect(call.data.endedAt).toBeInstanceOf(Date);
    });
  });

  describe('getHistory', () => {
    it('returns paginated messages ordered ascending by default', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
      prisma.message.findMany.mockResolvedValue([{ id: 'm1' }]);
      prisma.message.count.mockResolvedValue(1);

      const query: QueryHistoryDto = { page: 1, limit: 10 };
      const result = await service.getHistory('c1', query, user);

      expect(result.data).toHaveLength(1);
      const args = prisma.message.findMany.mock.calls[0][0];
      expect(args.orderBy.createdAt).toBe('asc');
    });

    it('supports descending order', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      await service.getHistory('c1', { page: 1, limit: 10, order: 'desc' }, user);

      const args = prisma.message.findMany.mock.calls[0][0];
      expect(args.orderBy.createdAt).toBe('desc');
    });
  });

  describe('deleteConversation', () => {
    it('soft-deletes by flipping status to `deleted`', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.deleteConversation('c1', user);

      expect(result.success).toBe(true);
      const call = prisma.conversation.update.mock.calls[0][0];
      expect(call.data.status).toBe('deleted');
    });
  });
});

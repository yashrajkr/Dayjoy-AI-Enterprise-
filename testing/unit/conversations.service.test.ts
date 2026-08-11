/**
 * Unit tests — ConversationsService.
 *
 * Covers:
 *  - findAll()           — pagination, filtering, sorting
 *  - findOne()           — returns conversation + messages
 *  - create()            — creates conversation
 *  - sendMessage()       — persists user msg + LLM reply, updates counters
 *  - endConversation()   — sets status=ended, writes summary
 *  - getHistory()        — paginated messages
 *  - deleteConversation()— hard delete
 *
 * OpenAI client is mocked.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { ConversationsService } from '@backend/ai/conversations.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '@backend/_shared/ai/openai.provider';
import { MemoryService } from '@backend/ai/memory.service';

import { mockPrismaService, mockOpenAI } from '@testing/helpers/mocks';
import {
  testConversation,
  testMessage,
  testAiAgent,
  testTenant,
  testAuthUser,
} from '@testing/helpers/fixtures';

describe('ConversationsService (system-wide unit)', () => {
  let service: ConversationsService;
  let prisma: ReturnType<typeof mockPrismaService>;
  let openai: ReturnType<typeof mockOpenAI>;
  let memory: { getContextForConversation: jest.Mock };

  beforeEach(async () => {
    prisma = mockPrismaService();
    openai = mockOpenAI();
    memory = {
      getContextForConversation: jest.fn().mockResolvedValue([]),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OPENAI_CLIENT, useValue: openai },
        { provide: MemoryService, useValue: memory },
      ],
    }).compile();
    service = moduleRef.get(ConversationsService);
  });

  describe('findAll()', () => {
    it('returns paginated conversations scoped to tenant', async () => {
      prisma.conversation.findMany.mockResolvedValue([testConversation]);
      prisma.conversation.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 }, testAuthUser);

      expect(result.data).toHaveLength(1);
      const whereArg = prisma.conversation.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });

    it('applies agentId + status + channel filters', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.count.mockResolvedValue(0);

      await service.findAll(
        {
          page: 1,
          limit: 20,
          agentId: testAiAgent.id,
          status: 'active',
          channel: 'WEBSITE',
        },
        testAuthUser,
      );

      const whereArg = prisma.conversation.findMany.mock.calls[0][0].where;
      expect(whereArg.agentId).toBe(testAiAgent.id);
      expect(whereArg.status).toBe('active');
      expect(whereArg.channel).toBe('WEBSITE');
    });
  });

  describe('findOne()', () => {
    it('returns the conversation with recent messages', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...testConversation,
        messages: [testMessage],
      });

      const result = await service.findOne(testConversation.id, testAuthUser);

      expect(result.id).toBe(testConversation.id);
      expect(result.messages).toHaveLength(1);
    });

    it('throws NotFoundException when the conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create()', () => {
    it('creates a conversation with the supplied agent + channel', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(testAiAgent);
      prisma.conversation.create.mockResolvedValue(testConversation);

      const result = await service.create(
        {
          agentId: testAiAgent.id,
          channel: 'WEBSITE',
          title: 'Test conversation',
        } as any,
        testAuthUser,
      );

      expect(result.id).toBe(testConversation.id);
      const createArg = prisma.conversation.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
      expect(createArg.data.status).toBe('active');
    });

    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ agentId: 'ghost' } as any, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMessage()', () => {
    it('persists the user message and an assistant reply, then increments messageCount', async () => {
      prisma.conversation.findUnique.mockResolvedValue(testConversation);
      prisma.aiAgent.findUnique.mockResolvedValue(testAiAgent);
      prisma.message.create
        .mockResolvedValueOnce({ ...testMessage, role: 'user' })
        .mockResolvedValueOnce({ ...testMessage, id: 'msg-reply', role: 'assistant' });
      prisma.conversation.update.mockResolvedValue(testConversation);

      const result = await service.sendMessage(
        testConversation.id,
        { content: 'Hello there' } as any,
        testAuthUser,
      );

      // Two messages persisted (user + assistant).
      expect(prisma.message.create).toHaveBeenCalledTimes(2);
      // OpenAI was called.
      expect(openai.chat.completions.create).toHaveBeenCalled();
      // Conversation counters updated.
      expect(prisma.conversation.update).toHaveBeenCalled();
      // Result has both messages.
      expect(result).toHaveProperty('userMessage');
      expect(result).toHaveProperty('assistantMessage');
    });

    it('injects agent system prompt + memory context into the LLM call', async () => {
      prisma.conversation.findUnique.mockResolvedValue(testConversation);
      prisma.aiAgent.findUnique.mockResolvedValue(testAiAgent);
      prisma.message.create.mockResolvedValue(testMessage);
      prisma.conversation.update.mockResolvedValue(testConversation);
      memory.getContextForConversation.mockResolvedValue([
        { type: 'PREFERENCE', content: 'prefers email' },
      ]);

      await service.sendMessage(
        testConversation.id,
        { content: 'Hello' } as any,
        testAuthUser,
      );

      const llmArg = openai.chat.completions.create.mock.calls[0][0];
      // The system prompt should contain the agent's prompt.
      const sysMsg = llmArg.messages.find((m: any) => m.role === 'system');
      expect(sysMsg).toBeDefined();
      expect(sysMsg.content).toContain(testAiAgent.systemPrompt);
    });

    it('throws NotFoundException when the conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.sendMessage(
          'ghost',
          { content: 'x' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when content is empty', async () => {
      prisma.conversation.findUnique.mockResolvedValue(testConversation);
      prisma.aiAgent.findUnique.mockResolvedValue(testAiAgent);

      await expect(
        service.sendMessage(
          testConversation.id,
          { content: '' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('endConversation()', () => {
    it('sets status=ended and writes a summary', async () => {
      prisma.conversation.findUnique.mockResolvedValue(testConversation);
      prisma.conversation.update.mockResolvedValue({
        ...testConversation,
        status: 'ended',
        summary: 'Conversation about order status',
      });

      const result = await service.endConversation(testConversation.id, testAuthUser);

      expect(result.status).toBe('ended');
      expect(result.summary).toBeDefined();
    });

    it('throws NotFoundException when the conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.endConversation('ghost', testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHistory()', () => {
    it('returns paginated messages in chronological order', async () => {
      const messages = [
        { ...testMessage, id: 'msg-1', createdAt: new Date('2025-06-01T10:00:00Z') },
        { ...testMessage, id: 'msg-2', createdAt: new Date('2025-06-01T10:01:00Z') },
      ];
      prisma.conversation.findUnique.mockResolvedValue(testConversation);
      prisma.message.findMany.mockResolvedValue(messages);
      prisma.message.count.mockResolvedValue(2);

      const result = await service.getHistory(
        testConversation.id,
        { page: 1, limit: 50 },
        testAuthUser,
      );

      expect(result.data).toHaveLength(2);
      // Sorted ascending by createdAt.
      const findArg = prisma.message.findMany.mock.calls[0][0];
      expect(findArg.orderBy).toEqual({ createdAt: 'asc' });
    });
  });

  describe('deleteConversation()', () => {
    it('hard deletes the conversation and its messages', async () => {
      prisma.conversation.findUnique.mockResolvedValue(testConversation);
      prisma.message.deleteMany.mockResolvedValue({ count: 5 });
      prisma.conversation.delete.mockResolvedValue(testConversation);

      await service.deleteConversation(testConversation.id, testAuthUser);

      expect(prisma.message.deleteMany).toHaveBeenCalledWith({
        where: { conversationId: testConversation.id },
      });
      expect(prisma.conversation.delete).toHaveBeenCalledWith({
        where: { id: testConversation.id },
      });
    });

    it('throws NotFoundException when the conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteConversation('ghost', testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

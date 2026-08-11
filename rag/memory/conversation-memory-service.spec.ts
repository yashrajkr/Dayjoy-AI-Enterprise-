import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ConversationMemoryService, SaveMemoryDto } from './conversation-memory.service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';

/**
 * Builds a minimal mock of the OpenAI client used by
 * {@link ConversationMemoryService} (`chat.completions.create`).
 */
function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Summary text.' } }],
          usage: { total_tokens: 42 },
        }),
      },
    },
  };
}

/**
 * ConversationMemoryService unit tests.
 *
 * Covers:
 *  - getShortTermMemory (fetches last N*2 messages, reverses to oldest-first).
 *  - getLongTermMemory (returns [] when no userId/customerId).
 *  - getLongTermMemory (filters by expiry + ranks by importance).
 *  - saveMemory (persists a single memory row).
 *  - summarizeConversation (calls LLM + persists summary as a CONTEXT memory).
 *  - extractMemories (calls LLM + persists each extracted memory).
 *  - extractMemories (best-effort — returns [] on LLM failure).
 */
describe('ConversationMemoryService', () => {
  let service: ConversationMemoryService;
  let prisma: any;
  let openai: ReturnType<typeof createMockOpenAI>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    prisma.message.findMany = vi.fn().mockResolvedValue([]);
    prisma.aiMemory.findMany = vi.fn().mockResolvedValue([]);
    prisma.aiMemory.create = vi.fn().mockResolvedValue({ id: 'mem-1' });
    prisma.conversation.findUnique = vi.fn().mockResolvedValue(null);
    openai = createMockOpenAI();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationMemoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: OPENAI_CLIENT, useValue: openai },
      ],
    }).compile();

    service = moduleRef.get(ConversationMemoryService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('getShortTermMemory', () => {
    it('fetches the last N*2 messages and reverses to oldest-first', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm3',
          role: 'assistant',
          content: 'answer 2',
          contentType: 'text',
          tokensUsed: 10,
          createdAt: new Date('2024-01-03'),
        },
        {
          id: 'm2',
          role: 'user',
          content: 'question 2',
          contentType: 'text',
          tokensUsed: 5,
          createdAt: new Date('2024-01-02'),
        },
        {
          id: 'm1',
          role: 'assistant',
          content: 'answer 1',
          contentType: 'text',
          tokensUsed: 10,
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const result = await service.getShortTermMemory('conv-1', 2);

      // take: 2 * 2 = 4 messages.
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conv-1' },
          take: 4,
          orderBy: { createdAt: 'desc' },
        }),
      );
      // Reversed to oldest-first.
      expect(result[0].id).toBe('m1');
      expect(result[2].id).toBe('m3');
    });
  });

  describe('getLongTermMemory', () => {
    it('returns [] when neither userId nor customerId is provided', async () => {
      const result = await service.getLongTermMemory(undefined, undefined, 5);
      expect(result).toEqual([]);
      expect(prisma.aiMemory.findMany).not.toHaveBeenCalled();
    });

    it('filters by expiry and ranks by importance desc', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([
        {
          id: 'mem-1',
          tenantId: 't1',
          agentId: null,
          userId: 'u1',
          customerId: null,
          type: 'PREFERENCE',
          key: 'preferred_language',
          value: 'en',
          importance: 8,
          expiresAt: null,
          createdAt: new Date(),
        },
      ]);

      const result = await service.getLongTermMemory('u1', undefined, 5);

      expect(prisma.aiMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { OR: [{ userId: 'u1' }] },
              {
                OR: [
                  { expiresAt: null },
                  { expiresAt: { gt: expect.any(Date) } },
                ],
              },
            ]),
          }),
          orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
          take: 5,
        }),
      );
      expect(result.length).toBe(1);
      expect(result[0].key).toBe('preferred_language');
    });
  });

  describe('saveMemory', () => {
    it('persists a single memory row', async () => {
      const dto: SaveMemoryDto = {
        tenantId: 't1',
        userId: 'u1',
        type: 'FACT',
        key: 'has_children',
        value: '2',
        importance: 7,
      };

      const result = await service.saveMemory(dto);

      expect(result.id).toBe('mem-1');
      expect(prisma.aiMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            userId: 'u1',
            type: 'FACT',
            key: 'has_children',
            value: '2',
            importance: 7,
          }),
        }),
      );
    });

    it('defaults importance to 5 when not provided', async () => {
      await service.saveMemory({
        tenantId: 't1',
        type: 'CONTEXT',
        key: 'k',
        value: 'v',
      });

      expect(prisma.aiMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ importance: 5 }),
        }),
      );
    });
  });

  describe('summarizeConversation', () => {
    it('returns "Empty conversation." when there are no messages', async () => {
      prisma.message.findMany.mockResolvedValue([]);

      const result = await service.summarizeConversation('conv-1', 't1');

      expect(result).toBe('Empty conversation.');
      expect(openai.chat.completions.create).not.toHaveBeenCalled();
    });

    it('calls the LLM and persists the summary as a CONTEXT memory', async () => {
      prisma.message.findMany.mockResolvedValue([
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
      ]);
      openai.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Summary text.' } }],
      });

      const result = await service.summarizeConversation('conv-1', 't1');

      expect(result).toBe('Summary text.');
      expect(openai.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(prisma.aiMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            type: 'CONTEXT',
            key: 'conversation_summary:conv-1',
            value: 'Summary text.',
            importance: 7,
          }),
        }),
      );
    });
  });

  describe('extractMemories', () => {
    it('returns [] when the conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      const result = await service.extractMemories('conv-1', 't1');

      expect(result).toEqual([]);
    });

    it('calls the LLM + persists each extracted memory', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        userId: 'u1',
        customerId: null,
        agentId: 'agent-1',
      });
      prisma.message.findMany.mockResolvedValue([
        { role: 'user', content: 'I prefer email.' },
      ]);
      openai.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content:
                '[{"type":"PREFERENCE","key":"preferred_contact","value":"email","importance":8}]',
            },
          },
        ],
      });
      prisma.aiMemory.create
        .mockResolvedValueOnce({ id: 'mem-1' })
        .mockResolvedValueOnce({ id: 'mem-2' });

      const result = await service.extractMemories('conv-1', 't1');

      expect(result.length).toBe(1);
      expect(result[0].key).toBe('preferred_contact');
      expect(result[0].type).toBe('PREFERENCE');
      expect(prisma.aiMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            agentId: 'agent-1',
            userId: 'u1',
            type: 'PREFERENCE',
            key: 'preferred_contact',
            value: 'email',
            importance: 8,
          }),
        }),
      );
    });

    it('returns [] on LLM failure (best-effort)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        userId: 'u1',
        customerId: null,
        agentId: null,
      });
      prisma.message.findMany.mockResolvedValue([
        { role: 'user', content: 'q1' },
      ]);
      openai.chat.completions.create.mockRejectedValue(new Error('OpenAI down'));

      const result = await service.extractMemories('conv-1', 't1');

      expect(result).toEqual([]);
    });

    it('handles malformed LLM output gracefully', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        userId: 'u1',
        customerId: null,
        agentId: null,
      });
      prisma.message.findMany.mockResolvedValue([
        { role: 'user', content: 'q1' },
      ]);
      openai.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'not json' } }],
      });

      const result = await service.extractMemories('conv-1', 't1');

      expect(result).toEqual([]);
    });
  });
});

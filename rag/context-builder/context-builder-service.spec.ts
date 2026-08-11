import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ContextBuilderService } from './context-builder.service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { RetrievalService } from '../retriever/retrieval-service';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';

/**
 * ContextBuilderService unit tests.
 *
 * Covers:
 *  - buildContext (minimal query — only retrieval is called).
 *  - buildContext (with conversationId — pulls history).
 *  - buildContext (with userId/customerId — pulls memories).
 *  - buildContext (with customerId — pulls customer profile).
 *  - buildContext (best-effort — history fetch failure doesn't break the build).
 *  - buildContext (returns the expected BuiltContext shape).
 */
describe('ContextBuilderService', () => {
  let service: ContextBuilderService;
  let prisma: any;
  let retrievalService: { retrieve: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    retrievalService = {
      retrieve: vi.fn().mockResolvedValue([
        {
          chunkId: 'c1',
          documentId: 'd1',
          sourceId: 's1',
          content: 'chunk content',
          similarity: 0.9,
          finalScore: 0.9,
          source: 'vector',
          metadata: {
            chunkIndex: 0,
            totalChunks: 1,
            documentTitle: 'Doc 1',
            documentType: 'document',
            tokenCount: 2,
            hasCode: false,
            hasTable: false,
            hasList: false,
          },
        },
      ]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContextBuilderService,
        { provide: PrismaService, useValue: prisma },
        { provide: RetrievalService, useValue: retrievalService },
      ],
    }).compile();

    service = moduleRef.get(ContextBuilderService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildContext — minimal query', () => {
    it('calls retrieval but not history/memories/profile when no IDs are provided', async () => {
      const context = await service.buildContext({
        question: 'how to take wellness pack',
        tenantId: 't1',
      });

      expect(retrievalService.retrieve).toHaveBeenCalledTimes(1);
      expect(prisma.message.findMany).not.toHaveBeenCalled();
      expect(prisma.aiMemory.findMany).not.toHaveBeenCalled();
      expect(prisma.customer.findUnique).not.toHaveBeenCalled();

      expect(context.retrievedChunks.length).toBe(1);
      expect(context.conversationHistory).toEqual([]);
      expect(context.memories).toEqual([]);
      expect(context.userProfile).toBeNull();
    });
  });

  describe('buildContext — with conversationId', () => {
    it('pulls conversation history', async () => {
      // Mock returns messages in DESCENDING order (newest first) — that's
      // what `findMany({ orderBy: { createdAt: 'desc' }})` would return.
      // The service reverses them to oldest-first for the LLM context window.
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm2',
          role: 'assistant',
          content: 'previous answer',
          createdAt: new Date('2024-01-02'),
          metadata: null,
        },
        {
          id: 'm1',
          role: 'user',
          content: 'previous question',
          createdAt: new Date('2024-01-01'),
          metadata: null,
        },
      ]);

      const context = await service.buildContext({
        question: 'follow-up',
        tenantId: 't1',
        conversationId: 'conv-1',
      });

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conv-1' },
          take: 10, // 5 turns * 2 messages
        }),
      );
      expect(context.conversationHistory.length).toBe(2);
      // After reverse() — oldest first.
      expect(context.conversationHistory[0].role).toBe('user');
      expect(context.conversationHistory[1].role).toBe('assistant');
    });
  });

  describe('buildContext — with userId', () => {
    it('pulls long-term memories for the user', async () => {
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

      const context = await service.buildContext({
        question: 'q',
        tenantId: 't1',
        userId: 'u1',
      });

      expect(prisma.aiMemory.findMany).toHaveBeenCalledTimes(1);
      expect(context.memories.length).toBe(1);
      expect(context.memories[0].key).toBe('preferred_language');
    });
  });

  describe('buildContext — with customerId', () => {
    it('pulls memories AND the customer profile', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([]);
      prisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1',
        tenantId: 't1',
        firstName: 'Jane',
        email: 'jane@example.com',
        status: 'active',
      });

      const context = await service.buildContext({
        question: 'q',
        tenantId: 't1',
        customerId: 'cust-1',
      });

      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
      });
      expect(context.userProfile).toMatchObject({ firstName: 'Jane' });
    });

    it('returns null profile when customer is deleted', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1',
        status: 'deleted',
      });

      const context = await service.buildContext({
        question: 'q',
        tenantId: 't1',
        customerId: 'cust-1',
      });

      expect(context.userProfile).toBeNull();
    });
  });

  describe('buildContext — best-effort error handling', () => {
    it('returns successfully even when the history fetch fails', async () => {
      prisma.message.findMany.mockRejectedValue(new Error('DB down'));

      const context = await service.buildContext({
        question: 'q',
        tenantId: 't1',
        conversationId: 'conv-1',
      });

      // History is empty (best-effort), but the rest of the context is intact.
      expect(context.conversationHistory).toEqual([]);
      expect(context.retrievedChunks.length).toBe(1);
    });
  });

  describe('buildContext — shape', () => {
    it('returns a BuiltContext with all expected fields', async () => {
      const context = await service.buildContext({
        question: 'q',
        tenantId: 't1',
        agentId: 'agent-1',
        channel: 'WEB',
      });

      expect(context).toHaveProperty('question', 'q');
      expect(context).toHaveProperty('retrievedChunks');
      expect(context).toHaveProperty('conversationHistory');
      expect(context).toHaveProperty('memories');
      expect(context).toHaveProperty('userProfile');
      expect(context).toHaveProperty('systemContext');
      expect(context.systemContext).toMatchObject({
        tenantId: 't1',
        agentId: 'agent-1',
        channel: 'WEB',
      });
      expect(context.systemContext).toHaveProperty('timestamp');
      expect(context).toHaveProperty('estimatedTokens');
      expect(typeof context.estimatedTokens).toBe('number');
    });
  });
});

/**
 * Unit tests — MemoryService.
 *
 * Covers:
 *  - findAll()                    — pagination, filtering by agent/user/customer
 *  - findOne()                    — returns memory
 *  - create()                     — creates memory, validates type
 *  - update()                     — updates content/importance
 *  - remove()                     — deletes memory
 *  - getByUser()                  — all memories for a user
 *  - getByCustomer()              — all memories for a customer
 *  - getContextForConversation()  — top-N memories ranked by importance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { MemoryService } from '@backend/ai/memory.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { mockPrismaService } from '@testing/helpers/mocks';
import {
  testAiMemory,
  testConversation,
  testTenant,
  testAuthUser,
  testAiAgent,
} from '@testing/helpers/fixtures';

describe('MemoryService (system-wide unit)', () => {
  let service: MemoryService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MemoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(MemoryService);
  });

  describe('findAll()', () => {
    it('returns paginated memories scoped to tenant', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([testAiMemory]);
      prisma.aiMemory.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 50 }, testAuthUser);

      expect(result.data).toHaveLength(1);
      const whereArg = prisma.aiMemory.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });

    it('filters by agentId / userId / customerId / type', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([]);
      prisma.aiMemory.count.mockResolvedValue(0);

      await service.findAll(
        {
          page: 1,
          limit: 50,
          agentId: testAiAgent.id,
          userId: 'user-1',
          customerId: 'cust-1',
          type: 'PREFERENCE',
        },
        testAuthUser,
      );

      const whereArg = prisma.aiMemory.findMany.mock.calls[0][0].where;
      expect(whereArg.agentId).toBe(testAiAgent.id);
      expect(whereArg.userId).toBe('user-1');
      expect(whereArg.customerId).toBe('cust-1');
      expect(whereArg.type).toBe('PREFERENCE');
    });
  });

  describe('findOne()', () => {
    it('returns the memory', async () => {
      prisma.aiMemory.findUnique.mockResolvedValue(testAiMemory);

      const result = await service.findOne(testAiMemory.id, testAuthUser);

      expect(result.id).toBe(testAiMemory.id);
    });

    it('throws NotFoundException when the memory does not exist', async () => {
      prisma.aiMemory.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create()', () => {
    it('creates a memory with the supplied type and content', async () => {
      prisma.aiMemory.create.mockResolvedValue(testAiMemory);

      const result = await service.create(
        {
          type: 'PREFERENCE',
          content: 'prefers email over SMS',
          importance: 0.8,
          agentId: testAiAgent.id,
        } as any,
        testAuthUser,
      );

      expect(result.id).toBe(testAiMemory.id);
      const createArg = prisma.aiMemory.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
    });

    it('throws BadRequestException when type is invalid', async () => {
      await expect(
        service.create(
          { type: 'INVALID', content: 'x' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when content is empty', async () => {
      await expect(
        service.create(
          { type: 'FACT', content: '' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update()', () => {
    it('updates content and importance', async () => {
      prisma.aiMemory.findUnique.mockResolvedValue(testAiMemory);
      prisma.aiMemory.update.mockResolvedValue({
        ...testAiMemory,
        content: 'Updated',
        importance: 0.9,
      });

      const result = await service.update(
        testAiMemory.id,
        { content: 'Updated', importance: 0.9 } as any,
        testAuthUser,
      );

      expect(result.content).toBe('Updated');
      expect(result.importance).toBe(0.9);
    });

    it('throws NotFoundException when the memory does not exist', async () => {
      prisma.aiMemory.findUnique.mockResolvedValue(null);

      await expect(
        service.update('ghost', { content: 'x' } as any, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('deletes the memory', async () => {
      prisma.aiMemory.findUnique.mockResolvedValue(testAiMemory);
      prisma.aiMemory.delete.mockResolvedValue(testAiMemory);

      await service.remove(testAiMemory.id, testAuthUser);

      expect(prisma.aiMemory.delete).toHaveBeenCalledWith({
        where: { id: testAiMemory.id },
      });
    });

    it('throws NotFoundException when the memory does not exist', async () => {
      prisma.aiMemory.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getByUser()', () => {
    it('returns all memories for the user, ordered by importance desc', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([testAiMemory]);

      const result = await service.getByUser('user-1', testAuthUser);

      expect(result).toHaveLength(1);
      const findArg = prisma.aiMemory.findMany.mock.calls[0][0];
      expect(findArg.where.userId).toBe('user-1');
      expect(findArg.orderBy).toEqual({ importance: 'desc' });
    });
  });

  describe('getByCustomer()', () => {
    it('returns all memories for the customer', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([testAiMemory]);

      const result = await service.getByCustomer('cust-1', testAuthUser);

      const findArg = prisma.aiMemory.findMany.mock.calls[0][0];
      expect(findArg.where.customerId).toBe('cust-1');
    });
  });

  describe('getContextForConversation()', () => {
    it('returns top-N memories ranked by importance for the conversation user + customer', async () => {
      prisma.conversation.findUnique.mockResolvedValue(testConversation);
      prisma.aiMemory.findMany.mockResolvedValue([
        { ...testAiMemory, importance: 0.9 },
        { ...testAiMemory, importance: 0.7 },
      ]);

      const result = await service.getContextForConversation(
        testConversation.id,
        testAuthUser,
      );

      expect(result).toHaveLength(2);
      // Top-N limit enforced.
      const findArg = prisma.aiMemory.findMany.mock.calls[0][0];
      expect(findArg.take).toBeLessThanOrEqual(5);
      expect(findArg.orderBy).toEqual({ importance: 'desc' });
    });

    it('throws NotFoundException when the conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.getContextForConversation('ghost', testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

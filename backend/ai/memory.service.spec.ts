import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { MemoryService } from './memory.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { CreateMemoryDto, MemoryType, UpdateMemoryDto } from './dto/memory.dto';
import { AuthUser } from './auth-user';

/**
 * MemoryService unit tests.
 *
 * Covers:
 *  - findAll (filters + pagination + tenant scoping)
 *  - findOne (tenant isolation / 404)
 *  - create (ISO date parsing + tenantId stamping)
 *  - update (partial patch + ISO date parsing)
 *  - remove (hard delete after tenant check)
 *  - getByUser / getByCustomer (scope shortcuts)
 *  - getContextForConversation (OR of scopes, expiresAt filter, limit)
 */
describe('MemoryService', () => {
  let service: MemoryService;
  // `prisma` is typed `any` because we extend the shared mock inline
  // with `aiMemory.count` (not on the static mock type).
  let prisma: any;
  const user: AuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    // Extend the shared mock with `aiMemory.count` — used by findAll.
    Object.assign(prisma.aiMemory, {
      count: vi.fn().mockResolvedValue(0),
    });
    const moduleRef = await Test.createTestingModule({
      providers: [MemoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(MemoryService);
  });

  describe('findAll', () => {
    it('filters by agentId/userId/customerId/type + paginates', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([{ id: 'm1' }]);
      prisma.aiMemory.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 1, limit: 10, agentId: 'a1', userId: 'u2', type: MemoryType.PREFERENCE },
        user,
      );

      expect(result.data).toHaveLength(1);
      const where = prisma.aiMemory.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(where.agentId).toBe('a1');
      expect(where.userId).toBe('u2');
      expect(where.type).toBe(MemoryType.PREFERENCE);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.aiMemory.findUnique.mockResolvedValue({ id: 'm1', tenantId: 'other' });
      await expect(service.findOne('m1', user)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('persists the memory with tenantId stamped from currentUser', async () => {
      prisma.aiMemory.create.mockImplementation(async ({ data }: any) => ({
        id: 'm1',
        ...data,
      }));

      const dto: CreateMemoryDto = {
        userId: 'u2',
        type: MemoryType.FACT,
        key: 'favorite_color',
        value: 'blue',
        importance: 8,
      };
      const result = await service.create(dto, user);

      expect(result.id).toBe('m1');
      const call = prisma.aiMemory.create.mock.calls[0][0];
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.importance).toBe(8);
    });

    it('defaults importance to 5 when not supplied', async () => {
      prisma.aiMemory.create.mockResolvedValue({ id: 'm1' });

      await service.create(
        {
          type: MemoryType.CONTEXT,
          key: 'k',
          value: 'v',
        },
        user,
      );

      expect(prisma.aiMemory.create.mock.calls[0][0].data.importance).toBe(5);
    });

    it('parses expiresAt into a Date when supplied', async () => {
      prisma.aiMemory.create.mockResolvedValue({ id: 'm1' });

      await service.create(
        {
          type: MemoryType.CONTEXT,
          key: 'k',
          value: 'v',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        user,
      );

      const expiresAt = prisma.aiMemory.create.mock.calls[0][0].data.expiresAt;
      expect(expiresAt).toBeInstanceOf(Date);
    });

    it('throws BadRequestException when expiresAt is invalid', async () => {
      await expect(
        service.create(
          { type: MemoryType.CONTEXT, key: 'k', value: 'v', expiresAt: 'not-a-date' },
          user,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('patches the supplied fields', async () => {
      prisma.aiMemory.findUnique.mockResolvedValue({ id: 'm1', tenantId: 't1' });
      prisma.aiMemory.update.mockResolvedValue({ id: 'm1' });

      const dto: UpdateMemoryDto = { value: 'updated' };
      await service.update('m1', dto, user);

      const call = prisma.aiMemory.update.mock.calls[0][0];
      expect(call.data.value).toBe('updated');
      expect(Object.keys(call.data)).toEqual(['value']);
    });
  });

  describe('remove', () => {
    it('hard-deletes after tenant check', async () => {
      prisma.aiMemory.findUnique.mockResolvedValue({ id: 'm1', tenantId: 't1' });
      prisma.aiMemory.delete.mockResolvedValue({});

      const result = await service.remove('m1', user);
      expect(result.success).toBe(true);
      expect(prisma.aiMemory.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });

  describe('getByUser / getByCustomer', () => {
    it('scopes by userId + tenant', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([]);
      await service.getByUser('u2', user);
      const where = prisma.aiMemory.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe('u2');
      expect(where.tenantId).toBe('t1');
    });

    it('scopes by customerId + tenant', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([]);
      await service.getByCustomer('c1', user);
      const where = prisma.aiMemory.findMany.mock.calls[0][0].where;
      expect(where.customerId).toBe('c1');
      expect(where.tenantId).toBe('t1');
    });
  });

  describe('getContextForConversation', () => {
    it('builds an OR across userId/customerId/agentId scopes and limits to 5', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        tenantId: 't1',
        agentId: 'a1',
        userId: 'u2',
        customerId: 'c1',
      });
      prisma.aiMemory.findMany.mockResolvedValue([{ id: 'm1' }]);

      const result = await service.getContextForConversation('conv1', user);

      expect(result).toHaveLength(1);
      const args = prisma.aiMemory.findMany.mock.calls[0][0];
      expect(args.take).toBe(5);
      // AND-wrapped OR clauses (scope + expiresAt filter).
      expect(args.where.AND).toBeDefined();
      expect(args.where.AND[0].OR).toEqual(
        expect.arrayContaining([
          { userId: 'u2' },
          { customerId: 'c1' },
          { agentId: 'a1' },
        ]),
      );
    });

    it('returns [] when the conversation has no userId/customerId/agentId', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        tenantId: 't1',
        agentId: null,
        userId: null,
        customerId: null,
      });
      const result = await service.getContextForConversation('conv1', user);
      expect(result).toEqual([]);
      expect(prisma.aiMemory.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException on cross-tenant conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ tenantId: 'other' });
      await expect(
        service.getContextForConversation('conv1', user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

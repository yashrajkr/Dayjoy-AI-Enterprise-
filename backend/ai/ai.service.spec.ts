import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AiService } from './ai.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { QueryAgentsDto } from './dto/query-agents.dto';
import { CreateAgentDto, UpdateAgentDto, AgentType } from './dto/create-agent.dto';
import { AuthUser } from './auth-user';

/**
 * AiService unit tests.
 *
 * Covers:
 *  - findAll (pagination + filters + tenant scoping)
 *  - findOne (tenant isolation / 404)
 *  - create (tenantId stamped from currentUser)
 *  - update (partial patch + tenant isolation)
 *  - remove (soft-delete — flips status to `archived`)
 *  - getCapabilities (returns the agent's declared tool list)
 */
describe('AiService', () => {
  let service: AiService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  const user: AuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AiService);
  });

  describe('findAll', () => {
    it('returns paginated agents scoped to the tenant', async () => {
      prisma.aiAgent.findMany.mockResolvedValue([{ id: 'a1', tenantId: 't1' }]);
      prisma.aiAgent.count.mockResolvedValue(1);

      const query: QueryAgentsDto = { page: 1, limit: 10 };
      const result = await service.findAll(query, user);

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);

      const args = prisma.aiAgent.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t1');
      expect(args.skip).toBe(0);
      expect(args.take).toBe(10);
    });

    it('applies type + status + search filters', async () => {
      prisma.aiAgent.findMany.mockResolvedValue([]);
      prisma.aiAgent.count.mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 20, type: 'SUPPORT', status: 'active', search: 'help' },
        user,
      );

      const where = prisma.aiAgent.findMany.mock.calls[0][0].where;
      expect(where.type).toBe('SUPPORT');
      expect(where.status).toBe('active');
      expect(where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.objectContaining({ contains: 'help' }) }),
        ]),
      );
    });
  });

  describe('findOne', () => {
    it('returns the agent when tenant matches', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({ id: 'a1', tenantId: 't1' });
      const result = await service.findOne('a1', user);
      expect(result.id).toBe('a1');
    });

    it('throws NotFoundException when tenantId does not match', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({ id: 'a1', tenantId: 'other' });
      await expect(service.findOne('a1', user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing', user)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates an agent with tenantId stamped from currentUser', async () => {
      prisma.aiAgent.create.mockImplementation(async ({ data }: any) => ({
        id: 'a1',
        ...data,
      }));

      const dto: CreateAgentDto = {
        name: 'Support Bot',
        type: AgentType.SUPPORT,
        description: 'Front-line support',
      };
      const result = await service.create(dto, user);

      expect(result.id).toBe('a1');
      const call = prisma.aiAgent.create.mock.calls[0][0];
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.name).toBe('Support Bot');
      expect(call.data.type).toBe(AgentType.SUPPORT);
      expect(call.data.status).toBe('active');
    });
  });

  describe('update', () => {
    it('patches only the supplied fields', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({ id: 'a1', tenantId: 't1' });
      prisma.aiAgent.update.mockImplementation(async ({ data }: any) => ({
        id: 'a1',
        ...data,
      }));

      const dto: UpdateAgentDto = { name: 'Renamed' };
      const result = await service.update('a1', dto, user);

      expect(result.name).toBe('Renamed');
      const call = prisma.aiAgent.update.mock.calls[0][0];
      expect(call.data.name).toBe('Renamed');
      // Only `name` should be in the patch — no other fields.
      expect(Object.keys(call.data)).toEqual(['name']);
    });
  });

  describe('remove', () => {
    it('soft-deletes by flipping status to `archived`', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({ id: 'a1', tenantId: 't1' });
      prisma.aiAgent.update.mockResolvedValue({});

      const result = await service.remove('a1', user);

      expect(result.success).toBe(true);
      const call = prisma.aiAgent.update.mock.calls[0][0];
      expect(call.data.status).toBe('archived');
    });
  });

  describe('getCapabilities', () => {
    it('returns the agent`s declared tool list', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({
        id: 'a1',
        tenantId: 't1',
        capabilities: { tools: ['search_knowledge', 'create_lead'] },
      });

      const result = await service.getCapabilities('a1', user);
      expect(result.tools).toEqual(['search_knowledge', 'create_lead']);
    });

    it('returns an empty list when capabilities is null', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({
        id: 'a1',
        tenantId: 't1',
        capabilities: null,
      });

      const result = await service.getCapabilities('a1', user);
      expect(result.tools).toEqual([]);
    });

    it('returns object keys when capabilities is a non-canonical shape', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({
        id: 'a1',
        tenantId: 't1',
        capabilities: { canSearch: true, canBook: true },
      });

      const result = await service.getCapabilities('a1', user);
      expect(result.tools).toEqual(['canSearch', 'canBook']);
    });
  });
});

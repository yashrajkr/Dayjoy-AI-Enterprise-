/**
 * Unit tests — AiService (AI agents CRUD).
 *
 * Covers:
 *  - findAll()         — pagination, filtering, sorting
 *  - findOne()         — returns agent
 *  - create()          — creates agent
 *  - update()          — updates fields
 *  - remove()          — soft delete (status = archived)
 *  - getCapabilities() — returns agent tools + memory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { AiService } from '@backend/ai/ai.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { mockPrismaService } from '@testing/helpers/mocks';
import {
  testAiAgent,
  testTenant,
  testAuthUser,
} from '@testing/helpers/fixtures';

describe('AiService (system-wide unit)', () => {
  let service: AiService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AiService);
  });

  describe('findAll()', () => {
    it('returns paginated agents scoped to tenant', async () => {
      prisma.aiAgent.findMany.mockResolvedValue([testAiAgent]);
      prisma.aiAgent.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 }, testAuthUser);

      expect(result.data).toHaveLength(1);
      const whereArg = prisma.aiAgent.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });

    it('excludes archived agents by default', async () => {
      prisma.aiAgent.findMany.mockResolvedValue([]);
      prisma.aiAgent.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 }, testAuthUser);

      const whereArg = prisma.aiAgent.findMany.mock.calls[0][0].where;
      expect(whereArg.status).not.toBe('archived');
    });

    it('applies type and status filters', async () => {
      prisma.aiAgent.findMany.mockResolvedValue([]);
      prisma.aiAgent.count.mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 20, type: 'CUSTOMER_SUPPORT', status: 'active' },
        testAuthUser,
      );

      const whereArg = prisma.aiAgent.findMany.mock.calls[0][0].where;
      expect(whereArg.type).toBe('CUSTOMER_SUPPORT');
      expect(whereArg.status).toBe('active');
    });

    it('applies search filter on name + description', async () => {
      prisma.aiAgent.findMany.mockResolvedValue([]);
      prisma.aiAgent.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, search: 'dayjoy' }, testAuthUser);

      const whereArg = prisma.aiAgent.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
    });
  });

  describe('findOne()', () => {
    it('returns the agent', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(testAiAgent);

      const result = await service.findOne(testAiAgent.id, testAuthUser);

      expect(result.id).toBe(testAiAgent.id);
    });

    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create()', () => {
    it('creates an agent with the supplied configuration', async () => {
      prisma.aiAgent.create.mockResolvedValue(testAiAgent);

      const result = await service.create(
        {
          name: 'Dayjoy Assistant',
          description: 'Main AI assistant',
          type: 'CUSTOMER_SUPPORT',
          model: 'gpt-4o',
          systemPrompt: 'You are helpful.',
          temperature: 0.7,
          maxTokens: 1000,
          toolsEnabled: true,
        } as any,
        testAuthUser,
      );

      expect(result.id).toBe(testAiAgent.id);
      const createArg = prisma.aiAgent.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
      expect(createArg.data.status).toBe('active');
    });
  });

  describe('update()', () => {
    it('updates agent fields', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(testAiAgent);
      prisma.aiAgent.update.mockResolvedValue({
        ...testAiAgent,
        temperature: 0.5,
      });

      const result = await service.update(
        testAiAgent.id,
        { temperature: 0.5 } as any,
        testAuthUser,
      );

      expect(result.temperature).toBe(0.5);
    });

    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);

      await expect(
        service.update('ghost', { name: 'x' } as any, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('soft deletes the agent (status = archived)', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(testAiAgent);
      prisma.aiAgent.update.mockResolvedValue({
        ...testAiAgent,
        status: 'archived',
      });

      await service.remove(testAiAgent.id, testAuthUser);

      const updateArg = prisma.aiAgent.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('archived');
      expect(prisma.aiAgent.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCapabilities()', () => {
    it('returns the agent tools + memory configuration', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({
        ...testAiAgent,
        toolsEnabled: true,
      });

      const result = await service.getCapabilities(testAiAgent.id, testAuthUser);

      expect(result).toHaveProperty('tools');
      expect(result).toHaveProperty('memory');
    });

    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);

      await expect(service.getCapabilities('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

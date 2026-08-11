/**
 * Unit tests — ToolsService.
 *
 * The ToolsService exposes a registry of 8 LLM-callable tools:
 *  - search_knowledge
 *  - search_products
 *  - customer_lookup
 *  - distributor_lookup
 *  - create_lead
 *  - book_appointment
 *  - create_support_ticket
 *  - human_transfer
 *
 * Covers:
 *  - listTools()             — returns all 8 tool definitions
 *  - execute()               — dispatches to the right handler, throws on unknown tool
 *  - executeForConversation()— execute + analytics_event persistence
 *  - per-tool happy paths    — each tool's handler with mocked Prisma deps
 *  - per-tool error paths    — not-found, bad-args
 *
 * Prisma + KnowledgeService + OpenAI client are mocked.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { ToolsService } from '@backend/ai/tools.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '@backend/_shared/ai/openai.provider';
import { KnowledgeService } from '@backend/knowledge/knowledge.service';

import { mockPrismaService, mockOpenAI } from '@testing/helpers/mocks';
import {
  testTenant,
  testAuthUser,
  testCustomer,
  testDistributor,
  testLead,
  testConversation,
} from '@testing/helpers/fixtures';

describe('ToolsService (system-wide unit)', () => {
  let service: ToolsService;
  let prisma: ReturnType<typeof mockPrismaService>;
  let openai: ReturnType<typeof mockOpenAI>;
  let knowledge: { query: jest.Mock };

  beforeEach(async () => {
    prisma = mockPrismaService();
    openai = mockOpenAI();
    knowledge = {
      query: jest.fn().mockResolvedValue({
        answer: 'mock answer',
        citations: [{ chunkId: 'c1', documentTitle: 'doc', content: '...', score: 0.9 }],
        latencyMs: 42,
      }),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OPENAI_CLIENT, useValue: openai },
        { provide: KnowledgeService, useValue: knowledge },
      ],
    }).compile();
    service = moduleRef.get(ToolsService);
  });

  // -------------------------------------------------------------------
  // listTools()
  // -------------------------------------------------------------------

  describe('listTools()', () => {
    it('returns all 8 registered tools with name + description', () => {
      const tools = service.listTools();

      expect(tools).toHaveLength(8);
      const names = tools.map((t: any) => t.name).sort();
      expect(names).toEqual(
        [
          'book_appointment',
          'create_lead',
          'create_support_ticket',
          'customer_lookup',
          'distributor_lookup',
          'human_transfer',
          'search_knowledge',
          'search_products',
        ].sort(),
      );
      // Each tool must have a non-empty description.
      for (const t of tools) {
        expect(typeof t.description).toBe('string');
        expect((t.description as string).length).toBeGreaterThan(10);
      }
    });
  });

  // -------------------------------------------------------------------
  // execute()
  // -------------------------------------------------------------------

  describe('execute()', () => {
    it('throws BadRequestException for an unknown tool name', async () => {
      await expect(
        service.execute('nonexistent_tool', {}, testAuthUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('dispatches to the search_knowledge handler', async () => {
      const result = await service.execute(
        'search_knowledge',
        { query: 'how to use vitamin c serum' },
        testAuthUser,
      );

      expect(knowledge.query).toHaveBeenCalled();
      expect(result).toHaveProperty('answer');
      expect(result).toHaveProperty('citations');
    });

    it('dispatches to the search_products handler', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Vitamin C Serum', price: 49.99 },
      ]);

      const result = await service.execute(
        'search_products',
        { query: 'vitamin' },
        testAuthUser,
      );

      expect(prisma.product.findMany).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    it('dispatches to the customer_lookup handler (by email)', async () => {
      prisma.customer.findFirst.mockResolvedValue(testCustomer);

      const result = await service.execute(
        'customer_lookup',
        { email: testCustomer.email },
        testAuthUser,
      );

      const findArg = prisma.customer.findFirst.mock.calls[0][0];
      expect(findArg.where.tenantId).toBe(testTenant.id);
      expect(result.id).toBe(testCustomer.id);
    });

    it('throws NotFoundException when customer_lookup finds no match', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.execute('customer_lookup', { email: 'ghost@x.test' }, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('dispatches to the distributor_lookup handler', async () => {
      prisma.distributor.findFirst.mockResolvedValue(testDistributor);

      const result = await service.execute(
        'distributor_lookup',
        { email: testDistributor.email },
        testAuthUser,
      );

      expect(result.id).toBe(testDistributor.id);
    });

    it('throws NotFoundException when distributor_lookup finds no match', async () => {
      prisma.distributor.findFirst.mockResolvedValue(null);

      await expect(
        service.execute('distributor_lookup', { email: 'ghost@x.test' }, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('dispatches to the create_lead handler', async () => {
      prisma.lead.create.mockResolvedValue(testLead);

      const result = await service.execute(
        'create_lead',
        { firstName: 'Larry', email: 'larry@example.com', source: 'AI' },
        testAuthUser,
      );

      const createArg = prisma.lead.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
      expect(result.id).toBe(testLead.id);
    });

    it('throws BadRequestException when create_lead is missing required fields', async () => {
      await expect(
        service.execute('create_lead', {}, testAuthUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('dispatches to the book_appointment handler', async () => {
      prisma.appointment.create.mockResolvedValue({
        id: 'apt-1',
        title: 'Test apt',
        scheduledAt: new Date(),
      });

      const result = await service.execute(
        'book_appointment',
        { title: 'Test apt', scheduledAt: '2025-07-01T10:00:00Z' },
        testAuthUser,
      );

      expect(prisma.appointment.create).toHaveBeenCalled();
      expect(result.id).toBe('apt-1');
    });

    it('dispatches to the create_support_ticket handler', async () => {
      prisma.supportTicket.create.mockResolvedValue({
        id: 'tkt-1',
        ticketNumber: 'TKT-2025-000001',
        subject: 'Test ticket',
      });

      const result = await service.execute(
        'create_support_ticket',
        { subject: 'Test ticket', description: 'A test' },
        testAuthUser,
      );

      expect(prisma.supportTicket.create).toHaveBeenCalled();
      expect(result.id).toBe('tkt-1');
    });

    it('dispatches to the human_transfer handler', async () => {
      prisma.conversation.findUnique.mockResolvedValue(testConversation);
      prisma.conversation.update.mockResolvedValue(testConversation);
      prisma.notification.create.mockResolvedValue({});

      const result = await service.execute(
        'human_transfer',
        { conversationId: testConversation.id, reason: 'user requested' },
        testAuthUser,
      );

      expect(prisma.conversation.update).toHaveBeenCalled();
      expect(prisma.notification.create).toHaveBeenCalled();
      expect(result).toHaveProperty('transferred', true);
    });

    it('throws NotFoundException when human_transfer references a non-existent conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.execute(
          'human_transfer',
          { conversationId: 'ghost' },
          testAuthUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // executeForConversation()
  // -------------------------------------------------------------------

  describe('executeForConversation()', () => {
    it('executes the tool and persists an analytics_event row', async () => {
      prisma.conversation.findUnique.mockResolvedValue(testConversation);
      knowledge.query.mockResolvedValue({ answer: 'x', citations: [], latencyMs: 5 });
      prisma.analyticsEvent.create.mockResolvedValue({});

      await service.executeForConversation(
        'search_knowledge',
        { query: 'x' },
        testConversation.id,
        testAuthUser,
      );

      expect(prisma.analyticsEvent.create).toHaveBeenCalled();
      const eventArg = prisma.analyticsEvent.create.mock.calls[0][0];
      expect(eventArg.data.eventType).toBe('tool_execution');
      expect(eventArg.data.conversationId).toBe(testConversation.id);
    });
  });
});

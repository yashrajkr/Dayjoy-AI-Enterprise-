import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ToolsService } from './tools.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../_shared/ai/openai.provider';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { AuthUser } from './auth-user';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ConfigService } from '@nestjs/config';

/**
 * Build a minimal OpenAI stub — `ToolsService` doesn't call OpenAI
 * directly today (it's reserved for future LLM-driven tool selection),
 * but it must still be injectable.
 */
function createMockOpenAI() {
  return {
    chat: { completions: { create: vi.fn() } },
    embeddings: { create: vi.fn() },
  };
}

/**
 * ToolsService unit tests.
 *
 * Covers:
 *  - listTools (returns the registered tool definitions)
 *  - execute (happy path + 404 for unknown tool)
 *  - executeForConversation (persists analyticsEvent on success + on error)
 *  - search_knowledge (delegates to KnowledgeService.query)
 *  - search_products (Prisma filter)
 *  - customer_lookup / distributor_lookup (404 + email-precedence)
 *  - create_lead / book_appointment / create_support_ticket (validation)
 *  - human_transfer (conversation flip + ticket + notification)
 */
describe('ToolsService', () => {
  let service: ToolsService;
  // `prisma` is typed `any` because we extend the shared mock inline
  // with `analyticsEvent` (not on the static mock type).
  let prisma: any;
  let knowledgeService: { query: ReturnType<typeof vi.fn> };
  const user: AuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    // Add stubs for the models that aren't in the shared mock but that
    // ToolsService touches. We attach them via `Object.assign` so the
    // mock stays a drop-in for the real PrismaService shape.
    Object.assign(prisma, {
      analyticsEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    });

    knowledgeService = {
      query: vi.fn().mockResolvedValue({
        answer: 'answer text',
        citations: [{ chunkId: 'c1', documentId: 'd1', documentTitle: 'Doc', content: 'x', score: 1 }],
        latencyMs: 12,
        queryId: 'q-1',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KnowledgeService, useValue: knowledgeService },
        { provide: OPENAI_CLIENT, useValue: createMockOpenAI() },
        { provide: ConfigService, useValue: { get: vi.fn() } },
      ],
    }).compile();

    service = moduleRef.get(ToolsService);
  });

  describe('listTools', () => {
    it('returns the 8 registered tools', async () => {
      const tools = await service.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'search_knowledge',
          'search_products',
          'customer_lookup',
          'distributor_lookup',
          'create_lead',
          'book_appointment',
          'create_support_ticket',
          'human_transfer',
        ]),
      );
      expect(tools).toHaveLength(8);
    });
  });

  describe('execute', () => {
    it('throws NotFoundException for an unknown tool', async () => {
      await expect(service.execute('nope', {}, user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('executeForConversation', () => {
    it('persists a tool_execution analyticsEvent on success', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        tenantId: 't1',
        agentId: 'a1',
        customerId: 'c1',
      });
      prisma.product.findMany.mockResolvedValue([{ id: 'p1' }]);

      const result = await service.executeForConversation(
        'conv1',
        'search_products',
        { query: 'foo' },
        user,
      );

      expect(result.products).toBeDefined();
      expect(prisma.analyticsEvent.create).toHaveBeenCalled();
      const evt = prisma.analyticsEvent.create.mock.calls[0][0];
      expect(evt.data.eventType).toBe('tool_execution');
      expect(evt.data.eventData.toolName).toBe('search_products');
      expect(evt.data.eventData.success).toBe(true);
    });

    it('persists a tool_execution analyticsEvent (success=false) on failure, then re-throws', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        tenantId: 't1',
        agentId: 'a1',
        customerId: null,
      });

      await expect(
        service.executeForConversation('conv1', 'create_lead', {}, user),
      ).rejects.toBeInstanceOf(BadRequestException);

      const evt = prisma.analyticsEvent.create.mock.calls[0][0];
      expect(evt.data.eventData.success).toBe(false);
      expect(evt.data.eventData.errorMessage).toBeDefined();
    });
  });

  describe('search_knowledge', () => {
    it('delegates to KnowledgeService.query', async () => {
      const result = await service.execute(
        'search_knowledge',
        { query: 'pricing' },
        user,
      );
      expect(knowledgeService.query).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'pricing' }),
        user,
      );
      expect(result.answer).toBe('answer text');
    });

    it('throws BadRequestException when `query` is missing', async () => {
      await expect(
        service.execute('search_knowledge', {}, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('customer_lookup', () => {
    it('prefers email when both email + phone are supplied', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
      await service.execute(
        'customer_lookup',
        { email: 'a@b.com', phone: '555' },
        user,
      );
      const where = prisma.customer.findFirst.mock.calls[0][0].where;
      expect(where.email).toBe('a@b.com');
      expect(where.phone).toBeUndefined();
    });

    it('returns found=false when the customer does not exist', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      const result = await service.execute(
        'customer_lookup',
        { email: 'a@b.com' },
        user,
      );
      expect(result.found).toBe(false);
    });

    it('throws BadRequestException when neither email nor phone is supplied', async () => {
      await expect(
        service.execute('customer_lookup', {}, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('distributor_lookup', () => {
    it('prefers distributorCode when supplied', async () => {
      prisma.distributor.findFirst.mockResolvedValue({ id: 'd1' });
      await service.execute(
        'distributor_lookup',
        { distributorCode: 'D-001', email: 'a@b.com', phone: '555' },
        user,
      );
      const where = prisma.distributor.findFirst.mock.calls[0][0].where;
      expect(where.distributorCode).toBe('D-001');
    });

    it('throws BadRequestException when no identifier is supplied', async () => {
      await expect(
        service.execute('distributor_lookup', {}, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create_lead', () => {
    it('creates a lead with default status NEW', async () => {
      prisma.lead.create.mockImplementation(async ({ data }: any) => ({
        id: 'l1',
        ...data,
      }));

      const result = await service.execute(
        'create_lead',
        { firstName: 'Jane', email: 'jane@x.com' },
        user,
      );

      expect(result.lead.id).toBe('l1');
      const call = prisma.lead.create.mock.calls[0][0];
      expect(call.data.status).toBe('NEW');
      expect(call.data.tenantId).toBe('t1');
    });

    it('throws BadRequestException when no identifier is supplied', async () => {
      await expect(
        service.execute('create_lead', {}, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('book_appointment', () => {
    it('creates an appointment with default 30-minute duration', async () => {
      prisma.appointment.create.mockImplementation(async ({ data }: any) => ({
        id: 'ap1',
        ...data,
      }));

      const result = await service.execute(
        'book_appointment',
        { title: 'Demo', scheduledAt: '2099-01-01T10:00:00.000Z' },
        user,
      );

      expect(result.appointment.id).toBe('ap1');
      const call = prisma.appointment.create.mock.calls[0][0];
      expect(call.data.durationMinutes).toBe(30);
      expect(call.data.status).toBe('scheduled');
    });

    it('throws BadRequestException when title is missing', async () => {
      await expect(
        service.execute(
          'book_appointment',
          { scheduledAt: '2099-01-01T10:00:00.000Z' },
          user,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when scheduledAt is invalid', async () => {
      await expect(
        service.execute(
          'book_appointment',
          { title: 'Demo', scheduledAt: 'not-a-date' },
          user,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create_support_ticket', () => {
    it('creates a ticket with default medium priority', async () => {
      prisma.supportTicket.create.mockImplementation(async ({ data }: any) => ({
        id: 't1',
        ...data,
      }));

      const result = await service.execute(
        'create_support_ticket',
        { subject: 'Broken', description: 'It does not work' },
        user,
      );

      const call = prisma.supportTicket.create.mock.calls[0][0];
      expect(call.data.priority).toBe('medium');
      expect(call.data.status).toBe('open');
      expect(result.ticket.id).toBe('t1');
    });

    it('throws BadRequestException when subject is missing', async () => {
      await expect(
        service.execute('create_support_ticket', { description: 'x' }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('human_transfer', () => {
    it('flips conversation status, opens a ticket, and queues a notification', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv1',
        tenantId: 't1',
        customerId: 'c1',
      });
      prisma.conversation.update.mockResolvedValue({ id: 'conv1' });
      prisma.supportTicket.create.mockResolvedValue({ id: 'tkt-1' });
      prisma.notification.create.mockResolvedValue({ id: 'n1' });

      const result = await service.execute(
        'human_transfer',
        { conversationId: 'conv1', reason: 'User asked for human' },
        user,
      );

      expect(result.transferred).toBe(true);
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv1' },
        data: { status: 'transferred' },
      });
      expect(prisma.supportTicket.create).toHaveBeenCalled();
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('throws BadRequestException when conversationId is missing', async () => {
      await expect(
        service.execute('human_transfer', { reason: 'x' }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        service.execute('human_transfer', { conversationId: 'missing' }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

/**
 * Vapi Tool Tests
 *
 * Real unit tests for the 8 tools under `vapi/tools/`. Each tool is
 * instantiated directly with mocked backend-service dependencies (so we
 * exercise the real `execute()` code path — validation + try/catch +
 * result shaping + `speak` formatting — without hitting a database).
 *
 * Coverage per tool:
 *   - Happy path (service returns data → tool returns success + data +
 *     `speak` formatted for voice).
 *   - Validation failure (missing required args → tool returns success
 *     false + error + friendly `speak`).
 *   - Backend error (service throws → tool catches + returns structured
 *     failure).
 *
 * Run with: `vitest run vapi/tests/vapi-tool-tests.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { VapiSearchKnowledgeTool } from '../tools/vapi-search-knowledge-tool';
import { VapiSearchProductsTool } from '../tools/vapi-search-products-tool';
import { VapiCustomerLookupTool } from '../tools/vapi-customer-lookup-tool';
import { VapiDistributorLookupTool } from '../tools/vapi-distributor-lookup-tool';
import { VapiLeadCaptureTool } from '../tools/vapi-lead-capture-tool';
import { VapiAppointmentBookingTool } from '../tools/vapi-appointment-booking-tool';
import { VapiSupportTicketTool } from '../tools/vapi-support-ticket-tool';
import { VapiHumanTransferTool } from '../tools/vapi-human-transfer-tool';
import type { ToolContext } from '../tools/vapi-tool-interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    tenantId: 't1',
    userId: 'u1',
    customerId: 'cust-1',
    conversationId: 'conv-1',
    callId: 'call-1',
    sessionId: 'sess-1',
    phoneNumber: '+919999999999',
    ...overrides,
  };
}

/** Build a Prisma mock that includes the voice-specific models. */
function makePrismaMock() {
  const prisma = createMockPrismaService() as any;
  prisma.voiceSession = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'vs-1', callId: 'call-1' }),
    create: vi.fn(),
    count: vi.fn(),
  };
  prisma.voiceAnalytics = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  };
  prisma.voiceTranscript = {
    create: vi.fn(),
    findMany: vi.fn(),
  };
  prisma.webhookEvent = {
    create: vi.fn(),
    update: vi.fn(),
  };
  prisma.analyticsEvent = {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  };
  return prisma;
}

// ===========================================================================
// 1. VapiSearchKnowledgeTool
// ===========================================================================
describe('VapiTools', () => {
  describe('VapiSearchKnowledgeTool', () => {
    let knowledgeService: any;
    let tool: VapiSearchKnowledgeTool;

    beforeEach(() => {
      knowledgeService = { query: vi.fn() };
      tool = new VapiSearchKnowledgeTool(knowledgeService);
    });

    it('returns the synthesised answer + citations + speak on a valid query', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'Returns accepted within 30 days.',
        citations: [
          {
            chunkId: 'c1',
            documentId: 'd1',
            documentTitle: 'Return Policy',
            content: 'Returns accepted within 30 days...',
            score: 0.92,
          },
        ],
        latencyMs: 42,
        queryId: 'q-1',
      });

      const result = await tool.execute({ query: 'return policy' }, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.answer).toBe('Returns accepted within 30 days.');
      expect(result.data.citations).toHaveLength(1);
      expect(result.data.queryId).toBe('q-1');
      expect(result.speak).toBe('Returns accepted within 30 days.');
    });

    it('escalates when no citations are returned', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'No relevant information found for query: "xyz".',
        citations: [],
        latencyMs: 5,
        queryId: 'q-2',
      });

      const result = await tool.execute({ query: 'xyz' }, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.citations).toEqual([]);
      expect(result.speak).toContain("don't have that information");
    });

    it('rejects an empty query without calling the service', async () => {
      const result = await tool.execute({ query: '' }, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Query is required');
      expect(knowledgeService.query).not.toHaveBeenCalled();
    });

    it('rejects when tenantId is missing from context', async () => {
      const result = await tool.execute(
        { query: 'x' },
        makeContext({ tenantId: '' as any }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/tenantId/i);
    });

    it('returns a structured error when the knowledge service throws', async () => {
      knowledgeService.query.mockRejectedValue(new Error('DB down'));

      const result = await tool.execute({ query: 'x' }, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB down');
      expect(result.speak).toContain('trouble searching');
    });
  });

  // =========================================================================
  // 2. VapiSearchProductsTool
  // =========================================================================
  describe('VapiSearchProductsTool', () => {
    let productsService: any;
    let tool: VapiSearchProductsTool;

    beforeEach(() => {
      productsService = { search: vi.fn() };
      tool = new VapiSearchProductsTool(productsService);
    });

    it('returns formatted products + spoken summary', async () => {
      productsService.search.mockResolvedValue([
        {
          id: 'p1',
          sku: 'DJ-001',
          name: 'Multivitamin',
          slug: 'multivitamin',
          category: { name: 'supplements' },
          price: 499,
          currency: 'INR',
          shortDescription: 'Daily vitamins',
          inventory: { quantity: 25 },
        },
        {
          id: 'p2',
          sku: 'DJ-002',
          name: 'Omega-3',
          slug: 'omega-3',
          category: { name: 'supplements' },
          price: 399,
          currency: 'INR',
          shortDescription: 'Fish oil',
          inventory: { quantity: 0 },
        },
      ]);

      const result = await tool.execute(
        { query: 'vitamin', limit: 5 },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(2);
      expect(result.data.products[0].name).toBe('Multivitamin');
      expect(result.data.products[1].inStock).toBe(false);
      expect(result.speak).toContain('2 products');
      expect(result.speak).toContain('Multivitamin');
      expect(result.speak).toContain('Omega-3');
      expect(result.speak).toContain('out of stock');
    });

    it('offers to transfer to sales when no products match', async () => {
      productsService.search.mockResolvedValue([]);

      const result = await tool.execute({ query: 'nonexistent' }, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(0);
      expect(result.speak).toContain('sales team');
    });

    it('rejects an empty query', async () => {
      const result = await tool.execute({ query: '' }, makeContext());

      expect(result.success).toBe(false);
      expect(productsService.search).not.toHaveBeenCalled();
    });

    it('returns a structured error when the products service throws', async () => {
      productsService.search.mockRejectedValue(new Error('connection refused'));

      const result = await tool.execute({ query: 'x' }, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('connection refused');
    });
  });

  // =========================================================================
  // 3. VapiCustomerLookupTool
  // =========================================================================
  describe('VapiCustomerLookupTool', () => {
    let customersService: any;
    let tool: VapiCustomerLookupTool;

    beforeEach(() => {
      customersService = { findAll: vi.fn() };
      tool = new VapiCustomerLookupTool(customersService);
    });

    it('returns the matching customer with stats', async () => {
      customersService.findAll.mockResolvedValue({
        data: [
          {
            id: 'cust-1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '+919999999999',
            customerType: 'individual',
            status: 'active',
            lifetimeStats: {
              lifetimeValue: 5000,
              totalOrders: 5,
              lastOrderAt: '2024-01-15T00:00:00.000Z',
            },
          },
        ],
      });

      const result = await tool.execute(
        { email: 'john@example.com' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.found).toBe(true);
      expect(result.data.customer.firstName).toBe('John');
      expect(result.data.customer.lifetimeValue).toBe(5000);
      expect(result.speak).toContain('John');
      expect(result.speak).toContain('5 orders');
    });

    it('returns found=false when the email does not match exactly', async () => {
      customersService.findAll.mockResolvedValue({ data: [] });

      const result = await tool.execute(
        { email: 'unknown@example.com' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.found).toBe(false);
    });

    it('rejects when no parameter provided', async () => {
      const result = await tool.execute({}, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/phoneNumber or email/i);
    });

    it('returns a structured error when the customers service throws', async () => {
      customersService.findAll.mockRejectedValue(new Error('timeout'));

      const result = await tool.execute({ email: 'a@b.com' }, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('timeout');
    });
  });

  // =========================================================================
  // 4. VapiDistributorLookupTool
  // =========================================================================
  describe('VapiDistributorLookupTool', () => {
    let distributorsService: any;
    let tool: VapiDistributorLookupTool;

    beforeEach(() => {
      distributorsService = { findAll: vi.fn() };
      tool = new VapiDistributorLookupTool(distributorsService);
    });

    it('returns the matching distributor', async () => {
      distributorsService.findAll.mockResolvedValue({
        data: [
          {
            id: 'dist-1',
            distributorCode: 'DJ12345',
            companyName: 'Acme Distrib',
            contactPerson: 'Jane Smith',
            email: 'jane@example.com',
            phone: '+919999999999',
            tier: 'GOLD',
            status: 'active',
            commissionRate: 0.15,
            totalOrders: 30,
            revenue: 50000,
            commissionEarned: 7500,
          },
        ],
      });

      const result = await tool.execute(
        { distributorCode: 'DJ12345' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.found).toBe(true);
      expect(result.data.distributor.distributorCode).toBe('DJ12345');
      expect(result.data.distributor.tier).toBe('GOLD');
      expect(result.speak).toContain('Jane Smith');
      expect(result.speak).toContain('DJ12345');
    });

    it('returns found=false when no match exists', async () => {
      distributorsService.findAll.mockResolvedValue({ data: [] });

      const result = await tool.execute(
        { distributorCode: 'UNKNOWN' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.found).toBe(false);
    });

    it('rejects when no parameter provided', async () => {
      const result = await tool.execute({}, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/distributorCode, phoneNumber, or email/i);
    });
  });

  // =========================================================================
  // 5. VapiLeadCaptureTool
  // =========================================================================
  describe('VapiLeadCaptureTool', () => {
    let prisma: any;
    let tool: VapiLeadCaptureTool;

    beforeEach(() => {
      prisma = makePrismaMock();
      prisma.lead.create.mockResolvedValue({
        id: 'lead-uuid-1234abcd',
        status: 'NEW',
      });
      prisma.customer.findFirst.mockResolvedValue(null);
      tool = new VapiLeadCaptureTool(prisma);
    });

    const validArgs = {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '+15551234567',
      interest: 'business' as const,
      notes: 'Wants to join as distributor',
    };

    it('creates a lead when all required fields present', async () => {
      const result = await tool.execute(validArgs, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.leadId).toBe('lead-uuid-1234abcd');
      expect(result.data.referenceNumber).toBe('LEAD-UUID');
      expect(result.data.status).toBe('NEW');
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            firstName: 'Test',
            email: 'test@example.com',
            status: 'NEW',
          }),
        }),
      );
      expect(result.speak).toContain('Test');
      expect(result.speak).toContain('24 hours');
    });

    it('returns failure when firstName is missing', async () => {
      const result = await tool.execute(
        { ...validArgs, firstName: '' },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/firstName/i);
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it('returns failure when email is missing', async () => {
      const result = await tool.execute(
        { ...validArgs, email: '' },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/email/i);
    });

    it('links the lead to an existing customer when one exists with the same email', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-existing' });
      prisma.interaction.create.mockResolvedValue({ id: 'int-1' });

      const result = await tool.execute(validArgs, makeContext());

      expect(result.success).toBe(true);
      expect(prisma.interaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cust-existing',
            leadId: 'lead-uuid-1234abcd',
            type: 'CALL',
          }),
        }),
      );
    });

    it('returns a structured error when prisma.lead.create throws', async () => {
      prisma.lead.create.mockRejectedValue(new Error('DB write failed'));

      const result = await tool.execute(validArgs, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB write failed');
    });
  });

  // =========================================================================
  // 6. VapiAppointmentBookingTool
  // =========================================================================
  describe('VapiAppointmentBookingTool', () => {
    let prisma: any;
    let tool: VapiAppointmentBookingTool;

    beforeEach(() => {
      prisma = makePrismaMock();
      prisma.appointment.create.mockResolvedValue({
        id: 'apt-uuid-1234abcd',
        scheduledAt: new Date('2099-02-01T14:00:00Z'),
        durationMinutes: 30,
        status: 'scheduled',
      });
      tool = new VapiAppointmentBookingTool(prisma);
    });

    const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const validArgs = {
      title: 'Product demo',
      scheduledAt: futureIso,
      durationMinutes: 30,
      department: 'sales',
      customerName: 'Test User',
      customerEmail: 'test@example.com',
      customerPhone: '+15551234567',
    };

    it('books an appointment when all required fields present', async () => {
      const result = await tool.execute(validArgs, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.appointmentId).toBe('apt-uuid-1234abcd');
      expect(result.data.status).toBe('scheduled');
      expect(result.speak).toContain('scheduled your appointment');
    });

    it('returns failure when title is missing', async () => {
      const result = await tool.execute(
        { ...validArgs, title: '' },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/title/i);
    });

    it('returns failure when scheduledAt is invalid', async () => {
      const result = await tool.execute(
        { ...validArgs, scheduledAt: 'not-a-date' },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid scheduledAt/i);
    });

    it('returns failure when scheduledAt is in the past', async () => {
      const result = await tool.execute(
        { ...validArgs, scheduledAt: '2000-01-01T00:00:00Z' },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/past/i);
    });

    it('returns a structured error when prisma.appointment.create throws', async () => {
      prisma.appointment.create.mockRejectedValue(new Error('locked'));

      const result = await tool.execute(validArgs, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('locked');
    });
  });

  // =========================================================================
  // 7. VapiSupportTicketTool
  // =========================================================================
  describe('VapiSupportTicketTool', () => {
    let prisma: any;
    let tool: VapiSupportTicketTool;

    beforeEach(() => {
      prisma = makePrismaMock();
      prisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-uuid-1234abcd',
        status: 'open',
        priority: 'high',
        category: 'order',
      });
      prisma.interaction.create.mockResolvedValue({ id: 'int-1' });
      tool = new VapiSupportTicketTool(prisma);
    });

    const validArgs = {
      subject: 'Order not delivered',
      description: 'My order #ORD123456 has not arrived.',
      category: 'order',
      priority: 'high',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '+15551234567',
    };

    it('creates a support ticket when all required fields present', async () => {
      const result = await tool.execute(validArgs, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.ticketId).toBe('ticket-uuid-1234abcd');
      expect(result.data.ticketNumber).toBe('TICKET-UU');
      expect(result.data.status).toBe('open');
      expect(result.speak).toContain('TICKET-UU');
      expect(result.speak).toContain('john@example.com');
    });

    it('returns failure when subject is missing', async () => {
      const result = await tool.execute(
        { ...validArgs, subject: '' },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/subject/i);
    });

    it('returns failure when description is missing', async () => {
      const result = await tool.execute(
        { ...validArgs, description: '' },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/description/i);
    });

    it('writes an interaction row when customer context is available', async () => {
      const result = await tool.execute(validArgs, makeContext());

      expect(result.success).toBe(true);
      expect(prisma.interaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cust-1',
            type: 'CALL',
            subject: expect.stringContaining('TICKET-UU'),
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 8. VapiHumanTransferTool
  // =========================================================================
  describe('VapiHumanTransferTool', () => {
    let prisma: any;
    let notificationsService: any;
    let tool: VapiHumanTransferTool;

    beforeEach(() => {
      prisma = makePrismaMock();
      notificationsService = {
        send: vi.fn().mockResolvedValue({ success: true }),
      };
      tool = new VapiHumanTransferTool(prisma, notificationsService);
    });

    const validArgs = {
      department: 'customer_service',
      reason: 'Customer requested human agent',
      priority: 'normal',
      callSummary: 'Customer had a complex billing issue',
      customerName: 'John Doe',
      customerPhone: '+15551234567',
    };

    it('transfers the call when department + reason provided', async () => {
      const result = await tool.execute(validArgs, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.transferred).toBe(true);
      expect(result.data.department).toBe('customer_service');
      expect(result.data.departmentLabel).toBe('Customer Service');
      expect(result.speak).toMatch(/Customer Service/i);
    });

    it('defaults priority to "normal" when not specified', async () => {
      const { priority: _omit, ...argsWithoutPriority } = validArgs;
      const result = await tool.execute(
        argsWithoutPriority as any,
        makeContext(),
      );

      expect(result.data.priority).toBe('normal');
    });

    it('returns failure when department is missing', async () => {
      const result = await tool.execute(
        { ...validArgs, department: '' as any },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/department/i);
    });

    it('returns failure when reason is missing', async () => {
      const result = await tool.execute(
        { ...validArgs, reason: '' },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/department and reason/i);
    });

    it('returns failure for an unknown department', async () => {
      const result = await tool.execute(
        { ...validArgs, department: 'unknown_dept' as any },
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unknown department/i);
    });

    it('updates the voice session status to "transferring"', async () => {
      await tool.execute(validArgs, makeContext());

      expect(prisma.voiceSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { callId: 'call-1' },
          data: expect.objectContaining({
            status: 'transferring',
          }),
        }),
      );
    });

    it('sends a notification to the support team', async () => {
      await tool.execute(validArgs, makeContext());

      expect(notificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'IN_APP',
          subject: expect.stringContaining('Voice Transfer'),
          metadata: expect.objectContaining({
            event: 'voice.human_transfer',
            department: 'customer_service',
          }),
        }),
      );
    });

    it('writes an audit interaction on the customer record when customerId is set', async () => {
      await tool.execute(validArgs, makeContext());

      expect(prisma.interaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cust-1',
            outcome: 'transferred',
          }),
        }),
      );
    });
  });
});

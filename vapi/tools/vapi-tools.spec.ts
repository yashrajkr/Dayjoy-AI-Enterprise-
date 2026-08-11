import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { VapiSearchKnowledgeTool } from './vapi-search-knowledge-tool';
import { VapiSearchProductsTool } from './vapi-search-products-tool';
import { VapiCustomerLookupTool } from './vapi-customer-lookup-tool';
import { VapiDistributorLookupTool } from './vapi-distributor-lookup-tool';
import { VapiLeadCaptureTool } from './vapi-lead-capture-tool';
import { VapiAppointmentBookingTool } from './vapi-appointment-booking-tool';
import { VapiSupportTicketTool } from './vapi-support-ticket-tool';
import { VapiHumanTransferTool } from './vapi-human-transfer-tool';
import { VapiToolRegistry } from './vapi-tool-registry.service';
import type { ToolContext } from './vapi-tool-interface';

/**
 * Build a fresh `ToolContext` for tests. `tenantId` is always set so the
 * "missing tenantId" guards don't fire on the happy path.
 */
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

describe('Vapi Tools (real backend integration)', () => {
  let prisma: any;
  let knowledgeService: any;
  let productsService: any;
  let customersService: any;
  let distributorsService: any;
  let notificationsService: any;

  beforeEach(() => {
    prisma = createMockPrismaService();
    // Add the `voiceSession` + `interaction` mocks (voiceSession isn't in the
    // shared mock; interaction is, but we override it for clarity).
    (prisma as any).voiceSession = {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 'vs-1', callId: 'call-1' }),
    };
    prisma.interaction.create = vi.fn().mockResolvedValue({ id: 'int-1' });

    knowledgeService = { query: vi.fn() };
    productsService = { search: vi.fn() };
    customersService = { findAll: vi.fn() };
    distributorsService = { findAll: vi.fn() };
    notificationsService = { send: vi.fn().mockResolvedValue({ success: true }) };
  });

  // -------------------------------------------------------------------
  // search_knowledge
  // -------------------------------------------------------------------

  describe('VapiSearchKnowledgeTool', () => {
    it('returns the synthesised answer + citations + speak', async () => {
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
      const tool = new VapiSearchKnowledgeTool(knowledgeService);

      const result = await tool.execute(
        { query: 'return policy' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.answer).toBe('Returns accepted within 30 days.');
      expect(result.data.citations).toHaveLength(1);
      expect(result.data.queryId).toBe('q-1');
      expect(result.speak).toBe('Returns accepted within 30 days.');
      expect(knowledgeService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'return policy',
          topK: 3,
          tenantId: 't1',
          conversationId: 'conv-1',
        }),
        expect.objectContaining({ tenantId: 't1', userId: 'u1' }),
      );
    });

    it('escalates when no citations are returned', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'No relevant information found for query: "xyz".',
        citations: [],
        latencyMs: 5,
        queryId: 'q-2',
      });
      const tool = new VapiSearchKnowledgeTool(knowledgeService);

      const result = await tool.execute({ query: 'xyz' }, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.citations).toEqual([]);
      expect(result.speak).toContain("don't have that information");
    });

    it('rejects an empty query without calling the service', async () => {
      const tool = new VapiSearchKnowledgeTool(knowledgeService);
      const result = await tool.execute({ query: '' }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toBe('Query is required');
      expect(knowledgeService.query).not.toHaveBeenCalled();
    });

    it('returns a structured error when the service throws', async () => {
      knowledgeService.query.mockRejectedValue(new Error('DB down'));
      const tool = new VapiSearchKnowledgeTool(knowledgeService);
      const result = await tool.execute({ query: 'x' }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toBe('DB down');
      expect(result.speak).toContain("trouble searching");
    });
  });

  // -------------------------------------------------------------------
  // search_products
  // -------------------------------------------------------------------

  describe('VapiSearchProductsTool', () => {
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
      const tool = new VapiSearchProductsTool(productsService);

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
      expect(productsService.search).toHaveBeenCalledWith('vitamin', 5, 't1');
    });

    it('offers to transfer to sales when no products match', async () => {
      productsService.search.mockResolvedValue([]);
      const tool = new VapiSearchProductsTool(productsService);

      const result = await tool.execute({ query: 'nonexistent' }, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(0);
      expect(result.speak).toContain('sales team');
    });

    it('rejects an empty query', async () => {
      const tool = new VapiSearchProductsTool(productsService);
      const result = await tool.execute({ query: '' }, makeContext());
      expect(result.success).toBe(false);
      expect(productsService.search).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // customer_lookup
  // -------------------------------------------------------------------

  describe('VapiCustomerLookupTool', () => {
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
      const tool = new VapiCustomerLookupTool(customersService);

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
      const tool = new VapiCustomerLookupTool(customersService);

      const result = await tool.execute(
        { email: 'unknown@example.com' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.found).toBe(false);
      expect(result.speak).toContain("couldn't find");
    });

    it('requires either phone or email', async () => {
      const tool = new VapiCustomerLookupTool(customersService);
      const result = await tool.execute({}, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toBe('phoneNumber or email is required');
    });
  });

  // -------------------------------------------------------------------
  // distributor_lookup
  // -------------------------------------------------------------------

  describe('VapiDistributorLookupTool', () => {
    it('returns the matching distributor', async () => {
      distributorsService.findAll.mockResolvedValue({
        data: [
          {
            id: 'd1',
            distributorCode: 'DJ12345',
            companyName: 'Acme Wellness',
            contactPerson: 'Jane Smith',
            email: 'jane@acme.com',
            phone: '+918888888888',
            tier: 'GOLD',
            status: 'ACTIVE',
            commissionRate: 8,
            totalOrders: 42,
            revenue: 250000,
            commissionEarned: 20000,
          },
        ],
      });
      const tool = new VapiDistributorLookupTool(distributorsService);

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
      expect(result.speak).toContain('GOLD');
    });

    it('requires at least one identifier', async () => {
      const tool = new VapiDistributorLookupTool(distributorsService);
      const result = await tool.execute({}, makeContext());
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // create_lead
  // -------------------------------------------------------------------

  describe('VapiLeadCaptureTool', () => {
    it('creates a lead + returns a reference number', async () => {
      prisma.lead.create.mockResolvedValue({
        id: 'lead-abc12345-xxxx',
        status: 'NEW',
      });
      prisma.customer.findFirst.mockResolvedValue(null); // No existing customer.
      const tool = new VapiLeadCaptureTool(prisma);

      const result = await tool.execute(
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+919999999999',
          interest: 'business',
          notes: 'wants to join',
        },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.leadId).toBe('lead-abc12345-xxxx');
      expect(result.data.referenceNumber).toBe('LEAD-ABC');
      expect(result.data.interest).toBe('business');
      expect(result.speak).toContain('John');
      expect(result.speak).toContain('LEAD-ABC');
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            firstName: 'John',
            email: 'john@example.com',
            status: 'NEW',
            metadata: expect.objectContaining({
              source: 'VOICE',
              interest: 'business',
              callId: 'call-1',
            }),
          }),
        }),
      );
    });

    it('rejects when required fields are missing', async () => {
      const tool = new VapiLeadCaptureTool(prisma);
      const result = await tool.execute(
        { firstName: '', lastName: 'Doe', email: 'a@b.com', phone: '1' },
        makeContext(),
      );
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // book_appointment
  // -------------------------------------------------------------------

  describe('VapiAppointmentBookingTool', () => {
    it('creates an appointment for a future date', async () => {
      const future = new Date(Date.now() + 86400000); // tomorrow
      prisma.appointment.create.mockResolvedValue({
        id: 'apt-xyz12345',
        scheduledAt: future,
        durationMinutes: 30,
        status: 'scheduled',
      });
      const tool = new VapiAppointmentBookingTool(prisma);

      const result = await tool.execute(
        {
          title: 'Product demo',
          scheduledAt: future.toISOString(),
          department: 'sales',
          customerEmail: 'john@example.com',
        },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('scheduled');
      // `speak` is the customer-facing confirmation, not the title.
      expect(result.speak).not.toContain('Product demo');
      expect(result.speak).toContain('scheduled your appointment');
      expect(result.speak).toContain('john@example.com');
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            title: 'Product demo',
            customerId: 'cust-1',
            scheduledAt: future,
            status: 'scheduled',
          }),
        }),
      );
    });

    it('rejects a past date', async () => {
      const tool = new VapiAppointmentBookingTool(prisma);
      const result = await tool.execute(
        {
          title: 'Past appt',
          scheduledAt: '2020-01-01T10:00:00Z',
          department: 'sales',
        },
        makeContext(),
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('scheduledAt is in the past');
    });

    it('rejects an invalid date', async () => {
      const tool = new VapiAppointmentBookingTool(prisma);
      const result = await tool.execute(
        { title: 'Bad', scheduledAt: 'not-a-date', department: 'sales' },
        makeContext(),
      );
      expect(result.success).toBe(false);
      expect(result.speak).toContain("didn't catch");
    });
  });

  // -------------------------------------------------------------------
  // create_support_ticket
  // -------------------------------------------------------------------

  describe('VapiSupportTicketTool', () => {
    it('creates a ticket + writes an interaction for context', async () => {
      prisma.supportTicket.create.mockResolvedValue({
        id: 'tkt-abcdef12-xxxx',
        status: 'open',
        priority: 'high',
        category: 'billing',
      });
      const tool = new VapiSupportTicketTool(prisma);

      const result = await tool.execute(
        {
          subject: 'Refund not received',
          description: 'Customer was promised a refund 2 weeks ago.',
          category: 'billing',
          priority: 'high',
          customerEmail: 'john@example.com',
        },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.ticketNumber).toBe('TKT-ABCDEF12'.slice(0, 8)); // first 8 chars uppercase
      expect(result.data.priority).toBe('high');
      expect(result.speak).toContain('TKT-ABCDEF12'.slice(0, 8));
      expect(result.speak).toContain('24 hours');
      expect(prisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            subject: 'Refund not received',
            priority: 'high',
            channel: 'voice',
          }),
        }),
      );
      expect(prisma.interaction.create).toHaveBeenCalled();
    });

    it('requires subject + description', async () => {
      const tool = new VapiSupportTicketTool(prisma);
      const result = await tool.execute({ subject: '' }, makeContext());
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // human_transfer
  // -------------------------------------------------------------------

  describe('VapiHumanTransferTool', () => {
    it('updates the voice session + sends a notification', async () => {
      const tool = new VapiHumanTransferTool(prisma, notificationsService);

      const result = await tool.execute(
        {
          department: 'customer_service',
          reason: 'Customer requested human',
          priority: 'high',
          callSummary: 'Customer wants refund > ₹10000',
          customerName: 'John Doe',
          customerPhone: '+919999999999',
        },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data.transferred).toBe(true);
      expect(result.data.department).toBe('customer_service');
      expect(result.speak).toContain('Customer Service');
      expect(prisma.voiceSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { callId: 'call-1' },
          data: expect.objectContaining({ status: 'transferring' }),
        }),
      );
      expect(notificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          type: 'IN_APP',
          priority: 'HIGH',
          metadata: expect.objectContaining({
            event: 'voice.human_transfer',
            department: 'customer_service',
          }),
        }),
      );
    });

    it('requires department + reason', async () => {
      const tool = new VapiHumanTransferTool(prisma, notificationsService);
      const result = await tool.execute({ department: '' }, makeContext());
      expect(result.success).toBe(false);
    });

    it('rejects an unknown department', async () => {
      const tool = new VapiHumanTransferTool(prisma, notificationsService);
      const result = await tool.execute(
        { department: 'unknown_dept', reason: 'x' },
        makeContext(),
      );
      expect(result.success).toBe(false);
    });

    it('still succeeds when the voice session does not exist', async () => {
      prisma.voiceSession.update.mockRejectedValue(new Error('Record not found'));
      const tool = new VapiHumanTransferTool(prisma, notificationsService);
      const result = await tool.execute(
        { department: 'manager', reason: 'escalation' },
        makeContext(),
      );
      expect(result.success).toBe(true);
      expect(result.data.voiceSessionId).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // VapiToolRegistry
  // -------------------------------------------------------------------

  describe('VapiToolRegistry', () => {
    let registry: VapiToolRegistry;

    beforeEach(() => {
      registry = new VapiToolRegistry(
        new VapiSearchKnowledgeTool(knowledgeService),
        new VapiSearchProductsTool(productsService),
        new VapiCustomerLookupTool(customersService),
        new VapiDistributorLookupTool(distributorsService),
        new VapiLeadCaptureTool(prisma),
        new VapiAppointmentBookingTool(prisma),
        new VapiSupportTicketTool(prisma),
        new VapiHumanTransferTool(prisma, notificationsService),
      );
    });

    it('registers all 8 tools', () => {
      const names = registry.listTools().map((t) => t.name);
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
      expect(registry.listTools()).toHaveLength(8);
    });

    it('getTool returns the tool by name', () => {
      const tool = registry.getTool('search_knowledge');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('search_knowledge');
    });

    it('getTool returns undefined for unknown names', () => {
      expect(registry.getTool('unknown_tool')).toBeUndefined();
    });

    it('execute routes through the right tool', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'A',
        citations: [],
        latencyMs: 1,
        queryId: 'q',
      });
      const result = await registry.execute(
        'search_knowledge',
        { query: 'test' },
        makeContext(),
      );
      expect(result.success).toBe(true);
    });

    it('execute returns a structured error for unknown tools', async () => {
      const result = await registry.execute('nope', {}, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('execute captures thrown errors into a ToolResult', async () => {
      knowledgeService.query.mockRejectedValue(new Error('boom'));
      const result = await registry.execute(
        'search_knowledge',
        { query: 'x' },
        makeContext(),
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('boom');
    });

    it('getToolDefinitions returns Vapi-shaped function definitions', () => {
      const defs = registry.getToolDefinitions();
      expect(defs).toHaveLength(8);
      expect(defs[0]).toEqual({
        type: 'function',
        function: {
          name: expect.any(String),
          description: expect.any(String),
          parameters: expect.any(Object),
        },
      });
    });

    it('getToolSummaries returns name + description + required params', () => {
      const summaries = registry.getToolSummaries();
      const search = summaries.find((s) => s.name === 'search_knowledge');
      expect(search).toBeDefined();
      expect(search!.requiredParams).toEqual(['query']);
    });
  });
});

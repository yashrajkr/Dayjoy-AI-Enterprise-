import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../_shared/ai/openai.provider';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { AuthUser } from './auth-user';
import type OpenAI from 'openai';

/**
 * Tool handler signature. Each registered tool receives the parsed
 * arguments (from the LLM tool call) and the optional authenticated
 * user — most tools scope their queries by `user.tenantId`.
 */
type ToolHandler = (args: any, user?: AuthUser) => Promise<any>;

interface ToolDefinition {
  name: string;
  description: string;
  handler: ToolHandler;
}

/**
 * Tools service — implements the function-calling / tool registry the
 * LLM uses to take real actions on the platform (search the knowledge
 * base, look up customers, create leads / appointments / tickets, etc.).
 *
 * Tools are registered synchronously in the constructor so the registry
 * is fully populated by the time the first request arrives. Each
 * handler is a thin wrapper around a Prisma call (or a delegate to
 * `KnowledgeService` for RAG search).
 *
 * `executeForConversation` wraps `execute` and additionally persists a
 * `tool_execution` `AnalyticsEvent` row tied to the conversation — this
 * is the persistence layer for the "ToolExecution" concept the spec
 * references (the schema does not have a dedicated `tool_executions`
 * table; we use the generic `analytics_events` table with
 * `eventType='tool_execution'`).
 */
@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
    // OpenAI client is included per the spec — currently unused directly
    // (tool execution is deterministic), but reserved for future
    // LLM-driven tool selection / function-calling orchestration.
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
  ) {
    this.register(
      'search_knowledge',
      'Search the RAG knowledge base. Args: { query: string, topK?: number }. Returns { answer, citations, latencyMs }.',
      this.searchKnowledge.bind(this),
    );
    this.register(
      'search_products',
      'Search the product catalog. Args: { query?: string, category?: string }. Returns top 10 active products.',
      this.searchProducts.bind(this),
    );
    this.register(
      'customer_lookup',
      'Look up a customer by email OR phone (email takes precedence). Args: { email?: string, phone?: string }.',
      this.customerLookup.bind(this),
    );
    this.register(
      'distributor_lookup',
      'Look up a distributor by distributorCode OR email OR phone. Args: { distributorCode?: string, email?: string, phone?: string }.',
      this.distributorLookup.bind(this),
    );
    this.register(
      'create_lead',
      'Create a new CRM lead. Args: { firstName?, lastName?, email?, phone?, company?, sourceId?, assignedToId?, score?, metadata? }.',
      this.createLead.bind(this),
    );
    this.register(
      'book_appointment',
      'Book an appointment. Args: { title, scheduledAt (ISO-8601), description?, durationMinutes?, location?, meetingLink?, customerId?, distributorId?, assignedToId? }.',
      this.bookAppointment.bind(this),
    );
    this.register(
      'create_support_ticket',
      'Open a support ticket. Args: { subject, description, priority?, category?, channel?, customerId?, assignedToId? }.',
      this.createSupportTicket.bind(this),
    );
    this.register(
      'human_transfer',
      'Escalate the conversation to a human agent. Args: { conversationId, reason?, priority? }. Queues a notification to the support team and marks the conversation for transfer.',
      this.humanTransfer.bind(this),
    );
    this.register(
      'order_lookup',
      'Look up a customer order by order number or customer phone. Returns order status, items, and delivery information. Args: { orderNumber?: string, customerPhone?: string }.',
      this.orderLookup.bind(this),
    );
  }

  /**
   * Returns OpenAI function-calling tool definitions for all registered tools.
   * Used by ConversationsService to pass `tools` to the OpenAI Chat Completions API.
   */
  getToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    const schemaMap: Record<string, { type: string; properties: Record<string, unknown>; required: string[] }> = {
      search_knowledge: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The search query' } },
        required: ['query'],
      },
      search_products: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Product name, SKU, or keyword' }, category: { type: 'string', description: 'Optional category filter' } },
        required: ['query'],
      },
      customer_lookup: {
        type: 'object',
        properties: { phone: { type: 'string', description: 'Customer phone number' }, email: { type: 'string', description: 'Customer email' } },
        required: [],
      },
      distributor_lookup: {
        type: 'object',
        properties: { code: { type: 'string', description: 'Distributor code' }, name: { type: 'string', description: 'Distributor name' } },
        required: [],
      },
      create_lead: {
        type: 'object',
        properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, source: { type: 'string' }, notes: { type: 'string' } },
        required: ['name', 'phone'],
      },
      book_appointment: {
        type: 'object',
        properties: { customerName: { type: 'string' }, customerPhone: { type: 'string' }, date: { type: 'string', description: 'ISO date' }, time: { type: 'string', description: 'HH:mm' }, notes: { type: 'string' } },
        required: ['customerName', 'customerPhone', 'date', 'time'],
      },
      create_support_ticket: {
        type: 'object',
        properties: { customerId: { type: 'string' }, subject: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] } },
        required: ['subject', 'description'],
      },
      human_transfer: {
        type: 'object',
        properties: { conversationId: { type: 'string' }, reason: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] } },
        required: ['reason'],
      },
      order_lookup: {
        type: 'object',
        properties: { orderNumber: { type: 'string', description: 'Order number e.g. ORD-001' }, customerPhone: { type: 'string', description: 'Customer phone number' } },
        required: [],
      },
    };

    return Array.from(this.tools.values()).map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: schemaMap[t.name] || { type: 'object', properties: {}, required: [] },
      },
    }));
  }

  private async orderLookup(args: { orderNumber?: string; customerPhone?: string }, user?: AuthUser) {
    const where: Record<string, unknown> = { tenantId: user?.tenantId };
    if (args.orderNumber) {
      where.orderNumber = args.orderNumber;
    } else if (args.customerPhone) {
      where.customer = { phone: { contains: args.customerPhone } };
    } else {
      return { error: 'Either orderNumber or customerPhone is required' };
    }
    const order = await this.prisma.order.findFirst({
      where,
      include: { items: true, customer: { select: { firstName: true, lastName: true, phone: true, email: true } } },
    });
    return order || { error: 'Order not found' };
  }

  private register(name: string, description: string, handler: ToolHandler) {
    this.tools.set(name, { name, description, handler });
  }

  /**
   * Execute a named tool with the supplied arguments. Throws
   * `NotFoundException` if the tool is not registered.
   */
  async execute(toolName: string, args: any, user?: AuthUser) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new NotFoundException(`Tool '${toolName}' not found`);
    }
    this.logger.debug(`Executing tool ${toolName} with args: ${JSON.stringify(args)}`);
    return tool.handler(args ?? {}, user);
  }

  /**
   * Execute a tool in the context of a conversation, then persist a
   * `tool_execution` analytics event tied to the conversation.
   *
   * The analytics event captures: tool name, arguments, result (or error
   * message), success flag, duration, and the conversation/agent/user IDs
   * for downstream drill-down. Failures are persisted (with `success=false`)
   * so the monitoring dashboard can compute tool failure rates — but the
   * original error is re-thrown so the calling LLM / controller can react.
   */
  async executeForConversation(
    conversationId: string,
    toolName: string,
    args: any,
    user?: AuthUser,
  ) {
    const startedAt = Date.now();
    let success = true;
    let errorMessage: string | undefined;
    let result: any;

    try {
      result = await this.execute(toolName, args, user);
      return result;
    } catch (err) {
      success = false;
      errorMessage = (err as Error).message;
      throw err;
    } finally {
      const durationMs = Date.now() - startedAt;
      try {
        await this.persistToolExecution({
          conversationId,
          toolName,
          args,
          result: success ? result : undefined,
          errorMessage,
          success,
          durationMs,
          user,
        });
      } catch (persistErr) {
        // Persistence is best-effort — never mask the original tool
        // error with a persistence failure.
        this.logger.warn(
          `Failed to persist tool_execution event for ${toolName} on conversation ${conversationId}: ${
            (persistErr as Error).message
          }`,
        );
      }
    }
  }

  /**
   * List all registered tools with their descriptions — used to
   * advertise available tools to the LLM during function-calling.
   */
  async listTools() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }

  // ============================================================
  // Tool handlers
  // ============================================================

  /**
   * `search_knowledge` — delegate to the RAG pipeline. Returns the
   * full RAG response (answer + citations + latency).
   */
  private async searchKnowledge(
    args: { query: string; topK?: number; agentId?: string; conversationId?: string },
    user?: AuthUser,
  ) {
    if (!args?.query) {
      throw new BadRequestException('`query` is required for search_knowledge');
    }
    const result = await this.knowledgeService.query(
      {
        query: args.query,
        agentId: args.agentId,
        conversationId: args.conversationId,
        topK: args.topK,
      },
      user,
    );
    return {
      results: result.citations,
      answer: result.answer,
      latencyMs: result.latencyMs,
      queryId: result.queryId,
    };
  }

  /**
   * `search_products` — full-text-ish product search.
   */
  private async searchProducts(
    args: { query?: string; category?: string },
    user?: AuthUser,
  ) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId: user?.tenantId,
        status: 'ACTIVE',
        ...(args?.query && {
          name: { contains: args.query, mode: 'insensitive' },
        }),
        ...(args?.category && { categoryId: args.category }),
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    return { products, count: products.length };
  }

  /**
   * `customer_lookup` — find a customer by email OR phone. Email
   * takes precedence when both are supplied.
   */
  private async customerLookup(
    args: { email?: string; phone?: string },
    user?: AuthUser,
  ) {
    if (!args?.email && !args?.phone) {
      throw new BadRequestException('`email` or `phone` is required for customer_lookup');
    }
    const customer = await this.prisma.customer.findFirst({
      where: {
        tenantId: user?.tenantId,
        ...(args.email ? { email: args.email } : { phone: args.phone }),
      },
    });
    return { customer, found: !!customer };
  }

  /**
   * `distributor_lookup` — find a distributor by distributorCode (preferred)
   * OR email OR phone. distributorCode takes precedence when supplied.
   */
  private async distributorLookup(
    args: { distributorCode?: string; email?: string; phone?: string },
    user?: AuthUser,
  ) {
    if (!args?.distributorCode && !args?.email && !args?.phone) {
      throw new BadRequestException(
        '`distributorCode`, `email`, or `phone` is required for distributor_lookup',
      );
    }
    const where: any = { tenantId: user?.tenantId };
    if (args.distributorCode) {
      where.distributorCode = args.distributorCode;
    } else if (args.email) {
      where.email = args.email;
    } else if (args.phone) {
      where.phone = args.phone;
    }
    const distributor = await this.prisma.distributor.findFirst({ where });
    return { distributor, found: !!distributor };
  }

  /**
   * `create_lead` — create a new lead. Required args: at least one
   * contact field (email or phone). `status` defaults to NEW.
   */
  private async createLead(args: any, user?: AuthUser) {
    if (!args?.email && !args?.phone && !args?.firstName && !args?.lastName) {
      throw new BadRequestException(
        'At least one of email, phone, firstName, or lastName is required to create a lead',
      );
    }
    const lead = await this.prisma.lead.create({
      data: {
        tenantId: user?.tenantId ?? args.tenantId,
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        phone: args.phone,
        company: args.company,
        sourceId: args.sourceId,
        assignedToId: args.assignedToId,
        score: args.score ?? 0,
        metadata: args.metadata ?? undefined,
        status: 'NEW',
      },
    });
    return { lead };
  }

  /**
   * `book_appointment` — create a scheduled appointment.
   * Required args: `title`, `scheduledAt`.
   */
  private async bookAppointment(args: any, user?: AuthUser) {
    if (!args?.title) {
      throw new BadRequestException('`title` is required to book an appointment');
    }
    if (!args?.scheduledAt) {
      throw new BadRequestException('`scheduledAt` is required to book an appointment');
    }
    const scheduledAt = new Date(args.scheduledAt);
    if (isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('`scheduledAt` must be a valid ISO-8601 date');
    }
    const appointment = await this.prisma.appointment.create({
      data: {
        tenantId: user?.tenantId ?? args.tenantId,
        title: args.title,
        description: args.description,
        scheduledAt,
        durationMinutes: args.durationMinutes ?? 30,
        location: args.location,
        meetingLink: args.meetingLink,
        customerId: args.customerId,
        distributorId: args.distributorId,
        assignedToId: args.assignedToId,
        status: 'scheduled',
      },
    });
    return { appointment };
  }

  /**
   * `create_support_ticket` — open a new support ticket.
   * Required args: `subject`, `description`.
   */
  private async createSupportTicket(args: any, user?: AuthUser) {
    if (!args?.subject) {
      throw new BadRequestException('`subject` is required to create a support ticket');
    }
    if (!args?.description) {
      throw new BadRequestException('`description` is required to create a support ticket');
    }
    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId: user?.tenantId ?? args.tenantId,
        subject: args.subject,
        description: args.description,
        priority: args.priority ?? 'medium',
        category: args.category,
        channel: args.channel ?? 'api',
        customerId: args.customerId,
        assignedToId: args.assignedToId,
        status: 'open',
      },
    });
    return { ticket };
  }

  /**
   * `human_transfer` — escalate a conversation to a human agent.
   *
   * Side effects:
   *  1. Mark the conversation `status` as `transferred` so the routing
   *     layer knows to pull it out of the AI queue.
   *  2. Create a `Notification` row targeted at the support team
   *     (`NotificationTemplate` lookup is intentionally omitted — the
   *     notification service is owned by another agent and we don't
   *     want a cross-module dependency here; the row is created directly
   *     via Prisma so the support team's notification inbox gets it).
   *  3. Open a `SupportTicket` so the human agent has a trackable work
   *     item linked back to the conversation.
   */
  private async humanTransfer(
    args: { conversationId: string; reason?: string; priority?: string },
    user?: AuthUser,
  ) {
    if (!args?.conversationId) {
      throw new BadRequestException(
        '`conversationId` is required for human_transfer',
      );
    }
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: args.conversationId },
    });
    if (!conversation || conversation.tenantId !== user?.tenantId) {
      throw new NotFoundException(
        `Conversation ${args.conversationId} not found`,
      );
    }

    // 1. Flip the conversation status.
    const updated = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'transferred' },
    });

    // 2. Open a support ticket linked back to the conversation.
    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId: conversation.tenantId,
        subject: `Human transfer — conversation ${conversation.id}`,
        description:
          args.reason ||
          'Customer requested human agent. Conversation transferred from AI.',
        priority: args.priority || 'medium',
        category: 'human_transfer',
        channel: 'ai_transfer',
        customerId: conversation.customerId ?? undefined,
      },
    });

    // 3. Queue a notification to the support team. Direct Prisma insert
    //    so we don't take a hard dependency on the NotificationsModule
    //    (owned by another agent).
    try {
      await this.prisma.notification.create({
        data: {
          tenantId: conversation.tenantId,
          userId: user?.userId,
          customerId: conversation.customerId ?? undefined,
          type: 'IN_APP' as any,
          priority:
            (args.priority as any) === 'urgent' ? 'URGENT' : 'HIGH',
          subject: `Human transfer required — conversation ${conversation.id}`,
          content:
            args.reason ||
            'A conversation has been escalated to a human agent.',
          status: 'PENDING' as any,
          metadata: {
            conversationId: conversation.id,
            ticketId: ticket.id,
            source: 'ai_tool:human_transfer',
          },
        },
      });
    } catch (err) {
      // Notification is best-effort — the ticket + status flip are the
      // source of truth; the notification is just an inbox ping.
      this.logger.warn(
        `Failed to queue human_transfer notification for conversation ${conversation.id}: ${
          (err as Error).message
        }`,
      );
    }

    return {
      conversation: updated,
      ticket,
      transferred: true,
    };
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Persist a `tool_execution` analytics event.
   *
   * The schema does not have a dedicated `tool_executions` table — we
   * use the generic `analytics_events` table with `eventType='tool_execution'`
   * and stash the tool-specific payload in `eventData`. This keeps the
   * analytics dashboard's "tool usage" panel queryable without a schema
   * migration.
   */
  private async persistToolExecution(payload: {
    conversationId: string;
    toolName: string;
    args: any;
    result: any;
    errorMessage?: string;
    success: boolean;
    durationMs: number;
    user?: AuthUser;
  }) {
    // Resolve the conversation to pull agentId + customerId + tenantId
    // for richer analytics. Best-effort — if it fails, the event is
    // still persisted with whatever fields we have.
    let conversation: {
      tenantId?: string;
      agentId?: string | null;
      customerId?: string | null;
    } | null = null;
    try {
      conversation = await this.prisma.conversation.findUnique({
        where: { id: payload.conversationId },
        select: { tenantId: true, agentId: true, customerId: true },
      });
    } catch {
      conversation = null;
    }

    const tenantId = payload.user?.tenantId ?? conversation?.tenantId;
    if (!tenantId) {
      // Without a tenantId the FK on `analytics_events.tenant_id` would
      // fail — skip persistence (best-effort).
      this.logger.warn(
        `Skipping tool_execution persist for ${payload.toolName} — no tenantId resolved`,
      );
      return;
    }

    await this.prisma.analyticsEvent.create({
      data: {
        tenantId,
        userId: payload.user?.userId ?? null,
        customerId: conversation?.customerId ?? null,
        eventType: 'tool_execution',
        eventData: {
          toolName: payload.toolName,
          args: payload.args,
          result: payload.success ? payload.result : undefined,
          errorMessage: payload.errorMessage,
          success: payload.success,
          durationMs: payload.durationMs,
          conversationId: payload.conversationId,
          agentId: conversation?.agentId ?? null,
        },
        timestamp: new Date(),
      },
    });
  }
}

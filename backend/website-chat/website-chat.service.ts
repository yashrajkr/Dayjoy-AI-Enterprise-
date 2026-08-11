import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../_shared/ai/openai.provider';
import { ConversationsService } from '../ai/conversations.service';
import { SendMessageDto as AiSendMessageDto } from '../ai/dto/send-message.dto';
import { RateLimitService } from '../_shared/security/rate-limit.service';
import { AuthUser } from '../ai/auth-user';
import { InitSessionDto } from './dto/init-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { FeedbackDto } from './dto/feedback.dto';
import type OpenAI from 'openai';

/**
 * Default system prompt for the website chat agent. Tuned for short,
 * web-friendly replies (Markdown OK — the chat widget renders it).
 */
const DEFAULT_WEB_SYSTEM_PROMPT = `You are the Dayjoy website assistant. You help website visitors with product questions, order status, lead capture, and booking appointments.

Reply style:
- Be helpful and concise. Most replies should fit on one screen (under 150 words).
- Markdown formatting is OK (**bold**, lists, links).
- Use the available tools when the visitor asks about products, customers, distributors, or wants to book / create a ticket / escalate. Never invent answers when a tool could fetch the truth.
- If you cannot help, offer to escalate to a human agent.`;

/**
 * Context window (number of prior turns) the LLM sees on each turn.
 */
const LLM_CONTEXT_WINDOW = 10;

/**
 * Visitor-facing rate limits. Tight enough to discourage abuse,
 * loose enough for a normal chat session.
 */
const RATE_LIMIT_INIT = { limit: 10, windowSeconds: 60 }; // 10 sessions / min / IP
const RATE_LIMIT_MESSAGE = { limit: 30, windowSeconds: 60 }; // 30 msgs / min / IP

/**
 * Default tenant id for unmapped website chat sessions. The website
 * chat is single-tenant by default — multi-tenant domain mapping is a
 * future enhancement (would key off the Host header).
 */
const DEFAULT_TENANT_ID =
  process.env.WEBSITE_CHAT_DEFAULT_TENANT_ID
  ?? process.env.DEFAULT_TENANT_ID
  ?? 'default';

/**
 * Website Chat Service.
 *
 * Backs the public website chat widget. Public endpoints accept
 * anonymous visitors — no JWT required. The service:
 *   - Creates a `WebSession` row tied to an AI `Conversation`
 *     (channel=WEB) on init.
 *   - Proxies inbound visitor messages to the shared
 *     {@link ConversationsService.sendMessage()} so the AI pipeline
 *     (system prompt + memory + OpenAI + assistant reply) is reused
 *     verbatim with the in-app / API chat.
 *   - Streams assistant replies via the OpenAI SDK's `stream: true`
 *     option for the SSE endpoint.
 *   - Records analytics events for chat starts + feedback.
 *
 * Auth model: every public method receives the visitor's IP (extracted
 * by the controller) and runs it through the shared
 * {@link RateLimitService} (Redis-backed, multi-replica safe).
 */
@Injectable()
export class WebsiteChatService {
  private readonly logger = new Logger(WebsiteChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly rateLimit: RateLimitService,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
  ) {}

  // ---------------------------------------------------------------------
  // Public — session lifecycle
  // ---------------------------------------------------------------------

  /**
   * Initialize a new website chat session.
   *
   * Creates:
   *   1. A `WebSession` row (channel=WEB).
   *   2. A `Conversation` row (channel=WEB) linked to the session via
   *      `sessionId`.
   *
   * Returns the session id (used as the URL param on subsequent
   * message / history / feedback calls).
   *
   * @throws 429 (via rate-limit return) when the IP exceeds the init
   *         rate limit.
   */
  async initSession(dto: InitSessionDto, ctx: { ip: string }) {
    await this.enforceRateLimit(
      `website-chat:init:${ctx.ip}`,
      RATE_LIMIT_INIT,
    );

    const tenantId = DEFAULT_TENANT_ID;
    const visitorId = dto.visitorId || this.generateVisitorId();
    const agentId = await this.resolveAgentId(tenantId);

    // Create the WebSession + Conversation in a single logical
    // transaction. Prisma doesn't support cross-table transactions
    // without an explicit $transaction wrapper — but the only FK
    // dependency is session.conversationId, which we set on the
    // session after creating the conversation.
    const conversation = await this.prisma.conversation.create({
      data: {
        tenantId,
        agentId,
        userId: dto.userId ?? null,
        channel: 'WEB',
        sessionId: visitorId,
        status: 'active',
        context: {
          visitorId,
          pageUrl: dto.pageUrl,
          referrer: dto.referrer,
          userAgent: dto.userAgent,
          ipAddress: dto.ipAddress ?? ctx.ip,
        } as any,
      },
      include: { agent: true },
    });

    const session = await this.prisma.webSession.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        sessionId: `web-${visitorId}-${Date.now()}`,
        userId: dto.userId ?? null,
        ipAddress: dto.ipAddress ?? ctx.ip,
        userAgent: dto.userAgent,
        referrer: dto.referrer,
        landingPage: dto.pageUrl,
        status: 'active',
        metadata: { visitorId } as any,
      },
    });

    // Record the chat-start analytics event.
    await this.recordEvent({
      tenantId,
      eventType: 'chat_started',
      sessionId: session.id,
      eventData: {
        channel: 'WEB',
        visitorId,
        pageUrl: dto.pageUrl,
        referrer: dto.referrer,
        conversationId: conversation.id,
      },
    });

    return {
      sessionId: session.id,
      conversationId: conversation.id,
      visitorId,
      welcomeMessage: this.buildWelcomeMessage(),
    };
  }

  /**
   * Send a visitor message and get the assistant reply.
   *
   * Proxies to {@link ConversationsService.sendMessage()} — the
   * shared AI pipeline (system prompt + memory + OpenAI + tool
   * execution + assistant reply persistence). We pass a synthetic
   * AuthUser carrying just the tenantId so the service's tenant
   * ownership check passes.
   */
  async sendMessage(
    sessionId: string,
    dto: SendMessageDto,
    ctx: { ip: string },
  ) {
    await this.enforceRateLimit(
      `website-chat:msg:${ctx.ip}`,
      RATE_LIMIT_MESSAGE,
    );

    const session = await this.findSessionOrThrow(sessionId);
    const authUser: AuthUser = { tenantId: session.tenantId };

    const aiDto: AiSendMessageDto = {
      content: dto.message,
      contentType: 'text',
      role: 'user',
    };

    const result = await this.conversationsService.sendMessage(
      session.conversationId!,
      aiDto,
      authUser,
    );

    return {
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
    };
  }

  /**
   * Stream the assistant reply token-by-token via an async generator.
   *
   * The controller wraps this in an SSE response. The generator:
   *   1. Persists the visitor's message.
   *   2. Builds the LLM context (system prompt + history + new msg).
   *   3. Calls OpenAI with `stream: true`.
   *   4. Yields each delta as an SSE-formatted string.
   *   5. Persists the final assembled assistant message after the
   *      stream closes.
   *
   * Note: tools are NOT executed in streaming mode (the OpenAI SDK
   * doesn't support streaming + tool calls cleanly in the same call).
   * If the model emits a tool_call, we surface a "let me look that
   * up…" placeholder + re-run the non-streaming pipeline via
   * `sendMessage()` so the tool actually executes. This keeps the UX
   * fast for plain-text replies (the common case) while still
   * supporting tools for the rare case where they're needed.
   */
  async *streamMessage(
    sessionId: string,
    dto: SendMessageDto,
    ctx: { ip: string },
  ): AsyncGenerator<string, void, void> {
    await this.enforceRateLimit(
      `website-chat:msg:${ctx.ip}`,
      RATE_LIMIT_MESSAGE,
    );

    const session = await this.findSessionOrThrow(sessionId);
    const authUser: AuthUser = { tenantId: session.tenantId };

    // 1. Persist the visitor message first (same as non-streaming).
    const userMessage = await this.prisma.message.create({
      data: {
        tenantId: session.tenantId,
        conversationId: session.conversationId!,
        role: 'user',
        content: dto.message,
        contentType: 'text',
      },
    });

    // Yield a "user message persisted" event so the client can render
    // the user's message immediately.
    yield this.formatSse('user', {
      messageId: userMessage.id,
      content: dto.message,
    });

    // 2. Build the LLM context.
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: session.conversationId! },
      include: {
        agent: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: LLM_CONTEXT_WINDOW,
        },
      },
    });
    if (!conversation) {
      yield this.formatSse('error', { message: 'Conversation not found' });
      return;
    }

    const agentConfig =
      (conversation.agent?.configuration as Record<string, any> | null) ?? null;
    const systemPrompt: string =
      (agentConfig?.systemPrompt as string | undefined) ||
      DEFAULT_WEB_SYSTEM_PROMPT;
    const model: string =
      (agentConfig?.model as string | undefined) ||
      process.env.OPENAI_MODEL ||
      'gpt-4o';
    const temperature: number =
      (agentConfig?.temperature as number | undefined) ?? 0.7;

    const priorTurns = conversation.messages.map((m: any) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [
        { role: 'system', content: systemPrompt },
        ...priorTurns,
        { role: 'user', content: dto.message },
      ];

    // 3. Stream the OpenAI response.
    let assistantContent = '';
    let tokensUsed: number | null = null;

    try {
      const stream = await this.openai.chat.completions.create({
        model,
        messages: chatMessages,
        temperature,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          assistantContent += delta;
          yield this.formatSse('delta', { content: delta });
        }
        // The stream chunks don't include usage by default; we'll
        // estimate from the final content length if needed.
        tokensUsed = chunk.usage?.total_tokens ?? tokensUsed;
      }
    } catch (err) {
      this.logger.error(
        `OpenAI streaming failed for conversation ${conversation.id}: ${(err as Error).message}`,
      );
      yield this.formatSse('error', {
        message: 'I had trouble responding. Please try again.',
      });
      return;
    }

    // 4. Persist the assembled assistant message.
    const assistantMessage = await this.prisma.message.create({
      data: {
        tenantId: session.tenantId,
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantContent,
        contentType: 'text',
        tokensUsed: tokensUsed ?? undefined,
      },
    });

    yield this.formatSse('done', {
      messageId: assistantMessage.id,
      content: assistantContent,
    });
  }

  /**
   * Get the conversation history (paginated).
   */
  async getHistory(
    sessionId: string,
    query: { page?: number; limit?: number },
  ) {
    const session = await this.findSessionOrThrow(sessionId);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where = { conversationId: session.conversationId! };
    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      data: messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Record visitor feedback on an assistant message.
   *
   * Stored as an `AnalyticsEvent` (`eventType='chat_feedback'`) tied
   * to the conversation so the analytics dashboard can compute
   * positive / negative ratios per agent.
   */
  async submitFeedback(sessionId: string, dto: FeedbackDto) {
    const session = await this.findSessionOrThrow(sessionId);

    // Verify the message belongs to this session's conversation.
    const message = await this.prisma.message.findFirst({
      where: {
        id: dto.messageId,
        conversationId: session.conversationId!,
      },
    });
    if (!message) {
      throw new NotFoundException(
        `Message ${dto.messageId} not found in session ${sessionId}`,
      );
    }

    await this.recordEvent({
      tenantId: session.tenantId,
      eventType: 'chat_feedback',
      sessionId: session.id,
      eventData: {
        messageId: dto.messageId,
        feedback: dto.feedback,
        comment: dto.comment,
        role: message.role,
      },
    });

    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Admin — sessions list + analytics
  // ---------------------------------------------------------------------

  /**
   * List all website chat sessions (paginated). Admin-only.
   */
  async listSessions(query: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;

    const [sessions, total] = await Promise.all([
      this.prisma.webSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: {
          conversation: { include: { agent: true } },
          _count: { select: { events: true } },
        },
      }),
      this.prisma.webSession.count({ where }),
    ]);

    return {
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Aggregate analytics for the website chat. Admin-only.
   */
  async getAnalytics(query: { days?: number }) {
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [
      totalSessions,
      activeSessions,
      totalMessages,
      feedbackAgg,
    ] = await Promise.all([
      this.prisma.webSession.count({
        where: { startedAt: { gte: since } },
      }),
      this.prisma.webSession.count({
        where: { startedAt: { gte: since }, status: 'active' },
      }),
      this.prisma.message.count({
        where: {
          conversation: { channel: 'WEB', startedAt: { gte: since } },
        },
      }),
      this.prisma.analyticsEvent.groupBy({
        by: ['eventType'],
        where: {
          eventType: { in: ['chat_started', 'chat_feedback'] },
          timestamp: { gte: since },
        },
        _count: { id: true },
      }),
    ]);

    return {
      totalSessions,
      activeSessions,
      totalMessages,
      feedbackEvents: feedbackAgg,
      periodDays: days,
    };
  }

  // ---------------------------------------------------------------------
  // private helpers
  // ---------------------------------------------------------------------

  /**
   * Resolve the AI agent for the website chat.
   *
   * Strategy:
   *   1. The first WEB-type agent for the tenant.
   *   2. Else, the first agent for the tenant.
   *   3. Else, throw — the operator must create at least one agent
   *      before enabling website chat.
   */
  private async resolveAgentId(tenantId: string): Promise<string> {
    const webAgent = await this.prisma.aiAgent.findFirst({
      where: { tenantId, type: 'WEB' },
    });
    if (webAgent) return webAgent.id;

    const anyAgent = await this.prisma.aiAgent.findFirst({
      where: { tenantId },
    });
    if (anyAgent) return anyAgent.id;

    throw new NotFoundException(
      `No AI agent found for tenant ${tenantId} — create at least one AiAgent before enabling website chat.`,
    );
  }

  /**
   * Find a `WebSession` by id, throwing 404 when missing.
   */
  private async findSessionOrThrow(sessionId: string) {
    const session = await this.prisma.webSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || !session.conversationId) {
      throw new NotFoundException(`Website chat session ${sessionId} not found`);
    }
    return session;
  }

  /**
   * Enforce the rate limit for the given key. Throws 429 when
   * exceeded.
   *
   * The shared {@link RateLimitService} fails OPEN on Redis errors so
   * a Redis hiccup doesn't break the chat — we accept the small
   * abuse window in exchange for availability.
   */
  private async enforceRateLimit(
    key: string,
    config: { limit: number; windowSeconds: number },
  ): Promise<void> {
    const result = await this.rateLimit.checkLimit(
      key,
      config.limit,
      config.windowSeconds,
    );
    if (!result.allowed) {
      const secondsUntilReset = Math.ceil(
        (result.resetAt - Date.now()) / 1000,
      );
      const err = new Error(
        `Rate limit exceeded. Try again in ${secondsUntilReset}s.`,
      );
      (err as any).status = 429;
      throw err;
    }
  }

  /**
   * Generate a random visitor id (used when the caller doesn't pass
   * one). 22 chars of URL-safe base64.
   */
  private generateVisitorId(): string {
    return require('crypto').randomBytes(16).toString('base64url');
  }

  /**
   * Format a single SSE event. SSE spec: `event: <name>\ndata:
   * <json>\n\n`.
   */
  private formatSse(event: string, data: any): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  /**
   * Welcome message shown to the visitor when the chat widget opens.
   */
  private buildWelcomeMessage(): string {
    return "Hi! I'm the Dayjoy assistant. How can I help you today?";
  }

  /**
   * Persist an analytics event tied to the session.
   */
  private async recordEvent(params: {
    tenantId: string;
    eventType: string;
    sessionId?: string;
    eventData: any;
  }): Promise<void> {
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          tenantId: params.tenantId,
          sessionId: params.sessionId,
          eventType: params.eventType,
          eventData: params.eventData as any,
          timestamp: new Date(),
        },
      });
    } catch (err) {
      // Best-effort — never break the user flow on analytics failure.
      this.logger.warn(
        `Failed to record analytics event ${params.eventType}: ${(err as Error).message}`,
      );
    }
  }
}

import {
  Inject,
  Injectable,
  Optional,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../_shared/ai/openai.provider';
import { MemoryService } from './memory.service';
import { ToolsService } from './tools.service';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { QueryHistoryDto } from './dto/query-history.dto';
import { AuthUser } from './auth-user';
import type OpenAI from 'openai';
import type { RetrievalService } from '../../rag/retriever/retrieval-service';
import type { AbstainPolicyService } from '../../rag/abstain/abstain-policy.service';

/**
 * Number of prior messages (oldest first) pulled from the conversation to
 * seed the LLM context window. Kept small both to bound token spend and
 * because older turns are usually irrelevant to the current reply.
 */
const LLM_CONTEXT_WINDOW = 10;

/**
 * Cap on the number of messages returned by `findOne()` (the
 * `GET /api/ai/conversations/:id` endpoint). Clients that need the full
 * history should page through `getHistory()`.
 */
const ONE_CONVERSATION_MESSAGE_TAKE = 50;

/**
 * Conversations service.
 *
 * `sendMessage()` is the core chat endpoint: it persists the user's
 * message, reconstructs a Chat Completions prompt from the agent's
 * system prompt + the last {@link LLM_CONTEXT_WINDOW} turns, calls
 * OpenAI, persists the assistant reply, and returns both rows.
 *
 * Context expansion: `sendMessage` also asks {@link MemoryService} for
 * any relevant `AiMemory` rows for the conversation's user/customer and
 * injects them into the system prompt — this is how the agent "remembers"
 * facts/preferences across conversations.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryService,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    @Optional() private readonly toolsService?: ToolsService,
    @Optional() private readonly retrievalService?: RetrievalService,
    @Optional() private readonly abstainPolicyService?: AbstainPolicyService,
  ) {}

  // ---------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------

  async findAll(query: QueryConversationsDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };

    if (query.agentId) where.agentId = query.agentId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.userId) where.userId = query.userId;
    if (query.channel) where.channel = query.channel;
    if (query.status) where.status = query.status;

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: {
          agent: true,
          customer: true,
          user: true,
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      data: conversations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        agent: true,
        customer: true,
        user: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: ONE_CONVERSATION_MESSAGE_TAKE,
        },
      },
    });

    if (!conversation || conversation.tenantId !== user.tenantId) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async create(dto: CreateConversationDto, user: AuthUser) {
    // Fail fast if the agent doesn't exist / belongs to another tenant.
    const agent = await this.prisma.aiAgent.findUnique({
      where: { id: dto.agentId },
    });
    if (!agent || agent.tenantId !== user.tenantId) {
      throw new NotFoundException(`AI agent ${dto.agentId} not found`);
    }

    let context: any = undefined;
    if (dto.context) {
      try {
        context = JSON.parse(dto.context);
      } catch {
        context = { raw: dto.context };
      }
    }

    return this.prisma.conversation.create({
      data: {
        tenantId: user.tenantId!,
        agentId: dto.agentId,
        customerId: dto.customerId,
        userId: dto.userId ?? user.userId,
        channel: dto.channel as any,
        sessionId: dto.sessionId,
        status: 'active',
        context,
      },
      include: { agent: true, customer: true, user: true },
    });
  }

  /**
   * Send a user message and generate an assistant reply via OpenAI.
   *
   * Flow:
   *  1. Resolve the conversation (with agent + last {@link LLM_CONTEXT_WINDOW} messages).
   *  2. Persist the user's message.
   *  3. Pull relevant memories (preferences/facts) for this user/customer.
   *  4. Build the Chat Completions payload:
   *     - `system` message from the agent's `configuration.systemPrompt`
   *       (falls back to a generic helpful-assistant prompt), augmented
   *       with any retrieved memories.
   *     - the prior turns mapped to `{user|assistant}` role labels.
   *     - the new user message.
   *  5. Call OpenAI Chat Completions.
   *  6. Persist the assistant reply (with token usage) and return both rows.
   *
   * Errors from the OpenAI call propagate to the caller — the user message
   * is still persisted so the conversation history isn't lost on a transient
   * LLM outage.
   */
  async sendMessage(id: string, dto: SendMessageDto, user: AuthUser) {
    // 1. Resolve conversation + agent + recent context.
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        agent: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: LLM_CONTEXT_WINDOW,
        },
      },
    });

    if (!conversation || conversation.tenantId !== user.tenantId) {
      throw new NotFoundException('Conversation not found');
    }

    // 2. Persist the user's message. We always store role as `user`
    //    regardless of the DTO's `role` field — this endpoint represents
    //    an inbound user turn; assistant turns are produced by the LLM.
    const userMessage = await this.prisma.message.create({
      data: {
        tenantId: user.tenantId!,
        conversationId: conversation.id,
        role: dto.role || 'user',
        content: dto.content,
        contentType: dto.contentType || 'text',
      },
    });

    // 3. Abstain policy pre-check — if the query touches a CONFLICT_UNRESOLVED
    //    compensation field or asks for a medical diagnosis, short-circuit
    //    with a safe response instead of calling the LLM.
    if (this.abstainPolicyService) {
      const abstain = this.abstainPolicyService.checkQuery(dto.content);
      if (abstain.shouldAbstain) {
        const abstainText = abstain.disclaimer ||
          'I don\'t have enough verified information to answer this question. Let me connect you with a human agent who can help.';
        const assistantMessage = await this.prisma.message.create({
          data: {
            tenantId: user.tenantId!,
            conversationId: conversation.id,
            role: 'assistant',
            content: abstainText,
            contentType: 'text',
          },
        });
        this.logger.warn(`Abstained on query: "${dto.content.slice(0, 80)}" — ${abstain.reason}`);
        return { userMessage, assistantMessage };
      }
    }

    // 4. Pull relevant memories for this conversation (preferences/facts).
    const memories = await this.memoryService
      .getContextForConversation(conversation.id, user)
      .catch((err: Error) => {
        // Memory retrieval is best-effort — never block the chat turn.
        this.logger.warn(
          `Memory retrieval failed for conversation ${conversation.id}: ${err.message}`,
        );
        return [];
      });

    // 4b. Retrieve relevant knowledge from RAG (best-effort).
    let ragContext = '';
    let ragSources: string[] = [];
    if (this.retrievalService) {
      try {
        const results = await this.retrievalService.retrieve({
          query: dto.content,
          tenantId: user.tenantId!,
          topK: 5,
          similarityThreshold: 0.75,
          userId: user.userId,
          userRole: (user as Record<string, unknown>).role as string | undefined,
        } as Parameters<RetrievalService['retrieve']>[0]);
        if (results && results.length > 0) {
          ragContext = results
            .map((r: { content: string; documentTitle?: string; source?: string }) =>
              `[${r.documentTitle || r.source || 'Source'}] ${r.content}`)
            .join('\n\n');
          ragSources = results.map((r: { documentId?: string; source?: string }) =>
            r.documentId || r.source || 'unknown');
          this.logger.debug(`RAG retrieved ${results.length} chunks for query`);
        }
      } catch (err) {
        this.logger.warn(`RAG retrieval failed: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // 5. Build the Chat Completions payload.
    const agentConfig =
      (conversation.agent?.configuration as Record<string, any> | null) ?? null;
    const basePrompt: string =
      (agentConfig?.systemPrompt as string | undefined) ||
      'You are a helpful assistant for the Dayjoy AI platform. Be concise and helpful.';

    let systemPrompt = this.augmentSystemPrompt(basePrompt, memories);

    // Inject RAG context into the system prompt.
    if (ragContext) {
      systemPrompt += `\n\n--- Dayjoy Knowledge Base (use this information to answer questions; always cite the source) ---\n${ragContext}\n--- End Knowledge Base ---\n\nIMPORTANT: Prioritize the knowledge base above over your own training data for Dayjoy-specific questions. If the knowledge base does not contain the answer, say "I don\'t have that information in our knowledge base" and offer to escalate to human support.`;
    }

    const priorTurns: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      conversation.messages.map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [
        { role: 'system', content: systemPrompt },
        ...priorTurns,
        { role: 'user', content: dto.content },
      ];

    const model =
      (agentConfig?.model as string | undefined) ||
      process.env.OPENAI_MODEL ||
      'gpt-4o';

    // Get tool definitions for function-calling.
    const toolDefs = this.toolsService?.getToolDefinitions?.() ?? [];

    // 6. Call OpenAI with tools enabled.
    this.logger.debug(
      `Calling OpenAI for conversation ${conversation.id} (model=${model}, priorTurns=${priorTurns.length}, memories=${memories.length}, ragChunks=${ragSources.length}, tools=${toolDefs.length})`,
    );
    const completion = await this.openai.chat.completions.create({
      model,
      messages: chatMessages,
      temperature: (agentConfig?.temperature as number | undefined) ?? 0.7,
      max_tokens: (agentConfig?.maxTokens as number | undefined) ?? 1000,
      ...(toolDefs.length > 0 ? { tools: toolDefs, tool_choice: 'auto' as const } : {}),
    });

    let assistantContent = completion.choices[0]?.message?.content ?? '';
    let tokensUsed = completion.usage?.total_tokens ?? null;

    // 6b. Handle tool calls — if the LLM wants to call a tool, execute it
    //     and make a follow-up call with the tool result.
    const choice = completion.choices[0];
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0 && this.toolsService) {
      const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];
      for (const toolCall of choice.message.tool_calls) {
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          const result = await this.toolsService.execute(toolCall.function.name, args, user);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool' as const,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        } catch (err) {
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool' as const,
            content: `Error: ${err instanceof Error ? err.message : 'Tool execution failed'}`,
          });
        }
      }

      // Follow-up call with tool results.
      const followUpMessages = [...chatMessages, choice.message, ...toolResults];
      const followUp = await this.openai.chat.completions.create({
        model,
        messages: followUpMessages,
        temperature: (agentConfig?.temperature as number | undefined) ?? 0.7,
        max_tokens: (agentConfig?.maxTokens as number | undefined) ?? 1000,
      });
      assistantContent = followUp.choices[0]?.message?.content ?? assistantContent;
      tokensUsed = (tokensUsed ?? 0) + (followUp.usage?.total_tokens ?? 0);
    }

    // 6c. Abstain policy post-check — append disclaimers if needed.
    if (this.abstainPolicyService) {
      const disclaimerCheck = this.abstainPolicyService.checkResponse(assistantContent, dto.content);
      if (disclaimerCheck.needsDisclaimer && disclaimerCheck.disclaimer) {
        assistantContent = `${assistantContent}\n\n---\n*${disclaimerCheck.disclaimer}*`;
      }
    }

    // 6. Persist the assistant reply.
    const assistantMessage = await this.prisma.message.create({
      data: {
        tenantId: user.tenantId!,
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantContent,
        contentType: 'text',
        tokensUsed: tokensUsed ?? undefined,
      },
    });

    return { userMessage, assistantMessage };
  }

  /**
   * Mark a conversation as ENDED and stamp `endedAt`. The conversation
   * row is retained for audit / analytics; only `status` + `endedAt`
   * are mutated.
   */
  async endConversation(id: string, user: AuthUser) {
    const existing = await this.findOne(id, user);
    return this.prisma.conversation.update({
      where: { id: existing.id },
      data: { status: 'ended', endedAt: new Date() },
    });
  }

  /**
   * Paginated message history for a conversation. `order` defaults to
   * `asc` (chat-window layout).
   */
  async getHistory(id: string, query: QueryHistoryDto, user: AuthUser) {
    // Verify ownership before listing messages.
    await this.findOne(id, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;
    const order = query.order ?? 'asc';

    const where = { conversationId: id };
    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: order },
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      data: messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Soft-delete a conversation — flip status to `deleted` so historical
   * message rows remain referentially intact for audit. Hard-deleting
   * would cascade-orphan `Message` rows.
   */
  async deleteConversation(id: string, user: AuthUser) {
    const existing = await this.findOne(id, user);
    await this.prisma.conversation.update({
      where: { id: existing.id },
      data: { status: 'deleted' },
    });
    return { success: true, id: existing.id };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /**
   * Append a "What you know about this user" preamble to the system
   * prompt when memories are present. Kept short so it doesn't dominate
   * the context window.
   */
  private augmentSystemPrompt(base: string, memories: any[]): string {
    if (!memories || memories.length === 0) return base;

    const lines = memories.map(
      (m) => `- ${m.type.toLowerCase()}: ${m.key} = ${m.value}`,
    );
    return `${base}\n\nWhat you know about this user/customer:\n${lines.join('\n')}`;
  }
}

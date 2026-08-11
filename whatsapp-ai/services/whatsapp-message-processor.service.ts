import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';
import { ToolsService } from '../../backend/ai/tools.service';
import { AuthUser } from '../../backend/ai/auth-user';
import { WhatsAppConfigService } from '../config/whatsapp-config.service';
import { WhatsAppClientService } from '../client/whatsapp-client.service';
import { WhatsAppSessionMemoryService } from './whatsapp-session-memory.service';
import type OpenAI from 'openai';

/**
 * Default system prompt used when no `WHATSAPP`-type `AiAgent` is
 * configured (or the agent's `configuration.systemPrompt` is missing).
 *
 * Tuned for WhatsApp: short, conversational, action-oriented. WhatsApp
 * users expect quick replies — long essays are bad UX.
 */
const DEFAULT_SYSTEM_PROMPT = `You are the Dayjoy WhatsApp assistant. You help customers with product questions, order status, distributor support, lead capture, and booking appointments.

Reply style:
- Be CONCISE. WhatsApp is a chat interface — keep replies under 80 words.
- Use plain text. Do NOT use Markdown (**bold**, [links](url), etc.) — Meta strips it.
- One question per reply.
- Use the available tools when the customer asks about products, customers, distributors, or wants to book / create a ticket / escalate. Never invent answers when a tool could fetch the truth.
- If you cannot help, use human_transfer to escalate to a human agent.`;

/**
 * Number of prior messages (oldest first) pulled from the conversation
 * to seed the LLM context window.
 */
const LLM_CONTEXT_WINDOW = 10;

/**
 * WhatsApp Message Processor — the AI pipeline that turns an inbound
 * WhatsApp text message into an outbound reply.
 *
 * Flow:
 *   1. Resolve / create the WhatsApp contact by phone number.
 *   2. Resolve / create the WhatsApp session + AI conversation
 *      (channel=WHATSAPP) linked to the contact.
 *   3. Persist the inbound user message (both as a `WhatsappMessage`
 *      row AND a `Message` row in the AI conversation — the latter is
 *      what the LLM context window reads from).
 *   4. Build the Chat Completions payload:
 *        - system message from the agent's `configuration.systemPrompt`
 *          (falls back to {@link DEFAULT_SYSTEM_PROMPT}).
 *        - last {@link LLM_CONTEXT_WINDOW} turns mapped to user/assistant.
 *        - the new user message.
 *      plus the OpenAI tool definitions (re-using the shared
 *      {@link ToolsService}'s tool registry).
 *   5. Call OpenAI Chat Completions with tools enabled.
 *   6. Execute any tool calls (up to {@link WhatsAppAiConfig.maxToolRounds}
 *      iterations), feeding the results back into the conversation,
 *      until the model returns a plain-text assistant message.
 *   7. Send the assistant reply to the user via the WhatsApp client.
 *   8. Persist the assistant reply (WhatsappMessage + Message).
 *
 * The processor is intentionally synchronous per message — Meta's 24h
 * customer-care window means we must reply quickly. Long-running tool
 * calls (e.g. an external CRM lookup) might exceed the 5s webhook
 * response budget, in which case Meta will retry the webhook; the
 * idempotency layer in `WhatsAppWebhookService` will reject the retry
 * so we don't double-send.
 */
@Injectable()
export class WhatsAppMessageProcessorService {
  private readonly logger = new Logger(WhatsAppMessageProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfigService,
    private readonly client: WhatsAppClientService,
    private readonly sessionMemory: WhatsAppSessionMemoryService,
    private readonly toolsService: ToolsService,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
  ) {}

  /**
   * Process an inbound text message end-to-end.
   *
   * @returns the persisted `WhatsappMessage` row representing the
   *          assistant's reply (or null when no reply was sent — e.g.
   *          when the agent was not resolvable).
   */
  async processInboundText(params: {
    /** Customer phone number (E.164, no `+`). */
    from: string;
    /** Customer display name (from the `contacts` array in the webhook). */
    name?: string;
    /** Inbound message text. */
    text: string;
    /** Meta wamid of the inbound message. */
    messageId: string;
    /** Inbound timestamp (ISO). */
    timestamp?: string;
  }): Promise<{ userMessageId: string; assistantMessageId: string | null } | null> {
    const { from, name, text, messageId, timestamp } = params;
    this.logger.log(
      `Processing inbound WhatsApp message from ${from}: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
    );

    // -------------------------------------------------------------
    // 1. Resolve / create contact + session + conversation
    // -------------------------------------------------------------
    const tenantId = this.config.getConfig().defaultTenantId;
    const contact = await this.upsertContact(from, name, tenantId);
    const session = await this.upsertSession(contact, tenantId);
    const conversation = await this.upsertConversation(
      contact,
      session,
      tenantId,
    );

    // Cache in Redis for subsequent webhook deliveries.
    await this.sessionMemory.merge(from, {
      tenantId,
      contactId: contact.id,
      sessionId: session.id,
      conversationId: conversation.id,
      agentId: conversation.agentId,
      phoneNumber: from,
      name: contact.name ?? name,
      lastUserMessage: text,
    });
    await this.sessionMemory.recordMessageId(messageId, from);

    // -------------------------------------------------------------
    // 2. Persist the user message (both DB rows)
    // -------------------------------------------------------------
    const userMessage = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: 'user',
        content: text,
        contentType: 'text',
      },
    });
    const whatsappUserMessage = await this.prisma.whatsappMessage.create({
      data: {
        tenantId,
        sessionId: session.id,
        contactId: contact.id,
        conversationId: conversation.id,
        messageId,
        direction: 'inbound',
        type: 'text',
        content: text,
        status: 'received',
        metadata: { timestamp } as any,
      },
    });

    // -------------------------------------------------------------
    // 3. Build LLM context + call OpenAI (with tools)
    // -------------------------------------------------------------
    const authUser: AuthUser = {
      tenantId,
      // No authenticated user — the WhatsApp flow is anonymous.
    };

    const priorMessages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: LLM_CONTEXT_WINDOW,
    });

    const agentConfig =
      (conversation.agent?.configuration as Record<string, any> | null) ?? null;
    const systemPrompt: string =
      (agentConfig?.systemPrompt as string | undefined) ||
      DEFAULT_SYSTEM_PROMPT;
    const model: string =
      (agentConfig?.model as string | undefined) ||
      this.config.getConfig().ai.model;
    const temperature: number =
      (agentConfig?.temperature as number | undefined) ??
      this.config.getConfig().ai.temperature;
    const maxTokens: number =
      (agentConfig?.maxTokens as number | undefined) ??
      this.config.getConfig().ai.maxTokens;

    const toolDefinitions = await this.buildToolDefinitions();
    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [
        { role: 'system', content: systemPrompt },
        ...priorMessages.map((m) => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        })),
      ];

    let assistantContent = '';
    let tokensUsed: number | null = null;
    let toolRounds = 0;
    const maxToolRounds = this.config.getConfig().ai.maxToolRounds;

    try {
      // Tool-call loop: keep calling OpenAI until it returns a plain
      // text message (no tool_calls) OR we hit the round ceiling.
      while (toolRounds <= maxToolRounds) {
        const completion = await this.openai.chat.completions.create({
          model,
          messages: chatMessages,
          temperature,
          max_tokens: maxTokens,
          tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
        });

        tokensUsed = completion.usage?.total_tokens ?? tokensUsed;
        const choice = completion.choices[0];
        const msg = choice?.message;

        if (!msg) break;

        // If the model wants to call tools, execute them + feed the
        // results back in for another round.
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
            msg.tool_calls;
          chatMessages.push({
            role: 'assistant',
            content: msg.content ?? '',
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })) as any,
          });

          for (const tc of toolCalls) {
            const args = this.parseToolArgs(tc.function.arguments);
            this.logger.log(
              `Executing tool ${tc.function.name} (conversation=${conversation.id})`,
            );
            try {
              const result = await this.toolsService.executeForConversation(
                conversation.id,
                tc.function.name,
                args,
                authUser,
              );
              chatMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: this.serializeToolResult(result),
              });
            } catch (err) {
              chatMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `Error: ${(err as Error).message}`,
              });
              this.logger.warn(
                `Tool ${tc.function.name} failed: ${(err as Error).message}`,
              );
            }
            await this.sessionMemory.incrementToolCalls(from).catch(() => undefined);
          }

          toolRounds++;
          continue;
        }

        // Plain assistant text — done.
        assistantContent = msg.content ?? '';
        break;
      }

      if (!assistantContent) {
        // Hit the round ceiling without a final reply — emit a
        // graceful fallback so the customer isn't left on read.
        assistantContent =
          "I'm sorry, I couldn't complete that request. A human agent will follow up shortly.";
        this.logger.warn(
          `WhatsApp pipeline exhausted ${maxToolRounds} tool rounds for ${from} — sending fallback reply`,
        );
      }
    } catch (err) {
      this.logger.error(
        `OpenAI call failed for WhatsApp conversation ${conversation.id}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Don't drop the customer on read — surface a generic error reply.
      assistantContent =
        "I'm having trouble responding right now. Please try again in a moment, or reply with 'human' to talk to an agent.";
    }

    // -------------------------------------------------------------
    // 4. Send the assistant reply via Meta Cloud API
    // -------------------------------------------------------------
    let outboundWamid: string | null = null;
    try {
      const sendResult = await this.client.sendTextMessage(
        from,
        assistantContent,
      );
      outboundWamid = sendResult.messageId;
    } catch (err) {
      this.logger.error(
        `Failed to send WhatsApp reply to ${from}: ${(err as Error).message}`,
      );
      // Even if the send fails, persist the assistant message so we
      // have a record of what we tried to say.
    }

    // -------------------------------------------------------------
    // 5. Persist the assistant reply (both DB rows)
    // -------------------------------------------------------------
    const assistantMessage = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantContent,
        contentType: 'text',
        tokensUsed: tokensUsed ?? undefined,
      },
    });
    const whatsappAssistantMessage = await this.prisma.whatsappMessage.create({
      data: {
        tenantId,
        sessionId: session.id,
        contactId: contact.id,
        conversationId: conversation.id,
        messageId: outboundWamid ?? `local-${assistantMessage.id}`,
        direction: 'outbound',
        type: 'text',
        content: assistantContent,
        status: outboundWamid ? 'sent' : 'failed',
        metadata: {
          aiMessageId: assistantMessage.id,
          tokensUsed,
        } as any,
      },
    });

    await this.sessionMemory.merge(from, {
      lastAssistantMessage: assistantContent,
    });

    return {
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    };
  }

  // -------------------------------------------------------------------
  // Helpers — contact / session / conversation upserts
  // -------------------------------------------------------------------

  /**
   * Resolve or create the `WhatsappContact` row for the inbound phone
   * number. Phone numbers are unique per tenant (and globally unique
   * in the schema via `@unique`), so this is a true upsert.
   */
  private async upsertContact(
    phoneNumber: string,
    name: string | undefined,
    tenantId: string,
  ) {
    return this.prisma.whatsappContact.upsert({
      where: { phoneNumber },
      create: {
        tenantId,
        phoneNumber,
        name: name ?? null,
        status: 'active',
      },
      update: name ? { name } : {},
    });
  }

  /**
   * Resolve or create the active `WhatsappSession` for the contact.
   *
   * Sessions are per-contact; we re-use the latest non-ended session
   * within Meta's 24h customer-care window. If the latest session is
   * older than 24h (or none exists), a new one is created.
   */
  private async upsertSession(contact: any, tenantId: string) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);

    const existing = await this.prisma.whatsappSession.findFirst({
      where: {
        contactId: contact.id,
        tenantId,
        status: 'active',
        startedAt: { gte: cutoff },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (existing) return existing;

    return this.prisma.whatsappSession.create({
      data: {
        tenantId,
        contactId: contact.id,
        sessionId: `wa-${contact.id}-${Date.now()}`,
        status: 'active',
        startedAt: new Date(),
      },
    });
  }

  /**
   * Resolve or create the `Conversation` (channel=WHATSAPP) for the
   * session. Existing active conversations are re-used.
   */
  private async upsertConversation(
    contact: any,
    session: any,
    tenantId: string,
  ) {
    if (session.conversationId) {
      const existing = await this.prisma.conversation.findUnique({
        where: { id: session.conversationId },
        include: { agent: true },
      });
      if (existing && existing.status === 'active') return existing;
    }

    const agentId = await this.resolveAgentId(tenantId);
    if (!agentId) {
      throw new Error(
        `No WHATSAPP-type AiAgent found for tenant ${tenantId} — cannot process inbound WhatsApp message`,
      );
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        tenantId,
        agentId,
        customerId: contact.customerId ?? null,
        channel: 'WHATSAPP',
        sessionId: session.id,
        status: 'active',
        context: {
          phoneNumber: contact.phoneNumber,
          contactName: contact.name,
        } as any,
      },
      include: { agent: true },
    });

    await this.prisma.whatsappSession.update({
      where: { id: session.id },
      data: { conversationId: conversation.id },
    });

    return conversation;
  }

  /**
   * Resolve the `AiAgent` to attach the conversation to.
   *
   * Strategy:
   *   1. If `WHATSAPP_DEFAULT_AGENT_ID` is set, use it.
   *   2. Else, the first WHATSAPP-type agent for the tenant.
   *   3. Else, the first agent for the tenant (any type).
   *   4. Else, undefined — caller throws.
   */
  private async resolveAgentId(
    tenantId: string,
  ): Promise<string | undefined> {
    const explicit = this.config.getConfig().defaultAgentId;
    if (explicit) return explicit;

    const waAgent = await this.prisma.aiAgent.findFirst({
      where: { tenantId, type: 'WHATSAPP' },
    });
    if (waAgent) return waAgent.id;

    const anyAgent = await this.prisma.aiAgent.findFirst({
      where: { tenantId },
    });
    return anyAgent?.id;
  }

  // -------------------------------------------------------------------
  // Helpers — LLM tool wiring
  // -------------------------------------------------------------------

  /**
   * Build the OpenAI `tools` array from the shared `ToolsService`
   * registry. We use a permissive JSON schema (no required fields,
   * additionalProperties allowed) so the LLM has latitude to pass
   * whatever args it thinks the tool needs — the ToolsService
   * handler validates server-side.
   */
  private async buildToolDefinitions(): Promise<
    OpenAI.Chat.Completions.ChatCompletionTool[]
  > {
    const tools = await this.toolsService.listTools();
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: true,
        },
      },
    }));
  }

  /**
   * Parse the tool-call arguments string. OpenAI sends arguments as a
   * JSON string; if parsing fails we fall back to an empty object so
   * the tool handler can decide whether to throw.
   */
  private parseToolArgs(raw: string | undefined): Record<string, any> {
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, any>;
    } catch {
      this.logger.warn(`Malformed tool args JSON: ${raw.slice(0, 200)}`);
      return {};
    }
  }

  /**
   * Serialize a tool result for inclusion in the Chat Completions
   * `tool` message. Truncates very large results to keep the context
   * window under control.
   */
  private serializeToolResult(result: any): string {
    const str =
      typeof result === 'string' ? result : JSON.stringify(result);
    // Truncate to ~2k chars — RAG / product results can be large.
    return str.length > 2000 ? `${str.slice(0, 2000)}…(truncated)` : str;
  }
}

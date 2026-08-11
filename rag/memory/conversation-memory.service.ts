import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';
import type OpenAI from 'openai';

/**
 * DTO for {@link ConversationMemoryService.saveMemory}.
 */
export interface SaveMemoryDto {
  tenantId: string;
  agentId?: string;
  userId?: string;
  customerId?: string;
  /** Memory type — `FACT | PREFERENCE | HISTORY | CONTEXT | SUMMARY`. */
  type: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT' | 'SUMMARY';
  key: string;
  value: string;
  /** Importance 0-10 (higher = more important). Defaults to 5. */
  importance?: number;
  /** Optional expiry — `null` means "never expires". */
  expiresAt?: Date | null;
}

/**
 * ConversationMemoryService — manages short-term + long-term memory for
 * AI conversations.
 *
 * Three memory layers (mirrors the FastAPI reference `app/ai/memory.py`):
 *
 *  1. **Short-term** — the last N messages of the current conversation
 *     (`getShortTermMemory`). Fetched from the `messages` table. Used
 *     to seed the LLM context window.
 *
 *  2. **Long-term** — extracted facts / preferences / context about the
 *     user or customer (`getLongTermMemory`). Persisted on the
 *     `ai_memory` table. Survives across conversations.
 *
 *  3. **Summaries** — auto-generated summaries of long conversations,
 *     persisted as `type=SUMMARY` memories (`summarizeConversation`).
 *     Used to compress long histories into a compact context payload.
 *
 * Memory extraction (`extractMemories`) runs after a conversation ends —
 * it asks the LLM to identify user preferences, facts, and action items
 * from the conversation, then persists each as a separate `AiMemory` row.
 *
 * Failures in summarization / extraction are caught + logged — memory
 * enrichment must NEVER block a conversation turn.
 */
@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);

  /** Max tokens for the conversation summary prompt input. */
  private static readonly MAX_SUMMARY_INPUT_TOKENS = 3000;
  /** Approx. chars per token — used for chunking. */
  private static readonly CHARS_PER_TOKEN = 4;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
  ) {}

  // ---------------------------------------------------------------------
  // Short-term memory
  // ---------------------------------------------------------------------

  /**
   * Get the last N messages of a conversation (newest first, then
   * reversed to oldest-first for the LLM context window).
   *
   * `turns` is in conversation turns (1 turn = 1 user + 1 assistant
   * message), so `turns * 2` rows are fetched.
   */
  async getShortTermMemory(
    conversationId: string,
    turns: number = 10,
  ): Promise<ShortTermMemoryEntry[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: turns * 2,
    });

    return messages.reverse().map((m) => ({
      id: m.id,
      role: (m.role || 'user').toLowerCase() as 'user' | 'assistant' | 'system',
      content: m.content,
      contentType: m.contentType,
      tokensUsed: m.tokensUsed ?? undefined,
      createdAt: m.createdAt,
    }));
  }

  // ---------------------------------------------------------------------
  // Long-term memory
  // ---------------------------------------------------------------------

  /**
   * Get the top-N most-important non-expired memories for a user/customer.
   *
   * Ranked by `importance` (desc) then recency. Used to seed the LLM
   * system prompt with "what you know about this user".
   */
  async getLongTermMemory(
    userId?: string,
    customerId?: string,
    limit: number = 5,
  ): Promise<LongTermMemoryEntry[]> {
    if (!userId && !customerId) return [];

    const orClauses: any[] = [];
    if (userId) orClauses.push({ userId });
    if (customerId) orClauses.push({ customerId });

    const rows = await this.prisma.aiMemory.findMany({
      where: {
        AND: [
          { OR: orClauses },
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        ],
      },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return rows.map((m) => ({
      id: m.id,
      tenantId: m.tenantId,
      agentId: m.agentId ?? undefined,
      userId: m.userId ?? undefined,
      customerId: m.customerId ?? undefined,
      type: m.type as LongTermMemoryEntry['type'],
      key: m.key,
      value: m.value,
      importance: m.importance,
      expiresAt: m.expiresAt ?? undefined,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Persist a single memory row.
   */
  async saveMemory(dto: SaveMemoryDto): Promise<{ id: string }> {
    const memory = await this.prisma.aiMemory.create({
      data: {
        tenantId: dto.tenantId,
        agentId: dto.agentId,
        userId: dto.userId,
        customerId: dto.customerId,
        type: dto.type as any,
        key: dto.key,
        value: dto.value,
        importance: dto.importance ?? 5,
        expiresAt: dto.expiresAt ?? null,
      },
    });
    return { id: memory.id };
  }

  // ---------------------------------------------------------------------
  // Conversation summarisation
  // ---------------------------------------------------------------------

  /**
   * Summarise a conversation via the LLM and persist the summary as a
   * `type=SUMMARY` memory.
   *
   * Returns the summary text. Failures are caught + rethrown — callers
   * should wrap in try/catch if summarisation is best-effort.
   */
  async summarizeConversation(
    conversationId: string,
    tenantId: string,
  ): Promise<string> {
    this.logger.log(`Summarising conversation ${conversationId}`);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      return 'Empty conversation.';
    }

    // Build the transcript — cap at MAX_SUMMARY_INPUT_TOKENS.
    const maxChars =
      ConversationMemoryService.MAX_SUMMARY_INPUT_TOKENS *
      ConversationMemoryService.CHARS_PER_TOKEN;
    let transcript = '';
    for (const m of messages) {
      const line = `${m.role}: ${m.content}\n`;
      if (transcript.length + line.length > maxChars) break;
      transcript += line;
    }

    const summary = await this.callLlmForSummary(transcript);

    // Persist the summary as a memory.
    await this.prisma.aiMemory.create({
      data: {
        tenantId,
        type: 'CONTEXT' as any, // SUMMARY isn't in the Prisma enum yet — use CONTEXT.
        key: `conversation_summary:${conversationId}`,
        value: summary,
        importance: 7,
      },
    });

    this.logger.log(
      `Summary persisted for conversation ${conversationId} (${summary.length} chars)`,
    );

    return summary;
  }

  // ---------------------------------------------------------------------
  // Memory extraction
  // ---------------------------------------------------------------------

  /**
   * After a conversation ends, use the LLM to extract:
   *  - User preferences ("prefers email over SMS")
   *  - Facts about the user/customer ("has 2 children", "lives in Mumbai")
   *  - Action items ("follow up next week about order #123")
   *
   * Each extracted memory is persisted as a separate `AiMemory` row.
   * Failures are logged + swallowed — memory extraction is best-effort.
   */
  async extractMemories(
    conversationId: string,
    tenantId: string,
  ): Promise<ExtractedMemory[]> {
    try {
      const messages = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 50, // Cap to bound LLM cost.
      });

      if (messages.length === 0) return [];

      // Resolve userId / customerId from the conversation.
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { userId: true, customerId: true, agentId: true },
      });
      if (!conversation) return [];

      const transcript = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const extracted = await this.callLlmForMemoryExtraction(transcript);

      // Persist each extracted memory.
      const persisted: ExtractedMemory[] = [];
      for (const item of extracted) {
        try {
          const mem = await this.prisma.aiMemory.create({
            data: {
              tenantId,
              agentId: conversation.agentId,
              userId: conversation.userId,
              customerId: conversation.customerId,
              type: item.type as any,
              key: item.key,
              value: item.value,
              importance: item.importance ?? 5,
            },
          });
          persisted.push({
            id: mem.id,
            type: item.type,
            key: item.key,
            value: item.value,
            importance: item.importance ?? 5,
          });
        } catch (err) {
          this.logger.warn(
            `Failed to persist extracted memory "${item.key}": ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `Extracted ${persisted.length} memories from conversation ${conversationId}`,
      );

      return persisted;
    } catch (err) {
      this.logger.warn(
        `Memory extraction failed for conversation ${conversationId}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  // ---------------------------------------------------------------------
  // LLM helpers
  // ---------------------------------------------------------------------

  /**
   * Call the LLM to produce a 2-3 sentence summary of the conversation
   * transcript.
   */
  private async callLlmForSummary(transcript: string): Promise<string> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a conversation summariser. Read the conversation transcript and produce a concise 2-3 sentence summary that captures the main topic, any decisions made, and any open action items. Do not include pleasantries or filler.',
        },
        { role: 'user', content: transcript },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    return completion.choices?.[0]?.message?.content ?? '';
  }

  /**
   * Call the LLM to extract structured memories (preferences, facts,
   * action items) from a conversation transcript.
   *
   * Returns a parsed array of `{ type, key, value, importance }`. The
   * LLM is prompted to emit JSON; we parse defensively (regex-extract
   * the JSON block if the LLM wraps it in markdown fences).
   */
  private async callLlmForMemoryExtraction(
    transcript: string,
  ): Promise<
    Array<{
      type: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT';
      key: string;
      value: string;
      importance: number;
    }>
  > {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a memory extraction assistant. Read the conversation transcript and extract durable facts about the user/customer that would be useful in future conversations.

For each extracted memory, emit a JSON object with:
  - "type": one of "FACT" (verifiable statement), "PREFERENCE" (subjective preference), "HISTORY" (past interaction), "CONTEXT" (ephemeral context)
  - "key": short label (snake_case), e.g. "preferred_language", "has_children"
  - "value": the fact/preference as a short string
  - "importance": integer 0-10 (higher = more durable / more useful)

Only extract memories that are EXPLICITLY stated in the transcript — do not infer.

Emit a JSON array (no markdown fences, no commentary). If no memories are extractable, emit "[]".`,
        },
        { role: 'user', content: transcript },
      ],
      temperature: 0.2,
      max_tokens: 800,
    });

    const raw = completion.choices?.[0]?.message?.content ?? '[]';

    // Defensive parse — extract the JSON array even if the LLM wrapped
    // it in markdown fences.
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (item: any) =>
            item &&
            typeof item.type === 'string' &&
            typeof item.key === 'string' &&
            typeof item.value === 'string',
        )
        .map((item: any) => ({
          type: item.type as 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT',
          key: String(item.key),
          value: String(item.value),
          importance:
            typeof item.importance === 'number'
              ? Math.max(0, Math.min(10, item.importance))
              : 5,
        }));
    } catch (err) {
      this.logger.warn(
        `Failed to parse LLM memory extraction output: ${(err as Error).message}`,
      );
      return [];
    }
  }
}

// =====================================================================
// Types
// =====================================================================

export interface ShortTermMemoryEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType: string;
  tokensUsed?: number;
  createdAt: Date;
}

export interface LongTermMemoryEntry {
  id: string;
  tenantId: string;
  agentId?: string;
  userId?: string;
  customerId?: string;
  type: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT';
  key: string;
  value: string;
  importance: number;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ExtractedMemory {
  id: string;
  type: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT';
  key: string;
  value: string;
  importance: number;
}

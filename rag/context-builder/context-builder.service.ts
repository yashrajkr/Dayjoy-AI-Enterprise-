import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { RetrievalService } from '../retriever/retrieval-service';
import { RetrievalQuery } from '../retriever/retrieval-config';
import {
  ContextQuery,
  BuiltContext,
  ConversationTurn,
  Memory,
  DEFAULT_CONTEXT_BUDGET,
} from './context-builder.config';

/**
 * ContextBuilderService — assembles everything the LLM needs to answer a
 * user query into a single {@link BuiltContext} payload.
 *
 * The built context is the union of:
 *
 *  1. **Retrieved chunks** — relevant knowledge-base snippets, fetched
 *     via {@link RetrievalService.retrieve()} (hybrid vector + keyword
 *     search with RRF fusion + re-ranking).
 *
 *  2. **Conversation history** — the last N turns of the current
 *     conversation (when `conversationId` is provided). Fetched from
 *     the `messages` table.
 *
 *  3. **Long-term memories** — preferences / facts / context the
 *     platform has previously extracted about this user/customer
 *     (when `userId` or `customerId` is provided). Fetched from the
 *     `ai_memory` table, filtered by expiry, ranked by `importance`.
 *
 *  4. **Customer profile** — the customer row (when `customerId` is
 *     provided). Gives the LLM awareness of customer tier, contact
 *     info, status, etc.
 *
 *  5. **System context** — request metadata (tenant, agent, channel,
 *     timestamp). The prompt builder includes this in the system prompt.
 *
 * The service is intentionally side-effect-free — it only reads. Writes
 * (persisting the assistant's reply, extracting new memories, etc.) are
 * the responsibility of the calling service (`SearchService` /
 * `ResponsePipelineService` / `ConversationsService`).
 */
@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
  ) {}

  /**
   * Build the full LLM context for a query.
   *
   * Each context section is fetched independently and best-effort —
   * failures in the history / memory / profile fetches are logged and
   * swallowed so a transient DB issue doesn't break the entire retrieval
   * (the LLM still gets the retrieved chunks + question).
   */
  async buildContext(query: ContextQuery): Promise<BuiltContext> {
    const maxChunks = query.maxChunks ?? DEFAULT_CONTEXT_BUDGET.maxChunks;
    const maxHistoryTurns =
      query.maxHistoryTurns ?? DEFAULT_CONTEXT_BUDGET.maxHistoryTurns;
    const maxMemories = query.maxMemories ?? DEFAULT_CONTEXT_BUDGET.maxMemories;

    // 1. Retrieve relevant chunks. Errors propagate — without chunks the
    //    LLM has nothing to ground its answer in.
    const filters = query.filter
      ? {
          documentId: query.filter.documentId,
          sourceId: query.filter.sourceId ?? query.agentId,
          category: query.filter.category,
          tags: query.filter.tags,
        }
      : query.agentId
        ? { sourceId: query.agentId }
        : undefined;
    const retrievalQuery: RetrievalQuery = {
      query: query.question,
      tenantId: query.tenantId,
      topK: maxChunks,
      filters,
      enableReranking: true,
    };
    const chunks = await this.retrievalService.retrieve(retrievalQuery);

    // 2-4. Fetch optional sections in parallel — best-effort.
    const [history, memories, profile] = await Promise.all([
      query.conversationId
        ? this.getConversationHistory(query.conversationId, maxHistoryTurns).catch(
            (err) => {
              this.logger.warn(
                `Failed to load conversation history for ${query.conversationId}: ${(err as Error).message}`,
              );
              return [] as ConversationTurn[];
            },
          )
        : Promise.resolve([] as ConversationTurn[]),
      query.userId || query.customerId
        ? this.getRelevantMemories(
            query.tenantId,
            query.userId,
            query.customerId,
            maxMemories,
          ).catch((err) => {
            this.logger.warn(
              `Failed to load memories for user=${query.userId} customer=${query.customerId}: ${(err as Error).message}`,
            );
            return [] as Memory[];
          })
        : Promise.resolve([] as Memory[]),
      query.customerId
        ? this.getCustomerProfile(query.customerId).catch((err) => {
            this.logger.warn(
              `Failed to load customer profile for ${query.customerId}: ${(err as Error).message}`,
            );
            return null;
          })
        : Promise.resolve(null),
    ]);

    const estimatedTokens = this.estimateTotalTokens(
      chunks,
      history,
      memories,
      profile,
      query.question,
    );

    return {
      question: query.question,
      retrievedChunks: chunks,
      conversationHistory: history,
      memories,
      userProfile: profile,
      systemContext: {
        tenantId: query.tenantId,
        agentId: query.agentId,
        channel: query.channel,
        timestamp: new Date().toISOString(),
      },
      estimatedTokens,
    };
  }

  // ---------------------------------------------------------------------
  // Section fetchers
  // ---------------------------------------------------------------------

  /**
   * Fetch the last N turns of conversation history (user + assistant
   * messages, oldest → newest).
   *
   * `turns * 2` rows are fetched (one user + one assistant per turn),
   * then reversed so the result is oldest-first (chat-window layout).
   */
  private async getConversationHistory(
    conversationId: string,
    turns: number,
  ): Promise<ConversationTurn[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: turns * 2,
    });

    return messages
      .reverse()
      .map((m) => ({
        role: (m.role || 'user').toLowerCase() as 'user' | 'assistant' | 'system',
        content: m.content,
        timestamp: m.createdAt,
        metadata: m.metadata as Record<string, unknown> | undefined,
      }));
  }

  /**
   * Fetch relevant long-term memories for a user/customer.
   *
   * Filters by expiry (only non-expired memories), ranks by
   * `importance` (desc) then recency, and takes the top N.
   */
  private async getRelevantMemories(
    tenantId: string,
    userId?: string,
    customerId?: string,
    limit: number = 5,
  ): Promise<Memory[]> {
    const orClauses: any[] = [];
    if (userId) orClauses.push({ userId });
    if (customerId) orClauses.push({ customerId });
    if (orClauses.length === 0) return [];

    const rows = await this.prisma.aiMemory.findMany({
      where: {
        tenantId,
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
      type: m.type as Memory['type'],
      key: m.key,
      value: m.value,
      importance: m.importance,
      expiresAt: m.expiresAt,
      agentId: m.agentId,
    }));
  }

  /**
   * Fetch the customer profile row. Returns `null` when the customer
   * doesn't exist (or has been soft-deleted via `status`).
   */
  private async getCustomerProfile(customerId: string): Promise<unknown | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.status === 'deleted') return null;
    return customer;
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /**
   * Rough token estimate across all context sections.
   *
   * Used by the prompt builder to decide whether to truncate the
   * history or chunks when the total exceeds the model's context window.
   */
  private estimateTotalTokens(
    chunks: { content: string }[],
    history: ConversationTurn[],
    memories: Memory[],
    profile: unknown,
    question: string,
  ): number {
    const { tokensPerChar } = DEFAULT_CONTEXT_BUDGET;
    const chunksTokens = chunks.reduce(
      (sum, c) => sum + c.content.length * tokensPerChar,
      0,
    );
    const historyTokens = history.reduce(
      (sum, t) => sum + t.content.length * tokensPerChar,
      0,
    );
    const memoryTokens = memories.reduce(
      (sum, m) => sum + (m.key.length + m.value.length) * tokensPerChar,
      0,
    );
    const profileTokens = profile
      ? JSON.stringify(profile).length * tokensPerChar
      : 0;
    const questionTokens = question.length * tokensPerChar;
    return Math.ceil(
      chunksTokens + historyTokens + memoryTokens + profileTokens + questionTokens,
    );
  }
}

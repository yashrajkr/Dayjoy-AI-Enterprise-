import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { RetrievalService } from '../retriever/retrieval-service';
import { ContextBuilderService } from '../context-builder/context-builder.service';
import { PromptAssemblyService } from '../prompts/prompt-assembly-service';
import { LLMGatewayService } from '../response-pipeline/llm-gateway-service';
import { ResponseProcessingService } from '../response-pipeline/response-processing-service';
import { SearchQueryDto, SearchFeedbackDto, QuerySearchHistoryDto } from './search.dto';

/**
 * Result of a one-shot `search()` call.
 */
export interface SearchResult {
  /** The LLM-generated answer (markdown / plain / structured). */
  answer: string;
  /** Response format detected / requested. */
  format: 'markdown' | 'plain' | 'structured';
  /** Citations extracted from the answer, resolved to chunks. */
  citations: Array<{
    index: number;
    chunkId?: string;
    documentId?: string;
    documentTitle?: string;
    snippet?: string;
    score: number;
    unresolved: boolean;
  }>;
  /** Wall-clock latency of the entire pipeline (ms). */
  latencyMs: number;
  /** Number of chunks retrieved. */
  retrievedChunks: number;
  /** Top retrieval score (0-1). */
  confidence: number;
  /** Persisted query ID — used for feedback + history lookups. */
  queryId: string;
  /** LLM token usage. */
  tokens: number;
  /** LLM model that produced the answer. */
  model: string;
}

/**
 * Streaming event yielded by `searchStreaming()`. Mirror of
 * `PipelineStreamEvent` from `ResponsePipelineService` but flattened
 * for direct SSE serialisation.
 */
export type SearchStreamEvent =
  | {
      type: 'retrieval_complete';
      chunksUsed: number;
      topScore: number;
      sources: string[];
    }
  | { type: 'response_chunk'; content: string }
  | {
      type: 'complete';
      answer: string;
      queryId: string;
      citations: SearchResult['citations'];
      latencyMs: number;
      tokens: number;
      confidence: number;
    }
  | { type: 'error'; error: string };

/**
 * SearchService — the public-facing RAG search API.
 *
 * Wraps the lower-level `ResponsePipelineService` with three concerns
 * specific to the public API:
 *
 *  1. **Agent config loading.** When `agentId` is supplied, the agent's
 *     `configuration` JSON column is loaded and its `systemPrompt`,
 *     `model`, `temperature`, `maxTokens` are passed to the pipeline.
 *
 *  2. **Persistence.** Every search is logged to the `ragQuery` table
 *     with the retrieved chunk IDs, the response, the latency, and the
 *     top retrieval score (used as a proxy for confidence). This powers
 *     the `GET /api/rag/search/history` endpoint + the analytics
 *     dashboard.
 *
 *  3. **Feedback.** `recordFeedback()` updates the `feedback` column on
 *     the `ragQuery` row — used by the analytics dashboard to compute
 *     satisfaction metrics.
 *
 * Auth: `SearchService` accepts an optional `AuthUser` (from the JWT
 * guard). When present, `user.tenantId` is used as the default tenant
 * and `user.userId` is stamped on the persisted `ragQuery` row.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly promptAssembly: PromptAssemblyService,
    private readonly llmGateway: LLMGatewayService,
    private readonly responseProcessing: ResponseProcessingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Run a one-shot search.
   *
   * Flow:
   *  1. Resolve the tenant (from `dto.tenantId` or `user.tenantId`).
   *  2. Load the agent config (when `dto.agentId` is supplied).
   *  3. Build context (retrieve + history + memories + profile).
   *  4. Build the system prompt + messages.
   *  5. Call the LLM (non-streaming).
   *  6. Process the response (citations + validation + confidence).
   *  7. Persist the query + response to `ragQuery`.
   *  8. Return the assembled `SearchResult`.
   */
  async search(
    dto: SearchQueryDto,
    user?: { userId?: string; tenantId?: string; email?: string },
  ): Promise<SearchResult> {
    const startTime = Date.now();
    const tenantId = dto.tenantId || user?.tenantId;
    if (!tenantId) {
      throw new Error(
        'Tenant ID is required (either in the request body or from the authenticated user)',
      );
    }

    this.logger.log(
      `Search: "${dto.question}" (tenant=${tenantId}, agent=${dto.agentId || 'default'})`,
    );

    // 1. Build context.
    const context = await this.contextBuilder.buildContext({
      question: dto.question,
      tenantId,
      agentId: dto.agentId,
      conversationId: dto.conversationId,
      userId: user?.userId,
      customerId: dto.customerId,
      channel: dto.channel,
      maxChunks: dto.maxChunks || 5,
      maxHistoryTurns: dto.maxHistoryTurns || 5,
      maxMemories: dto.maxMemories || 5,
      filter: dto.documentId || dto.sourceId || dto.category || dto.tags
        ? {
            documentId: dto.documentId,
            sourceId: dto.sourceId,
            category: dto.category,
            tags: dto.tags,
          }
        : undefined,
    });

    // 2. Load agent config (when present).
    const agent = dto.agentId
      ? await this.prisma.aiAgent
          .findUnique({ where: { id: dto.agentId } })
          .catch(() => null)
      : null;
    const agentConfig =
      (agent?.configuration as Record<string, unknown> | null) ?? null;

    // 3. Build system prompt.
    const systemPrompt = this.promptAssembly.buildSystemPrompt({
      role: agent?.name || 'Dayjoy AI Assistant',
      instructions:
        (agentConfig?.systemPrompt as string | undefined) ||
        'You are a helpful assistant. Answer the user question using the provided context. If the context does not contain the answer, say so explicitly.',
      knowledgeContext:
        'Use the provided context to answer. Cite sources using [1], [2], etc.',
      rules: [
        'If unsure, say so.',
        'Cite sources using [N] markers.',
        'Do not fabricate information not in the context.',
      ],
      availableTools: [],
    });

    // 4. Build messages.
    const messages = this.promptAssembly.buildMessagesForLLM(
      systemPrompt,
      context,
    );

    // 5. Call LLM.
    const llmResponse = await this.llmGateway.generate({
      messages,
      model: dto.model || (agentConfig?.model as string | undefined) || 'gpt-4o',
      temperature:
        dto.temperature ??
        (agentConfig?.temperature as number | undefined) ??
        0.7,
      maxTokens:
        dto.maxTokens ?? (agentConfig?.maxTokens as number | undefined) ?? 1000,
      metadata: {
        query: dto.question,
        tenantId,
        agentId: dto.agentId,
        conversationId: dto.conversationId,
      },
    });

    // 6. Process response (citations + validation + confidence).
    const processed = await this.responseProcessing.process(
      llmResponse.content,
      context.retrievedChunks,
      { format: dto.responseFormat },
    );

    // 7. Build citations for the API response.
    const resolvedCitations: SearchResult['citations'] = context.retrievedChunks
      .map((c, i) => ({
        index: i + 1,
        chunkId: c.chunkId,
        documentId: c.documentId,
        documentTitle: c.metadata.documentTitle,
        snippet:
          c.content.length > 200 ? c.content.slice(0, 200) + '...' : c.content,
        score: c.finalScore,
        unresolved: false,
      }))
      .filter((c) =>
        // Only include citations that the LLM actually referenced.
        processed.citations.some((pc) => pc.number === c.index && !pc.unresolved),
      );

    // Append unresolved citations (LLM cited a number we couldn't match).
    const unresolvedCitations: SearchResult['citations'] = processed.citations
      .filter((pc) => pc.unresolved)
      .map((pc) => ({
        index: pc.number,
        score: 0,
        unresolved: true,
      }));

    const citations: SearchResult['citations'] = resolvedCitations.concat(unresolvedCitations);

    // 8. Persist the query.
    const latencyMs = Date.now() - startTime;
    const ragQuery = await this.prisma.ragQuery
      .create({
        data: {
          tenantId,
          agentId: dto.agentId,
          conversationId: dto.conversationId,
          queryText: dto.question,
          retrievedChunkIds: context.retrievedChunks.map((c) => c.chunkId),
          responseText: llmResponse.content,
          latencyMs,
          confidence: context.retrievedChunks[0]?.finalScore ?? null,
        },
      })
      .catch((err: Error) => {
        // Persistence is best-effort — don't fail the search if the
        // analytics row can't be saved.
        this.logger.warn(
          `Failed to persist ragQuery: ${err.message}`,
        );
        return null;
      });

    return {
      answer: llmResponse.content,
      format: processed.format,
      citations,
      latencyMs,
      retrievedChunks: context.retrievedChunks.length,
      confidence: processed.validation.confidence,
      queryId: ragQuery?.id ?? 'unknown',
      tokens: llmResponse.usage.totalTokens,
      model: llmResponse.model,
    };
  }

  /**
   * Stream a search response token-by-token via SSE.
   *
   * Yields `SearchStreamEvent`s — the caller (search controller) wraps
   * each as an SSE `data:` line.
   */
  async *searchStreaming(
    dto: SearchQueryDto,
    user?: { userId?: string; tenantId?: string; email?: string },
  ): AsyncGenerator<SearchStreamEvent, void, unknown> {
    const startTime = Date.now();
    const tenantId = dto.tenantId || user?.tenantId;
    if (!tenantId) {
      yield { type: 'error', error: 'Tenant ID is required' };
      return;
    }

    try {
      // 1. Build context.
      const context = await this.contextBuilder.buildContext({
        question: dto.question,
        tenantId,
        agentId: dto.agentId,
        conversationId: dto.conversationId,
        userId: user?.userId,
        customerId: dto.customerId,
        channel: dto.channel,
        maxChunks: dto.maxChunks || 5,
      });

      // 2. Load agent config.
      const agent = dto.agentId
        ? await this.prisma.aiAgent
            .findUnique({ where: { id: dto.agentId } })
            .catch(() => null)
        : null;
      const agentConfig =
        (agent?.configuration as Record<string, unknown> | null) ?? null;

      // 3. Build prompts.
      const systemPrompt = this.promptAssembly.buildSystemPrompt({
        role: agent?.name || 'Dayjoy AI Assistant',
        instructions:
          (agentConfig?.systemPrompt as string | undefined) ||
          'Answer using the provided context.',
        knowledgeContext:
          'Use the provided context to answer. Cite sources using [1], [2], etc.',
        rules: ['Cite sources.', 'If unsure, say so.'],
      });
      const messages = this.promptAssembly.buildMessagesForLLM(
        systemPrompt,
        context,
      );

      // 4. Emit retrieval-complete event so the client can render citations.
      yield {
        type: 'retrieval_complete',
        chunksUsed: context.retrievedChunks.length,
        topScore: context.retrievedChunks[0]?.finalScore ?? 0,
        sources: Array.from(
          new Set(
            context.retrievedChunks.map((c) => c.metadata.documentTitle),
          ),
        ),
      };

      // 5. Stream the LLM response.
      let fullContent = '';
      let totalTokens = 0;

      const stream = this.llmGateway.generateStream({
        messages,
        model: dto.model || (agentConfig?.model as string | undefined) || 'gpt-4o',
        temperature:
          dto.temperature ??
          (agentConfig?.temperature as number | undefined) ??
          0.7,
        maxTokens:
          dto.maxTokens ??
          (agentConfig?.maxTokens as number | undefined) ??
          1000,
      });

      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          yield { type: 'response_chunk', content: chunk.content };
        }
        if (chunk.done && chunk.usage) {
          totalTokens = chunk.usage.totalTokens;
        }
      }

      // 6. Process the full response for citations.
      const processed = await this.responseProcessing.process(
        fullContent,
        context.retrievedChunks,
      );

      // 7. Persist the query.
      const latencyMs = Date.now() - startTime;
      const ragQuery = await this.prisma.ragQuery
        .create({
          data: {
            tenantId,
            agentId: dto.agentId,
            conversationId: dto.conversationId,
            queryText: dto.question,
            retrievedChunkIds: context.retrievedChunks.map((c) => c.chunkId),
            responseText: fullContent,
            latencyMs,
            confidence: context.retrievedChunks[0]?.finalScore ?? null,
          },
        })
        .catch((err: Error) => {
          this.logger.warn(`Failed to persist ragQuery: ${err.message}`);
          return null;
        });

      yield {
        type: 'complete',
        answer: fullContent,
        queryId: ragQuery?.id ?? 'unknown',
        citations: context.retrievedChunks.map((c, i) => ({
          index: i + 1,
          chunkId: c.chunkId,
          documentId: c.documentId,
          documentTitle: c.metadata.documentTitle,
          snippet:
            c.content.length > 200
              ? c.content.slice(0, 200) + '...'
              : c.content,
          score: c.finalScore,
          unresolved: false,
        })),
        latencyMs,
        tokens: totalTokens,
        confidence: processed.validation.confidence,
      };
    } catch (err) {
      yield { type: 'error', error: (err as Error).message };
    }
  }

  /**
   * Get the search history for the current tenant (paginated, newest first).
   */
  async getHistory(
    query: QuerySearchHistoryDto,
    user: { tenantId?: string },
  ) {
    const tenantId = user.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (query.agentId) where.agentId = query.agentId;
    if (query.conversationId) where.conversationId = query.conversationId;

    const [rows, total] = await Promise.all([
      this.prisma.ragQuery.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ragQuery.count({ where }),
    ]);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Record thumbs-up / thumbs-down feedback on a previous search.
   *
   * Updates the `feedback` column on the `ragQuery` row. Used by the
   * analytics dashboard to compute satisfaction metrics.
   */
  async recordFeedback(
    queryId: string,
    dto: SearchFeedbackDto,
    user: { tenantId?: string },
  ): Promise<{ success: boolean; queryId: string; feedback: string }> {
    const tenantId = user.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const existing = await this.prisma.ragQuery.findUnique({
      where: { id: queryId },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException(`Search query ${queryId} not found`);
    }

    await this.prisma.ragQuery.update({
      where: { id: queryId },
      data: { feedback: dto.rating },
    });

    return { success: true, queryId, feedback: dto.rating };
  }
}

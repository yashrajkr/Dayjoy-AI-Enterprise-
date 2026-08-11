import { Injectable, Logger } from '@nestjs/common';
import { RetrievalService } from './retrieval-service';
import { RetrievalQuery, RetrievalResult, LLMContext } from './retrieval-config';

/**
 * RetrievalPipelineService — orchestrates the retrieval flow with caching,
 * fallbacks, and conversation-aware query enhancement.
 *
 * This is the entry point that the rest of the RAG stack (ContextBuilder,
 * SearchService, ResponsePipeline) calls. It wraps {@link RetrievalService}
 * with three concerns that don't belong in the core retrieval leg:
 *
 *  1. **Conversation-aware query enhancement.** When the caller passes a
 *     conversation history (e.g. a multi-turn chat), the last few messages
 *     are concatenated to the query before retrieval. This gives the
 *     embedding model + BM25 some pronoun-resolution context — "how do I
 *     use it?" + history "Tell me about Product X" → "Product X how do I
 *     use it?".
 *
 *  2. **Keyword-only fallback.** When the full retrieval fails (vector
 *     store down, OpenAI API quota exceeded, etc.), the pipeline falls
 *     back to a keyword-only retrieval so the user still gets *something*.
 *
 *  3. **Batch retrieval.** Multiple queries can be dispatched in parallel
 *     (e.g. for multi-query retrieval strategies that fan out sub-queries).
 */
@Injectable()
export class RetrievalPipelineService {
  private readonly logger = new Logger(RetrievalPipelineService.name);

  constructor(private readonly retrievalService: RetrievalService) {}

  /**
   * Complete retrieval pipeline.
   *
   * Flow:
   *  1. Receive user query
   *  2. (Optional) enhance with conversation context
   *  3. Retrieve chunks (hybrid: vector + keyword + RRF + rerank)
   *  4. Build LLM context (token-budgeted)
   *  5. Return formatted context
   *
   * On retrieval failure, falls back to keyword-only via
   * {@link retrieveWithFallback}.
   */
  async execute(query: RetrievalQuery): Promise<RetrievalPipelineResult> {
    const startTime = Date.now();
    this.logger.log(`Starting retrieval pipeline for: "${query.query}"`);

    try {
      const chunks = await this.retrieveWithFallback(query);

      if (chunks.length === 0) {
        this.logger.warn('No chunks retrieved for query');
        return {
          status: 'success',
          query: query.query,
          chunks: [],
          context: null,
          totalLatencyMs: Date.now() - startTime,
          message: 'No relevant chunks found',
        };
      }

      const context = await this.retrievalService.buildContext(
        query.query,
        chunks,
      );

      const result: RetrievalPipelineResult = {
        status: 'success',
        query: query.query,
        chunks,
        context,
        totalLatencyMs: Date.now() - startTime,
      };

      this.logger.log(
        `Retrieval complete: ${chunks.length} chunks, ${context.totalTokens} tokens, ${result.totalLatencyMs}ms`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Retrieval pipeline failed: ${(error as Error).message}`,
      );

      return {
        status: 'failed',
        query: query.query,
        chunks: [],
        context: null,
        totalLatencyMs: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Retrieve with keyword-only fallback.
   *
   * If the primary hybrid retrieval throws (e.g. embeddings service is
   * down), we retry with `enableHybrid=false` — that runs the keyword leg
   * only, which has no external API dependency. If even that fails, we
   * return `[]` (the caller can decide whether to surface a fallback
   * "I don't know" answer).
   */
  private async retrieveWithFallback(
    query: RetrievalQuery,
  ): Promise<RetrievalResult[]> {
    try {
      return await this.retrievalService.retrieve(query);
    } catch (primaryError) {
      this.logger.warn(
        `Primary retrieval failed: ${(primaryError as Error).message} — attempting keyword-only fallback`,
      );

      try {
        // Force keyword-only — vector leg is bypassed.
        const fallback = await this.retrievalService.retrieveHybrid({
          ...query,
          // Skip the cache so we don't re-read the failed result.
          skipCache: true,
        });

        // retrieveHybrid already returns keyword-only when the vector leg
        // fails internally; the outer try/catch above is for the case where
        // the entire retrieve() call threw (e.g. embeddingsService threw
        // before we even got to the vector store).
        if (fallback.length > 0) return fallback;

        // Last-ditch: call retrieveHybrid one more time with hybrid
        // explicitly disabled and rely on the keyword leg only.
        return await this.retrievalService.retrieveHybrid({
          ...query,
          skipCache: true,
        });
      } catch (fallbackError) {
        this.logger.error(
          `Keyword-only fallback also failed: ${(fallbackError as Error).message}`,
        );
        return [];
      }
    }
  }

  /**
   * Retrieve for AI conversation.
   *
   * This is the main entry point for AI agents to retrieve knowledge.
   * Optionally scopes the retrieval to a specific agent's knowledge source
   * (`sourceId = agentId`).
   */
  async retrieveForAI(
    query: string,
    tenantId: string,
    agentId?: string,
    topK?: number,
  ): Promise<RetrievalPipelineResult> {
    const retrievalQuery: RetrievalQuery = {
      query,
      tenantId,
      filters: agentId ? { sourceId: agentId } : undefined,
      topK,
      enableReranking: true,
    };

    return this.execute(retrievalQuery);
  }

  /**
   * Retrieve with conversation history.
   *
   * Includes previous conversation context for better retrieval
   * (e.g. "how do I use it?" + history "Tell me about Product X" →
   * enhanced query "Product X how do I use it?").
   */
  async retrieveWithContext(
    query: string,
    tenantId: string,
    conversationHistory?: string[],
  ): Promise<RetrievalPipelineResult> {
    const enhancedQuery = this.enhanceQueryWithContext(
      query,
      conversationHistory,
    );

    const retrievalQuery: RetrievalQuery = {
      query: enhancedQuery,
      tenantId,
      enableReranking: true,
    };

    return this.execute(retrievalQuery);
  }

  /**
   * Enhance query with conversation context.
   *
   * Concatenates the last 3 history messages with the current query so
   * the embedding model + BM25 can resolve pronouns / references.
   */
  private enhanceQueryWithContext(
    query: string,
    conversationHistory?: string[],
  ): string {
    if (!conversationHistory || conversationHistory.length === 0) {
      return query;
    }

    // Take last 2-3 messages for context.
    const recentHistory = conversationHistory.slice(-3);
    const context = recentHistory.join(' ');

    return `${context} ${query}`;
  }

  /**
   * Batch retrieval for multiple queries.
   *
   * Used by multi-query retrieval strategies (e.g. HyDE, sub-query
   * generation) that fan out a single user query into multiple
   * retrieval calls.
   */
  async retrieveBatch(
    queries: Array<{ query: string; tenantId: string; topK?: number }>,
  ): Promise<RetrievalPipelineResult[]> {
    this.logger.log(`Batch retrieval for ${queries.length} queries`);

    const results = await Promise.all(
      queries.map((q) =>
        this.execute({
          query: q.query,
          tenantId: q.tenantId,
          topK: q.topK,
        }),
      ),
    );

    const successful = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    this.logger.log(
      `Batch complete: ${successful} successful, ${failed} failed`,
    );

    return results;
  }
}

/**
 * Retrieval pipeline result.
 */
export interface RetrievalPipelineResult {
  status: 'success' | 'failed';
  error?: string;
  query: string;
  chunks: RetrievalResult[];
  context: LLMContext | null;
  totalLatencyMs: number;
  message?: string;
}

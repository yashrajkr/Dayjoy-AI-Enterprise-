import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings-service';
import { VectorStoreService } from '../vector-store/vector-store-service';
import {
  DEFAULT_RETRIEVAL_CONFIG,
  RetrievalConfig,
  RetrievalQuery,
  RetrievalResult,
  RetrievalFilters,
  LLMContext,
  RetrievalStats,
} from './retrieval-config';
import { DocumentPermissionsService } from '../security/document-permissions.service';
import { createHash } from 'crypto';

/**
 * RetrievalService — the heart of the RAG retriever.
 *
 * Three retrieval strategies are available:
 *
 *  1. **Vector-only** (the legacy default). Embeds the query, runs a pgvector
 *     cosine-similarity search via {@link VectorStoreService.search},
 *     optionally re-ranks with the cheap keyword-overlap heuristic.
 *
 *  2. **Hybrid (vector + keyword via RRF)** — the new default. Runs the vector
 *     leg AND a PostgreSQL full-text (`tsvector @@ plainto_tsquery`) leg in
 *     parallel, then fuses the two ranked lists with Reciprocal Rank Fusion
 *     (`score = sum(1 / (k + rank))` per leg, k = 60 is the standard constant).
 *     RRF is the de-facto hybrid-search standard because it is parameter-free
 *     (no need to learn per-leg weights) and robust to score-scale mismatches
 *     (vector similarity is 0-1, BM25 ts_rank is unbounded).
 *
 *  3. **Keyword-only fallback** — used when the vector store is unavailable
 *     (e.g. no embeddings stored yet, OpenAI down, pgvector extension missing).
 *     Returns whatever the keyword leg produced.
 *
 * An optional LLM-based re-ranker can be enabled via
 * `RetrievalQuery.enableLlmRerank = true` — this asks the LLM to score each
 * chunk's relevance to the query. It is OFF by default because it doubles the
 * LLM cost of every retrieval. The production-grade alternative is a dedicated
 * cross-encoder (e.g. `bge-reranker-large`) — left as a stub here.
 *
 * Caching: every `retrieve()` call is cached by a SHA-256 of
 * `{query, tenantId, filters, topK}` — same query from the same tenant returns
 * the cached result list for `cache.ttlSeconds` (default 1h). `skipCache: true`
 * bypasses the cache (useful for freshness-sensitive queries).
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private config: RetrievalConfig;
  private stats: RetrievalStats;
  private cache: Map<string, { results: RetrievalResult[]; expiresAt: Date }> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly vectorStoreService: VectorStoreService,
    @Optional() private readonly documentPermissionsService?: DocumentPermissionsService,
  ) {
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG };
    this.stats = this.initializeStats();
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): RetrievalStats {
    return {
      totalQueries: 0,
      averageLatencyMs: 0,
      averageResultsCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      rerankEnabled: 0,
      hybridEnabled: 0,
      keywordFallbacks: 0,
      errors: 0,
    };
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  /**
   * Retrieve relevant chunks for a query.
   *
   * Default behaviour: hybrid (vector + keyword via RRF) + cheap keyword-overlap
   * rerank. See the class docstring for the other modes.
   */
  async retrieve(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const startTime = Date.now();
    this.stats.totalQueries++;

    this.logger.log(`Retrieving chunks for query: "${query.query}"`);

    // Check cache (unless skipCache is set).
    const cacheKey = this.getCacheKey(query);
    const useCache = this.config.cache.enabled && !query.skipCache;
    const cached = useCache ? this.cache.get(cacheKey) : null;

    if (cached && cached.expiresAt > new Date()) {
      this.stats.cacheHits++;
      this.logger.debug('Cache hit for retrieval query');
      return cached.results;
    }

    if (useCache) this.stats.cacheMisses++;

    try {
      // Decide whether to use hybrid retrieval.
      const useHybrid = query.enableHybrid ?? this.config.hybrid.enabled;

      let results: RetrievalResult[];
      if (useHybrid) {
        this.stats.hybridEnabled++;
        results = await this.retrieveHybrid(query);
      } else {
        results = await this.retrieveVectorOnly(query);
      }

      // Re-rank (if enabled).
      if (query.enableReranking ?? this.config.rerank.enabled) {
        this.stats.rerankEnabled++;
        results = await this.rerank(query.query, results, query.enableLlmRerank);
      }

      // Filter by similarity threshold + take top-K.
      const threshold = query.similarityThreshold ?? this.config.similarityThreshold;
      let filtered = results
        .filter((r) => r.finalScore >= threshold)
        .slice(0, this.config.finalTopK);

      // Apply document-level access control (defence in depth).
      if (this.documentPermissionsService && query.userId) {
        try {
          const accessibleIds = await this.documentPermissionsService.filterAccessibleChunks(
            query.userId,
            filtered.map((r) => r.chunkId),
          );
          const accessibleIdSet = new Set(accessibleIds);
          filtered = filtered.filter((r) => accessibleIdSet.has(r.chunkId));
        } catch (err) {
          this.logger.warn(`Document permissions filter failed: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }

      // Update stats.
      this.stats.averageLatencyMs =
        (this.stats.averageLatencyMs * (this.stats.totalQueries - 1) +
          (Date.now() - startTime)) /
        this.stats.totalQueries;
      this.stats.averageResultsCount =
        (this.stats.averageResultsCount * (this.stats.totalQueries - 1) +
          filtered.length) /
        this.stats.totalQueries;

      // Cache results.
      if (useCache) {
        this.cache.set(cacheKey, {
          results: filtered,
          expiresAt: new Date(Date.now() + this.config.cache.ttlSeconds * 1000),
        });
      }

      this.logger.log(
        `Retrieved ${filtered.length} chunks in ${Date.now() - startTime}ms ` +
          `(hybrid=${useHybrid}, rerank=${query.enableReranking ?? this.config.rerank.enabled})`,
      );

      return filtered;
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Retrieval failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Hybrid retrieval — vector + keyword fused with RRF.
   *
   * Falls back to keyword-only when the vector leg fails (no embeddings,
   * OpenAI down, pgvector missing). Falls back to vector-only when the
   * keyword leg fails (full-text expression error).
   */
  async retrieveHybrid(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const topK = query.topK || this.config.topK;
    const overFetchK = Math.ceil(topK * this.config.hybrid.overFetchFactor);

    // Run both legs in parallel; either may fail gracefully.
    const [vectorResults, keywordResults] = await Promise.allSettled([
      this.runVectorLeg(query, overFetchK),
      this.runKeywordLeg(query, this.config.hybrid.keywordTopK),
    ]);

    const vector =
      vectorResults.status === 'fulfilled' ? vectorResults.value : [];
    const keyword =
      keywordResults.status === 'fulfilled' ? keywordResults.value : [];

    if (vectorResults.status === 'rejected') {
      this.logger.warn(
        `Vector leg failed: ${(vectorResults.reason as Error)?.message}`,
      );
    }
    if (keywordResults.status === 'rejected') {
      this.logger.warn(
        `Keyword leg failed: ${(keywordResults.reason as Error)?.message}`,
      );
    }

    // Fallback paths.
    if (vector.length === 0 && keyword.length === 0) {
      this.logger.warn('Both retrieval legs returned 0 results');
      return [];
    }
    if (vector.length === 0) {
      this.stats.keywordFallbacks++;
      this.logger.log('Falling back to keyword-only retrieval');
      return keyword
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, topK);
    }
    if (keyword.length === 0) {
      // Vector-only — already sorted by similarity.
      return vector.slice(0, topK);
    }

    // Fuse with RRF.
    const merged = this.mergeResults(vector, keyword);
    return merged.slice(0, topK);
  }

  /**
   * Vector-only retrieval — embeds the query, runs pgvector similarity search.
   */
  private async retrieveVectorOnly(
    query: RetrievalQuery,
  ): Promise<RetrievalResult[]> {
    const topK = query.topK || this.config.topK;
    return this.runVectorLeg(query, topK);
  }

  /**
   * Run the vector-search leg. Returns `RetrievalResult[]` with
   * `source='vector'` and `finalScore = similarity`.
   */
  private async runVectorLeg(
    query: RetrievalQuery,
    topK: number,
  ): Promise<RetrievalResult[]> {
    const queryEmbedding = await this.embedQuery(query.query);

    const searchResults = await this.vectorStoreService.search(
      queryEmbedding,
      {
        tenantId: query.tenantId,
        topK,
        filter: query.filters,
        threshold:
          query.similarityThreshold ?? this.config.similarityThreshold,
      },
    );

    return searchResults.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      sourceId: r.sourceId,
      content: r.content,
      similarity: r.similarity,
      rerankScore: undefined,
      finalScore: r.similarity,
      source: 'vector' as const,
      metadata: r.metadata,
    }));
  }

  /**
   * Run the keyword-search leg — PostgreSQL full-text search via
   * `to_tsvector('english', c.content) @@ plainto_tsquery(...)`.
   *
   * `rag_chunks` has no stored `search_vector` column — the tsvector is
   * built inline from `c.content` so the GIN index (if any) on the
   * expression is the only one consulted. Document status is filtered
   * to `'READY'` (uppercase — matches the `RagDocumentStatus` enum
   * values: `READY | PROCESSING | FAILED | DELETED`).
   */
  private async runKeywordLeg(
    query: RetrievalQuery,
    topK: number,
  ): Promise<RetrievalResult[]> {
    const results = await this.prisma.$queryRaw<
      Array<{
        chunk_id: string;
        content: string;
        chunk_index: number;
        metadata: any;
        document_id: string;
        document_title: string;
        source_id: string | null;
        rank: number;
      }>
    >`
      SELECT
        c.id AS chunk_id,
        c.content,
        c.chunk_index,
        c.metadata,
        c.document_id,
        d.title AS document_title,
        d.source_id,
        ts_rank(to_tsvector('english', c.content), plainto_tsquery('pg_catalog.english', ${query.query})) AS rank
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE c.tenant_id = ${query.tenantId}
        AND d.status = 'READY'
        AND to_tsvector('english', c.content) @@ plainto_tsquery('pg_catalog.english', ${query.query})
      ORDER BY rank DESC
      LIMIT ${topK}
    `;

    return results.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      sourceId: r.source_id || '',
      content: r.content,
      similarity: 0,
      keywordScore: Number(r.rank),
      rerankScore: undefined,
      finalScore: Number(r.rank),
      source: 'keyword' as const,
      metadata: {
        chunkIndex: r.chunk_index,
        totalChunks: r.metadata?.totalChunks || 0,
        heading: r.metadata?.heading,
        headingLevel: r.metadata?.headingLevel,
        documentTitle: r.document_title,
        documentType: r.metadata?.documentType || 'document',
        tokenCount: r.metadata?.tokenCount || 0,
        hasCode: r.metadata?.hasCode || false,
        hasTable: r.metadata?.hasTable || false,
        hasList: r.metadata?.hasList || false,
      },
    }));
  }

  /**
   * Fuse vector + keyword results with Reciprocal Rank Fusion.
   *
   * `score(chunk) = sum over each leg L of: 1 / (k + rank_L(chunk))`
   *
   * Where `k` is the RRF constant (default 60 — the standard value from
   * the original paper). A chunk that appears in both legs gets two
   * contributions; a chunk that appears in only one leg still gets a
   * single (smaller) contribution.
   *
   * The result is sorted by fused score (descending).
   */
  mergeResults(
    vector: RetrievalResult[],
    keyword: RetrievalResult[],
  ): RetrievalResult[] {
    const k = this.config.hybrid.rrfConstant;
    const map = new Map<string, RetrievalResult>();

    vector.forEach((r, i) => {
      const existing = map.get(r.chunkId) || r;
      const contribution = 1 / (k + i + 1);
      existing.finalScore = (existing.finalScore || 0) + contribution;
      existing.keywordScore = existing.keywordScore ?? 0;
      // Preserve original similarity for downstream display.
      if (existing.similarity === 0) existing.similarity = r.similarity;
      // Mark as hybrid if the same chunk was returned by both legs.
      existing.source = existing.source === 'keyword' ? 'hybrid' : 'vector';
      map.set(r.chunkId, existing);
    });

    keyword.forEach((r, i) => {
      const existing = map.get(r.chunkId) || r;
      const contribution = 1 / (k + i + 1);
      existing.finalScore = (existing.finalScore || 0) + contribution;
      existing.keywordScore = r.keywordScore;
      if (existing.similarity === 0) existing.similarity = r.similarity;
      existing.source = existing.source === 'vector' ? 'hybrid' : 'keyword';
      map.set(r.chunkId, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Re-rank results.
   *
   * Two modes:
   *  1. **Cheap (default)** — keyword-overlap heuristic. Combines the
   *     query-term match ratio with the existing similarity score. This
   *     is a cheap way to surface chunks that mention the exact query
   *     terms (which pure vector similarity can miss).
   *  2. **LLM-based** (`enableLlmRerank = true`) — asks the LLM to score
   *     each chunk's relevance. OFF by default because it doubles the
   *     LLM cost per retrieval. A production-grade alternative is a
   *     dedicated cross-encoder (e.g. `bge-reranker-large`).
   */
  private async rerank(
    query: string,
    results: RetrievalResult[],
    enableLlmRerank?: boolean,
  ): Promise<RetrievalResult[]> {
    this.logger.debug(`Re-ranking ${results.length} results`);

    if (enableLlmRerank) {
      // LLM rerank — stub. Production would call a cross-encoder here.
      // Returning as-is keeps the contract without the LLM cost.
      this.logger.debug('LLM rerank requested but not yet implemented — returning as-is');
    }

    const reranked = results.map((result) => {
      const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const contentLower = result.content.toLowerCase();
      const keywordMatches = queryTerms.filter((term) =>
        contentLower.includes(term),
      ).length;
      const keywordScore = queryTerms.length > 0 ? keywordMatches / queryTerms.length : 0;

      const rerankScore = 0.3 * keywordScore + 0.7 * result.similarity;

      return {
        ...result,
        rerankScore,
        finalScore: rerankScore,
      };
    });

    return reranked.sort((a, b) => b.finalScore - a.finalScore);
  }

  // ---------------------------------------------------------------------
  // Convenience wrappers
  // ---------------------------------------------------------------------

  /**
   * Generate an embedding for a query string. Wraps
   * {@link EmbeddingsService.generateEmbedding} with a stable placeholder
   * `chunkId` (`'query-temp'`) and `tenantId` (`'system'`) so callers don't
   * have to invent them.
   */
  async embedQuery(query: string): Promise<number[]> {
    const result = await this.embeddingsService.generateEmbedding(
      query,
      'query-temp',
      'system',
    );
    return result.embedding;
  }

  /**
   * Build context for LLM from retrieved chunks.
   */
  async buildContext(
    query: string,
    results: RetrievalResult[],
  ): Promise<LLMContext> {
    this.logger.debug(`Building context from ${results.length} chunks`);

    // Select top chunks within token limit.
    const selectedChunks: string[] = [];
    const metadata: Array<{ source: string; documentTitle: string; chunkIndex: number }> = [];
    let totalTokens = 0;

    for (const result of results) {
      const chunkTokens = this.estimateTokens(result.content);

      if (
        totalTokens + chunkTokens > this.config.context.maxTokens ||
        selectedChunks.length >= this.config.context.maxChunks
      ) {
        break;
      }

      selectedChunks.push(result.content);
      metadata.push({
        source: result.sourceId,
        documentTitle: result.metadata.documentTitle,
        chunkIndex: result.metadata.chunkIndex,
      });
      totalTokens += chunkTokens;
    }

    const formattedContext = this.formatContext(selectedChunks, metadata);

    const context: LLMContext = {
      query,
      chunks: selectedChunks,
      metadata,
      totalTokens,
      formattedContext,
    };

    this.logger.log(
      `Built context: ${selectedChunks.length} chunks, ${totalTokens} tokens`,
    );

    return context;
  }

  /**
   * Complete retrieval pipeline (retrieve + build context).
   */
  async retrieveWithContext(query: RetrievalQuery): Promise<LLMContext> {
    const results = await this.retrieve(query);
    return this.buildContext(query.query, results);
  }

  // ---------------------------------------------------------------------
  // Admin / introspection
  // ---------------------------------------------------------------------

  getStats(): RetrievalStats {
    return { ...this.stats };
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.log('Retrieval cache cleared');
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /**
   * Format context for LLM prompt.
   */
  private formatContext(
    chunks: string[],
    metadata: Array<{ source: string; documentTitle: string; chunkIndex: number }>,
  ): string {
    let context = '';

    chunks.forEach((chunk, index) => {
      const meta = metadata[index];
      context += `---\n`;
      context += `Source: ${meta.documentTitle} (Chunk ${meta.chunkIndex + 1})\n`;
      context += `---\n`;
      context += `${chunk}\n\n`;
    });

    return context.trim();
  }

  /**
   * Cache key — SHA-256 of `{query, tenantId, filters, topK}`.
   *
   * Multi-tenant isolation is enforced at the cache layer: the same query
   * from different tenants produces different cache keys.
   */
  private getCacheKey(query: RetrievalQuery): string {
    const keyData = JSON.stringify({
      query: query.query,
      tenantId: query.tenantId,
      filters: query.filters,
      topK: query.topK,
      enableHybrid: query.enableHybrid ?? this.config.hybrid.enabled,
    });
    return createHash('sha256').update(keyData).digest('hex');
  }

  /**
   * Rough token estimate — 1 token ≈ 4 chars. Accurate enough for
   * context-budget enforcement; the real tokenizer is invoked only by
   * the LLM gateway.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

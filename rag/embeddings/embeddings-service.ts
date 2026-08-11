import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';
import type OpenAI from 'openai';
import { createHash } from 'crypto';
import {
  DEFAULT_EMBEDDING_CONFIG,
  EmbeddingConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingStats,
} from './embeddings-config';

/**
 * Embeddings Service
 * -------------------
 *
 * Thin wrapper around the OpenAI Embeddings API that the
 * {@link IngestionService} uses to vectorise chunks before storing
 * them in pgvector.
 *
 * Key methods:
 *  - {@link embed}      — single-text embedding (used by retrieval for query vectors).
 *  - {@link embedBatch} — batch embedding (used by ingestion for chunks).
 *  - {@link embedQuery} — alias for {@link embed} kept for symmetry with the
 *                         retriever module's calling convention.
 *  - {@link cosineSimilarity} — pure-math helper (no API call); used for
 *                               in-memory reranking + tests.
 *
 * The service keeps the existing `generateEmbedding` / `generateBatchEmbeddings`
 * / `storeEmbeddings` legacy methods intact for backwards compatibility
 * with the `embeddings-pipeline.ts` orchestration that other agents may
 * still be using — but the canonical interface for new code is the
 * `embed` / `embedBatch` pair (matching the FastAPI reference).
 *
 * Implementation notes:
 *  - Uses the shared `OPENAI_CLIENT` (singleton OpenAI SDK instance
 *    provided by `SharedAiModule`) instead of `fetch()` so retries /
 *    timeouts / observability come from the SDK.
 *  - Maintains an in-process LRU-ish cache keyed by SHA-256(text) so
 *    re-ingesting the same content (common during reingestSource) is
 *    free.
 *  - Batches at most `batchSize` (default 100) inputs per OpenAI
 *    request — the API accepts up to 2048 but 100 is a safer default
 *    that avoids per-request token limits for larger chunks.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private config: EmbeddingConfig;
  private stats: EmbeddingStats;
  private cache: Map<string, EmbeddingCacheEntry> = new Map();
  /** Soft cap on cache size — once exceeded, oldest entries are evicted. */
  private static readonly CACHE_MAX_ENTRIES = 5_000;

  constructor(
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    private readonly configService: ConfigService,
  ) {
    this.config = { ...DEFAULT_EMBEDDING_CONFIG };
    // Allow env override of the model + dimensions at construction time.
    const envModel =
      process.env.OPENAI_EMBEDDING_MODEL || this.configService?.get<string>('openai.embeddingModel');
    if (envModel) {
      this.config.model = envModel;
      if (envModel.includes('text-embedding-3-small')) this.config.dimensions = 1536;
      if (envModel.includes('text-embedding-3-large')) this.config.dimensions = 3072;
      if (envModel.includes('ada-002')) this.config.dimensions = 1536;
    }
    this.stats = this.initializeStats();
  }

  // ===================================================================
  // Canonical API (used by IngestionService + RetrieverService)
  // ===================================================================

  /**
   * Generate an embedding for a single text. Returns the raw
   * `number[]` vector — the caller decides whether to persist it
   * (ingestion) or use it for a similarity search (retrieval).
   */
  async embed(text: string): Promise<number[]> {
    if (!text || !text.trim()) {
      // Empty input → zero vector. Avoids an OpenAI API call AND
      // matches the behaviour of `text-embedding-3-*` for empty strings.
      return new Array(this.config.dimensions).fill(0);
    }

    const cacheKey = this.getCacheKey(text);
    if (this.config.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > new Date()) {
        this.stats.cacheHits++;
        return cached.embedding;
      }
    }
    this.stats.cacheMisses++;

    const startTime = Date.now();
    const response = await this.openai.embeddings.create({
      model: this.config.model,
      input: text,
    });
    const latencyMs = Date.now() - startTime;
    const embedding = response.data?.[0]?.embedding ?? [];
    const tokens = response.usage?.total_tokens ?? this.estimateTokens(text);

    if (this.config.enableCache) {
      this.putCacheEntry(cacheKey, text, embedding);
    }

    this.stats.totalEmbeddings++;
    this.stats.totalTokens += tokens;
    this.stats.apiCalls++;
    this.stats.averageLatencyMs =
      (this.stats.averageLatencyMs * (this.stats.totalEmbeddings - 1) + latencyMs) /
      this.stats.totalEmbeddings;

    return embedding;
  }

  /**
   * Generate embeddings for a batch of texts. Calls the OpenAI API in
   * sub-batches of `batchSize` (default 100) and concatenates the
   * results, preserving input order.
   *
   * Used by the {@link IngestionService} during document ingestion —
   * one document's chunks are typically 10-100 texts, so a single
   * sub-batch usually suffices.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = new Array(texts.length);
    const pending: { index: number; text: string }[] = [];

    // Step 1: serve cache hits, collect cache misses for the API call.
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] ?? '';
      if (!text.trim()) {
        results[i] = new Array(this.config.dimensions).fill(0);
        continue;
      }
      const cacheKey = this.getCacheKey(text);
      if (this.config.enableCache) {
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > new Date()) {
          this.stats.cacheHits++;
          results[i] = cached.embedding;
          continue;
        }
      }
      this.stats.cacheMisses++;
      pending.push({ index: i, text });
    }

    // Step 2: call the API in sub-batches.
    const batchSize = this.config.batchSize;
    for (let i = 0; i < pending.length; i += batchSize) {
      const slice = pending.slice(i, i + batchSize);
      const sliceTexts = slice.map((p) => p.text);
      const startTime = Date.now();

      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: sliceTexts,
      });

      const latencyMs = Date.now() - startTime;
      this.stats.apiCalls++;
      this.stats.totalTokens += response.usage?.total_tokens ?? 0;
      this.stats.averageLatencyMs =
        (this.stats.averageLatencyMs * this.stats.totalEmbeddings + latencyMs) /
        (this.stats.totalEmbeddings + 1);

      for (const item of response.data) {
        const original = slice[item.index];
        if (!original) continue;
        results[original.index] = item.embedding;
        this.stats.totalEmbeddings++;
        if (this.config.enableCache) {
          this.putCacheEntry(this.getCacheKey(original.text), original.text, item.embedding);
        }
      }
    }

    return results;
  }

  /**
   * Embed a user query — semantically identical to {@link embed} but
   * kept as a separate method so the retriever module's calling
   * convention matches the FastAPI reference (`embed_query(text)`).
   */
  async embedQuery(query: string): Promise<number[]> {
    return this.embed(query);
  }

  /**
   * Pure-math cosine similarity between two vectors. No API call.
   * Used for in-memory reranking (e.g. deduplicating near-identical
   * retrieved chunks) and for tests.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(
        `cosineSimilarity: vector length mismatch (${a.length} vs ${b.length})`,
      );
    }
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  // ===================================================================
  // Legacy API (kept for backwards compat with embeddings-pipeline.ts)
  // ===================================================================

  /**
   * @deprecated Use {@link embed} instead. Kept for the existing
   * `embeddings-pipeline.ts` orchestration code.
   */
  async generateEmbedding(
    text: string,
    _chunkId: string,
    _tenantId: string,
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const embedding = await this.embed(text);
    const latencyMs = Date.now() - startTime;
    return {
      text,
      embedding,
      model: this.config.model,
      dimensions: this.config.dimensions,
      tokens: this.estimateTokens(text),
      latencyMs,
      cached: false,
    };
  }

  /**
   * @deprecated Use {@link embedBatch} instead. Kept for the existing
   * `embeddings-pipeline.ts` orchestration code.
   */
  async generateBatchEmbeddings(
    chunks: { id: string; content: string; tenantId: string }[],
  ): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const embeddings = await this.embedBatch(chunks.map((c) => c.content));
    const totalTokens = chunks.reduce((sum, c) => sum + this.estimateTokens(c.content), 0);

    return {
      results: chunks.map((c, i) => ({
        text: c.content,
        embedding: embeddings[i],
        model: this.config.model,
        dimensions: this.config.dimensions,
        tokens: this.estimateTokens(c.content),
        latencyMs: Date.now() - startTime,
        cached: false,
      })),
      totalTokens,
      totalLatencyMs: Date.now() - startTime,
      cached: 0,
      apiCalls: this.stats.apiCalls,
    };
  }

  /**
   * @deprecated Persisting embeddings is now the responsibility of the
   * {@link VectorStoreService}. Kept here as a no-op so existing
   * callers don't break — it does nothing because pgvector writes
   * require raw SQL that only the vector store service knows how to
   * issue correctly.
   */
  async storeEmbeddings(
    _embeddings: EmbeddingResult[],
    _chunkIds: string[],
    _tenantId: string,
  ): Promise<void> {
    this.logger.debug('storeEmbeddings() is a no-op — use VectorStoreService.insertChunks()');
  }

  // ===================================================================
  // Cache + stats helpers
  // ===================================================================

  getStats(): EmbeddingStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = this.initializeStats();
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.log('Embedding cache cleared');
  }

  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  private initializeStats(): EmbeddingStats {
    return {
      totalEmbeddings: 0,
      totalTokens: 0,
      totalCost: 0,
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      averageLatencyMs: 0,
      errors: 0,
    };
  }

  private getCacheKey(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  private putCacheEntry(key: string, text: string, embedding: number[]): void {
    if (this.cache.size >= EmbeddingsService.CACHE_MAX_ENTRIES) {
      // Evict the oldest entry (Map iteration order is insertion order).
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      text,
      embedding,
      model: this.config.model,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.cacheTTLSeconds * 1000),
      hash: key,
    });
  }

  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 chars. The chunker uses
    // `gpt-tokenizer` for accurate counts; this is only for stats.
    return Math.ceil(text.length / 4);
  }
}

/**
 * Embedding cache entry — kept inside the service (not exported in the
 * config) so the cache shape is an implementation detail.
 */
export interface EmbeddingCacheEntry {
  text: string;
  embedding: number[];
  model: string;
  createdAt: Date;
  expiresAt: Date;
  hash: string;
}

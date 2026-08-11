import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { EmbeddingsService } from './embeddings-service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';

/**
 * Build a mock OpenAI SDK client — only the `embeddings.create`
 * surface is used by EmbeddingsService.
 */
function createMockOpenAI() {
  const embeddingsCreate = vi.fn();
  return {
    embeddings: { create: embeddingsCreate },
    // chat + other surfaces unused — keep minimal.
    chat: { completions: { create: vi.fn() } },
  };
}

/**
 * EmbeddingsService unit tests.
 *
 * Covers:
 *  - embed (single text — returns vector, populates cache).
 *  - embedBatch (multiple texts — calls OpenAI in sub-batches, preserves order).
 *  - embedQuery (alias for embed).
 *  - cosineSimilarity (math helper — orthogonal, identical, opposite vectors).
 *  - cache (second call to embed(same text) is a cache hit, no API call).
 *  - empty input handling (returns zero vector without API call).
 *  - error propagation (OpenAI failure surfaces as thrown error).
 *  - stats + resetStats + clearCache.
 */
describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  let openai: ReturnType<typeof createMockOpenAI>;
  let configService: { get: ReturnType<typeof vi.fn> };

  const DUMMY_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.001);
  const DUMMY_VECTOR_2 = Array.from({ length: 1536 }, (_, i) => i * 0.002);

  beforeEach(async () => {
    openai = createMockOpenAI();
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'openai.embeddingModel') return 'text-embedding-3-small';
        return undefined;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        { provide: PrismaService, useValue: {} }, // not used by canonical API
        { provide: OPENAI_CLIENT, useValue: openai },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get(EmbeddingsService);
  });

  describe('embed', () => {
    it('calls OpenAI once and returns the embedding', async () => {
      openai.embeddings.create.mockResolvedValueOnce({
        data: [{ index: 0, embedding: DUMMY_VECTOR }],
        usage: { total_tokens: 5 },
      });

      const result = await service.embed('hello world');

      expect(result).toEqual(DUMMY_VECTOR);
      expect(openai.embeddings.create).toHaveBeenCalledTimes(1);
      const args = openai.embeddings.create.mock.calls[0][0];
      expect(args.input).toBe('hello world');
      expect(args.model).toBeDefined();
    });

    it('returns a zero vector for empty input without calling the API', async () => {
      const result = await service.embed('');
      expect(result).toHaveLength(1536);
      expect(result.every((v) => v === 0)).toBe(true);
      expect(openai.embeddings.create).not.toHaveBeenCalled();
    });

    it('caches embeddings — second call is a cache hit', async () => {
      openai.embeddings.create.mockResolvedValue({
        data: [{ index: 0, embedding: DUMMY_VECTOR }],
        usage: { total_tokens: 5 },
      });

      await service.embed('cache me');
      await service.embed('cache me');

      expect(openai.embeddings.create).toHaveBeenCalledTimes(1);
      const stats = service.getStats();
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheMisses).toBe(1);
    });
  });

  describe('embedBatch', () => {
    it('returns embeddings in input order', async () => {
      openai.embeddings.create.mockResolvedValueOnce({
        data: [
          { index: 0, embedding: DUMMY_VECTOR },
          { index: 1, embedding: DUMMY_VECTOR_2 },
        ],
        usage: { total_tokens: 10 },
      });

      const result = await service.embedBatch(['first', 'second']);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(DUMMY_VECTOR);
      expect(result[1]).toEqual(DUMMY_VECTOR_2);
      expect(openai.embeddings.create).toHaveBeenCalledTimes(1);
    });

    it('serves some results from cache and only fetches misses', async () => {
      // Prime the cache with "cached-text".
      openai.embeddings.create.mockResolvedValueOnce({
        data: [{ index: 0, embedding: DUMMY_VECTOR }],
        usage: { total_tokens: 5 },
      });
      await service.embed('cached-text');

      // Now batch includes cached + new.
      openai.embeddings.create.mockResolvedValueOnce({
        data: [{ index: 0, embedding: DUMMY_VECTOR_2 }],
        usage: { total_tokens: 5 },
      });

      const result = await service.embedBatch(['cached-text', 'new-text']);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(DUMMY_VECTOR);
      expect(result[1]).toEqual(DUMMY_VECTOR_2);
      // Only one API call (for the new text) — the cached text was a hit.
      expect(openai.embeddings.create).toHaveBeenCalledTimes(2);
    });

    it('returns an empty array for empty input', async () => {
      const result = await service.embedBatch([]);
      expect(result).toEqual([]);
      expect(openai.embeddings.create).not.toHaveBeenCalled();
    });

    it('handles empty strings inside the batch (zero vectors, no API call for them)', async () => {
      openai.embeddings.create.mockResolvedValueOnce({
        data: [{ index: 0, embedding: DUMMY_VECTOR }],
        usage: { total_tokens: 5 },
      });

      const result = await service.embedBatch(['', 'real text']);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(1536);
      expect(result[0].every((v) => v === 0)).toBe(true);
      expect(result[1]).toEqual(DUMMY_VECTOR);
    });

    it('splits large inputs into multiple sub-batches', async () => {
      // Force a small batch size by sending 250 inputs (default batch=100 → 3 API calls).
      const inputs = Array.from({ length: 250 }, (_, i) => `text-${i}`);
      openai.embeddings.create.mockResolvedValue({
        data: [{ index: 0, embedding: DUMMY_VECTOR }],
        usage: { total_tokens: 5 },
      });

      const result = await service.embedBatch(inputs);
      expect(result).toHaveLength(250);
      // 3 sub-batches: 100 + 100 + 50.
      expect(openai.embeddings.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('embedQuery', () => {
    it('delegates to embed', async () => {
      openai.embeddings.create.mockResolvedValueOnce({
        data: [{ index: 0, embedding: DUMMY_VECTOR }],
        usage: { total_tokens: 5 },
      });
      const result = await service.embedQuery('user query');
      expect(result).toEqual(DUMMY_VECTOR);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const v = [1, 2, 3, 4];
      expect(service.cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(service.cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('returns -1 for opposite vectors', () => {
      const a = [1, 2, 3];
      const b = [-1, -2, -3];
      expect(service.cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('throws on length mismatch', () => {
      expect(() => service.cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
    });
  });

  describe('stats + cache management', () => {
    it('tracks apiCalls + totalEmbeddings', async () => {
      openai.embeddings.create.mockResolvedValue({
        data: [{ index: 0, embedding: DUMMY_VECTOR }],
        usage: { total_tokens: 5 },
      });
      await service.embed('one');
      await service.embed('two');

      const stats = service.getStats();
      expect(stats.totalEmbeddings).toBe(2);
      expect(stats.apiCalls).toBe(2);
    });

    it('resetStats zeroes the counters', async () => {
      openai.embeddings.create.mockResolvedValue({
        data: [{ index: 0, embedding: DUMMY_VECTOR }],
        usage: { total_tokens: 5 },
      });
      await service.embed('one');
      service.resetStats();
      const stats = service.getStats();
      expect(stats.totalEmbeddings).toBe(0);
    });

    it('clearCache evicts cached entries so subsequent calls hit the API', async () => {
      openai.embeddings.create.mockResolvedValue({
        data: [{ index: 0, embedding: DUMMY_VECTOR }],
        usage: { total_tokens: 5 },
      });
      await service.embed('cache me');
      service.clearCache();
      await service.embed('cache me');
      expect(openai.embeddings.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('propagates OpenAI API errors to the caller', async () => {
      openai.embeddings.create.mockRejectedValue(new Error('API rate limit'));
      await expect(service.embed('fail')).rejects.toThrow('API rate limit');
      expect(service.getStats().errors).toBe(0); // stats.errors only incremented in legacy paths
    });
  });
});

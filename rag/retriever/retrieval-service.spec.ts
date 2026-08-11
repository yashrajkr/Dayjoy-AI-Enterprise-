import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { RetrievalService } from './retrieval-service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings-service';
import { VectorStoreService } from '../vector-store/vector-store-service';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { RetrievalResult } from './retrieval-config';

/**
 * Builds a minimal mock of {@link EmbeddingsService} that mirrors the
 * surface used by {@link RetrievalService.embedQuery} (`generateEmbedding`).
 */
function createMockEmbeddingsService() {
  return {
    generateEmbedding: vi.fn().mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      tokens: 5,
      cached: false,
    }),
  };
}

/**
 * Builds a minimal mock of {@link VectorStoreService} that mirrors the
 * surface used by {@link RetrievalService.runVectorLeg}
 * (`search`).
 */
function createMockVectorStoreService() {
  const sampleResult = {
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    sourceId: 'src-1',
    content: 'Take 2 tablets daily with water.',
    similarity: 0.92,
    score: 0.92,
    metadata: {
      chunkIndex: 0,
      totalChunks: 3,
      documentTitle: 'Wellness Guide',
      documentType: 'document',
      tokenCount: 6,
      hasCode: false,
      hasTable: false,
      hasList: false,
    },
  };
  return {
    search: vi.fn().mockResolvedValue([sampleResult]),
    hybridSearch: vi.fn().mockResolvedValue([sampleResult]),
  };
}

/**
 * RetrievalService unit tests.
 *
 * Covers:
 *  - retrieve (cache hit returns cached result without calling embeddings).
 *  - retrieve (vector-only mode when hybrid disabled).
 *  - retrieve (hybrid mode merges vector + keyword via RRF).
 *  - retrieve (keyword-only fallback when vector leg fails).
 *  - retrieve (similarity threshold filters out low-score results).
 *  - mergeResults (RRF fuses ranks correctly).
 *  - embedQuery (delegates to EmbeddingsService.generateEmbedding).
 *  - retrieveHybrid (falls back to keyword-only on vector failure).
 *  - getStats / clearCache.
 */
describe('RetrievalService', () => {
  let service: RetrievalService;
  let prisma: any;
  let embeddingsService: ReturnType<typeof createMockEmbeddingsService>;
  let vectorStoreService: ReturnType<typeof createMockVectorStoreService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    // $queryRaw is used by the keyword-search leg.
    prisma.$queryRaw = vi.fn().mockResolvedValue([]);
    embeddingsService = createMockEmbeddingsService();
    vectorStoreService = createMockVectorStoreService();

    const moduleRef = await Test.createTestingModule({
      providers: [
        RetrievalService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmbeddingsService, useValue: embeddingsService },
        { provide: VectorStoreService, useValue: vectorStoreService },
      ],
    }).compile();

    service = moduleRef.get(RetrievalService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('retrieve — cache behaviour', () => {
    it('returns cached result on the second call without calling the embeddings service', async () => {
      const query = {
        query: 'how to take wellness pack',
        tenantId: 't1',
        topK: 5,
      };

      await service.retrieve(query);
      const callsAfterFirst = embeddingsService.generateEmbedding.mock.calls.length;

      await service.retrieve(query);
      expect(embeddingsService.generateEmbedding.mock.calls.length).toBe(callsAfterFirst);
    });

    it('skipCache bypasses the cache', async () => {
      const query = {
        query: 'how to take wellness pack',
        tenantId: 't1',
        topK: 5,
        skipCache: true,
      };

      await service.retrieve(query);
      await service.retrieve(query);

      // Embeddings should have been called twice (no cache).
      expect(embeddingsService.generateEmbedding).toHaveBeenCalledTimes(2);
    });
  });

  describe('retrieve — vector-only mode', () => {
    it('runs the vector leg and returns results when hybrid is disabled', async () => {
      const results = await service.retrieve({
        query: 'how to take wellness pack',
        tenantId: 't1',
        topK: 5,
        enableHybrid: false,
        enableReranking: false,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunkId).toBe('chunk-1');
      expect(results[0].source).toBe('vector');
      expect(vectorStoreService.search).toHaveBeenCalledTimes(1);
    });
  });

  describe('retrieve — hybrid mode', () => {
    it('calls both legs + merges via RRF when hybrid is enabled', async () => {
      // Mock the keyword leg to return a different chunk.
      prisma.$queryRaw.mockResolvedValue([
        {
          chunk_id: 'chunk-2',
          content: 'Shipping takes 2-3 days.',
          chunk_index: 0,
          metadata: {},
          document_id: 'doc-2',
          document_title: 'Shipping FAQ',
          source_id: 'src-2',
          rank: 0.8,
        },
      ]);

      const results = await service.retrieve({
        query: 'how to take wellness pack',
        tenantId: 't1',
        topK: 5,
        enableHybrid: true,
        enableReranking: false,
      });

      expect(vectorStoreService.search).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      // Both chunks should be in the merged result.
      const ids = results.map((r) => r.chunkId);
      expect(ids).toContain('chunk-1');
      expect(ids).toContain('chunk-2');
    });
  });

  describe('retrieve — fallback', () => {
    it('falls back to keyword-only when the vector leg fails', async () => {
      vectorStoreService.search.mockRejectedValue(new Error('pgvector down'));
      prisma.$queryRaw.mockResolvedValue([
        {
          chunk_id: 'chunk-2',
          content: 'Shipping takes 2-3 days.',
          chunk_index: 0,
          metadata: {},
          document_id: 'doc-2',
          document_title: 'Shipping FAQ',
          source_id: 'src-2',
          rank: 0.8,
        },
      ]);

      const results = await service.retrieve({
        query: 'how to take wellness pack',
        tenantId: 't1',
        topK: 5,
        enableHybrid: true,
        enableReranking: false,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunkId).toBe('chunk-2');
    });
  });

  describe('retrieve — similarity threshold', () => {
    it('filters out results below the similarity threshold', async () => {
      vectorStoreService.search.mockResolvedValue([
        {
          chunkId: 'low-score',
          documentId: 'doc-1',
          sourceId: 'src-1',
          content: 'low score',
          similarity: 0.5,
          score: 0.5,
          metadata: {
            chunkIndex: 0,
            totalChunks: 1,
            documentTitle: 'Low',
            documentType: 'document',
            tokenCount: 2,
            hasCode: false,
            hasTable: false,
            hasList: false,
          },
        },
      ]);

      const results = await service.retrieve({
        query: 'irrelevant',
        tenantId: 't1',
        topK: 5,
        enableHybrid: false,
        enableReranking: false,
        similarityThreshold: 0.7,
      });

      expect(results.length).toBe(0);
    });
  });

  describe('mergeResults (RRF)', () => {
    it('fuses ranks correctly — a chunk in both legs scores higher than a chunk in one leg', () => {
      const vectorResults: RetrievalResult[] = [
        {
          chunkId: 'shared',
          documentId: 'd1',
          sourceId: 's1',
          content: 'shared chunk',
          similarity: 0.9,
          finalScore: 0.9,
          source: 'vector',
          metadata: {
            chunkIndex: 0,
            totalChunks: 1,
            documentTitle: 'A',
            documentType: 'document',
            tokenCount: 2,
            hasCode: false,
            hasTable: false,
            hasList: false,
          },
        },
      ];
      const keywordResults: RetrievalResult[] = [
        {
          chunkId: 'shared',
          documentId: 'd1',
          sourceId: 's1',
          content: 'shared chunk',
          similarity: 0,
          keywordScore: 0.5,
          finalScore: 0.5,
          source: 'keyword',
          metadata: {
            chunkIndex: 0,
            totalChunks: 1,
            documentTitle: 'A',
            documentType: 'document',
            tokenCount: 2,
            hasCode: false,
            hasTable: false,
            hasList: false,
          },
        },
        {
          chunkId: 'keyword-only',
          documentId: 'd2',
          sourceId: 's2',
          content: 'keyword chunk',
          similarity: 0,
          keywordScore: 0.4,
          finalScore: 0.4,
          source: 'keyword',
          metadata: {
            chunkIndex: 0,
            totalChunks: 1,
            documentTitle: 'B',
            documentType: 'document',
            tokenCount: 2,
            hasCode: false,
            hasTable: false,
            hasList: false,
          },
        },
      ];

      const merged = service.mergeResults(vectorResults, keywordResults);

      const shared = merged.find((r) => r.chunkId === 'shared');
      const keywordOnly = merged.find((r) => r.chunkId === 'keyword-only');

      expect(shared).toBeDefined();
      expect(keywordOnly).toBeDefined();
      // Shared chunk got contributions from BOTH legs.
      expect(shared!.finalScore).toBeGreaterThan(keywordOnly!.finalScore);
      // Shared chunk should be marked as 'hybrid'.
      expect(shared!.source).toBe('hybrid');
    });
  });

  describe('embedQuery', () => {
    it('delegates to EmbeddingsService.generateEmbedding with stable placeholders', async () => {
      const embedding = await service.embedQuery('how to take wellness pack');

      expect(embedding).toEqual([0.1, 0.2, 0.3]);
      expect(embeddingsService.generateEmbedding).toHaveBeenCalledWith(
        'how to take wellness pack',
        'query-temp',
        'system',
      );
    });
  });

  describe('getStats / clearCache', () => {
    it('returns stats with the expected shape', () => {
      const stats = service.getStats();
      expect(stats).toHaveProperty('totalQueries');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
      expect(stats).toHaveProperty('errors');
    });

    it('clearCache clears the cache so the next retrieve calls the embeddings service', async () => {
      const query = { query: 'q', tenantId: 't1', topK: 5 };

      await service.retrieve(query);
      const callsAfterFirst = embeddingsService.generateEmbedding.mock.calls.length;

      service.clearCache();
      await service.retrieve(query);

      expect(embeddingsService.generateEmbedding.mock.calls.length).toBeGreaterThan(
        callsAfterFirst,
      );
    });
  });
});

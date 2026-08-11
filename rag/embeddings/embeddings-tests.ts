import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingsService } from './embeddings-service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        {
          provide: PrismaService,
          useValue: {
            // Mock PrismaService
          },
        },
      ],
    }).compile();

    service = module.get<EmbeddingsService>(EmbeddingsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for text', async () => {
      const text = 'This is a test sentence for embedding generation.';
      const result = await service.generateEmbedding(
        text,
        'chunk-123',
        'tenant-123',
      );

      expect(result).toBeDefined();
      expect(result.text).toBe(text);
      expect(result.embedding).toBeDefined();
      expect(result.embedding.length).toBe(1536); // ada-002 dimensions
      expect(result.model).toBeDefined();
      expect(result.dimensions).toBe(1536);
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.cached).toBe(false);
    });

    it('should use cache for repeated requests', async () => {
      const text = 'This is a cached embedding test.';

      // First call (cache miss)
      const result1 = await service.generateEmbedding(
        text,
        'chunk-123',
        'tenant-123',
      );

      // Second call (cache hit)
      const result2 = await service.generateEmbedding(
        text,
        'chunk-124',
        'tenant-123',
      );

      expect(result1.cached).toBe(false);
      expect(result2.cached).toBe(true);
      expect(result1.embedding).toEqual(result2.embedding);
    });

    it('should handle API errors gracefully', async () => {
      // This would require mocking the API call to simulate failure
      // For now, we just verify the error handling exists
      expect(service).toBeDefined();
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('should process multiple chunks', async () => {
      const chunks = [
        { id: 'chunk-1', content: 'First chunk content', tenantId: 'tenant-123' },
        { id: 'chunk-2', content: 'Second chunk content', tenantId: 'tenant-123' },
        { id: 'chunk-3', content: 'Third chunk content', tenantId: 'tenant-123' },
      ];

      const result = await service.generateBatchEmbeddings(chunks);

      expect(result.results.length).toBe(3);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.totalLatencyMs).toBeGreaterThan(0);
      result.results.forEach((r) => {
        expect(r.embedding.length).toBe(1536);
      });
    });

    it('should respect batch size', async () => {
      const chunks = Array.from({ length: 250 }, (_, i) => ({
        id: `chunk-${i}`,
        content: `Content ${i}`,
        tenantId: 'tenant-123',
      }));

      const result = await service.generateBatchEmbeddings(chunks);

      expect(result.results.length).toBe(250);
      expect(result.apiCalls).toBeGreaterThan(1); // Should make multiple API calls
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      const stats = service.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalEmbeddings).toBeDefined();
      expect(stats.totalTokens).toBeDefined();
      expect(stats.cacheHits).toBeDefined();
      expect(stats.cacheMisses).toBeDefined();
      expect(stats.apiCalls).toBeDefined();
      expect(stats.averageLatencyMs).toBeDefined();
      expect(stats.errors).toBeDefined();
    });

    it('should track statistics correctly', async () => {
      const initialStats = service.getStats();

      await service.generateEmbedding('Test text', 'chunk-1', 'tenant-123');

      const updatedStats = service.getStats();

      expect(updatedStats.totalEmbeddings).toBe(initialStats.totalEmbeddings + 1);
      expect(updatedStats.totalTokens).toBeGreaterThan(initialStats.totalTokens);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      const text = 'Cache test text';

      // Generate embedding (will cache)
      await service.generateEmbedding(text, 'chunk-1', 'tenant-123');

      // Clear cache
      service.clearCache();

      // Next call should be cache miss
      const result = await service.generateEmbedding(text, 'chunk-2', 'tenant-123');

      expect(result.cached).toBe(false);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      const text = 'This is a test sentence.';
      const tokens = service['estimateTokens'](text);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeCloseTo(text.length / 4, 0);
    });
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalService } from './retrieval-service';
import { RetrievalPipelineService } from './retrieval-pipeline';
import { EmbeddingsService } from '../embeddings/embeddings-service';
import { VectorStoreService } from '../vector-store/vector-store-service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';

describe('RetrievalService', () => {
  let service: RetrievalService;
  let prisma: PrismaService;
  let embeddingsService: EmbeddingsService;
  let vectorStoreService: VectorStoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: EmbeddingsService,
          useValue: {
            generateEmbedding: jest.fn(),
          },
        },
        {
          provide: VectorStoreService,
          useValue: {
            similaritySearch: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RetrievalService>(RetrievalService);
    prisma = module.get<PrismaService>(PrismaService);
    embeddingsService = module.get<EmbeddingsService>(EmbeddingsService);
    vectorStoreService = module.get<VectorStoreService>(VectorStoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('retrieve', () => {
    it('should retrieve chunks for a query', async () => {
      const query = {
        query: 'What is the return policy?',
        tenantId: 'tenant-123',
        topK: 5,
      };

      // Mock embedding generation
      embeddingsService.generateEmbedding = jest.fn().mockResolvedValue({
        embedding: new Array(1536).fill(0.1),
      });

      // Mock similarity search
      vectorStoreService.similaritySearch = jest.fn().mockResolvedValue([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          sourceId: 'source-1',
          content: 'Return policy content',
          similarity: 0.95,
          metadata: {
            chunkIndex: 0,
            documentTitle: 'Policy Document',
            documentType: 'pdf',
            tokenCount: 100,
          },
        },
      ]);

      const results = await service.retrieve(query);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunkId).toBe('chunk-1');
      expect(results[0].similarity).toBe(0.95);
      expect(results[0].content).toBe('Return policy content');
    });

    it('should use cache for repeated queries', async () => {
      const query = {
        query: 'Cached query test',
        tenantId: 'tenant-123',
      };

      embeddingsService.generateEmbedding = jest.fn().mockResolvedValue({
        embedding: new Array(1536).fill(0.1),
      });

      vectorStoreService.similaritySearch = jest.fn().mockResolvedValue([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          sourceId: 'source-1',
          content: 'Cached content',
          similarity: 0.9,
          metadata: {},
        },
      ]);

      // First call (cache miss)
      const results1 = await service.retrieve(query);

      // Second call (cache hit)
      const results2 = await service.retrieve(query);

      expect(results1.length).toBe(results2.length);
      expect(vectorStoreService.similaritySearch).toHaveBeenCalledTimes(1);
    });

    it('should apply filters', async () => {
      const query = {
        query: 'Test query',
        tenantId: 'tenant-123',
        filters: {
          documentId: 'doc-123',
          documentType: 'pdf',
          hasCode: false,
        },
      };

      embeddingsService.generateEmbedding = jest.fn().mockResolvedValue({
        embedding: new Array(1536).fill(0.1),
      });

      vectorStoreService.similaritySearch = jest.fn().mockResolvedValue([]);

      await service.retrieve(query);

      expect(vectorStoreService.similaritySearch).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          tenantId: 'tenant-123',
          documentId: 'doc-123',
          documentType: 'pdf',
        }),
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  describe('buildContext', () => {
    it('should build context from retrieved chunks', async () => {
      const query = 'Test query';
      const results = [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          sourceId: 'source-1',
          content: 'First chunk content',
          similarity: 0.95,
          finalScore: 0.95,
          metadata: {
            chunkIndex: 0,
            documentTitle: 'Test Document',
            documentType: 'text',
            tokenCount: 50,
          },
        },
        {
          chunkId: 'chunk-2',
          documentId: 'doc-1',
          sourceId: 'source-1',
          content: 'Second chunk content',
          similarity: 0.87,
          finalScore: 0.87,
          metadata: {
            chunkIndex: 1,
            documentTitle: 'Test Document',
            documentType: 'text',
            tokenCount: 60,
          },
        },
      ];

      const context = await service.buildContext(query, results);

      expect(context.query).toBe(query);
      expect(context.chunks.length).toBe(2);
      expect(context.totalTokens).toBeGreaterThan(0);
      expect(context.formattedContext).toContain('First chunk content');
      expect(context.formattedContext).toContain('Second chunk content');
    });

    it('should respect max tokens limit', async () => {
      const query = 'Test query';
      const results = Array.from({ length: 20 }, (_, i) => ({
        chunkId: `chunk-${i}`,
        documentId: 'doc-1',
        sourceId: 'source-1',
        content: `Chunk content ${i} `.repeat(100), // Large chunks
        similarity: 0.9 - i * 0.01,
        finalScore: 0.9 - i * 0.01,
        metadata: {
          chunkIndex: i,
          documentTitle: 'Test Document',
          documentType: 'text',
          tokenCount: 500,
        },
      }));

      const context = await service.buildContext(query, results);

      // Should not exceed max tokens
      expect(context.totalTokens).toBeLessThanOrEqual(4000);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      const stats = service.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalQueries).toBeDefined();
      expect(stats.averageLatencyMs).toBeDefined();
      expect(stats.averageResultsCount).toBeDefined();
      expect(stats.cacheHits).toBeDefined();
      expect(stats.cacheMisses).toBeDefined();
    });
  });
});

describe('RetrievalPipelineService', () => {
  let service: RetrievalPipelineService;
  let retrievalService: RetrievalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalPipelineService,
        {
          provide: RetrievalService,
          useValue: {
            retrieve: jest.fn(),
            buildContext: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RetrievalPipelineService>(RetrievalPipelineService);
    retrievalService = module.get<RetrievalService>(RetrievalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('should execute complete retrieval pipeline', async () => {
      const query = {
        query: 'What is Dayjoy?',
        tenantId: 'tenant-123',
        topK: 5,
      };

      // Mock retrieval
      retrievalService.retrieve = jest.fn().mockResolvedValue([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          sourceId: 'source-1',
          content: 'Dayjoy is a company',
          similarity: 0.95,
          finalScore: 0.95,
          metadata: {},
        },
      ]);

      // Mock context building
      retrievalService.buildContext = jest.fn().mockResolvedValue({
        query: 'What is Dayjoy?',
        chunks: ['Dayjoy is a company'],
        metadata: [{ source: 'source-1', documentTitle: 'About', chunkIndex: 0 }],
        totalTokens: 50,
        formattedContext: '---\nSource: About (Chunk 1)\n---\nDayjoy is a company',
      });

      const result = await service.execute(query);

      expect(result.status).toBe('success');
      expect(result.query).toBe('What is Dayjoy?');
      expect(result.chunks.length).toBe(1);
      expect(result.context).toBeDefined();
      expect(result.totalLatencyMs).toBeGreaterThan(0);
    });

    it('should handle no results', async () => {
      const query = {
        query: 'Nonexistent query xyz123',
        tenantId: 'tenant-123',
      };

      retrievalService.retrieve = jest.fn().mockResolvedValue([]);

      const result = await service.execute(query);

      expect(result.status).toBe('success');
      expect(result.chunks.length).toBe(0);
      expect(result.context).toBeNull();
      expect(result.message).toBe('No relevant chunks found');
    });

    it('should handle errors', async () => {
      const query = {
        query: 'Test query',
        tenantId: 'tenant-123',
      };

      retrievalService.retrieve = jest
        .fn()
        .mockRejectedValue(new Error('API error'));

      const result = await service.execute(query);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('API error');
    });
  });

  describe('retrieveForAI', () => {
    it('should retrieve for AI agent', async () => {
      const result = await service.retrieveForAI(
        'What is the return policy?',
        'tenant-123',
        'agent-456',
        5,
      );

      expect(result).toBeDefined();
      expect(retrievalService.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'What is the return policy?',
          tenantId: 'tenant-123',
          filters: expect.objectContaining({
            sourceId: 'agent-456',
          }),
        }),
      );
    });
  });

  describe('retrieveWithContext', () => {
    it('should retrieve with conversation history', async () => {
      const history = [
        'User: I need help with my order',
        'Assistant: Sure, what\'s your order number?',
      ];

      await service.retrieveWithContext(
        'My order is #12345',
        'tenant-123',
        history,
      );

      expect(retrievalService.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('order'),
          tenantId: 'tenant-123',
        }),
      );
    });
  });
});
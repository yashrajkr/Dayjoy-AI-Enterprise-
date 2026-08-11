import { Test, TestingModule } from '@nestjs/testing';
import { VectorStoreService } from './vector-store-service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';

describe('VectorStoreService', () => {
  let service: VectorStoreService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VectorStoreService,
        {
          provide: PrismaService,
          useValue: {
            ragChunk: {
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VectorStoreService>(VectorStoreService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('insert', () => {
    it('should insert a single embedding', async () => {
      const chunkId = 'chunk-123';
      const embedding = new Array(1536).fill(0.1);
      const tenantId = 'tenant-123';
      const documentId = 'doc-123';

      await service.insert(chunkId, embedding, tenantId, documentId);

      expect(prisma.ragChunk.update).toHaveBeenCalledWith({
        where: { id: chunkId },
        data: {
          embedding,
          updated_at: expect.any(Date),
        },
      });
    });
  });

  describe('insertBatch', () => {
    it('should insert multiple embeddings', async () => {
      const embeddings = [
        {
          chunkId: 'chunk-1',
          embedding: new Array(1536).fill(0.1),
          tenantId: 'tenant-123',
          documentId: 'doc-123',
        },
        {
          chunkId: 'chunk-2',
          embedding: new Array(1536).fill(0.2),
          tenantId: 'tenant-123',
          documentId: 'doc-123',
        },
        {
          chunkId: 'chunk-3',
          embedding: new Array(1536).fill(0.3),
          tenantId: 'tenant-123',
          documentId: 'doc-123',
        },
      ];

      await service.insertBatch(embeddings);

      expect(prisma.ragChunk.update).toHaveBeenCalledTimes(3);
      expect(prisma.ragChunk.update).toHaveBeenCalledWith({
        where: { id: 'chunk-1' },
        data: expect.objectContaining({
          embedding: expect.any(Array),
        }),
      });
    });
  });

  describe('update', () => {
    it('should update an existing embedding', async () => {
      const chunkId = 'chunk-123';
      const embedding = new Array(1536).fill(0.5);
      const tenantId = 'tenant-123';

      await service.update(chunkId, embedding, tenantId);

      expect(prisma.ragChunk.update).toHaveBeenCalledWith({
        where: { id: chunkId },
        data: {
          embedding,
          updated_at: expect.any(Date),
        },
      });
    });
  });

  describe('delete', () => {
    it('should delete a single embedding', async () => {
      const chunkId = 'chunk-123';
      const tenantId = 'tenant-123';

      await service.delete(chunkId, tenantId);

      expect(prisma.ragChunk.update).toHaveBeenCalledWith({
        where: { id: chunkId },
        data: {
          embedding: null,
          updated_at: expect.any(Date),
        },
      });
    });
  });

  describe('deleteDocument', () => {
    it('should delete all embeddings for a document', async () => {
      const documentId = 'doc-123';
      const tenantId = 'tenant-123';

      await service.deleteDocument(documentId, tenantId);

      expect(prisma.ragChunk.updateMany).toHaveBeenCalledWith({
        where: {
          document_id: documentId,
          tenant_id: tenantId,
        },
        data: {
          embedding: null,
        },
      });
    });
  });

  describe('similaritySearch', () => {
    it('should perform vector similarity search', async () => {
      const queryEmbedding = new Array(1536).fill(0.1);
      const filters = { tenantId: 'tenant-123' };

      const mockResults = [
        {
          id: 'chunk-1',
          document_id: 'doc-1',
          chunk_index: 0,
          content: 'Test content 1',
          similarity: 0.95,
          metadata: { hasCode: false },
          token_count: 100,
          document_title: 'Test Document',
          document_type: 'text',
          source_id: 'source-1',
        },
        {
          id: 'chunk-2',
          document_id: 'doc-1',
          chunk_index: 1,
          content: 'Test content 2',
          similarity: 0.87,
          metadata: { hasCode: false },
          token_count: 120,
          document_title: 'Test Document',
          document_type: 'text',
          source_id: 'source-1',
        },
      ];

      prisma.$queryRaw = jest.fn().mockResolvedValue(mockResults);

      const results = await service.similaritySearch(
        queryEmbedding,
        filters,
        5,
        0.7,
      );

      expect(results.length).toBe(2);
      expect(results[0].chunkId).toBe('chunk-1');
      expect(results[0].similarity).toBe(0.95);
      expect(results[0].content).toBe('Test content 1');
      expect(results[0].metadata.documentTitle).toBe('Test Document');
    });

    it('should filter by similarity threshold', async () => {
      const queryEmbedding = new Array(1536).fill(0.1);
      const filters = { tenantId: 'tenant-123' };

      const mockResults = [
        {
          id: 'chunk-1',
          document_id: 'doc-1',
          chunk_index: 0,
          content: 'High similarity',
          similarity: 0.95,
          metadata: {},
          token_count: 100,
          document_title: 'Test',
          document_type: 'text',
          source_id: 'source-1',
        },
        {
          id: 'chunk-2',
          document_id: 'doc-1',
          chunk_index: 1,
          content: 'Low similarity',
          similarity: 0.5,
          metadata: {},
          token_count: 100,
          document_title: 'Test',
          document_type: 'text',
          source_id: 'source-1',
        },
      ];

      prisma.$queryRaw = jest.fn().mockResolvedValue(mockResults);

      const results = await service.similaritySearch(
        queryEmbedding,
        filters,
        5,
        0.7,  // Threshold
      );

      // Should filter out low similarity result
      expect(results.length).toBe(1);
      expect(results[0].similarity).toBe(0.95);
    });

    it('should apply document filters', async () => {
      const queryEmbedding = new Array(1536).fill(0.1);
      const filters = {
        tenantId: 'tenant-123',
        documentId: 'doc-123',
        documentType: 'pdf',
      };

      prisma.$queryRaw = jest.fn().mockResolvedValue([]);

      await service.similaritySearch(queryEmbedding, filters);

      // Verify query was called with filters
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('hybridSearch', () => {
    it('should perform hybrid search (BM25 + vector)', async () => {
      const query = 'test query';
      const queryEmbedding = new Array(1536).fill(0.1);
      const filters = { tenantId: 'tenant-123' };

      const mockResults = [
        {
          id: 'chunk-1',
          document_id: 'doc-1',
          chunk_index: 0,
          content: 'Best match',
          similarity: 0.90,
          bm25_score: 0.85,
          hybrid_score: 0.885,
          metadata: {},
          token_count: 100,
          document_title: 'Test Document',
          document_type: 'text',
          source_id: 'source-1',
        },
      ];

      prisma.$queryRaw = jest.fn().mockResolvedValue(mockResults);

      const results = await service.hybridSearch(
        query,
        queryEmbedding,
        filters,
        5,
      );

      expect(results.length).toBe(1);
      expect(results[0].score).toBe(0.885);  // Hybrid score
      expect(results[0].similarity).toBe(0.90);
    });
  });

  describe('getIndexStats', () => {
    it('should return index statistics', async () => {
      const tenantId = 'tenant-123';

      const mockStats = [
        {
          total_vectors: 1500,
          index_size: '15 MB',
          avg_search_time_ms: 0.5,
        },
      ];

      prisma.$queryRaw = jest.fn().mockResolvedValue(mockStats);

      const stats = await service.getIndexStats(tenantId);

      expect(stats.totalVectors).toBe(1500);
      expect(stats.indexSize).toBe('15 MB');
      expect(stats.avgSearchTimeMs).toBe(0.5);
      expect(stats.indexType).toBe('hnsw');
      expect(stats.dimensions).toBe(1536);
    });
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingPipelineService } from './embeddings-pipeline';
import { EmbeddingsService } from './embeddings-service';
import { ChunkingService } from '../ingestion/chunking-service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';

describe('EmbeddingPipelineService', () => {
  let service: EmbeddingPipelineService;
  let embeddingsService: EmbeddingsService;
  let chunkingService: ChunkingService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingPipelineService,
        {
          provide: EmbeddingsService,
          useValue: {
            generateEmbedding: jest.fn(),
            generateBatchEmbeddings: jest.fn(),
            storeEmbeddings: jest.fn(),
            getStats: jest.fn(),
          },
        },
        {
          provide: ChunkingService,
          useValue: {
            chunkDocument: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            ragDocument: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            ragChunk: {
              createMany: jest.fn(),
              findMany: jest.fn(),
              updateMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<EmbeddingPipelineService>(EmbeddingPipelineService);
    embeddingsService = module.get<EmbeddingsService>(EmbeddingsService);
    chunkingService = module.get<ChunkingService>(ChunkingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processDocument', () => {
    it('should process a document through the complete pipeline', async () => {
      const documentId = 'doc-123';
      const tenantId = 'tenant-123';

      // Mock document
      const mockDocument = {
        id: documentId,
        tenant_id: tenantId,
        source_id: 'source-123',
        title: 'Test Document',
        content: 'Test content '.repeat(100),
        status: 'processed',
        metadata: { type: 'text' },
        source: { id: 'source-123' },
      };

      prisma.ragDocument.findUnique = jest.fn().mockResolvedValue(mockDocument);

      // Mock chunks
      const mockChunks = [
        {
          documentId,
          tenantId,
          chunkIndex: 0,
          totalChunks: 2,
          content: 'Chunk 1 content',
          metadata: { tokenCount: 50 },
          id: 'chunk-1',
        },
        {
          documentId,
          tenantId,
          chunkIndex: 1,
          totalChunks: 2,
          content: 'Chunk 2 content',
          metadata: { tokenCount: 50 },
          id: 'chunk-2',
        },
      ];

      chunkingService.chunkDocument = jest.fn().mockResolvedValue(mockChunks);
      prisma.ragChunk.createMany = jest.fn().mockResolvedValue({ count: 2 });
      prisma.ragChunk.findMany = jest.fn().mockResolvedValue(mockChunks);

      // Mock embeddings
      embeddingsService.generateBatchEmbeddings = jest.fn().mockResolvedValue({
        results: [
          { embedding: new Array(1536).fill(0.1), tokens: 50 },
          { embedding: new Array(1536).fill(0.2), tokens: 50 },
        ],
        totalTokens: 100,
        totalLatencyMs: 500,
        cached: 0,
        apiCalls: 1,
      });

      embeddingsService.storeEmbeddings = jest.fn().mockResolvedValue(undefined);

      const result = await service.processDocument(documentId, tenantId);

      expect(result.status).toBe('success');
      expect(result.chunksCreated).toBe(2);
      expect(result.embeddingsGenerated).toBe(2);
      expect(result.totalTokens).toBe(100);
      expect(result.totalLatencyMs).toBeGreaterThan(0);

      // Verify document status update
      expect(prisma.ragDocument.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: expect.objectContaining({
          status: 'embedded',
          metadata: expect.objectContaining({
            chunkCount: 2,
            totalTokens: 100,
          }),
        }),
      });
    });

    it('should handle document not found', async () => {
      prisma.ragDocument.findUnique = jest.fn().mockResolvedValue(null);

      const result = await service.processDocument('non-existent', 'tenant-123');

      expect(result.status).toBe('failed');
      expect(result.error).toContain('not found');
    });

    it('should handle errors and update document status', async () => {
      const documentId = 'doc-123';
      const tenantId = 'tenant-123';

      const mockDocument = {
        id: documentId,
        tenant_id: tenantId,
        source_id: 'source-123',
        title: 'Test Document',
        content: 'Test content',
        status: 'processed',
        metadata: { type: 'text' },
        source: { id: 'source-123' },
      };

      prisma.ragDocument.findUnique = jest.fn().mockResolvedValue(mockDocument);

      // Simulate error
      chunkingService.chunkDocument = jest
        .fn()
        .mockRejectedValue(new Error('Chunking failed'));

      const result = await service.processDocument(documentId, tenantId);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Chunking failed');

      // Verify document status update to failed
      expect(prisma.ragDocument.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: expect.objectContaining({
          status: 'failed',
          metadata: expect.objectContaining({
            error: 'Chunking failed',
          }),
        }),
      });
    });
  });

  describe('processBatchDocuments', () => {
    it('should process multiple documents', async () => {
      const documentIds = ['doc-1', 'doc-2', 'doc-3'];
      const tenantId = 'tenant-123';

      // Mock successful processing for all
      service.processDocument = jest.fn().mockResolvedValue({
        documentId: 'doc-1',
        status: 'success',
        chunksCreated: 2,
        embeddingsGenerated: 2,
        totalTokens: 100,
        totalLatencyMs: 500,
        cached: 0,
        apiCalls: 1,
      });

      const result = await service.processBatchDocuments(documentIds, tenantId);

      expect(result.totalDocuments).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results.length).toBe(3);
    });

    it('should handle mixed success and failures', async () => {
      const documentIds = ['doc-1', 'doc-2', 'doc-3'];
      const tenantId = 'tenant-123';

      service.processDocument = jest
        .fn()
        .mockResolvedValueOnce({
          documentId: 'doc-1',
          status: 'success',
          chunksCreated: 2,
          embeddingsGenerated: 2,
          totalTokens: 100,
          totalLatencyMs: 500,
          cached: 0,
          apiCalls: 1,
        })
        .mockResolvedValueOnce({
          documentId: 'doc-2',
          status: 'failed',
          error: 'API error',
          chunksCreated: 0,
          embeddingsGenerated: 0,
          totalTokens: 0,
          totalLatencyMs: 50,
          cached: 0,
          apiCalls: 0,
        })
        .mockResolvedValueOnce({
          documentId: 'doc-3',
          status: 'success',
          chunksCreated: 3,
          embeddingsGenerated: 3,
          totalTokens: 150,
          totalLatencyMs: 600,
          cached: 0,
          apiCalls: 1,
        });

      const result = await service.processBatchDocuments(documentIds, tenantId);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  describe('regenerateEmbeddings', () => {
    it('should delete existing embeddings and re-process', async () => {
      const documentId = 'doc-123';
      const tenantId = 'tenant-123';

      service.processDocument = jest.fn().mockResolvedValue({
        documentId,
        status: 'success',
        chunksCreated: 2,
        embeddingsGenerated: 2,
        totalTokens: 100,
        totalLatencyMs: 500,
        cached: 0,
        apiCalls: 1,
      });

      await service.regenerateEmbeddings(documentId, tenantId);

      // Verify embeddings were deleted
      expect(prisma.ragChunk.updateMany).toHaveBeenCalledWith({
        where: {
          document_id: documentId,
          tenant_id: tenantId,
        },
        data: {
          embedding: null,
        },
      });

      // Verify document was re-processed
      expect(service.processDocument).toHaveBeenCalledWith(documentId, tenantId);
    });
  });
});
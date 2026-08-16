import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { IngestionService } from './ingestion-service';
import { ChunkingService } from './chunking-service';
import { EmbeddingsService } from '../embeddings/embeddings-service';
import { VectorStoreService } from '../vector-store/vector-store-service';
import { DocumentLoaderFactory } from '../loaders/loader.factory';
import { PdfLoader } from '../loaders/pdf.loader';
import { DocxLoader } from '../loaders/docx.loader';
import { MarkdownLoader } from '../loaders/markdown.loader';
import { TextLoader } from '../loaders/text.loader';
import { CsvLoader } from '../loaders/csv.loader';
import { HtmlLoader } from '../loaders/html.loader';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import type { AuthUser } from '../../backend/ai/auth-user';
import type { IngestDocumentDto } from './ingestion.dto';

/**
 * Build a mock DocumentLoaderFactory + leaf loaders so we can stub
 * the load() call without hitting real file parsing.
 */
function createMockLoaders() {
  const pdfLoader = { load: vi.fn() };
  const docxLoader = { load: vi.fn() };
  const markdownLoader = { load: vi.fn() };
  const textLoader = { load: vi.fn() };
  const csvLoader = { load: vi.fn() };
  const htmlLoader = { load: vi.fn() };
  const factory = {
    getLoader: vi.fn().mockReturnValue(textLoader),
    getLoaderByExtension: vi.fn().mockReturnValue(textLoader),
    getLoaderFor: vi.fn().mockReturnValue(textLoader),
  };
  return {
    factory,
    pdfLoader,
    docxLoader,
    markdownLoader,
    textLoader,
    csvLoader,
    htmlLoader,
  };
}

/**
 * IngestionService unit tests.
 *
 * Covers:
 *  - ingestDocument (inline content path — full pipeline: source → doc → chunk → embed → store).
 *  - ingestDocument (file upload path — uses loader factory).
 *  - ingestBatch (parallel processing, partial failure isolation).
 *  - reingestSource (delete + re-ingest stored content).
 *  - deleteDocument (soft-delete + cascade chunk delete).
 *  - Error handling (missing content/buffer, missing source).
 */
describe('IngestionService', () => {
  let service: IngestionService;
  let prisma: any;
  let chunkingService: { chunk: ReturnType<typeof vi.fn> };
  let embeddingsService: { embedBatch: ReturnType<typeof vi.fn>; embed: ReturnType<typeof vi.fn> };
  let vectorStoreService: {
    insertChunks: ReturnType<typeof vi.fn>;
    deleteByDocument: ReturnType<typeof vi.fn>;
  };
  let loaders: ReturnType<typeof createMockLoaders>;

  const user: AuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    // $transaction callback form — invoke the callback with the mock.
    prisma.$transaction = vi.fn(async (cb: any) => (typeof cb === 'function' ? cb(prisma) : cb));
    // resolveSource() is a find-or-create (no DB-level unique constraint on
    // (tenantId, name) to `upsert` against) — findFirst() returns nothing by
    // default, so it falls through to create().
    prisma.ragSource.findFirst = vi.fn().mockResolvedValue(null);
    prisma.ragSource.create = vi.fn().mockResolvedValue({ id: 'src-1', tenantId: 't1', name: 'Test' });
    prisma.ragSource.findUnique = vi.fn();
    prisma.ragDocument.create = vi.fn().mockResolvedValue({ id: 'doc-1', tenantId: 't1' });
    prisma.ragDocument.update = vi.fn().mockResolvedValue({});
    prisma.ragDocument.findMany = vi.fn().mockResolvedValue([]);
    prisma.ragDocument.findUnique = vi.fn();

    chunkingService = {
      chunk: vi.fn().mockReturnValue([
        {
          id: 'c1',
          content: 'chunk one',
          tokenCount: 2,
          position: 0,
          metadata: { documentId: '', tenantId: 't1', source: 'manual' },
        },
        {
          id: 'c2',
          content: 'chunk two',
          tokenCount: 2,
          position: 1,
          metadata: { documentId: '', tenantId: 't1', source: 'manual' },
        },
      ]),
    };

    embeddingsService = {
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
      embed: vi.fn().mockResolvedValue([0.1, 0.2]),
    };

    vectorStoreService = {
      insertChunks: vi.fn().mockResolvedValue(undefined),
      deleteByDocument: vi.fn().mockResolvedValue(undefined),
    };

    loaders = createMockLoaders();

    const moduleRef = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChunkingService, useValue: chunkingService },
        { provide: EmbeddingsService, useValue: embeddingsService },
        { provide: VectorStoreService, useValue: vectorStoreService },
        { provide: DocumentLoaderFactory, useValue: loaders.factory },
        { provide: OPENAI_CLIENT, useValue: { embeddings: { create: vi.fn() } } },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        // Leaf loaders — not used directly but required by the factory's constructor.
        { provide: PdfLoader, useValue: loaders.pdfLoader },
        { provide: DocxLoader, useValue: loaders.docxLoader },
        { provide: MarkdownLoader, useValue: loaders.markdownLoader },
        { provide: TextLoader, useValue: loaders.textLoader },
        { provide: CsvLoader, useValue: loaders.csvLoader },
        { provide: HtmlLoader, useValue: loaders.htmlLoader },
      ],
    }).compile();

    service = moduleRef.get(IngestionService);
  });

  describe('ingestDocument — inline content path', () => {
    const dto: IngestDocumentDto = {
      title: 'Test Doc',
      sourceName: 'Test Source',
      content: 'This is some test content. It has multiple sentences.',
      mimeType: 'text/plain',
    };

    it('runs the full pipeline and returns a READY result', async () => {
      const result = await service.ingestDocument(dto, user);

      expect(result.status).toBe('READY');
      expect(result.documentId).toBe('doc-1');
      expect(result.chunkCount).toBe(2);

      // Source resolved (find-or-create; not found, so it's created).
      expect(prisma.ragSource.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.ragSource.create).toHaveBeenCalledTimes(1);
      // Document create.
      expect(prisma.ragDocument.create).toHaveBeenCalledTimes(1);
      // Chunking called.
      expect(chunkingService.chunk).toHaveBeenCalledTimes(1);
      // Embeddings batch called.
      expect(embeddingsService.embedBatch).toHaveBeenCalledTimes(1);
      // Vector store insert called.
      expect(vectorStoreService.insertChunks).toHaveBeenCalledTimes(1);
      // Document flipped to READY.
      expect(prisma.ragDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-1' },
          data: expect.objectContaining({ status: 'READY' }),
        }),
      );
    });

    it('throws BadRequestException when neither content nor fileBuffer is provided', async () => {
      await expect(
        service.ingestDocument({ title: 'Empty' } as any, user),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks the document FAILED if chunking throws', async () => {
      chunkingService.chunk.mockImplementation(() => {
        throw new Error('chunker exploded');
      });

      await expect(service.ingestDocument(dto, user)).rejects.toThrow('chunker exploded');

      // The document should have been flipped to FAILED.
      expect(prisma.ragDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-1' },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('marks the document FAILED if embedding throws', async () => {
      embeddingsService.embedBatch.mockRejectedValue(new Error('openai down'));
      await expect(service.ingestDocument(dto, user)).rejects.toThrow('openai down');
      expect(prisma.ragDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-1' },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });

  describe('ingestDocument — file upload path', () => {
    it('uses the loader factory when fileBuffer is supplied', async () => {
      loaders.textLoader.load.mockResolvedValue({
        text: 'Loaded text content',
        metadata: {
          filename: 'sample.txt',
          mimeType: 'text/plain',
          source: 'upload',
          tenantId: 't1',
          uploadedBy: 'u1',
          wordCount: 3,
          charCount: 18,
          language: 'en',
        },
        sections: [],
      });

      const dto: IngestDocumentDto = {
        title: 'Uploaded',
        filename: 'sample.txt',
        mimeType: 'text/plain',
        fileBuffer: Buffer.from('Loaded text content'),
      };

      const result = await service.ingestDocument(dto, user);

      expect(result.status).toBe('READY');
      expect(loaders.factory.getLoaderFor).toHaveBeenCalledWith('sample.txt', 'text/plain');
      expect(loaders.textLoader.load).toHaveBeenCalledTimes(1);
      // Chunking was called with the loaded text (not the raw buffer).
      const chunkedDoc = chunkingService.chunk.mock.calls[0][0];
      expect(chunkedDoc.text).toBe('Loaded text content');
    });
  });

  describe('ingestBatch', () => {
    it('processes multiple documents and aggregates results', async () => {
      const dtos: IngestDocumentDto[] = [
        {
          title: 'Doc 1',
          sourceName: 'Batch Source',
          content: 'content one',
        },
        {
          title: 'Doc 2',
          sourceName: 'Batch Source',
          content: 'content two',
        },
      ];

      const result = await service.ingestBatch(dtos, user);

      expect(result.totalDocuments).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.totalChunks).toBe(4); // 2 chunks per doc
      expect(result.results).toHaveLength(2);
    });

    it('isolates per-document failures — one bad doc does not fail the batch', async () => {
      const dtos: IngestDocumentDto[] = [
        { title: 'Good Doc', sourceName: 'Batch', content: 'good content' },
        { title: 'Bad Doc' }, // missing content → BadRequestException
      ];

      const result = await service.ingestBatch(dtos, user);

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[1].status).toBe('FAILED');
      expect(result.results[1].error).toBeDefined();
    });
  });

  describe('reingestSource', () => {
    it('throws NotFoundException for a missing source', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(null);
      await expect(service.reingestSource('missing', user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for cross-tenant access', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({
        id: 'src-1',
        tenantId: 'other-tenant',
      });
      await expect(service.reingestSource('src-1', user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes existing chunks + re-ingests stored content', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({
        id: 'src-1',
        tenantId: 't1',
      });
      prisma.ragDocument.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Stored Doc',
          content: 'stored content here',
          metadata: { mimeType: 'text/plain', originalFilename: 'doc.txt' },
        },
      ]);

      const result = await service.reingestSource('src-1', user);

      // Existing chunks for the doc were deleted.
      expect(vectorStoreService.deleteByDocument).toHaveBeenCalledWith('doc-1');
      // The stored content was re-ingested.
      expect(result.totalDocuments).toBe(1);
      expect(result.succeeded).toBe(1);
    });
  });

  describe('deleteDocument', () => {
    it('soft-deletes the document + cascades chunk deletion', async () => {
      prisma.ragDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        tenantId: 't1',
      });

      await service.deleteDocument('doc-1', user);

      expect(vectorStoreService.deleteByDocument).toHaveBeenCalledWith('doc-1');
      expect(prisma.ragDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-1' },
          data: { status: 'DELETED' },
        }),
      );
    });

    it('throws NotFoundException for a missing document', async () => {
      prisma.ragDocument.findUnique.mockResolvedValue(null);
      await expect(service.deleteDocument('missing', user)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resolveSource — source resolution logic', () => {
    it('uses sourceId when provided and looks it up', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({
        id: 'src-existing',
        tenantId: 't1',
      });

      const dto: IngestDocumentDto = {
        title: 'Test',
        sourceId: 'src-existing',
        content: 'content',
      };

      await service.ingestDocument(dto, user);

      expect(prisma.ragSource.findUnique).toHaveBeenCalledWith({
        where: { id: 'src-existing' },
      });
      expect(prisma.ragSource.findFirst).not.toHaveBeenCalled();
      expect(prisma.ragSource.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when sourceId is provided but not found', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(null);

      const dto: IngestDocumentDto = {
        title: 'Test',
        sourceId: 'missing-src',
        content: 'content',
      };

      await expect(service.ingestDocument(dto, user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when sourceId exists but belongs to another tenant', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({
        id: 'src-other',
        tenantId: 'other-tenant',
      });

      const dto: IngestDocumentDto = {
        title: 'Test',
        sourceId: 'src-other',
        content: 'content',
      };

      await expect(service.ingestDocument(dto, user)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

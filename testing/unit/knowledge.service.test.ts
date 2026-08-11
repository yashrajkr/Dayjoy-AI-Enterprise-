/**
 * Unit tests — KnowledgeService (RAG).
 *
 * Covers:
 *  - Sources CRUD:  findAllSources / findOneSource / createSource / updateSource / removeSource
 *  - Documents:     findAllDocuments / findOneDocument / ingest / deleteDocument / reingest
 *  - Query:         query() — vector search + LLM answer + citations
 *  - Stats:         getStats()
 *
 * OpenAI client (embeddings + chat) and Prisma are mocked.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { KnowledgeService } from '@backend/knowledge/knowledge.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '@backend/_shared/ai/openai.provider';

import {
  mockPrismaService,
  mockOpenAI,
  mockConfigService,
} from '@testing/helpers/mocks';
import {
  testRagSource,
  testRagDocument,
  testRagChunk,
  testTenant,
  testAuthUser,
} from '@testing/helpers/fixtures';

describe('KnowledgeService (system-wide unit)', () => {
  let service: KnowledgeService;
  let prisma: ReturnType<typeof mockPrismaService>;
  let openai: ReturnType<typeof mockOpenAI>;
  let config: ReturnType<typeof mockConfigService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    openai = mockOpenAI();
    config = mockConfigService();

    const moduleRef = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        { provide: PrismaService, useValue: prisma },
        { provide: OPENAI_CLIENT, useValue: openai },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(KnowledgeService);
  });

  // -------------------------------------------------------------------
  // Sources
  // -------------------------------------------------------------------

  describe('findAllSources()', () => {
    it('returns paginated sources scoped to tenant', async () => {
      prisma.ragSource.findMany.mockResolvedValue([testRagSource]);
      prisma.ragSource.count.mockResolvedValue(1);

      const result = await service.findAllSources({ page: 1, limit: 20 }, testAuthUser);

      expect(result.data).toHaveLength(1);
      const whereArg = prisma.ragSource.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });
  });

  describe('findOneSource()', () => {
    it('returns the source', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(testRagSource);

      const result = await service.findOneSource(testRagSource.id, testAuthUser);

      expect(result.id).toBe(testRagSource.id);
    });

    it('throws NotFoundException when the source does not exist', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(null);

      await expect(service.findOneSource('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createSource()', () => {
    it('creates a source', async () => {
      prisma.ragSource.findFirst.mockResolvedValue(null);
      prisma.ragSource.create.mockResolvedValue(testRagSource);

      const result = await service.createSource(
        { name: 'Product Manual', type: 'manual' } as any,
        testAuthUser,
      );

      expect(result.id).toBe(testRagSource.id);
      const createArg = prisma.ragSource.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
    });

    it('throws ConflictException when name already exists in tenant', async () => {
      prisma.ragSource.findFirst.mockResolvedValue(testRagSource);

      await expect(
        service.createSource(
          { name: testRagSource.name, type: 'manual' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateSource()', () => {
    it('updates source fields', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(testRagSource);
      prisma.ragSource.update.mockResolvedValue({
        ...testRagSource,
        name: 'Updated',
      });

      const result = await service.updateSource(
        testRagSource.id,
        { name: 'Updated' } as any,
        testAuthUser,
      );

      expect(result.name).toBe('Updated');
    });
  });

  describe('removeSource()', () => {
    it('deletes the source and cascades to documents + chunks', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(testRagSource);
      prisma.ragSource.delete.mockResolvedValue(testRagSource);

      await service.removeSource(testRagSource.id, testAuthUser);

      expect(prisma.ragSource.delete).toHaveBeenCalledWith({
        where: { id: testRagSource.id },
      });
    });
  });

  // -------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------

  describe('findAllDocuments()', () => {
    it('returns paginated documents scoped to tenant', async () => {
      prisma.ragDocument.findMany.mockResolvedValue([testRagDocument]);
      prisma.ragDocument.count.mockResolvedValue(1);

      const result = await service.findAllDocuments({ page: 1, limit: 20 }, testAuthUser);

      const whereArg = prisma.ragDocument.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('ingest()', () => {
    it('creates a document, chunks it, embeds each chunk, and persists all rows', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(testRagSource);
      prisma.ragDocument.create.mockResolvedValue(testRagDocument);
      prisma.ragChunk.createMany.mockResolvedValue({ count: 5 });
      prisma.embedding.createMany.mockResolvedValue({ count: 5 });
      prisma.ragDocument.update.mockResolvedValue(testRagDocument);
      prisma.ragSource.update.mockResolvedValue(testRagSource);

      const result = await service.ingest(
        {
          sourceId: testRagSource.id,
          title: 'Test doc',
          content: 'A long document body that will be split into chunks.',
          contentType: 'text/plain',
        } as any,
        testAuthUser,
      );

      expect(result.id).toBe(testRagDocument.id);
      // Embeddings called once per chunk.
      expect(openai.embeddings.create).toHaveBeenCalled();
      // Document + source counters updated.
      expect(prisma.ragDocument.update).toHaveBeenCalled();
      expect(prisma.ragSource.update).toHaveBeenCalled();
    });

    it('throws NotFoundException when the source does not exist', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(null);

      await expect(
        service.ingest(
          { sourceId: 'ghost', title: 'x', content: 'x' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when content is empty', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(testRagSource);

      await expect(
        service.ingest(
          { sourceId: testRagSource.id, title: 'x', content: '' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteDocument()', () => {
    it('deletes the document and its chunks + embeddings', async () => {
      prisma.ragDocument.findUnique.mockResolvedValue(testRagDocument);
      prisma.ragChunk.deleteMany.mockResolvedValue({ count: 5 });
      prisma.embedding.deleteMany.mockResolvedValue({ count: 5 });
      prisma.ragDocument.delete.mockResolvedValue(testRagDocument);
      prisma.ragSource.update.mockResolvedValue(testRagSource);

      await service.deleteDocument(testRagDocument.id, testAuthUser);

      expect(prisma.ragChunk.deleteMany).toHaveBeenCalled();
      expect(prisma.embedding.deleteMany).toHaveBeenCalled();
      expect(prisma.ragDocument.delete).toHaveBeenCalled();
    });

    it('throws NotFoundException when the document does not exist', async () => {
      prisma.ragDocument.findUnique.mockResolvedValue(null);

      await expect(service.deleteDocument('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reingest()', () => {
    it('re-ingests all documents for a source', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(testRagSource);
      prisma.ragDocument.findMany.mockResolvedValue([testRagDocument]);
      prisma.ragChunk.deleteMany.mockResolvedValue({ count: 5 });
      prisma.embedding.deleteMany.mockResolvedValue({ count: 5 });
      prisma.ragChunk.createMany.mockResolvedValue({ count: 5 });
      prisma.embedding.createMany.mockResolvedValue({ count: 5 });
      prisma.ragDocument.update.mockResolvedValue(testRagDocument);
      prisma.ragSource.update.mockResolvedValue(testRagSource);

      await service.reingest(testRagSource.id, testAuthUser);

      // Each existing document should have its chunks replaced.
      expect(prisma.ragChunk.deleteMany).toHaveBeenCalled();
      expect(prisma.ragChunk.createMany).toHaveBeenCalled();
    });

    it('throws NotFoundException when the source does not exist', async () => {
      prisma.ragSource.findUnique.mockResolvedValue(null);

      await expect(service.reingest('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // query() — RAG search
  // -------------------------------------------------------------------

  describe('query()', () => {
    it('embeds the query, retrieves top-K chunks, and synthesises an answer with citations', async () => {
      prisma.ragQuery.create.mockResolvedValue({});
      prisma.$queryRaw.mockResolvedValue([
        {
          id: testRagChunk.id,
          content: testRagChunk.content,
          documentId: testRagDocument.id,
          documentTitle: testRagDocument.title,
          sourceId: testRagSource.id,
          score: 0.92,
        },
      ]);

      const result = await service.query(
        { query: 'how to use vitamin c serum', topK: 5 } as any,
        testAuthUser,
      );

      expect(openai.embeddings.create).toHaveBeenCalled(); // query embedding
      expect(openai.chat.completions.create).toHaveBeenCalled(); // answer synthesis
      expect(result).toHaveProperty('answer');
      expect(result).toHaveProperty('citations');
      expect(result.citations[0]).toHaveProperty('chunkId');
      expect(result.citations[0]).toHaveProperty('score');
    });

    it('returns no citations when no chunks match', async () => {
      prisma.ragQuery.create.mockResolvedValue({});
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.query(
        { query: 'completely unrelated query' } as any,
        testAuthUser,
      );

      expect(result.citations).toHaveLength(0);
      expect(result.answer).toBeDefined();
    });
  });

  // -------------------------------------------------------------------
  // getStats()
  // -------------------------------------------------------------------

  describe('getStats()', () => {
    it('returns document count, chunk count, embedding count, source count', async () => {
      prisma.ragSource.count.mockResolvedValue(3);
      prisma.ragDocument.count.mockResolvedValue(50);
      prisma.ragChunk.count.mockResolvedValue(500);
      prisma.embedding.count.mockResolvedValue(500);
      prisma.ragQuery.count.mockResolvedValue(120);

      const result = await service.getStats(testAuthUser);

      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('documents');
      expect(result).toHaveProperty('chunks');
      expect(result).toHaveProperty('embeddings');
      expect(result).toHaveProperty('queries');
    });
  });
});

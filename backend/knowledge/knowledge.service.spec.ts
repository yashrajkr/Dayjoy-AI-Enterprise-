import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { KnowledgeService } from './knowledge.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../_shared/ai/openai.provider';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import {
  IngestDocumentDto,
  QueryKnowledgeDto,
  CreateRagSourceDto,
  UpdateRagSourceDto,
  RagSourceType,
  QuerySourcesDto,
  QueryDocumentsDto,
} from './dto/knowledge.dto';
import { AuthUser } from '../ai/auth-user';

/**
 * Build a minimal OpenAI stub — `KnowledgeService` uses
 * `embeddings.create` for query/chunk embeddings and `chat.completions.
 * create` for answer synthesis.
 */
function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Synthesised answer.' } }],
          usage: { total_tokens: 10 },
        }),
      },
    },
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      }),
    },
  };
}

/**
 * KnowledgeService unit tests.
 *
 * Covers:
 *  - findAllSources / findOneSource (pagination + tenant scoping / 404)
 *  - createSource / updateSource (JSON configuration coercion)
 *  - removeSource (soft-delete cascade)
 *  - findAllDocuments / findOneDocument
 *  - ingest (chunking with overlap, best-effort embeddings)
 *  - query (text-search fallback when no embeddings, ragQuery persisted)
 *  - deleteDocument (hard-delete chunks + document)
 *  - reingest (delete + recreate chunks for each document in a source)
 *  - getStats (counts + avg latency)
 */
describe('KnowledgeService', () => {
  let service: KnowledgeService;
  // `prisma` is typed `any` because we extend the shared mock inline
  // with `ragDocument.updateMany`, `ragChunk.deleteMany`,
  // `ragQuery.aggregate`, `$queryRaw`, `$executeRaw` (none are on
  // the static mock type).
  let prisma: any;
  let configService: { get: ReturnType<typeof vi.fn> };
  const user: AuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    // Add stubs for raw-SQL helpers + missing model methods not in the
    // shared mock (`ragDocument.updateMany`, `ragChunk.deleteMany`,
    // `ragQuery.aggregate`). Done inline so we don't have to modify
    // the shared `_shared/testing` helper (off-limits per the task scope).
    Object.assign(prisma.ragDocument, {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    Object.assign(prisma.ragChunk, {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    Object.assign(prisma.ragQuery, {
      aggregate: vi.fn().mockResolvedValue({
        _avg: { latencyMs: 0 },
        _max: { latencyMs: 0 },
      }),
    });
    Object.assign(prisma, {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    });

    configService = {
      get: vi.fn((key: string) => {
        if (key === 'openai.apiKey') return 'sk-test-key';
        if (key === 'openai.model') return 'gpt-4o';
        if (key === 'openai.embeddingModel') return 'text-embedding-3-small';
        return undefined;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: OPENAI_CLIENT, useValue: createMockOpenAI() },
      ],
    }).compile();

    service = moduleRef.get(KnowledgeService);
  });

  // -------------------------------------------------------------------
  // Sources
  // -------------------------------------------------------------------

  describe('findAllSources', () => {
    it('returns paginated sources with a documents count', async () => {
      prisma.ragSource.findMany.mockResolvedValue([
        { id: 's1', name: 'Docs', _count: { documents: 3 } },
      ]);
      prisma.ragSource.count.mockResolvedValue(1);

      const query: QuerySourcesDto = { page: 1, limit: 10 };
      const result = await service.findAllSources(query, user);

      expect(result.data).toHaveLength(1);
      const args = prisma.ragSource.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t1');
      expect(args.include._count).toEqual({ select: { documents: true } });
    });
  });

  describe('findOneSource', () => {
    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({ id: 's1', tenantId: 'other' });
      await expect(service.findOneSource('s1', user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createSource', () => {
    it('creates a source with status=active', async () => {
      prisma.ragSource.create.mockImplementation(async ({ data }: any) => ({
        id: 's1',
        ...data,
      }));

      const dto: CreateRagSourceDto = {
        name: 'Product Docs',
        type: RagSourceType.DOCUMENT,
        description: 'User-facing product documentation',
      };
      const result = await service.createSource(dto, user);

      expect(result.id).toBe('s1');
      const call = prisma.ragSource.create.mock.calls[0][0];
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.status).toBe('active');
    });

    it('parses configuration JSON when supplied', async () => {
      prisma.ragSource.create.mockResolvedValue({ id: 's1' });

      await service.createSource(
        {
          name: 'X',
          type: RagSourceType.API,
          configuration: '{"url":"https://x"}',
        },
        user,
      );

      expect(prisma.ragSource.create.mock.calls[0][0].data.configuration).toEqual({
        url: 'https://x',
      });
    });
  });

  describe('updateSource', () => {
    it('patches only the supplied fields', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({ id: 's1', tenantId: 't1' });
      prisma.ragSource.update.mockResolvedValue({ id: 's1' });

      const dto: UpdateRagSourceDto = { description: 'Updated' };
      await service.updateSource('s1', dto, user);

      const call = prisma.ragSource.update.mock.calls[0][0];
      expect(call.data.description).toBe('Updated');
      expect(Object.keys(call.data)).toEqual(['description']);
    });
  });

  describe('removeSource', () => {
    it('cascades the archive status to source + documents in a transaction', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({ id: 's1', tenantId: 't1' });
      prisma.ragSource.update.mockResolvedValue({});
      prisma.ragDocument.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.removeSource('s1', user);

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
      const tx = prisma.$transaction.mock.calls[0][0];
      expect(tx).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------

  describe('findAllDocuments', () => {
    it('filters by sourceId + paginates', async () => {
      prisma.ragDocument.findMany.mockResolvedValue([{ id: 'd1' }]);
      prisma.ragDocument.count.mockResolvedValue(1);

      const result = await service.findAllDocuments(
        { page: 1, limit: 10, sourceId: 's1' },
        user,
      );

      expect(result.data).toHaveLength(1);
      const where = prisma.ragDocument.findMany.mock.calls[0][0].where;
      expect(where.sourceId).toBe('s1');
      expect(where.tenantId).toBe('t1');
    });
  });

  describe('ingest', () => {
    it('splits content into 1000-char chunks with 200-char overlap', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({ id: 's1', tenantId: 't1' });
      prisma.ragDocument.create.mockImplementation(async ({ data }: any) => ({
        id: 'd1',
        ...data,
      }));
      prisma.ragChunk.createMany.mockResolvedValue({ count: 3 });

      // 1800 chars → at chunkSize=1000, step=800 → chunks at 0..1000,
      // 800..1800, then 1600..2600 (truncated at 1800). So 3 chunks.
      const content = 'a'.repeat(1800);
      const dto: IngestDocumentDto = {
        sourceId: 's1',
        title: 'Test doc',
        content,
      };

      const result = await service.ingest(dto, user);

      expect(result.document.id).toBe('d1');
      expect(result.chunksCreated).toBe(3);

      const chunkCall = prisma.ragChunk.createMany.mock.calls[0][0];
      expect(chunkCall.data).toHaveLength(3);
      expect(chunkCall.data[0].chunkIndex).toBe(0);
      expect(chunkCall.data[1].chunkIndex).toBe(1);
      expect(chunkCall.data[2].chunkIndex).toBe(2);
      // Overlap: chunk 1 starts at index 800, not 1000.
      expect(chunkCall.data[1].content).toBe(content.slice(800, 1800));
    });

    it('creates 1 chunk when content is shorter than chunk size (partial tail)', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({ id: 's1', tenantId: 't1' });
      prisma.ragDocument.create.mockResolvedValue({ id: 'd1' });

      const result = await service.ingest(
        { sourceId: 's1', title: 'tiny', content: 'short' },
        user,
      );

      // Even short content gets at least 1 chunk — the splitter doesn't
      // drop the partial-chunk tail.
      expect(result.chunksCreated).toBe(1);
      expect(prisma.ragChunk.createMany).toHaveBeenCalled();
    });

    it('throws NotFoundException on cross-tenant source access', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({ id: 's1', tenantId: 'other' });

      await expect(
        service.ingest(
          { sourceId: 's1', title: 'x', content: 'y' },
          user,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('query', () => {
    it('falls back to text search when vector search returns nothing', async () => {
      prisma.ragChunk.findMany.mockResolvedValue([
        {
          id: 'chk-1',
          documentId: 'd1',
          content: 'Pricing is $5/mo.',
          document: { title: 'Pricing' },
        },
      ]);
      prisma.ragQuery.create.mockImplementation(async ({ data }: any) => ({
        id: 'q-1',
        ...data,
      }));

      const dto: QueryKnowledgeDto = { query: 'pricing' };
      const result = await service.query(dto, user);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].documentTitle).toBe('Pricing');
      expect(result.queryId).toBe('q-1');

      const call = prisma.ragQuery.create.mock.calls[0][0];
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.queryText).toBe('pricing');
      expect(call.data.retrievedChunkIds).toEqual(['chk-1']);
    });

    it('returns a no-results answer when no chunks match', async () => {
      prisma.ragChunk.findMany.mockResolvedValue([]);
      prisma.ragQuery.create.mockResolvedValue({ id: 'q-1' });

      const result = await service.query(
        { query: 'unknown topic' },
        user,
      );

      expect(result.citations).toEqual([]);
      expect(result.answer).toContain('No relevant information');
    });
  });

  describe('deleteDocument', () => {
    it('hard-deletes chunks + document', async () => {
      prisma.ragDocument.findUnique.mockResolvedValue({
        id: 'd1',
        tenantId: 't1',
      });
      prisma.ragChunk.deleteMany.mockResolvedValue({ count: 3 });
      prisma.ragDocument.delete.mockResolvedValue({});

      const result = await service.deleteDocument('d1', user);

      expect(result.success).toBe(true);
      expect(prisma.ragChunk.deleteMany).toHaveBeenCalledWith({
        where: { documentId: 'd1' },
      });
      expect(prisma.ragDocument.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    });
  });

  describe('reingest', () => {
    it('deletes existing chunks and re-creates them for each document', async () => {
      prisma.ragSource.findUnique.mockResolvedValue({ id: 's1', tenantId: 't1' });
      prisma.ragDocument.findMany.mockResolvedValue([
        { id: 'd1', tenantId: 't1', content: 'a'.repeat(1500) },
      ]);
      prisma.ragChunk.deleteMany.mockResolvedValue({ count: 1 });
      prisma.ragChunk.createMany.mockResolvedValue({ count: 2 });

      const result = await service.reingest('s1', user);

      expect(result.documentsProcessed).toBe(1);
      expect(result.results[0].chunksCreated).toBeGreaterThan(0);
      expect(prisma.ragChunk.deleteMany).toHaveBeenCalledWith({
        where: { documentId: 'd1' },
      });
      expect(prisma.ragChunk.createMany).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('returns aggregated counts + avg latency', async () => {
      prisma.ragSource.count.mockResolvedValue(3);
      prisma.ragDocument.count.mockResolvedValue(10);
      prisma.ragChunk.count.mockResolvedValue(45);
      prisma.ragQuery.count.mockResolvedValue(100);
      prisma.ragQuery.aggregate.mockResolvedValue({ _avg: { latencyMs: 250 } });

      const result = await service.getStats(user);

      expect(result.sources.total).toBe(3);
      expect(result.documents).toBe(10);
      expect(result.chunks).toBe(45);
      expect(result.queries.total).toBe(100);
      expect(result.avgLatencyMs).toBe(250);
    });
  });
});

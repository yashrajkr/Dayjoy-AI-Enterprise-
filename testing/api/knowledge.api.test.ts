/**
 * API tests — /api/knowledge endpoints.
 *
 * Endpoints:
 *  - Sources: GET / GET:id / POST / PUT:id / DELETE:id / POST:id/reingest
 *  - Documents: GET / GET:id / POST (ingest) / DELETE:id
 *  - Query: POST /api/knowledge/query
 *  - Stats: GET /api/knowledge/stats
 *  - Articles: GET / GET:slug / POST / PUT:id / DELETE:id / POST:id/helpful / search
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { KnowledgeController } from '@backend/knowledge/knowledge.controller';
import { KnowledgeService } from '@backend/knowledge/knowledge.service';
import { ArticlesService } from '@backend/knowledge/articles.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import {
  testRagSource,
  testRagDocument,
  testAuthUser,
} from '@testing/helpers/fixtures';

describe('Knowledge API (/api/knowledge)', () => {
  let app: INestApplication;
  let knowledge: any;
  let articles: any;

  beforeAll(async () => {
    knowledge = {
      findAllSources: vi.fn(),
      findOneSource: vi.fn(),
      createSource: vi.fn(),
      updateSource: vi.fn(),
      removeSource: vi.fn(),
      findAllDocuments: vi.fn(),
      findOneDocument: vi.fn(),
      ingest: vi.fn(),
      deleteDocument: vi.fn(),
      reingest: vi.fn(),
      query: vi.fn(),
      getStats: vi.fn(),
    };
    articles = {
      findAll: vi.fn(),
      findBySlug: vi.fn(),
      search: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      markHelpful: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [KnowledgeController],
      providers: [
        { provide: KnowledgeService, useValue: knowledge },
        { provide: ArticlesService, useValue: articles },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => {
        ctx.switchToHttp().getRequest().user = testAuthUser;
        return true;
      } })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -----------------------------------------------------------------
  // Sources
  // -----------------------------------------------------------------

  describe('Sources', () => {
    it('GET /api/knowledge/sources returns 200 + paginated', async () => {
      knowledge.findAllSources.mockResolvedValue({ data: [testRagSource], total: 1, page: 1, limit: 20 });

      const res = await request(app.getHttpServer()).get('/api/knowledge/sources');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /api/knowledge/sources returns 201 + created source', async () => {
      knowledge.createSource.mockResolvedValue({ ...testRagSource, id: 'src-new' });

      const res = await request(app.getHttpServer())
        .post('/api/knowledge/sources')
        .send({ name: 'New Source', type: 'manual' });

      expect(res.status).toBe(201);
    });

    it('GET /api/knowledge/sources/:id returns 200', async () => {
      knowledge.findOneSource.mockResolvedValue(testRagSource);

      const res = await request(app.getHttpServer()).get(`/api/knowledge/sources/${testRagSource.id}`);

      expect(res.status).toBe(200);
    });

    it('PUT /api/knowledge/sources/:id returns 200', async () => {
      knowledge.updateSource.mockResolvedValue({ ...testRagSource, name: 'Updated' });

      const res = await request(app.getHttpServer())
        .put(`/api/knowledge/sources/${testRagSource.id}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
    });

    it('DELETE /api/knowledge/sources/:id returns 200', async () => {
      knowledge.removeSource.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete(`/api/knowledge/sources/${testRagSource.id}`);

      expect(res.status).toBe(200);
    });

    it('POST /api/knowledge/sources/:id/reingest returns 200', async () => {
      knowledge.reingest.mockResolvedValue({ reingested: 5 });

      const res = await request(app.getHttpServer())
        .post(`/api/knowledge/sources/${testRagSource.id}/reingest`);

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Documents
  // -----------------------------------------------------------------

  describe('Documents', () => {
    it('GET /api/knowledge/documents returns 200 + paginated', async () => {
      knowledge.findAllDocuments.mockResolvedValue({ data: [testRagDocument], total: 1, page: 1, limit: 20 });

      const res = await request(app.getHttpServer()).get('/api/knowledge/documents');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('GET /api/knowledge/documents/:id returns 200', async () => {
      knowledge.findOneDocument.mockResolvedValue(testRagDocument);

      const res = await request(app.getHttpServer()).get(`/api/knowledge/documents/${testRagDocument.id}`);

      expect(res.status).toBe(200);
    });

    it('POST /api/knowledge/ingest returns 201 + ingested document', async () => {
      knowledge.ingest.mockResolvedValue({ ...testRagDocument, id: 'doc-new' });

      const res = await request(app.getHttpServer())
        .post('/api/knowledge/ingest')
        .send({
          sourceId: testRagSource.id,
          title: 'New doc',
          content: 'A new document body.',
        });

      expect(res.status).toBe(201);
    });

    it('DELETE /api/knowledge/documents/:id returns 200', async () => {
      knowledge.deleteDocument.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete(`/api/knowledge/documents/${testRagDocument.id}`);

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------

  describe('Query', () => {
    it('POST /api/knowledge/query returns 200 + answer + citations', async () => {
      knowledge.query.mockResolvedValue({
        answer: 'Use 2-3 drops morning and evening.',
        citations: [
          { chunkId: 'c1', documentId: testRagDocument.id, documentTitle: 'Guide', content: '...', score: 0.92 },
        ],
        latencyMs: 42,
      });

      const res = await request(app.getHttpServer())
        .post('/api/knowledge/query')
        .send({ query: 'how to use vitamin c serum' });

      expect(res.status).toBe(200);
      expect(res.body.answer).toBeDefined();
      expect(res.body.citations).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------

  describe('Stats', () => {
    it('GET /api/knowledge/stats returns 200', async () => {
      knowledge.getStats.mockResolvedValue({
        sources: 3,
        documents: 50,
        chunks: 500,
        embeddings: 500,
        queries: 120,
      });

      const res = await request(app.getHttpServer()).get('/api/knowledge/stats');

      expect(res.status).toBe(200);
      expect(res.body.documents).toBe(50);
    });
  });

  // -----------------------------------------------------------------
  // Articles
  // -----------------------------------------------------------------

  describe('Articles', () => {
    it('GET /api/knowledge/articles returns 200 + list', async () => {
      articles.findAll.mockResolvedValue([
        { id: 'art-1', title: 'Help article', slug: 'help-article' },
      ]);

      const res = await request(app.getHttpServer()).get('/api/knowledge/articles');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/knowledge/articles/search returns 200 + results', async () => {
      articles.search.mockResolvedValue([
        { id: 'art-1', title: 'Result', slug: 'result' },
      ]);

      const res = await request(app.getHttpServer()).get('/api/knowledge/articles/search?q=vitamin');

      expect(res.status).toBe(200);
    });

    it('POST /api/knowledge/articles returns 201 + created article', async () => {
      articles.create.mockResolvedValue({ id: 'art-new', title: 'New' });

      const res = await request(app.getHttpServer())
        .post('/api/knowledge/articles')
        .send({ title: 'New', content: 'Body' });

      expect(res.status).toBe(201);
    });

    it('POST /api/knowledge/articles/:id/helpful returns 200', async () => {
      articles.markHelpful.mockResolvedValue({ helpful: 10, notHelpful: 1 });

      const res = await request(app.getHttpServer())
        .post('/api/knowledge/articles/art-1/helpful')
        .send({ helpful: true });

      expect(res.status).toBe(200);
    });
  });
});

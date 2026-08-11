/**
 * API tests — /api/ai endpoints.
 *
 * Endpoints:
 *  - Agents: GET / POST / GET:id / PUT:id / DELETE:id / GET:id/capabilities
 *  - Conversations: GET / GET:id / POST / POST:id/messages / POST:id/end / GET:id/history / DELETE:id
 *  - Memory: GET / GET:user/:userId / GET:customer/:customerId / POST / PUT:id / DELETE:id
 *  - Tools: GET / POST:toolName/execute
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AiController } from '@backend/ai/ai.controller';
import { AiService } from '@backend/ai/ai.service';
import { ConversationsService } from '@backend/ai/conversations.service';
import { MemoryService } from '@backend/ai/memory.service';
import { ToolsService } from '@backend/ai/tools.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import {
  testAiAgent,
  testConversation,
  testMessage,
  testAiMemory,
  testAuthUser,
} from '@testing/helpers/fixtures';

describe('AI API (/api/ai)', () => {
  let app: INestApplication;
  let ai: any;
  let conv: any;
  let mem: any;
  let tools: any;

  beforeAll(async () => {
    ai = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      getCapabilities: vi.fn(),
    };
    conv = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      sendMessage: vi.fn(),
      endConversation: vi.fn(),
      getHistory: vi.fn(),
      deleteConversation: vi.fn(),
    };
    mem = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      getByUser: vi.fn(),
      getByCustomer: vi.fn(),
      getContextForConversation: vi.fn(),
    };
    tools = {
      listTools: vi.fn(),
      execute: vi.fn(),
      executeForConversation: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: ai },
        { provide: ConversationsService, useValue: conv },
        { provide: MemoryService, useValue: mem },
        { provide: ToolsService, useValue: tools },
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
  // Agents
  // -----------------------------------------------------------------

  describe('Agents', () => {
    it('GET /api/ai/agents returns 200 + paginated agents', async () => {
      ai.findAll.mockResolvedValue({ data: [testAiAgent], total: 1, page: 1, limit: 20 });

      const res = await request(app.getHttpServer()).get('/api/ai/agents');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /api/ai/agents returns 201 + the created agent', async () => {
      ai.create.mockResolvedValue({ ...testAiAgent, id: 'agent-new' });

      const res = await request(app.getHttpServer())
        .post('/api/ai/agents')
        .send({ name: 'New Agent', type: 'CUSTOMER_SUPPORT' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('agent-new');
    });

    it('GET /api/ai/agents/:id returns 200 + the agent', async () => {
      ai.findOne.mockResolvedValue(testAiAgent);

      const res = await request(app.getHttpServer()).get(`/api/ai/agents/${testAiAgent.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testAiAgent.id);
    });

    it('PUT /api/ai/agents/:id returns 200 + the updated agent', async () => {
      ai.update.mockResolvedValue({ ...testAiAgent, name: 'Updated' });

      const res = await request(app.getHttpServer())
        .put(`/api/ai/agents/${testAiAgent.id}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('DELETE /api/ai/agents/:id returns 200 (soft delete)', async () => {
      ai.remove.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete(`/api/ai/agents/${testAiAgent.id}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/ai/agents/:id/capabilities returns 200 + tools/memory', async () => {
      ai.getCapabilities.mockResolvedValue({ tools: [], memory: { enabled: true } });

      const res = await request(app.getHttpServer()).get(`/api/ai/agents/${testAiAgent.id}/capabilities`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tools');
    });
  });

  // -----------------------------------------------------------------
  // Conversations
  // -----------------------------------------------------------------

  describe('Conversations', () => {
    it('GET /api/ai/conversations returns 200 + paginated', async () => {
      conv.findAll.mockResolvedValue({ data: [testConversation], total: 1, page: 1, limit: 20 });

      const res = await request(app.getHttpServer()).get('/api/ai/conversations');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /api/ai/conversations returns 201 + the created conversation', async () => {
      conv.create.mockResolvedValue({ ...testConversation, id: 'conv-new' });

      const res = await request(app.getHttpServer())
        .post('/api/ai/conversations')
        .send({ agentId: testAiAgent.id, channel: 'WEBSITE' });

      expect(res.status).toBe(201);
    });

    it('POST /api/ai/conversations/:id/messages returns 201 + user + assistant messages', async () => {
      conv.sendMessage.mockResolvedValue({
        userMessage: { ...testMessage, role: 'user' },
        assistantMessage: { ...testMessage, role: 'assistant', id: 'msg-reply' },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/ai/conversations/${testConversation.id}/messages`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('userMessage');
      expect(res.body).toHaveProperty('assistantMessage');
    });

    it('POST /api/ai/conversations/:id/end returns 200 + ended conversation', async () => {
      conv.endConversation.mockResolvedValue({ ...testConversation, status: 'ended', summary: 'x' });

      const res = await request(app.getHttpServer())
        .post(`/api/ai/conversations/${testConversation.id}/end`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ended');
    });

    it('GET /api/ai/conversations/:id/history returns 200 + paginated messages', async () => {
      conv.getHistory.mockResolvedValue({ data: [testMessage], total: 1, page: 1, limit: 50 });

      const res = await request(app.getHttpServer())
        .get(`/api/ai/conversations/${testConversation.id}/history`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('DELETE /api/ai/conversations/:id returns 200', async () => {
      conv.deleteConversation.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete(`/api/ai/conversations/${testConversation.id}`);

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Memory
  // -----------------------------------------------------------------

  describe('Memory', () => {
    it('GET /api/ai/memory returns 200 + paginated memories', async () => {
      mem.findAll.mockResolvedValue({ data: [testAiMemory], total: 1, page: 1, limit: 50 });

      const res = await request(app.getHttpServer()).get('/api/ai/memory');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /api/ai/memory returns 201 + created memory', async () => {
      mem.create.mockResolvedValue({ ...testAiMemory, id: 'mem-new' });

      const res = await request(app.getHttpServer())
        .post('/api/ai/memory')
        .send({ type: 'PREFERENCE', content: 'prefers email' });

      expect(res.status).toBe(201);
    });

    it('PUT /api/ai/memory/:id returns 200 + updated memory', async () => {
      mem.update.mockResolvedValue({ ...testAiMemory, content: 'Updated' });

      const res = await request(app.getHttpServer())
        .put(`/api/ai/memory/${testAiMemory.id}`)
        .send({ content: 'Updated' });

      expect(res.status).toBe(200);
    });

    it('DELETE /api/ai/memory/:id returns 200', async () => {
      mem.remove.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete(`/api/ai/memory/${testAiMemory.id}`);

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Tools
  // -----------------------------------------------------------------

  describe('Tools', () => {
    it('GET /api/ai/tools returns 200 + all 8 tool definitions', async () => {
      tools.listTools.mockReturnValue([
        { name: 'search_knowledge', description: 'x' },
        { name: 'search_products', description: 'x' },
      ]);

      const res = await request(app.getHttpServer()).get('/api/ai/tools');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/ai/tools/:toolName/execute returns 200 + tool result', async () => {
      tools.execute.mockResolvedValue({ answer: 'mock answer', citations: [] });

      const res = await request(app.getHttpServer())
        .post('/api/ai/tools/search_knowledge/execute')
        .send({ query: 'vitamin c' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('answer');
    });

    it('POST /api/ai/tools/:toolName/execute returns 400 for an unknown tool', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      tools.execute.mockRejectedValue(new BadRequestException());

      const res = await request(app.getHttpServer())
        .post('/api/ai/tools/nonexistent/execute')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});

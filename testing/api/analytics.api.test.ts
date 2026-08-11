/**
 * API tests — /api/analytics endpoints.
 *
 * Endpoints:
 *  - GET /api/analytics/dashboard
 *  - GET /api/analytics/sales
 *  - GET /api/analytics/customers
 *  - GET /api/analytics/products
 *  - GET /api/analytics/ai
 *  - GET /api/analytics/voice
 *  - GET /api/analytics/whatsapp
 *  - GET /api/analytics/knowledge
 *  - POST /api/analytics/events
 *  - GET /api/analytics/metrics
 *  - POST /api/analytics/metrics
 *  - POST /api/analytics/metrics/:id/values
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AnalyticsController } from '@backend/analytics/analytics.controller';
import { AnalyticsService } from '@backend/analytics/analytics.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import { testAuthUser } from '@testing/helpers/fixtures';

describe('Analytics API (/api/analytics)', () => {
  let app: INestApplication;
  let svc: any;

  beforeAll(async () => {
    svc = {
      getDashboard: vi.fn(),
      getSalesMetrics: vi.fn(),
      getCustomerMetrics: vi.fn(),
      getProductMetrics: vi.fn(),
      getAIMetrics: vi.fn(),
      getVoiceMetrics: vi.fn(),
      getWhatsAppMetrics: vi.fn(),
      getKnowledgeMetrics: vi.fn(),
      recordEvent: vi.fn(),
      getMetrics: vi.fn(),
      createMetric: vi.fn(),
      recordMetricValue: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: svc },
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

  describe('Dashboard', () => {
    it('GET /api/analytics/dashboard returns 200', async () => {
      svc.getDashboard.mockResolvedValue({
        revenue: 10000,
        orders: 50,
        customers: 120,
        conversations: 200,
      });

      const res = await request(app.getHttpServer()).get('/api/analytics/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.revenue).toBe(10000);
    });
  });

  describe('Sales metrics', () => {
    it('GET /api/analytics/sales returns 200', async () => {
      svc.getSalesMetrics.mockResolvedValue({
        totalRevenue: 5000,
        orderCount: 25,
        averageOrderValue: 200,
      });

      const res = await request(app.getHttpServer()).get('/api/analytics/sales?period=month');

      expect(res.status).toBe(200);
      expect(res.body.totalRevenue).toBe(5000);
    });
  });

  describe('Customer metrics', () => {
    it('GET /api/analytics/customers returns 200', async () => {
      svc.getCustomerMetrics.mockResolvedValue({
        totalCustomers: 120,
        newCustomers: 15,
        averageLTV: 250,
      });

      const res = await request(app.getHttpServer()).get('/api/analytics/customers');

      expect(res.status).toBe(200);
    });
  });

  describe('Product metrics', () => {
    it('GET /api/analytics/products returns 200', async () => {
      svc.getProductMetrics.mockResolvedValue({
        topSellers: [{ productId: 'p1', quantity: 100 }],
        lowStock: [{ productId: 'p9', quantity: 3 }],
      });

      const res = await request(app.getHttpServer()).get('/api/analytics/products');

      expect(res.status).toBe(200);
    });
  });

  describe('AI metrics', () => {
    it('GET /api/analytics/ai returns 200', async () => {
      svc.getAIMetrics.mockResolvedValue({
        totalConversations: 200,
        totalMessages: 1500,
        toolCalls: 75,
      });

      const res = await request(app.getHttpServer()).get('/api/analytics/ai');

      expect(res.status).toBe(200);
    });
  });

  describe('Voice metrics', () => {
    it('GET /api/analytics/voice returns 200', async () => {
      svc.getVoiceMetrics.mockResolvedValue({
        totalCalls: 30,
        totalDurationSeconds: 5400,
        totalCost: 12.5,
      });

      const res = await request(app.getHttpServer()).get('/api/analytics/voice');

      expect(res.status).toBe(200);
    });
  });

  describe('WhatsApp metrics', () => {
    it('GET /api/analytics/whatsapp returns 200', async () => {
      svc.getWhatsAppMetrics.mockResolvedValue({
        totalMessages: 80,
        byDirection: { inbound: 40, outbound: 40 },
      });

      const res = await request(app.getHttpServer()).get('/api/analytics/whatsapp');

      expect(res.status).toBe(200);
    });
  });

  describe('Knowledge metrics', () => {
    it('GET /api/analytics/knowledge returns 200', async () => {
      svc.getKnowledgeMetrics.mockResolvedValue({
        totalQueries: 120,
        totalDocuments: 50,
        totalChunks: 500,
      });

      const res = await request(app.getHttpServer()).get('/api/analytics/knowledge');

      expect(res.status).toBe(200);
    });
  });

  describe('Events', () => {
    it('POST /api/analytics/events returns 201', async () => {
      svc.recordEvent.mockResolvedValue({ id: 'ev-1' });

      const res = await request(app.getHttpServer())
        .post('/api/analytics/events')
        .send({ eventType: 'page_view', eventData: { page: '/products' } });

      expect(res.status).toBe(201);
    });
  });

  describe('Custom metrics', () => {
    it('GET /api/analytics/metrics returns 200 + paginated', async () => {
      svc.getMetrics.mockResolvedValue({
        data: [{ id: 'm1', name: 'Activation Rate' }],
        total: 1,
      });

      const res = await request(app.getHttpServer()).get('/api/analytics/metrics');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /api/analytics/metrics returns 201', async () => {
      svc.createMetric.mockResolvedValue({ id: 'm1', name: 'Activation Rate' });

      const res = await request(app.getHttpServer())
        .post('/api/analytics/metrics')
        .send({ name: 'Activation Rate', unit: 'PERCENTAGE' });

      expect(res.status).toBe(201);
    });

    it('POST /api/analytics/metrics/:id/values returns 201', async () => {
      svc.recordMetricValue.mockResolvedValue({ id: 'mv-1' });

      const res = await request(app.getHttpServer())
        .post('/api/analytics/metrics/m1/values')
        .send({ value: 0.75 });

      expect(res.status).toBe(201);
    });
  });
});

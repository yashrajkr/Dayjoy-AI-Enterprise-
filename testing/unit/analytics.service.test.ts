/**
 * Unit tests — AnalyticsService.
 *
 * Covers:
 *  - getDashboard()         — aggregated top-line metrics
 *  - getSalesMetrics()      — revenue, AOV, order count, by status
 *  - getCustomerMetrics()   — new/active/churned, LTV
 *  - getProductMetrics()    — top sellers, low stock
 *  - getAIMetrics()         — conversations, tool calls, latency
 *  - getVoiceMetrics()      — call count, duration, outcomes
 *  - getWhatsAppMetrics()   — message count, response time
 *  - getKnowledgeMetrics()  — query count, no-result rate, citations
 *  - recordEvent()          — analytics_event persistence
 *  - Custom Metric CRUD     — createMetric, recordMetricValue, getMetrics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { AnalyticsService } from '@backend/analytics/analytics.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { mockPrismaService } from '@testing/helpers/mocks';
import { testTenant, testAuthUser } from '@testing/helpers/fixtures';

describe('AnalyticsService (system-wide unit)', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AnalyticsService);
  });

  // -------------------------------------------------------------------
  // getDashboard()
  // -------------------------------------------------------------------

  describe('getDashboard()', () => {
    it('returns top-line aggregated metrics for the dashboard', async () => {
      prisma.order.aggregate.mockResolvedValue({ _sum: { total: 10000 } });
      prisma.order.count.mockResolvedValue(50);
      prisma.customer.count.mockResolvedValue(120);
      prisma.conversation.count.mockResolvedValue(200);
      prisma.voiceSession.count.mockResolvedValue(30);
      prisma.whatsappMessage.count.mockResolvedValue(80);

      const result = await service.getDashboard(testAuthUser);

      expect(result).toHaveProperty('revenue');
      expect(result).toHaveProperty('orders');
      expect(result).toHaveProperty('customers');
      expect(result).toHaveProperty('conversations');
      expect(result).toHaveProperty('voiceCalls');
      expect(result).toHaveProperty('whatsappMessages');
    });
  });

  // -------------------------------------------------------------------
  // getSalesMetrics()
  // -------------------------------------------------------------------

  describe('getSalesMetrics()', () => {
    it('returns sales metrics broken down by status + period', async () => {
      prisma.order.aggregate.mockResolvedValue({
        _sum: { total: 5000 },
        _count: { _all: 25 },
        _avg: { total: 200 },
      });
      prisma.order.groupBy.mockResolvedValue([
        { status: 'DELIVERED', _count: { _all: 15 }, _sum: { total: 3000 } },
        { status: 'PENDING', _count: { _all: 10 }, _sum: { total: 2000 } },
      ]);

      const result = await service.getSalesMetrics(
        { period: 'month', startDate: '2025-01-01', endDate: '2025-01-31' } as any,
        testAuthUser,
      );

      expect(result).toHaveProperty('totalRevenue');
      expect(result).toHaveProperty('orderCount');
      expect(result).toHaveProperty('averageOrderValue');
      expect(result).toHaveProperty('byStatus');
    });
  });

  // -------------------------------------------------------------------
  // getCustomerMetrics()
  // -------------------------------------------------------------------

  describe('getCustomerMetrics()', () => {
    it('returns customer metrics (new, active, churned, LTV)', async () => {
      prisma.customer.count.mockResolvedValue(120);
      prisma.customer.aggregate.mockResolvedValue({ _avg: { lifetimeValue: 250 } });
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.getCustomerMetrics(
        { period: 'month', startDate: '2025-01-01', endDate: '2025-01-31' } as any,
        testAuthUser,
      );

      expect(result).toHaveProperty('totalCustomers');
      expect(result).toHaveProperty('newCustomers');
      expect(result).toHaveProperty('averageLTV');
    });
  });

  // -------------------------------------------------------------------
  // getProductMetrics()
  // -------------------------------------------------------------------

  describe('getProductMetrics()', () => {
    it('returns top sellers + low-stock list', async () => {
      prisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { quantity: 100 } },
        { productId: 'p2', _sum: { quantity: 80 } },
      ]);
      prisma.inventory.findMany.mockResolvedValue([
        { productId: 'p9', quantity: 3, lowStockThreshold: 10 },
      ]);

      const result = await service.getProductMetrics(
        { period: 'month' } as any,
        testAuthUser,
      );

      expect(result).toHaveProperty('topSellers');
      expect(result).toHaveProperty('lowStock');
    });
  });

  // -------------------------------------------------------------------
  // getAIMetrics()
  // -------------------------------------------------------------------

  describe('getAIMetrics()', () => {
    it('returns AI conversation + tool-call metrics', async () => {
      prisma.conversation.count.mockResolvedValue(200);
      prisma.message.count.mockResolvedValue(1500);
      prisma.analyticsEvent.count.mockResolvedValue(75);
      prisma.analyticsEvent.aggregate.mockResolvedValue({
        _avg: { duration: 1500 },
      });

      const result = await service.getAIMetrics(
        { period: 'month' } as any,
        testAuthUser,
      );

      expect(result).toHaveProperty('totalConversations');
      expect(result).toHaveProperty('totalMessages');
      expect(result).toHaveProperty('toolCalls');
      expect(result).toHaveProperty('averageResponseMs');
    });
  });

  // -------------------------------------------------------------------
  // getVoiceMetrics()
  // -------------------------------------------------------------------

  describe('getVoiceMetrics()', () => {
    it('returns voice call metrics', async () => {
      prisma.voiceSession.count.mockResolvedValue(30);
      prisma.voiceSession.aggregate.mockResolvedValue({
        _sum: { durationSeconds: 5400, cost: 12.5 },
        _avg: { durationSeconds: 180 },
      });
      prisma.voiceSession.groupBy.mockResolvedValue([
        { status: 'completed', _count: { _all: 25 } },
        { status: 'missed', _count: { _all: 5 } },
      ]);

      const result = await service.getVoiceMetrics(
        { period: 'month' } as any,
        testAuthUser,
      );

      expect(result).toHaveProperty('totalCalls');
      expect(result).toHaveProperty('totalDurationSeconds');
      expect(result).toHaveProperty('totalCost');
      expect(result).toHaveProperty('averageDurationSeconds');
      expect(result).toHaveProperty('byOutcome');
    });
  });

  // -------------------------------------------------------------------
  // getWhatsAppMetrics()
  // -------------------------------------------------------------------

  describe('getWhatsAppMetrics()', () => {
    it('returns WhatsApp messaging metrics', async () => {
      prisma.whatsappMessage.count.mockResolvedValue(80);
      prisma.whatsappMessage.aggregate.mockResolvedValue({
        _avg: { id: 1 }, // mock — real impl computes response time
      });
      prisma.whatsappMessage.groupBy.mockResolvedValue([
        { direction: 'inbound', _count: { _all: 40 } },
        { direction: 'outbound', _count: { _all: 40 } },
      ]);

      const result = await service.getWhatsAppMetrics(
        { period: 'month' } as any,
        testAuthUser,
      );

      expect(result).toHaveProperty('totalMessages');
      expect(result).toHaveProperty('byDirection');
    });
  });

  // -------------------------------------------------------------------
  // getKnowledgeMetrics()
  // -------------------------------------------------------------------

  describe('getKnowledgeMetrics()', () => {
    it('returns knowledge base metrics', async () => {
      prisma.ragQuery.count.mockResolvedValue(120);
      prisma.ragDocument.count.mockResolvedValue(50);
      prisma.ragChunk.count.mockResolvedValue(500);

      const result = await service.getKnowledgeMetrics(
        { period: 'month' } as any,
        testAuthUser,
      );

      expect(result).toHaveProperty('totalQueries');
      expect(result).toHaveProperty('totalDocuments');
      expect(result).toHaveProperty('totalChunks');
    });
  });

  // -------------------------------------------------------------------
  // recordEvent()
  // -------------------------------------------------------------------

  describe('recordEvent()', () => {
    it('persists an analytics_event row', async () => {
      prisma.analyticsEvent.create.mockResolvedValue({});

      await service.recordEvent(
        {
          eventType: 'page_view',
          eventData: { page: '/products' },
        } as any,
        testAuthUser,
      );

      const createArg = prisma.analyticsEvent.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
      expect(createArg.data.eventType).toBe('page_view');
    });
  });

  // -------------------------------------------------------------------
  // Custom Metric CRUD
  // -------------------------------------------------------------------

  describe('getMetrics()', () => {
    it('returns paginated custom metrics', async () => {
      prisma.metric.findMany.mockResolvedValue([
        { id: 'm1', name: 'Activation Rate', unit: 'PERCENTAGE' },
      ]);
      prisma.metric.count.mockResolvedValue(1);

      const result = await service.getMetrics({ page: 1, limit: 20 }, testAuthUser);

      expect(result.data).toHaveLength(1);
      const whereArg = prisma.metric.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });
  });

  describe('createMetric()', () => {
    it('creates a custom metric', async () => {
      prisma.metric.findFirst.mockResolvedValue(null);
      prisma.metric.create.mockResolvedValue({
        id: 'm1',
        name: 'Activation Rate',
      });

      const result = await service.createMetric(
        { name: 'Activation Rate', unit: 'PERCENTAGE', description: 'x' } as any,
        testAuthUser,
      );

      expect(result.id).toBe('m1');
      const createArg = prisma.metric.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
    });
  });

  describe('recordMetricValue()', () => {
    it('records a value for a custom metric', async () => {
      prisma.metric.findUnique.mockResolvedValue({
        id: 'm1',
        tenantId: testTenant.id,
      });
      prisma.metricValue.create.mockResolvedValue({});

      await service.recordMetricValue(
        'm1',
        { value: 0.75, recordedAt: '2025-06-01T00:00:00Z' } as any,
        testAuthUser,
      );

      expect(prisma.metricValue.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when the metric does not exist', async () => {
      prisma.metric.findUnique.mockResolvedValue(null);

      await expect(
        service.recordMetricValue(
          'ghost',
          { value: 0.75 } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

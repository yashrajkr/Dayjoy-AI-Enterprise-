import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { SalesMetricsDto, CustomerMetricsDto, ProductMetricsDto } from './dto/sales-metrics.dto';
import { VoiceMetricsDto, WhatsAppMetricsDto } from './dto/channel-metrics.dto';
import { AiMetricsDto } from './dto/ai-metrics.dto';
import { KnowledgeMetricsDto } from './dto/knowledge-metrics.dto';
import { RecordEventDto } from './dto/record-event.dto';
import { CreateMetricDto, MetricType, MetricUnit, RecordMetricValueDto } from './dto/metric.dto';
import { AuthUser } from '../ai/auth-user';

/**
 * Helper — extends the shared mock with the additional Prisma models
 * AnalyticsService touches. Done inline so we don't have to modify the
 * shared `_shared/testing/mock-prisma.service.ts` (off-limits per the
 * task scope).
 */
function createAnalyticsMockPrisma() {
  const mock = createMockPrismaService();
  // Extend the shared mock with the additional Prisma models + methods
  // that `AnalyticsService` uses. Done inline so we don't have to
  // modify the shared `_shared/testing/mock-prisma.service.ts` (which
  // is off-limits per the task scope).
  Object.assign(mock.conversation, {
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn().mockResolvedValue([]),
  });
  Object.assign(mock.message, {
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({
      _sum: { tokensUsed: 0 },
      _avg: { tokensUsed: 0 },
    }),
  });
  Object.assign(mock.order, {
    aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0 }, _avg: { total: 0 } }),
    groupBy: vi.fn().mockResolvedValue([]),
  });
  Object.assign(mock.orderItem, {
    groupBy: vi.fn().mockResolvedValue([]),
  });
  Object.assign(mock.product, {
    groupBy: vi.fn().mockResolvedValue([]),
  });
  Object.assign(mock.ragQuery, {
    aggregate: vi.fn().mockResolvedValue({
      _avg: { latencyMs: 0, confidence: 0 },
      _max: { latencyMs: 0 },
    }),
    groupBy: vi.fn().mockResolvedValue([]),
  });
  Object.assign(mock, {
    tenant: {
      count: vi.fn().mockResolvedValue(3),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    employee: { count: vi.fn().mockResolvedValue(0) },
    userSession: { count: vi.fn().mockResolvedValue(0) },
    voiceSession: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { durationSeconds: 0 }, _avg: { durationSeconds: 0 } }),
    },
    voiceAnalytics: {
      groupBy: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _avg: { sentimentScore: null, customerSatisfaction: null } }),
    },
    whatsappMessage: {
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    analyticsEvent: {
      create: vi.fn().mockResolvedValue({ id: 'e1' }),
      count: vi.fn().mockResolvedValue(0),
    },
    metric: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'm1' }),
      count: vi.fn().mockResolvedValue(0),
    },
    metricValue: { create: vi.fn().mockResolvedValue({ id: 'mv1' }) },
    accessLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  });
  return mock as ReturnType<typeof createMockPrismaService> & {
    tenant: any;
    employee: any;
    userSession: any;
    voiceSession: any;
    voiceAnalytics: any;
    whatsappMessage: any;
    analyticsEvent: any;
    metric: any;
    metricValue: any;
    accessLog: any;
    $queryRaw: any;
  };
}

/**
 * AnalyticsService unit tests.
 *
 * Covers:
 *  - getDashboard (10-way Promise.all aggregating every domain)
 *  - getSalesMetrics (order count + revenue + timeseries raw SQL)
 *  - getCustomerMetrics (new/active/churn + churn rate)
 *  - getProductMetrics (top products + low stock + category dist)
 *  - getAIMetrics (conversations + messages + tokens + tool usage)
 *  - getVoiceMetrics (call count + duration + outcome dist + CSAT)
 *  - getWhatsAppMetrics (message count + response rate)
 *  - getKnowledgeMetrics (queries + latency + confidence + feedback)
 *  - recordEvent (event persisted with tenantId from currentUser)
 *  - getMetrics (paginated + filtered)
 *  - createMetric (metric persisted with tenantId)
 *  - recordMetricValue (404 when metric not in tenant + happy path)
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;
  // `prisma` is typed `any` because the analytics mock is heavily
  // extended at runtime (`conversation.count`, `message.aggregate`,
  // `tenant`, `voiceSession`, `whatsappMessage`, `analyticsEvent`,
  // `metric`, `metricValue`, etc. — none are on the static mock type).
  let prisma: any;
  const user: AuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createAnalyticsMockPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AnalyticsService);
  });

  describe('getDashboard', () => {
    it('aggregates headline counts across all domains', async () => {
      // Mock every counter the dashboard queries — the shared mock
      // returns `undefined` by default, which would surface as `NaN`
      // in the aggregated totals.
      prisma.user.count.mockResolvedValue(0);
      prisma.customer.count.mockResolvedValue(0);
      prisma.order.count.mockResolvedValue(0);
      prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 } });
      prisma.lead.count.mockResolvedValue(0);
      prisma.conversation.count.mockResolvedValue(0);
      prisma.voiceSession.count.mockResolvedValue(0);
      prisma.whatsappMessage.count.mockResolvedValue(0);
      prisma.product.count.mockResolvedValue(0);
      prisma.aiAgent.count.mockResolvedValue(0);

      const result = await service.getDashboard(user);

      expect(result.totals).toBeDefined();
      expect(result.totals.users).toBe(0);
      expect(result.activity).toBeDefined();
      expect(prisma.user.count).toHaveBeenCalled();
      expect(prisma.customer.count).toHaveBeenCalled();
      expect(prisma.order.count).toHaveBeenCalled();
      expect(prisma.lead.count).toHaveBeenCalled();
      expect(prisma.conversation.count).toHaveBeenCalled();
      expect(prisma.voiceSession.count).toHaveBeenCalled();
      expect(prisma.whatsappMessage.count).toHaveBeenCalled();
      expect(prisma.product.count).toHaveBeenCalled();
      expect(prisma.aiAgent.count).toHaveBeenCalled();
    });
  });

  describe('getSalesMetrics', () => {
    it('returns order count + revenue + avg order value', async () => {
      prisma.order.count.mockResolvedValue(10);
      prisma.order.aggregate.mockResolvedValue({
        _sum: { total: 1000 },
        _avg: { total: 100 },
      });
      prisma.order.groupBy.mockResolvedValue([
        { status: 'COMPLETED', _count: { id: 8 }, _sum: { total: 800 } },
      ]);

      const query: SalesMetricsDto = { days: 30 };
      const result = await service.getSalesMetrics(query, user);

      expect(result.orderCount).toBe(10);
      expect(result.totalRevenue).toBe(1000);
      expect(result.avgOrderValue).toBe(100);
      expect(result.ordersByStatus).toHaveLength(1);
      expect(result.ordersByStatus[0]).toEqual({
        status: 'COMPLETED',
        count: 8,
        revenue: 800,
      });
    });
  });

  describe('getCustomerMetrics', () => {
    it('computes churn rate from total + churned customers', async () => {
      prisma.customer.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(20) // new
        .mockResolvedValueOnce(50); // active
      prisma.$queryRaw.mockResolvedValue([{ count: 10 }]);

      const query: CustomerMetricsDto = { days: 30 };
      const result = await service.getCustomerMetrics(query, user);

      expect(result.totalCustomers).toBe(100);
      expect(result.newCustomers).toBe(20);
      expect(result.activeCustomers).toBe(50);
      expect(result.churnedCustomers).toBe(10);
      expect(result.churnRate).toBe(10); // 10 / 100 * 100
    });

    it('returns 0 churn rate when there are no customers', async () => {
      prisma.customer.count.mockResolvedValue(0);
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getCustomerMetrics({}, user);
      expect(result.churnRate).toBe(0);
    });
  });

  describe('getProductMetrics', () => {
    it('hydrates top products with names + returns low stock + categories', async () => {
      prisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { quantity: 50 } },
      ]);
      // `Promise.all` calls `product.findMany` for LOW STOCK first, then
      // after Promise.all resolves the service calls it AGAIN for the
      // top-product hydration. Mock them in call-order.
      prisma.product.findMany
        .mockResolvedValueOnce([{ id: 'p2', name: 'Low', sku: 'L1', inventoryCount: 3 }]) // 1st: low stock (inside Promise.all)
        .mockResolvedValueOnce([{ id: 'p1', name: 'Widget', sku: 'W1', price: 9.99 }]);   // 2nd: top-product hydration
      prisma.product.groupBy.mockResolvedValue([
        { categoryId: 'c1', _count: { id: 5 } },
      ]);

      const query: ProductMetricsDto = { days: 30, limit: 5 };
      const result = await service.getProductMetrics(query, user);

      expect(result.topProducts).toHaveLength(1);
      expect(result.topProducts[0].product.name).toBe('Widget');
      expect(result.topProducts[0].quantitySold).toBe(50);
      expect(result.lowStock).toHaveLength(1);
      expect(result.categoryDistribution).toHaveLength(1);
    });
  });

  describe('getAIMetrics', () => {
    it('aggregates conversations, messages, tokens, and tool usage', async () => {
      prisma.conversation.count.mockResolvedValue(25);
      prisma.conversation.groupBy.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(120);
      prisma.message.aggregate.mockResolvedValue({
        _sum: { tokensUsed: 5000 },
        _avg: { tokensUsed: 50 },
      });
      prisma.analyticsEvent.count.mockResolvedValue(40);

      const result = await service.getAIMetrics({} as AiMetricsDto, user);

      expect(result.totalConversations).toBe(25);
      expect(result.totalMessages).toBe(120);
      expect(result.tokensUsed).toBe(5000);
      expect(result.toolExecutions).toBe(40);
    });
  });

  describe('getVoiceMetrics', () => {
    it('aggregates call count + duration + sentiment + CSAT', async () => {
      prisma.voiceSession.count.mockResolvedValue(50);
      prisma.voiceSession.aggregate.mockResolvedValue({
        _sum: { durationSeconds: 6000 },
        _avg: { durationSeconds: 120 },
      });
      prisma.voiceAnalytics.groupBy.mockResolvedValue([
        { outcome: 'COMPLETED', _count: { id: 40 } },
      ]);
      prisma.voiceAnalytics.aggregate
        .mockResolvedValueOnce({ _avg: { sentimentScore: 0.3 } })
        .mockResolvedValueOnce({ _avg: { customerSatisfaction: 4.2 } });

      const result = await service.getVoiceMetrics({} as VoiceMetricsDto, user);

      expect(result.callCount).toBe(50);
      expect(result.totalDurationSeconds).toBe(6000);
      expect(result.avgDurationSeconds).toBe(120);
      expect(result.avgSentiment).toBe(0.3);
      expect(result.avgCsat).toBe(4.2);
    });
  });

  describe('getWhatsAppMetrics', () => {
    it('computes response rate from inbound + outbound counts', async () => {
      prisma.whatsappMessage.count.mockResolvedValue(100);
      prisma.whatsappMessage.groupBy.mockResolvedValue([
        { direction: 'inbound', _count: { id: 60 } },
        { direction: 'outbound', _count: { id: 40 } },
      ]);

      const result = await service.getWhatsAppMetrics(
        {} as WhatsAppMetricsDto,
        user,
      );

      expect(result.totalMessages).toBe(100);
      // response rate = outbound / inbound * 100 = 40/60 * 100 ≈ 66.67
      expect(result.responseRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('getKnowledgeMetrics', () => {
    it('aggregates queries + latency + confidence + feedback', async () => {
      prisma.ragQuery.count.mockResolvedValue(200);
      prisma.ragQuery.aggregate
        .mockResolvedValueOnce({ _avg: { latencyMs: 250 }, _max: { latencyMs: 1500 } })
        .mockResolvedValueOnce({ _avg: { confidence: 0.85 } });
      prisma.ragQuery.groupBy.mockResolvedValue([
        { feedback: 'positive', _count: { id: 150 } },
        { feedback: 'negative', _count: { id: 50 } },
      ]);

      const result = await service.getKnowledgeMetrics(
        {} as KnowledgeMetricsDto,
        user,
      );

      expect(result.totalQueries).toBe(200);
      expect(result.avgLatencyMs).toBe(250);
      expect(result.avgConfidence).toBe(0.85);
      expect(result.feedback).toHaveLength(2);
    });
  });

  describe('recordEvent', () => {
    it('persists an event with tenantId from currentUser', async () => {
      const dto: RecordEventDto = {
        eventType: 'page_view',
        eventData: { url: '/home' },
      };
      const result = await service.recordEvent(dto, user);

      expect(result.id).toBe('e1');
      const call = prisma.analyticsEvent.create.mock.calls[0][0];
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.userId).toBe('u1');
      expect(call.data.eventType).toBe('page_view');
      expect(call.data.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('getMetrics', () => {
    it('paginates + filters by category/status', async () => {
      prisma.metric.findMany.mockResolvedValue([{ id: 'm1' }]);
      prisma.metric.count.mockResolvedValue(1);

      const result = await service.getMetrics(
        { page: 1, limit: 10, category: 'sales', status: 'active' },
        user,
      );

      expect(result.data).toHaveLength(1);
      const where = prisma.metric.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(where.category).toBe('sales');
      expect(where.status).toBe('active');
    });
  });

  describe('createMetric', () => {
    it('persists a metric with refreshInterval default of 300s', async () => {
      const dto: CreateMetricDto = {
        name: 'Daily Revenue',
        type: MetricType.SUM,
        unit: MetricUnit.CURRENCY,
        query: 'SELECT SUM(total) FROM orders',
      };
      const result = await service.createMetric(dto, user);

      expect(result.id).toBe('m1');
      const call = prisma.metric.create.mock.calls[0][0];
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.refreshInterval).toBe(300);
      expect(call.data.status).toBe('active');
    });
  });

  describe('recordMetricValue', () => {
    it('throws NotFoundException when the metric is not in the tenant', async () => {
      prisma.metric.findUnique.mockResolvedValue(null);
      await expect(
        service.recordMetricValue('missing', {} as RecordMetricValueDto, user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('persists a value with the current timestamp when none is supplied', async () => {
      prisma.metric.findUnique.mockResolvedValue({ id: 'm1', tenantId: 't1' });
      const dto: RecordMetricValueDto = { value: 42 };
      const result = await service.recordMetricValue('m1', dto, user);

      expect(result.id).toBe('mv1');
      const call = prisma.metricValue.create.mock.calls[0][0];
      expect(call.data.value).toBe(42);
      expect(call.data.timestamp).toBeInstanceOf(Date);
    });
  });
});

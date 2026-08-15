import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { AuthUser } from '../ai/auth-user';
import { AiMetricsDto } from './dto/ai-metrics.dto';
import { KnowledgeMetricsDto } from './dto/knowledge-metrics.dto';
import {
  SalesMetricsDto,
  CustomerMetricsDto,
  ProductMetricsDto,
  PeriodGranularity,
} from './dto/sales-metrics.dto';
import { VoiceMetricsDto, WhatsAppMetricsDto } from './dto/channel-metrics.dto';
import { RecordEventDto } from './dto/record-event.dto';
import {
  CreateMetricDto,
  RecordMetricValueDto,
  QueryMetricsDto,
} from './dto/metric.dto';

/**
 * Analytics service.
 *
 * Aggregates metrics across all of Dayjoy's domains — sales, customers,
 * products, AI conversations, voice calls, WhatsApp messages, and the
 * knowledge base — for the dashboard, the analytics admin panel, and
 * downstream reporting.
 *
 * Every method is tenant-scoped via `user.tenantId` — there is no global
 * cross-tenant aggregation at this layer (super-admin stats live in
 * `AdminService.getSystemStats()`).
 *
 * The service also owns the custom `Metric` / `MetricValue` tables —
 * these let tenants define their own KPIs (e.g. "distributor activation
 * rate") backed by a SQL query that the metric-refresh job runs on a
 * schedule.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Dashboard — single aggregate endpoint
  // ---------------------------------------------------------------------

  /**
   * Top-level dashboard for the current tenant. Returns headline counts
   * for every domain in a single round-trip — the frontend renders this
   * as the landing page after login.
   *
   * Window: last 30 days for activity counts, all-time for totals.
   */
  async getDashboard(user: AuthUser) {
    const tenantId = user.tenantId!;
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);

    const [
      totalUsers,
      totalCustomers,
      totalOrders,
      totalRevenue,
      totalLeads,
      activeConversations,
      voiceCalls,
      whatsappMessages,
      totalProducts,
      activeAgents,
    ] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.customer.count({ where: { tenantId } }),
      this.prisma.order.count({ where: { tenantId } }),
      this.prisma.order.aggregate({
        where: { tenantId },
        _sum: { total: true },
      }),
      this.prisma.lead.count({ where: { tenantId } }),
      this.prisma.conversation.count({
        where: { tenantId, status: 'active' },
      }),
      this.prisma.voiceSession.count({
        where: { tenantId, startedAt: { gte: since30 } },
      }),
      this.prisma.whatsappMessage.count({
        where: { tenantId, createdAt: { gte: since30 } },
      }),
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.aiAgent.count({
        where: { tenantId, status: 'active' },
      }),
    ]);

    return {
      totals: {
        users: totalUsers,
        customers: totalCustomers,
        orders: totalOrders,
        revenue: totalRevenue._sum.total ?? 0,
        leads: totalLeads,
        products: totalProducts,
        activeAgents,
      },
      activity: {
        activeConversations,
        voiceCallsLast30Days: voiceCalls,
        whatsappMessagesLast30Days: whatsappMessages,
      },
    };
  }

  // ---------------------------------------------------------------------
  // Domain metrics
  // ---------------------------------------------------------------------

  /**
   * Sales metrics: revenue, order count, average order value, broken
   * down by day / week / month.
   *
   * The time-series breakdown uses raw SQL with Postgres `date_trunc`
   * so the granularity is computed server-side rather than in JS.
   */
  async getSalesMetrics(query: SalesMetricsDto, user: AuthUser) {
    const tenantId = user.tenantId!;
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const period = query.period ?? PeriodGranularity.DAY;

    const where: any = { tenantId, createdAt: { gte: since } };
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
    if (query.distributorId) where.distributorId = query.distributorId;

    const [orderCount, revenueAgg, ordersByStatus] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where,
        _sum: { total: true },
        _avg: { total: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: { total: true },
      }),
    ]);

    // Time-series via raw SQL date_trunc. Returns rows of
    // { period, orderCount, revenue }.
    let timeseries: any[] = [];
    try {
      timeseries = await this.prisma.$queryRaw`
        SELECT
          date_trunc(${period}, created_at) AS period,
          COUNT(*)::int AS "orderCount",
          COALESCE(SUM(total), 0)::float AS revenue
        FROM orders
        WHERE tenant_id = ${tenantId}
          AND created_at >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `;
    } catch (err) {
      this.logger.debug(
        `Sales timeseries query failed: ${(err as Error).message}`,
      );
    }

    const totalRevenue = revenueAgg._sum.total ?? 0;
    const avgOrderValue = revenueAgg._avg.total ?? 0;

    return {
      orderCount,
      totalRevenue,
      avgOrderValue,
      ordersByStatus: ordersByStatus.map((s: { status: string; _count: { id: number }; _sum: { total: number | null } }) => ({
        status: s.status,
        count: s._count.id,
        revenue: s._sum.total ?? 0,
      })),
      timeseries,
      periodDays: days,
    };
  }

  /**
   * Customer metrics: new customers, active customers (placed an order
   * in the window), churn rate (customers whose last order was > 90
   * days ago), LTV distribution by quartile.
   */
  async getCustomerMetrics(query: CustomerMetricsDto, user: AuthUser) {
    const tenantId = user.tenantId!;
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totalCustomers, newCustomers, activeCustomers] = await Promise.all([
      this.prisma.customer.count({ where: { tenantId } }),
      this.prisma.customer.count({
        where: { tenantId, createdAt: { gte: since } },
      }),
      this.prisma.customer.count({
        where: {
          tenantId,
          orders: { some: { createdAt: { gte: since } } },
        },
      }),
    ]);

    // Churn: customers whose last order is > 90 days ago (and who have
    // at least one historical order).
    const churnCutoff = new Date();
    churnCutoff.setDate(churnCutoff.getDate() - 90);
    let churnedCustomers = 0;
    try {
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT COUNT(DISTINCT c.id)::int AS count
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
        WHERE c.tenant_id = ${tenantId}
        GROUP BY c.id
        HAVING MAX(o.created_at) < ${churnCutoff}
      `;
      churnedCustomers = rows[0]?.count ?? 0;
    } catch (err) {
      this.logger.debug(
        `Customer churn query failed: ${(err as Error).message}`,
      );
    }

    const churnRate =
      totalCustomers > 0 ? (churnedCustomers / totalCustomers) * 100 : 0;

    return {
      totalCustomers,
      newCustomers,
      activeCustomers,
      churnedCustomers,
      churnRate: Number(churnRate.toFixed(2)),
      periodDays: days,
    };
  }

  /**
   * Product metrics: top products by order count, low-stock products,
   * category distribution.
   */
  async getProductMetrics(query: ProductMetricsDto, user: AuthUser) {
    const tenantId = user.tenantId!;
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const limit = query.limit ?? 10;

    const where: any = { tenantId };
    if (query.categoryId) where.categoryId = query.categoryId;

    const [topProductsAgg, lowStock, categoryAgg] = await Promise.all([
      // Top products by order-item quantity in the window.
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: { tenantId, createdAt: { gte: since } },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: limit,
      }),
      // Low-stock products (inventoryCount < 10).
      this.prisma.product.findMany({
        where: { tenantId, inventoryCount: { lt: 10 } },
        select: {
          id: true,
          name: true,
          sku: true,
          inventoryCount: true,
        },
        take: limit,
        orderBy: { inventoryCount: 'asc' },
      }),
      // Category distribution.
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { tenantId },
        _count: { id: true },
      }),
    ]);

    // Hydrate top products with product names.
    const topProductIds = topProductsAgg.map((t: { productId: string }) => t.productId);
    const products = topProductIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, name: true, sku: true, price: true },
        })
      : [];
    const productMap = new Map(
      products.map((p: { id: string; name?: string; sku: string; price: number }) => [
        p.id,
        p,
      ]),
    );

    return {
      topProducts: topProductsAgg.map((t: { productId: string; _sum: { quantity: number | null } }) => ({
        product: productMap.get(t.productId) ?? { id: t.productId },
        quantitySold: t._sum.quantity ?? 0,
      })),
      lowStock,
      categoryDistribution: categoryAgg.map((c: { categoryId: string | null; _count: { id: number } }) => ({
        categoryId: c.categoryId,
        productCount: c._count.id,
      })),
      periodDays: days,
    };
  }

  /**
   * AI metrics: conversations, messages, tokens used, average response
   * time, tool usage. Filters by `agentId` and `channel` when supplied.
   */
  async getAIMetrics(query: AiMetricsDto, user: AuthUser) {
    const tenantId = user.tenantId!;
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const convWhere: any = { tenantId, startedAt: { gte: since } };
    if (query.agentId) convWhere.agentId = query.agentId;
    if (query.channel) convWhere.channel = query.channel;

    const [
      totalConversations,
      conversationsByAgent,
      conversationsByChannel,
      totalMessages,
      tokensAgg,
      toolExecutions,
    ] = await Promise.all([
      this.prisma.conversation.count({ where: convWhere }),
      this.prisma.conversation.groupBy({
        by: ['agentId'],
        where: convWhere,
        _count: { id: true },
      }),
      this.prisma.conversation.groupBy({
        by: ['channel'],
        where: convWhere,
        _count: { id: true },
      }),
      this.prisma.message.count({
        where: { tenantId, conversation: convWhere },
      }),
      this.prisma.message.aggregate({
        where: { tenantId, conversation: convWhere, tokensUsed: { not: null } },
        _sum: { tokensUsed: true },
        _avg: { tokensUsed: true },
      }),
      this.prisma.analyticsEvent.count({
        where: {
          tenantId,
          eventType: 'tool_execution',
          timestamp: { gte: since },
        },
      }),
    ]);

    return {
      totalConversations,
      conversationsByAgent: conversationsByAgent.map((a: { agentId: string; _count: { id: number } }) => ({
        agentId: a.agentId,
        count: a._count.id,
      })),
      conversationsByChannel: conversationsByChannel.map((c: { channel: string; _count: { id: number } }) => ({
        channel: c.channel,
        count: c._count.id,
      })),
      totalMessages,
      tokensUsed: tokensAgg._sum.tokensUsed ?? 0,
      avgTokensPerMessage: tokensAgg._avg.tokensUsed ?? 0,
      toolExecutions,
      periodDays: days,
    };
  }

  /**
   * Voice metrics: call count, total/average duration, outcome
   * distribution, sentiment score, CSAT.
   */
  async getVoiceMetrics(query: VoiceMetricsDto, user: AuthUser) {
    const tenantId = user.tenantId!;
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sessionWhere: any = { tenantId, startedAt: { gte: since } };
    if (query.outcome) {
      sessionWhere.analytics = { outcome: query.outcome as any };
    }

    const [callCount, durationAgg, outcomeAgg, sentimentAgg, csatAgg] =
      await Promise.all([
        this.prisma.voiceSession.count({ where: sessionWhere }),
        this.prisma.voiceSession.aggregate({
          where: {
            ...sessionWhere,
            durationSeconds: { not: null },
          },
          _sum: { durationSeconds: true },
          _avg: { durationSeconds: true },
        }),
        this.prisma.voiceAnalytics.groupBy({
          by: ['outcome'],
          where: {
            session: { tenantId, startedAt: { gte: since } },
          },
          _count: { id: true },
        }),
        this.prisma.voiceAnalytics.aggregate({
          where: {
            session: { tenantId, startedAt: { gte: since } },
            sentimentScore: { not: null },
          },
          _avg: { sentimentScore: true },
        }),
        this.prisma.voiceAnalytics.aggregate({
          where: {
            session: { tenantId, startedAt: { gte: since } },
            customerSatisfaction: { not: null },
          },
          _avg: { customerSatisfaction: true },
        }),
      ]);

    return {
      callCount,
      totalDurationSeconds: durationAgg._sum.durationSeconds ?? 0,
      avgDurationSeconds: durationAgg._avg.durationSeconds ?? 0,
      outcomeDistribution: outcomeAgg.map((o: { outcome: string | null; _count: { id: number } }) => ({
        outcome: o.outcome,
        count: o._count.id,
      })),
      avgSentiment: sentimentAgg._avg.sentimentScore ?? null,
      avgCsat: csatAgg._avg.customerSatisfaction ?? null,
      periodDays: days,
    };
  }

  /**
   * WhatsApp metrics: message count, direction split, response rate
   * (share of inbound messages that received an outbound reply within
   * 5 minutes — computed as a simple ratio for now).
   */
  async getWhatsAppMetrics(query: WhatsAppMetricsDto, user: AuthUser) {
    const tenantId = user.tenantId!;
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = { tenantId, createdAt: { gte: since } };
    if (query.contactId) where.contactId = query.contactId;
    if (query.direction) where.direction = query.direction;

    const [totalMessages, directionAgg] = await Promise.all([
      this.prisma.whatsappMessage.count({ where }),
      this.prisma.whatsappMessage.groupBy({
        by: ['direction'],
        where,
        _count: { id: true },
      }),
    ]);

    const inbound =
      directionAgg.find((d: { direction: string; _count: { id: number } }) => d.direction === 'inbound')?._count.id ?? 0;
    const outbound =
      directionAgg.find((d: { direction: string; _count: { id: number } }) => d.direction === 'outbound')?._count.id ?? 0;
    const responseRate = inbound > 0 ? (outbound / inbound) * 100 : 0;

    return {
      totalMessages,
      directionBreakdown: directionAgg.map((d: { direction: string; _count: { id: number } }) => ({
        direction: d.direction,
        count: d._count.id,
      })),
      responseRate: Number(responseRate.toFixed(2)),
      periodDays: days,
    };
  }

  /**
   * Knowledge-base metrics: query count, average latency, average
   * confidence, feedback (positive/negative ratio).
   */
  async getKnowledgeMetrics(query: KnowledgeMetricsDto, user: AuthUser) {
    const tenantId = user.tenantId!;
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = { tenantId, createdAt: { gte: since } };
    if (query.agentId) where.agentId = query.agentId;

    const [totalQueries, latencyAgg, confidenceAgg, feedbackAgg] =
      await Promise.all([
        this.prisma.ragQuery.count({ where }),
        this.prisma.ragQuery.aggregate({
          where: { ...where, latencyMs: { not: null } },
          _avg: { latencyMs: true },
          _max: { latencyMs: true },
        }),
        this.prisma.ragQuery.aggregate({
          where: { ...where, confidence: { not: null } },
          _avg: { confidence: true },
        }),
        this.prisma.ragQuery.groupBy({
          by: ['feedback'],
          where,
          _count: { id: true },
        }),
      ]);

    return {
      totalQueries,
      avgLatencyMs: latencyAgg._avg.latencyMs ?? 0,
      maxLatencyMs: latencyAgg._max.latencyMs ?? 0,
      avgConfidence: confidenceAgg._avg.confidence ?? 0,
      feedback: feedbackAgg.map((f: { feedback: string | null; _count: { id: number } }) => ({
        feedback: f.feedback,
        count: f._count.id,
      })),
      periodDays: days,
    };
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  async recordEvent(dto: RecordEventDto, user: AuthUser) {
    return this.prisma.analyticsEvent.create({
      data: {
        tenantId: user.tenantId!,
        userId: user.userId,
        customerId: dto.customerId,
        sessionId: dto.sessionId,
        eventType: dto.eventType,
        eventData: dto.eventData,
        metadata: dto.metadata,
        timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------
  // Custom metrics
  // ---------------------------------------------------------------------

  async getMetrics(query: QueryMetricsDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;

    const [metrics, total] = await Promise.all([
      this.prisma.metric.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          values: {
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.metric.count({ where }),
    ]);

    return {
      data: metrics,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createMetric(dto: CreateMetricDto, user: AuthUser) {
    return this.prisma.metric.create({
      data: {
        tenantId: user.tenantId!,
        name: dto.name,
        description: dto.description,
        type: dto.type as any,
        unit: dto.unit as any,
        category: dto.category,
        query: dto.query,
        refreshInterval: dto.refreshInterval ?? 300,
        status: dto.status ?? 'active',
      },
    });
  }

  /**
   * Record a single value for a metric. Used by the metric-refresh job
   * and by manual entry from the admin UI.
   */
  async recordMetricValue(
    metricId: string,
    dto: RecordMetricValueDto,
    user: AuthUser,
  ) {
    const metric = await this.prisma.metric.findUnique({
      where: { id: metricId },
    });
    if (!metric || metric.tenantId !== user.tenantId) {
      throw new NotFoundException(`Metric ${metricId} not found`);
    }

    return this.prisma.metricValue.create({
      data: {
        tenantId: user.tenantId!,
        metricId: metric.id,
        value: dto.value,
        dimensions: dto.dimensions,
        timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      },
    });
  }
}

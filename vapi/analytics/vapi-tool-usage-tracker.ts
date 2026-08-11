import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';

export interface VapiToolStat {
  toolName: string;
  executions: number;
  successful: number;
  failed: number;
  successRate: number; // 0-1
  avgLatencyMs: number;
}

export interface VapiToolUsageOverview {
  totalExecutions: number;
  totalSuccessful: number;
  totalFailed: number;
  overallSuccessRate: number; // 0-1
  perTool: VapiToolStat[];
  failingTools: VapiToolStat[]; // tools with successRate < 0.8
}

/**
 * Vapi Tool Usage Tracker.
 *
 * Tool executions are persisted by `VapiFunctionCallHandler` as
 * `AnalyticsEvent` rows with `eventType='tool_execution'` and the
 * execution details stored in the `eventData` JSON column. This
 * service provides the analytics queries that aggregate those rows
 * for the dashboard.
 *
 * Why `AnalyticsEvent` instead of a dedicated `tool_executions`
 * table? The existing schema (per Agent D's notes) deliberately
 * uses the generic `analytics_events` table for all tool-execution
 * telemetry to avoid table proliferation — the `eventData` JSON
 * column holds the tool-specific fields (toolName, arguments,
 * result, success, latencyMs, etc.).
 */
@Injectable()
export class VapiToolUsageTracker {
  private readonly logger = new Logger(VapiToolUsageTracker.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Per-tool aggregate stats for a tenant (optionally date-ranged).
   *
   * Returns one row per distinct tool name with execution count,
   * success count, and average latency.
   */
  async getToolStats(
    tenantId: string,
    dateRange?: { from: Date; to: Date },
  ): Promise<VapiToolStat[]> {
    const where: any = {
      tenantId,
      eventType: 'tool_execution',
    };
    if (dateRange) {
      where.timestamp = { gte: dateRange.from, lte: dateRange.to };
    }

    const events = await this.prisma.analyticsEvent.findMany({
      where,
      select: { eventData: true, timestamp: true },
    });

    const buckets = new Map<
      string,
      { total: number; success: number; latencySum: number }
    >();

    for (const e of events) {
      const data = (e.eventData as any) ?? {};
      const name: string = data.toolName ?? 'unknown';
      const success: boolean = data.success === true;
      const latency: number = typeof data.latencyMs === 'number' ? data.latencyMs : 0;
      const bucket = buckets.get(name) ?? { total: 0, success: 0, latencySum: 0 };
      bucket.total += 1;
      if (success) bucket.success += 1;
      bucket.latencySum += latency;
      buckets.set(name, bucket);
    }

    return Array.from(buckets.entries())
      .map(([toolName, b]) => ({
        toolName,
        executions: b.total,
        successful: b.success,
        failed: b.total - b.success,
        successRate: b.total > 0 ? b.success / b.total : 0,
        avgLatencyMs: b.total > 0 ? b.latencySum / b.total : 0,
      }))
      .sort((a, b) => b.executions - a.executions);
  }

  /**
   * Tenant-wide success rate across all tools. Used by the dashboard
   * health-status computation.
   */
  async getSuccessRate(tenantId: string): Promise<number> {
    const where = { tenantId, eventType: 'tool_execution' as const };
    const [total, successful] = await Promise.all([
      this.prisma.analyticsEvent.count({ where }),
      this.prisma.analyticsEvent.count({
        where: {
          ...where,
          // JSON-path filtering isn't portable across Prisma engines,
          // so we count the "success" subset client-side after fetch.
        },
      }),
    ]);
    if (total === 0) return 1;
    // Fetch only the success flag to keep the payload small.
    const events = await this.prisma.analyticsEvent.findMany({
      where,
      select: { eventData: true },
    });
    const successCount = events.filter(
      (e) => (e.eventData as any)?.success === true,
    ).length;
    return successCount / total;
  }

  /**
   * Top-N tools by execution count.
   */
  async getTopTools(
    tenantId: string,
    limit = 5,
    dateRange?: { from: Date; to: Date },
  ): Promise<VapiToolStat[]> {
    const stats = await this.getToolStats(tenantId, dateRange);
    return stats.slice(0, limit);
  }

  /**
   * Tools whose success rate is below a threshold (default 80%).
   * Used by the dashboard to surface degradations.
   */
  async getFailingTools(
    tenantId: string,
    threshold = 0.8,
  ): Promise<VapiToolStat[]> {
    const stats = await this.getToolStats(tenantId);
    return stats.filter((s) => s.executions > 0 && s.successRate < threshold);
  }

  /**
   * Overall stats object the dashboard renders directly.
   */
  async getOverview(
    tenantId: string,
    dateRange?: { from: Date; to: Date },
  ): Promise<VapiToolUsageOverview> {
    const perTool = await this.getToolStats(tenantId, dateRange);
    const totalExecutions = perTool.reduce((s, t) => s + t.executions, 0);
    const totalSuccessful = perTool.reduce((s, t) => s + t.successful, 0);
    const totalFailed = perTool.reduce((s, t) => s + t.failed, 0);
    return {
      totalExecutions,
      totalSuccessful,
      totalFailed,
      overallSuccessRate:
        totalExecutions > 0 ? totalSuccessful / totalExecutions : 1,
      perTool,
      failingTools: perTool.filter(
        (t) => t.executions > 0 && t.successRate < 0.8,
      ),
    };
  }

  /**
   * Recent tool executions for the dashboard's "latest tool calls"
   * widget. Sorted newest-first, paginated.
   */
  async getRecentExecutions(
    tenantId: string,
    limit = 20,
    offset = 0,
  ): Promise<any[]> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: { tenantId, eventType: 'tool_execution' },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        eventData: true,
        customerId: true,
        timestamp: true,
      },
    });
    return events.map((e) => ({
      id: e.id,
      ...(e.eventData as any),
      customerId: e.customerId,
      timestamp: e.timestamp,
    }));
  }

  /**
   * Export all tool executions for a tenant (CSV-friendly flat rows).
   */
  async exportExecutions(
    tenantId: string,
    dateRange?: { from: Date; to: Date },
  ): Promise<any[]> {
    const where: any = { tenantId, eventType: 'tool_execution' };
    if (dateRange) {
      where.timestamp = { gte: dateRange.from, lte: dateRange.to };
    }
    const events = await this.prisma.analyticsEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      select: { eventData: true, timestamp: true, customerId: true },
    });
    return events.map((e) => {
      const d = (e.eventData as any) ?? {};
      return {
        timestamp: e.timestamp,
        toolName: d.toolName ?? 'unknown',
        toolCallId: d.toolCallId ?? '',
        success: d.success === true,
        error: d.error ?? '',
        latencyMs: d.latencyMs ?? 0,
        callId: d.callId ?? '',
        sessionId: d.sessionId ?? '',
        conversationId: d.conversationId ?? '',
        customerId: e.customerId ?? '',
        arguments: JSON.stringify(d.arguments ?? {}),
      };
    });
  }
}

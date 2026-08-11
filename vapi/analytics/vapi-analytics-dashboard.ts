import { Injectable, Logger } from '@nestjs/common';
import { VapiCallLogger } from './vapi-call-logger';
import { VapiToolUsageTracker } from './vapi-tool-usage-tracker';
import { VapiAiMetrics } from './vapi-ai-metrics';

export interface VapiDashboardMetrics {
  calls: Awaited<ReturnType<VapiCallLogger['getCallStatistics']>>;
  tools: Awaited<ReturnType<VapiToolUsageTracker['getOverview']>>;
  ai: Awaited<ReturnType<VapiAiMetrics['getOverallStatistics']>>;
  health: VapiHealthStatus;
}

export interface VapiHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  metrics: {
    callSuccessRate: number;   // 0-1
    toolSuccessRate: number;   // 0-1
    aiAccuracy: number;        // 0-100
    hallucinationRate: number; // 0-1
    humanHandoffRate: number;  // 0-1
  };
}

export interface VapiPerformanceReport {
  date: Date;
  summary: {
    totalCalls: number;
    avgDurationSeconds: number;
    completionRate: number;  // 0-1
    escalationRate: number;  // 0-1
    humanHandoffRate: number;
  };
  tools: {
    totalExecutions: number;
    successRate: number;       // 0-1
    avgLatencyMs: number;
  };
  ai: {
    totalCalls: number;
    avgAccuracy: number;       // 0-100
    avgCSAT: number;           // 1-5
    hallucinationRate: number; // 0-1
  };
  recommendations: string[];
}

/**
 * Vapi Analytics Dashboard Service.
 *
 * Aggregates the per-subsystem stats (calls / tools / AI) into the
 * single composite payload the dashboard UI renders. Also computes
 * the overall health-status (healthy / degraded / unhealthy) from
 * the underlying metrics, and generates operational recommendations
 * ("tool success rate below 95%, investigate X").
 */
@Injectable()
export class VapiAnalyticsDashboard {
  private readonly logger = new Logger(VapiAnalyticsDashboard.name);

  constructor(
    private readonly callLogger: VapiCallLogger,
    private readonly toolTracker: VapiToolUsageTracker,
    private readonly aiMetrics: VapiAiMetrics,
  ) {}

  /**
   * The main dashboard payload — fetched by `GET /api/voice/analytics/dashboard`.
   */
  async getDashboardMetrics(
    tenantId: string,
    dateRange?: { from: Date; to: Date },
  ): Promise<VapiDashboardMetrics> {
    const [calls, tools, ai] = await Promise.all([
      this.callLogger.getCallStatistics(tenantId, dateRange),
      this.toolTracker.getOverview(tenantId, dateRange),
      this.aiMetrics.getOverallStatistics(tenantId, dateRange),
    ]);

    return {
      calls,
      tools,
      ai,
      health: this.getHealthStatus(calls, tools, ai),
    };
  }

  /**
   * Compute a single health-status string from the underlying metrics.
   * Used by the dashboard's status pill + by external monitors.
   *
   * Thresholds:
   *   - healthy   : call success >= 90%, tool success >= 95%, AI accuracy >= 80%, halluc <= 5%
   *   - degraded  : call success >= 70%, tool success >= 80%, AI accuracy >= 60%, halluc <= 15%
   *   - unhealthy : anything below degraded
   */
  getHealthStatus(
    callStats: Awaited<ReturnType<VapiCallLogger['getCallStatistics']>>,
    toolStats: Awaited<ReturnType<VapiToolUsageTracker['getOverview']>>,
    aiStats: Awaited<ReturnType<VapiAiMetrics['getOverallStatistics']>>,
  ): VapiHealthStatus {
    const issues: string[] = [];

    const totalCalls = callStats.totalCalls;
    const callSuccessRate =
      totalCalls > 0 ? callStats.completedCalls / totalCalls : 1;
    const toolSuccessRate = toolStats.overallSuccessRate;
    const aiAccuracy = aiStats.avgAccuracy; // 0-100
    const hallucinationRate = aiStats.hallucinationRate; // 0-1
    const humanHandoffRate = callStats.humanHandoffRate;

    let status: VapiHealthStatus['status'] = 'healthy';

    if (totalCalls > 0 && callSuccessRate < 0.9) {
      issues.push(
        `Call completion rate below 90%: ${(callSuccessRate * 100).toFixed(1)}%`,
      );
      status = 'degraded';
    }
    if (toolStats.totalExecutions > 0 && toolSuccessRate < 0.95) {
      issues.push(
        `Tool success rate below 95%: ${(toolSuccessRate * 100).toFixed(1)}%`,
      );
      status = 'degraded';
    }
    if (totalCalls > 0 && aiAccuracy < 80) {
      issues.push(`AI accuracy below 80%: ${aiAccuracy.toFixed(1)}%`);
      status = 'degraded';
    }
    if (totalCalls > 0 && hallucinationRate > 0.05) {
      issues.push(
        `Hallucination rate above 5%: ${(hallucinationRate * 100).toFixed(1)}%`,
      );
      status = 'degraded';
    }

    // Unhealthy thresholds — any one trips it.
    if (
      (totalCalls > 0 && callSuccessRate < 0.7) ||
      (toolStats.totalExecutions > 0 && toolSuccessRate < 0.8) ||
      (totalCalls > 0 && aiAccuracy < 60) ||
      (totalCalls > 0 && hallucinationRate > 0.15)
    ) {
      status = 'unhealthy';
    }

    return {
      status,
      issues,
      metrics: {
        callSuccessRate,
        toolSuccessRate,
        aiAccuracy,
        hallucinationRate,
        humanHandoffRate,
      },
    };
  }

  /**
   * Per-day performance report with operational recommendations.
   * Used by the daily digest email + the "Reports" tab.
   */
  async getPerformanceReport(
    tenantId: string,
    dateRange?: { from: Date; to: Date },
  ): Promise<VapiPerformanceReport> {
    const [callStats, toolStats, aiStats] = await Promise.all([
      this.callLogger.getCallStatistics(tenantId, dateRange),
      this.toolTracker.getOverview(tenantId, dateRange),
      this.aiMetrics.getOverallStatistics(tenantId, dateRange),
    ]);

    const recommendations: string[] = [];
    if (callStats.avgDurationSeconds > 600) {
      recommendations.push(
        `Average call duration is ${(callStats.avgDurationSeconds / 60).toFixed(1)} minutes — review flows to reduce dead air.`,
      );
    }
    if (callStats.totalCalls > 0 && toolStats.overallSuccessRate < 0.95) {
      recommendations.push(
        `Tool success rate is ${(toolStats.overallSuccessRate * 100).toFixed(1)}% — investigate failing tools: ${toolStats.failingTools
          .map((t) => t.toolName)
          .join(', ')}.`,
      );
    }
    if (aiStats.hallucinationRate > 0.05) {
      recommendations.push(
        `Hallucination rate is ${(aiStats.hallucinationRate * 100).toFixed(1)}% — review RAG retrieval quality and assistant prompts.`,
      );
    }
    if (callStats.humanHandoffRate > 0.2) {
      recommendations.push(
        `Human handoff rate is ${(callStats.humanHandoffRate * 100).toFixed(1)}% — improve assistant resolution to reduce call-center load.`,
      );
    }
    if (recommendations.length === 0) {
      recommendations.push('All metrics within healthy thresholds.');
    }

    return {
      date: new Date(),
      summary: {
        totalCalls: callStats.totalCalls,
        avgDurationSeconds: callStats.avgDurationSeconds,
        completionRate:
          callStats.totalCalls > 0
            ? callStats.completedCalls / callStats.totalCalls
            : 0,
        escalationRate:
          callStats.totalCalls > 0
            ? callStats.transferredCalls / callStats.totalCalls
            : 0,
        humanHandoffRate: callStats.humanHandoffRate,
      },
      tools: {
        totalExecutions: toolStats.totalExecutions,
        successRate: toolStats.overallSuccessRate,
        avgLatencyMs:
          toolStats.perTool.length > 0
            ? toolStats.perTool.reduce((s, t) => s + t.avgLatencyMs, 0) /
              toolStats.perTool.length
            : 0,
      },
      ai: {
        totalCalls: aiStats.totalCalls,
        avgAccuracy: aiStats.avgAccuracy,
        avgCSAT: aiStats.avgCSAT,
        hallucinationRate: aiStats.hallucinationRate,
      },
      recommendations,
    };
  }

  /**
   * Export the full report as JSON or CSV. Used by the analytics
   * controller's `/export` endpoint.
   */
  async exportReport(
    tenantId: string,
    format: 'json' | 'csv' = 'json',
    dateRange?: { from: Date; to: Date },
  ): Promise<string> {
    const [dashboard, report] = await Promise.all([
      this.getDashboardMetrics(tenantId, dateRange),
      this.getPerformanceReport(tenantId, dateRange),
    ]);

    if (format === 'json') {
      return JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          tenantId,
          dashboard,
          report,
        },
        null,
        2,
      );
    }

    // CSV: flat key-value rows for spreadsheet import.
    const rows: Array<[string, string | number]> = [
      ['generated_at', new Date().toISOString()],
      ['tenant_id', tenantId],
      ['total_calls', report.summary.totalCalls],
      ['avg_duration_seconds', report.summary.avgDurationSeconds.toFixed(2)],
      ['completion_rate', (report.summary.completionRate * 100).toFixed(2) + '%'],
      ['escalation_rate', (report.summary.escalationRate * 100).toFixed(2) + '%'],
      ['human_handoff_rate', (report.summary.humanHandoffRate * 100).toFixed(2) + '%'],
      ['tool_total_executions', report.tools.totalExecutions],
      ['tool_success_rate', (report.tools.successRate * 100).toFixed(2) + '%'],
      ['tool_avg_latency_ms', report.tools.avgLatencyMs.toFixed(2)],
      ['ai_avg_accuracy', report.ai.avgAccuracy.toFixed(2)],
      ['ai_avg_csat', report.ai.avgCSAT.toFixed(2)],
      ['ai_hallucination_rate', (report.ai.hallucinationRate * 100).toFixed(2) + '%'],
      ['health_status', dashboard.health.status],
    ];
    const header = 'metric,value';
    const body = rows.map((r) => `${r[0]},${r[1]}`).join('\n');
    return `${header}\n${body}`;
  }
}

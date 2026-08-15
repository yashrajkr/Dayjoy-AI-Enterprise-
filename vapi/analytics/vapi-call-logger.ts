import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';

/**
 * Per-call summary payload. Matches the `VoiceAnalytics` row
 * columns 1:1 (except `tenantId` which lives on `VoiceSession`).
 */
export interface VapiCallEndSummary {
  tenantId: string;
  durationSeconds: number;
  silenceDurationMs: number;
  talkTimeMs: number;
  toolCallsCount: number;
  humanHandoffTriggered: boolean;
  intentDetected?: string | null;
  outcome: string; // matches VoiceCallOutcome enum string
  costUsd?: number | null;
  sentimentScore?: number | null;
}

export interface VapiCallStatistics {
  totalCalls: number;
  completedCalls: number;
  transferredCalls: number;
  abandonedCalls: number;
  failedCalls: number;
  voicemailCalls: number;
  avgDurationSeconds: number;
  totalCostUsd: number;
  totalToolCalls: number;
  humanHandoffRate: number;
}

export interface VapiDateRange {
  from: Date;
  to: Date;
}

/**
 * Vapi Call Logger.
 *
 * Persists per-call analytics to the `VoiceAnalytics` table and
 * provides aggregate statistics for the dashboard.
 *
 * The `VoiceSession` row itself is created by the call-started
 * handler; this logger is responsible for the analytics row that
 * gets created/updated at call-end. It also exposes the aggregate
 * queries the analytics dashboard needs (avg duration, total cost,
 * outcome distribution, etc).
 *
 * All queries are scoped by `tenantId` via the `VoiceSession.tenantId`
 * relation — `VoiceAnalytics` has no direct `tenantId` column.
 */
@Injectable()
export class VapiCallLogger {
  private readonly logger = new Logger(VapiCallLogger.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called by the call-started handler — currently a no-op (the
   * VoiceSession row is the "log" of call start). Kept for API
   * stability so callers don't have to special-case call-start.
   */
  async logCallStart(session: { id: string; vapiCallId?: string }): Promise<void> {
    this.logger.debug(`Call started: session=${session.id}`);
  }

  /**
   * Upsert the `VoiceAnalytics` row for a session. Idempotent — if
   * the row already exists (duplicate end webhook), it's updated.
   */
  async logCallEnd(
    sessionId: string,
    summary: VapiCallEndSummary,
  ): Promise<void> {
    const existing = await this.prisma.voiceAnalytics.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    const data = {
      durationSeconds: summary.durationSeconds,
      silenceDurationMs: summary.silenceDurationMs,
      talkTimeMs: summary.talkTimeMs,
      toolCallsCount: summary.toolCallsCount,
      humanHandoffTriggered: summary.humanHandoffTriggered,
      intentDetected: summary.intentDetected ?? null,
      outcome: (this.normalizeOutcome(summary.outcome) as any) ?? null,
      costUsd: summary.costUsd ?? null,
      sentimentScore: summary.sentimentScore ?? null,
    };

    if (existing) {
      await this.prisma.voiceAnalytics.update({
        where: { sessionId },
        data,
      });
    } else {
      await this.prisma.voiceAnalytics.create({
        data: { tenantId: summary.tenantId, sessionId, ...data } as any,
      });
    }
  }

  /**
   * Update a single field on the analytics row. Used by
   * {@link VapiAiMetrics} to record accuracy/CSAT/sentiment scores
   * that arrive asynchronously (e.g. from a post-call survey).
   */
  async updateAnalytics(
    sessionId: string,
    patch: Partial<{
      aiAccuracyScore: number;
      customerSatisfaction: number;
      sentimentScore: number;
      outcome: string;
      intentDetected: string;
    }>,
  ): Promise<void> {
    const data: any = { ...patch };
    if (patch.outcome) {
      data.outcome = this.normalizeOutcome(patch.outcome) ?? undefined;
    }
    await this.prisma.voiceAnalytics.upsert({
      where: { sessionId },
      create: { sessionId, ...data } as any,
      update: data,
    });
  }

  /**
   * Aggregate call statistics for a tenant, optionally scoped to a
   * date range. The query joins `VoiceSession` (which has the
   * tenantId + startedAt) to `VoiceAnalytics` (which has the
   * outcome + duration + cost).
   */
  async getCallStatistics(
    tenantId: string,
    dateRange?: VapiDateRange,
  ): Promise<VapiCallStatistics> {
    const sessionWhere: any = { tenantId };
    if (dateRange) {
      sessionWhere.startedAt = {
        gte: dateRange.from,
        lte: dateRange.to,
      };
    }

    const sessions = await this.prisma.voiceSession.findMany({
      where: sessionWhere,
      select: {
        id: true,
        durationSeconds: true,
        startedAt: true,
        analytics: {
          select: {
            outcome: true,
            costUsd: true,
            toolCallsCount: true,
            humanHandoffTriggered: true,
          },
        },
      },
    });

    const totalCalls = sessions.length;
    if (totalCalls === 0) {
      return {
        totalCalls: 0,
        completedCalls: 0,
        transferredCalls: 0,
        abandonedCalls: 0,
        failedCalls: 0,
        voicemailCalls: 0,
        avgDurationSeconds: 0,
        totalCostUsd: 0,
        totalToolCalls: 0,
        humanHandoffRate: 0,
      };
    }

    const outcomeCount = (outcome: string) =>
      sessions.filter((s) => s.analytics?.outcome === outcome).length;

    const totalDuration = sessions.reduce(
      (sum, s) => sum + (s.durationSeconds ?? 0),
      0,
    );
    const totalCost = sessions.reduce(
      (sum, s) => sum + (s.analytics?.costUsd ?? 0),
      0,
    );
    const totalToolCalls = sessions.reduce(
      (sum, s) => sum + (s.analytics?.toolCallsCount ?? 0),
      0,
    );
    const handoffs = sessions.filter(
      (s) => s.analytics?.humanHandoffTriggered,
    ).length;

    return {
      totalCalls,
      completedCalls: outcomeCount('COMPLETED'),
      transferredCalls: outcomeCount('TRANSFERRED'),
      abandonedCalls: outcomeCount('ABANDONED'),
      failedCalls: outcomeCount('FAILED'),
      voicemailCalls: outcomeCount('VOICEMAIL'),
      avgDurationSeconds: totalDuration / totalCalls,
      totalCostUsd: totalCost,
      totalToolCalls,
      humanHandoffRate: handoffs / totalCalls,
    };
  }

  /**
   * Recent calls for the dashboard's "latest calls" widget. Sorted
   * newest-first, paginated.
   */
  async getRecentCalls(
    tenantId: string,
    limit = 20,
    offset = 0,
  ): Promise<any[]> {
    return this.prisma.voiceSession.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        analytics: true,
        conversation: {
          select: {
            id: true,
            customerId: true,
            customer: {
              select: { id: true, firstName: true, lastName: true, phone: true },
            },
          },
        },
      },
    });
  }

  /**
   * Single-call detail view for the dashboard's drill-down.
   * Includes the session, analytics, and the full transcript.
   */
  async getCallDetails(sessionId: string): Promise<any> {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
      include: {
        analytics: true,
        conversation: {
          include: {
            customer: true,
            agent: true,
          },
        },
        transcripts: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!session) return null;
    return session;
  }

  /**
   * Lookup by Vapi call id (used by the controller for `?callId=...`
   * style queries).
   */
  async getCallByVapiCallId(callId: string): Promise<any> {
    return this.prisma.voiceSession.findUnique({
      where: { callId },
      include: { analytics: true, conversation: { include: { customer: true } } },
    });
  }

  /**
   * Export all calls for a tenant as a flat array (used by the CSV
   * exporter in the analytics controller).
   */
  async exportCalls(
    tenantId: string,
    dateRange?: VapiDateRange,
  ): Promise<any[]> {
    const stats = await this.getCallStatistics(tenantId, dateRange);
    // Re-run the findMany to get the raw rows (getCallStatistics
    // returns aggregated stats only).
    const where: any = { tenantId };
    if (dateRange) {
      where.startedAt = { gte: dateRange.from, lte: dateRange.to };
    }
    const sessions = await this.prisma.voiceSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: { analytics: true },
    });
    return sessions.map((s) => ({
      sessionId: s.id,
      callId: s.callId,
      phoneNumber: s.phoneNumber,
      status: s.status,
      durationSeconds: s.durationSeconds,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      outcome: s.analytics?.outcome ?? '',
      intentDetected: s.analytics?.intentDetected ?? '',
      toolCallsCount: s.analytics?.toolCallsCount ?? 0,
      costUsd: s.analytics?.costUsd ?? 0,
      sentimentScore: s.analytics?.sentimentScore ?? '',
      recordingUrl: s.recordingUrl ?? '',
      // Keep reference to stats for the export header
      _aggregate: stats,
    }));
  }

  // -------------------------------------------------------------------
  // private
  // -------------------------------------------------------------------

  /**
   * Sanitize a free-form outcome string into the `VoiceCallOutcome`
   * enum. Returns null when the input doesn't match (so Prisma
   * doesn't throw on insert).
   */
  private normalizeOutcome(outcome?: string): string | null {
    if (!outcome) return null;
    const upper = outcome.toUpperCase();
    if (
      ['COMPLETED', 'TRANSFERRED', 'ABANDONED', 'FAILED', 'VOICEMAIL'].includes(
        upper,
      )
    ) {
      return upper;
    }
    return null;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { VapiCallLogger } from './vapi-call-logger';

export interface VapiAiMetricsOverview {
  totalCalls: number;
  avgAccuracy: number;       // 0-100
  avgCSAT: number;           // 1-5
  avgSentiment: number;      // -1 to 1
  hallucinationRate: number; // 0-1 (fraction of calls flagged)
  escalationRate: number;    // 0-1 (fraction of calls escalated)
  accuracyTrend: number[];   // last 7 days, oldest first
  csatTrend: number[];       // last 7 days
  sentimentTrend: number[];  // last 7 days
}

/**
 * Vapi AI Metrics Service.
 *
 * Tracks per-call AI quality signals (accuracy, CSAT, sentiment,
 * hallucination flags, escalation rate) and exposes aggregate views
 * for the dashboard.
 *
 * Storage: the `VoiceAnalytics` row carries `aiAccuracyScore`,
 * `customerSatisfaction`, `sentimentScore`, and
 * `humanHandoffTriggered`. There is no dedicated "hallucination"
 * column — we use a sentinel value of `aiAccuracyScore < 30` as a
 * proxy for "the AI gave a wrong answer" (i.e. an effective
 * hallucination).
 */
@Injectable()
export class VapiAiMetrics {
  private readonly logger = new Logger(VapiAiMetrics.name);

  // Threshold below which a call's accuracy score is treated as a
  // hallucination event for aggregate-rate purposes.
  static readonly HALLUCINATION_ACCURACY_THRESHOLD = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly callLogger: VapiCallLogger,
  ) {}

  /**
   * Record (or update) the AI accuracy score for a session.
   * Score is 0-100.
   */
  async recordAccuracy(sessionId: string, score: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, score));
    await this.callLogger.updateAnalytics(sessionId, {
      aiAccuracyScore: clamped,
    });
  }

  /**
   * Record (or update) the customer-satisfaction score for a
   * session. Score is 1-5.
   */
  async recordCSAT(sessionId: string, score: number): Promise<void> {
    const clamped = Math.max(1, Math.min(5, score));
    await this.callLogger.updateAnalytics(sessionId, {
      customerSatisfaction: clamped,
    });
  }

  /**
   * Record (or update) the sentiment score for a session.
   * Score is -1 (very negative) to 1 (very positive).
   */
  async recordSentiment(sessionId: string, score: number): Promise<void> {
    const clamped = Math.max(-1, Math.min(1, score));
    await this.callLogger.updateAnalytics(sessionId, {
      sentimentScore: clamped,
    });
  }

  /**
   * Mark a session as having had a hallucination. We model this by
   * setting `aiAccuracyScore` to 0 (if it's currently above the
   * hallucination threshold) — the aggregate queries then treat
   * any call with `aiAccuracyScore < HALLUCINATION_ACCURACY_THRESHOLD`
   * as a hallucination event.
   */
  async markHallucination(sessionId: string): Promise<void> {
    this.logger.warn(`Hallucination flagged on session ${sessionId}`);
    await this.recordAccuracy(sessionId, 0);
  }

  /**
   * Tenant-wide AI quality overview, optionally scoped to a date
   * range. Includes 7-day trends for accuracy, CSAT, and sentiment.
   */
  async getOverallStatistics(
    tenantId: string,
    dateRange?: { from: Date; to: Date },
  ): Promise<VapiAiMetricsOverview> {
    const sessionWhere: any = { tenantId };
    if (dateRange) {
      sessionWhere.startedAt = { gte: dateRange.from, lte: dateRange.to };
    }

    const sessions = await this.prisma.voiceSession.findMany({
      where: sessionWhere,
      select: {
        id: true,
        startedAt: true,
        analytics: {
          select: {
            aiAccuracyScore: true,
            customerSatisfaction: true,
            sentimentScore: true,
            humanHandoffTriggered: true,
          },
        },
      },
    });

    const withAnalytics = sessions.filter((s) => s.analytics);
    const totalCalls = withAnalytics.length;

    const accuracyScores = withAnalytics
      .map((s) => s.analytics?.aiAccuracyScore)
      .filter((v): v is number => v != null);
    const csatScores = withAnalytics
      .map((s) => s.analytics?.customerSatisfaction)
      .filter((v): v is number => v != null);
    const sentimentScores = withAnalytics
      .map((s) => s.analytics?.sentimentScore)
      .filter((v): v is number => v != null);
    const hallucinations = accuracyScores.filter(
      (a) => a < VapiAiMetrics.HALLUCINATION_ACCURACY_THRESHOLD,
    ).length;
    const escalations = withAnalytics.filter(
      (s) => s.analytics?.humanHandoffTriggered,
    ).length;

    // 7-day trends (oldest first)
    const now = new Date();
    const accuracyTrend: number[] = [];
    const csatTrend: number[] = [];
    const sentimentTrend: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const daySessions = withAnalytics.filter((s) => {
        const t = s.startedAt.getTime();
        return t >= dayStart.getTime() && t <= dayEnd.getTime();
      });
      accuracyTrend.push(this.average(daySessions.map((s) => s.analytics?.aiAccuracyScore)));
      csatTrend.push(this.average(daySessions.map((s) => s.analytics?.customerSatisfaction)));
      sentimentTrend.push(this.average(daySessions.map((s) => s.analytics?.sentimentScore)));
    }

    return {
      totalCalls,
      avgAccuracy: this.average(accuracyScores),
      avgCSAT: this.average(csatScores),
      avgSentiment: this.average(sentimentScores),
      hallucinationRate: totalCalls > 0 ? hallucinations / totalCalls : 0,
      escalationRate: totalCalls > 0 ? escalations / totalCalls : 0,
      accuracyTrend,
      csatTrend,
      sentimentTrend,
    };
  }

  /**
   * Get the AI metrics for a single call. Returns null if no
   * analytics row exists yet.
   */
  async getCallMetrics(sessionId: string) {
    return this.prisma.voiceAnalytics.findUnique({
      where: { sessionId },
      select: {
        aiAccuracyScore: true,
        customerSatisfaction: true,
        sentimentScore: true,
        humanHandoffTriggered: true,
        outcome: true,
        intentDetected: true,
      },
    });
  }

  /**
   * Composite quality score (0-100) for a session, blending
   * accuracy + CSAT + sentiment into a single number for the
   * dashboard's call-quality widget.
   */
  async getQualityScore(sessionId: string): Promise<number | null> {
    const a = await this.getCallMetrics(sessionId);
    if (!a) return null;
    const accuracy = a.aiAccuracyScore ?? 0;       // 0-100
    const csat = ((a.customerSatisfaction ?? 3) - 1) / 4 * 100; // 1-5 -> 0-100
    const sentiment = ((a.sentimentScore ?? 0) + 1) / 2 * 100;  // -1..1 -> 0-100
    // Weighted: accuracy 50%, CSAT 30%, sentiment 20%
    return accuracy * 0.5 + csat * 0.3 + sentiment * 0.2;
  }

  // -------------------------------------------------------------------
  // private
  // -------------------------------------------------------------------

  private average(nums: Array<number | null | undefined>): number {
    const valid = nums.filter((n): n is number => n != null && !Number.isNaN(n));
    if (valid.length === 0) return 0;
    return valid.reduce((sum, n) => sum + n, 0) / valid.length;
  }
}

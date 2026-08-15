import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { VapiSessionMemory } from '../memory/vapi-session-memory';
import { VapiCustomerProfile } from '../memory/vapi-customer-profile';
import { VapiAiMetrics } from '../analytics/vapi-ai-metrics';
import { VapiCallLogger } from '../analytics/vapi-call-logger';

/**
 * Normalized call-end payload. Vapi includes a `summary` object on
 * the call-end webhook with timing, silence, cost, etc.
 */
export interface VapiCallEndedInput {
  id: string;
  type?: string;
  direction?: string;
  from?: string;
  to?: string;
  phoneNumber?: string;
  assistantId?: string;
  tenantId?: string;
  startedAt?: string | number;
  endedAt?: string | number;
  durationSeconds?: number;
  transcript?: string;
  recordingUrl?: string;
  summary?: {
    durationSeconds?: number;
    silenceDurationMs?: number;
    talkTimeMs?: number;
    toolCalls?: number;
    toolCallsCount?: number;
    humanHandoffTriggered?: boolean;
    intent?: string;
    outcome?: string;
    costUsd?: number;
    cost?: number;
    sentimentScore?: number;
    customerSatisfaction?: number;
    aiAccuracyScore?: number;
  };
  metadata?: Record<string, any>;
}

export interface VapiCallEndedResult {
  sessionId: string;
  durationSeconds: number;
  outcome: string;
  memoryExtracted: boolean;
}

/**
 * Vapi Call-Ended Handler.
 *
 * Fires when Vapi delivers a `call-end` webhook. Responsibilities:
 *   1. Locate the `VoiceSession` by Vapi call id.
 *   2. Mark it as ended: status=ENDED, endedAt=now, durationSeconds.
 *   3. Create a `VoiceAnalytics` row with the per-call metrics
 *      (duration, silence, talk time, tool-call count, outcome,
 *      cost, sentiment, CSAT, accuracy). Idempotent — if the
 *      analytics row already exists (duplicate end webhook), it's
 *      updated instead.
 *   4. Close the `Conversation` (status=ENDED, endedAt=now).
 *   5. Trigger long-term memory extraction — pulls the latest
 *      intent + a short summary into `AiMemory` rows for the
 *      customer, so the next call knows "customer called about X
 *      last time".
 *   6. Clear the Redis session memory (we no longer need it).
 */
@Injectable()
export class VapiCallEndedHandler {
  private readonly logger = new Logger(VapiCallEndedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionMemory: VapiSessionMemory,
    private readonly customerProfile: VapiCustomerProfile,
    private readonly aiMetrics: VapiAiMetrics,
    private readonly callLogger: VapiCallLogger,
  ) {}

  async handle(
    call: VapiCallEndedInput,
    _rawBody?: any,
  ): Promise<VapiCallEndedResult> {
    const normalized = this.normalize(call);
    this.logger.log(
      `Call ended: id=${normalized.id} duration=${normalized.durationSeconds}s`,
    );

    // -------------------------------------------------------------
    // 1. Locate the session
    // -------------------------------------------------------------
    const session = await this.prisma.voiceSession.findUnique({
      where: { callId: normalized.id },
      include: { analytics: true },
    });
    if (!session) {
      this.logger.warn(
        `Call-end webhook for unknown call id ${normalized.id} — ignoring`,
      );
      return {
        sessionId: 'unknown',
        durationSeconds: normalized.durationSeconds,
        outcome: 'UNKNOWN',
        memoryExtracted: false,
      };
    }

    // -------------------------------------------------------------
    // 2. Update the VoiceSession row
    // -------------------------------------------------------------
    await this.prisma.voiceSession.update({
      where: { id: session.id },
      data: {
        status: 'ENDED',
        endedAt: normalized.endedAt
          ? new Date(normalized.endedAt)
          : new Date(),
        durationSeconds: normalized.durationSeconds,
        recordingUrl: normalized.recordingUrl ?? session.recordingUrl,
        metadata: {
          ...((session.metadata as any) ?? {}),
          endedAt: normalized.endedAt ?? new Date().toISOString(),
          outcome: normalized.summary?.outcome,
        } as any,
      },
    });

    // -------------------------------------------------------------
    // 3. Upsert VoiceAnalytics row (idempotent — sessionId is @unique)
    // -------------------------------------------------------------
    const summary = normalized.summary ?? {};
    const toolCallsCount =
      summary.toolCallsCount ?? summary.toolCalls ?? (await this.sessionMemory.get<number>(session.id, 'toolCallsCount')) ?? 0;
    const intentDetected =
      summary.intent ??
      (await this.sessionMemory.get<string>(session.id, 'intentDetected')) ??
      null;
    const humanHandoff = !!(
      summary.humanHandoffTriggered ??
      (await this.sessionMemory.get<boolean>(session.id, 'escalationTriggered'))
    );

    const analyticsData = {
      durationSeconds: normalized.durationSeconds,
      silenceDurationMs: summary.silenceDurationMs ?? 0,
      talkTimeMs: summary.talkTimeMs ?? 0,
      toolCallsCount,
      humanHandoffTriggered: humanHandoff,
      intentDetected,
      outcome: (this.normalizeOutcome(summary.outcome) as any) ?? undefined,
      costUsd: summary.costUsd ?? summary.cost ?? null,
      sentimentScore: summary.sentimentScore ?? null,
    };

    if (session.analytics) {
      await this.prisma.voiceAnalytics.update({
        where: { sessionId: session.id },
        data: analyticsData,
      });
    } else {
      await this.prisma.voiceAnalytics.create({
        data: {
          tenantId: session.tenantId,
          sessionId: session.id,
          ...analyticsData,
        } as any,
      });
    }

    // Record AI accuracy + CSAT if provided (separate update so we
    // can use the typed VapiAiMetrics service).
    if (summary.aiAccuracyScore !== undefined) {
      await this.aiMetrics.recordAccuracy(session.id, summary.aiAccuracyScore);
    }
    if (summary.customerSatisfaction !== undefined) {
      await this.aiMetrics.recordCSAT(session.id, summary.customerSatisfaction);
    }
    if (summary.sentimentScore !== undefined) {
      await this.aiMetrics.recordSentiment(session.id, summary.sentimentScore);
    }

    // -------------------------------------------------------------
    // 4. Close the conversation
    // -------------------------------------------------------------
    if (session.conversationId) {
      await this.prisma.conversation
        .update({
          where: { id: session.conversationId },
          data: { status: 'ENDED', endedAt: new Date() },
        })
        .catch((err) =>
          this.logger.warn(
            `Failed to close conversation ${session.conversationId}: ${err.message}`,
          ),
        );
    }

    // -------------------------------------------------------------
    // 5. Long-term memory extraction
    // -------------------------------------------------------------
    let memoryExtracted = false;
    if (session.conversationId && session.tenantId) {
      memoryExtracted = await this.extractMemory(session, intentDetected);
    }

    // -------------------------------------------------------------
    // 6. Clear Redis session memory
    // -------------------------------------------------------------
    await this.sessionMemory.clear(session.id).catch((err) =>
      this.logger.warn(`Failed to clear session memory: ${err.message}`),
    );

    // -------------------------------------------------------------
    // 7. Inform the call logger (analytics subsystem)
    // -------------------------------------------------------------
    await this.callLogger
      .logCallEnd(session.id, {
        tenantId: session.tenantId,
        durationSeconds: normalized.durationSeconds,
        silenceDurationMs: summary.silenceDurationMs ?? 0,
        talkTimeMs: summary.talkTimeMs ?? 0,
        toolCallsCount,
        humanHandoffTriggered: humanHandoff,
        intentDetected,
        outcome: summary.outcome ?? 'UNKNOWN',
        costUsd: summary.costUsd ?? summary.cost ?? 0,
        sentimentScore: summary.sentimentScore ?? null,
      })
      .catch((err) =>
        this.logger.warn(`Call logger failed: ${err.message}`),
      );

    return {
      sessionId: session.id,
      durationSeconds: normalized.durationSeconds,
      outcome: summary.outcome ?? 'UNKNOWN',
      memoryExtracted,
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * Extract a few durable facts into `AiMemory` so the next call has
   * context ("customer called yesterday about order #12345, status
   * was DELIVERED"). We persist at most a small number of memories
   * per call to avoid memory bloat.
   */
  private async extractMemory(
    session: any,
    intentDetected: string | null,
  ): Promise<boolean> {
    try {
      const customerId = session.conversation?.customerId;
      if (!customerId) return false;

      const summary =
        `Call on ${new Date(session.startedAt).toISOString().slice(0, 10)}: ` +
        `${intentDetected ? `intent=${intentDetected}, ` : ''}` +
        `duration=${session.durationSeconds ?? 0}s, ` +
        `outcome=${session.analytics?.outcome ?? 'unknown'}.`;

      await this.customerProfile.remember(
        customerId,
        session.tenantId,
        'HISTORY',
        `call-${session.id}`,
        summary,
        5,
        session.conversation?.agentId ?? undefined,
      );

      if (intentDetected) {
        await this.customerProfile.remember(
          customerId,
          session.tenantId,
          'CONTEXT',
          `last-intent-${session.id}`,
          intentDetected,
          4,
          session.conversation?.agentId ?? undefined,
        );
      }

      return true;
    } catch (err) {
      this.logger.error(
        `Memory extraction failed for session ${session.id}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Map Vapi's free-form outcome string into the `VoiceCallOutcome`
   * enum. Unknown strings become `null` (Prisma will reject invalid
   * enum values, so we sanitize here).
   */
  private normalizeOutcome(outcome?: string): string | null {
    if (!outcome) return null;
    const upper = outcome.toUpperCase();
    if (['COMPLETED', 'TRANSFERRED', 'ABANDONED', 'FAILED', 'VOICEMAIL'].includes(upper)) {
      return upper;
    }
    return null;
  }

  /**
   * Coerce various Vapi payload shapes into one normalized form.
   */
  private normalize(call: VapiCallEndedInput): VapiCallEndedInput {
    // Real Vapi Call objects put the caller's number under
    // `customer.number`, not a top-level `from`/`phoneNumber` field.
    const from = call.from ?? call.phoneNumber ?? (call as any).customer?.number;
    return {
      ...call,
      direction:
        call.direction ??
        (call.type === 'outbound' || call.type === 'outbound-phone'
          ? 'OUTBOUND'
          : 'INBOUND'),
      from,
      phoneNumber: call.phoneNumber ?? from,
      durationSeconds: call.durationSeconds ?? call.summary?.durationSeconds ?? 0,
    };
  }
}

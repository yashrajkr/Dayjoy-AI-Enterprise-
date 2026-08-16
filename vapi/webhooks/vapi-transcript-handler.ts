import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { VapiSessionMemory } from '../memory/vapi-session-memory';

/**
 * Normalized transcript message shape. Vapi sends one webhook per
 * utterance (not the whole transcript at once) — `isFinal` distinguishes
 * partial / interim transcripts from finalized ones.
 */
export interface VapiTranscriptMessage {
  role?: 'user' | 'assistant' | 'system' | 'tool';
  transcript?: string;
  content?: string;
  text?: string;
  timestamp?: string | number;
  isFinal?: boolean;
  /** Real Vapi field: 'partial' | 'final'. Preferred over `isFinal` when present. */
  transcriptType?: 'partial' | 'final';
  confidence?: number;
  tokensUsed?: number;
  metadata?: Record<string, any>;
}

export interface VapiCallRef {
  id: string;
  tenantId?: string;
  assistantId?: string;
  from?: string;
  to?: string;
}

export interface VapiTranscriptResult {
  transcriptId: string;
  sessionId: string;
  intentDetected?: string;
  escalationTriggered?: boolean;
}

/**
 * Vapi Transcript Handler.
 *
 * Fires once per utterance during a call. Responsibilities:
 *   1. Locate the `VoiceSession` by Vapi call id.
 *   2. Persist the utterance to `VoiceTranscript` (per-utterance log
 *      with role + content + confidence + tokensUsed).
 *   3. Mirror the utterance to the `Message` table linked to the
 *      conversation, so chat + voice share a single history view.
 *   4. For user turns: run a lightweight intent detector and stash
 *      the result in the Redis session memory (so the flow manager
 *      doesn't have to re-detect on every turn).
 *   5. For user turns: scan for escalation phrases ("speak to a
 *      human", "manager", etc.) and flag the session — the flow
 *      manager picks this up on the next turn.
 *
 * Partial transcripts (`isFinal=false`) are still persisted (so the
 * UI can show "user is typing..."-style live captions) but do NOT
 * trigger intent detection / escalation scans.
 */
@Injectable()
export class VapiTranscriptHandler {
  private readonly logger = new Logger(VapiTranscriptHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionMemory: VapiSessionMemory,
  ) {}

  async handle(
    message: VapiTranscriptMessage,
    call: VapiCallRef,
    _rawBody?: any,
  ): Promise<VapiTranscriptResult> {
    const content =
      message.transcript ?? message.content ?? message.text ?? '';
    if (!content) {
      this.logger.debug(`Empty transcript from call ${call.id} — skipping`);
      return { transcriptId: 'noop', sessionId: 'unknown' };
    }

    const role = this.normalizeRole(message.role ?? 'user');
    const isFinal = message.transcriptType
      ? message.transcriptType === 'final'
      : message.isFinal !== false;
    const ts = message.timestamp
      ? new Date(message.timestamp)
      : new Date();

    // -------------------------------------------------------------
    // 1. Locate session (reverse-lookup by call id)
    // -------------------------------------------------------------
    const session = await this.prisma.voiceSession.findUnique({
      where: { callId: call.id },
      select: { id: true, tenantId: true, conversationId: true },
    });
    if (!session) {
      this.logger.warn(
        `Transcript for unknown call ${call.id} — ignoring (call-start may not have arrived yet)`,
      );
      return { transcriptId: 'unknown-call', sessionId: 'unknown' };
    }

    // -------------------------------------------------------------
    // 2. Persist VoiceTranscript row
    // -------------------------------------------------------------
    const transcript = await this.prisma.voiceTranscript.create({
      data: {
        tenantId: session.tenantId,
        sessionId: session.id,
        role,
        content,
        tokensUsed: message.tokensUsed ?? null,
        confidence: message.confidence ?? null,
        metadata: {
          isFinal,
          ...(message.metadata ?? {}),
        } as any,
        // createdAt is defaulted
      },
    });
    // Override createdAt manually if ts is set (Prisma doesn't allow
    // setting @default(now()) columns on create by default — but we
    // want the actual utterance time, not the time we received it).
    if (message.timestamp) {
      await this.prisma.voiceTranscript
        .update({
          where: { id: transcript.id },
          data: { createdAt: ts } as any,
        })
        .catch(() => undefined);
    }

    // -------------------------------------------------------------
    // 3. Mirror to Message table (so chat + voice share history)
    // -------------------------------------------------------------
    if (session.conversationId) {
      await this.prisma.message.create({
        data: {
          tenantId: session.tenantId,
          conversationId: session.conversationId,
          role: role.toLowerCase(),
          content,
          contentType: 'text',
          tokensUsed: message.tokensUsed ?? null,
          metadata: { voiceTranscriptId: transcript.id, isFinal } as any,
        },
      });
    }

    // -------------------------------------------------------------
    // 4. Update session memory (last message + intent for user turns)
    // -------------------------------------------------------------
    let intentDetected: string | undefined;
    let escalationTriggered: boolean | undefined;

    if (role === 'USER') {
      await this.sessionMemory.set(session.id, 'lastUserMessage', content);
    } else if (role === 'ASSISTANT') {
      await this.sessionMemory.set(session.id, 'lastAssistantMessage', content);
    }

    if (isFinal && role === 'USER') {
      intentDetected = this.detectIntent(content);
      if (intentDetected) {
        await this.sessionMemory.set(session.id, 'intentDetected', intentDetected);
      }
      escalationTriggered = this.detectEscalation(content);
      if (escalationTriggered) {
        await this.sessionMemory.set(session.id, 'escalationTriggered', true);
      }
    }

    return {
      transcriptId: transcript.id,
      sessionId: session.id,
      intentDetected,
      escalationTriggered,
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * Normalize Vapi's free-form role string into the `TranscriptRole`
   * enum (USER / ASSISTANT / SYSTEM / TOOL). Defaults to USER.
   */
  private normalizeRole(role: string): 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL' {
    const upper = role.toUpperCase();
    if (upper === 'ASSISTANT' || upper === 'BOT' || upper === 'AI') return 'ASSISTANT';
    if (upper === 'SYSTEM') return 'SYSTEM';
    if (upper === 'TOOL' || upper === 'FUNCTION') return 'TOOL';
    return 'USER';
  }

  /**
   * Lightweight keyword-based intent detector. Used as a fast
   * fallback so the flow manager can short-circuit the LLM call when
   * the intent is obvious. The flow manager itself may upgrade this
   * guess with an LLM-based classification.
   *
   * Returns undefined when no clear intent matches.
   */
  private detectIntent(text: string): string | undefined {
    const t = text.toLowerCase();
    if (/\b(human|agent|representative|manager|supervisor|talk to (a )?person)\b/.test(t)) {
      return 'human_escalation';
    }
    if (/\b(buy|price|cost|how much|product|catalog|item)\b/.test(t)) {
      return 'product_inquiry';
    }
    if (/\b(order|delivery|shipment|track|return|refund|complaint|issue|problem)\b/.test(t)) {
      return 'customer_support';
    }
    if (/\b(distributor|commission|rank|downline|upline|compensation)\b/.test(t)) {
      return 'distributor_support';
    }
    if (/\b(business|opportunity|join|sign ?up|earn|income|plan)\b/.test(t)) {
      return 'business_plan';
    }
    if (/\b(appointment|schedule|book|meet|call back)\b/.test(t)) {
      return 'appointment_booking';
    }
    if (/\b(lead|interest|contact me|more info)\b/.test(t)) {
      return 'lead_collection';
    }
    return undefined;
  }

  /**
   * Escalation phrase detector — any of these in a user utterance
   * sets the session's `escalationTriggered` flag. The flow manager
   * checks this flag and routes to the human-escalation flow.
   */
  private detectEscalation(text: string): boolean {
    const t = text.toLowerCase();
    return [
      'speak to a human',
      'talk to a person',
      'real person',
      'real agent',
      'human agent',
      'not helpful',
      "you're not helping",
      'frustrated',
      'angry',
      'complaint',
      'manager',
      'supervisor',
      'this is ridiculous',
      'i want to cancel',
    ].some((phrase) => t.includes(phrase));
  }
}

import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { InjectRedis } from '../../backend/_shared/security/redis.decorators';
import type Redis from 'ioredis';
import { VapiCallStartedHandler } from './vapi-call-started-handler';
import { VapiCallEndedHandler } from './vapi-call-ended-handler';
import { VapiTranscriptHandler } from './vapi-transcript-handler';
import { VapiFunctionCallHandler } from './vapi-function-call-handler';

/**
 * Allowed webhook event types from Vapi. Anything else is logged and
 * acknowledged with `unknown_event_type` so Vapi doesn't retry forever.
 */
export type VapiWebhookEventType =
  // Current Vapi server-message types (see docs.vapi.ai/server-url/events).
  | 'status-update'
  | 'transcript'
  | 'tool-calls'
  | 'end-of-call-report'
  | 'hang'
  | 'conversation-update'
  | 'speech-update'
  | 'assistant-request'
  // Legacy / alternate spellings kept for backward compatibility with
  // older Vapi accounts and with this repo's existing test fixtures.
  | 'call-start'
  | 'call-started'
  | 'call-end'
  | 'call-ended'
  | 'function-call'
  | 'function-call-llm'
  | 'tool-call'
  | string;

export interface VapiWebhookResult {
  status: string;
  data?: any;
}

/**
 * Redis key for the idempotency set. TTL is 72h — comfortably longer
 * than Vapi's max retry window (~24h) so a retried webhook that
 * arrives late is still recognized as a duplicate.
 */
const IDEMPOTENCY_TTL_SECONDS = 72 * 60 * 60;

/**
 * Vapi Webhook Service
 *
 * Responsibilities:
 *   1. **Verify HMAC-SHA256 signature** — UNCONDITIONAL in non-test
 *      environments (no NODE_ENV=development bypass). The only escape
 *      hatch is `NODE_ENV === 'test'`, used by the unit suite.
 *   2. **Idempotency** — Redis `SETNX vapi:webhook:event:{eventId}`
 *      ensures a retried webhook is processed exactly once.
 *   3. **Audit** — every webhook is persisted to the `WebhookEvent`
 *      table with raw payload + signature for forensic review.
 *   4. **Routing** — dispatches to one of the four typed handlers
 *      based on the `type` field.
 */
@Injectable()
export class VapiWebhookService {
  private readonly logger = new Logger(VapiWebhookService.name);

  /**
   * Read once at construction — never re-read per request. Falls back
   * to undefined if unset; verifySignature throws a hard
   * UnauthorizedException in that case (fail-closed).
   */
  private readonly webhookSecret: string | undefined =
    process.env.VAPI_WEBHOOK_SECRET;

  constructor(
    private readonly callStartedHandler: VapiCallStartedHandler,
    private readonly callEndedHandler: VapiCallEndedHandler,
    private readonly transcriptHandler: VapiTranscriptHandler,
    private readonly functionCallHandler: VapiFunctionCallHandler,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Verify the Vapi webhook signature.
   *
   * SECURITY: signature verification is enforced UNCONDITIONALLY in
   * production and development. The ONLY bypass is when
   * `NODE_ENV === 'test'`, so unit/integration tests don't need a
   * real secret.
   *
   * Signature algorithm (matches Vapi docs):
   *   HMAC_SHA256(secret, `${timestamp}.${rawBody}`)
   *
   * @throws UnauthorizedException when the secret is not configured in
   *   a non-test environment — failing closed forces ops to fix the
   *   config rather than silently accepting forged webhooks.
   */
  async verifySignature(
    payload: string,
    signature: string,
    timestamp: string,
  ): Promise<boolean> {
    // Only the automated test suite is allowed to bypass verification.
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    if (!this.webhookSecret) {
      this.logger.error(
        'VAPI_WEBHOOK_SECRET is not configured — refusing to verify webhook. ' +
          'Set VAPI_WEBHOOK_SECRET in the environment (or via ExternalSecrets in K8s).',
      );
      throw new UnauthorizedException('Webhook secret not configured');
    }

    if (!signature || !timestamp) {
      this.logger.warn('Missing signature or timestamp header on webhook');
      return false;
    }

    // Replay protection: reject timestamps whose skew from the server
    // clock exceeds 5 minutes. Prevents an attacker who captured a
    // valid (signature, payload) pair from replaying it indefinitely.
    const tsNum = Number.parseInt(timestamp, 10);
    if (Number.isNaN(tsNum)) {
      this.logger.warn(`Invalid timestamp format on webhook: ${timestamp}`);
      return false;
    }
    const skewMs = Math.abs(Date.now() - tsNum);
    if (skewMs > 5 * 60 * 1000) {
      this.logger.warn(
        `Webhook timestamp out of acceptable window (skew=${skewMs}ms) — possible replay`,
      );
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      // Use timingSafeEqual to prevent timing-side-channel attacks.
      // The length check before the call is mandatory —
      // timingSafeEqual throws on unequal-length buffers.
      const a = Buffer.from(signature);
      const b = Buffer.from(expectedSignature);
      if (a.length !== b.length) {
        this.logger.warn('Webhook signature length mismatch');
        return false;
      }
      const isValid = crypto.timingSafeEqual(a, b);
      if (!isValid) {
        this.logger.warn('Webhook signature mismatch — rejecting');
      }
      return isValid;
    } catch (error) {
      this.logger.error(
        `Signature verification failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Verify the `X-Vapi-Secret` header — Vapi's default webhook auth
   * mechanism when `assistant.server.secret` (or a phone number's
   * `server.secret`) is configured. Unlike `verifySignature()` this is
   * a plain shared-secret comparison, NOT an HMAC signature: Vapi
   * echoes the configured secret verbatim in this header on every
   * request. See docs.vapi.ai/server-url/server-authentication.
   *
   * This is the mechanism that actually applies given how
   * `VAPI_ASSISTANT_CONFIG.server.secret` is set in
   * `vapi/config/vapi-assistant-config.ts` — `verifySignature()`
   * (HMAC over `x-vapi-signature`/`x-vapi-timestamp`) only applies if
   * ops additionally configures a custom HMAC credential in the Vapi
   * dashboard, which is a manual step this integration does not
   * assume.
   *
   * @throws never — returns false on any mismatch/misconfiguration
   *   except when the secret itself is unset, which fails closed via
   *   an explicit false (the caller logs + rejects).
   */
  verifySharedSecret(secretHeader: string | undefined): boolean {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    if (!this.webhookSecret) {
      this.logger.error(
        'VAPI_WEBHOOK_SECRET is not configured — refusing to verify webhook (X-Vapi-Secret path).',
      );
      return false;
    }
    if (!secretHeader) {
      return false;
    }
    const a = Buffer.from(secretHeader);
    const b = Buffer.from(this.webhookSecret);
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  /**
   * Process a verified webhook payload.
   *
   * Order of operations:
   *   1. Extract / derive an event id (Vapi sometimes omits one — we
   *      synthesize from call id + type + server timestamp as a last
   *      resort).
   *   2. Idempotency check via Redis SETNX. If the key already
   *      existed, this is a duplicate delivery — return immediately.
   *   3. Persist the raw webhook to `WebhookEvent` for audit.
   *   4. Route to the appropriate typed handler.
   *   5. Mark the `WebhookEvent` row as processed (or record the
   *      error).
   */
  async process(body: any): Promise<VapiWebhookResult> {
    const type: VapiWebhookEventType = body?.type ?? 'unknown';
    const callId: string | undefined = body?.call?.id;
    // Prefer an id Vapi supplied. When absent, derive a STABLE key from the
    // payload's own content (call id + type + a content hash) rather than
    // wall-clock time — `Date.now()` produces a different value on every
    // retry of the exact same event, which silently defeats idempotency
    // for event types that don't carry an `id`/`eventId`/`timestamp`
    // (e.g. bare `status-update`/`hang` events).
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(body ?? {}))
      .digest('hex')
      .slice(0, 16);
    const externalEventId: string =
      body?.id ??
      body?.eventId ??
      (body?.timestamp
        ? `${callId ?? 'anon'}-${type}-${body.timestamp}`
        : `${callId ?? 'anon'}-${type}-${contentHash}`);

    // -----------------------------------------------------------
    // Idempotency — fast-path duplicate detection via Redis SETNX
    // -----------------------------------------------------------
    const idempotencyKey = `vapi:webhook:event:${externalEventId}`;
    try {
      const acquired = await this.redis.set(
        idempotencyKey,
        new Date().toISOString(),
        'EX',
        IDEMPOTENCY_TTL_SECONDS,
        'NX',
      );
      if (acquired !== 'OK') {
        this.logger.log(
          `Webhook already processed (idempotency hit): ${externalEventId}`,
        );
        return { status: 'already_processed' };
      }
    } catch (err) {
      // If Redis is briefly unavailable, fall back to DB-only
      // idempotency (the WebhookEvent row we write below acts as the
      // second line of defense). We log the Redis failure but DO NOT
      // abort the webhook — accepting a possible duplicate is safer
      // than dropping a real call event.
      this.logger.error(
        `Redis idempotency check failed: ${(err as Error).message} — falling back to DB-only idempotency`,
      );
    }

    // -----------------------------------------------------------
    // Audit row — every webhook gets persisted, success or failure
    // -----------------------------------------------------------
    let auditRowId: string | undefined;
    try {
      const tenantId =
        body?.tenantId ??
        body?.call?.tenantId ??
        body?.tenant?.id ??
        null;
      const audit = await this.prisma.webhookEvent.create({
        data: {
          tenantId,
          source: 'VAPI',
          eventType: type,
          payload: { ...body, _eventId: externalEventId } as any,
          signature: body?.signature ?? null,
          processed: false,
        },
      });
      auditRowId = audit.id;
    } catch (err) {
      this.logger.error(
        `Failed to persist webhook audit row: ${(err as Error).message}`,
      );
      // Don't abort — we still want to process the event.
    }

    // -----------------------------------------------------------
    // Route to typed handler
    // -----------------------------------------------------------
    try {
      const result = await this.route(type, body);
      if (auditRowId) {
        await this.prisma.webhookEvent
          .update({
            where: { id: auditRowId },
            data: { processed: true, processedAt: new Date() },
          })
          .catch((e) =>
            this.logger.error(
              `Failed to mark webhook ${auditRowId} as processed: ${e.message}`,
            ),
          );
      }
      return { status: 'processed', data: result };
    } catch (err) {
      this.logger.error(
        `Handler failed for webhook ${externalEventId} (type=${type}): ${(err as Error).message}`,
        (err as Error).stack,
      );
      if (auditRowId) {
        await this.prisma.webhookEvent
          .update({
            where: { id: auditRowId },
            data: {
              processed: true,
              processedAt: new Date(),
              error: (err as Error).message?.slice(0, 4000) ?? 'Unknown error',
            },
          })
          .catch((e) =>
            this.logger.error(
              `Failed to record error on webhook ${auditRowId}: ${e.message}`,
            ),
          );
      }
      // Re-throw — the controller will return 500 and Vapi will retry.
      throw err;
    }
  }

  /**
   * Dispatch the verified payload to the right handler.
   *
   * IMPORTANT: `body` here is the *unwrapped* server-message object —
   * the caller (webhook controller) strips Vapi's outer
   * `{ "message": { ... } }` envelope before calling `process()`. Test
   * fixtures in this repo pass already-flat objects directly to
   * `process()`, which is why every fallback chain below also accepts
   * the pre-existing (legacy/flat) shapes.
   *
   * Vapi's *current* server-message type enum has no dedicated
   * `call-started`/`call-ended` events — call lifecycle is conveyed by
   * `status-update` (with `status: 'ringing' | 'in-progress' | ... |
   * 'ended'`), and the authoritative end-of-call payload (duration,
   * cost, recording, transcript, analysis) arrives separately as
   * `end-of-call-report`. The legacy `call-start`/`call-end` names are
   * kept as aliases for older Vapi accounts / existing test fixtures.
   */
  private async route(
    type: VapiWebhookEventType,
    body: any,
  ): Promise<any> {
    const { call, message, toolCall, toolCalls, function: fn, data, status } = body;

    switch (type) {
      // ---------------------------------------------------------------
      // Call lifecycle
      // ---------------------------------------------------------------
      case 'status-update': {
        const callStatus: string | undefined = status ?? data?.status;
        if (callStatus === 'in-progress') {
          // The call actually connected — this is the closest current
          // equivalent to the old "call-started" event. Idempotent:
          // VapiCallStartedHandler no-ops if the VoiceSession already
          // exists (a call can emit 'ringing' then 'in-progress').
          return this.callStartedHandler.handle(call ?? body, body);
        }
        this.logger.log(
          `status-update: ${callStatus ?? 'unknown'} for call ${call?.id ?? '?'}`,
        );
        return { status: 'acknowledged', callStatus };
      }

      case 'call-start':
      case 'call-started':
      case 'call.started':
        return this.callStartedHandler.handle(call ?? body, body);

      case 'end-of-call-report':
        return this.callEndedHandler.handle(
          this.normalizeEndOfCallReport(body),
          body,
        );

      case 'call-end':
      case 'call-ended':
      case 'call.ended':
        return this.callEndedHandler.handle(call ?? body, body);

      // ---------------------------------------------------------------
      // Transcript
      // ---------------------------------------------------------------
      case 'transcript':
      case 'call.transcript':
        // Real Vapi transcript messages carry role/transcript/
        // transcriptType flat on the (already-unwrapped) payload —
        // there is no further nested `message` field. The `message ??
        // data` fallbacks exist only for this repo's existing test
        // fixtures, which nest a `message: {...}` object.
        return this.transcriptHandler.handle(message ?? data ?? body, call ?? body, body);

      // ---------------------------------------------------------------
      // Tool / function calls
      // ---------------------------------------------------------------
      case 'tool-calls':
      case 'function-call':
      case 'function-call-llm':
      case 'tool-call': {
        // Vapi's current `tool-calls` event carries a `toolCallList`
        // array (`{id, name, parameters}`, parameters already parsed —
        // NOT a JSON string). Older/legacy shapes use singular
        // `toolCall` or an OpenAI-style `function` object. Every call
        // in the batch is executed and returned — Vapi expects a
        // `results` entry for each `toolCallId` it sent, not just the
        // first (a prior version of this handler only executed the
        // first call in a batch, which silently dropped every
        // additional tool call in the same turn).
        const calls: any[] =
          body.toolCallList ??
          toolCalls ??
          (toolCall ? [toolCall] : fn ? [body] : []);
        if (calls.length === 0) {
          return { status: 'no_tool_call' };
        }
        const results = await Promise.all(
          calls.map((c) => this.functionCallHandler.handle(c, call ?? body, body)),
        );
        return {
          results: results.map((r) => ({
            toolCallId: r.toolCallId,
            name: r.toolName,
            result:
              typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
          })),
        };
      }

      // ---------------------------------------------------------------
      // Acknowledged, no side effects
      // ---------------------------------------------------------------
      case 'hang':
      case 'conversation-update':
      case 'speech-update':
        this.logger.log(`Received ${type} event for call ${call?.id ?? '?'}`);
        return { status: 'acknowledged' };

      // ---------------------------------------------------------------
      // Not implemented — this integration uses a static per-number
      // assistant assignment, so Vapi should not send
      // `assistant-request` in the first place (it's only triggered
      // by dynamic-assistant phone number configuration, a dashboard
      // setting this integration does not enable). Logged loudly
      // because receiving one anyway indicates a dashboard
      // misconfiguration.
      // ---------------------------------------------------------------
      case 'assistant-request':
        this.logger.warn(
          'Received assistant-request — this integration does not support dynamic ' +
            'per-call assistant selection. Verify the Vapi phone number is attached ' +
            'to a static assistantId, not "dynamic".',
        );
        return { status: 'unsupported_event_type', type };

      default:
        this.logger.warn(`Unknown Vapi webhook type: ${type}`);
        return { status: 'unknown_event_type', type };
    }
  }

  /**
   * Map Vapi's `endedReason` enum (see docs.vapi.ai/calls/call-ended-reason)
   * onto this app's `VoiceCallOutcome` enum. Defaults to `null` (left
   * unset) for reasons that don't map cleanly — `normalizeOutcome` in
   * the call-ended handler already discards unrecognized strings, so
   * this only needs to cover the common cases worth reporting on.
   */
  private mapEndedReasonToOutcome(endedReason?: string): string | undefined {
    if (!endedReason) return undefined;
    const r = endedReason.toLowerCase();
    if (r.includes('transfer')) return 'TRANSFERRED';
    if (r.includes('voicemail')) return 'VOICEMAIL';
    if (
      r.includes('customer-did-not-answer') ||
      r.includes('no-answer') ||
      r.includes('customer-busy') ||
      r.includes('silence')
    ) {
      return 'ABANDONED';
    }
    if (r.includes('error') || r.includes('failed') || r.includes('pipeline')) {
      return 'FAILED';
    }
    if (r.includes('hangup') || r.includes('assistant-ended-call') || r.includes('customer-ended-call')) {
      return 'COMPLETED';
    }
    return undefined;
  }

  /**
   * Build the `VapiCallEndedInput` shape `VapiCallEndedHandler` expects
   * from a real `end-of-call-report` payload. The report's data lives
   * partly on `body.call` (the Call Object) and partly on top-level
   * fields (`endedReason`, `artifact`, `durationSeconds`, `cost`,
   * `analysis`) — the handler's pre-existing `summary` sub-object shape
   * is preserved so `VapiCallEndedHandler` itself needs no changes.
   */
  private normalizeEndOfCallReport(body: any): any {
    const call = body.call ?? {};
    const artifact = body.artifact ?? {};
    const analysis = body.analysis ?? {};
    const startedAt = call.startedAt ? new Date(call.startedAt).getTime() : undefined;
    const endedAt = call.endedAt ? new Date(call.endedAt).getTime() : undefined;
    const durationSeconds =
      body.durationSeconds ??
      call.durationSeconds ??
      (startedAt && endedAt ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : undefined);

    return {
      ...call,
      id: call.id ?? body.callId,
      endedAt: call.endedAt ?? body.endedAt,
      recordingUrl:
        artifact.recording?.recordingUrl ??
        artifact.recording?.stereoRecordingUrl ??
        artifact.recordingUrl ??
        call.recordingUrl,
      transcript: artifact.transcript ?? call.transcript,
      durationSeconds,
      summary: {
        durationSeconds,
        outcome:
          this.mapEndedReasonToOutcome(body.endedReason) ??
          body.summary?.outcome,
        costUsd: body.cost ?? call.cost ?? body.summary?.costUsd,
        sentimentScore: analysis.sentimentScore ?? body.summary?.sentimentScore,
        customerSatisfaction: body.summary?.customerSatisfaction,
        aiAccuracyScore: body.summary?.aiAccuracyScore,
        intent: body.summary?.intent,
        toolCallsCount: body.summary?.toolCallsCount,
        humanHandoffTriggered: body.summary?.humanHandoffTriggered,
      },
    };
  }
}

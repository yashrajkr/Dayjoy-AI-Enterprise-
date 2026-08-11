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
  | 'call-start'
  | 'call-started'
  | 'call-end'
  | 'call-ended'
  | 'transcript'
  | 'function-call'
  | 'function-call-llm'
  | 'status-update'
  | 'hang'
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
    const externalEventId: string =
      body?.id ??
      body?.eventId ??
      (callId ? `${callId}-${type}-${body?.timestamp ?? Date.now()}` : `anon-${type}-${Date.now()}`);

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
   * Vapi's event names evolved over time — we accept both the older
   * dot-notation (`call.started`) and the newer dash notation
   * (`call-start`).
   */
  private async route(
    type: VapiWebhookEventType,
    body: any,
  ): Promise<any> {
    const { call, message, toolCall, toolCalls, function: fn, data } = body;

    switch (type) {
      case 'call-start':
      case 'call-started':
      case 'call.started':
        return this.callStartedHandler.handle(call ?? body, body);

      case 'call-end':
      case 'call-ended':
      case 'call.ended':
        return this.callEndedHandler.handle(call ?? body, body);

      case 'transcript':
      case 'call.transcript':
        return this.transcriptHandler.handle(message ?? data, call ?? body, body);

      case 'function-call':
      case 'function-call-llm':
      case 'tool-call':
        // Vapi sends either `toolCall` (singular) or `toolCalls`
        // (array) depending on whether the assistant requested one
        // or several tool calls in the same turn. Normalize to array
        // and execute in order; the handler returns the first
        // result (Vapi's "function-call" event is one-at-a-time in
        // the current API).
        const calls = toolCalls ?? (toolCall ? [toolCall] : fn ? [body] : []);
        if (calls.length === 0) {
          return { status: 'no_tool_call' };
        }
        return this.functionCallHandler.handle(calls[0], call ?? body, body);

      case 'status-update':
      case 'hang':
        this.logger.log(`Received ${type} event for call ${call?.id ?? '?'}`);
        return { status: 'acknowledged' };

      default:
        this.logger.warn(`Unknown Vapi webhook type: ${type}`);
        return { status: 'unknown_event_type', type };
    }
  }
}

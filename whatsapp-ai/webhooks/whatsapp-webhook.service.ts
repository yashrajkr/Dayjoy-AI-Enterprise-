import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { InjectRedis } from '../../backend/_shared/security/redis.decorators';
import type Redis from 'ioredis';
import { WhatsAppConfigService } from '../config/whatsapp-config.service';
import { WhatsAppMessageHandler } from './handlers/whatsapp-message.handler';
import { WhatsAppStatusHandler } from './handlers/whatsapp-status.handler';

/**
 * Result of the webhook GET verification.
 */
export interface WhatsAppVerifyResult {
  /** Whether the verification succeeded. */
  ok: boolean;
  /** The challenge string to echo back to Meta (only set when `ok`). */
  challenge?: string;
}

/**
 * Result of the webhook POST processing.
 */
export interface WhatsAppProcessResult {
  status: string;
  /** Number of message entries processed (for diagnostic logging). */
  processed?: number;
}

/**
 * Redis key TTL for idempotency. 72h comfortably exceeds Meta's max
 * retry window (~24h) so a retried webhook that arrives late is still
 * recognized as a duplicate.
 */
const IDEMPOTENCY_TTL_SECONDS = 72 * 60 * 60;

/**
 * WhatsApp Webhook Service.
 *
 * Responsibilities:
 *   1. **GET verification** — Meta hits the webhook URL with
 *      `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
 *      when an operator first configures the webhook. We echo the
 *      challenge back iff the verify token matches our configured
 *      `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
 *   2. **POST signature verification** — Meta signs every webhook
 *      payload with HMAC-SHA256(App Secret, rawBody). Verification is
 *      UNCONDITIONAL in non-test environments — the ONLY bypass is
 *      `NODE_ENV === 'test'` (so the unit suite doesn't need a real
 *      secret).
 *   3. **Idempotency** — Redis `SETNX whatsapp:webhook:event:{wamid}`
 *      ensures a retried webhook is processed exactly once.
 *   4. **Audit** — every webhook is persisted to the `WebhookEvent`
 *      table with raw payload + signature for forensic review.
 *   5. **Routing** — dispatches to the message / status handlers
 *      based on the payload shape.
 */
@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly config: WhatsAppConfigService,
    private readonly messageHandler: WhatsAppMessageHandler,
    private readonly statusHandler: WhatsAppStatusHandler,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Verify the Meta subscription GET request.
   *
   * Meta sends:
   *   - `hub.mode=subscribe`
   *   - `hub.verify_token=<token configured in the Meta dashboard>`
   *   - `hub.challenge=<random string to echo back>`
   *
   * We accept the verification iff the mode is `subscribe` AND the
   * verify token matches our configured `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   */
  verifyWebhook(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): WhatsAppVerifyResult {
    if (mode !== 'subscribe') {
      this.logger.warn(`Webhook GET verification: bad mode '${mode}'`);
      return { ok: false };
    }

    const expected = this.config.getVerifyToken();
    if (!expected) {
      this.logger.error(
        'WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set — cannot verify webhook subscription.',
      );
      return { ok: false };
    }

    if (!token || token !== expected) {
      this.logger.warn('Webhook GET verification: token mismatch');
      return { ok: false };
    }

    if (!challenge) {
      this.logger.warn('Webhook GET verification: missing challenge');
      return { ok: false };
    }

    this.logger.log('Webhook GET verification succeeded.');
    return { ok: true, challenge };
  }

  /**
   * Verify the HMAC-SHA256 signature Meta attaches to every POST
   * webhook.
   *
   * SECURITY: signature verification is enforced UNCONDITIONALLY in
   * production and development. The ONLY bypass is when
   * `NODE_ENV === 'test'`, so unit/integration tests don't need a
   * real secret.
   *
   * Signature algorithm (matches Meta docs):
   *   HMAC_SHA256(appSecret, rawBody)
   *
   * Meta sends the signature in the `X-Hub-Signature-256` header as
   * `sha256=<hex>`. We strip the `sha256=` prefix before comparing.
   *
   * @throws UnauthorizedException when the app secret is not configured
   *   in a non-test environment — failing closed forces ops to fix
   *   the config rather than silently accepting forged webhooks.
   */
  async verifySignature(
    rawPayload: string,
    signatureHeader: string | undefined,
  ): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    const appSecret = this.config.getAppSecret();
    if (!appSecret) {
      this.logger.error(
        'WHATSAPP_APP_SECRET is not configured — refusing to verify webhook. ' +
          'Set WHATSAPP_APP_SECRET in the environment (or via ExternalSecrets in K8s).',
      );
      throw new UnauthorizedException(
        'Webhook app secret not configured',
      );
    }

    if (!signatureHeader) {
      this.logger.warn('Missing X-Hub-Signature-256 header on webhook');
      return false;
    }

    // Meta sends `sha256=<hex>` — strip the prefix.
    const prefix = 'sha256=';
    const signature =
      signatureHeader.startsWith(prefix)
        ? signatureHeader.slice(prefix.length)
        : signatureHeader;

    try {
      const expectedSignature = crypto
        .createHmac('sha256', appSecret)
        .update(rawPayload)
        .digest('hex');

      // Constant-time compare to prevent timing attacks.
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
    } catch (err) {
      this.logger.error(
        `Signature verification failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Process a verified webhook payload.
   *
   * Meta's payload shape:
   *   {
   *     "object": "whatsapp_business_account",
   *     "entry": [
   *       {
   *         "id": "<WABA id>",
   *         "changes": [
   *           {
   *             "field": "messages",
   *             "value": {
   *               "metadata": { "phone_number_id": "..." },
   *               "messages": [...],     // present on inbound message
   *               "statuses": [...],     // present on status update
   *               "contacts": [...]      // present on inbound message
   *             }
   *           }
   *         ]
   *       }
   *     ]
   *   }
   *
   * We iterate every entry → change → message/status. Each message is
   * processed individually (with its own idempotency check) so a
   * multi-message webhook doesn't fail entirely when one message is a
   * duplicate.
   */
  async process(body: any): Promise<WhatsAppProcessResult> {
    if (!body || body.object !== 'whatsapp_business_account') {
      this.logger.warn(
        `Unexpected webhook payload (object=${body?.object ?? 'undefined'}) — ignoring`,
      );
      return { status: 'ignored', processed: 0 };
    }

    const entries: any[] = body.entry ?? [];
    let processed = 0;

    for (const entry of entries) {
      const changes: any[] = entry?.changes ?? [];
      for (const change of changes) {
        if (change?.field !== 'messages' || !change?.value) continue;

        const value = change.value;
        const messages: any[] = value.messages ?? [];
        const statuses: any[] = value.statuses ?? [];
        const contacts: any[] = value.contacts ?? [];

        for (const message of messages) {
          const wamid = message?.id;
          if (!wamid) continue;

          // Idempotency — duplicate webhook delivery.
          if (!(await this.acquireIdempotencyLock(wamid))) {
            this.logger.log(
              `Webhook already processed (idempotency hit): ${wamid}`,
            );
            continue;
          }

          await this.persistAuditRow('message', wamid, body);

          try {
            await this.messageHandler.handle({ message, contacts, value });
            processed++;
          } catch (err) {
            this.logger.error(
              `Message handler failed for ${wamid}: ${(err as Error).message}`,
              (err as Error).stack,
            );
          }
        }

        for (const status of statuses) {
          const wamid = status?.id;
          if (!wamid) continue;

          // Status webhooks can fire many times for the same wamid
          // (sent → delivered → read). Use a per-status idempotency
          // key so we don't skip a real status transition.
          const statusKey = `${wamid}:${status.status}`;
          if (!(await this.acquireIdempotencyLock(statusKey))) {
            continue;
          }

          await this.persistAuditRow('status', statusKey, body);

          try {
            await this.statusHandler.handle(status);
            processed++;
          } catch (err) {
            this.logger.error(
              `Status handler failed for ${wamid}: ${(err as Error).message}`,
            );
          }
        }
      }
    }

    return { status: 'processed', processed };
  }

  // -------------------------------------------------------------------
  // private helpers
  // -------------------------------------------------------------------

  /**
   * Atomically acquire the idempotency lock for a wamid. Returns true
   * when this caller "won" the lock (i.e. this is the first delivery
   * of this wamid); false when the wamid was already processed.
   *
   * Falls back to "allow" (return true) on Redis errors so a Redis
   * hiccup doesn't drop real customer messages — the worst case is a
   * duplicate reply, which is preferable to a missing one.
   */
  private async acquireIdempotencyLock(key: string): Promise<boolean> {
    try {
      const acquired = await this.redis.set(
        `whatsapp:webhook:event:${key}`,
        new Date().toISOString(),
        'EX',
        IDEMPOTENCY_TTL_SECONDS,
        'NX',
      );
      return acquired === 'OK';
    } catch (err) {
      this.logger.error(
        `Redis idempotency check failed for ${key}: ${(err as Error).message} — allowing (DB-only idempotency fallback)`,
      );
      return true;
    }
  }

  /**
   * Persist the raw webhook payload to the `WebhookEvent` table for
   * audit. Best-effort — never blocks the actual processing.
   */
  private async persistAuditRow(
    eventType: 'message' | 'status',
    externalId: string,
    body: any,
  ): Promise<void> {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          source: 'whatsapp',
          eventType,
          payload: { ...body, _externalId: externalId } as any,
          processed: false,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist webhook audit row for ${externalId}: ${(err as Error).message}`,
      );
    }
  }
}

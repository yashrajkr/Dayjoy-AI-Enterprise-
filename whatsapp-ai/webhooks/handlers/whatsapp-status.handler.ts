import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../backend/_shared/database/prisma.service';
import { WhatsAppSessionMemoryService } from '../../services/whatsapp-session-memory.service';

/**
 * Meta status update states.
 *
 * For outbound messages Meta fires (in order):
 *   sent → delivered → read
 *
 * For inbound messages Meta fires `received` once. (We already
 * persist the inbound row in the message handler — the status update
 * is informational only.)
 *
 * Failed messages fire `failed` with an `errors` array.
 */
export type WhatsAppStatusValue =
  | 'sent'
  | 'delivered'
  | 'read'
  | 'received'
  | 'failed';

/**
 * Status payload as Meta sends it inside `value.statuses[]`.
 */
export interface WhatsAppStatusPayload {
  /** Meta wamid of the outbound (or inbound) message. */
  id: string;
  /** Sender (for outbound) or recipient (for inbound) phone number. */
  recipient_id?: string;
  /** New status. */
  status: WhatsAppStatusValue | string;
  /** ISO timestamp (Meta sends unix seconds). */
  timestamp?: string;
  /** Conversation context object (Meta's billing grouping). */
  conversation?: { id: string; expiration_timestamp?: number; origin: { type: string } };
  /** Pricing/billing info. */
  pricing?: { billable: boolean; pricing_model: string; category: string };
  /** Errors (present only on `failed`). */
  errors?: Array<{ code: number; title: string; message: string }>;
}

/**
 * WhatsApp Status Handler.
 *
 * Updates the persisted `WhatsappMessage` row's `status` column
 * whenever Meta delivers a status webhook (sent / delivered / read /
 * failed). The lookup is by `messageId` (the wamid) — which is the
 * unique key on the `whatsapp_messages` table.
 *
 * For the `received` status (inbound), the message row has already
 * been created by the message handler — we just flip the status.
 *
 * For outbound messages, the message row was created by the
 * `WhatsAppMessageProcessorService` with the wamid returned by Meta
 * on send (or a `local-` prefixed id when the send failed). The
 * status webhook for `local-` ids will never arrive (Meta doesn't
 * know about them) — those rows stay at `failed`.
 */
@Injectable()
export class WhatsAppStatusHandler {
  private readonly logger = new Logger(WhatsAppStatusHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionMemory: WhatsAppSessionMemoryService,
  ) {}

  async handle(rawStatus: any): Promise<void> {
    const status = this.normalize(rawStatus);
    if (!status) {
      this.logger.warn(
        `Could not normalize WhatsApp status payload: ${JSON.stringify(rawStatus).slice(0, 200)}`,
      );
      return;
    }

    this.logger.debug(
      `WhatsApp status: wamid=${status.id} status=${status.status}`,
    );

    // Update the persisted message row.
    try {
      const updated = await this.prisma.whatsappMessage.updateMany({
        where: { messageId: status.id },
        data: {
          status: status.status,
          metadata: {
            statusUpdateAt: new Date().toISOString(),
            conversation: status.conversation ?? undefined,
            pricing: status.pricing ?? undefined,
            errors: status.errors ?? undefined,
          } as any,
        },
      });

      if (updated.count === 0) {
        // Status update for a message we don't have a row for — this
        // can happen when Meta retries a webhook after we already
        // processed it. Log at debug to avoid noise.
        this.logger.debug(
          `Status update for unknown wamid ${status.id} — ignoring`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to update WhatsAppMessage status for ${status.id}: ${(err as Error).message}`,
      );
    }

    // On `failed`, also flag the session for human-review.
    if (status.status === 'failed' && status.errors?.length) {
      const phoneNumber = await this.sessionMemory
        .getPhoneNumberByMessageId(status.id)
        .catch(() => null);
      if (phoneNumber) {
        await this.sessionMemory
          .merge(phoneNumber, {
            escalationTriggered: true,
            lastError: status.errors[0]?.message,
          })
          .catch(() => undefined);
      }
      this.logger.warn(
        `WhatsApp message ${status.id} failed: ${status.errors
          .map((e) => `[${e.code}] ${e.message}`)
          .join('; ')}`,
      );
    }
  }

  /**
   * Normalize Meta's raw status payload into a typed
   * {@link WhatsAppStatusPayload}.
   */
  private normalize(raw: any): WhatsAppStatusPayload | null {
    if (!raw || !raw.id || !raw.status) return null;
    return {
      id: raw.id,
      recipient_id: raw.recipient_id,
      status: raw.status,
      timestamp: raw.timestamp
        ? new Date(Number(raw.timestamp) * 1000).toISOString()
        : undefined,
      conversation: raw.conversation,
      pricing: raw.pricing,
      errors: raw.errors,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppMessageProcessorService } from '../../services/whatsapp-message-processor.service';
import { WhatsAppClientService } from '../../client/whatsapp-client.service';

/**
 * Normalized inbound message shape extracted from the Meta webhook.
 */
export interface WhatsAppInboundMessage {
  /** Meta wamid (e.g. `wamid.HKg...`). */
  id: string;
  /** Sender phone number (E.164, no `+`). */
  from: string;
  /** Message type: `text`, `image`, `audio`, `video`, `document`, `interactive`, `location`, etc. */
  type: string;
  /** Text body (only for `text` messages). */
  text?: string;
  /** Sender display name (from the `contacts` array). */
  name?: string;
  /** Inbound timestamp (ISO). */
  timestamp?: string;
}

/**
 * WhatsApp Message Handler.
 *
 * Receives an inbound message payload from the webhook service and:
 *   1. Sends a read receipt immediately (Meta quality-rating expects
 *      fast read receipts on inbound messages).
 *   2. Normalizes the payload into a {@link WhatsAppInboundMessage}.
 *   3. Delegates text messages to the AI pipeline
 *      ({@link WhatsAppMessageProcessorService}). Non-text messages
 *      (image / audio / video / etc.) currently emit a polite
 *      "I can't process that yet" reply — full multi-modal support is
 *      a future enhancement.
 */
@Injectable()
export class WhatsAppMessageHandler {
  private readonly logger = new Logger(WhatsAppMessageHandler.name);

  constructor(
    private readonly processor: WhatsAppMessageProcessorService,
    private readonly client: WhatsAppClientService,
  ) {}

  /**
   * Handle an inbound message payload.
   *
   * @param payload The full `value` object from the webhook payload
   *                (carries `messages`, `contacts`, `metadata`).
   */
  async handle(payload: {
    message: any;
    contacts: any[];
    value: any;
  }): Promise<void> {
    const inbound = this.normalize(payload);
    if (!inbound) {
      this.logger.warn(
        `Could not normalize inbound WhatsApp message: ${JSON.stringify(payload.message).slice(0, 200)}`,
      );
      return;
    }

    // 1. Send read receipt (best-effort, fire-and-forget).
    this.client
      .markMessageAsRead(inbound.id)
      .catch((err) =>
        this.logger.debug(
          `Failed to mark message ${inbound.id} as read: ${(err as Error).message}`,
        ),
      );

    // 2. Route by message type.
    if (inbound.type === 'text' && inbound.text) {
      await this.processor.processInboundText({
        from: inbound.from,
        name: inbound.name,
        text: inbound.text,
        messageId: inbound.id,
        timestamp: inbound.timestamp,
      });
      return;
    }

    // 3. Non-text fallback — politely tell the customer we can't help yet.
    this.logger.log(
      `Inbound WhatsApp message ${inbound.id} of unsupported type '${inbound.type}' — sending fallback reply`,
    );
    try {
      await this.client.sendTextMessage(
        inbound.from,
        "Thanks for your message! I can currently only respond to text messages. " +
          'Please type your question, or reply with "human" to talk to an agent.',
      );
    } catch (err) {
      this.logger.error(
        `Failed to send fallback reply to ${inbound.from}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Normalize Meta's webhook payload into a flat
   * {@link WhatsAppInboundMessage}. Returns `null` when the payload
   * is missing required fields (a malformed webhook).
   */
  private normalize(payload: {
    message: any;
    contacts: any[];
    value: any;
  }): WhatsAppInboundMessage | null {
    const m = payload.message;
    if (!m || !m.id || !m.from) return null;

    const type: string = m.type ?? 'unknown';
    const text: string | undefined =
      type === 'text' ? m.text?.body : undefined;

    // Meta's `contacts` array (when present) carries the WhatsApp
    // profile name (`profile.name`). Falls back to the wa_id.
    const contact = payload.contacts?.find((c) => c.wa_id === m.from);
    const name: string | undefined =
      contact?.profile?.name ?? contact?.wa_id;

    const timestamp: string | undefined = m.timestamp
      ? new Date(Number(m.timestamp) * 1000).toISOString()
      : undefined;

    return {
      id: m.id,
      from: m.from,
      type,
      text,
      name,
      timestamp,
    };
  }
}

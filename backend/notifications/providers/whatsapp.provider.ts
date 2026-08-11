import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendNotificationDto } from '../dto/send-notification.dto';
import {
  NotificationProvider,
  ProviderDispatchResult,
} from './notification.provider.interface';

/**
 * WhatsApp provider — REAL implementation backed by the Meta Cloud API.
 *
 * Sends a text message via `POST https://graph.facebook.com/v18.0/{phoneNumberId}/messages`
 * using a bearer token. Reads from env:
 *   - WHATSAPP_TOKEN           — Meta system-user access token (REQUIRED)
 *   - WHATSAPP_PHONE_NUMBER_ID — Meta phone-number id (REQUIRED)
 *
 * If `WHATSAPP_TOKEN` (or `WHATSAPP_PHONE_NUMBER_ID`) is missing, the
 * provider logs a warning and returns `success: false` so the
 * notifications pipeline marks the row FAILED.
 *
 * Uses the global `fetch` (Node 18+) — no extra SDK required.
 */
@Injectable()
export class WhatsAppProvider implements NotificationProvider {
  private readonly logger = new Logger(WhatsAppProvider.name);
  readonly name = 'whatsapp';
  readonly channel = 'WHATSAPP';

  private readonly GRAPH_API_VERSION = 'v18.0';

  constructor(private readonly config: ConfigService) {}

  async dispatch(dto: SendNotificationDto): Promise<ProviderDispatchResult> {
    const token =
      this.config.get<string>('WHATSAPP_TOKEN') ?? process.env.WHATSAPP_TOKEN;
    const phoneNumberId =
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') ??
      process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token) {
      this.logger.warn(
        'WhatsAppProvider: WHATSAPP_TOKEN is not set. Skipping dispatch — ' +
          'set the env var to enable real WhatsApp delivery.',
      );
      return {
        success: false,
        errorMessage:
          'WhatsApp provider not configured: WHATSAPP_TOKEN must be set',
      };
    }
    if (!phoneNumberId) {
      this.logger.warn(
        'WhatsAppProvider: WHATSAPP_PHONE_NUMBER_ID is not set. Skipping dispatch.',
      );
      return {
        success: false,
        errorMessage:
          'WhatsApp provider not configured: WHATSAPP_PHONE_NUMBER_ID must be set',
      };
    }

    if (!dto.recipient) {
      return {
        success: false,
        errorMessage:
          'WhatsApp dispatch requires dto.recipient (the E.164 phone number)',
      };
    }

    const url = `https://graph.facebook.com/${this.GRAPH_API_VERSION}/${phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: dto.recipient,
      type: 'text',
      text: {
        body: dto.body,
        preview_url: false,
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string; code?: number };
      };

      if (!res.ok) {
        const errMsg = json.error?.message ?? `HTTP ${res.status}`;
        this.logger.error(
          `WhatsAppProvider: Meta API error to=${dto.recipient}: ${errMsg}`,
        );
        return {
          success: false,
          errorMessage: `WhatsApp dispatch failed: ${errMsg}`,
        };
      }

      const messageId = json.messages?.[0]?.id;
      return {
        success: true,
        providerMessageId: messageId,
        response: json,
      };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(
        `WhatsAppProvider: fetch failed to=${dto.recipient}: ${message}`,
      );
      return {
        success: false,
        errorMessage: `WhatsApp dispatch failed: ${message}`,
      };
    }
  }
}

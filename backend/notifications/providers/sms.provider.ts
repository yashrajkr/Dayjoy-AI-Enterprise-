import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendNotificationDto } from '../dto/send-notification.dto';
import {
  NotificationProvider,
  ProviderDispatchResult,
} from './notification.provider.interface';

/**
 * SMS provider — REAL implementation backed by the Twilio SDK.
 *
 * Twilio credentials are read from env:
 *   - TWILIO_ACCOUNT_SID  — Twilio account SID (AC...)
 *   - TWILIO_AUTH_TOKEN   — Twilio auth token
 *   - TWILIO_FROM_NUMBER  — Source phone number (E.164)
 *
 * If `TWILIO_ACCOUNT_SID` or `TWILIO_AUTH_TOKEN` is missing, the provider
 * logs a warning and returns `success: false` so the notification row is
 * marked FAILED instead of silently dropping.
 *
 * `twilio` is loaded lazily via `require()` so the package is an optional
 * runtime dependency — the TypeScript build does not require `@types/twilio`.
 */
@Injectable()
export class SmsProvider implements NotificationProvider {
  private readonly logger = new Logger(SmsProvider.name);
  readonly name = 'sms';
  readonly channel = 'SMS';

  constructor(private readonly config: ConfigService) {}

  async dispatch(dto: SendNotificationDto): Promise<ProviderDispatchResult> {
    const accountSid =
      this.config.get<string>('TWILIO_ACCOUNT_SID') ??
      process.env.TWILIO_ACCOUNT_SID;
    const authToken =
      this.config.get<string>('TWILIO_AUTH_TOKEN') ??
      process.env.TWILIO_AUTH_TOKEN;
    const fromNumber =
      this.config.get<string>('TWILIO_FROM_NUMBER') ??
      process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken) {
      this.logger.warn(
        'SmsProvider: Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN). ' +
          'Skipping dispatch — set the env vars to enable real SMS delivery.',
      );
      return {
        success: false,
        errorMessage:
          'SMS provider not configured: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set',
      };
    }

    if (!dto.recipient) {
      return {
        success: false,
        errorMessage: 'SMS dispatch requires dto.recipient (the E.164 phone number)',
      };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio') as (
        sid: string,
        token: string,
      ) => {
        messages: {
          create: (opts: Record<string, unknown>) => Promise<{ sid: string }>;
        };
      };

      const client = twilio(accountSid, authToken);
      const message = await client.messages.create({
        to: dto.recipient,
        from: fromNumber,
        body: dto.body,
      });

      return {
        success: true,
        providerMessageId: message.sid,
        response: { sid: message.sid },
      };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(
        `SmsProvider: Twilio send failed to=${dto.recipient}: ${message}`,
      );
      return {
        success: false,
        errorMessage: `SMS dispatch failed: ${message}`,
      };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendNotificationDto } from '../dto/send-notification.dto';
import {
  NotificationProvider,
  ProviderDispatchResult,
} from './notification.provider.interface';

/**
 * Email provider — REAL implementation backed by Nodemailer SMTP.
 *
 * SMTP credentials are read from env:
 *   - SMTP_HOST        — SMTP server hostname (e.g. smtp.gmail.com)
 *   - SMTP_PORT        — SMTP port (587 for STARTTLS, 465 for SSL)
 *   - SMTP_USER        — SMTP username
 *   - SMTP_PASSWORD    — SMTP password (REQUIRED — if missing, the
 *     provider logs a warning and returns `success: false` so the
 *     notifications pipeline marks the row FAILED instead of silently
 *     dropping it)
 *   - SMTP_FROM        — From address (defaults to SMTP_USER)
 *   - SMTP_FROM_NAME   — Display name for the From address (optional)
 *
 * `nodemailer` is loaded lazily via `require()` so the package is an
 * optional runtime dependency — the TypeScript build does not require
 * `@types/nodemailer` and the app boots fine when SMTP is unconfigured.
 */
@Injectable()
export class EmailProvider implements NotificationProvider {
  private readonly logger = new Logger(EmailProvider.name);
  readonly name = 'email';
  readonly channel = 'EMAIL';

  constructor(private readonly config: ConfigService) {}

  async dispatch(dto: SendNotificationDto): Promise<ProviderDispatchResult> {
    const host = this.config.get<string>('SMTP_HOST') ?? process.env.SMTP_HOST;
    const port = this.config.get<number>('SMTP_PORT') ?? Number(process.env.SMTP_PORT ?? 587);
    const user = this.config.get<string>('SMTP_USER') ?? process.env.SMTP_USER;
    const password =
      this.config.get<string>('SMTP_PASSWORD') ?? process.env.SMTP_PASSWORD;
    const fromAddress =
      this.config.get<string>('SMTP_FROM') ?? process.env.SMTP_FROM ?? user;
    const fromName =
      this.config.get<string>('SMTP_FROM_NAME') ?? process.env.SMTP_FROM_NAME;

    if (!host || !user || !password || !fromAddress) {
      this.logger.warn(
        'EmailProvider: SMTP credentials not configured (SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_FROM). ' +
          'Skipping dispatch — set the env vars to enable real email delivery.',
      );
      return {
        success: false,
        errorMessage:
          'Email provider not configured: SMTP_HOST/SMTP_USER/SMTP_PASSWORD/SMTP_FROM must be set',
      };
    }

    if (!dto.recipient) {
      return {
        success: false,
        errorMessage: 'Email dispatch requires dto.recipient (the email address)',
      };
    }

    try {
      // Lazily require nodemailer so the package is an optional runtime dep.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer') as {
        createTransport: (opts: Record<string, unknown>) => {
          sendMail: (opts: Record<string, unknown>) => Promise<{ messageId: string }>;
        };
      };

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: Number(port) === 465,
        auth: { user, pass: password },
      });

      const fromHeader = fromName
        ? `"${fromName}" <${fromAddress}>`
        : fromAddress;

      const info = await transporter.sendMail({
        from: fromHeader,
        to: dto.recipient,
        subject: dto.subject ?? '(no subject)',
        text: dto.body,
        html: dto.bodyHtml ?? undefined,
      });

      return {
        success: true,
        providerMessageId: info.messageId,
        response: { messageId: info.messageId },
      };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(
        `EmailProvider: sendMail failed to=${dto.recipient}: ${message}`,
      );
      return {
        success: false,
        errorMessage: `Email dispatch failed: ${message}`,
      };
    }
  }
}

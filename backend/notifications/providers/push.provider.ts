import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendNotificationDto } from '../dto/send-notification.dto';
import {
  NotificationProvider,
  ProviderDispatchResult,
} from './notification.provider.interface';

/**
 * Mobile push provider — REAL implementation backed by Firebase Admin SDK.
 *
 * Service-account credentials are read from env:
 *   - FIREBASE_PROJECT_ID           — Firebase project id
 *   - FIREBASE_CLIENT_EMAIL         — Service-account client email
 *   - FIREBASE_PRIVATE_KEY          — Service-account private key
 *     (PEM-encoded; newlines must be `\n`-escaped in env vars)
 *   - FIREBASE_CREDENTIALS_PATH     — Optional: path to a service-account
 *     JSON file (takes precedence over the individual env vars)
 *
 * If no service-account is configured, the provider logs a warning and
 * returns `success: false` so the notification row is marked FAILED.
 *
 * `firebase-admin` is loaded lazily via `require()` so the package is an
 * optional runtime dependency — the TypeScript build does not require
 * `@types/firebase-admin`.
 */
@Injectable()
export class PushProvider implements NotificationProvider {
  private readonly logger = new Logger(PushProvider.name);
  readonly name = 'push';
  readonly channel = 'PUSH';

  constructor(private readonly config: ConfigService) {}

  private resolveServiceAccount(): Record<string, string> | null {
    const credentialsPath =
      this.config.get<string>('FIREBASE_CREDENTIALS_PATH') ??
      process.env.FIREBASE_CREDENTIALS_PATH;
    if (credentialsPath) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs') as { readFileSync: (p: string) => Buffer };
        const raw = fs.readFileSync(credentialsPath).toString('utf-8');
        return JSON.parse(raw) as Record<string, string>;
      } catch (err) {
        this.logger.warn(
          `PushProvider: failed to read FIREBASE_CREDENTIALS_PATH=${credentialsPath}: ${(err as Error).message}`,
        );
      }
    }

    const projectId =
      this.config.get<string>('FIREBASE_PROJECT_ID') ??
      process.env.FIREBASE_PROJECT_ID;
    const clientEmail =
      this.config.get<string>('FIREBASE_CLIENT_EMAIL') ??
      process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw =
      this.config.get<string>('FIREBASE_PRIVATE_KEY') ??
      process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKeyRaw) {
      return null;
    }
    // Env vars often escape newlines as literal `\n`.
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    return { projectId, clientEmail, privateKey };
  }

  async dispatch(dto: SendNotificationDto): Promise<ProviderDispatchResult> {
    const serviceAccount = this.resolveServiceAccount();
    if (!serviceAccount) {
      this.logger.warn(
        'PushProvider: Firebase service account not configured ' +
          '(set FIREBASE_CREDENTIALS_PATH or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY). ' +
          'Skipping dispatch.',
      );
      return {
        success: false,
        errorMessage:
          'Push provider not configured: Firebase service-account credentials must be set',
      };
    }

    if (!dto.recipient) {
      return {
        success: false,
        errorMessage: 'Push dispatch requires dto.recipient (the device push token)',
      };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const admin = require('firebase-admin') as {
        initializeApp: (
          cfg: { credential: unknown },
          name?: string,
        ) => unknown;
        credential: {
          cert: (sa: Record<string, string>) => unknown;
        };
        messaging: () => {
          send: (msg: Record<string, unknown>) => Promise<string>;
        };
        app: (name?: string) => { name: string } | undefined;
      };

      // Initialise once per process — guard against re-init.
      let appName = 'dayjoy-push';
      try {
        admin.app(appName);
      } catch {
        admin.initializeApp(
          { credential: admin.credential.cert(serviceAccount) },
          appName,
        );
      }

      const message = {
        token: dto.recipient,
        notification: {
          title: dto.subject ?? 'Notification',
          body: dto.body,
        },
        data: dto.metadata ?? {},
      };

      const messageId = await admin.messaging().send(message);
      return {
        success: true,
        providerMessageId: messageId,
        response: { messageId },
      };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(
        `PushProvider: FCM send failed token=${dto.recipient}: ${message}`,
      );
      return {
        success: false,
        errorMessage: `Push dispatch failed: ${message}`,
      };
    }
  }
}

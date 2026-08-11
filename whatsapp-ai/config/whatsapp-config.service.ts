import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  loadWhatsAppConfig,
  validateWhatsAppConfig,
  WhatsAppConfig,
} from './whatsapp.config';

/**
 * WhatsApp Config Service.
 *
 * Thin wrapper around {@link loadWhatsAppConfig} that:
 *  - Validates the loaded config on `onModuleInit` and logs warnings for
 *    every missing required env var (without crashing — the rest of the
 *    app must keep booting when WhatsApp is unconfigured).
 *  - Exposes `getConfig()` for downstream services. The config is
 *    re-read from `process.env` on every call so runtime env mutations
 *    (token rotation via ExternalSecrets, etc.) are honoured.
 *  - Exposes `getAccessToken()` / `getPhoneNumberId()` / `getAppSecret()`
 *    convenience accessors used by the client + webhook verifier.
 *
 * The service is intentionally stateless — the only state it holds is a
 * cached validation result (so we don't re-log the same warnings on
 * every request).
 */
@Injectable()
export class WhatsAppConfigService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppConfigService.name);
  private validated = false;

  /**
   * Validate the config once on bootstrap. Missing required vars are
   * logged as warnings — the app stays up so other features keep
   * working.
   */
  async onModuleInit(): Promise<void> {
    const config = this.getConfig();
    const errors = validateWhatsAppConfig(config);
    if (errors.length > 0) {
      for (const e of errors) this.logger.warn(e);
      this.logger.warn(
        'WhatsApp AI is running in DEGRADED mode — see warnings above. ' +
          'Webhook verification will still reject unsigned payloads.',
      );
    } else {
      this.logger.log('WhatsApp AI config validated.');
    }
    this.validated = true;
  }

  /**
   * Returns `true` once `onModuleInit` has run. Used by tests + the
   * health probe.
   */
  isValidated(): boolean {
    return this.validated;
  }

  /**
   * Returns a fresh config snapshot re-read from `process.env`.
   *
   * Re-reading on every call is cheap (a few dozen string reads) and
   * lets ops rotate `WHATSAPP_TOKEN` / `WHATSAPP_APP_SECRET` via
   * ExternalSecrets without restarting the pod.
   */
  getConfig(): WhatsAppConfig {
    return loadWhatsAppConfig();
  }

  /** Convenience accessor for the Meta access token. */
  getAccessToken(): string {
    return this.getConfig().accessToken;
  }

  /** Convenience accessor for the Phone Number ID. */
  getPhoneNumberId(): string {
    return this.getConfig().phoneNumberId;
  }

  /** Convenience accessor for the App Secret (webhook HMAC key). */
  getAppSecret(): string {
    return this.getConfig().webhook.appSecret;
  }

  /** Convenience accessor for the webhook verify token. */
  getVerifyToken(): string {
    return this.getConfig().webhook.verifyToken;
  }

  /** Convenience: the full messages endpoint URL. */
  getMessagesEndpoint(): string {
    const { api, phoneNumberId } = this.getConfig();
    return `${api.baseUrl}/${api.version}/${phoneNumberId}/messages`;
  }

  /** Convenience: the media endpoint URL (used by `downloadMedia`). */
  getMediaEndpoint(mediaId: string): string {
    const { api } = this.getConfig();
    return `${api.baseUrl}/${api.version}/${mediaId}`;
  }
}

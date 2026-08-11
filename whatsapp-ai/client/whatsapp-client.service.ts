import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppConfigService } from '../config/whatsapp-config.service';

/**
 * Shape of an interactive message payload sent to Meta. Mirrors
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-messages.
 */
export interface WhatsAppInteractive {
  type: 'button' | 'list' | 'cta_url' | 'location_request';
  header?: { type: string; text?: string };
  body: { text: string };
  footer?: { text: string };
  action: Record<string, any>;
}

/**
 * Shape of a media message payload sent to Meta. The `media` object
 * matches the per-type sub-object Meta expects (e.g. `{ id }` for
 * previously-uploaded media, or `{ link }` for a public URL).
 */
export interface WhatsAppMediaPayload {
  /** When `id` is supplied, Meta fetches previously-uploaded media. */
  id?: string;
  /** When `link` is supplied, Meta fetches the media from this URL. */
  link?: string;
  /** Caption (text/audio) — only valid for image / video / document. */
  caption?: string;
  /** Required for documents: the visible filename. */
  filename?: string;
}

/**
 * Result returned by every send method. Mirrors Meta's response shape
 * (sans the wrapping envelope) so callers can introspect the message id.
 */
export interface WhatsAppSendResult {
  /** Meta-assigned message id (`wamid.HKg...`). Used for read receipts. */
  messageId: string;
  /** Status string from Meta (typically `accepted` on success). */
  status: string;
  /** Raw response body, for diagnostic / future-field use. */
  raw?: any;
}

/**
 * Downloaded media blob. Returned by `downloadMedia()` — callers write
 * it to disk / S3 / a CDN.
 */
export interface WhatsAppMediaBlob {
  /** MIME type from the `Content-Type` header. */
  mimeType: string;
  /** Raw media bytes. */
  buffer: Buffer;
  /** Size in bytes (from `Content-Length`). */
  size: number;
}

/**
 * Maximum number of retry attempts for transient (5xx, 429, network)
 * failures. After this we give up — the upstream webhook processor
 * will surface the error to the user (or simply drop the reply).
 */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;

/**
 * WhatsApp Cloud API Client.
 *
 * Thin wrapper around `fetch()` (Node 18+ built-in — no SDK dependency)
 * that exposes the high-level send / receipt-marking / media-download
 * primitives the rest of the WhatsApp subsystem needs.
 *
 * Design notes:
 *  - All HTTP errors are caught and translated into a thrown `Error`
 *    whose `message` includes the Meta error envelope — so the calling
 *    service can log a single line and let Nest's exception filter do
 *    the rest.
 *  - Transient failures (5xx, 429, network errors) are retried with
 *    exponential backoff. Final-attempt failures propagate.
 *  - The access token is read from {@link WhatsAppConfigService} on
 *    every call so runtime env mutations (ExternalSecrets rotation)
 *    are honoured without a restart.
 *  - When `accessToken` is unset (degraded mode), every send method
 *    throws a structured error rather than silently no-op'ing — the
 *    caller is responsible for surfacing the failure to the user.
 */
@Injectable()
export class WhatsAppClientService {
  private readonly logger = new Logger(WhatsAppClientService.name);

  constructor(private readonly config: WhatsAppConfigService) {}

  /**
   * Send a plain-text message.
   *
   * @param to Recipient phone number in international format, no `+` (e.g. `15551234567`).
   * @param text Message body. Meta caps single text messages at 4096 chars.
   */
  async sendTextMessage(to: string, text: string): Promise<WhatsAppSendResult> {
    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    });
  }

  /**
   * Send a pre-approved template message.
   *
   * Templates must be created + approved in the Meta Business Manager
   * before they can be sent. The `language` field is the ISO 639-1 code
   * (e.g. `en_US`, `hi`). `components` is optional and matches the
   * header / body / button parameter structure Meta expects.
   */
  async sendTemplate(
    to: string,
    templateName: string,
    language: string,
    components?: Record<string, any>[],
  ): Promise<WhatsAppSendResult> {
    const template: Record<string, any> = {
      name: templateName,
      language: { code: language },
    };
    if (components && components.length > 0) {
      template.components = components;
    }
    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template,
    });
  }

  /**
   * Send an interactive (button / list / CTA URL) message.
   *
   * Interactive messages let the user reply with a single tap — much
   * higher conversion than free-text for known intents (e.g. "Track my
   * order", "Talk to a human"). The {@link WhatsAppInteractive} shape
   * is a thin wrapper around Meta's interactive object.
   */
  async sendInteractive(
    to: string,
    interactive: WhatsAppInteractive,
  ): Promise<WhatsAppSendResult> {
    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    });
  }

  /**
   * Send a media message (image / video / audio / document / sticker).
   *
   * @param to Recipient phone number.
   * @param type One of `image`, `video`, `audio`, `document`, `sticker`.
   * @param media Media payload — either `{ id }` for previously-uploaded
   *              media, or `{ link }` for a public URL.
   */
  async sendMedia(
    to: string,
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker',
    media: WhatsAppMediaPayload,
  ): Promise<WhatsAppSendResult> {
    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type,
      [type]: media,
    });
  }

  /**
   * Mark an inbound message as read.
   *
   * Sending a read receipt is polite (and required by Meta's quality
   * rating to avoid the "slow response" penalty). Call this immediately
   * after receiving a webhook, before doing any AI processing.
   */
  async markMessageAsRead(messageId: string): Promise<void> {
    const endpoint = this.config.getMessagesEndpoint().replace(
      '/messages',
      `/messages/${encodeURIComponent(messageId)}`,
    );
    await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read' }),
    });
  }

  /**
   * Download a media blob referenced by a webhook message.
   *
   * Two-step flow per Meta's docs:
   *   1. GET /{media_id} → returns `{ url, mime_type, ... }`.
   *   2. GET {url} with the Bearer token → binary blob.
   *
   * Returns the raw `Buffer` + metadata so the caller can persist it
   * (S3 / disk) or run it through transcription / OCR.
   */
  async downloadMedia(mediaId: string): Promise<WhatsAppMediaBlob> {
    const metaEndpoint = this.config.getMediaEndpoint(mediaId);
    const metaResponse = await this.request(metaEndpoint, { method: 'GET' });
    const meta = await metaResponse.json().catch(() => ({})) as {
      url?: string;
      mime_type?: string;
      sha256?: string;
      file_size?: number;
      id?: string;
    };

    if (!meta.url) {
      throw new Error(
        `Meta media metadata response for ${mediaId} did not include a download URL`,
      );
    }

    // Download the binary. The download URL is on a different host
    // (typically `cdn.fbsbx.com`) — we use `request()` directly so
    // the Bearer token is sent (Meta requires it even for the CDN URL).
    const blobResponse = await this.request(meta.url, {
      method: 'GET',
      // The CDN URL is on a different host — don't wrap it through the
      // Graph API retry logic (a 403 from the CDN is not retryable).
      allowNonOk: true,
    });

    if (!blobResponse.ok) {
      throw new Error(
        `Media download failed: ${blobResponse.status} ${blobResponse.statusText}`,
      );
    }

    const arrayBuffer = await blobResponse.arrayBuffer();
    return {
      mimeType:
        meta.mime_type ?? blobResponse.headers.get('content-type') ?? 'application/octet-stream',
      buffer: Buffer.from(arrayBuffer),
      size: Number(
        meta.file_size ?? blobResponse.headers.get('content-length') ?? 0,
      ),
    };
  }

  // -------------------------------------------------------------------
  // private helpers
  // -------------------------------------------------------------------

  /**
   * Send a message body to the `/messages` endpoint. Centralizes auth
   * header construction + retry logic so every public `send*` method
   * is a one-liner.
   */
  private async send(body: Record<string, any>): Promise<WhatsAppSendResult> {
    const endpoint = this.config.getMessagesEndpoint();
    const response = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as any;
    const messageId: string | undefined = json?.messages?.[0]?.id;
    const status: string = json?.messages?.[0]?.message_status
      ?? json?.messaging_product
      ?? 'unknown';

    if (!messageId) {
      // Meta rejected the message — surface the error envelope.
      const err = json?.error;
      const msg = err
        ? `WhatsApp send failed: [${err.code ?? '?'}] ${err.message ?? 'unknown error'}`
        : `WhatsApp send failed: unexpected response shape — ${JSON.stringify(json).slice(0, 400)}`;
      throw new Error(msg);
    }

    return { messageId, status, raw: json };
  }

  /**
   * Issue an HTTP request with retry + bearer auth. Throws on final
   * failure.
   *
   * The `Content-Type` + `Authorization` headers are set for every
   * request except those whose `body` is undefined (GETs) — Meta's
   * CDN rejects requests that include `Content-Type: application/json`
   * with no body.
   */
  private async request(
    url: string,
    opts: {
      method: string;
      body?: string;
      allowNonOk?: boolean;
    },
  ): Promise<Response> {
    const token = this.config.getAccessToken();
    if (!token) {
      throw new Error(
        'WHATSAPP_TOKEN is not configured — cannot make Meta Cloud API call.',
      );
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: opts.method,
          headers,
          body: opts.body,
        });

        // Retryable statuses: 5xx + 429.
        const retryable =
          response.status === 429 ||
          (response.status >= 500 && response.status < 600);
        if (retryable && attempt < MAX_RETRIES) {
          await this.sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
          this.logger.warn(
            `Meta API returned ${response.status} on ${opts.method} ${url} — retrying (attempt ${attempt}/${MAX_RETRIES})`,
          );
          continue;
        }

        if (!response.ok && !opts.allowNonOk) {
          // Surface the Meta error envelope inline so the caller sees
          // the exact code + message without having to dig through logs.
          const errorBody = await response
            .json()
            .catch(() => null) as { error?: { code?: number; message?: string } } | null;
          const err = errorBody?.error;
          const msg = err
            ? `Meta API error [${err.code ?? response.status}]: ${err.message ?? 'unknown'}`
            : `Meta API error: ${response.status} ${response.statusText}`;
          throw new Error(msg);
        }

        return response;
      } catch (err) {
        lastError = err;
        // Network errors (fetch rejected) are retryable.
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
          this.logger.warn(
            `Meta API request threw (${(err as Error).message}) — retrying (attempt ${attempt}/${MAX_RETRIES})`,
          );
          continue;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Meta API request exhausted retries for unknown reason');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

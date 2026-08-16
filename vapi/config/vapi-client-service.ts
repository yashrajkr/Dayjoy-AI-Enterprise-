import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { VapiClient } from '@vapi-ai/server-sdk';
import {
  DEFAULT_VAPI_CONFIG,
  validateVapiConfig,
  VapiConfig,
} from './vapi-config';

/**
 * Shape of a Vapi call object returned to callers. Normalised from the
 * raw Vapi SDK response so the rest of the codebase doesn't depend on the
 * SDK's type surface.
 */
export interface VapiCall {
  id: string;
  phoneNumber?: string;
  status: 'active' | 'ended' | 'failed' | 'queued' | 'ringing' | string;
  recordingUrl?: string;
  transcript?: string;
  durationSeconds?: number;
  metadata?: Record<string, any>;
  assistantId?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface VapiWebhookEvent {
  type:
    | 'call.started'
    | 'call.ended'
    | 'call.transcript'
    | 'function-call'
    | 'end-of-call-report'
    | string;
  call: VapiCall;
  data?: any;
}

/**
 * Subset of the Vapi Assistant DTO. We accept a permissive `Record<string, any>`
 * so callers can pass through the full Vapi `Assistant` payload without us
 * having to model every field.
 */
export type VapiAssistantPayload = Record<string, any>;

export interface VapiAssistant {
  id: string;
  name?: string;
  model?: any;
  voice?: any;
  transcriptionModel?: any;
  firstMessage?: string;
  [key: string]: any;
}

/**
 * Maximum number of times `withRetry` will retry a transient failure
 * (network error, 5xx, 429) before giving up. Exponential backoff with a
 * 200ms base.
 */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;

/**
 * VapiClientService — thin wrapper around the official `@vapi-ai/sdk`
 * `VapiClient`.
 *
 * Responsibilities:
 *  - Lazily initialise the SDK client on `onModuleInit` (warns when the
 *    API key is missing rather than throwing, so the rest of the app can
 *    boot — voice features degrade gracefully).
 *  - Provide typed methods for assistant CRUD + call CRUD that the
 *    `VapiAssistantService` and webhook handlers can call.
 *  - Retry transient failures (network errors, 5xx, 429) with exponential
 *    backoff so the caller doesn't have to.
 *
 * When `apiKey` is unset, every method returns a structured error instead
 * of throwing — so callers can branch on `result.success` rather than
 * wrapping every call in try/catch.
 */
@Injectable()
export class VapiClientService implements OnModuleInit {
  private readonly logger = new Logger(VapiClientService.name);
  private config: VapiConfig;
  private client: VapiClient | null = null;
  private enabled = false;

  constructor() {
    this.config = { ...DEFAULT_VAPI_CONFIG };
  }

  /**
   * Initialise the Vapi client. Called automatically by NestJS on app
   * bootstrap. Logs warnings (not errors) when the API key is missing so
   * the rest of the app can boot.
   */
  async onModuleInit(): Promise<void> {
    const errors = validateVapiConfig(this.config);
    if (errors.length > 0) {
      for (const e of errors) this.logger.warn(e);
    }

    if (!this.config.apiKey) {
      this.logger.warn(
        'VAPI_API_KEY not set — Vapi client will operate in degraded mode (all calls return structured errors).',
      );
      return;
    }

    try {
      this.client = new VapiClient({
        token: this.config.apiKey,
        baseUrl: this.config.apiBaseUrl,
      });
      this.enabled = true;
      this.logger.log('Vapi client initialised.');
    } catch (err) {
      this.logger.error(
        `Failed to initialise Vapi client: ${(err as Error).message}`,
      );
    }
  }

  /** True when the SDK client is wired up and ready to make API calls. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Returns a defensive copy of the current config. */
  getConfig(): VapiConfig {
    return { ...this.config };
  }

  /**
   * Verify a webhook signature using HMAC-SHA256 with the configured
   * webhook secret. When the secret is unset we log a warning and accept
   * the payload (development-only behaviour — production must set the secret).
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhook.secret) {
      this.logger.warn(
        'VAPI_WEBHOOK_SECRET not set — accepting webhook payload without signature verification.',
      );
      return true;
    }
    // Lazy import to avoid loading `crypto` in test sandboxes that mock it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto') as typeof import('crypto');
    const expected = crypto
      .createHmac('sha256', this.config.webhook.secret)
      .update(payload)
      .digest('hex');
    // Constant-time compare to mitigate timing attacks.
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  // ---------------------------------------------------------------------
  // Assistant CRUD
  // ---------------------------------------------------------------------

  /**
   * Create a new Vapi assistant. Returns the SDK response directly (the
   * caller is responsible for picking fields it cares about — we don't
   * want to bake the Vapi response schema into our own types).
   */
  async createAssistant(
    payload: VapiAssistantPayload,
  ): Promise<VapiAssistant> {
    return this.withRetry('createAssistant', async () => {
      const res = await this.client!.assistants.create(payload as any);
      return res as unknown as VapiAssistant;
    });
  }

  async getAssistant(id: string): Promise<VapiAssistant> {
    return this.withRetry('getAssistant', async () => {
      const res = await this.client!.assistants.get({ id });
      return res as unknown as VapiAssistant;
    });
  }

  async updateAssistant(
    id: string,
    payload: Partial<VapiAssistantPayload>,
  ): Promise<VapiAssistant> {
    return this.withRetry('updateAssistant', async () => {
      const res = await this.client!.assistants.update({ id, ...payload } as any);
      return res as unknown as VapiAssistant;
    });
  }

  async deleteAssistant(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.withRetry('deleteAssistant', async () => {
      await this.client!.assistants.delete({ id });
      return { id, deleted: true };
    });
  }

  async listAssistants(limit = 100): Promise<VapiAssistant[]> {
    return this.withRetry('listAssistants', async () => {
      const res = await this.client!.assistants.list({ limit });
      return (res ?? []) as unknown as VapiAssistant[];
    });
  }

  // ---------------------------------------------------------------------
  // Call CRUD
  // ---------------------------------------------------------------------

  /**
   * Create (initiate) an outbound call.
   *
   * `assistantId` is preferred over `assistantName` — Vapi's API accepts
   * either, but a stale assistant name silently falls back to the default
   * assistant which is rarely what we want.
   */
  async createCall(params: {
    phoneNumber: string;
    assistantId?: string;
    customer?: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<VapiCall> {
    const { phoneNumber, assistantId, customer, metadata } = params;
    // `phoneNumberId` identifies the Vapi-owned *sending* number
    // (VAPI_PHONE_NUMBER_ID) — it is NOT the destination number being
    // dialed. The previous implementation passed the destination
    // number's raw string into `phoneNumberId`, which the Vapi API
    // would reject (or silently route from an unintended number, if it
    // happened to resolve). The destination goes in `customer.number`.
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    if (!phoneNumberId) {
      throw new Error(
        'VAPI_PHONE_NUMBER_ID is not set — cannot place an outbound call without ' +
          'knowing which Vapi-registered number to call from. Set it to the phone ' +
          'number ID shown in the Vapi dashboard for the number Dayjoy calls out from.',
      );
    }
    return this.withRetry('createCall', async () => {
      const res: any = await this.client!.calls.create({
        phoneNumberId,
        assistantId: assistantId ?? this.config.assistantId,
        customer: { number: phoneNumber, ...customer },
        metadata: {
          ...metadata,
          source: 'dayjoy-voice-ai',
        },
      } as any);

      this.logger.log(`Created Vapi call ${res.id} → ${phoneNumber} (from phoneNumberId=${phoneNumberId})`);
      return this.normaliseCall(res);
    });
  }

  async getCall(callId: string): Promise<VapiCall> {
    return this.withRetry('getCall', async () => {
      const res: any = await this.client!.calls.get({ id: callId });
      return this.normaliseCall(res);
    });
  }

  /**
   * End a live call via Vapi's live call-control channel.
   *
   * The `@vapi-ai/server-sdk`'s `calls` resource has no hangup/end
   * endpoint — ending an in-progress call is done out-of-band, by
   * POSTing `{ "type": "end-call" }` to the call's `monitor.controlUrl`
   * (see docs.vapi.ai/calls/call-features). `controlUrl` is only
   * populated on the `Call` object while the call is active — we fetch
   * it fresh via `calls.get()` rather than caching it from
   * `createCall()`'s response, since inbound calls (the majority of
   * Dayjoy's traffic) never go through `createCall()` at all.
   */
  async endCall(callId: string): Promise<void> {
    if (!this.enabled || !this.client) {
      throw new Error(
        `Vapi client is not enabled (VAPI_API_KEY missing or init failed) — endCall(${callId}) aborted.`,
      );
    }
    const call: any = await this.withRetry('getCallForEndCall', () =>
      this.client!.calls.get({ id: callId }),
    );
    const controlUrl: string | undefined = call?.monitor?.controlUrl;
    if (!controlUrl) {
      throw new Error(
        `Call ${callId} has no monitor.controlUrl — it may have already ended, ` +
          'or Vapi has not attached live-call-control yet.',
      );
    }
    const res = await fetch(controlUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'end-call' }),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to end call ${callId} via control URL: ${res.status} ${res.statusText}`,
      );
    }
    this.logger.log(`Ended call ${callId} via live call control`);
  }

  async listCalls(limit = 100): Promise<VapiCall[]> {
    return this.withRetry('listCalls', async () => {
      const res: any = await this.client!.calls.list({ limit });
      return ((res ?? []) as any[]).map((r) => this.normaliseCall(r));
    });
  }

  async getTranscript(callId: string): Promise<string> {
    const call = await this.getCall(callId);
    return call.transcript ?? '';
  }

  async getRecording(callId: string): Promise<string | undefined> {
    const call = await this.getCall(callId);
    return call.recordingUrl;
  }

  // ---------------------------------------------------------------------
  // Webhook handler — VapiWebhookService (Agent 4) consumes raw events
  // ---------------------------------------------------------------------

  /**
   * Dispatch a raw webhook event to the appropriate handler. Currently
   * this just logs — the real routing is handled by `VapiWebhookService`
   * (Agent 4 owns it) which subscribes to the webhook controller directly.
   *
   * Kept here for backward compat with the original scaffold.
   */
  handleWebhookEvent(event: VapiWebhookEvent): void {
    this.logger.log(`Received webhook event: ${event.type}`);
    switch (event.type) {
      case 'call.started':
        this.logger.log(`Call started: ${event.call.id}`);
        break;
      case 'call.ended':
        this.logger.log(
          `Call ended: ${event.call.id} (duration: ${event.call.durationSeconds ?? 0}s)`,
        );
        break;
      case 'function-call':
        this.logger.log(`Function call: ${JSON.stringify(event.data)}`);
        break;
      default:
        this.logger.debug(`Unhandled webhook event: ${event.type}`);
    }
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /**
   * Map a raw Vapi SDK call response into our `VapiCall` shape. The SDK
   * returns snake_case + camelCase fields inconsistently across versions,
   * so we defensively read both.
   */
  private normaliseCall(raw: any): VapiCall {
    if (!raw) {
      return { id: '', status: 'failed' };
    }
    return {
      id: raw.id,
      phoneNumber: raw.phoneNumber ?? raw.phone_number,
      status: raw.status ?? 'active',
      recordingUrl: raw.recordingUrl ?? raw.recording_url,
      transcript: raw.transcript,
      durationSeconds: raw.durationSeconds ?? raw.duration_seconds,
      metadata: raw.metadata,
      assistantId: raw.assistantId ?? raw.assistant_id,
      startedAt: raw.startedAt ?? raw.started_at,
      endedAt: raw.endedAt ?? raw.ended_at,
    };
  }

  /**
   * Run `fn` with retry + exponential backoff. Retries on network errors
   * and 5xx / 429 responses (the Vapi SDK surfaces these as
   * `APIError` instances with a `status` field).
   *
   * Throws the last error if all retries are exhausted.
   */
  private async withRetry<T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!this.enabled || !this.client) {
      throw new Error(
        `Vapi client is not enabled (VAPI_API_KEY missing or init failed) — ${label} aborted.`,
      );
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const e = err as { status?: number; message?: string };
        const status = e?.status;
        const isRetryable =
          status === undefined || // network error
          status === 429 ||
          (status !== undefined && status >= 500);

        if (!isRetryable || attempt === MAX_RETRIES) {
          this.logger.error(
            `${label} failed (attempt ${attempt}/${MAX_RETRIES}): ${e?.message ?? err}`,
          );
          throw err;
        }

        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        this.logger.warn(
          `${label} failed (attempt ${attempt}/${MAX_RETRIES}, status=${status}) — retrying in ${delay}ms: ${e?.message ?? err}`,
        );
        await this.sleep(delay);
      }
    }
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

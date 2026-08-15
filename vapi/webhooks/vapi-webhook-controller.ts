import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
  Header,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../backend/_shared/auth/public.decorator';
import { VapiWebhookService } from './vapi-webhook-service';

/**
 * Vapi Webhook Controller
 *
 * Single HTTP entry point that Vapi calls to deliver every voice event
 * (status-update, transcript, tool-calls, end-of-call-report, ...). It
 * is intentionally `@Public()` — Vapi cannot attach a JWT to its
 * requests — but is instead protected by a shared secret.
 *
 * Route: `POST /api/voice/webhook`
 *
 * Auth: Vapi's default mechanism for `assistant.server.secret` (which
 * is what `vapi/config/vapi-assistant-config.ts` sets) is the
 * `X-Vapi-Secret` header — a plain shared-secret string, echoed back
 * verbatim on every request, NOT an HMAC signature. We verify that
 * first. If a dashboard operator additionally configures a custom
 * HMAC credential for this server URL (a manual, non-automatable
 * dashboard step — see the Step 13 report), Vapi will instead send
 * `x-vapi-signature`/`x-vapi-timestamp`, which we also accept as a
 * fallback so that setup keeps working unchanged.
 *
 * Envelope: Vapi wraps every server message in a top-level `message`
 * key (`{ "message": { "type": ..., "call": ... } }`). We unwrap it
 * here, once, so every downstream handler works with a flat payload.
 */
@Controller('api/voice/webhook')
export class VapiWebhookController {
  private readonly logger = new Logger(VapiWebhookController.name);

  /** Event types whose Vapi-mandated response shape is `{ results: [...] }`, not the generic envelope. */
  private static readonly TOOL_CALL_TYPES = new Set([
    'tool-calls',
    'function-call',
    'function-call-llm',
    'tool-call',
  ]);

  constructor(private readonly webhookService: VapiWebhookService) {}

  /**
   * Main webhook receiver.
   *
   * Returns 200 OK with a small JSON envelope (or, for tool-call
   * events, the `{ results: [...] }` shape Vapi requires). Vapi treats
   * anything other than 2xx as a failure and will retry — so we
   * deliberately catch auth failures here and respond 401 rather than
   * letting Nest's default exception filter turn them into 500s.
   */
  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/json')
  async handleWebhook(
    @Req() req: Request,
    @Body() rawBody: any,
    @Headers('x-vapi-secret') vapiSecret: string,
    @Headers('x-vapi-signature') signature: string,
    @Headers('x-vapi-timestamp') timestamp: string,
  ): Promise<{ status: string; eventType?: string; data?: any } | { results: any[] }> {
    // Unwrap Vapi's outer `{ message: {...} }` envelope. Some local
    // test fixtures / older Vapi accounts post the event flat (no
    // envelope) — accept either.
    const body =
      rawBody?.message && typeof rawBody.message === 'object'
        ? rawBody.message
        : rawBody;

    this.logger.debug(
      `Webhook received: type=${body?.type} call=${body?.call?.id ?? 'n/a'}`,
    );

    // Use the raw request body bytes for HMAC verification when that
    // path applies. Vapi signs the exact bytes it sent over the wire;
    // `main.ts` enables Nest's `rawBody: true` option, which exposes
    // the original payload on `req.rawBody` as a Buffer. Re-serialising
    // the parsed body via `JSON.stringify` is NOT byte-identical to
    // what Vapi signed (different key ordering / whitespace) and
    // defeats HMAC verification.
    const rawPayload: string = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf-8')
      : (req.rawBody ?? JSON.stringify(rawBody));

    const verified = vapiSecret
      ? this.webhookService.verifySharedSecret(vapiSecret)
      : await this.webhookService.verifySignature(rawPayload, signature, timestamp);

    if (!verified) {
      this.logger.warn(
        `Webhook auth failed for call=${body?.call?.id ?? 'unknown'} ` +
          `(mechanism=${vapiSecret ? 'x-vapi-secret' : 'hmac-signature'})`,
      );
      return { status: 'unauthorized' };
    }

    // Defer routing + processing to the service. The service is
    // idempotent (Redis SETNX on event id) so duplicate deliveries
    // are no-ops.
    const result = await this.webhookService.process(body);

    if (VapiWebhookController.TOOL_CALL_TYPES.has(body?.type) && result.data?.results) {
      // Vapi requires exactly `{ results: [...] }` for tool-call
      // responses — no outer envelope.
      return { results: result.data.results };
    }

    return {
      status: 'ok',
      eventType: body?.type,
      data: result,
    };
  }

  /**
   * Lightweight health probe for the webhook endpoint.
   *
   * Vapi's dashboard has a "test webhook" feature that pings the URL
   * with a GET — returning 200 here lets the operator confirm the
   * endpoint is reachable without triggering signature logic.
   */
  @Post('health')
  @Public()
  @HttpCode(HttpStatus.OK)
  health() {
    return {
      status: 'healthy',
      service: 'dayjoy-voice-ai',
      timestamp: new Date().toISOString(),
    };
  }
}

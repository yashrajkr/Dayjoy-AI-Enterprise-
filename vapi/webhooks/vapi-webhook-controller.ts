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
  RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../backend/_shared/auth/public.decorator';
import { VapiWebhookService } from './vapi-webhook-service';

/**
 * Vapi Webhook Controller
 *
 * Single HTTP entry point that Vapi calls to deliver every voice event
 * (call-start, call-end, transcript, function-call, ...). It is
 * intentionally `@Public()` — Vapi cannot attach a JWT to its requests —
 * but is instead protected by an **HMAC-SHA256 signature** verified
 * inside `VapiWebhookService.verifySignature()`.
 *
 * Route: `POST /api/voice/webhook`
 *
 * Header contract (sent by Vapi):
 *   - `x-vapi-signature`: hex HMAC-SHA256(secret, `${ts}.${rawBody}`)
 *   - `x-vapi-timestamp`: unix-ms timestamp used in the signature
 *
 * Replay protection: the verifier rejects timestamps whose skew from
 * the server clock exceeds 5 minutes.
 */
@Controller('api/voice/webhook')
export class VapiWebhookController {
  private readonly logger = new Logger(VapiWebhookController.name);

  constructor(private readonly webhookService: VapiWebhookService) {}

  /**
   * Main webhook receiver.
   *
   * Returns 200 OK with a small JSON envelope. Vapi treats anything
   * other than 2xx as a failure and will retry — so we deliberately
   * catch signature failures here and respond 401 rather than letting
   * Nest's default exception filter turn them into 500s.
   */
  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/json')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
    @Headers('x-vapi-signature') signature: string,
    @Headers('x-vapi-timestamp') timestamp: string,
  ): Promise<{ status: string; eventType?: string; data?: any }> {
    this.logger.debug(
      `Webhook received: type=${body?.type} call=${body?.call?.id ?? 'n/a'}`,
    );

    // Use the raw request body bytes for signature verification. Vapi
    // signs the exact bytes it sent over the wire; `main.ts` enables
    // Nest's `rawBody: true` option, which exposes the original payload
    // on `req.rawBody` as a Buffer. Re-serialising the parsed body via
    // `JSON.stringify` is NOT byte-identical to what Vapi signed
    // (different key ordering / whitespace) and defeats HMAC
    // verification.
    const rawPayload: string = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf-8')
      : (req.rawBody ?? JSON.stringify(body));

    const verified = await this.webhookService.verifySignature(
      rawPayload,
      signature,
      timestamp,
    );
    if (!verified) {
      this.logger.warn(
        `Webhook signature verification failed for call=${
          body?.call?.id ?? 'unknown'
        }`,
      );
      return { status: 'unauthorized' };
    }

    // Defer routing + processing to the service. The service is
    // idempotent (Redis SETNX on event id) so duplicate deliveries
    // are no-ops.
    const result = await this.webhookService.process(body);
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

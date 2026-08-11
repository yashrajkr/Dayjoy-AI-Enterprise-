import {
  Controller,
  Get,
  Post,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Body,
  Header,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../backend/_shared/auth/public.decorator';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

/**
 * WhatsApp Webhook Controller.
 *
 * Two endpoints:
 *   - `GET  /api/whatsapp/webhook` — Meta subscription verification.
 *   - `POST /api/whatsapp/webhook` — inbound messages + status updates
 *                                    (HMAC-SHA256 verified).
 *
 * Both are `@Public()` — Meta cannot attach a JWT. Security is
 * enforced via the HMAC signature on the App Secret (unconditional
 * in non-test environments, same policy as the Vapi webhook).
 *
 * ## Raw-body signature verification
 *
 * Meta signs the **raw bytes** of the POST body. `main.ts` enables
 * Nest's `rawBody: true` option, which exposes the original payload
 * on `req.rawBody` as a Buffer — we pass it to the verifier as a
 * UTF-8 string. Re-serialising the parsed body via `JSON.stringify`
 * is NOT byte-identical to what Meta signed (key ordering /
 * whitespace differ) and defeats HMAC verification.
 */
@Controller('api/whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly webhookService: WhatsAppWebhookService) {}

  /**
   * Meta subscription verification.
   *
   * Meta sends a GET with three query params when an operator first
   * configures the webhook in the Meta dashboard:
   *   - `hub.mode=subscribe`
   *   - `hub.verify_token=<token configured in the Meta dashboard>`
   *   - `hub.challenge=<random string to echo back>`
   *
   * We accept the verification iff the verify token matches our
   * configured `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and echo the challenge
   * back as the response body.
   *
   * Returns:
   *   - 200 + challenge (string) on success.
   *   - 403 on failure.
   */
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const result = this.webhookService.verifyWebhook(mode, token, challenge);
    if (result.ok && result.challenge !== undefined) {
      // Echo the challenge as plain text — Meta compares the response
      // body to the challenge it sent.
      res.set('Content-Type', 'text/plain').send(result.challenge);
      return;
    }
    res.status(HttpStatus.FORBIDDEN).send('Forbidden');
  }

  /**
   * Main webhook receiver.
   *
   * Returns 200 OK with a small JSON envelope. Meta treats anything
   * other than 2xx as a failure and will retry — so we deliberately
   * catch signature failures here and respond 401 rather than letting
   * Nest's default exception filter turn them into 500s.
   */
  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/json')
  async handleWebhook(
    @Req() req: Request,
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<{ status: string; processed?: number }> {
    // Use the raw request body bytes for signature verification. Meta
    // signs the exact bytes it sent; `main.ts` enables Nest's
    // `rawBody: true` option, which exposes the original payload on
    // `req.rawBody` as a Buffer.
    const rawPayload: string = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf-8')
      : (req.rawBody ?? JSON.stringify(body));

    const verified = await this.webhookService.verifySignature(
      rawPayload,
      signature,
    );
    if (!verified) {
      this.logger.warn('WhatsApp webhook signature verification failed — rejecting');
      return { status: 'unauthorized' };
    }

    const result = await this.webhookService.process(body);
    return { status: result.status, processed: result.processed };
  }

  /**
   * Lightweight health probe for the webhook endpoint.
   *
   * Useful for the K8s liveness check + the Meta dashboard "test
   * webhook" feature (which pings the URL with a GET).
   */
  @Get('health')
  @Public()
  @HttpCode(HttpStatus.OK)
  health() {
    return {
      status: 'healthy',
      service: 'dayjoy-whatsapp-ai',
      timestamp: new Date().toISOString(),
    };
  }
}

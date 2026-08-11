import { Module } from '@nestjs/common';
import { PrismaModule } from '../../backend/_shared/database/prisma.module';
import { WhatsAppConfigModule } from '../config/whatsapp-config.module';
import { WhatsAppClientModule } from '../client/whatsapp-client.module';
import { WhatsAppServicesModule } from '../services/whatsapp-services.module';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';
import { WhatsAppMessageHandler } from './handlers/whatsapp-message.handler';
import { WhatsAppStatusHandler } from './handlers/whatsapp-status.handler';

/**
 * WhatsApp Webhook Module.
 *
 * Wires the webhook controller + service + the two typed event
 * handlers (message + status). Imports:
 *   - {@link PrismaModule} — for `PrismaService` (audit row writes +
 *     status updates). Global, redundant-but-explicit.
 *   - {@link WhatsAppConfigModule} — for the verify token + app secret.
 *   - {@link WhatsAppServicesModule} — for the AI message processor +
 *     session memory (used by the message handler).
 *   - {@link WhatsAppClientModule} — for sending read receipts + the
 *     fallback "I can only handle text" reply.
 *
 * The `RedisModule` is global (via `SecurityModule` in `app.module.ts`)
 * so the `@InjectRedis()` decorator works without an explicit import
 * here.
 */
@Module({
  imports: [
    PrismaModule,
    WhatsAppConfigModule,
    WhatsAppClientModule,
    WhatsAppServicesModule,
  ],
  controllers: [WhatsAppWebhookController],
  providers: [
    WhatsAppWebhookService,
    WhatsAppMessageHandler,
    WhatsAppStatusHandler,
  ],
  exports: [
    WhatsAppWebhookService,
    WhatsAppMessageHandler,
    WhatsAppStatusHandler,
  ],
})
export class WhatsAppWebhookModule {}

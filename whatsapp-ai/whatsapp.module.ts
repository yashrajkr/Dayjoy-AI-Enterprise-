import { Module } from '@nestjs/common';
import { PrismaModule } from '../backend/_shared/database/prisma.module';
import { SharedAiModule } from '../backend/_shared/ai/ai.module';
import { AiModule } from '../backend/ai/ai.module';
import { WhatsAppConfigModule } from './config/whatsapp-config.module';
import { WhatsAppClientModule } from './client/whatsapp-client.module';
import { WhatsAppWebhookModule } from './webhooks/whatsapp-webhook.module';
import { WhatsAppServicesModule } from './services/whatsapp-services.module';

/**
 * Root WhatsAppModule — the single entry-point that
 * `backend/app.module.ts` imports to enable WhatsApp AI features.
 *
 * Sub-modules:
 *   - {@link WhatsAppConfigModule}  → WhatsAppConfigService (env config +
 *                                     token management)
 *   - {@link WhatsAppClientModule}  → WhatsAppClientService (Meta Cloud
 *                                     API wrapper, fetch-based)
 *   - {@link WhatsAppWebhookModule} → webhook controller (GET verify +
 *                                     POST receive) + service (signature
 *                                     verify + dispatch) + 2 typed
 *                                     handlers (message / status)
 *   - {@link WhatsAppServicesModule}→ WhatsAppMessageProcessor (the AI
 *                                     pipeline that reuses the shared
 *                                     OPENAI_CLIENT + ToolsService) +
 *                                     WhatsAppSessionMemory (Redis-backed)
 *
 * Architecture: the WhatsApp channel is **just another entry point**
 * over the shared AI core — same agents, same RAG pipeline, same
 * tools, same memory, same database. `WhatsAppMessageProcessor`
 * injects the shared `OPENAI_CLIENT` (from `SharedAiModule`) +
 * `ToolsService` (from `AiModule`, re-exported via
 * `WhatsAppServicesModule`) — exactly the same tool registry Voice
 * (Vapi) and Website Chat use.
 *
 * Routes exposed:
 *   GET  /api/whatsapp/webhook         — Meta subscription verification
 *   POST /api/whatsapp/webhook         — inbound messages + statuses + errors
 *   GET  /api/whatsapp/webhook/health  — lightweight health probe
 *
 * All three routes are `@Public()` — Meta cannot attach a JWT. Security
 * is enforced via the HMAC-SHA256 signature on the App Secret
 * (unconditional in non-test environments, same policy as the Vapi
 * webhook).
 *
 * `PrismaModule` + `SharedAiModule` are imported at the root (in
 * addition to inside the sub-modules) so feature modules that import
 * `WhatsAppModule` can grab any service they need — both modules are
 * `@Global()`-scoped so the re-import is redundant but explicit.
 *
 * `AiModule` is NOT global, so it must be imported here to make
 * `ToolsService` available to `WhatsAppServicesModule`. (The services
 * module also imports it directly for clarity.)
 */
@Module({
  imports: [
    PrismaModule,
    SharedAiModule,
    AiModule,
    WhatsAppConfigModule,
    WhatsAppClientModule,
    WhatsAppWebhookModule,
    WhatsAppServicesModule,
  ],
  exports: [
    WhatsAppConfigModule,
    WhatsAppClientModule,
    WhatsAppServicesModule,
  ],
})
export class WhatsAppModule {}

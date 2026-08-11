import { Module } from '@nestjs/common';
import { PrismaModule } from '../../backend/_shared/database/prisma.module';
import { SharedAiModule } from '../../backend/_shared/ai/ai.module';
import { AiModule } from '../../backend/ai/ai.module';
import { WhatsAppConfigModule } from '../config/whatsapp-config.module';
import { WhatsAppClientModule } from '../client/whatsapp-client.module';
import { WhatsAppMessageProcessorService } from './whatsapp-message-processor.service';
import { WhatsAppSessionMemoryService } from './whatsapp-session-memory.service';

/**
 * WhatsApp Services Module.
 *
 * Wires the two services that do the real work in the WhatsApp subsystem:
 *   - {@link WhatsAppMessageProcessorService} — the AI pipeline that
 *     turns an inbound text message into an outbound reply (re-uses
 *     `ToolsService` + `OPENAI_CLIENT` from the shared AI core).
 *   - {@link WhatsAppSessionMemoryService} — Redis-backed per-contact
 *     session memory (mirror of `VapiSessionMemory`).
 *
 * Imports:
 *   - {@link PrismaModule} — for `PrismaService` (global, redundant
 *     but explicit).
 *   - {@link SharedAiModule} — for `OPENAI_CLIENT` (global).
 *   - {@link AiModule} — for `ToolsService`. NOT global, so this
 *     import is required.
 *   - {@link WhatsAppConfigModule} + {@link WhatsAppClientModule} —
 *     sibling sub-modules.
 *
 * Both services are exported so the webhook module can inject them
 * without re-declaring the providers.
 */
@Module({
  imports: [
    PrismaModule,
    SharedAiModule,
    AiModule,
    WhatsAppConfigModule,
    WhatsAppClientModule,
  ],
  providers: [
    WhatsAppMessageProcessorService,
    WhatsAppSessionMemoryService,
  ],
  exports: [
    WhatsAppMessageProcessorService,
    WhatsAppSessionMemoryService,
  ],
})
export class WhatsAppServicesModule {}

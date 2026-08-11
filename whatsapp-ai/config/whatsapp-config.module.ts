import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppConfigService } from './whatsapp-config.service';

/**
 * WhatsApp Config Module.
 *
 * Provides the {@link WhatsAppConfigService} (which reads + validates the
 * `WHATSAPP_*` env vars) to every other WhatsApp sub-module.
 *
 * `ConfigModule` is imported so `process.env` is populated from `.env`
 * before `WhatsAppConfigService.onModuleInit()` runs.
 *
 * `WhatsAppConfigService` is exported so the client / webhook / services
 * modules can inject it without re-importing this module — but they
 * still need to declare the import explicitly so the DI graph is
 * obvious.
 */
@Module({
  imports: [ConfigModule],
  providers: [WhatsAppConfigService],
  exports: [WhatsAppConfigService],
})
export class WhatsAppConfigModule {}

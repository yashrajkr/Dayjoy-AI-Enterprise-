import { Module } from '@nestjs/common';
import { WhatsAppConfigModule } from '../config/whatsapp-config.module';
import { WhatsAppClientService } from './whatsapp-client.service';

/**
 * WhatsApp Client Module.
 *
 * Wires the {@link WhatsAppClientService} (the Meta Cloud API wrapper)
 * and re-exports it so the webhook / services modules can inject it
 * without re-importing this module's dependencies.
 *
 * Depends on {@link WhatsAppConfigModule} for the access token + phone
 * number ID. The config module is intentionally imported (not relied
 * upon via @Global) so the dependency graph is obvious.
 */
@Module({
  imports: [WhatsAppConfigModule],
  providers: [WhatsAppClientService],
  exports: [WhatsAppClientService],
})
export class WhatsAppClientModule {}

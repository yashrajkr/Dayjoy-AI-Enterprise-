import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VapiClientService } from './vapi-client-service';
import { DEFAULT_VAPI_CONFIG, VapiConfig } from './vapi-config';

/**
 * VapiConfigModule — provides the `VapiClientService` and the loaded
 * `VapiConfig` (under both the `VAPI_CONFIG` string token and the
 * `VapiConfig` class token) to feature modules.
 *
 * `ConfigModule` is imported so `process.env` is populated from `.env`
 * before `DEFAULT_VAPI_CONFIG` is read. The `VapiClientService` is
 * `@Global()`-scoped via `exports` so the `VapiAssistantsModule`,
 * `VapiToolsModule`, and Agent 4's webhook / flows modules can all
 * inject it without re-importing this module.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    VapiClientService,
    {
      provide: 'VAPI_CONFIG',
      useValue: DEFAULT_VAPI_CONFIG as VapiConfig,
    },
    {
      provide: VapiConfig,
      useValue: DEFAULT_VAPI_CONFIG,
    },
  ],
  exports: [VapiClientService, 'VAPI_CONFIG', VapiConfig],
})
export class VapiConfigModule {}

import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VapiClientService } from './vapi-client-service';
import {
  DEFAULT_VAPI_CONFIG,
  validateVapiConfig,
  VapiConfig,
} from './vapi-config';

/**
 * vapi/config/vapi.module.ts — backward-compat re-export of
 * `VapiConfigModule`.
 *
 * The original scaffold put the Vapi NestJS module here. The task brief
 * re-organises the Vapi tree so the root `VapiModule` lives at
 * `vapi/vapi.module.ts` and the config-only module lives at
 * `vapi/config/vapi-config.module.ts`. This file re-exports
 * `VapiConfigModule` under the original name `VapiModule` so any code
 * that still imports from `./vapi.module` keeps compiling.
 *
 * Prefer importing `VapiConfigModule` directly in new code.
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
export class VapiModule {
  private readonly logger = new Logger(VapiModule.name);

  constructor(private readonly vapiClient: VapiClientService) {
    const config = this.vapiClient.getConfig();
    const errors = validateVapiConfig(config);
    if (errors.length > 0) {
      for (const e of errors) this.logger.warn(e);
    } else {
      this.logger.log('Vapi config module initialised successfully.');
      this.logger.debug(`Voice Agent: ${config.voiceAgent.name}`);
      this.logger.debug(`Voice: ${config.voiceAgent.voice.voiceId}`);
      this.logger.debug(`Model: ${config.voiceAgent.model.model}`);
    }
  }
}

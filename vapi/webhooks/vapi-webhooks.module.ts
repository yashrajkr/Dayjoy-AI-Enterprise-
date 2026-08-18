import { Module } from '@nestjs/common';
import { VapiWebhookController } from './vapi-webhook-controller';
import { VapiWebhookService } from './vapi-webhook-service';
import { VapiCallStartedHandler } from './vapi-call-started-handler';
import { VapiCallEndedHandler } from './vapi-call-ended-handler';
import { VapiTranscriptHandler } from './vapi-transcript-handler';
import { VapiFunctionCallHandler } from './vapi-function-call-handler';
import { VapiMemoryModule } from '../memory/vapi-memory.module';
import { VapiAnalyticsModule } from '../analytics/vapi-analytics.module';
import { VapiToolsModule } from '../tools/vapi-tools.module';

/**
 * Vapi Webhooks Module.
 *
 * Wires the webhook controller + service + the four typed event
 * handlers. Imports {@link VapiMemoryModule} (for Redis session
 * memory + customer profile), {@link VapiAnalyticsModule} (for the
 * call logger + AI metrics used by the call-ended handler), and
 * {@link VapiToolsModule} — required so the `VAPI_TOOL_REGISTRY`
 * token it exports (bound to `VapiToolRegistry` via `useExisting`)
 * is visible to `VapiFunctionCallHandler`'s
 * `@Optional() @Inject(VAPI_TOOL_REGISTRY)`.
 *
 * No `forwardRef` here: `VapiToolsModule` only references this
 * module's `VAPI_TOOL_REGISTRY` *token* (a plain TS/JS import of a
 * `Symbol`, not a Nest module import), so there's no real module-level
 * cycle. A previous `forwardRef(() => VapiToolsModule)` here — despite
 * being unnecessary — perturbed the tool providers' construction
 * timing enough that 5 of `VapiToolRegistry`'s 8 constructor-injected
 * tools (the ones depending on a backend feature-module service
 * rather than plain `PrismaService`) resolved as `undefined` on this
 * import path specifically, so they silently never registered even
 * though a separately-constructed registry (used to sync tool
 * definitions to the live Vapi assistant) had all 8. Every live tool
 * call routed through this module's `VapiFunctionCallHandler` failed
 * with `TOOL_NOT_FOUND` for exactly those 5 tools.
 */
@Module({
  imports: [VapiMemoryModule, VapiAnalyticsModule, VapiToolsModule],
  controllers: [VapiWebhookController],
  providers: [
    VapiWebhookService,
    VapiCallStartedHandler,
    VapiCallEndedHandler,
    VapiTranscriptHandler,
    VapiFunctionCallHandler,
  ],
  exports: [
    VapiWebhookService,
    VapiCallStartedHandler,
    VapiCallEndedHandler,
    VapiTranscriptHandler,
    VapiFunctionCallHandler,
  ],
})
export class VapiWebhooksModule {}

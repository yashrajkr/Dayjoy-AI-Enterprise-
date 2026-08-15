import { Module, forwardRef } from '@nestjs/common';
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
 * `@Optional() @Inject(VAPI_TOOL_REGISTRY)`. This import was
 * previously missing: the handler's `@Optional()` decorator let DI
 * silently resolve the token to `undefined` instead of failing
 * loudly at bootstrap, so every tool call failed closed with
 * `TOOL_REGISTRY_UNAVAILABLE` with no startup signal that anything
 * was wrong. `forwardRef` breaks the cycle since `VapiToolsModule`
 * doesn't import this module back, but both ultimately sit under the
 * shared `PrismaModule`/`SharedAiModule` globals.
 */
@Module({
  imports: [VapiMemoryModule, VapiAnalyticsModule, forwardRef(() => VapiToolsModule)],
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

import { Module } from '@nestjs/common';
import { VapiWebhookController } from './vapi-webhook-controller';
import { VapiWebhookService } from './vapi-webhook-service';
import { VapiCallStartedHandler } from './vapi-call-started-handler';
import { VapiCallEndedHandler } from './vapi-call-ended-handler';
import { VapiTranscriptHandler } from './vapi-transcript-handler';
import {
  VapiFunctionCallHandler,
  VAPI_TOOL_REGISTRY,
} from './vapi-function-call-handler';
import { VapiMemoryModule } from '../memory/vapi-memory.module';
import { VapiAnalyticsModule } from '../analytics/vapi-analytics.module';

/**
 * Vapi Webhooks Module.
 *
 * Wires the webhook controller + service + the four typed event
 * handlers. Imports {@link VapiMemoryModule} (for Redis session
 * memory + customer profile) and {@link VapiAnalyticsModule} (for
 * the call logger + AI metrics used by the call-ended handler).
 *
 * The `VAPI_TOOL_REGISTRY` token is intentionally NOT provided
 * here — it is provided by Agent 3's `VapiToolsModule` (in
 * `vapi/tools/`). The handler treats a missing registry as
 * optional (returns a "tool not available" error to Vapi) so the
 * webhook subsystem can boot even before tools are registered.
 */
@Module({
  imports: [VapiMemoryModule, VapiAnalyticsModule],
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
    VAPI_TOOL_REGISTRY,
  ],
})
export class VapiWebhooksModule {}

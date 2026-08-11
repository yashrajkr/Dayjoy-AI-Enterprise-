import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../backend/_shared/database/prisma.module';
import { SharedAiModule } from '../backend/_shared/ai/ai.module';
import { VapiConfigModule } from './config/vapi-config.module';
import { VapiAssistantsModule } from './assistants/vapi-assistants.module';
import { VapiToolsModule } from './tools/vapi-tools.module';
import { VapiWebhooksModule } from './webhooks/vapi-webhooks.module';
import { VapiFlowsModule } from './flows/vapi-flows.module';
import { VapiMemoryModule } from './memory/vapi-memory.module';
import { VapiAnalyticsModule } from './analytics/vapi-analytics.module';
import { VapiController } from './vapi.controller';

/**
 * Root VapiModule — the single entry-point that `backend/app.module.ts`
 * imports to enable Voice AI features.
 *
 * Sub-modules:
 *   - VapiConfigModule     → VapiClientService, VapiConfig (from env)
 *   - VapiAssistantsModule → VapiAssistantService + REST controller
 *   - VapiToolsModule      → 8 tools + VapiToolRegistry
 *   - VapiWebhooksModule   → webhook signature verify + event dispatch
 *   - VapiFlowsModule      → conversation flow orchestration
 *   - VapiMemoryModule     → short/long-term voice session memory
 *   - VapiAnalyticsModule  → call analytics + dashboards
 *
 * All sub-modules are re-exported so feature modules that import
 * `VapiModule` can grab any service they need (e.g. `VapiClientService`
 * is consumed by the webhook module, `VapiToolRegistry` is consumed
 * by the assistant module).
 *
 * `VapiController` is registered here (rather than in any sub-module)
 * because it composes services from several sub-modules (VapiClientService
 * from config, PrismaService from `_shared`, and analytics from the
 * analytics module) — a single registration point keeps the dependency
 * graph obvious.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    SharedAiModule,
    VapiConfigModule,
    VapiAssistantsModule,
    VapiToolsModule,
    VapiWebhooksModule,
    VapiFlowsModule,
    VapiMemoryModule,
    VapiAnalyticsModule,
  ],
  controllers: [VapiController],
  exports: [
    VapiConfigModule,
    VapiAssistantsModule,
    VapiToolsModule,
    VapiWebhooksModule,
    VapiFlowsModule,
    VapiMemoryModule,
    VapiAnalyticsModule,
  ],
})
export class VapiModule {}

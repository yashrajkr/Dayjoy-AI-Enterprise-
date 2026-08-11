import { Module } from '@nestjs/common';
import { VapiCallLogger } from './vapi-call-logger';
import { VapiToolUsageTracker } from './vapi-tool-usage-tracker';
import { VapiAiMetrics } from './vapi-ai-metrics';
import { VapiAnalyticsDashboard } from './vapi-analytics-dashboard';
import { VapiAnalyticsController } from './vapi-analytics.controller';

/**
 * Vapi Analytics Module.
 *
 * Provides:
 *   - {@link VapiCallLogger}          — per-call analytics + aggregate call stats
 *   - {@link VapiToolUsageTracker}    — tool-execution stats from `analytics_events`
 *   - {@link VapiAiMetrics}           — accuracy / CSAT / sentiment / hallucination
 *   - {@link VapiAnalyticsDashboard}  — composite dashboard payload + health
 *   - {@link VapiAnalyticsController} — REST endpoints under `/api/voice/analytics`
 *
 * Depends on:
 *   - `PrismaModule` (global)
 *
 * The `VapiMemoryModule` is NOT imported here — analytics doesn't
 * need Redis session state (it reads from `VoiceAnalytics` +
 * `AnalyticsEvent` tables directly).
 */
@Module({
  providers: [
    VapiCallLogger,
    VapiToolUsageTracker,
    VapiAiMetrics,
    VapiAnalyticsDashboard,
  ],
  controllers: [VapiAnalyticsController],
  exports: [
    VapiCallLogger,
    VapiToolUsageTracker,
    VapiAiMetrics,
    VapiAnalyticsDashboard,
  ],
})
export class VapiAnalyticsModule {}

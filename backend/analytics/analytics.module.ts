import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

/**
 * Analytics feature module.
 *
 * Standalone — no other feature module imports `AnalyticsService` (it
 * is only consumed by the analytics controller and, optionally, the
 * future metric-refresh job).
 */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';

/**
 * Registers the `/metrics` Prometheus exposition endpoint.
 *
 * The interceptor is *not* registered globally here — it is wired as a global
 * interceptor in `AppModule` via `APP_INTERCEPTOR` so that it runs for every
 * controller, not just those that import `MetricsModule`.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsInterceptor],
  exports: [MetricsInterceptor],
})
export class MetricsModule {}

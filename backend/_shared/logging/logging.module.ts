import { Module } from '@nestjs/common';
import { AppLoggerService } from './logging.service';
import { RequestIdMiddleware } from './request-id.middleware';

/**
 * Provides the structured `AppLoggerService` (Winston-backed) and the
 * `RequestIdMiddleware` to the rest of the application.
 *
 * `AppLoggerService` can be injected anywhere to replace the default
 * `NestLogger`. `RequestIdMiddleware` is consumed by `AppModule.configure()`
 * and applied to all routes.
 */
@Module({
  providers: [AppLoggerService, RequestIdMiddleware],
  exports: [AppLoggerService, RequestIdMiddleware],
})
export class LoggingModule {}

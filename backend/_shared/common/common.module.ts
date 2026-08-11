import { Global, Module } from '@nestjs/common';
import { AllExceptionsFilter } from './exceptions/all-exceptions.filter';
import { PrismaExceptionFilter } from './exceptions/prisma-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { RequestLoggingMiddleware } from './middleware/request-logging.middleware';
import { SecurityMiddleware } from './middleware/security.middleware';
import { TenantMiddleware } from './middleware/tenant.middleware';
import { RolesGuard } from './guards/roles.guard';

/**
 * Global cross-cutting infrastructure module.
 *
 * Bundles every filter, interceptor, middleware and guard that lives in
 * `_shared/common/` so the root `AppModule` only needs to import a single
 * symbol to bring them all online. The actual wiring of these as
 * `APP_FILTER` / `APP_INTERCEPTOR` / `APP_GUARD` providers happens in
 * `AppModule` (this module just makes them injectable).
 *
 * Marked `@Global()` so feature modules can `@Inject(AllExceptionsFilter)`
 * (or any other provider here) without an explicit import.
 */
@Global()
@Module({
  providers: [
    AllExceptionsFilter,
    PrismaExceptionFilter,
    TransformInterceptor,
    TimeoutInterceptor,
    LoggingInterceptor,
    RequestLoggingMiddleware,
    SecurityMiddleware,
    TenantMiddleware,
    RolesGuard,
  ],
  exports: [
    AllExceptionsFilter,
    PrismaExceptionFilter,
    TransformInterceptor,
    TimeoutInterceptor,
    LoggingInterceptor,
    RequestLoggingMiddleware,
    SecurityMiddleware,
    TenantMiddleware,
    RolesGuard,
  ],
})
export class CommonModule {}

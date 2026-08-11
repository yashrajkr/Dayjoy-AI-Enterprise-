/**
 * Barrel for `_shared/common/` — the cross-cutting infrastructure that wraps
 * every request regardless of which feature module owns the route.
 *
 * Re-exports the four sub-barrels:
 *  - `./decorators`   — `@Public()`, `@Roles()`, `@CurrentUser()`
 *  - `./exceptions`   — `AllExceptionsFilter`, `PrismaExceptionFilter`
 *  - `./interceptors` — `TransformInterceptor`, `TimeoutInterceptor`, `LoggingInterceptor`
 *  - `./middleware`   — `RequestLoggingMiddleware`, `SecurityMiddleware`, `TenantMiddleware`
 *
 * Plus the top-level `CommonModule` that wires them all into the DI graph.
 */
export * from './decorators';
export * from './exceptions';
export * from './interceptors';
export * from './middleware';
export * from './constants/app.constants';
export { CommonModule } from './common.module';
export { RolesGuard } from './guards/roles.guard';

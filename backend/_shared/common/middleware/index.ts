/**
 * Barrel for the shared NestJS middleware.
 *
 * All four middleware are registered globally in `AppModule.configure()`
 * via `consumer.apply(RequestIdMiddleware, RequestLoggingMiddleware,
 * SecurityMiddleware, TenantMiddleware).forRoutes('*')`. The order matters:
 *
 *  1. `RequestIdMiddleware`   — assigns `req.id` (so everything downstream
 *     can include it in logs).
 *  2. `SecurityMiddleware`    — sets defensive headers on the response.
 *  3. `TenantMiddleware`      — resolves `req.tenantId` from header/JWT.
 *  4. `RequestLoggingMiddleware` — wraps `res.on('finish')` so the final
 *     log line is emitted after the response is flushed.
 *
 * (Note: `RequestIdMiddleware` lives in `_shared/logging/`, not here, so it
 * is re-exported from the logging barrel.)
 */
export { RequestLoggingMiddleware } from './request-logging.middleware';
export { SecurityMiddleware } from './security.middleware';
export { TenantMiddleware } from './tenant.middleware';

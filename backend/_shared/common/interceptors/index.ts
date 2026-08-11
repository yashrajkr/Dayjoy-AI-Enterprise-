/**
 * Barrel for the shared cross-cutting interceptors.
 *
 *  - {@link TransformInterceptor} — wraps every successful response in the
 *    standardised `ApiResponse` envelope (registered globally).
 *  - {@link TimeoutInterceptor} — aborts handlers that exceed the configured
 *    request-duration ceiling (registered globally).
 *  - {@link LoggingInterceptor} — per-request structured log line
 *    (registered globally as a duplicate of the middleware-level log line
 *    for redundancy).
 */
export { TransformInterceptor } from './transform.interceptor';
export { TimeoutInterceptor } from './timeout.interceptor';
export { LoggingInterceptor } from './logging.interceptor';

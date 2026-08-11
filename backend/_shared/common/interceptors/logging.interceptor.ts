import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';

/**
 * Lightweight per-request logging interceptor.
 *
 * Emits a single `Logger.log` line per completed request with method, URL,
 * duration and (when available) the authenticated user ID + request ID.
 * This complements {@link RequestLoggingMiddleware}, which logs the final
 * status code + duration after the response is flushed — the interceptor
 * runs *before* the response is written and is therefore a better place to
 * attach per-handler metrics.
 *
 * The interceptor is registered globally via `APP_INTERCEPTOR` in
 * `AppModule`. It is intentionally cheap (no per-request allocations beyond
 * the start timestamp) so it can stay enabled in production.
 *
 * NOTE: this is the structured-logger-friendly replacement for the older
 * version that used `console.log` directly. The structured `AppLoggerService`
 * (Winston-backed) is available for injection if richer fields are required —
 * we deliberately use the lightweight `Logger` here to avoid coupling this
 * tiny interceptor to the LoggingModule DI graph.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request & { id?: string; user?: any }>();
    const method = req.method;
    const url = req.url;
    const requestId = req.id ?? req.headers['x-request-id'];
    const userId = req.user?.userId ?? req.user?.id;

    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.logger.log(
          `${method} ${url} ${ms}ms${userId ? ` user=${userId}` : ''}`,
          requestId ? `req=${requestId}` : undefined,
        );
      }),
    );
  }
}

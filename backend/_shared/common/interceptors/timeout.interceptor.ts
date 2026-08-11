import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, throwError, timeout } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Request } from 'express';

/**
 * Enforces a maximum request-duration ceiling.
 *
 * If a handler takes longer than `REQUEST_TIMEOUT_MS` (env-tunable, default
 * 30s) to produce a response, the observable is completed with a
 * {@link RequestTimeoutException} which the global
 * {@link AllExceptionsFilter} translates into a 408 / `REQUEST_TIMEOUT`
 * error envelope.
 *
 * The interceptor is registered globally via `APP_INTERCEPTOR` in
 * `AppModule`. It is positioned *after* `MetricsInterceptor` so the
 * resulting 408 is still counted in the latency histogram.
 *
 * Note: the timeout covers only the controller + service execution path.
 * It does NOT cancel work that has already been dispatched to background
 * queues — for that, services should accept an `AbortSignal` derived from
 * the request.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  /** Default ceiling if `REQUEST_TIMEOUT_MS` env var is unset. */
  private static readonly DEFAULT_TIMEOUT_MS = 30_000;

  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<number>('REQUEST_TIMEOUT_MS');
    this.timeoutMs =
      typeof raw === 'number' && raw > 0
        ? raw
        : TimeoutInterceptor.DEFAULT_TIMEOUT_MS;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Don't apply the timeout to long-poll / SSE / streaming endpoints.
    // We detect these by checking the `Accept` header (text/event-stream) or
    // the request path. Health/metrics are also exempt.
    const request = context.switchToHttp().getRequest<Request>();
    if (this.isExempt(request)) {
      return next.handle();
    }

    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err: unknown) => {
        if (this.isTimeoutError(err)) {
          const req = request as any;
          return throwError(
            () =>
              new RequestTimeoutException(
                `Request exceeded ${this.timeoutMs}ms timeout`,
              ),
          );
        }
        return throwError(() => err);
      }),
    );
  }

  private isExempt(request: Request): boolean {
    const accept = request.headers['accept'] ?? '';
    if (typeof accept === 'string' && accept.includes('text/event-stream')) {
      return true;
    }
    const path = request.path ?? '';
    if (path.startsWith('/health') || path.startsWith('/metrics')) {
      return true;
    }
    return false;
  }

  /**
   * rxjs's `timeout` operator throws an object shaped like
   * `{ name: 'TimeoutError', message: ... }`. We match on that shape rather
   * than relying on `instanceof TimeoutError` (which is not exported from
   * the public rxjs surface).
   */
  private isTimeoutError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const name = (err as { name?: string }).name;
    return name === 'TimeoutError';
  }
}

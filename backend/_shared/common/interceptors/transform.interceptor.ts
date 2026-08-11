import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Request, Response } from 'express';
import { ApiResponse } from '../../api';

/**
 * Routes whose responses must NOT be wrapped in the success envelope.
 *
 *  - `/health` and `/health/*` — Terminus emits its own `{ status, info, ... }`
 *    shape that k8s probes and external monitors expect verbatim.
 *  - `/metrics` — Prometheus exposition format (text/plain).
 *  - `/docs`, `/docs-json`, `/swagger-ui*` — Swagger UI assets.
 *
 * File downloads (responses that set `Content-Disposition: attachment`) and
 * `StreamableFile` return values are also skipped so binary payloads aren't
 * JSON-encoded.
 */
const SKIP_PATH_PREFIXES = ['/health', '/metrics', '/docs', '/swagger'];

/**
 * Global success-response interceptor.
 *
 * Wraps every successful controller return value in the standardised
 * {@link ApiResponse} envelope:
 *
 * ```json
 * {
 *   "success": true,
 *   "data": <payload>,
 *   "meta": { "requestId": "...", "timestamp": "..." }
 * }
 * ```
 *
 * Skip conditions (response is returned unchanged):
 *  - Path is one of `/health`, `/metrics`, `/docs*`, `/swagger*`
 *  - Controller returned a `StreamableFile` (binary download)
 *  - Response already has `Content-Disposition: attachment` header
 *  - Payload already looks like an envelope (has `success: boolean` and
 *    either `data` or `error`) — makes the interceptor idempotent when a
 *    controller returns a `PaginatedResponse` explicitly.
 *  - Response status is 204 No Content (no body to wrap)
 *
 * The interceptor is registered globally via `APP_INTERCEPTOR` in
 * `AppModule`. Error responses never reach this interceptor — they go
 * through `AllExceptionsFilter` instead.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | T> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Skip wrapper for health/metrics/swagger routes.
    if (this.shouldSkipPath(request.path)) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: T) => {
        // 204 No Content → return null body, no envelope.
        if (response.statusCode === 204) {
          return data;
        }

        // Binary file downloads via Nest's StreamableFile.
        if (data instanceof StreamableFile) {
          return data;
        }

        // Headers already sent (e.g. SSE streaming started) → can't wrap.
        if (response.headersSent) {
          return data;
        }

        // File download via Content-Disposition header.
        const contentDisposition = response.getHeader('content-disposition');
        if (
          typeof contentDisposition === 'string' &&
          contentDisposition.startsWith('attachment')
        ) {
          return data;
        }

        // Already an envelope → leave it (idempotent).
        if (this.isAlreadyEnvelope(data)) {
          return data;
        }

        const requestId =
          (request as any)?.id ??
          (request as any)?.requestId ??
          request.headers?.['x-request-id'];

        return {
          success: true,
          data,
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
          },
        } as ApiResponse<T>;
      }),
    );
  }

  /**
   * Returns `true` for routes that should never be wrapped in the envelope.
   */
  private shouldSkipPath(path: string | undefined): boolean {
    if (!path) return false;
    return SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
  }

  /**
   * Heuristic: an object is already an envelope if it has a boolean
   * `success` field AND either a `data` or an `error` field.
   *
   * This lets controllers return `PaginatedResponse.create(...)` (which
   * already has `success: true`, `data`, `meta`) without getting
   * double-wrapped.
   */
  private isAlreadyEnvelope(value: unknown): boolean {
    if (value === null || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.success === 'boolean' &&
      ('data' in v || 'error' in v)
    );
  }
}

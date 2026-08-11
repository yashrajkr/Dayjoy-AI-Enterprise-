/**
 * Standardised API envelope used by every successful and failed HTTP response
 * in the Dayjoy backend.
 *
 * The shape is mandated by `docs/api/01_API_STANDARDS.md` and is applied
 * automatically by the global `TransformInterceptor` (success path) and
 * `AllExceptionsFilter` (error path). Controllers do **not** need to construct
 * this object manually — they just return their payload, and the interceptor
 * wraps it. The static factories here are primarily for unit tests and for
 * the rare controller that needs to bypass the interceptor (e.g. SSE
 * streaming endpoints).
 *
 * Envelope shape (success):
 *
 * ```json
 * {
 *   "success": true,
 *   "data": <payload>,
 *   "meta": { "requestId": "...", "timestamp": "..." }
 * }
 * ```
 *
 * Envelope shape (error):
 *
 * ```json
 * {
 *   "success": false,
 *   "error": { "code": "NOT_FOUND", "message": "...", "details": null },
 *   "meta": { "requestId": "...", "timestamp": "..." }
 * }
 * ```
 *
 * `meta` may also carry pagination fields (`page`, `limit`, `total`,
 * `totalPages`) for list responses — see {@link PaginatedResponse}.
 */
export interface ApiResponseMeta {
  requestId?: string;
  timestamp?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiErrorPayload {
  /** Machine-readable error code (e.g. `NOT_FOUND`, `VALIDATION_FAILED`). */
  code: string;
  /** Human-readable error message. Safe to surface to clients. */
  message: string;
  /** Optional structured details (field errors, Prisma target, etc.). */
  details?: unknown;
}

export class ApiResponse<T> {
  success!: boolean;
  data?: T;
  error?: ApiErrorPayload;
  meta?: ApiResponseMeta;

  /**
   * Build a success envelope. `meta` is merged with a default `timestamp`;
   * callers typically only pass pagination fields and let the interceptor
   * fill in `requestId` / `timestamp`.
   */
  static success<T>(data: T, meta?: ApiResponseMeta): ApiResponse<T> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };
  }

  /**
   * Build an error envelope. Used directly by `AllExceptionsFilter` and by
   * controllers that need to short-circuit with a domain-specific error
   * without throwing a NestJS exception.
   */
  static error(
    code: string,
    message: string,
    details?: unknown,
    meta?: ApiResponseMeta,
  ): ApiResponse<never> {
    return {
      success: false,
      error: { code, message, details },
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };
  }
}

/**
 * Convenience wrapper for paginated list responses.
 *
 * Use {@link PaginatedResponse.create} in a controller:
 *
 * ```ts
 * return PaginatedResponse.create(rows, page, limit, total);
 * ```
 *
 * The returned object is shaped exactly like {@link ApiResponse.success}'s
 * output, but with the standard pagination fields populated in `meta`. The
 * global `TransformInterceptor` is idempotent: if a controller already
 * returns a `PaginatedResponse`, the interceptor leaves it untouched (it
 * detects the `success: true` field and skips re-wrapping).
 */
export class PaginatedResponse<T> {
  success: boolean = true;
  data!: T[];
  meta!: Required<
    Pick<ApiResponseMeta, 'page' | 'limit' | 'total' | 'totalPages' | 'timestamp'>
  > & { requestId?: string };

  static create<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
  ): PaginatedResponse<T> {
    const safeLimit = limit > 0 ? limit : 1;
    return {
      success: true,
      data,
      meta: {
        page,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
        timestamp: new Date().toISOString(),
      },
    };
  }
}

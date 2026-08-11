import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request, Response } from 'express';
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library';
import { mapPrismaErrorToHttp } from './prisma-exception.filter';
import type { ApiResponseMeta, ApiErrorPayload } from '../../api';

/**
 * Sensitive field names whose values are scrubbed from `error.details`
 * before being sent back to the client. The structured logger
 * (`AppLoggerService`) already redacts these from log lines; this is the
 * second line of defence for the HTTP response payload.
 */
const SENSITIVE_DETAIL_KEYS = [
  'password',
  'passwordHash',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'authorization',
  'accessToken',
  'refreshToken',
  'cookie',
  'sessionId',
];

/**
 * Default mapping from NestJS `HttpStatus` enums to the machine-readable
 * `code` strings defined in `docs/api/06_API_ERROR_HANDLING.md`.
 *
 * The string codes are part of the public API contract — clients branch on
 * them (e.g. `if (code === 'UNAUTHENTICATED') redirect to /login`), so they
 * must remain stable across releases.
 */
const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.NOT_IMPLEMENTED]: 'NOT_IMPLEMENTED',
  [HttpStatus.BAD_GATEWAY]: 'BAD_GATEWAY',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'UNAVAILABLE',
  [HttpStatus.GATEWAY_TIMEOUT]: 'GATEWAY_TIMEOUT',
};

/**
 * The single, global exception filter.
 *
 * Catches every exception thrown anywhere in the request pipeline (controllers,
 * services, interceptors, guards) and converts it into the standardised
 * {@link ApiResponse} error envelope:
 *
 * ```json
 * {
 *   "success": false,
 *   "error": { "code": "NOT_FOUND", "message": "...", "details": null },
 *   "meta": { "requestId": "...", "timestamp": "..." }
 * }
 * ```
 *
 * The filter is intentionally defensive: any failure inside the error-handling
 * path itself (e.g. `response.json` throws) is logged but never re-thrown,
 * because re-throwing from a global exception filter would crash the request
 * without a response.
 *
 * Special-cased exception types:
 *  - `HttpException`           — uses its `getStatus()` + `getResponse()`.
 *  - `PrismaClientKnownRequestError` — mapped via `mapPrismaErrorToHttp()`
 *    (P2002 → 409, P2025 → 404, P2003 → 400, P2014 → 400).
 *  - `PrismaClientValidationError` — 400 with a sanitised message.
 *  - Any other `Error` — 500 with the message (sanitised) + stack trace logged.
 *
 * The filter is registered globally in `AppModule` via `APP_FILTER`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost?: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string; user?: any }>();

    const requestId =
      (request as any)?.id ??
      (request as any)?.requestId ??
      request?.headers?.['x-request-id'] ??
      undefined;

    const { status, payload } = this.mapException(exception, requestId);

    // Structured log line — Winston's redact format strips PII on the
    // AppLoggerService side, but we also avoid dumping the raw exception
    // object (which may contain Prisma internals) into the message.
    const userId = request?.user?.userId ?? request?.user?.id ?? 'anonymous';
    const logMessage = `${request.method} ${request.url} → ${status} ${payload.code}`;
    const logContext = {
      requestId,
      userId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      statusCode: status,
      errorCode: payload.code,
      ...(exception instanceof Error
        ? {
            errorMessage: exception.message,
            stack: exception.stack,
          }
        : { rawException: String(exception) }),
    };

    if (status >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : undefined,
        logContext,
      );
    } else if (status >= 400) {
      // 4xx are expected application errors — log at warn to keep
      // error-rate alerting focused on genuine 5xx.
      this.logger.warn(logMessage, logContext);
    }

    // If the response is already closed (e.g. the error originated in a
    // streaming handler after the first chunk was flushed), we can't send
    // a JSON body — just log and return.
    if (response.writableEnded || response.headersSent) {
      this.logger.warn(
        'Response already sent — cannot write error envelope',
        { requestId, status },
      );
      return;
    }

    try {
      response.status(status).json({
        success: false,
        error: payload,
        meta: this.buildMeta(requestId),
      });
    } catch (err) {
      // Last-resort fallback — never let the filter itself throw.
      this.logger.error(
        'Failed to serialise error response',
        (err as Error).stack,
        { requestId, originalStatus: status },
      );
      response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          },
          meta: this.buildMeta(requestId),
        });
    }
  }

  /**
   * Translate any thrown value into a `{ status, payload }` pair.
   */
  private mapException(
    exception: unknown,
    requestId: string | undefined,
  ): { status: number; payload: ApiErrorPayload } {
    // ---- Prisma known errors (P2002 unique constraint, P2025 not found, etc.)
    if (exception instanceof PrismaClientKnownRequestError) {
      const mapped = mapPrismaErrorToHttp(exception);
      return {
        status: mapped.status,
        payload: {
          code: mapped.code,
          message: mapped.message,
          details: this.sanitize(mapped.details),
        },
      };
    }

    // ---- Prisma validation errors (missing required field, wrong type, etc.)
    if (exception instanceof PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        payload: {
          code: 'VALIDATION_FAILED',
          message: 'Database validation failed',
          details: { hint: this.sanitizeString(exception.message) },
        },
      };
    }

    // ---- NestJS HttpException (includes BadRequestException from class-validator)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const code = STATUS_TO_CODE[status] ?? 'ERROR';

      // class-validator's ValidationError[] shape — `message` is an array of
      // `{ property, constraints }` objects on `BadRequestException`.
      if (
        typeof res === 'object' &&
        res !== null &&
        Array.isArray((res as any).message)
      ) {
        const details = (res as any).message.map((m: any) => {
          if (typeof m === 'string') return { message: m };
          return {
            property: m.property,
            constraints: m.constraints,
          };
        });
        return {
          status,
          payload: {
            code,
            message: 'Validation failed',
            details: this.sanitize(details),
          },
        };
      }

      // HttpException with a string message
      const message =
        typeof res === 'string'
          ? res
          : (res as any)?.message ?? exception.message;

      return {
        status,
        payload: {
          code,
          message: this.sanitizeString(String(message)),
          details: this.sanitize((res as any)?.details ?? null),
        },
      };
    }

    // ---- Native Error (anything else)
    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        payload: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          details:
            process.env.NODE_ENV === 'production'
              ? null
              : this.sanitizeString(exception.message),
        },
      };
    }

    // ---- Non-Error throw (string, number, null) — extremely defensive
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: process.env.NODE_ENV === 'production' ? null : String(exception),
      },
    };
  }

  /**
   * Build the `meta` block — currently just `requestId` + ISO timestamp.
   */
  private buildMeta(requestId?: string): ApiResponseMeta {
    return {
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Recursively walk an error-detail payload and replace values of sensitive
   * keys with `[REDACTED]`. Mirrors the AppLoggerService redact logic.
   */
  private sanitize(value: unknown): unknown {
    if (value == null) return null;
    if (Array.isArray(value)) return value.map((v) => this.sanitize(v));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const lower = key.toLowerCase();
        if (SENSITIVE_DETAIL_KEYS.some((s) => lower.includes(s))) {
          out[key] = '[REDACTED]';
        } else {
          out[key] = this.sanitize((value as Record<string, unknown>)[key]);
        }
      }
      return out;
    }
    return value;
  }

  /**
   * Strip potential secrets out of a free-form string message. Currently only
   * removes anything that looks like a Bearer token or password=value pair;
   * this is intentionally conservative — the main redaction is field-level.
   */
  private sanitizeString(value: string): string {
    if (typeof value !== 'string') return String(value);
    return value
      .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]')
      .replace(/password=[^\s;]+/gi, 'password=[REDACTED]')
      .replace(/secret=[^\s;]+/gi, 'secret=[REDACTED]')
      .replace(/token=[^\s;]+/gi, 'token=[REDACTED]');
  }
}

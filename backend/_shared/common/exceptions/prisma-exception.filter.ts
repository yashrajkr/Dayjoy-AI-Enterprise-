import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { Response } from 'express';

/**
 * Maps Prisma `PrismaClientKnownRequestError` codes to HTTP status + a
 * stable, machine-readable error code.
 *
 * Reference: https://www.prisma.io/docs/orm/reference/error-reference#prismaclientknownrequesterror
 *
 * | Prisma code | Meaning                                   | HTTP | code                 |
 * |-------------|-------------------------------------------|------|----------------------|
 * | P2002       | Unique constraint failed                  | 409  | CONFLICT             |
 * | P2025       | Record not found (update/delete/findUnique) | 404  | NOT_FOUND            |
 * | P2003       | Foreign-key constraint failed             | 400  | FOREIGN_KEY_VIOLATION|
 * | P2014       | Invalid required relation                 | 400  | INVALID_RELATION     |
 * | P2016       | Invalid `id` value (interpreting as null)| 404  | NOT_FOUND            |
 * | P2021       | Table does not exist (DB drift)           | 500  | INTERNAL_ERROR       |
 * | P2024       | Timed out waiting for a connection        | 503  | UNAVAILABLE          |
 *
 * Anything else falls back to 500 / `INTERNAL_ERROR`.
 */
export function mapPrismaErrorToHttp(error: PrismaClientKnownRequestError): {
  status: number;
  code: string;
  message: string;
  details?: unknown;
} {
  switch (error.code) {
    case 'P2002': {
      // `meta.target` is the list of fields that violated the unique constraint.
      const target = (error.meta?.target as string[] | undefined) ?? [];
      return {
        status: HttpStatus.CONFLICT,
        code: 'CONFLICT',
        message: 'A record with this value already exists',
        details: target.length ? { fields: target } : undefined,
      };
    }
    case 'P2025':
    case 'P2018': // Required connected records not found
    case 'P2026': // Required related record not found
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: 'Record not found',
        details: { cause: (error.meta?.cause as string | undefined) ?? undefined },
      };
    case 'P2003': {
      const field =
        (error.meta?.field_name as string | undefined) ??
        (error.meta?.target as string | undefined);
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'FOREIGN_KEY_VIOLATION',
        message: 'Referenced record does not exist',
        details: field ? { field } : undefined,
      };
    }
    case 'P2014':
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_RELATION',
        message: 'Invalid required relation',
        details: error.meta,
      };
    case 'P2016':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: 'Invalid record id',
        details: error.meta,
      };
    case 'P2021':
    case 'P2022':
      // Schema drift — table/column missing. Surface as 500 (server bug).
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'Database schema mismatch — please contact support',
        details: error.meta,
      };
    case 'P2024':
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'UNAVAILABLE',
        message: 'Database connection pool exhausted — please retry',
        details: error.meta,
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'Database operation failed',
        details: { prismaCode: error.code, ...(error.meta ?? {}) },
      };
  }
}

/**
 * Standalone filter that catches only `PrismaClientKnownRequestError`.
 *
 * The {@link AllExceptionsFilter} also handles Prisma errors directly (via
 * `mapPrismaErrorToHttp`), so this standalone filter is **not registered
 * globally** — it exists so individual controllers/modules can attach it
 * explicitly (`@UseFilters(PrismaExceptionFilter)`) when they want Prisma
 * errors handled before any other global filter runs, or for testing in
 * isolation.
 */
@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<any>();
    const requestId =
      request?.id ?? request?.headers?.['x-request-id'] ?? undefined;

    const mapped = mapPrismaErrorToHttp(exception);

    this.logger.warn(
      `Prisma ${exception.code} → HTTP ${mapped.status} on ${request.method} ${request.url}`,
      {
        requestId,
        prismaCode: exception.code,
        httpStatus: mapped.status,
        errorCode: mapped.code,
      },
    );

    if (response.writableEnded || response.headersSent) return;

    response.status(mapped.status).json({
      success: false,
      error: {
        code: mapped.code,
        message: mapped.message,
        details: mapped.details ?? null,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

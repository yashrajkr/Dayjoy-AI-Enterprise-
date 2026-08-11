import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { mapPrismaErrorToHttp } from './prisma-exception.filter';

/**
 * Lightweight stand-ins for Express `Request` / `Response` so we can drive
 * the filter without booting a real HTTP server.
 */
function createMockResponse() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
    removeHeader: (name: string) => {
      delete headers[name.toLowerCase()];
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      this.writableEnded = true;
      this.headersSent = true;
      return this;
    },
  };
  return res;
}

function createMockRequest(overrides: Partial<any> = {}) {
  return {
    method: 'GET',
    url: '/api/test',
    path: '/api/test',
    ip: '127.0.0.1',
    headers: { 'x-request-id': 'test-req-id' },
    id: 'test-req-id',
    user: undefined,
    ...overrides,
  };
}

function createMockHost(req: any, res: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as any;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let loggerErrorSpy: any;
  let loggerWarnSpy: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AllExceptionsFilter],
    }).compile();

    filter = moduleRef.get(AllExceptionsFilter);

    // Spy on the internal logger so assertions don't depend on console output.
    const logger = (filter as any).logger;
    loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined as any);
    loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  });

  describe('HttpException → envelope', () => {
    it('maps NotFoundException → 404 NOT_FOUND', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      filter.catch(new NotFoundException('Customer not found'), createMockHost(req, res));

      expect(res.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Customer not found' },
        meta: { requestId: 'test-req-id' },
      });
      expect(res.body.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('maps ConflictException → 409 CONFLICT', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      filter.catch(new ConflictException('Already exists'), createMockHost(req, res));

      expect(res.statusCode).toBe(HttpStatus.CONFLICT);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('maps UnauthorizedException → 401 UNAUTHENTICATED', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      filter.catch(new UnauthorizedException(), createMockHost(req, res));

      expect(res.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('maps ForbiddenException → 403 FORBIDDEN', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      filter.catch(new ForbiddenException(), createMockHost(req, res));

      expect(res.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('maps class-validator BadRequestException[] → 400 VALIDATION_FAILED with details', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      // Simulate the shape class-validator produces via ValidationPipe.
      const validationErrors = [
        { property: 'email', constraints: { isEmail: 'email must be an email' } },
        { property: 'password', constraints: { minLength: 'password must be longer than 8' } },
      ];
      filter.catch(
        new BadRequestException(validationErrors),
        createMockHost(req, res),
      );

      expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.details).toHaveLength(2);
      expect(res.body.error.details[0].property).toBe('email');
    });

    it('maps a generic HttpException with custom status', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      filter.catch(new HttpException('teapot', 418), createMockHost(req, res));

      expect(res.statusCode).toBe(418);
      // 418 is not in the explicit map → falls back to generic 'ERROR'
      expect(res.body.error.code).toBe('ERROR');
      expect(res.body.error.message).toBe('teapot');
    });
  });

  describe('Prisma errors → envelope', () => {
    it('maps P2002 (unique constraint) → 409 CONFLICT with fields', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      const err = new PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.0.0', meta: { target: ['email'] } },
      );
      filter.catch(err, createMockHost(req, res));

      expect(res.statusCode).toBe(HttpStatus.CONFLICT);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.details.fields).toEqual(['email']);
    });

    it('maps P2025 (record not found) → 404 NOT_FOUND', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      const err = new PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.0.0',
      });
      filter.catch(err, createMockHost(req, res));

      expect(res.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('maps P2003 (foreign key) → 400 FOREIGN_KEY_VIOLATION', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      const err = new PrismaClientKnownRequestError('FK violation', {
        code: 'P2003',
        clientVersion: '6.0.0',
        meta: { field_name: 'customer_id' },
      });
      filter.catch(err, createMockHost(req, res));

      expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.error.code).toBe('FOREIGN_KEY_VIOLATION');
      expect(res.body.error.details.field).toBe('customer_id');
    });
  });

  describe('Unknown errors → 500', () => {
    it('maps a native Error → 500 INTERNAL_ERROR with sanitised message in dev', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        filter.catch(new Error('boom'), createMockHost(req, res));
      } finally {
        process.env.NODE_ENV = originalEnv;
      }

      expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.details).toBe('boom');
    });

    it('hides the message in production', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        filter.catch(new Error('boom'), createMockHost(req, res));
      } finally {
        process.env.NODE_ENV = originalEnv;
      }

      expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.body.error.details).toBeNull();
    });
  });

  describe('Logging', () => {
    it('logs 5xx at error level with request context', () => {
      const res = createMockResponse();
      const req = createMockRequest({ user: { userId: 'u-1' }, method: 'POST', url: '/api/orders' });
      filter.catch(new Error('boom'), createMockHost(req, res));

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      const message = loggerErrorSpy.mock.calls[0][0] as string;
      expect(message).toContain('POST /api/orders');
      expect(message).toContain('500');
    });

    it('logs 4xx at warn level', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      filter.catch(new NotFoundException(), createMockHost(req, res));

      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
      const message = loggerWarnSpy.mock.calls[0][0] as string;
      expect(message).toContain('404');
    });
  });

  describe('PII redaction', () => {
    it('scrubs sensitive fields from error.details', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      filter.catch(
        new BadRequestException({
          message: 'bad input',
          details: { password: 'hunter2', email: 'a@b.com' },
        }),
        createMockHost(req, res),
      );

      expect(res.body.error.details.password).toBe('[REDACTED]');
      expect(res.body.error.details.email).toBe('a@b.com');
    });

    it('scrubs Bearer tokens from string messages', () => {
      const res = createMockResponse();
      const req = createMockRequest();
      filter.catch(
        new Error('Authorization failed: Bearer eyJabc.def.ghi'),
        createMockHost(req, res),
      );

      // In dev mode the message lands in `details`.
      expect(JSON.stringify(res.body)).not.toContain('eyJabc');
      expect(JSON.stringify(res.body)).toContain('[REDACTED]');
    });
  });

  describe('Response already sent', () => {
    it('does not attempt to write a body if the response is already flushed', () => {
      const res = createMockResponse();
      res.writableEnded = true;
      res.headersSent = true;
      const req = createMockRequest();

      filter.catch(new Error('late'), createMockHost(req, res));

      expect(res.body).toBeUndefined();
      expect(loggerWarnSpy).toHaveBeenCalled();
    });
  });
});

describe('mapPrismaErrorToHttp', () => {
  const mk = (code: string, meta?: Record<string, unknown>) =>
    new PrismaClientKnownRequestError('msg', {
      code,
      clientVersion: '6.0.0',
      meta,
    });

  it('P2002 → 409 CONFLICT', () => {
    const r = mapPrismaErrorToHttp(mk('P2002', { target: ['email'] }));
    expect(r.status).toBe(HttpStatus.CONFLICT);
    expect(r.code).toBe('CONFLICT');
    expect(r.details).toEqual({ fields: ['email'] });
  });

  it('P2025 → 404 NOT_FOUND', () => {
    const r = mapPrismaErrorToHttp(mk('P2025'));
    expect(r.status).toBe(HttpStatus.NOT_FOUND);
  });

  it('P2003 → 400 FOREIGN_KEY_VIOLATION', () => {
    const r = mapPrismaErrorToHttp(mk('P2003', { field_name: 'order_id' }));
    expect(r.status).toBe(HttpStatus.BAD_REQUEST);
    expect(r.code).toBe('FOREIGN_KEY_VIOLATION');
  });

  it('P2014 → 400 INVALID_RELATION', () => {
    const r = mapPrismaErrorToHttp(mk('P2014'));
    expect(r.status).toBe(HttpStatus.BAD_REQUEST);
    expect(r.code).toBe('INVALID_RELATION');
  });

  it('P2024 → 503 UNAVAILABLE', () => {
    const r = mapPrismaErrorToHttp(mk('P2024'));
    expect(r.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('unknown code → 500 INTERNAL_ERROR with prismaCode', () => {
    const r = mapPrismaErrorToHttp(mk('P9999'));
    expect(r.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(r.details).toEqual({ prismaCode: 'P9999' });
  });
});

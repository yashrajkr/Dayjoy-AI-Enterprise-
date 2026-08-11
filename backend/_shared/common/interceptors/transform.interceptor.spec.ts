import { ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransformInterceptor } from './transform.interceptor';

/**
 * Build a minimal ExecutionContext + CallHandler pair to drive the
 * interceptor without booting a Nest module.
 */
function makeContext(opts: {
  path?: string;
  statusCode?: number;
  requestId?: string;
  contentDisposition?: string;
  headersSent?: boolean;
}) {
  const request: any = {
    path: opts.path ?? '/api/customers',
    url: opts.path ?? '/api/customers',
    method: 'GET',
    id: opts.requestId ?? 'req-123',
    headers: { 'x-request-id': opts.requestId ?? 'req-123' },
  };
  const response: any = {
    statusCode: opts.statusCode ?? 200,
    headersSent: opts.headersSent ?? false,
    getHeader: (name: string) =>
      name.toLowerCase() === 'content-disposition'
        ? opts.contentDisposition
        : undefined,
    setHeader: () => undefined,
  };
  const ctx: ExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as any;
  return { ctx, request, response };
}

function makeHandler(payload: unknown): CallHandler {
  return { handle: () => of(payload) } as any;
}

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('wraps a plain payload in the success envelope', async () => {
    const { ctx } = makeContext({});
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler({ id: 'c1', name: 'Alice' })),
    );

    expect(result).toMatchObject({
      success: true,
      data: { id: 'c1', name: 'Alice' },
      meta: { requestId: 'req-123' },
    });
    expect((result as any).meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('passes through arrays as the data field', async () => {
    const { ctx } = makeContext({});
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler([{ id: 1 }, { id: 2 }])),
    );

    expect(result).toMatchObject({
      success: true,
      data: [{ id: 1 }, { id: 2 }],
    });
  });

  it('passes through null data', async () => {
    const { ctx } = makeContext({});
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler(null)),
    );

    expect(result).toMatchObject({ success: true, data: null });
  });

  it('does NOT double-wrap an already-shaped envelope', async () => {
    const { ctx } = makeContext({});
    const paginated = {
      success: true,
      data: [{ id: 1 }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler(paginated)),
    );

    // Should be returned verbatim, not re-wrapped.
    expect(result).toBe(paginated);
  });

  it('does NOT wrap /health routes', async () => {
    const { ctx } = makeContext({ path: '/health/live' });
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler({ status: 'up' })),
    );

    expect(result).toEqual({ status: 'up' });
  });

  it('does NOT wrap /metrics routes', async () => {
    const { ctx } = makeContext({ path: '/metrics' });
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler('http_requests_total 42')),
    );

    expect(result).toBe('http_requests_total 42');
  });

  it('does NOT wrap /docs (Swagger UI) routes', async () => {
    const { ctx } = makeContext({ path: '/docs' });
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler('<html>swagger</html>')),
    );

    expect(result).toBe('<html>swagger</html>');
  });

  it('does NOT wrap a StreamableFile (binary download)', async () => {
    const { ctx } = makeContext({});
    const file = new StreamableFile(Buffer.from('binary-content'));
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler(file)),
    );

    expect(result).toBe(file);
  });

  it('does NOT wrap when Content-Disposition: attachment is set', async () => {
    const { ctx } = makeContext({
      contentDisposition: 'attachment; filename="report.csv"',
    });
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler('a,b,c\n1,2,3')),
    );

    expect(result).toBe('a,b,c\n1,2,3');
  });

  it('does NOT wrap a 204 No Content response', async () => {
    const { ctx } = makeContext({ statusCode: 204 });
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler(undefined)),
    );

    expect(result).toBeUndefined();
  });

  it('uses x-request-id header when req.id is absent', async () => {
    const request: any = {
      path: '/api/orders',
      url: '/api/orders',
      method: 'GET',
      // no .id — fall back to header
      headers: { 'x-request-id': 'hdr-id-456' },
    };
    const response: any = {
      statusCode: 200,
      headersSent: false,
      getHeader: () => undefined,
      setHeader: () => undefined,
    };
    const ctx: ExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any;

    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler({ ok: true })),
    );

    expect((result as any).meta.requestId).toBe('hdr-id-456');
  });
});

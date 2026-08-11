import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Emits one structured log line per completed HTTP request.
 *
 * The line includes: HTTP method, URL, status code, duration in ms, client
 * IP, request ID, and (when the request was authenticated) the user ID.
 * The request ID is taken from `req.id`, which is set upstream by
 * {@link RequestIdMiddleware} (or by an upstream gateway's `x-request-id`
 * header).
 *
 * This middleware runs **after** the response is flushed to the client
 * (`res.on('finish')`), so it always fires — even when the controller
 * throws and the global exception filter handles it. The corresponding
 * per-handler log line is emitted by {@link LoggingInterceptor} *before*
 * the response is written.
 *
 * Registered in `AppModule.configure()` via `consumer.apply(...)` — runs on
 * every route (`*`).
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTPRequest');

  use(req: Request & { id?: string; user?: any }, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const start = Date.now();

    // `x-forwarded-for` is honoured so the real client IP is logged when
    // running behind the nginx ingress controller / Cloudflare.
    const xff = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof xff === 'string' && xff.split(',')[0]?.trim()) || ip;

    const requestId = req.id ?? req.headers['x-request-id'];

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;
      const userId = req.user?.userId ?? req.user?.id;

      const message = `${method} ${originalUrl} ${statusCode} ${duration}ms`;
      const meta: Record<string, unknown> = {
        method,
        url: originalUrl,
        status: statusCode,
        durationMs: duration,
        ip: clientIp,
      };
      if (requestId) meta.requestId = requestId;
      if (userId) meta.userId = userId;

      // 5xx → error; 4xx → warn; everything else → log.
      if (statusCode >= 500) {
        this.logger.error(message, undefined, meta as any);
      } else if (statusCode >= 400) {
        this.logger.warn(message, meta as any);
      } else {
        this.logger.log(message, meta as any);
      }
    });

    next();
  }
}

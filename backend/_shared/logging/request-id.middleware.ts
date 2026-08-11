import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * Assigns a correlation ID (`requestId`) to every incoming HTTP request.
 *
 * The ID is taken from the inbound `x-request-id` header when present (so
 * upstream gateways / load balancers can propagate their own IDs), otherwise a
 * fresh RFC-4122 v4 UUID is generated. The ID is mirrored back on the response
 * via the `x-request-id` header so clients and downstream services can
 * correlate logs and traces.
 *
 * The value is also attached to `req.id` so request handlers, interceptors and
 * the structured logger can include it in their output.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void): void {
    const incoming = req.headers?.['x-request-id'];
    const id =
      typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

    req.id = id;
    req.requestId = id; // alias used by some NestJS logging helpers
    res.setHeader('x-request-id', id);

    next();
  }
}

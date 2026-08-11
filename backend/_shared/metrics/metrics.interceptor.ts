import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import {
  httpRequestDuration,
  httpRequestTotal,
} from './metrics.controller';

/**
 * Records HTTP request duration and total request count into Prometheus.
 *
 * The interceptor measures wall-clock latency from the moment the handler is
 * invoked to the moment the response stream completes, and emits both a
 * histogram observation (`http_request_duration_seconds`) and a counter
 * increment (`http_requests_total`) labelled by `method`, `route` and `status`.
 *
 * The `route` label prefers the matched Express route template
 * (`req.route.path`) — this keeps cardinality bounded. When no route is matched
 * (e.g. 404s) we fall back to the raw URL path with query string stripped, so
 * the metric remains useful without leaking high-cardinality path parameters.
 *
 * Errors thrown by downstream handlers are still recorded — we observe the
 * latency in an error tap and rethrow so the exception filter can run.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<any>();
    const res = context.switchToHttp().getResponse<any>();
    const start = Date.now();

    const record = () => {
      const duration = (Date.now() - start) / 1000;
      const labels = {
        method: req.method,
        route: this.resolveRoute(req),
        status: res.statusCode,
      };
      httpRequestDuration.observe(labels, duration);
      httpRequestTotal.inc(labels);
    };

    return next.handle().pipe(
      tap({
        next: () => record(),
        // Express assigns the status code on the response object even when an
        // error is thrown downstream (the exception filter sets it), so we can
        // safely record here too.
        error: () => record(),
      }),
    );
  }

  private resolveRoute(req: any): string {
    if (req.route?.path) {
      return req.route.path;
    }
    if (typeof req.url === 'string') {
      // Strip the query string to keep cardinality bounded.
      const idx = req.url.indexOf('?');
      return idx >= 0 ? req.url.slice(0, idx) : req.url;
    }
    return 'unknown';
  }
}

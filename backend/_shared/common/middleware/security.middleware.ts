import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Adds a baseline set of defensive security headers to every response.
 *
 * These headers complement (but do not replace) the headers set by `helmet`
 * in `main.ts`. Helmet covers the bulk of the header-hardening surface
 * (CSP, HSTS, COOP/COEP); this middleware fills in the Dayjoy-specific
 * defaults that need to apply uniformly to both the API and the static
 * docs/health/metrics routes that helmet doesn't always reach.
 *
 * Headers applied:
 *  - `X-Content-Type-Options: nosniff`         — IE / Chrome MIME-sniffing guard
 *  - `X-Frame-Options: DENY`                    — clickjacking via iframe embedding
 *  - `X-XSS-Protection: 0`                      — disable Auditor (deprecated, can introduce XSS)
 *  - `Referrer-Policy: strict-origin-when-cross-origin`
 *  - `Permissions-Policy: ...`                  — disable geolocation, camera, mic, etc.
 *  - `Cache-Control: no-store`                  — for all `/api/*` authed responses
 *
 * The middleware is intentionally idempotent: if a controller / interceptor
 * has already set one of these headers (e.g. a public CDN asset sets a long
 * Cache-Control), we do not overwrite it.
 *
 * Registered in `AppModule.configure()` via `consumer.apply(...)` — runs on
 * every route (`*`).
 */
@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  /**
   * Disables the high-risk browser APIs by default. Individual frontend apps
   * can re-enable specific features (`camera`, `microphone`, etc.) via their
   * own CSP / Permissions-Policy headers — the backend API never needs them.
   */
  private static readonly PERMISSIONS_POLICY =
    [
      'geolocation=()',
      'camera=()',
      'microphone=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
      'interest-cohort=()', // opt-out of FLoC
    ].join(', ');

  use(req: Request, res: Response, next: NextFunction) {
    // Hide the Express `x-powered-by` header — leaks framework version to
    // automated scanners. (helmet also does this; we do it defensively here
    // in case helmet is ever disabled in a sub-route.)
    res.removeHeader('x-powered-by');

    // Only set headers that aren't already set — controllers may override
    // any of these on a per-route basis (e.g. a public CDN asset that wants
    // a long Cache-Control).
    this.setIfAbsent(res, 'X-Content-Type-Options', 'nosniff');
    this.setIfAbsent(res, 'X-Frame-Options', 'DENY');
    this.setIfAbsent(res, 'X-XSS-Protection', '0');
    this.setIfAbsent(
      res,
      'Referrer-Policy',
      'strict-origin-when-cross-origin',
    );
    this.setIfAbsent(
      res,
      'Permissions-Policy',
      SecurityMiddleware.PERMISSIONS_POLICY,
    );

    // Disable caching for every authenticated API response. Static asset
    // routes (`/docs`, `/swagger`) and health/metrics are exempt because
    // they're either public or have their own caching semantics.
    if (this.shouldDisableCache(req.path)) {
      this.setIfAbsent(
        res,
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private',
      );
      this.setIfAbsent(res, 'Pragma', 'no-cache');
      this.setIfAbsent(res, 'Expires', '0');
    }

    next();
  }

  /**
   * Returns `true` for paths whose responses must never be cached.
   *
   *  - `/api/*`              — all authenticated business endpoints
   *  - `/api/auth/*`         — auth tokens (extra-defensive duplicate rule)
   *  - `/health*`, `/metrics` are intentionally NOT here so probes can be cached
   *    by intermediate caches for a few seconds.
   */
  private shouldDisableCache(path: string): boolean {
    return path.startsWith('/api/');
  }

  private setIfAbsent(res: Response, name: string, value: string): void {
    if (!res.getHeader(name)) {
      res.setHeader(name, value);
    }
  }
}

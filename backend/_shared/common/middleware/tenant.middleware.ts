import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Multi-tenant context resolver.
 *
 * Resolves the active tenant for every request and attaches it to
 * `req.tenantId` so services can scope their Prisma queries without
 * re-deriving it from the JWT on every call.
 *
 * Resolution order (first match wins):
 *  1. `X-Tenant-Id` request header — used by trusted internal callers
 *     (admin tooling, webhooks) where the JWT may not carry the tenant
 *     context. **Only honoured when the request is authenticated as a
 *     SUPER_ADMIN** (admin-only) — a regular user cannot override their
 *     own tenant via this header.
 *  2. `req.user.tenantId` — set by `JwtStrategy.validate()` after the JWT
 *     is decoded. This is the normal path for end-user requests.
 *  3. `undefined` — public endpoints (`/health`, `/metrics`, `/api/auth/login`)
 *     have no tenant context. Services that touch tenant-scoped tables
 *     must explicitly check for `tenantId` and throw 401 if absent.
 *
 * ## Postgres RLS hook
 *
 * If Postgres Row-Level Security is enabled on the tenant-scoped tables,
 * the tenant context must be propagated to the database session before any
 * query runs. This is done per-transaction using `SET LOCAL`:
 *
 * ```ts
 * await prisma.$transaction(async (tx) => {
 *   await tx.$executeRaw`SET LOCAL app.current_tenant = ${tenantId}`;
 *   // ... tenant-scoped queries
 * });
 * ```
 *
 * A middleware cannot inject this directly (Prisma transactions are
 * per-call), so this middleware only attaches `req.tenantId`. The actual
 * `SET LOCAL` is invoked by the `PrismaService` (or a future
 * `TenantScopedPrismaService` wrapper) when it opens a transaction.
 *
 * Registered in `AppModule.configure()` via `consumer.apply(...)` — runs
 * after {@link RequestIdMiddleware} and before
 * {@link RequestLoggingMiddleware}.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  use(
    req: Request & { id?: string; user?: any; tenantId?: string },
    _res: Response,
    next: NextFunction,
  ) {
    const headerTenantId = req.headers['x-tenant-id'];
    const userTenantId = req.user?.tenantId;

    // The X-Tenant-Id header is only honoured for SUPER_ADMIN users.
    // This is the "tenant impersonation" path used by the admin dashboard.
    const isSuperAdmin =
      req.user?.role === 'SUPER_ADMIN' ||
      (Array.isArray(req.user?.roles) && req.user.roles.includes('SUPER_ADMIN'));

    let tenantId: string | undefined;
    let source: 'header' | 'jwt' | undefined;

    if (typeof headerTenantId === 'string' && headerTenantId.length > 0) {
      if (isSuperAdmin) {
        tenantId = headerTenantId;
        source = 'header';
      } else if (userTenantId === headerTenantId) {
        // Regular user re-stating their own tenant via the header — harmless.
        tenantId = headerTenantId;
        source = 'header';
      } else {
        // Non-admin trying to impersonate a different tenant — log + deny.
        this.logger.warn(
          `Tenant header mismatch — user ${req.user?.userId ?? 'anon'} ` +
            `(tenant=${userTenantId ?? 'none'}) attempted to access tenant ${headerTenantId}`,
          { requestId: req.id, userId: req.user?.userId },
        );
        // Fall through to userTenantId (or undefined) — don't trust the header.
        tenantId = userTenantId;
        source = userTenantId ? 'jwt' : undefined;
      }
    } else {
      tenantId = userTenantId;
      source = userTenantId ? 'jwt' : undefined;
    }

    // Attach the resolved tenant to the request for downstream services.
    req.tenantId = tenantId;
    // Also stash the source for audit / debug.
    (req as any).tenantIdSource = source;

    if (tenantId) {
      this.logger.debug(
        `Resolved tenant ${tenantId} via ${source} for ${req.method} ${req.url}`,
        { requestId: req.id, userId: req.user?.userId, tenantId, source },
      );
    }

    next();
  }
}

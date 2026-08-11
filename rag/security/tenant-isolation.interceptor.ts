import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Tenant Isolation Interceptor
 * ============================
 *
 * Stamps the authenticated user's `tenantId` onto the request as
 * `request.tenantId` so downstream services and Prisma queries can
 * read it without each having to dig into `request.user`.
 *
 * Why an interceptor (and not just middleware)? Because the JWT must be
 * decoded first — that happens in `JwtAuthGuard`, which runs *after*
 * middleware and *before* interceptors in the NestJS request lifecycle:
 *
 *   middleware → guards → interceptors (req) → handler → interceptors (res)
 *
 * Putting the tenant stamp in an interceptor (rather than middleware)
 * guarantees `request.user` is already populated by the time we read it.
 *
 * ## Defensive tenant check
 *
 * If the request body/query carries an explicit `tenantId` that *doesn't*
 * match the authenticated user's tenant, the interceptor rejects the
 * request with `403 Forbidden`. This prevents an entire class of
 * cross-tenant attacks where a malicious client tries to write data into
 * another tenant's namespace by setting `tenantId` in the body.
 *
 *   Super-admin bypass: a `SUPER_ADMIN` role on `request.user` skips the
 *   mismatch check — admins acting on behalf of another tenant are
 *   allowed (e.g. support tooling).
 *
 * Reference: `docs/database/14_DATABASE_SECURITY.md` (Section 4 — Access
 * Control Model), `docs/architecture/10_SECURITY_ARCHITECTURE.md`
 * (Section 5 — Data Security).
 */
@Injectable()
export class TenantIsolationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantIsolationInterceptor.name);

  private static readonly SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context
      .switchToHttp()
      .getRequest<{
        user?: { userId?: string; tenantId?: string; role?: string };
        body?: any;
        query?: any;
        params?: any;
        tenantId?: string;
      }>();

    const user = request.user;
    if (!user) {
      // No authenticated user — let downstream guards/interceptors handle it.
      return next.handle();
    }

    // Stamp the user's tenant on the request for easy downstream access.
    if (user.tenantId) {
      request.tenantId = user.tenantId;
    }

    // Defensive check: if the request body/query carries an explicit
    // `tenantId` that doesn't match the user's, reject. This catches
    // cross-tenant write attempts at the edge.
    const providedTenantId: string | undefined =
      request.body?.tenantId ?? request.query?.tenantId ?? request.params?.tenantId;

    if (
      providedTenantId &&
      user.tenantId &&
      providedTenantId !== user.tenantId &&
      user.role !== TenantIsolationInterceptor.SUPER_ADMIN_ROLE
    ) {
      this.logger.warn(
        `Tenant isolation violation: user=${user.userId} (tenant=${user.tenantId}) tried to act on tenant=${providedTenantId}`,
      );
      throw new ForbiddenException(
        'Cross-tenant access is not allowed',
      );
    }

    return next.handle();
  }
}

import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard for the login endpoint.
 *
 * The login endpoint accepts `{ email, password }` as JSON; the actual
 * credential verification (user lookup + bcrypt compare + rate-limit
 * checks + lockout enforcement) happens inside {@link AuthService.login}.
 *
 * This guard is intentionally a thin passthrough so the controller can
 * delegate to the service. It exists so the OpenAPI / route metadata can
 * distinguish "this is a login-style endpoint" from a fully public
 * endpoint, and so future concerns (e.g. captcha verification on login,
 * IP throttling at the guard layer) have a natural extension point.
 *
 * Note: the equivalent FastAPI reference implementation uses a
 * `LocalStrategy` (passport-local) for this; we chose to keep the
 * credential logic in the service because it needs access to multiple
 * providers (Prisma, Redis rate limiter, JwtBlocklistService) that are
 * awkward to wire into a passport strategy.
 */
@Injectable()
export class LocalGuard extends AuthGuard('local') {
  canActivate(context: ExecutionContext) {
    return true;
  }
}

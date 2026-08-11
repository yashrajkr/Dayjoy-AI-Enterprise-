import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard for the refresh-token endpoint.
 *
 * Unlike {@link JwtAuthGuard} (which extracts an access token from the
 * `Authorization: Bearer` header via the `jwt` passport strategy), this
 * guard reads the refresh token from the request body — the refresh
 * endpoint accepts `{ refreshToken: string }` as JSON, not a bearer token.
 *
 * Implementation note: the actual verification (JWT signature + blocklist
 * + session lookup + rotation) happens inside {@link AuthService.refresh},
 * not in a passport strategy. So this guard is intentionally a thin
 * `canActivate` passthrough that delegates to the controller / service.
 *
 * Keeping it as a class (rather than just calling the service directly
 * from the controller) lets us centralise future concerns like rate
 * limiting on the refresh endpoint, IP throttling, etc.
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  canActivate(context: ExecutionContext) {
    // The refresh endpoint is public (no Authorization header required);
    // the supplied refresh token is validated inside AuthService.refresh.
    // Returning true here means "let the request through to the controller".
    return true;
  }
}

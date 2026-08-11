import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../_shared/auth/public.decorator';

/**
 * Default JWT authentication guard.
 *
 * Wraps the passport `jwt` strategy (which extracts the bearer token,
 * verifies the signature/expiry, and consults the
 * {@link JwtBlocklistService} to reject revoked tokens).
 *
 * Honours the `@Public()` decorator from `_shared/auth` — handlers
 * marked `@Public()` skip authentication entirely.
 *
 * Returns a 401 `UnauthorizedException` on missing / invalid tokens so
 * the global exception filter can render a consistent error response.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Authentication required');
    }
    return user;
  }
}

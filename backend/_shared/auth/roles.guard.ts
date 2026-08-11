import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ROLES_KEY } from './roles.decorator';

/**
 * Role name that bypasses the role check entirely. Mirrors the value used
 * by {@link PermissionsGuard} in `_shared/security/permissions.guard.ts`.
 */
const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

/**
 * NestJS guard that enforces coarse-grained role-based access control.
 *
 * Reads the `@Roles(...)` metadata set by {@link Roles} and verifies that
 * the authenticated user has at least one of the listed roles. Behaviour:
 *
 *  - No `@Roles(...)` metadata on the handler/class → allow (no-op).
 *  - No authenticated user on `request.user` → 401.
 *  - `user.role === 'SUPER_ADMIN'` → always allow (super-user bypass).
 *  - Otherwise: allow iff `requiredRoles` includes `user.role`.
 *
 * The user's role is read from `request.user.role` (denormalised, fast).
 * For fine-grained `resource:action` permission checks, use the
 * {@link PermissionsGuard} in `_shared/security/permissions.guard.ts`
 * instead, which loads the full user → roles → permissions graph from
 * Prisma on every request.
 *
 * @example
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('ADMIN', 'MANAGER')
 *   @Get('reports')
 *   async reports() { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      AUTH_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles metadata → this guard is a no-op for the route.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { role?: string; userId?: string };
    }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException(
        'Authentication required to check role',
      );
    }

    // Super-admin short-circuit.
    if (user.role === SUPER_ADMIN_ROLE) {
      return true;
    }

    const ok = requiredRoles.includes(user.role ?? '');
    if (!ok) {
      this.logger.warn(
        `Role DENIED for user ${user.userId ?? '<unknown>'}: required=[${requiredRoles.join(',')}] actual=${user.role ?? '<none>'}`,
      );
    }
    return ok;
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector, SetMetadata } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';

/**
 * Metadata key under which required permissions are stored on a handler.
 */
export const PERMISSIONS_KEY = 'permissions';

/**
 * Method/class decorator that marks an endpoint as requiring ALL of the
 * listed permissions. Permission strings use the form `resource:action`,
 * e.g. `RequirePermissions('users:read', 'users:write')`.
 *
 * Evaluated by {@link PermissionsGuard} (register it as an APP_GUARD or
 * apply per-controller with `@UseGuards(PermissionsGuard)`).
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Role name that bypasses the permission check entirely. Assigned via the
 * `user_roles` table (Role.name = 'SUPER_ADMIN').
 */
const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

/**
 * NestJS guard that enforces fine-grained RBAC.
 *
 * Replaces the old Express `requirePermission` TODO stub with a real
 * implementation backed by the Prisma `user_roles` -> `roles` ->
 * `role_permissions` -> `permissions` graph.
 *
 * Behaviour:
 *  - If no `@RequirePermissions(...)` is set on the handler/class → allow.
 *  - If no authenticated user on the request → 401.
 *  - If the user has the `SUPER_ADMIN` role → allow (short-circuit).
 *  - Otherwise load the user's active roles + their permissions and require
 *    that EVERY requested permission is present (`AND` semantics).
 *
 * `user_roles.expires_at` is respected: expired assignments are ignored.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePermissions metadata → this guard is a no-op for the route.
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: any }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException(
        'Authentication required to check permissions',
      );
    }

    // JwtStrategy returns { userId, tenantId, email }.
    const userId: string | undefined = user.userId ?? user.id ?? user.sub;
    if (!userId) {
      this.logger.warn(
        `Permission check on user without id — denying. user keys: ${Object.keys(user).join(',')}`,
      );
      return false;
    }

    // Load active (non-expired) roles + their permissions in one query.
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    // Super-admin short-circuit.
    if (userRoles.some((ur) => ur.role.name === SUPER_ADMIN_ROLE)) {
      return true;
    }

    // Build the set of granted "resource:action" strings.
    const granted = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) {
        granted.add(`${rp.permission.resource}:${rp.permission.action}`);
      }
    }

    // ALL required permissions must be granted (AND semantics).
    const ok = required.every((p) => granted.has(p));
    if (!ok) {
      this.logger.warn(
        `Permission DENIED for user ${userId}: required=[${required.join(',')}] granted=[${Array.from(granted).join(',')}]`,
      );
    }
    return ok;
  }
}

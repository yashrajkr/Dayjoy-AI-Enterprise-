import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key under which the list of allowed role names is stored on a
 * handler or controller. Read by {@link RolesGuard} (in this same folder).
 *
 * (Kept independent of the legacy `_shared/common/decorators/roles.decorator.ts`
 * `ROLES_KEY` so the two role systems can coexist; downstream callers should
 * prefer the `_shared/auth` version which also supports SUPER_ADMIN bypass.)
 */
export const AUTH_ROLES_KEY = 'authRoles';

/**
 * Method/class decorator that marks an endpoint as requiring at least one
 * of the listed roles. Evaluated by {@link RolesGuard}.
 *
 * Role names correspond to the `Role.name` column in the Prisma schema
 * (e.g. `'USER'`, `'ADMIN'`, `'MANAGER'`, `'SUPER_ADMIN'`). The
 * `SUPER_ADMIN` role always bypasses the check.
 *
 * @example
 *   @Get('admin-stats')
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('ADMIN', 'MANAGER')
 *   async adminStats() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(AUTH_ROLES_KEY, roles);

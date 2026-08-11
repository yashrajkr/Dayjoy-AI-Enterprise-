import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key set on handlers / controllers decorated with {@link Roles}.
 *
 * Read by the global {@link RolesGuard} (registered as `APP_GUARD`) to
 * determine the set of role names that are allowed to invoke the route.
 */
export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or an entire controller) to users holding one of the
 * listed role names. The currently-authenticated user's `role` field
 * (populated by `JwtStrategy`) is compared against the list — ANY match
 * grants access (OR semantics).
 *
 * ```ts
 * @Roles('ADMIN', 'SUPER_ADMIN')
 * @UseGuards(JwtAuthGuard)
 * @Get('admin-only')
 * adminOnly() { ... }
 * ```
 *
 * For fine-grained per-action permissions, prefer
 * `@RequirePermissions('resource:action')` from
 * `_shared/security/permissions.guard.ts` over `@Roles(...)`.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

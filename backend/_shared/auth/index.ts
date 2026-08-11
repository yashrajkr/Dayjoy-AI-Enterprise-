/**
 * Barrel for shared auth utilities.
 *
 * Re-exports the decorators + guard that feature modules use to wire up
 * authentication & role-based access control:
 *
 *   import {
 *     CurrentUser,
 *     Public,
 *     Roles,
 *     RolesGuard,
 *     SharedAuthModule,
 *     type AuthenticatedUser,
 *   } from '../_shared/auth';
 */

export { CurrentUser, type AuthenticatedUser } from './current-user.decorator';
export { Public, IS_PUBLIC_KEY } from './public.decorator';
export { Roles, AUTH_ROLES_KEY } from './roles.decorator';
export { RolesGuard } from './roles.guard';
export { SharedAuthModule } from './auth.module';

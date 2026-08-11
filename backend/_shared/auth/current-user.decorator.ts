import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Shape of the user object attached to `request.user` by the JWT strategy.
 *
 * `JwtStrategy.validate()` returns an object with these fields; downstream
 * handlers can read them off the request via the {@link CurrentUser}
 * param decorator.
 */
export interface AuthenticatedUser {
  /** User ID (Prisma `User.id`, UUID string). */
  userId: string;
  /** Tenant ID the user belongs to. */
  tenantId: string;
  /** Email address (carried in the JWT for convenience). */
  email: string;
  /** JWT ID — unique per token; used for logout / revocation. */
  jti?: string;
  /**
   * Optional role string carried on the JWT. Most RBAC checks should
   * load the user's active roles via Prisma (see PermissionsGuard), but
   * a denormalised primary role is useful for fast coarse checks.
   */
  role?: string;
}

/**
 * Parameter decorator that injects the authenticated user (or a single
 * field of it) from the request.
 *
 * @example
 *   @Get('me')
 *   @UseGuards(JwtAuthGuard)
 *   async me(@CurrentUser() user: AuthenticatedUser) {
 *     return user;
 *   }
 *
 *   @Get('me/id')
 *   @UseGuards(JwtAuthGuard)
 *   async myId(@CurrentUser('userId') userId: string) {
 *     return { userId };
 *   }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return data ? user[data] : user;
  },
);

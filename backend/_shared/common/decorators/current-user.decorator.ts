import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Parameter decorator that injects the currently-authenticated user object
 * (the value returned by `JwtStrategy.validate()`).
 *
 * ```ts
 * @Get('me')
 * @UseGuards(JwtAuthGuard)
 * me(@CurrentUser() user: AuthUser) {
 *   return { id: user.userId, email: user.email };
 * }
 * ```
 *
 * If no user is attached to the request (unauthenticated route), `undefined`
 * is injected — the handler should declare the parameter as optional and
 * guard against `undefined` itself.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof { userId: string; tenantId: string; email: string; jti?: string } | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = (request as any).user;
    return data ? user?.[data] : user;
  },
);

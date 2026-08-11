import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key set on handlers / controllers marked with {@link Public}.
 *
 * Guards that participate in the public-route bypass (currently the
 * `JwtAuthGuard` in `auth/guards/`) read this metadata via `Reflector` and
 * short-circuit (`return true`) when it is present — i.e. an unauthenticated
 * request is allowed through.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or an entire controller) as **not requiring authentication**.
 *
 * Use this when a global `JwtAuthGuard` is registered (`APP_GUARD`), to opt
 * specific routes out of the auth requirement.
 *
 * ```ts
 * @Controller('api/auth')
 * export class AuthController {
 *   @Public()
 *   @Post('login')
 *   login(@Body() dto: LoginDto) { ... }
 *
 *   @Post('logout')  // requires auth
 *   @UseGuards(JwtAuthGuard)
 *   logout() { ... }
 * }
 * ```
 *
 * > **Note**: This decorator is the temporary home for the `@Public()`
 * > marker while `_shared/auth/` (the future home, owned by Agent A) is
 * > being built. Once `_shared/auth/decorators/public.decorator.ts` lands,
 * > this file can be deleted and the import alias updated.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

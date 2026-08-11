import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key under which the `@Public()` flag is stored on a handler.
 *
 * Guards that run globally (e.g. a default JwtAuthGuard registered via
 * `APP_GUARD`) read this metadata to decide whether to skip authentication
 * for a given route.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint as public — i.e. accessible without an authenticated
 * user / valid JWT.
 *
 * Use this on individual handlers (or entire controllers) that bypass the
 * default authentication guard, e.g. login, register, password reset
 * endpoints.
 *
 * @example
 *   @Post('login')
 *   @Public()
 *   async login(@Body() dto: LoginDto) { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

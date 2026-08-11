import { Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

/**
 * Shared auth utilities module.
 *
 * Exposes the cross-cutting auth decorators + the {@link RolesGuard} so
 * feature modules can wire them up with a single import:
 *
 *   @Module({
 *     imports: [SharedAuthModule],
 *     ...
 *   })
 *
 * The decorators themselves (`@CurrentUser`, `@Public`, `@Roles`) are
 * pure functions and don't need to be exported through the DI container —
 * callers import them directly from the source files or via the barrel
 * `index.ts`.
 *
 * `RolesGuard` is exported as a provider so it can be `useClass`-bound as
 * an `APP_GUARD` or applied per-controller via `@UseGuards(RolesGuard)`.
 */
@Module({
  providers: [RolesGuard],
  exports: [RolesGuard],
})
export class SharedAuthModule {}

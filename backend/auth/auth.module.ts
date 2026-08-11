import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SecurityModule } from '../_shared/security/security.module';

/**
 * Auth feature module.
 *
 * Imports:
 *  - {@link PassportModule} — required by the `JwtStrategy` (passport-jwt)
 *  - {@link JwtModule}      — JWT signing / verification
 *  - {@link SecurityModule} — provides `JwtBlocklistService`,
 *                             `RateLimitService`, and `RedisModule`
 *                             (the latter is `@Global()` but re-imported
 *                             here for explicit documentation)
 *
 * The NotificationsService dependency is injected via the
 * `NOTIFICATIONS_SERVICE` string token (see `./notifications-token.ts`)
 * and is `@Optional()`. This keeps the auth module decoupled from the
 * still-under-active-development notifications module — when the
 * NotificationsModule is stable, it can bind the token to the real
 * NotificationsService via:
 *
 *   {
 *     provide: NOTIFICATIONS_SERVICE,
 *     useExisting: NotificationsService,
 *   }
 *
 * The JwtModule is registered without a secret here — the JwtStrategy
 * supplies the secret via ConfigService, and the AuthService uses
 * JwtService.sign with the configured secret. We pass `{}` so the
 * JwtModule doesn't throw on missing config.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    SecurityModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

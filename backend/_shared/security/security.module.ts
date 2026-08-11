import { Global, Module } from '@nestjs/common';
import { RedisModule } from './redis.module';
import { JwtBlocklistService } from './jwt-blocklist.service';
import { RateLimitService } from './rate-limit.service';
import { PermissionsGuard } from './permissions.guard';

/**
 * Global security module.
 *
 * Bundles the cross-cutting security services that the rest of the app needs:
 *  - {@link RedisModule} — shared ioredis client
 *  - {@link JwtBlocklistService} — JWT JTI revocation (used by AuthService.logout)
 *  - {@link RateLimitService} — per-user sliding-window rate limiting
 *  - {@link PermissionsGuard} — real RBAC guard (replaces the old TODO stub)
 *
 * Marked @Global() so feature modules (auth, users, etc.) can inject these
 * providers without importing SecurityModule everywhere.
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [JwtBlocklistService, RateLimitService, PermissionsGuard],
  exports: [
    JwtBlocklistService,
    RateLimitService,
    PermissionsGuard,
    RedisModule,
  ],
})
export class SecurityModule {}

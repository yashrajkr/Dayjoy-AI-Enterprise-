import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Injection token for the shared ioredis client.
 * Use `@InjectRedis()` to inject it into any provider.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Global Redis module.
 *
 * Provides a single shared ioredis connection for the whole application:
 *  - JwtBlocklistService (JWT JTI revocation)
 *  - RateLimitService (per-user sliding-window rate limiting)
 *  - OAuth2 state store (multi-replica safe, replaces in-process memory)
 *
 * Marked @Global() so feature modules don't have to re-import it.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('REDIS_URL');
        if (!url) {
          throw new Error(
            'REDIS_URL is not set. The security module requires Redis for JWT blocklist and rate limiting.',
          );
        }

        return new Redis(url, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
          // Retry with exponential backoff so transient Redis outages don't
          // crash the pod (the rate-limit / blocklist paths degrade rather
          // than hard-fail).
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 200, 2000);
            return delay;
          },
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

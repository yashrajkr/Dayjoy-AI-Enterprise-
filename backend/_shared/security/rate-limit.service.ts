import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from './redis.decorators';
import Redis from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests the caller may make in the current window. */
  remaining: number;
  /** Epoch ms at which the current window resets. */
  resetAt: number;
  /** Total requests made in the current window (including the one just made). */
  count: number;
}

/**
 * Redis-backed sliding-window rate limiter.
 *
 * Implements a per-key (per-user, per-IP, per-whatever) fixed sliding window
 * using a Redis sorted set:
 *  1. Drop entries older than the window start (`zremrangebyscore`).
 *  2. Add the current request (`zadd`).
 *  3. Count entries (`zcard`).
 *  4. Refresh the key TTL (`expire`).
 *
 * Because state lives in Redis, the limit is enforced across all backend
 * replicas — solving the original "only per-IP" / "in-process memory" issues.
 *
 * Pipelined so all four commands round-trip in a single Redis call.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly keyPrefix = 'ratelimit:';

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /**
   * Check (and record) a request against the rate limit.
   *
   * @param key            Logical identifier, e.g. `user:${userId}:login` or
   *                       `ip:${ip}:api`.
   * @param limit          Max number of requests allowed in the window.
   * @param windowSeconds  Window length in seconds.
   */
  async checkLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const redisKey = `${this.keyPrefix}${key}`;

    // Unique member value so concurrent requests in the same ms don't collide.
    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

    try {
      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(redisKey, 0, windowStart);
      pipeline.zadd(redisKey, now, member);
      pipeline.zcard(redisKey);
      pipeline.pexpire(redisKey, windowSeconds * 1000);
      const results = await pipeline.exec();

      // results![2][1] is the zcard result.
      const count = (results?.[2]?.[1] as number) ?? 0;
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetAt = now + windowSeconds * 1000;

      return { allowed, remaining, resetAt, count };
    } catch (err) {
      // Fail OPEN on Redis errors so we don't take the whole platform down
      // during a Redis hiccup. Log loudly so ops notices.
      this.logger.error(
        `Redis error in rate-limit check — failing open: ${(err as Error).message}`,
      );
      return {
        allowed: true,
        remaining: limit,
        resetAt: now + windowSeconds * 1000,
        count: 0,
      };
    }
  }
}

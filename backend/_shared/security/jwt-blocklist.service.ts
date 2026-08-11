import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRedis } from './redis.decorators';
import Redis from 'ioredis';

/**
 * Redis-backed JWT revocation blocklist.
 *
 * Stateful JWTs are normally valid until they expire. To support logout /
 * force-logout / "revoke all sessions" we maintain a JTI (JWT ID) blocklist
 * in Redis. Each entry has a TTL equal to the token's remaining lifetime, so
 * the blocklist cleans itself up automatically.
 *
 * The JwtStrategy consults {@link isBlocked} on every authenticated request;
 * the AuthService calls {@link block} on logout.
 *
 * Multi-replica safe: every replica reads from the same Redis, so a logout
 * on one pod immediately invalidates the token on all other pods.
 */
@Injectable()
export class JwtBlocklistService implements OnModuleInit {
  private readonly logger = new Logger(JwtBlocklistService.name);
  private readonly keyPrefix = 'jwt:blocklist:';

  constructor(@InjectRedis() private readonly redis: Redis) {}

  onModuleInit(): void {
    this.logger.log('JWT blocklist service initialized (Redis-backed)');
  }

  /**
   * Add a JTI to the blocklist.
   *
   * @param jti       The JWT ID (`jti` claim) to revoke.
   * @param expiresAt Unix epoch seconds at which the token expires.
   *                  The Redis key TTL is set so it auto-expires when the
   *                  token would have been unusable anyway.
   */
  async block(jti: string, expiresAt: number): Promise<void> {
    if (!jti) {
      this.logger.warn('block() called with empty jti — ignoring');
      return;
    }

    const ttl = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
    if (ttl <= 0) {
      // Token already expired — nothing to block.
      return;
    }

    await this.redis.setex(`${this.keyPrefix}${jti}`, ttl, '1');
    this.logger.debug(`JTI ${jti} blocklisted for ${ttl}s`);
  }

  /**
   * Check whether a JTI has been revoked.
   *
   * Returns `false` if Redis is unreachable — fail OPEN so an Redis outage
   * doesn't lock every authenticated user out of the platform. The token
   * still has to pass signature/expiry verification by passport-jwt.
   */
  async isBlocked(jti: string): Promise<boolean> {
    if (!jti) return false;

    try {
      const result = await this.redis.get(`${this.keyPrefix}${jti}`);
      return result !== null;
    } catch (err) {
      this.logger.error(
        `Redis error during blocklist check — failing open: ${(err as Error).message}`,
      );
      return false;
    }
  }
}

import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { JwtBlocklistService } from './jwt-blocklist.service';
import { REDIS_CLIENT } from './redis.module';
import { createMockRedis } from '../testing/mock-redis';

/**
 * JwtBlocklistService unit tests.
 *
 * Redis is mocked via `createMockRedis()` which backs `get/set/setex/del`
 * with an in-memory Map — so a `block()` followed by `isBlocked()` against
 * the same JTI returns true end-to-end without a real Redis instance.
 *
 * The blocklist TTL behaviour is asserted by spying on `setex` to verify
 * the right key + TTL are written (the in-memory mock doesn't enforce
 * expiry, but the TTL value passed to Redis is what matters in prod).
 */
describe('JwtBlocklistService', () => {
  let service: JwtBlocklistService;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    redis = createMockRedis();
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtBlocklistService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();
    service = moduleRef.get(JwtBlocklistService);
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------
  // block()
  // ---------------------------------------------------------------------
  describe('block', () => {
    it('writes a TTLed blocklist key for the supplied JTI', async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600; // +1h

      await service.block('jti-123', expiresAt);

      expect(redis.setex).toHaveBeenCalledOnce();
      const [key, ttl, value] = redis.setex.mock.calls[0];
      expect(key).toBe('jwt:blocklist:jti-123');
      // TTL should be ~3600s (allow a small skew for test latency).
      expect(ttl).toBeGreaterThan(3500);
      expect(ttl).toBeLessThanOrEqual(3600);
      expect(value).toBe('1');
    });

    it('is a no-op when the JTI is empty', async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      await service.block('', expiresAt);

      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('is a no-op when the token has already expired (TTL <= 0)', async () => {
      const expiresAt = Math.floor(Date.now() / 1000) - 10; // 10s ago

      await service.block('jti-expired', expiresAt);

      expect(redis.setex).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // isBlocked()
  // ---------------------------------------------------------------------
  describe('isBlocked', () => {
    it('returns true for a JTI that has been blocklisted', async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      await service.block('jti-blocked', expiresAt);

      const result = await service.isBlocked('jti-blocked');
      expect(result).toBe(true);
      expect(redis.get).toHaveBeenCalledWith('jwt:blocklist:jti-blocked');
    });

    it('returns false for a JTI that has not been blocklisted', async () => {
      const result = await service.isBlocked('jti-unknown');
      expect(result).toBe(false);
    });

    it('returns false when called with an empty JTI', async () => {
      const result = await service.isBlocked('');
      expect(result).toBe(false);
      expect(redis.get).not.toHaveBeenCalled();
    });

    it('fails OPEN (returns false) when Redis throws', async () => {
      // Force a Redis error.
      redis.get.mockRejectedValueOnce(new Error('ECONNRESET'));

      const result = await service.isBlocked('jti-1');
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // End-to-end (block → isBlocked round trip)
  // ---------------------------------------------------------------------
  describe('round trip', () => {
    it('a fresh block immediately makes isBlocked return true', async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60;
      expect(await service.isBlocked('rt-1')).toBe(false);
      await service.block('rt-1', expiresAt);
      expect(await service.isBlocked('rt-1')).toBe(true);
    });
  });
});

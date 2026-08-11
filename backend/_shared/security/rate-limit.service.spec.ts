import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { RateLimitService } from './rate-limit.service';
import { REDIS_CLIENT } from './redis.module';
import { createMockRedis } from '../testing/mock-redis';

/**
 * RateLimitService unit tests.
 *
 * The sliding-window algorithm is implemented as a 4-command Redis pipeline
 * (zremrangebyscore → zadd → zcard → pexpire). The mock Redis returns a
 * canned pipeline whose `exec()` result we override per-test to simulate
 * different `zcard` counts (which is what drives the allowed/denied branch).
 */
describe('RateLimitService', () => {
  let service: RateLimitService;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    redis = createMockRedis();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();
    service = moduleRef.get(RateLimitService);
    vi.clearAllMocks();
  });

  /**
   * Helper — configure the mock pipeline to return the supplied zcard count
   * (3rd element of the exec result). The other 3 elements are kept at the
   * default values the real Redis pipeline returns.
   */
  function setPipelineZcard(count: number) {
    redis.pipeline.mockReturnValueOnce({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => [
        [null, 0],          // zremrangebyscore
        [null, 1],          // zadd
        [null, count],      // zcard  ← drives the limit check
        [null, 1],          // pexpire
      ]),
    });
  }

  // ---------------------------------------------------------------------
  // checkLimit()
  // ---------------------------------------------------------------------
  describe('checkLimit', () => {
    it('allows the request when count is under the limit', async () => {
      setPipelineZcard(1);

      const result = await service.checkLimit('user:1:login', 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
      expect(result.remaining).toBe(4);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('denies the request when count exceeds the limit', async () => {
      setPipelineZcard(6);

      const result = await service.checkLimit('user:1:login', 5, 60);

      expect(result.allowed).toBe(false);
      expect(result.count).toBe(6);
      // remaining is clamped to 0 (limit - count = -1 → 0).
      expect(result.remaining).toBe(0);
    });

    it('allows the request exactly at the limit (count == limit)', async () => {
      setPipelineZcard(5);

      const result = await service.checkLimit('ip:1.2.3.4:api', 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('uses the keyPrefix when building the Redis key', async () => {
      setPipelineZcard(1);

      await service.checkLimit('user:42:login', 5, 60);

      // The pipeline mock exposes zadd as a vi.fn — inspect the first call
      // (the redisKey passed to zadd). Actually the service uses the same
      // redisKey for all four commands; check zadd's first arg.
      const pipeline = redis.pipeline.mock.results[0].value;
      const zaddCallArgs = pipeline.zadd.mock.calls[0];
      expect(zaddCallArgs[0]).toBe('ratelimit:user:42:login');
    });

    it('fails OPEN (allows) when Redis throws', async () => {
      // Force the pipeline to reject exec.
      redis.pipeline.mockReturnValueOnce({
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
      });

      const result = await service.checkLimit('user:1:login', 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.count).toBe(0);
      expect(result.remaining).toBe(5);
    });
  });
});

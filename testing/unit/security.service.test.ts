/**
 * Unit tests — Security services (JwtBlocklistService + RateLimitService +
 * PermissionsGuard).
 *
 * Covers:
 *  - JwtBlocklistService.block() / isBlocked() — Redis TTL semantics
 *  - RateLimitService.checkLimit()             — sliding-window enforcement
 *  - PermissionsGuard.canActivate()            — RBAC + SUPER_ADMIN bypass
 *
 * Redis is mocked (in-memory store), Prisma is mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  Reflector,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

import { JwtBlocklistService } from '@backend/_shared/security/jwt-blocklist.service';
import { RateLimitService } from '@backend/_shared/security/rate-limit.service';
import {
  PermissionsGuard,
  PERMISSIONS_KEY,
} from '@backend/_shared/security/permissions.guard';
import { REDIS_CLIENT } from '@backend/_shared/security/redis.module';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { mockPrismaService, mockRedis } from '@testing/helpers/mocks';
import {
  testUser,
  testTenant,
  testSuperAdmin,
} from '@testing/helpers/fixtures';

// =====================================================================
// JwtBlocklistService
// =====================================================================

describe('JwtBlocklistService (unit)', () => {
  let service: JwtBlocklistService;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(async () => {
    redis = mockRedis();
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtBlocklistService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();
    service = moduleRef.get(JwtBlocklistService);
  });

  describe('block()', () => {
    it('writes the JTI to Redis with TTL = remaining token lifetime', async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      await service.block('jti-1', expiresAt);

      const [key, ttl] = redis.setex.mock.calls[0];
      expect(key).toContain('jwt:blocklist:jti-1');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('ignores empty JTI values', async () => {
      await service.block('', Math.floor(Date.now() / 1000) + 3600);

      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('sets TTL = 0 (effectively a no-op) when the token is already expired', async () => {
      const expiresAt = Math.floor(Date.now() / 1000) - 1;

      await service.block('jti-expired', expiresAt);

      // Either not called, or called with TTL=0.
      if (redis.setex.mock.calls.length > 0) {
        const [, ttl] = redis.setex.mock.calls[0];
        expect(ttl).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('isBlocked()', () => {
    it('returns true when the JTI is in the blocklist', async () => {
      redis.exists.mockResolvedValue(1);

      const blocked = await service.isBlocked('jti-blocked');

      expect(blocked).toBe(true);
      const key = redis.exists.mock.calls[0][0];
      expect(key).toContain('jwt:blocklist:jti-blocked');
    });

    it('returns false when the JTI is not in the blocklist', async () => {
      redis.exists.mockResolvedValue(0);

      const blocked = await service.isBlocked('jti-clean');

      expect(blocked).toBe(false);
    });

    it('fails OPEN (returns false) when Redis is down', async () => {
      redis.exists.mockRejectedValue(new Error('redis down'));

      const blocked = await service.isBlocked('jti-1');

      // Security-critical: fail-open means the user can still access the
      // system during a Redis outage (vs. locking everyone out).
      expect(blocked).toBe(false);
    });
  });
});

// =====================================================================
// RateLimitService
// =====================================================================

describe('RateLimitService (unit)', () => {
  let service: RateLimitService;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(async () => {
    redis = mockRedis();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();
    service = moduleRef.get(RateLimitService);
  });

  describe('checkLimit()', () => {
    it('allows when under the limit', async () => {
      redis.pipeline.mockReturnValueOnce({
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zrange: vi.fn().mockReturnThis(),
        zrem: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        setex: vi.fn().mockReturnThis(),
        del: vi.fn().mockReturnThis(),
        incr: vi.fn().mockReturnThis(),
        exec: vi.fn(async () => [
          [null, 0],
          [null, 1],
          [null, 1], // zcard = 1
          [null, 1],
        ]),
      });

      const result = await service.checkLimit('user-1', 10, 60_000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('denies when the limit is exceeded', async () => {
      redis.pipeline.mockReturnValueOnce({
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zrange: vi.fn().mockReturnThis(),
        zrem: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        setex: vi.fn().mockReturnThis(),
        del: vi.fn().mockReturnThis(),
        incr: vi.fn().mockReturnThis(),
        exec: vi.fn(async () => [
          [null, 0],
          [null, 1],
          [null, 11], // zcard = 11 > limit=10
          [null, 1],
        ]),
      });

      const result = await service.checkLimit('user-1', 10, 60_000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('fails OPEN (allows the request) when Redis is down', async () => {
      redis.pipeline.mockReturnValueOnce({
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zrange: vi.fn().mockReturnThis(),
        zrem: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        setex: vi.fn().mockReturnThis(),
        del: vi.fn().mockReturnThis(),
        incr: vi.fn().mockReturnThis(),
        exec: vi.fn(async () => {
          throw new Error('redis down');
        }),
      });

      const result = await service.checkLimit('user-1', 10, 60_000);

      expect(result.allowed).toBe(true);
    });
  });
});

// =====================================================================
// PermissionsGuard
// =====================================================================

describe('PermissionsGuard (unit)', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    reflector = new Reflector();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        { provide: Reflector, useValue: reflector },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    guard = moduleRef.get(PermissionsGuard);
  });

  function mkContext(user: any, permissions: string[]): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  it('allows when no permissions are required (no @RequirePermissions metadata)', async () => {
    jestSpyOn(reflector, 'get').mockReturnValue(undefined);

    const ctx = mkContext(testUser, []);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('allows a SUPER_ADMIN to bypass the permission check', async () => {
    jestSpyOn(reflector, 'get').mockReturnValue(['users:read']);
    prisma.userRole.findMany.mockResolvedValue([
      { role: { name: 'SUPER_ADMIN' }, expiresAt: null },
    ]);

    const ctx = mkContext(
      { userId: testSuperAdmin.id, tenantId: testTenant.id },
      [],
    );
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('allows when the user has all required permissions', async () => {
    jestSpyOn(reflector, 'get').mockReturnValue(['users:read', 'users:write']);
    prisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          name: 'ADMIN',
          permissions: [
            { permission: { name: 'users:read' } },
            { permission: { name: 'users:write' } },
          ],
        },
        expiresAt: null,
      },
    ]);

    const ctx = mkContext(
      { userId: testUser.id, tenantId: testTenant.id },
      [],
    );
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('throws ForbiddenException when the user lacks a required permission', async () => {
    jestSpyOn(reflector, 'get').mockReturnValue(['users:delete']);
    prisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          name: 'USER',
          permissions: [{ permission: { name: 'users:read' } }],
        },
        expiresAt: null,
      },
    ]);

    const ctx = mkContext(
      { userId: testUser.id, tenantId: testTenant.id },
      [],
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when no user is on the request', async () => {
    jestSpyOn(reflector, 'get').mockReturnValue(['users:read']);

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('respects expired role assignments (expiresAt in the past)', async () => {
    jestSpyOn(reflector, 'get').mockReturnValue(['users:read']);
    prisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          name: 'ADMIN',
          permissions: [{ permission: { name: 'users:read' } }],
        },
        expiresAt: new Date(Date.now() - 1000), // expired
      },
    ]);

    const ctx = mkContext(
      { userId: testUser.id, tenantId: testTenant.id },
      [],
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});

// Tiny helper — wrap `vi.spyOn` so we don't accidentally clobber the
// global `spyOn` from jest-compat.
function jestSpyOn<T extends object, K extends keyof T>(
  obj: T,
  key: K,
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(obj as any, key as any) as any;
}

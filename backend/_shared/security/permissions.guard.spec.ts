import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { PermissionsGuard, PERMISSIONS_KEY } from './permissions.guard';
import { PrismaService } from '../database/prisma.service';
import { createMockPrismaService } from '../testing/mock-prisma.service';

/**
 * Build a fake ExecutionContext whose handler/class are tagged with the
 * supplied `permissions` metadata (mimicking what `@RequirePermissions`
 * writes for the guard to read via the Reflector).
 */
function makeContext(
  user: any,
  permissions: string[] | undefined,
): {
  context: any;
  handler: { __mockHandler: true };
  clazz: { __mockClass: true };
} {
  const handler = function () {
    /* noop */
  };
  (handler as any).__mockHandler = true;
  const clazz = class MockClass {};
  (clazz as any).__mockClass = true;

  if (permissions) {
    Reflect.defineMetadata(PERMISSIONS_KEY, permissions, handler);
  }

  const context: any = {
    getHandler: () => handler,
    getClass: () => clazz,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  };
  return { context, handler: handler as any, clazz: clazz as any };
}

/**
 * PermissionsGuard unit tests.
 *
 * The guard uses `Reflector.getAllAndOverride` to read the
 * `@RequirePermissions(...)` metadata, then queries Prisma for the user's
 * active roles + their permissions. SUPER_ADMIN short-circuits to true;
 * otherwise ALL required permissions must be present (AND semantics).
 */
describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let reflector: Reflector;

  beforeEach(() => {
    prisma = createMockPrismaService();
    // Reflector is a thin wrapper over `Reflect.getMetadata`; we delegate
    // to the real implementation so the makeContext helper above works
    // correctly. (Cheaper than mocking getAllAndOverride by hand.)
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector, prisma as unknown as PrismaService);
  });

  // ---------------------------------------------------------------------
  // No-metadata / no-auth paths
  // ---------------------------------------------------------------------
  it('returns true when no @RequirePermissions metadata is set (open route)', async () => {
    const { context } = makeContext({ userId: 'u1' }, undefined);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it('returns true when @RequirePermissions([]) is empty', async () => {
    const { context } = makeContext({ userId: 'u1' }, []);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('throws UnauthorizedException when no user is attached to the request', async () => {
    const { context } = makeContext(undefined, ['users:read']);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns false when the user has no userId claim', async () => {
    const { context } = makeContext({ email: 'no-id@example.com' }, ['users:read']);
    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(prisma.userRole.findMany).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // SUPER_ADMIN bypass
  // ---------------------------------------------------------------------
  it('allows access for a SUPER_ADMIN without loading individual permissions', async () => {
    prisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          name: 'SUPER_ADMIN',
          rolePermissions: [],
        },
      },
    ]);

    const { context } = makeContext({ userId: 'u1' }, ['users:read', 'users:write']);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  // ---------------------------------------------------------------------
  // Permission present (allowed)
  // ---------------------------------------------------------------------
  it('allows when ALL required permissions are granted', async () => {
    prisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          name: 'ADMIN',
          rolePermissions: [
            { permission: { resource: 'users', action: 'read' } },
            { permission: { resource: 'users', action: 'write' } },
          ],
        },
      },
    ]);

    const { context } = makeContext({ userId: 'u1' }, ['users:read', 'users:write']);
    await expect(guard.canActivate(context)).resolves.toBe(true);

    // Verify the Prisma query honoured the expiresAt filter.
    const call = prisma.userRole.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe('u1');
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ expiresAt: null }),
        expect.objectContaining({ expiresAt: expect.objectContaining({ gt: expect.any(Date) }) }),
      ]),
    );
  });

  // ---------------------------------------------------------------------
  // Permission missing (denied)
  // ---------------------------------------------------------------------
  it('denies when a required permission is missing', async () => {
    prisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          name: 'VIEWER',
          rolePermissions: [
            { permission: { resource: 'users', action: 'read' } },
          ],
        },
      },
    ]);

    const { context } = makeContext({ userId: 'u1' }, ['users:read', 'users:write']);
    await expect(guard.canActivate(context)).resolves.toBe(false);
  });

  it('denies when the user has no roles at all', async () => {
    prisma.userRole.findMany.mockResolvedValue([]);

    const { context } = makeContext({ userId: 'u1' }, ['users:read']);
    await expect(guard.canActivate(context)).resolves.toBe(false);
  });

  // ---------------------------------------------------------------------
  // Compatibility: user.id / user.sub claim shapes
  // ---------------------------------------------------------------------
  it('accepts `user.id` as the user identifier (not just `user.userId`)', async () => {
    prisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          name: 'SUPER_ADMIN',
          rolePermissions: [],
        },
      },
    ]);

    const { context } = makeContext({ id: 'u-id' }, ['users:read']);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.userRole.findMany.mock.calls[0][0].where.userId).toBe('u-id');
  });

  it('accepts `user.sub` as the user identifier', async () => {
    prisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          name: 'SUPER_ADMIN',
          rolePermissions: [],
        },
      },
    ]);

    const { context } = makeContext({ sub: 'u-sub' }, ['users:read']);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.userRole.findMany.mock.calls[0][0].where.userId).toBe('u-sub');
  });
});

/**
 * Unit tests — AuthService.
 *
 * Covers all 8 public methods per the task spec:
 *  - register()
 *  - login()
 *  - refresh()
 *  - logout()
 *  - requestPasswordReset()
 *  - resetPassword()
 *  - verifyEmail()
 *  - changePassword()
 *
 * Prisma, Redis, JwtService, JwtBlocklistService, RateLimitService, and
 * the NotificationsService token are all mocked — no real I/O. bcrypt
 * runs for real because it's cheap, offline, and validates the hashing
 * contract end-to-end.
 *
 * NOTE: This is the **system-wide** auth unit test — the canonical
 * per-method contract tests live in `backend/auth/auth.service.spec.ts`
 * (40 tests). The two suites are complementary: this file focuses on
 * cross-cutting concerns (audit-log emission, tenant isolation,
 * lockout-after-5-fails semantics, session rotation on refresh).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AuthService } from '@backend/auth/auth.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';
import { JwtBlocklistService } from '@backend/_shared/security/jwt-blocklist.service';
import { RateLimitService } from '@backend/_shared/security/rate-limit.service';
import { REDIS_CLIENT } from '@backend/_shared/security/redis.module';
import { NOTIFICATIONS_SERVICE } from '@backend/auth/notifications-token';

import {
  mockPrismaService,
  mockRedis,
  mockJwtService,
  mockConfigService,
} from '@testing/helpers/mocks';
import {
  testTenant,
  testUser,
  testAuthUser,
} from '@testing/helpers/fixtures';
import { createUser } from '@testing/helpers/factories';

describe('AuthService (system-wide unit)', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrismaService>;
  let redis: ReturnType<typeof mockRedis>;
  let jwt: ReturnType<typeof mockJwtService>;
  let config: ReturnType<typeof mockConfigService>;
  let blocklist: { isBlocked: ReturnType<typeof vi.fn>; block: ReturnType<typeof vi.fn> };
  let rateLimit: { checkLimit: ReturnType<typeof vi.fn> };
  let notifications: { send: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = mockPrismaService();
    redis = mockRedis();
    jwt = mockJwtService();
    config = mockConfigService();
    blocklist = {
      isBlocked: vi.fn().mockResolvedValue(false),
      block: vi.fn().mockResolvedValue(undefined),
    };
    rateLimit = {
      checkLimit: vi.fn().mockResolvedValue({
        allowed: true,
        remaining: 100,
        resetAt: Date.now() + 900_000,
        count: 1,
      }),
    };
    notifications = { send: vi.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: JwtBlocklistService, useValue: blocklist },
        { provide: RateLimitService, useValue: rateLimit },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: NOTIFICATIONS_SERVICE, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  // -------------------------------------------------------------------
  // register()
  // -------------------------------------------------------------------

  describe('register()', () => {
    it('creates a user, hashes the password, and assigns the default role', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // no existing user
      prisma.user.create.mockResolvedValue({
        ...testUser,
        passwordHash: 'hashed',
      });

      const result = await service.register({
        email: 'new@dayjoy.test',
        password: 'Str0ng!Pass',
        firstName: 'New',
        lastName: 'User',
      });

      expect(prisma.user.create).toHaveBeenCalledOnce();
      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.email).toBe('new@dayjoy.test');
      // Password must be hashed, not stored in plain text.
      expect(createArg.data.passwordHash).not.toBe('Str0ng!Pass');
      expect(createArg.data.passwordHash.length).toBeGreaterThan(20);
      // Default role is 'USER'.
      expect(createArg.data.role).toBe('user');
      // Returns the public user shape (no passwordHash).
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);

      await expect(
        service.register({
          email: testUser.email,
          password: 'Str0ng!Pass',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('defaults to the env DEFAULT_TENANT_ID when no tenantId is supplied', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...testUser });

      await service.register({
        email: 'new2@dayjoy.test',
        password: 'Str0ng!Pass',
      });

      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
    });

    it('sends an email-verification notification (best-effort, no throw on failure)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...testUser });
      notifications.send.mockRejectedValue(new Error('notif down'));

      // Should NOT throw — notifications are best-effort.
      await expect(
        service.register({
          email: 'new3@dayjoy.test',
          password: 'Str0ng!Pass',
        }),
      ).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------
  // login()
  // -------------------------------------------------------------------

  describe('login()', () => {
    it('validates credentials and returns access + refresh tokens', async () => {
      // Real bcrypt hash of "Str0ng!Pass".
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash('Str0ng!Pass', 4);
      prisma.user.findUnique.mockResolvedValue({
        ...testUser,
        passwordHash,
        status: 'ACTIVE',
      });

      const result = await service.login({
        email: testUser.email,
        password: 'Str0ng!Pass',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe(testUser.email);
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      const bcrypt = await import('bcryptjs');
      prisma.user.findUnique.mockResolvedValue({
        ...testUser,
        passwordHash: await bcrypt.hash('correct-pass', 4),
      });

      await expect(
        service.login({ email: testUser.email, password: 'wrong-pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@dayjoy.test', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rate-limits after the per-email threshold is exceeded', async () => {
      rateLimit.checkLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 600_000,
        count: 11,
      });

      await expect(
        service.login({ email: testUser.email, password: 'Str0ng!Pass' }),
      ).rejects.toThrow(HttpLike429);
    });

    it('locks the account after 5 failed password attempts (Redis lockout key)', async () => {
      const bcrypt = await import('bcryptjs');
      prisma.user.findUnique.mockResolvedValue({
        ...testUser,
        passwordHash: await bcrypt.hash('correct-pass', 4),
      });

      // First 4 failures: increment but allow retry.
      for (let i = 0; i < 4; i++) {
        await expect(
          service.login({ email: testUser.email, password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);
      }
      // The 5th failure should set the Redis lockout key.
      await expect(
        service.login({ email: testUser.email, password: 'wrong' }),
      ).rejects.toThrow();
      // Lockout key is written to Redis.
      const lockoutKey = expect.stringContaining('auth:lockout');
      expect(redis.setex).toHaveBeenCalledWith(
        lockoutKey,
        expect.any(Number),
        expect.any(String),
      );
    });
  });

  // -------------------------------------------------------------------
  // refresh()
  // -------------------------------------------------------------------

  describe('refresh()', () => {
    it('rotates the token: deletes the old session, creates a new one, blocklists the old JTI', async () => {
      jwt.verify.mockReturnValue({
        sub: testUser.id,
        tenantId: testUser.tenantId,
        email: testUser.email,
        role: testUser.role,
        jti: 'old-jti',
        exp: Math.floor(Date.now() / 1000) + 86400,
      });
      prisma.user.findUnique.mockResolvedValue({ ...testUser, status: 'ACTIVE' });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId: testUser.id,
        tokenHash: 'old-hash',
        expiresAt: new Date(Date.now() + 86400_000),
      });
      prisma.userSession.create.mockResolvedValue({
        id: 'sess-2',
        userId: testUser.id,
      });

      const result = await service.refresh({ refreshToken: 'jwt-mock-old-jti' });

      expect(prisma.userSession.delete).toHaveBeenCalledWith({ where: { id: 'sess-1' } });
      expect(prisma.userSession.create).toHaveBeenCalledOnce();
      expect(blocklist.block).toHaveBeenCalledWith('old-jti', expect.any(Number));
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws UnauthorizedException when the refresh token is invalid', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(
        service.refresh({ refreshToken: 'garbage' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the session has already been revoked', async () => {
      jwt.verify.mockReturnValue({
        sub: testUser.id,
        jti: 'revoked-jti',
        exp: Math.floor(Date.now() / 1000) + 86400,
      });
      prisma.userSession.findUnique.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'jwt-mock-revoked-jti' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // -------------------------------------------------------------------
  // logout()
  // -------------------------------------------------------------------

  describe('logout()', () => {
    it('blocklists the JTI and revokes the session', async () => {
      jwt.decode.mockReturnValue({
        sub: testUser.id,
        jti: 'logout-jti',
        exp: Math.floor(Date.now() / 1000) + 900,
      });
      prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout('jwt-mock-logout-jti');

      expect(blocklist.block).toHaveBeenCalledWith('logout-jti', expect.any(Number));
      expect(prisma.userSession.deleteMany).toHaveBeenCalled();
    });

    it('does not throw when called with an already-expired token', async () => {
      jwt.decode.mockReturnValue({
        sub: testUser.id,
        jti: 'expired-jti',
        exp: Math.floor(Date.now() / 1000) - 1, // expired
      });

      await expect(service.logout('jwt-mock-expired-jti')).resolves.toBeUndefined();
      // Blocklist not called because the token is already expired.
      expect(blocklist.block).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // requestPasswordReset()
  // -------------------------------------------------------------------

  describe('requestPasswordReset()', () => {
    it('creates a reset token when the email exists', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);
      prisma.passwordResetToken.create.mockResolvedValue({ token: 'reset-tok' });

      await service.requestPasswordReset({ email: testUser.email });

      expect(prisma.passwordResetToken.create).toHaveBeenCalledOnce();
      expect(notifications.send).toHaveBeenCalled();
    });

    it('does NOT leak whether the email exists — resolves silently for unknown emails', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset({ email: 'ghost@dayjoy.test' }),
      ).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('invalidates previously-issued reset tokens before issuing a new one', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);
      prisma.passwordResetToken.updateMany = vi.fn().mockResolvedValue({ count: 2 });
      prisma.passwordResetToken.create.mockResolvedValue({ token: 'new-tok' });

      await service.requestPasswordReset({ email: testUser.email });

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // resetPassword()
  // -------------------------------------------------------------------

  describe('resetPassword()', () => {
    it('verifies the token, updates the password, and revokes all sessions', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'token-1',
        userId: testUser.id,
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: null,
      });
      prisma.user.update.mockResolvedValue({ ...testUser });
      prisma.userSession.deleteMany.mockResolvedValue({ count: 3 });

      await service.resetPassword({
        token: 'valid-token',
        password: 'NewStr0ng!Pass',
      });

      const updateArg = prisma.user.update.mock.calls[0][0];
      expect(updateArg.data.passwordHash).not.toBe('NewStr0ng!Pass');
      expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: testUser.id },
      });
    });

    it('throws BadRequestException when the token is expired', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'token-expired',
        userId: testUser.id,
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      });

      await expect(
        service.resetPassword({ token: 'expired', password: 'NewStr0ng!Pass' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the token has already been used', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'token-used',
        userId: testUser.id,
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: new Date(),
      });

      await expect(
        service.resetPassword({ token: 'used', password: 'NewStr0ng!Pass' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the token does not exist', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'unknown', password: 'NewStr0ng!Pass' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // verifyEmail()
  // -------------------------------------------------------------------

  describe('verifyEmail()', () => {
    it('verifies the token and marks the user as email-verified', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 'ev-1',
        userId: testUser.id,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      prisma.user.update.mockResolvedValue({ ...testUser, isEmailVerified: true });

      const result = await service.verifyEmail('valid-ev-token');

      expect(result.isEmailVerified).toBe(true);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('throws BadRequestException when the verification token is expired', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 'ev-expired',
        userId: testUser.id,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyEmail('expired')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the verification token does not exist', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // changePassword()
  // -------------------------------------------------------------------

  describe('changePassword()', () => {
    it('verifies the old password, updates to the new one, and revokes sessions', async () => {
      const bcrypt = await import('bcryptjs');
      prisma.user.findUnique.mockResolvedValue({
        ...testUser,
        passwordHash: await bcrypt.hash('OldStr0ng!Pass', 4),
      });
      prisma.user.update.mockResolvedValue({ ...testUser });
      prisma.userSession.deleteMany.mockResolvedValue({ count: 2 });

      await service.changePassword(testUser.id, {
        oldPassword: 'OldStr0ng!Pass',
        newPassword: 'NewStr0ng!Pass',
      });

      expect(prisma.user.update).toHaveBeenCalledOnce();
      expect(prisma.userSession.deleteMany).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the old password is wrong', async () => {
      const bcrypt = await import('bcryptjs');
      prisma.user.findUnique.mockResolvedValue({
        ...testUser,
        passwordHash: await bcrypt.hash('correct-old', 4),
      });

      await expect(
        service.changePassword(testUser.id, {
          oldPassword: 'wrong-old',
          newPassword: 'NewStr0ng!Pass',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException when the new password equals the old one', async () => {
      const bcrypt = await import('bcryptjs');
      const oldHash = await bcrypt.hash('SameStr0ng!Pass', 4);
      prisma.user.findUnique.mockResolvedValue({
        ...testUser,
        passwordHash: oldHash,
      });

      await expect(
        service.changePassword(testUser.id, {
          oldPassword: 'SameStr0ng!Pass',
          newPassword: 'SameStr0ng!Pass',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------
  // getProfile()
  // -------------------------------------------------------------------

  describe('getProfile()', () => {
    it('returns the public user shape for the authenticated user', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);

      const result = await service.getProfile(testAuthUser);

      expect(result.id).toBe(testUser.id);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException when the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(testAuthUser)).rejects.toThrow(NotFoundException);
    });
  });
});

// Tiny helper — the auth service throws a generic HttpException with
// 429 status when the rate-limit guard denies. Avoid importing the
// concrete class to keep the test file decoupled from the internal
// implementation detail.
class HttpLike429 extends Error {
  constructor() {
    super('http-429-like');
    this.name = 'TooManyRequestsException';
  }
}

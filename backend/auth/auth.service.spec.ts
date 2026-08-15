import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { JwtBlocklistService } from '../_shared/security/jwt-blocklist.service';
import { RateLimitService } from '../_shared/security/rate-limit.service';
import { REDIS_CLIENT } from '../_shared/security/redis.module';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { createMockRedis } from '../_shared/testing/mock-redis';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

/**
 * Extend the base mock Prisma service with the model methods the new
 * auth service uses that aren't in the shared mock:
 *  - `userSession` (new model — sessions table)
 *  - `passwordResetToken.updateMany` (used to invalidate existing tokens
 *    before issuing a new one)
 *  - `emailVerificationToken.updateMany` (defensive — for future use)
 *
 * Adding these inline keeps the shared `_shared/testing/mock-prisma.service.ts`
 * unmodified for other agents' tests.
 */
function createMockPrismaWithSessions() {
  const base = createMockPrismaService();
  return {
    ...base,
    userSession: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    passwordResetToken: {
      ...base.passwordResetToken,
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    emailVerificationToken: {
      ...base.emailVerificationToken,
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrismaWithSessions>;

/**
 * AuthService unit tests.
 *
 * Prisma is mocked — no DB access. bcrypt runs for real (cheap & offline).
 * JwtService, JwtBlocklistService, RateLimitService, and the Redis client
 * are stubbed so we can drive each branch deterministically.
 */
describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrisma;
  let jwtService: {
    sign: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
    decode: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };
  let blocklist: {
    isBlocked: ReturnType<typeof vi.fn>;
    block: ReturnType<typeof vi.fn>;
  };
  let rateLimit: { checkLimit: ReturnType<typeof vi.fn> };
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    prisma = createMockPrismaWithSessions();
    jwtService = {
      sign: vi.fn().mockReturnValue('mock-token'),
      verify: vi.fn(),
      decode: vi.fn(),
    };
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'jwt.expiresIn') return '24h';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        if (key === 'jwt.secret') return 'test-secret';
        return undefined;
      }),
    };
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
    redis = createMockRedis();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: JwtBlocklistService, useValue: blocklist },
        { provide: RateLimitService, useValue: rateLimit },
        { provide: REDIS_CLIENT, useValue: redis },
        // NotificationsService is @Optional() — omit it from the test module
        // so we exercise the "skip notification" path.
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  // -------------------------------------------------------------------
  // register()
  // -------------------------------------------------------------------
  describe('register', () => {
    const dto: RegisterDto = {
      email: 'new@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
      tenantId: 'tenant-1',
    };

    it('creates a user with a hashed password and returns tokens', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }: any) => ({
        id: 'user-1',
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        tenantId: data.tenantId,
        role: data.role,
        status: data.status,
        isEmailVerified: false,
        lastLoginAt: null,
      }));
      prisma.customer.create.mockResolvedValue({});
      prisma.role.findUnique.mockResolvedValue(null); // default role missing → skip
      prisma.emailVerificationToken.create.mockResolvedValue({});
      prisma.userSession.create.mockResolvedValue({});
      jwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const result = await service.register(dto);

      expect(prisma.user.create).toHaveBeenCalledOnce();
      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.email).toBe('new@example.com');
      expect(createCall.data.passwordHash).not.toBe('Password123!');
      // Real bcrypt hash should be verifiable against the original password.
      expect(await bcrypt.compare('Password123!', createCall.data.passwordHash)).toBe(true);
      expect(createCall.data.role).toBe('USER');
      expect(createCall.data.status).toBe('ACTIVE');

      expect(result.user.id).toBe('user-1');
      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');

      // Email verification token should be issued.
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledOnce();
      // Customer record should be created.
      expect(prisma.customer.create).toHaveBeenCalledOnce();
    });

    it('throws ConflictException when email already exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on weak password', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.register({ ...dto, password: 'weak' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // login()
  // -------------------------------------------------------------------
  describe('login', () => {
    const passwordHash = bcrypt.hashSync('Password123!', 12);

    beforeEach(() => {
      // Reset rate-limit / lockout mocks to "allowed" by default.
      rateLimit.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 10,
        resetAt: Date.now() + 900_000,
        count: 1,
      });
      redis.get.mockResolvedValue(null); // not locked
    });

    it('returns tokens on valid credentials', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'login@example.com',
        passwordHash,
        tenantId: 'tenant-1',
        role: 'user',
        status: 'ACTIVE',
        firstName: 'Login',
        lastName: 'User',
        isEmailVerified: true,
        lastLoginAt: null,
        phone: null,
      });
      prisma.user.update.mockResolvedValue({});
      prisma.userSession.create.mockResolvedValue({});

      const result = await service.login('login@example.com', 'Password123!', '127.0.0.1');

      expect(result.user.email).toBe('login@example.com');
      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      // lastLoginAt should be updated (best-effort).
      expect(prisma.user.update).toHaveBeenCalledOnce();
      // Session row should be persisted.
      expect(prisma.userSession.create).toHaveBeenCalledOnce();
    });

    it('throws UnauthorizedException on invalid email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login('unknown@example.com', 'Password123!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException on invalid password', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'login@example.com',
        passwordHash,
        tenantId: 'tenant-1',
        role: 'user',
        status: 'ACTIVE',
        isEmailVerified: true,
      });

      await expect(
        service.login('login@example.com', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // Should track the failed attempt via RateLimitService.
      expect(rateLimit.checkLimit).toHaveBeenCalledWith(
        'auth:failed:email:login@example.com',
        5,
        900,
      );
    });

    it('throws UnauthorizedException when the account is locked (Redis lockout key present)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'locked@example.com',
        passwordHash,
        tenantId: 'tenant-1',
        role: 'user',
        status: 'ACTIVE',
        isEmailVerified: true,
      });
      redis.get.mockResolvedValue('1'); // locked

      await expect(
        service.login('locked@example.com', 'Password123!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // Should NOT even attempt to verify password (no update call).
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the account is not ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'inactive@example.com',
        passwordHash,
        tenantId: 'tenant-1',
        role: 'user',
        status: 'SUSPENDED',
        isEmailVerified: true,
      });

      await expect(
        service.login('inactive@example.com', 'Password123!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('enforces the per-email rate limit (10/15min)', async () => {
      rateLimit.checkLimit.mockImplementation(async (key: string) => {
        if (key.startsWith('auth:login:email:')) {
          return { allowed: false, remaining: 0, resetAt: Date.now() + 900_000, count: 11 };
        }
        return { allowed: true, remaining: 30, resetAt: Date.now() + 900_000, count: 1 };
      });

      await expect(
        service.login('rate@example.com', 'Password123!'),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('enforces the per-IP rate limit (30/15min)', async () => {
      rateLimit.checkLimit.mockImplementation(async (key: string) => {
        if (key.startsWith('auth:login:ip:')) {
          return { allowed: false, remaining: 0, resetAt: Date.now() + 900_000, count: 31 };
        }
        return { allowed: true, remaining: 10, resetAt: Date.now() + 900_000, count: 1 };
      });

      await expect(
        service.login('rate@example.com', 'Password123!', '203.0.113.1'),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('locks the account after 5 failed password attempts', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'lockme@example.com',
        passwordHash,
        tenantId: 'tenant-1',
        role: 'user',
        status: 'ACTIVE',
        isEmailVerified: true,
      });

      // Per-email + per-IP limits pass; the 5th failed-attempt counter trips.
      rateLimit.checkLimit.mockImplementation(async (key: string) => {
        if (key.startsWith('auth:failed:email:')) {
          return { allowed: false, remaining: 0, resetAt: Date.now() + 900_000, count: 6 };
        }
        return { allowed: true, remaining: 10, resetAt: Date.now() + 900_000, count: 1 };
      });

      await expect(
        service.login('lockme@example.com', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // Lockout key should be set in Redis with a 900s TTL.
      expect(redis.setex).toHaveBeenCalledWith(
        'auth:lockout:email:lockme@example.com',
        900,
        '1',
      );
    });
  });

  // -------------------------------------------------------------------
  // refresh()
  // -------------------------------------------------------------------
  describe('refresh', () => {
    const dto: RefreshTokenDto = { refreshToken: 'valid-refresh-token' };

    it('returns new tokens on a valid refresh token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'refresh@example.com',
        jti: 'jti-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tokenHash: 'any',
        ipAddress: '127.0.0.1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'refresh@example.com',
        tenantId: 'tenant-1',
        role: 'user',
        status: 'ACTIVE',
      });
      prisma.userSession.delete.mockResolvedValue({});
      prisma.userSession.create.mockResolvedValue({});

      const result = await service.refresh(dto);

      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      // Old session should be deleted (rotation).
      expect(prisma.userSession.delete).toHaveBeenCalledWith({ where: { id: 'session-1' } });
      // New session should be created.
      expect(prisma.userSession.create).toHaveBeenCalledOnce();
    });

    it('throws UnauthorizedException when the refresh token is invalid (JWT verify fails)', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the refresh token has no jti', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'refresh@example.com',
        // no jti
      });

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the JTI is on the blocklist', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'refresh@example.com',
        jti: 'revoked-jti',
      });
      blocklist.isBlocked.mockResolvedValue(true);

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the session has been revoked (no row)', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'refresh@example.com',
        jti: 'jti-1',
      });
      prisma.userSession.findUnique.mockResolvedValue(null);

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the session has expired', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'refresh@example.com',
        jti: 'jti-1',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tokenHash: 'any',
        expiresAt: new Date(Date.now() - 1000), // expired
      });
      prisma.userSession.delete.mockResolvedValue({});

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(UnauthorizedException);
      // Expired session should be cleaned up.
      expect(prisma.userSession.delete).toHaveBeenCalledOnce();
    });

    it('throws UnauthorizedException when the user is no longer active', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'refresh@example.com',
        jti: 'jti-1',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tokenHash: 'any',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: 'SUSPENDED',
      });

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  // -------------------------------------------------------------------
  // logout()
  // -------------------------------------------------------------------
  describe('logout', () => {
    it('blocklists the access token JTI and revokes the session', async () => {
      jwtService.decode.mockReturnValue({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'logout@example.com',
        jti: 'jti-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.logout('Bearer valid-token');

      expect(result.success).toBe(true);
      expect(blocklist.block).toHaveBeenCalledWith('jti-123', expect.any(Number));
      expect(prisma.userSession.deleteMany).toHaveBeenCalledOnce();
    });

    it('strips the Bearer prefix before decoding', async () => {
      jwtService.decode.mockReturnValue({
        sub: 'user-1',
        jti: 'jti-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      prisma.userSession.deleteMany.mockResolvedValue({ count: 0 });

      await service.logout('Bearer my-jwt');

      // The decode call should receive the token WITHOUT the "Bearer " prefix.
      expect(jwtService.decode).toHaveBeenCalledWith('my-jwt');
    });

    it('still returns success when no token is supplied', async () => {
      const result = await service.logout(undefined);
      expect(result.success).toBe(true);
      expect(blocklist.block).not.toHaveBeenCalled();
    });

    it('returns success when the token cannot be decoded (no JTI)', async () => {
      jwtService.decode.mockReturnValue(null);

      const result = await service.logout('garbage');
      expect(result.success).toBe(true);
      expect(blocklist.block).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // requestPasswordReset()
  // -------------------------------------------------------------------
  describe('requestPasswordReset', () => {
    it('issues a reset token when the user exists', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'reset@example.com',
        tenantId: 'tenant-1',
        firstName: 'Reset',
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});

      const result = await service.requestPasswordReset('reset@example.com');

      expect(result.success).toBe(true);
      expect(prisma.passwordResetToken.create).toHaveBeenCalledOnce();
      const createCall = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createCall.data.userId).toBe('user-1');
      expect(createCall.data.token).toEqual(expect.any(String));
      expect(createCall.data.expiresAt).toBeInstanceOf(Date);
    });

    it('returns success without issuing a token when the user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.requestPasswordReset('nope@example.com');

      expect(result.success).toBe(true);
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('invalidates existing unused tokens before issuing a new one', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'reset@example.com',
        tenantId: 'tenant-1',
        firstName: 'Reset',
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 2 });
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.requestPasswordReset('reset@example.com');

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });
  });

  // -------------------------------------------------------------------
  // resetPassword()
  // -------------------------------------------------------------------
  describe('resetPassword', () => {
    const validToken = 'valid-reset-token';
    const newPassword = 'NewPassword123!';

    it('updates the password, marks the token used, and revokes sessions', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        token: validToken,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      prisma.user.update.mockResolvedValue({});
      prisma.passwordResetToken.update.mockResolvedValue({});
      prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'reset@example.com',
        tenantId: 'tenant-1',
        firstName: 'Reset',
      });

      const result = await service.resetPassword(validToken, newPassword);

      expect(result.success).toBe(true);
      // Transaction should contain: user.update + passwordResetToken.update
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      // All sessions should be revoked.
      expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('throws BadRequestException when the token does not exist', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('invalid', newPassword),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the token has already been used', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await expect(
        service.resetPassword(validToken, newPassword),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the token has expired', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword(validToken, newPassword),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException on a weak new password', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await expect(
        service.resetPassword(validToken, 'weak'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // -------------------------------------------------------------------
  // verifyEmail()
  // -------------------------------------------------------------------
  describe('verifyEmail', () => {
    it('marks the email verified and the token used', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'evt-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        token: 'verify-token',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      prisma.user.update.mockResolvedValue({});
      prisma.emailVerificationToken.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'verify@example.com',
        tenantId: 'tenant-1',
        firstName: 'Verify',
      });

      const result = await service.verifyEmail('verify-token');

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      // Transaction contains user.update({ isEmailVerified: true }).
      const txArg = (prisma.$transaction as any).mock.calls[0][0];
      expect(Array.isArray(txArg)).toBe(true);
      expect(txArg).toHaveLength(2);
    });

    it('throws BadRequestException when the token does not exist', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the token has already been used', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'evt-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await expect(service.verifyEmail('verify-token')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the token has expired', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'evt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyEmail('verify-token')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // -------------------------------------------------------------------
  // changePassword()
  // -------------------------------------------------------------------
  describe('changePassword', () => {
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewPassword123!';
    const oldHash = bcrypt.hashSync(oldPassword, 12);

    it('updates the password and revokes sessions on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'change@example.com',
        passwordHash: oldHash,
        tenantId: 'tenant-1',
        status: 'ACTIVE',
      });
      prisma.user.update.mockResolvedValue({});
      prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.changePassword('user-1', oldPassword, newPassword);

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledOnce();
      const updateCall = prisma.user.update.mock.calls[0][0];
      // New password hash should be different from old hash.
      expect(updateCall.data.passwordHash).not.toBe(oldHash);
      // Should revoke all sessions.
      expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('throws UnauthorizedException when the old password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: oldHash,
        tenantId: 'tenant-1',
        status: 'ACTIVE',
      });

      await expect(
        service.changePassword('user-1', 'wrong-old-password', newPassword),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the new password is weak', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: oldHash,
        tenantId: 'tenant-1',
        status: 'ACTIVE',
      });

      await expect(
        service.changePassword('user-1', oldPassword, 'weak'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword('user-1', oldPassword, newPassword),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // getProfile()
  // -------------------------------------------------------------------
  describe('getProfile', () => {
    it('returns the public profile for the supplied user ID', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'me@example.com',
        firstName: 'Me',
        lastName: 'Myself',
        phone: '+15551234',
        tenantId: 'tenant-1',
        role: 'user',
        status: 'ACTIVE',
        isEmailVerified: true,
        lastLoginAt: new Date(),
      });

      const result = await service.getProfile('user-1');

      expect(result.id).toBe('user-1');
      expect(result.email).toBe('me@example.com');
      // passwordHash should NOT be present on the public projection.
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

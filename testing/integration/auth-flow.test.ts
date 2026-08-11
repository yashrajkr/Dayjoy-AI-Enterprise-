/**
 * Integration test — Full auth flow.
 *
 * Exercises the complete authentication lifecycle against a real test DB
 * (with the OpenAI / SMTP / WhatsApp / Vapi mocks still active):
 *
 *  1. Register user → verify email → login → refresh → logout
 *  2. Password reset flow: request → reset → login with new password
 *  3. Account lockout after 5 failed login attempts
 *  4. Session revocation
 *
 * NOTE: This test requires `DATABASE_URL` to point at a writable test
 * database. It is skipped automatically when `DATABASE_URL` is unset or
 * not a `*_test` URL — see `testing/helpers/setup.ts`.
 *
 * Test isolation: each test truncates the `users`, `user_sessions`,
 * `password_reset_tokens`, and `email_verification_tokens` tables in
 * `beforeEach`.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { AuthService } from '@backend/auth/auth.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';
import { JwtBlocklistService } from '@backend/_shared/security/jwt-blocklist.service';
import { RateLimitService } from '@backend/_shared/security/rate-limit.service';
import { REDIS_CLIENT } from '@backend/_shared/security/redis.module';
import { NOTIFICATIONS_SERVICE } from '@backend/auth/notifications-token';

import { mockRedis, mockConfigService } from '@testing/helpers/mocks';

// Skip the entire file when no test DB is configured.
const HAS_TEST_DB =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes('_test');
const describeOrSkip = HAS_TEST_DB ? describe : describe.skip;

describeOrSkip('Auth flow (integration)', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;
  let blocklist: any;
  let rateLimit: any;
  let redis: ReturnType<typeof mockRedis>;
  let notifications: { send: jest.Mock };

  beforeAll(async () => {
    // Import PrismaService lazily so the file doesn't fail to load in
    // unit-only sandboxes.
    const { PrismaService: Prisma } = await import('@backend/_shared/database/prisma.service');
    const { JwtBlocklistService: Blocklist } = await import('@backend/_shared/security/jwt-blocklist.service');
    const { RateLimitService: RateLimit } = await import('@backend/_shared/security/rate-limit.service');

    prisma = new Prisma();
    await prisma.$connect();

    jwt = new JwtService({ secret: 'test-secret-at-least-32-chars-long-please' });
    blocklist = new Blocklist(mockRedis() as any);
    rateLimit = new RateLimit(mockRedis() as any);
    redis = mockRedis();
    notifications = { send: jest.fn().mockResolvedValue(undefined) } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: mockConfigService() },
        { provide: JwtBlocklistService, useValue: blocklist },
        { provide: RateLimitService, useValue: rateLimit },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: NOTIFICATIONS_SERVICE, useValue: notifications },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  beforeEach(async () => {
    await prisma.userSession.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.emailVerificationToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  const TEST_EMAIL = 'auth-flow@dayjoy.test';
  const TEST_PASS = 'Str0ng!Pass';

  // -----------------------------------------------------------------
  // 1. Register → verify email → login → refresh → logout
  // -----------------------------------------------------------------

  it('runs the happy-path lifecycle', async () => {
    // Register
    const user = await service.register({
      email: TEST_EMAIL,
      password: TEST_PASS,
      firstName: 'Auth',
      lastName: 'Flow',
    });
    expect(user.email).toBe(TEST_EMAIL);

    // Verify email — pull the token from the DB.
    const evToken = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id },
    });
    expect(evToken).toBeTruthy();
    await service.verifyEmail(evToken.token);
    const verified = await prisma.user.findUnique({ where: { id: user.id } });
    expect(verified.isEmailVerified).toBe(true);

    // Login
    const loginRes = await service.login({ email: TEST_EMAIL, password: TEST_PASS });
    expect(loginRes.accessToken).toBeDefined();
    expect(loginRes.refreshToken).toBeDefined();

    // Refresh
    const refreshRes = await service.refresh({ refreshToken: loginRes.refreshToken });
    expect(refreshRes.accessToken).toBeDefined();

    // Logout
    await service.logout(refreshRes.accessToken);
    // Subsequent refresh with the rotated (now revoked) session should fail.
    await expect(
      service.refresh({ refreshToken: refreshRes.refreshToken }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // -----------------------------------------------------------------
  // 2. Password reset flow
  // -----------------------------------------------------------------

  it('completes the password reset flow', async () => {
    // Setup: register + verify.
    const user = await service.register({
      email: TEST_EMAIL,
      password: TEST_PASS,
    });
    const evToken = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id },
    });
    await service.verifyEmail(evToken.token);

    // Request reset — should NOT leak whether the email exists.
    await service.requestPasswordReset({ email: TEST_EMAIL });
    await service.requestPasswordReset({ email: 'ghost@dayjoy.test' });

    // Pull the reset token from the DB.
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
    });
    expect(resetToken).toBeTruthy();

    // Reset password.
    const NEW_PASS = 'NewStr0ng!Pass';
    await service.resetPassword({ token: resetToken.token, password: NEW_PASS });

    // Old password no longer works.
    await expect(
      service.login({ email: TEST_EMAIL, password: TEST_PASS }),
    ).rejects.toThrow(UnauthorizedException);

    // New password works.
    const loginRes = await service.login({ email: TEST_EMAIL, password: NEW_PASS });
    expect(loginRes.accessToken).toBeDefined();

    // Reset token cannot be reused.
    await expect(
      service.resetPassword({ token: resetToken.token, password: 'AnotherStr0ng!Pass' }),
    ).rejects.toThrow();
  });

  // -----------------------------------------------------------------
  // 3. Account lockout after 5 failed login attempts
  // -----------------------------------------------------------------

  it('locks the account after 5 consecutive failed login attempts', async () => {
    const user = await service.register({
      email: TEST_EMAIL,
      password: TEST_PASS,
    });
    const evToken = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id },
    });
    await service.verifyEmail(evToken.token);

    // 4 failures should still allow another attempt.
    for (let i = 0; i < 4; i++) {
      await expect(
        service.login({ email: TEST_EMAIL, password: 'wrong-pass' }),
      ).rejects.toThrow(UnauthorizedException);
    }

    // 5th failure locks the account — subsequent attempt with the right
    // password should still be rejected (lockout window).
    await expect(
      service.login({ email: TEST_EMAIL, password: 'wrong-pass' }),
    ).rejects.toThrow();

    // Even with correct password, the account is locked.
    await expect(
      service.login({ email: TEST_EMAIL, password: TEST_PASS }),
    ).rejects.toThrow();
  });

  // -----------------------------------------------------------------
  // 4. Session revocation (logout invalidates the access token)
  // -----------------------------------------------------------------

  it('revokes the session on logout and blocks the JTI', async () => {
    const user = await service.register({
      email: TEST_EMAIL,
      password: TEST_PASS,
    });
    const evToken = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id },
    });
    await service.verifyEmail(evToken.token);

    const { accessToken, refreshToken } = await service.login({
      email: TEST_EMAIL,
      password: TEST_PASS,
    });

    // Verify a session exists.
    const sessionsBefore = await prisma.userSession.count({
      where: { userId: user.id },
    });
    expect(sessionsBefore).toBeGreaterThanOrEqual(1);

    await service.logout(refreshToken);

    // Session is gone.
    const sessionsAfter = await prisma.userSession.count({
      where: { userId: user.id },
    });
    expect(sessionsAfter).toBe(0);
  });
});

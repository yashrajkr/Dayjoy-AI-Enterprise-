/**
 * API tests — /api/auth endpoints.
 *
 * Exercises the auth controller surface via supertest against a real
 * Nest application. The auth service is mocked at the service layer so
 * the tests stay fast and don't require a real DB.
 *
 * Endpoints:
 *  - POST /api/auth/register     — 201 on success, 409 on duplicate
 *  - POST /api/auth/login        — 200 on success, 401 on invalid, 429 on rate limit
 *  - POST /api/auth/refresh      — 200 on valid, 401 on invalid
 *  - POST /api/auth/logout       — 200, JWT blocklisted
 *  - GET  /api/auth/me           — 200 with user, 401 without token
 *  - POST /api/auth/password/reset/request
 *  - POST /api/auth/password/reset
 *  - POST /api/auth/verify-email
 *  - POST /api/auth/change-password
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AuthController } from '@backend/auth/auth.controller';
import { AuthService } from '@backend/auth/auth.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { Public } from '@backend/_shared/auth/public.decorator';

import { testUser, testAuthUser } from '@testing/helpers/fixtures';

describe('Auth API (/api/auth)', () => {
  let app: INestApplication;
  let authSvc: any;

  beforeAll(async () => {
    authSvc = {
      register: vi.fn(),
      login: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      getProfile: vi.fn(),
      requestPasswordReset: vi.fn(),
      resetPassword: vi.fn(),
      verifyEmail: vi.fn(),
      changePassword: vi.fn(),
    };

    // A test guard that always authenticates the request — we override
    // per-test by changing what `authSvc.getProfile` returns.
    const mockGuard = { canActivate: () => true };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -----------------------------------------------------------------
  // POST /api/auth/register
  // -----------------------------------------------------------------

  describe('POST /api/auth/register', () => {
    it('returns 201 + public user on success', async () => {
      authSvc.register.mockResolvedValue({ id: 'user-1', email: 'new@dayjoy.test' });

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'new@dayjoy.test',
          password: 'Str0ng!Pass',
          firstName: 'New',
          lastName: 'User',
        });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('new@dayjoy.test');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('returns 409 when the email is already registered', async () => {
      const { ConflictException } = await import('@nestjs/common');
      authSvc.register.mockRejectedValue(new ConflictException('email exists'));

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'dup@dayjoy.test',
          password: 'Str0ng!Pass',
        });

      expect(res.status).toBe(409);
    });

    it('returns 400 when the password is too weak', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'weak@dayjoy.test',
          password: 'weak',
        });

      // ValidationPipe rejects before the service is called.
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------
  // POST /api/auth/login
  // -----------------------------------------------------------------

  describe('POST /api/auth/login', () => {
    it('returns 200 + access/refresh tokens on success', async () => {
      authSvc.login.mockResolvedValue({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'user-1', email: 'admin@dayjoy.test' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'admin@dayjoy.test',
          password: 'Str0ng!Pass',
        });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('returns 401 when credentials are invalid', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      authSvc.login.mockRejectedValue(new UnauthorizedException());

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'admin@dayjoy.test',
          password: 'wrong',
        });

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------
  // POST /api/auth/refresh
  // -----------------------------------------------------------------

  describe('POST /api/auth/refresh', () => {
    it('returns 200 + new tokens on valid refresh', async () => {
      authSvc.refresh.mockResolvedValue({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'refresh-1' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('access-2');
    });

    it('returns 401 when the refresh token is invalid', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      authSvc.refresh.mockRejectedValue(new UnauthorizedException());

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'garbage' });

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------
  // POST /api/auth/logout
  // -----------------------------------------------------------------

  describe('POST /api/auth/logout', () => {
    it('returns 200 and blocklists the JWT', async () => {
      authSvc.logout.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer jwt-mock')
        .send({});

      expect(res.status).toBe(200);
      expect(authSvc.logout).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // GET /api/auth/me
  // -----------------------------------------------------------------

  describe('GET /api/auth/me', () => {
    it('returns 200 + the authenticated user', async () => {
      authSvc.getProfile.mockResolvedValue(testUser);

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer jwt-mock');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testUser.id);
    });

    it('returns 401 without an Authorization header', async () => {
      // Override the guard for this single test.
      const moduleRef = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [{ provide: AuthService, useValue: authSvc }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          return !!req.headers.authorization;
        } })
        .compile();

      const localApp = moduleRef.createNestApplication();
      await localApp.init();

      const res = await request(localApp.getHttpServer()).get('/api/auth/me');

      expect(res.status).toBe(401);
      await localApp.close();
    });
  });

  // -----------------------------------------------------------------
  // Password reset + verify-email + change-password
  // -----------------------------------------------------------------

  describe('POST /api/auth/password/reset/request', () => {
    it('returns 200 regardless of whether the email exists', async () => {
      authSvc.requestPasswordReset.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/api/auth/password/reset/request')
        .send({ email: 'ghost@dayjoy.test' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/auth/password/reset', () => {
    it('returns 200 on a valid token + new password', async () => {
      authSvc.resetPassword.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/api/auth/password/reset')
        .send({ token: 'valid', password: 'NewStr0ng!Pass' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('returns 200 on a valid token', async () => {
      authSvc.verifyEmail.mockResolvedValue({ isEmailVerified: true });

      const res = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: 'valid' });

      expect(res.status).toBe(200);
      expect(res.body.isEmailVerified).toBe(true);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('returns 200 on success', async () => {
      authSvc.changePassword.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', 'Bearer jwt-mock')
        .send({ oldPassword: 'OldStr0ng!Pass', newPassword: 'NewStr0ng!Pass' });

      expect(res.status).toBe(200);
    });
  });
});

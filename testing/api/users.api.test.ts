/**
 * API tests — /api/users endpoints.
 *
 * Endpoints:
 *  - GET    /api/users           — 200 with pagination, 403 without permission
 *  - GET    /api/users/:id       — 200, 404 if not found
 *  - POST   /api/users           — 201, 400 on invalid
 *  - PUT    /api/users/:id       — 200, 403 without permission
 *  - DELETE /api/users/:id       — 200 (soft delete), 403
 *  - GET    /api/users/me        — self-service
 *  - PUT    /api/users/me        — self-service update
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { UsersController } from '@backend/users/users.controller';
import { UsersService } from '@backend/users/users.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard, PERMISSIONS_KEY } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import { testUser, testAuthUser } from '@testing/helpers/fixtures';

describe('Users API (/api/users)', () => {
  let app: INestApplication;
  let usersSvc: any;

  beforeAll(async () => {
    usersSvc = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      updateProfile: vi.fn(),
      changeStatus: vi.fn(),
    };

    // Auth guard: always authenticated as testAuthUser.
    const mockAuthGuard = { canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = testAuthUser;
      return true;
    } };

    // Permissions guard: allow if no permissions metadata, else check
    // against a fake permission set.
    const mockPermsGuard = { canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = testAuthUser;
      const reflector = new Reflector();
      const required = reflector.get<string[]>(PERMISSIONS_KEY, ctx.getHandler()) || [];
      if (required.length === 0) return true;
      // testAuthUser is an admin — grant all.
      return true;
    } };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersSvc },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(mockPermsGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -----------------------------------------------------------------
  // GET /api/users
  // -----------------------------------------------------------------

  describe('GET /api/users', () => {
    it('returns 200 + paginated users', async () => {
      usersSvc.findAll.mockResolvedValue({
        data: [testUser],
        total: 1,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer()).get('/api/users?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('returns 403 when the caller lacks users:read permission', async () => {
      // Override the perms guard for this single test to deny.
      const localModuleRef = await Test.createTestingModule({
        controllers: [UsersController],
        providers: [
          { provide: UsersService, useValue: usersSvc },
          { provide: Reflector, useValue: new Reflector() },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = testAuthUser;
          return true;
        } })
        .overrideGuard(PermissionsGuard)
        .useValue({ canActivate: () => false })
        .compile();
      const localApp = localModuleRef.createNestApplication();
      await localApp.init();

      const res = await request(localApp.getHttpServer()).get('/api/users');

      expect(res.status).toBe(403);
      await localApp.close();
    });
  });

  // -----------------------------------------------------------------
  // GET /api/users/:id
  // -----------------------------------------------------------------

  describe('GET /api/users/:id', () => {
    it('returns 200 + the user', async () => {
      usersSvc.findOne.mockResolvedValue(testUser);

      const res = await request(app.getHttpServer()).get(`/api/users/${testUser.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testUser.id);
    });

    it('returns 404 when the user does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      usersSvc.findOne.mockRejectedValue(new NotFoundException());

      const res = await request(app.getHttpServer()).get('/api/users/ghost');

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------
  // POST /api/users
  // -----------------------------------------------------------------

  describe('POST /api/users', () => {
    it('returns 201 + the created user', async () => {
      usersSvc.create.mockResolvedValue({ ...testUser, id: 'user-new' });

      const res = await request(app.getHttpServer())
        .post('/api/users')
        .send({
          email: 'new@dayjoy.test',
          password: 'Str0ng!Pass',
          firstName: 'New',
          lastName: 'User',
          role: 'USER',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('user-new');
    });

    it('returns 400 on invalid input (missing email)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .send({ password: 'Str0ng!Pass' });

      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------
  // PUT /api/users/:id
  // -----------------------------------------------------------------

  describe('PUT /api/users/:id', () => {
    it('returns 200 + the updated user', async () => {
      usersSvc.update.mockResolvedValue({ ...testUser, firstName: 'Updated' });

      const res = await request(app.getHttpServer())
        .put(`/api/users/${testUser.id}`)
        .send({ firstName: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Updated');
    });

    it('returns 403 without users:update permission', async () => {
      const localModuleRef = await Test.createTestingModule({
        controllers: [UsersController],
        providers: [
          { provide: UsersService, useValue: usersSvc },
          { provide: Reflector, useValue: new Reflector() },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = testAuthUser;
          return true;
        } })
        .overrideGuard(PermissionsGuard)
        .useValue({ canActivate: () => false })
        .compile();
      const localApp = localModuleRef.createNestApplication();
      await localApp.init();

      const res = await request(localApp.getHttpServer())
        .put(`/api/users/${testUser.id}`)
        .send({ firstName: 'x' });

      expect(res.status).toBe(403);
      await localApp.close();
    });
  });

  // -----------------------------------------------------------------
  // DELETE /api/users/:id
  // -----------------------------------------------------------------

  describe('DELETE /api/users/:id', () => {
    it('returns 200 (soft delete)', async () => {
      usersSvc.remove.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete(`/api/users/${testUser.id}`);

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // GET /api/users/me + PUT /api/users/me
  // -----------------------------------------------------------------

  describe('GET /api/users/me', () => {
    it('returns 200 + the calling user', async () => {
      usersSvc.findOne.mockResolvedValue(testUser);

      const res = await request(app.getHttpServer()).get('/api/users/me');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testUser.id);
    });
  });

  describe('PUT /api/users/me', () => {
    it('returns 200 + the updated self', async () => {
      usersSvc.updateProfile.mockResolvedValue({ ...testUser, firstName: 'Self-Updated' });

      const res = await request(app.getHttpServer())
        .put('/api/users/me')
        .send({ firstName: 'Self-Updated' });

      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Self-Updated');
    });
  });
});

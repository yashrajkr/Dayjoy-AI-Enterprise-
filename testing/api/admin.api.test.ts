/**
 * API tests — /api/admin endpoints.
 *
 * Endpoints:
 *  - Users: GET / GET:id / PATCH:id/role / POST:id/roles / DELETE:id/roles/:roleId
 *  - Tenants: GET / GET:id / POST / PUT:id
 *  - Config: GET / PUT:key / DELETE:key
 *  - Stats: GET /api/admin/stats
 *  - Audit logs: GET /api/admin/audit-logs
 *  - Access logs: GET /api/admin/access-logs
 *  - Integrations: GET / PUT:id
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AdminController } from '@backend/admin/admin.controller';
import { AdminService } from '@backend/admin/admin.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import {
  testUser,
  testTenant,
  testAuditLog,
  testSuperAdminAuthUser,
} from '@testing/helpers/fixtures';

describe('Admin API (/api/admin)', () => {
  let app: INestApplication;
  let svc: any;

  beforeAll(async () => {
    svc = {
      findAllUsers: vi.fn(),
      findOneUser: vi.fn(),
      updateUserRole: vi.fn(),
      assignRole: vi.fn(),
      removeRole: vi.fn(),
      findAllTenants: vi.fn(),
      findOneTenant: vi.fn(),
      createTenant: vi.fn(),
      updateTenant: vi.fn(),
      getTenantConfig: vi.fn(),
      updateTenantConfig: vi.fn(),
      deleteTenantConfig: vi.fn(),
      getSystemStats: vi.fn(),
      getAuditLogs: vi.fn(),
      getAccessLogs: vi.fn(),
      getIntegrations: vi.fn(),
      updateIntegration: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: svc },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => {
        ctx.switchToHttp().getRequest().user = testSuperAdminAuthUser;
        return true;
      } })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -----------------------------------------------------------------
  // Users
  // -----------------------------------------------------------------

  describe('Users', () => {
    it('GET /api/admin/users returns 200 + paginated', async () => {
      svc.findAllUsers.mockResolvedValue({ data: [testUser], total: 1, page: 1, limit: 20 });

      const res = await request(app.getHttpServer()).get('/api/admin/users');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('GET /api/admin/users/:id returns 200 + the user', async () => {
      svc.findOneUser.mockResolvedValue(testUser);

      const res = await request(app.getHttpServer()).get(`/api/admin/users/${testUser.id}`);

      expect(res.status).toBe(200);
    });

    it('PATCH /api/admin/users/:id/role returns 200 + updated user', async () => {
      svc.updateUserRole.mockResolvedValue({ ...testUser, role: 'manager' });

      const res = await request(app.getHttpServer())
        .patch(`/api/admin/users/${testUser.id}/role`)
        .send({ role: 'MANAGER' });

      expect(res.status).toBe(200);
    });

    it('POST /api/admin/users/:id/roles returns 201', async () => {
      svc.assignRole.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post(`/api/admin/users/${testUser.id}/roles`)
        .send({ roleName: 'manager' });

      expect(res.status).toBe(201);
    });

    it('DELETE /api/admin/users/:id/roles/:roleId returns 200', async () => {
      svc.removeRole.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/api/admin/users/${testUser.id}/roles/role-1`);

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Tenants
  // -----------------------------------------------------------------

  describe('Tenants', () => {
    it('GET /api/admin/tenants returns 200 + list', async () => {
      svc.findAllTenants.mockResolvedValue([testTenant]);

      const res = await request(app.getHttpServer()).get('/api/admin/tenants');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('GET /api/admin/tenants/:id returns 200 + the tenant', async () => {
      svc.findOneTenant.mockResolvedValue(testTenant);

      const res = await request(app.getHttpServer()).get(`/api/admin/tenants/${testTenant.id}`);

      expect(res.status).toBe(200);
    });

    it('POST /api/admin/tenants returns 201 + created tenant', async () => {
      svc.createTenant.mockResolvedValue({ ...testTenant, id: 't-new' });

      const res = await request(app.getHttpServer())
        .post('/api/admin/tenants')
        .send({ name: 'New Tenant', slug: 'new' });

      expect(res.status).toBe(201);
    });

    it('PUT /api/admin/tenants/:id returns 200 + updated tenant', async () => {
      svc.updateTenant.mockResolvedValue({ ...testTenant, name: 'Updated' });

      const res = await request(app.getHttpServer())
        .put(`/api/admin/tenants/${testTenant.id}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------

  describe('Config', () => {
    it('GET /api/admin/config returns 200 + config entries', async () => {
      svc.getTenantConfig.mockResolvedValue([{ key: 'feature.flags', value: '{}' }]);

      const res = await request(app.getHttpServer()).get('/api/admin/config');

      expect(res.status).toBe(200);
    });

    it('PUT /api/admin/config/:key returns 200', async () => {
      svc.updateTenantConfig.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .put('/api/admin/config/feature.flags')
        .send({ value: '{"ai": true}' });

      expect(res.status).toBe(200);
    });

    it('DELETE /api/admin/config/:key returns 200', async () => {
      svc.deleteTenantConfig.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/api/admin/config/feature.flags');

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Stats + audit logs + access logs
  // -----------------------------------------------------------------

  describe('Stats', () => {
    it('GET /api/admin/stats returns 200', async () => {
      svc.getSystemStats.mockResolvedValue({
        totalTenants: 5,
        totalUsers: 100,
        totalOrders: 1000,
      });

      const res = await request(app.getHttpServer()).get('/api/admin/stats');

      expect(res.status).toBe(200);
      expect(res.body.totalTenants).toBe(5);
    });
  });

  describe('Audit logs', () => {
    it('GET /api/admin/audit-logs returns 200 + paginated', async () => {
      svc.getAuditLogs.mockResolvedValue({ data: [testAuditLog], total: 1 });

      const res = await request(app.getHttpServer()).get('/api/admin/audit-logs');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('Access logs', () => {
    it('GET /api/admin/access-logs returns 200 + paginated', async () => {
      svc.getAccessLogs.mockResolvedValue({
        data: [{ id: 'al-1', action: 'LOGIN' }],
        total: 1,
      });

      const res = await request(app.getHttpServer()).get('/api/admin/access-logs');

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Integrations
  // -----------------------------------------------------------------

  describe('Integrations', () => {
    it('GET /api/admin/integrations returns 200', async () => {
      svc.getIntegrations.mockResolvedValue([
        { key: 'integration.openai', value: '{"enabled": true}' },
      ]);

      const res = await request(app.getHttpServer()).get('/api/admin/integrations');

      expect(res.status).toBe(200);
    });

    it('PUT /api/admin/integrations/:id returns 200', async () => {
      svc.updateIntegration.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .put('/api/admin/integrations/openai')
        .send({ enabled: true });

      expect(res.status).toBe(200);
    });
  });
});

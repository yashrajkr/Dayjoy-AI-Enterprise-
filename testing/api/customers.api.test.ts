/**
 * API tests — /api/customers endpoints.
 *
 * Endpoints:
 *  - GET    /api/customers            — paginated list
 *  - GET    /api/customers/:id        — single customer
 *  - POST   /api/customers            — create
 *  - PUT    /api/customers/:id        — update
 *  - DELETE /api/customers/:id        — soft delete
 *  - GET    /api/customers/:id/stats  — LTV, orders, recent
 *  - POST   /api/customers/:id/addresses
 *  - PUT    /api/customers/:id/addresses/:addrId
 *  - DELETE /api/customers/:id/addresses/:addrId
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { CustomersController } from '@backend/customers/customers.controller';
import { CustomersService } from '@backend/customers/customers.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import { testCustomer, testAuthUser, testOrder } from '@testing/helpers/fixtures';

describe('Customers API (/api/customers)', () => {
  let app: INestApplication;
  let svc: any;

  beforeAll(async () => {
    svc = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      getStats: vi.fn(),
      addAddress: vi.fn(),
      updateAddress: vi.fn(),
      removeAddress: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        { provide: CustomersService, useValue: svc },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => {
        ctx.switchToHttp().getRequest().user = testAuthUser;
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

  describe('GET /api/customers', () => {
    it('returns 200 + paginated customers', async () => {
      svc.findAll.mockResolvedValue({ data: [testCustomer], total: 1, page: 1, limit: 20 });

      const res = await request(app.getHttpServer()).get('/api/customers?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('passes search + type + status filters through', async () => {
      svc.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await request(app.getHttpServer())
        .get('/api/customers?search=cory&type=INDIVIDUAL&status=ACTIVE');

      expect(svc.findAll).toHaveBeenCalled();
      const arg = svc.findAll.mock.calls[svc.findAll.mock.calls.length - 1][0];
      expect(arg.search).toBe('cory');
      expect(arg.type).toBe('INDIVIDUAL');
      expect(arg.status).toBe('ACTIVE');
    });
  });

  describe('GET /api/customers/:id', () => {
    it('returns 200 + the customer', async () => {
      svc.findOne.mockResolvedValue(testCustomer);

      const res = await request(app.getHttpServer()).get(`/api/customers/${testCustomer.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testCustomer.id);
    });

    it('returns 404 when the customer does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      svc.findOne.mockRejectedValue(new NotFoundException());

      const res = await request(app.getHttpServer()).get('/api/customers/ghost');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/customers', () => {
    it('returns 201 + the created customer', async () => {
      svc.create.mockResolvedValue({ ...testCustomer, id: 'cust-new' });

      const res = await request(app.getHttpServer())
        .post('/api/customers')
        .send({
          firstName: 'Cory',
          lastName: 'Customer',
          email: 'cory-new@dayjoy.test',
          phone: '+15559991111',
          type: 'INDIVIDUAL',
          source: 'WEBSITE',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('cust-new');
    });

    it('returns 409 when the email already exists', async () => {
      const { ConflictException } = await import('@nestjs/common');
      svc.create.mockRejectedValue(new ConflictException());

      const res = await request(app.getHttpServer())
        .post('/api/customers')
        .send({
          firstName: 'Cory',
          lastName: 'Customer',
          email: 'dup@dayjoy.test',
          phone: '+15559991112',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/customers/:id', () => {
    it('returns 200 + the updated customer', async () => {
      svc.update.mockResolvedValue({ ...testCustomer, firstName: 'Updated' });

      const res = await request(app.getHttpServer())
        .put(`/api/customers/${testCustomer.id}`)
        .send({ firstName: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Updated');
    });
  });

  describe('DELETE /api/customers/:id', () => {
    it('returns 200 (soft delete)', async () => {
      svc.remove.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete(`/api/customers/${testCustomer.id}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/customers/:id/stats', () => {
    it('returns 200 + LTV / order count / recent orders', async () => {
      svc.getStats.mockResolvedValue({
        lifetimeValue: 199.98,
        totalOrders: 2,
        recentOrders: [testOrder],
      });

      const res = await request(app.getHttpServer()).get(`/api/customers/${testCustomer.id}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.lifetimeValue).toBe(199.98);
      expect(res.body.totalOrders).toBe(2);
    });
  });

  describe('POST /api/customers/:id/addresses', () => {
    it('returns 201 + the customer with the new address', async () => {
      svc.addAddress.mockResolvedValue(testCustomer);

      const res = await request(app.getHttpServer())
        .post(`/api/customers/${testCustomer.id}/addresses`)
        .send({
          label: 'Home',
          line1: '123 Main',
          city: 'Springfield',
          state: 'IL',
          postalCode: '62701',
          country: 'US',
        });

      expect(res.status).toBe(201);
    });

    it('returns 404 when the customer does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      svc.addAddress.mockRejectedValue(new NotFoundException());

      const res = await request(app.getHttpServer())
        .post('/api/customers/ghost/addresses')
        .send({ line1: 'x', city: 'x', state: 'x', postalCode: 'x', country: 'x' });

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/customers/:id/addresses/:addrId', () => {
    it('returns 200 on success', async () => {
      svc.updateAddress.mockResolvedValue(testCustomer);

      const res = await request(app.getHttpServer())
        .put(`/api/customers/${testCustomer.id}/addresses/addr-1`)
        .send({ label: 'Work' });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/customers/:id/addresses/:addrId', () => {
    it('returns 200 on success', async () => {
      svc.removeAddress.mockResolvedValue(testCustomer);

      const res = await request(app.getHttpServer())
        .delete(`/api/customers/${testCustomer.id}/addresses/addr-1`);

      expect(res.status).toBe(200);
    });
  });
});

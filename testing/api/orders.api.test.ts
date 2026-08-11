/**
 * API tests — /api/orders endpoints.
 *
 * Endpoints:
 *  - GET    /api/orders              — paginated list
 *  - GET    /api/orders/stats        — aggregate stats
 *  - GET    /api/orders/:id          — single order with items
 *  - POST   /api/orders              — create with items
 *  - PUT    /api/orders/:id          — update non-status fields
 *  - PATCH  /api/orders/:id/status   — status transition
 *  - PATCH  /api/orders/:id/payment  — payment status update
 *  - POST   /api/orders/:id/items    — add line item
 *  - DELETE /api/orders/:id/items/:itemId
 *  - POST   /api/orders/:id/cancel   — cancel + restore inventory
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { OrdersController } from '@backend/orders/orders.controller';
import { OrdersService } from '@backend/orders/orders.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import { testOrder, testOrderItem, testAuthUser } from '@testing/helpers/fixtures';

describe('Orders API (/api/orders)', () => {
  let app: INestApplication;
  let svc: any;

  beforeAll(async () => {
    svc = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      findByOrderNumber: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      updatePaymentStatus: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      cancel: vi.fn(),
      getOrderStats: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: svc },
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

  describe('GET /api/orders', () => {
    it('returns 200 + paginated orders', async () => {
      svc.findAll.mockResolvedValue({ data: [testOrder], total: 1, page: 1, limit: 20 });

      const res = await request(app.getHttpServer()).get('/api/orders?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('passes status + customerId + date-range filters through', async () => {
      svc.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await request(app.getHttpServer())
        .get('/api/orders?status=PENDING&customerId=cust-1&startDate=2025-01-01&endDate=2025-12-31');

      const arg = svc.findAll.mock.calls[svc.findAll.mock.calls.length - 1][1];
      expect(arg.status).toBe('PENDING');
      expect(arg.customerId).toBe('cust-1');
    });
  });

  describe('GET /api/orders/stats', () => {
    it('returns 200 + aggregate stats', async () => {
      svc.getOrderStats.mockResolvedValue({
        totalOrders: 10,
        totalRevenue: 1000,
        averageOrderValue: 100,
        byStatus: { PENDING: 4, DELIVERED: 6 },
      });

      const res = await request(app.getHttpServer()).get('/api/orders/stats');

      expect(res.status).toBe(200);
      expect(res.body.totalOrders).toBe(10);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('returns 200 + the order with items', async () => {
      svc.findOne.mockResolvedValue({ ...testOrder, items: [testOrderItem] });

      const res = await request(app.getHttpServer()).get(`/api/orders/${testOrder.id}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('returns 404 when the order does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      svc.findOne.mockRejectedValue(new NotFoundException());

      const res = await request(app.getHttpServer()).get('/api/orders/ghost');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/orders', () => {
    it('returns 201 + the created order', async () => {
      svc.create.mockResolvedValue({ ...testOrder, id: 'order-new' });

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .send({
          customerId: 'cust-1',
          items: [{ productId: 'p1', quantity: 1, unitPrice: 10 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('order-new');
    });

    it('returns 400 when items is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .send({ customerId: 'cust-1', items: [] });

      // Either ValidationPipe rejects (400) or the service throws
      // BadRequestException (400).
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/orders/:id', () => {
    it('returns 200 + the updated order', async () => {
      svc.update.mockResolvedValue({ ...testOrder, notes: 'Updated' });

      const res = await request(app.getHttpServer())
        .put(`/api/orders/${testOrder.id}`)
        .send({ notes: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.notes).toBe('Updated');
    });
  });

  describe('PATCH /api/orders/:id/status', () => {
    it('returns 200 + the order with the new status', async () => {
      svc.updateStatus.mockResolvedValue({ ...testOrder, status: 'CONFIRMED' });

      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${testOrder.id}/status`)
        .send({ status: 'CONFIRMED' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CONFIRMED');
    });

    it('returns 400 on an invalid transition', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      svc.updateStatus.mockRejectedValue(new BadRequestException());

      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${testOrder.id}/status`)
        .send({ status: 'SHIPPED' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/orders/:id/payment', () => {
    it('returns 200 + the order with the new payment status', async () => {
      svc.updatePaymentStatus.mockResolvedValue({ ...testOrder, paymentStatus: 'PAID' });

      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${testOrder.id}/payment`)
        .send({ paymentStatus: 'PAID' });

      expect(res.status).toBe(200);
      expect(res.body.paymentStatus).toBe('PAID');
    });
  });

  describe('POST /api/orders/:id/items', () => {
    it('returns 201 + the added item', async () => {
      svc.addItem.mockResolvedValue(testOrderItem);

      const res = await request(app.getHttpServer())
        .post(`/api/orders/${testOrder.id}/items`)
        .send({ productId: 'p1', quantity: 1, unitPrice: 49.99 });

      expect(res.status).toBe(201);
    });
  });

  describe('DELETE /api/orders/:id/items/:itemId', () => {
    it('returns 200 on success', async () => {
      svc.removeItem.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/api/orders/${testOrder.id}/items/${testOrderItem.id}`);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/orders/:id/cancel', () => {
    it('returns 200 + the cancelled order', async () => {
      svc.cancel.mockResolvedValue({ ...testOrder, status: 'CANCELLED' });

      const res = await request(app.getHttpServer())
        .post(`/api/orders/${testOrder.id}/cancel`)
        .send({ reason: 'Customer changed mind' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('returns 400 when cancelling a delivered order', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      svc.cancel.mockRejectedValue(new BadRequestException());

      const res = await request(app.getHttpServer())
        .post(`/api/orders/${testOrder.id}/cancel`)
        .send({ reason: 'x' });

      expect(res.status).toBe(400);
    });
  });
});

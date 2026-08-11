/**
 * Unit tests — OrdersService.
 *
 * Covers:
 *  - findAll()              — pagination, filtering, sorting
 *  - findOne()              — returns order with items + relations
 *  - findByOrderNumber()    — order-number lookup
 *  - create()               — creates order + items, computes totals, reserves inventory
 *  - update()               — updates non-status fields
 *  - updateStatus()         — status-transition validation
 *  - updatePaymentStatus()  — payment-status update
 *  - addItem() / removeItem() — line-item management with recompute
 *  - cancel()               — sets status=CANCELLED, restores inventory
 *  - getOrderStats()        — aggregates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { OrdersService } from '@backend/orders/orders.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';
import { InventoryService } from '@backend/products/inventory.service';
import { NotificationsService } from '@backend/notifications/notifications.service';

import { mockPrismaService } from '@testing/helpers/mocks';
import {
  testOrder,
  testOrderItem,
  testProduct,
  testInventory,
  testCustomer,
  testTenant,
  testAuthUser,
} from '@testing/helpers/fixtures';

describe('OrdersService (system-wide unit)', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof mockPrismaService>;
  let inventory: { reserve: jest.Mock; release: jest.Mock; deduct: jest.Mock };
  let notifications: { send: jest.Mock };

  beforeEach(async () => {
    prisma = mockPrismaService();
    inventory = {
      reserve: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      deduct: jest.fn().mockResolvedValue(undefined),
    } as any;
    notifications = { send: jest.fn().mockResolvedValue(undefined) } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  // -------------------------------------------------------------------
  // findAll()
  // -------------------------------------------------------------------

  describe('findAll()', () => {
    it('returns paginated orders scoped to tenant', async () => {
      prisma.order.findMany.mockResolvedValue([testOrder]);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.findAll(testAuthUser, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      const whereArg = prisma.order.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });

    it('applies status + customerId + distributorId filters', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll(testAuthUser, {
        page: 1,
        limit: 20,
        status: 'PENDING',
        customerId: testCustomer.id,
        distributorId: 'dist-1',
      });

      const whereArg = prisma.order.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe('PENDING');
      expect(whereArg.customerId).toBe(testCustomer.id);
      expect(whereArg.distributorId).toBe('dist-1');
    });

    it('supports date-range filtering', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll(testAuthUser, {
        page: 1,
        limit: 20,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      } as any);

      const whereArg = prisma.order.findMany.mock.calls[0][0].where;
      expect(whereArg.placedAt).toBeDefined();
      expect(whereArg.placedAt.gte).toBeDefined();
      expect(whereArg.placedAt.lte).toBeDefined();
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the order with items and relations', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...testOrder,
        items: [testOrderItem],
        customer: testCustomer,
      });

      const result = await service.findOne(testOrder.id, testAuthUser);

      expect(result.id).toBe(testOrder.id);
      expect(result.items).toHaveLength(1);
    });

    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // findByOrderNumber()
  // -------------------------------------------------------------------

  describe('findByOrderNumber()', () => {
    it('returns the order by its orderNumber', async () => {
      prisma.order.findFirst.mockResolvedValue(testOrder);

      const result = await service.findByOrderNumber(
        testOrder.orderNumber,
        testTenant.id,
      );

      expect(result.id).toBe(testOrder.id);
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------

  describe('create()', () => {
    it('creates an order with items, computes totals, and reserves inventory', async () => {
      prisma.customer.findUnique.mockResolvedValue(testCustomer);
      prisma.product.findUnique.mockResolvedValue({
        ...testProduct,
        inventory: [testInventory],
      });
      prisma.order.create.mockResolvedValue({
        ...testOrder,
        items: [testOrderItem],
      });

      const result = await service.create(testAuthUser, {
        customerId: testCustomer.id,
        items: [
          { productId: testProduct.id, quantity: 2, unitPrice: 49.99 },
        ],
        shippingAddress: { line1: 'x', city: 'x', state: 'x', postalCode: 'x', country: 'US' },
      } as any);

      expect(result.id).toBe(testOrder.id);
      // Inventory must be reserved for each item.
      expect(inventory.reserve).toHaveBeenCalled();
      // Order totals must be computed (not zero).
      const createArg = prisma.order.create.mock.calls[0][0];
      expect(createArg.data.subtotal).toBeGreaterThan(0);
      expect(createArg.data.total).toBeGreaterThan(0);
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.create(testAuthUser, {
          customerId: 'ghost',
          items: [],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when items is empty', async () => {
      prisma.customer.findUnique.mockResolvedValue(testCustomer);

      await expect(
        service.create(testAuthUser, {
          customerId: testCustomer.id,
          items: [],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when product is out of stock', async () => {
      prisma.customer.findUnique.mockResolvedValue(testCustomer);
      prisma.product.findUnique.mockResolvedValue({
        ...testProduct,
        inventory: [{ ...testInventory, quantity: 0 }],
      });

      await expect(
        service.create(testAuthUser, {
          customerId: testCustomer.id,
          items: [{ productId: testProduct.id, quantity: 1, unitPrice: 49.99 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------

  describe('update()', () => {
    it('updates non-status fields and writes audit log', async () => {
      prisma.order.findUnique.mockResolvedValue(testOrder);
      prisma.order.update.mockResolvedValue({
        ...testOrder,
        notes: 'Updated notes',
      });

      const result = await service.update(testOrder.id, testAuthUser, {
        notes: 'Updated notes',
      } as any);

      expect(result.notes).toBe('Updated notes');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.update('ghost', testAuthUser, { notes: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // updateStatus()
  // -------------------------------------------------------------------

  describe('updateStatus()', () => {
    it('transitions PENDING → CONFIRMED', async () => {
      prisma.order.findUnique.mockResolvedValue(testOrder);
      prisma.order.update.mockResolvedValue({ ...testOrder, status: 'CONFIRMED' });

      const result = await service.updateStatus(testOrder.id, testAuthUser, {
        status: 'CONFIRMED',
      } as any);

      expect(result.status).toBe('CONFIRMED');
    });

    it('throws BadRequestException on an invalid transition (CANCELLED → CONFIRMED)', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...testOrder,
        status: 'CANCELLED',
      });

      await expect(
        service.updateStatus(testOrder.id, testAuthUser, {
          status: 'CONFIRMED',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when transitioning DELIVERED → anything', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...testOrder,
        status: 'DELIVERED',
      });

      await expect(
        service.updateStatus(testOrder.id, testAuthUser, {
          status: 'SHIPPED',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('ghost', testAuthUser, { status: 'CONFIRMED' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // updatePaymentStatus()
  // -------------------------------------------------------------------

  describe('updatePaymentStatus()', () => {
    it('updates payment status and writes audit log', async () => {
      prisma.order.findUnique.mockResolvedValue(testOrder);
      prisma.order.update.mockResolvedValue({
        ...testOrder,
        paymentStatus: 'PAID',
      });

      const result = await service.updatePaymentStatus(testOrder.id, testAuthUser, {
        paymentStatus: 'PAID',
      } as any);

      expect(result.paymentStatus).toBe('PAID');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePaymentStatus('ghost', testAuthUser, {
          paymentStatus: 'PAID',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // addItem() / removeItem()
  // -------------------------------------------------------------------

  describe('addItem()', () => {
    it('adds an item and recomputes order totals', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...testOrder,
        items: [testOrderItem],
      });
      prisma.product.findUnique.mockResolvedValue({
        ...testProduct,
        inventory: [testInventory],
      });
      prisma.orderItem.create.mockResolvedValue(testOrderItem);
      prisma.order.update.mockResolvedValue(testOrder);

      await service.addItem(testOrder.id, testAuthUser, {
        productId: testProduct.id,
        quantity: 1,
        unitPrice: 49.99,
      } as any);

      expect(prisma.orderItem.create).toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalled(); // totals recomputed
    });

    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.addItem('ghost', testAuthUser, {
          productId: 'x',
          quantity: 1,
          unitPrice: 10,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItem()', () => {
    it('removes the item and recomputes totals', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...testOrder,
        items: [testOrderItem],
      });
      prisma.orderItem.delete.mockResolvedValue(testOrderItem);
      prisma.order.update.mockResolvedValue(testOrder);

      await service.removeItem(testOrder.id, testOrderItem.id, testAuthUser);

      expect(prisma.orderItem.delete).toHaveBeenCalledWith({
        where: { id: testOrderItem.id },
      });
      expect(prisma.order.update).toHaveBeenCalled();
    });

    it('throws NotFoundException when the item does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...testOrder,
        items: [],
      });

      await expect(
        service.removeItem(testOrder.id, 'ghost', testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // cancel()
  // -------------------------------------------------------------------

  describe('cancel()', () => {
    it('sets status=CANCELLED and releases reserved inventory', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...testOrder,
        status: 'PENDING',
        items: [testOrderItem],
      });
      prisma.order.update.mockResolvedValue({
        ...testOrder,
        status: 'CANCELLED',
      });

      const result = await service.cancel(testOrder.id, testAuthUser, {
        reason: 'Customer changed mind',
      } as any);

      expect(result.status).toBe('CANCELLED');
      expect(inventory.release).toHaveBeenCalled();
    });

    it('throws BadRequestException when cancelling an already-delivered order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...testOrder,
        status: 'DELIVERED',
      });

      await expect(
        service.cancel(testOrder.id, testAuthUser, { reason: 'x' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.cancel('ghost', testAuthUser, { reason: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // getOrderStats()
  // -------------------------------------------------------------------

  describe('getOrderStats()', () => {
    it('returns aggregate stats (count, total revenue, avg order value)', async () => {
      prisma.order.count.mockResolvedValue(10);
      prisma.order.aggregate.mockResolvedValue({
        _count: { _all: 10 },
        _sum: { total: 1000 },
        _avg: { total: 100 },
      });
      prisma.order.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 4 } },
        { status: 'DELIVERED', _count: { _all: 6 } },
      ]);

      const result = await service.getOrderStats(testAuthUser);

      expect(result).toHaveProperty('totalOrders');
      expect(result).toHaveProperty('totalRevenue');
      expect(result).toHaveProperty('averageOrderValue');
      expect(result).toHaveProperty('byStatus');
    });
  });
});

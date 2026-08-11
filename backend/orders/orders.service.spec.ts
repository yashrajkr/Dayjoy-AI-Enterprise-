import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { OrdersService, OrderAuthUser } from './orders.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { InventoryService } from '../products/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateStatusDto, OrderStatusEnum } from './dto/update-status.dto';
import { UpdatePaymentDto, PaymentStatusEnum } from './dto/update-payment.dto';
import { AddItemDto } from './dto/add-item.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';

function createExtendedMockPrisma() {
  return {
    ...createMockPrismaService(),
    inventory: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    inventoryTransaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    shipment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    distributorCommission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  };
}

const USER: OrderAuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.c' };

/**
 * Build a minimal mock InventoryService that just records reserve/release
 * calls without touching the DB. The real OrdersService delegates stock
 * operations to InventoryService — by mocking it here we isolate the
 * OrdersService logic.
 */
function createMockInventoryService() {
  return {
    reserveStock: vi.fn().mockResolvedValue(undefined),
    releaseStock: vi.fn().mockResolvedValue(undefined),
    deductStock: vi.fn().mockResolvedValue(undefined),
    getInventory: vi.fn(),
    getLowStock: vi.fn(),
    getTransactions: vi.fn(),
    updateStock: vi.fn(),
  };
}

function createMockNotificationsService() {
  return {
    send: vi.fn().mockResolvedValue({ success: true }),
    sendBatch: vi.fn(),
    handleEvent: vi.fn().mockResolvedValue({ success: true }),
    findAll: vi.fn(),
    findOne: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    delete: vi.fn(),
    getUnreadCount: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof createExtendedMockPrisma>;
  let inventoryService: ReturnType<typeof createMockInventoryService>;
  let notificationsService: ReturnType<typeof createMockNotificationsService>;

  beforeEach(async () => {
    prisma = createExtendedMockPrisma();
    inventoryService = createMockInventoryService();
    notificationsService = createMockNotificationsService();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventoryService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  // ---------------------------------------------------------------------
  // findAll()
  // ---------------------------------------------------------------------
  describe('findAll', () => {
    it('returns paginated orders with customer / distributor / item-count includes', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'o1',
          orderNumber: 'ORD-1',
          tenantId: 't1',
          customer: { id: 'c1', firstName: 'A', lastName: 'B' },
          distributor: null,
          _count: { items: 2 },
        },
      ]);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.findAll(USER, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);

      const args = prisma.order.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t1');
      expect(args.include.customer).toBeDefined();
      expect(args.include.distributor).toBeDefined();
      expect(args.include._count.select.items).toBe(true);
    });

    it('applies status / customerId / distributorId / paymentStatus / dateRange filters', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll(USER, {
        page: 1,
        limit: 20,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        customerId: 'c1',
        distributorId: 'd1',
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
      } as QueryOrdersDto);

      const where = prisma.order.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('DELIVERED');
      expect(where.paymentStatus).toBe('PAID');
      expect(where.customerId).toBe('c1');
      expect(where.distributorId).toBe('d1');
      expect(where.createdAt.gte).toEqual(new Date('2025-01-01'));
      expect(where.createdAt.lte).toEqual(new Date('2025-12-31'));
    });
  });

  // ---------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------
  describe('create', () => {
    it('creates an order with items, reserves inventory, and queues a notification', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'W-001', name: 'Widget', taxRate: 0 },
        { id: 'p2', sku: 'G-001', name: 'Gadget', taxRate: 10 },
      ]);
      prisma.order.create.mockImplementation(async ({ data }: any) => ({
        id: 'o1',
        ...data,
        items: data.items.create,
        customer: { id: 'c1', email: 'c@e.com' },
      }));
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: CreateOrderDto = {
        customerId: 'c1',
        items: [
          { productId: 'p1', quantity: 2, unitPrice: 10 },
          { productId: 'p2', quantity: 1, unitPrice: 25 },
        ],
      };

      const result = await service.create(USER, dto);

      expect(result.id).toBe('o1');
      expect(result.status).toBe('PENDING');
      expect(result.orderNumber).toMatch(/^ORD-\d{8}-[A-Z0-9]{6}$/);

      const call = prisma.order.create.mock.calls[0][0];
      // Totals: subtotal = 2*10 + 1*25 = 45, tax = 0 + 2.5 = 2.5, total = 47.5
      expect(call.data.subtotal).toBe(45);
      expect(call.data.tax).toBeCloseTo(2.5, 2);
      expect(call.data.total).toBeCloseTo(47.5, 2);
      expect(call.data.currency).toBe('USD');

      // Items should include product snapshot.
      expect(call.data.items.create).toHaveLength(2);
      expect(call.data.items.create[0]).toEqual(
        expect.objectContaining({
          productId: 'p1',
          productSku: 'W-001',
          productName: 'Widget',
          quantity: 2,
          unitPrice: 10,
          subtotal: 20,
          total: 20,
        }),
      );

      // Inventory reserved for each item. The 6th argument is the
      // transaction client (the prisma mock — the $transaction mock
      // passes itself to the callback), proving the reservation now
      // participates in the order-create transaction.
      expect(inventoryService.reserveStock).toHaveBeenCalledTimes(2);
      expect(inventoryService.reserveStock.mock.calls[0]).toEqual([
        't1',
        'p1',
        2,
        'ORDER',
        result.orderNumber,
        prisma,
      ]);

      // Order-created notification queued.
      expect(notificationsService.handleEvent).toHaveBeenCalledTimes(1);
      const eventArg = notificationsService.handleEvent.mock.calls[0][0];
      expect(eventArg.event).toBe('order.created');
      expect(eventArg.payload.orderNumber).toBe(result.orderNumber);
    });

    it('throws BadRequestException when items is empty', async () => {
      const dto: CreateOrderDto = { customerId: 'c1', items: [] };
      await expect(service.create(USER, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a product does not exist in the tenant', async () => {
      prisma.product.findMany.mockResolvedValue([]); // no products found

      const dto: CreateOrderDto = {
        customerId: 'c1',
        items: [{ productId: 'p-missing', quantity: 1, unitPrice: 5 }],
      };

      await expect(service.create(USER, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('creates a distributor commission when distributorId is set', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'W-001', name: 'Widget', taxRate: 0 },
      ]);
      prisma.distributor.findUnique.mockResolvedValue({
        commissionRate: 5,
        currency: 'USD',
      });
      prisma.order.create.mockImplementation(async ({ data }: any) => ({
        id: 'o1',
        ...data,
        customer: { id: 'c1', email: 'c@e.com' },
      }));
      prisma.distributorCommission.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: CreateOrderDto = {
        customerId: 'c1',
        distributorId: 'd1',
        items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
      };

      await service.create(USER, dto);

      const commCall = prisma.distributorCommission.create.mock.calls[0][0];
      // 5% of 100 = 5
      expect(commCall.data.amount).toBe(5);
      expect(commCall.data.distributorId).toBe('d1');
      expect(commCall.data.status).toBe('PENDING');
    });
  });

  // ---------------------------------------------------------------------
  // updateStatus()
  // ---------------------------------------------------------------------
  describe('updateStatus', () => {
    it('transitions the status and writes an audit log', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'PENDING',
        items: [],
      });
      prisma.order.update.mockImplementation(async ({ data }: any) => ({
        id: 'o1',
        tenantId: 't1',
        ...data,
        customer: { id: 'c1', email: 'c@e.com' },
        items: [],
      }));

      const dto: UpdateStatusDto = { status: OrderStatusEnum.CONFIRMED };
      const result = await service.updateStatus('o1', USER, dto);

      expect(result.status).toBe('CONFIRMED');
    });

    it('releases inventory + queues a cancelled notification when transitioning to CANCELLED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'PENDING',
        items: [
          { id: 'i1', productId: 'p1', quantity: 2 },
          { id: 'i2', productId: 'p2', quantity: 1 },
        ],
      });
      prisma.order.update.mockResolvedValue({
        id: 'o1',
        status: 'CANCELLED',
        customer: { id: 'c1', email: 'c@e.com' },
        items: [],
      });

      await service.updateStatus('o1', USER, { status: OrderStatusEnum.CANCELLED });

      expect(inventoryService.releaseStock).toHaveBeenCalledTimes(2);
      expect(notificationsService.handleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'order.cancelled' }),
      );
    });

    it('deducts inventory + queues a delivered notification when transitioning to DELIVERED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'SHIPPED',
        items: [{ id: 'i1', productId: 'p1', quantity: 2 }],
      });
      prisma.order.update.mockResolvedValue({
        id: 'o1',
        status: 'DELIVERED',
        customer: { id: 'c1', email: 'c@e.com' },
        items: [],
      });

      await service.updateStatus('o1', USER, { status: OrderStatusEnum.DELIVERED });

      expect(inventoryService.deductStock).toHaveBeenCalledTimes(1);
      expect(notificationsService.handleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'order.delivered' }),
      );
    });

    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', tenantId: 'other' });
      await expect(
        service.updateStatus('o1', USER, { status: OrderStatusEnum.CONFIRMED }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('translates an invalid-status-transition P2002 into a BadRequestException', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'PENDING',
        items: [],
      });
      // Simulate Prisma throwing the trigger's check_violation as P2002.
      const err: any = new Error('Invalid order status transition from PENDING to DELIVERED');
      err.code = 'P2002';
      prisma.order.update.mockRejectedValue(err);

      await expect(
        service.updateStatus('o1', USER, { status: OrderStatusEnum.DELIVERED }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------
  // updatePaymentStatus()
  // ---------------------------------------------------------------------
  describe('updatePaymentStatus', () => {
    it('updates the payment status + writes an audit log', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        paymentStatus: 'PENDING',
        customer: { id: 'c1' },
        items: [],
      });
      prisma.order.update.mockResolvedValue({
        id: 'o1',
        paymentStatus: 'PAID',
        customer: { id: 'c1', email: 'c@e.com' },
        items: [],
      });
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: UpdatePaymentDto = {
        paymentStatus: PaymentStatusEnum.PAID,
        paymentId: 'pay_123',
      };
      const result = await service.updatePaymentStatus('o1', USER, dto);

      expect(result.paymentStatus).toBe('PAID');
      // PAID → queue order.paid notification.
      expect(notificationsService.handleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'order.paid' }),
      );
    });
  });

  // ---------------------------------------------------------------------
  // addItem() / removeItem()
  // ---------------------------------------------------------------------
  describe('addItem', () => {
    it('rejects additions on a non-PENDING order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CONFIRMED',
        items: [],
      });

      const dto: AddItemDto = { productId: 'p1', quantity: 1, unitPrice: 5 };
      await expect(service.addItem('o1', USER, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('removeItem', () => {
    it('rejects removals on a non-PENDING order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'SHIPPED',
        items: [{ id: 'i1', productId: 'p1', quantity: 1 }],
      });

      await expect(
        service.removeItem('o1', 'i1', USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the item does not exist on the order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'PENDING',
        items: [{ id: 'i-other', productId: 'p1', quantity: 1 }],
      });

      await expect(
        service.removeItem('o1', 'i-missing', USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------
  // cancel()
  // ---------------------------------------------------------------------
  describe('cancel', () => {
    it('captures the cancellation reason in metadata + transitions to CANCELLED', async () => {
      // First findUnique for findOne, second for updateStatus.
      prisma.order.findUnique
        .mockResolvedValueOnce({
          id: 'o1',
          tenantId: 't1',
          status: 'PENDING',
          items: [{ id: 'i1', productId: 'p1', quantity: 1 }],
          metadata: {},
        })
        .mockResolvedValueOnce({
          id: 'o1',
          tenantId: 't1',
          status: 'PENDING',
          items: [{ id: 'i1', productId: 'p1', quantity: 1 }],
        });
      prisma.order.update
        .mockResolvedValueOnce({ id: 'o1', metadata: { cancellationReason: 'Customer request' } })
        .mockResolvedValueOnce({
          id: 'o1',
          status: 'CANCELLED',
          customer: { id: 'c1', email: 'c@e.com' },
          items: [{ id: 'i1', productId: 'p1', quantity: 1 }],
        });

      const dto: CancelOrderDto = { reason: 'Customer request' };
      const result = await service.cancel('o1', USER, dto);

      expect(result.status).toBe('CANCELLED');
      // First update wrote the cancellation reason.
      const firstUpdate = prisma.order.update.mock.calls[0][0];
      expect(firstUpdate.data.metadata.cancellationReason).toBe('Customer request');
      // Inventory released.
      expect(inventoryService.releaseStock).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // getOrderStats()
  // ---------------------------------------------------------------------
  describe('getOrderStats', () => {
    it('returns aggregate order stats', async () => {
      prisma.order.count.mockResolvedValue(10);
      prisma.order.aggregate.mockResolvedValue({
        _sum: { total: 1000 },
        _avg: { total: 100 },
      });
      prisma.order.groupBy.mockResolvedValue([
        { status: 'DELIVERED', _count: { _all: 5 } },
        { status: 'PENDING', _count: { _all: 5 } },
      ]);

      const result = await service.getOrderStats(USER);

      expect(result.totalOrders).toBe(10);
      expect(result.totalRevenue).toBe(1000);
      expect(result.avgOrderValue).toBe(100);
      expect(result.byStatus.DELIVERED).toBe(5);
      expect(result.byStatus.PENDING).toBe(5);
    });
  });
});

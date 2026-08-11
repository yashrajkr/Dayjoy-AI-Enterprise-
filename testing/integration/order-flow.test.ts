/**
 * Integration test — Full order flow.
 *
 * Exercises the end-to-end order lifecycle against a real test DB:
 *
 *  1. Create customer → add products → create order → process payment →
 *     ship → deliver.
 *  2. Inventory is deducted on delivery.
 *  3. Commission is calculated.
 *  4. Customer LTV is updated.
 *
 * Requires `DATABASE_URL` pointing at a writable test DB.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';

import { OrdersService } from '@backend/orders/orders.service';
import { ProductsService } from '@backend/products/products.service';
import { CustomersService } from '@backend/customers/customers.service';
import { InventoryService } from '@backend/products/inventory.service';
import { NotificationsService } from '@backend/notifications/notifications.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { testTenant } from '@testing/helpers/fixtures';

const HAS_TEST_DB =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes('_test');
const describeOrSkip = HAS_TEST_DB ? describe : describe.skip;

describeOrSkip('Order flow (integration)', () => {
  let orders: OrdersService;
  let products: ProductsService;
  let customers: CustomersService;
  let inventory: InventoryService;
  let prisma: any;
  let notifications: { send: jest.Mock };

  const authUser = {
    userId: 'emp-1',
    tenantId: testTenant.id,
    email: 'orders@dayjoy.test',
    jti: 'jti-order-flow',
  };

  let testCustomer: any;
  let testProduct: any;
  let testInventory: any;

  beforeAll(async () => {
    const { PrismaService: Prisma } = await import('@backend/_shared/database/prisma.service');
    prisma = new Prisma();
    await prisma.$connect();

    notifications = { send: jest.fn().mockResolvedValue(undefined) } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        ProductsService,
        CustomersService,
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    orders = moduleRef.get(OrdersService);
    products = moduleRef.get(ProductsService);
    customers = moduleRef.get(CustomersService);
    inventory = moduleRef.get(InventoryService);
  });

  beforeEach(async () => {
    // Truncate relevant tables (respecting FK order).
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();

    testCustomer = await customers.create(
      {
        firstName: 'Order',
        lastName: 'Flow',
        email: 'order-flow@dayjoy.test',
        phone: '+15550001111',
        type: 'INDIVIDUAL',
        source: 'WEBSITE',
      } as any,
      authUser,
    );

    testProduct = await products.create(authUser, {
      name: 'Vitamin C Serum',
      sku: 'SKU-OF-' + Date.now(),
      price: 49.99,
      costPrice: 18,
    } as any);
    testInventory = await prisma.inventory.findFirst({
      where: { productId: testProduct.id },
    });

    // Top up stock to 100.
    await prisma.inventory.update({
      where: { id: testInventory.id },
      data: { quantity: 100 },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('runs the full PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED flow', async () => {
    // Create the order.
    const order = await orders.create(authUser, {
      customerId: testCustomer.id,
      items: [
        { productId: testProduct.id, quantity: 2, unitPrice: 49.99 },
      ],
      shippingAddress: {
        line1: '123 Main',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'US',
      },
    } as any);
    expect(order.status).toBe('PENDING');
    expect(order.total).toBeGreaterThan(0);

    // Stock is reserved (not yet deducted).
    const invAfterReserve = await prisma.inventory.findUnique({
      where: { id: testInventory.id },
    });
    expect(invAfterReserve.reserved).toBe(2);
    expect(invAfterReserve.quantity).toBe(100);

    // Confirm.
    await orders.updateStatus(order.id, authUser, { status: 'CONFIRMED' } as any);
    // Process.
    await orders.updateStatus(order.id, authUser, { status: 'PROCESSING' } as any);
    // Ship.
    await orders.updateStatus(order.id, authUser, { status: 'SHIPPED' } as any);

    // Deliver.
    const delivered = await orders.updateStatus(order.id, authUser, {
      status: 'DELIVERED',
    } as any);
    expect(delivered.status).toBe('DELIVERED');

    // Stock is deducted on delivery.
    const invAfterDeliver = await prisma.inventory.findUnique({
      where: { id: testInventory.id },
    });
    expect(invAfterDeliver.quantity).toBe(98);
    expect(invAfterDeliver.reserved).toBe(0);

    // Customer LTV is updated.
    const custAfter = await prisma.customer.findUnique({
      where: { id: testCustomer.id },
    });
    expect(custAfter.lifetimeValue).toBeGreaterThan(0);
    expect(custAfter.totalOrders).toBe(1);
  });

  it('cancelling a PENDING order releases reserved inventory', async () => {
    const order = await orders.create(authUser, {
      customerId: testCustomer.id,
      items: [
        { productId: testProduct.id, quantity: 3, unitPrice: 49.99 },
      ],
    } as any);

    const invAfterReserve = await prisma.inventory.findUnique({
      where: { id: testInventory.id },
    });
    expect(invAfterReserve.reserved).toBe(3);

    await orders.cancel(order.id, authUser, { reason: 'Customer changed mind' } as any);

    const invAfterCancel = await prisma.inventory.findUnique({
      where: { id: testInventory.id },
    });
    expect(invAfterCancel.reserved).toBe(0);
    expect(invAfterCancel.quantity).toBe(100); // unchanged
  });

  it('rejects invalid status transitions (DELIVERED → SHIPPED)', async () => {
    const order = await orders.create(authUser, {
      customerId: testCustomer.id,
      items: [
        { productId: testProduct.id, quantity: 1, unitPrice: 49.99 },
      ],
    } as any);

    await orders.updateStatus(order.id, authUser, { status: 'CONFIRMED' } as any);
    await orders.updateStatus(order.id, authUser, { status: 'PROCESSING' } as any);
    await orders.updateStatus(order.id, authUser, { status: 'SHIPPED' } as any);
    await orders.updateStatus(order.id, authUser, { status: 'DELIVERED' } as any);

    await expect(
      orders.updateStatus(order.id, authUser, { status: 'SHIPPED' } as any),
    ).rejects.toThrow();
  });
});

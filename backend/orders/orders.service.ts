import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { InventoryService } from '../products/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateStatusDto, OrderStatusEnum } from './dto/update-status.dto';
import { UpdatePaymentDto, PaymentStatusEnum } from './dto/update-payment.dto';
import { AddItemDto } from './dto/add-item.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import {
  QueryOrdersDto,
  OrderSortBy,
  OrderSortOrder,
} from './dto/query-orders.dto';

/**
 * Re-exported for backward compatibility with the old import path
 * (`./dto/update-order-status.dto`). The DTO now lives in
 * `update-status.dto.ts` to align with the rest of the per-action DTOs
 * (`update-payment.dto.ts`, `cancel-order.dto.ts`, etc).
 */
export { UpdateStatusDto as UpdateOrderStatusDto } from './dto/update-status.dto';

/**
 * Authenticated user shape (matches the JwtStrategy return value).
 */
export interface OrderAuthUser {
  userId: string;
  tenantId: string;
  email?: string;
  jti?: string;
}

/**
 * Computed totals for an order or order-item batch.
 */
interface OrderTotals {
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
}

/**
 * OrdersService — order lifecycle + state-machine management.
 *
 * Lifecycle:
 *  1. `create()`:
 *     - Validates items non-empty
 *     - Reserves inventory (via {@link InventoryService.reserveStock})
 *     - Snapshots product sku/name onto each OrderItem row
 *     - Computes totals (subtotal + tax + shipping - discount = total — DB CHECK constraint)
 *     - Generates a unique order_number (`ORD-{YYYYMMDD}-{6-char random}`)
 *     - Creates a DistributorCommission row when `distributorId` is set
 *     - Queues an `order.created` notification via {@link NotificationsService}
 *     - All of the above runs in a single Prisma `$transaction` for atomicity
 *
 *  2. `updateStatus()`:
 *     - The DB trigger `validate_order_status_transition` rejects invalid
 *       transitions with a `check_violation` — we translate that into a
 *       `BadRequestException` so callers get a clean 400 instead of a 500.
 *     - On `CANCELLED`: releases reserved inventory + queues notification
 *     - On `DELIVERED`: deducts inventory (reserved → stock-out) + queues
 *       notification. Customer LTV is updated by the DB trigger
 *       (`update_customer_stats_on_delivery`).
 *
 *  3. `updatePaymentStatus()`:
 *     - On `PAID`: queues an invoice notification.
 *
 *  4. `addItem()` / `removeItem()`: only allowed on PENDING orders.
 *     Recalculates totals after the change.
 *
 *  5. `cancel()`: convenience wrapper around `updateStatus(CANCELLED)` with
 *     a reason captured in metadata.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async findAll(user: OrderAuthUser, query: QueryOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(user.tenantId, query);
    const orderBy = this.buildOrderBy(query);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          distributor: { select: { id: true, companyName: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: OrderAuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        distributor: true,
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        shipments: true,
      },
    });
    if (!order || order.tenantId !== user.tenantId) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /**
   * Public lookup by order_number (e.g. for customers tracking their order).
   * Tenant-scoped — caller must supply the tenantId of the order's owner.
   */
  async findByOrderNumber(orderNumber: string, tenantId: string) {
    return this.prisma.order.findFirst({
      where: { orderNumber, tenantId },
      include: {
        items: true,
        shipments: true,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------

  async create(user: OrderAuthUser, dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must have at least one item');
    }

    // Pre-fetch products so we can snapshot sku/name and validate tenant ownership.
    const productIds = Array.from(new Set(dto.items.map((i) => i.productId)));
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: user.tenantId },
      select: { id: true, sku: true, name: true, taxRate: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    for (const item of dto.items) {
      if (!productById.has(item.productId)) {
        throw new BadRequestException(`Product ${item.productId} not found in tenant`);
      }
    }

    const orderNumber = this.generateOrderNumber();
    const totals = this.calculateTotals(dto.items, productById);

    const order = await this.prisma.$transaction(async (tx) => {
      // 1. Reserve inventory for each item (throws on insufficient stock).
      // Pass `tx` so the reservation runs in THIS transaction — without
      // it, InventoryService.reserveStock would open its own nested
      // transaction and a subsequent order-create failure would orphan
      // the reserved stock.
      for (const item of dto.items) {
        await this.inventoryService.reserveStock(
          user.tenantId,
          item.productId,
          item.quantity,
          'ORDER',
          orderNumber,
          tx,
        );
      }

      // 2. Create the order + nested items.
      const created = await tx.order.create({
        data: {
          tenantId: user.tenantId,
          customerId: dto.customerId,
          distributorId: dto.distributorId,
          orderNumber,
          status: 'PENDING' as any,
          subtotal: totals.subtotal,
          tax: totals.tax,
          shipping: totals.shipping,
          discount: totals.discount,
          total: totals.total,
          currency: dto.currency ?? 'USD',
          shippingAddress: dto.shippingAddress,
          billingAddress: dto.billingAddress,
          paymentMethod: dto.paymentMethod,
          paymentStatus: 'PENDING' as any,
          notes: dto.notes,
          items: {
            create: dto.items.map((item) => {
              const p = productById.get(item.productId)!;
              const itemSubtotal = item.quantity * item.unitPrice;
              const taxRate = item.taxRate ?? p.taxRate ?? 0;
              const taxAmount = +(itemSubtotal * (taxRate / 100)).toFixed(2);
              const discountAmount = item.discountAmount ?? 0;
              return {
                tenantId: user.tenantId,
                productId: item.productId,
                productSku: p.sku,
                productName: p.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                taxRate,
                taxAmount,
                discountAmount,
                subtotal: itemSubtotal,
                total: itemSubtotal + taxAmount - discountAmount,
              };
            }),
          },
        },
        include: {
          customer: true,
          distributor: true,
          items: true,
        },
      });

      // 3. Create distributor commission if applicable.
      if (dto.distributorId) {
        const distributor = await tx.distributor.findUnique({
          where: { id: dto.distributorId },
          select: { commissionRate: true },
        });
        if (distributor && distributor.commissionRate) {
          const commissionAmount = +(
            (totals.total * (distributor.commissionRate / 100))
          ).toFixed(2);
          if (commissionAmount > 0) {
            await tx.distributorCommission.create({
              data: {
                tenantId: user.tenantId,
                distributorId: dto.distributorId,
                orderId: created.id,
                amount: commissionAmount,
                currency: dto.currency ?? 'USD',
                status: 'PENDING',
              },
            });
          }
        }
      }

      // 4. Audit log.
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'INSERT',
          resourceType: 'Order',
          resourceId: created.id,
          newValues: {
            orderNumber: created.orderNumber,
            total: created.total,
            customerId: created.customerId,
          },
        },
      });

      return created;
    });

    // 5. Queue order-confirmation notification (best-effort — failures are logged).
    this.queueOrderEvent(user.tenantId, order, 'order.created').catch((err) =>
      this.logger.error(`Failed to queue order.created notification: ${err.message}`),
    );

    return order;
  }

  /**
   * Update the "soft" fields of an order. Totals, items, customer,
   * distributor, and status are NOT modifiable via this endpoint — use the
   * dedicated endpoints.
   */
  async update(id: string, user: OrderAuthUser, dto: UpdateOrderDto) {
    const order = await this.findOne(id, user);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.shippingAddress !== undefined ? { shippingAddress: dto.shippingAddress } : {}),
          ...(dto.billingAddress !== undefined ? { billingAddress: dto.billingAddress } : {}),
        },
        include: { customer: true, distributor: true, items: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'UPDATE',
          resourceType: 'Order',
          resourceId: order.id,
          oldValues: {
            notes: order.notes,
            shippingAddress: order.shippingAddress,
            billingAddress: order.billingAddress,
          },
          newValues: {
            notes: updated.notes,
            shippingAddress: updated.shippingAddress,
            billingAddress: updated.billingAddress,
          },
        },
      });

      return updated;
    });
  }

  /**
   * Transition the order status. The DB trigger enforces valid transitions;
   * we surface a `BadRequestException` for invalid ones.
   *
   * Side effects on specific transitions:
   *  - `CANCELLED` → release reserved inventory + queue notification
   *  - `DELIVERED` → deduct inventory + queue notification
   *    (Customer LTV update is handled by the DB trigger.)
   */
  async updateStatus(id: string, user: OrderAuthUser, dto: UpdateStatusDto) {
    const order = await this.findOne(id, user);

    let updated: any;
    try {
      updated = await this.prisma.order.update({
        where: { id: order.id },
        data: { status: dto.status as any },
        include: { customer: true, distributor: true, items: true },
      });
    } catch (err: any) {
      // Prisma surfaces the trigger's RAISE EXCEPTION as a P2002 / check_violation.
      if (err?.code === 'P2002' || /Invalid order status transition/i.test(err?.message)) {
        throw new BadRequestException(
          `Invalid status transition from ${order.status} to ${dto.status}`,
        );
      }
      throw err;
    }

    // Post-transition side effects.
    if (dto.status === OrderStatusEnum.CANCELLED) {
      for (const item of order.items) {
        await this.inventoryService.releaseStock(
          user.tenantId,
          item.productId,
          item.quantity,
          'ORDER',
          order.id,
        );
      }
      this.queueOrderEvent(user.tenantId, updated, 'order.cancelled').catch((err) =>
        this.logger.error(`Failed to queue order.cancelled notification: ${err.message}`),
      );
    } else if (dto.status === OrderStatusEnum.DELIVERED) {
      for (const item of order.items) {
        await this.inventoryService.deductStock(
          user.tenantId,
          item.productId,
          item.quantity,
          'ORDER',
          order.id,
        );
      }
      this.queueOrderEvent(user.tenantId, updated, 'order.delivered').catch((err) =>
        this.logger.error(`Failed to queue order.delivered notification: ${err.message}`),
      );
    } else if (dto.status === OrderStatusEnum.SHIPPED) {
      this.queueOrderEvent(user.tenantId, updated, 'order.shipped').catch((err) =>
        this.logger.error(`Failed to queue order.shipped notification: ${err.message}`),
      );
    }

    return updated;
  }

  /**
   * Update payment status. On PAID, queue an invoice notification.
   */
  async updatePaymentStatus(id: string, user: OrderAuthUser, dto: UpdatePaymentDto) {
    const order = await this.findOne(id, user);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: dto.paymentStatus as any,
          ...(dto.paymentId !== undefined ? { paymentId: dto.paymentId } : {}),
        },
        include: { customer: true, distributor: true, items: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'UPDATE',
          resourceType: 'Order',
          resourceId: order.id,
          oldValues: { paymentStatus: order.paymentStatus },
          newValues: { paymentStatus: result.paymentStatus },
        },
      });

      return result;
    });

    if (dto.paymentStatus === PaymentStatusEnum.PAID) {
      this.queueOrderEvent(user.tenantId, updated, 'order.paid').catch((err) =>
        this.logger.error(`Failed to queue order.paid notification: ${err.message}`),
      );
    }

    return updated;
  }

  /**
   * Add a single line item to a PENDING order. Recalculates totals.
   */
  async addItem(orderId: string, user: OrderAuthUser, dto: AddItemDto) {
    const order = await this.findOne(orderId, user);
    if (order.status !== OrderStatusEnum.PENDING) {
      throw new BadRequestException('Items can only be added to PENDING orders');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, sku: true, name: true, taxRate: true, tenantId: true },
    });
    if (!product || product.tenantId !== user.tenantId) {
      throw new BadRequestException('Product not found');
    }

    // Reserve inventory for the new item.
    await this.inventoryService.reserveStock(
      user.tenantId,
      dto.productId,
      dto.quantity,
      'ORDER',
      order.id,
    );

    return this.prisma.$transaction(async (tx) => {
      const itemSubtotal = dto.quantity * dto.unitPrice;
      const taxRate = dto.taxRate ?? product.taxRate ?? 0;
      const taxAmount = +(itemSubtotal * (taxRate / 100)).toFixed(2);
      const discountAmount = dto.discountAmount ?? 0;

      const item = await tx.orderItem.create({
        data: {
          tenantId: user.tenantId,
          orderId: order.id,
          productId: dto.productId,
          productSku: product.sku,
          productName: product.name,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          taxRate,
          taxAmount,
          discountAmount,
          subtotal: itemSubtotal,
          total: itemSubtotal + taxAmount - discountAmount,
        },
      });

      await this.recalculateOrderTotals(tx, order.id, user.tenantId);
      return item;
    });
  }

  /**
   * Remove a line item from a PENDING order. Recalculates totals and
   * releases the reserved inventory for the removed item.
   */
  async removeItem(orderId: string, itemId: string, user: OrderAuthUser) {
    const order = await this.findOne(orderId, user);
    if (order.status !== OrderStatusEnum.PENDING) {
      throw new BadRequestException('Items can only be removed from PENDING orders');
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    await this.inventoryService.releaseStock(
      user.tenantId,
      item.productId,
      item.quantity,
      'ORDER',
      order.id,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: itemId } });
      await this.recalculateOrderTotals(tx, order.id, user.tenantId);
      return { success: true };
    });
  }

  /**
   * Cancel an order with an optional reason. Convenience wrapper around
   * `updateStatus(CANCELLED)` that captures the reason in metadata.
   */
  async cancel(id: string, user: OrderAuthUser, dto: CancelOrderDto) {
    const order = await this.findOne(id, user);

    if (dto.reason) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          metadata: { ...(order.metadata as any), cancellationReason: dto.reason },
        },
      });
    }

    return this.updateStatus(id, user, { status: OrderStatusEnum.CANCELLED });
  }

  // ---------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------

  /**
   * Aggregate stats for the orders dashboard:
   *  - totalOrders
   *  - totalRevenue (sum of `total` for DELIVERED + PAID orders)
   *  - avgOrderValue
   *  - byStatus (count grouped by status)
   */
  async getOrderStats(user: OrderAuthUser, query?: QueryOrdersDto) {
    const where = this.buildWhereClause(user.tenantId, query ?? {});

    const [total, revenueAgg, byStatusRaw] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where: { ...where, status: { in: ['DELIVERED', 'PAID' as any] } },
        _sum: { total: true },
        _avg: { total: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRaw) {
      byStatus[row.status] = row._count._all;
    }

    return {
      totalOrders: total,
      totalRevenue: revenueAgg._sum.total ?? 0,
      avgOrderValue: revenueAgg._avg.total ?? 0,
      byStatus,
    };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private calculateTotals(
    items: { quantity: number; unitPrice: number; taxRate?: number; discountAmount?: number }[],
    productById: Map<string, { taxRate: number | null }>,
  ): OrderTotals {
    let subtotal = 0;
    let tax = 0;
    let discount = 0;
    for (const item of items) {
      const lineSubtotal = item.quantity * item.unitPrice;
      const taxRate = item.taxRate ?? productById.get((item as any).productId)?.taxRate ?? 0;
      const lineTax = +(lineSubtotal * (taxRate / 100)).toFixed(2);
      const lineDiscount = item.discountAmount ?? 0;
      subtotal += lineSubtotal;
      tax += lineTax;
      discount += lineDiscount;
    }
    const shipping = 0; // shipping rules handled at checkout
    const total = +(subtotal + tax + shipping - discount).toFixed(2);
    return { subtotal, tax, shipping, discount, total };
  }

  /**
   * Recompute subtotal/tax/discount/total from the live OrderItem rows and
   * write them back to the parent order. Called after addItem/removeItem.
   */
  private async recalculateOrderTotals(tx: any, orderId: string, tenantId: string) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { subtotal: true, taxAmount: true, discountAmount: true, total: true },
    });
    const subtotal = items.reduce((s: number, i: any) => s + i.subtotal, 0);
    const tax = items.reduce((s: number, i: any) => s + (i.taxAmount ?? 0), 0);
    const discount = items.reduce((s: number, i: any) => s + (i.discountAmount ?? 0), 0);
    const total = +(subtotal + tax - discount).toFixed(2);
    await tx.order.update({
      where: { id: orderId },
      data: { subtotal, tax, discount, total },
    });
  }

  private buildWhereClause(tenantId: string, query: QueryOrdersDto): any {
    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.customerId) where.customerId = query.customerId;
    if (query.distributorId) where.distributorId = query.distributorId;

    if (query.search) {
      where.orderNumber = { contains: query.search, mode: 'insensitive' };
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }
    return where;
  }

  private buildOrderBy(query: QueryOrdersDto): any {
    const field =
      query.sortBy === OrderSortBy.TOTAL
        ? 'total'
        : query.sortBy === OrderSortBy.STATUS
          ? 'status'
          : 'createdAt';
    return { [field]: query.sortOrder ?? OrderSortOrder.DESC };
  }

  private generateOrderNumber(): string {
    const d = new Date();
    const ymd =
      d.getFullYear().toString() +
      (d.getMonth() + 1).toString().padStart(2, '0') +
      d.getDate().toString().padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${ymd}-${rand}`;
  }

  /**
   * Fire-and-forget notification dispatch. Maps the order lifecycle event
   * to a notification payload and forwards to {@link NotificationsService}.
   * Failures are logged but never block the order mutation.
   */
  private async queueOrderEvent(
    tenantId: string,
    order: any,
    event: string,
  ): Promise<void> {
    try {
      const customer = order.customer;
      const recipient = customer?.email ?? customer?.phone ?? '';
      if (!recipient) return;

      const subjectMap: Record<string, string> = {
        'order.created': 'Dayjoy Order Confirmation',
        'order.shipped': 'Dayjoy Order Shipped',
        'order.delivered': 'Dayjoy Order Delivered',
        'order.cancelled': 'Dayjoy Order Cancelled',
        'order.paid': 'Dayjoy Payment Received',
      };
      const bodyMap: Record<string, string> = {
        'order.created': `Your order ${order.orderNumber} has been created successfully.`,
        'order.shipped': `Your order ${order.orderNumber} has been shipped.`,
        'order.delivered': `Your order ${order.orderNumber} has been delivered.`,
        'order.cancelled': `Your order ${order.orderNumber} has been cancelled.`,
        'order.paid': `We've received payment for order ${order.orderNumber}.`,
      };

      await this.notificationsService.handleEvent({
        event,
        payload: {
          tenantId,
          customerId: customer?.id,
          orderNumber: order.orderNumber,
          orderId: order.id,
          total: order.total,
          currency: order.currency,
          recipient,
          subject: subjectMap[event] ?? 'Dayjoy Order Update',
          body: bodyMap[event] ?? `Update on order ${order.orderNumber}.`,
        },
      });
    } catch (err) {
      this.logger.warn(
        `queueOrderEvent(${event}) failed for order ${order.id}: ${(err as Error).message}`,
      );
    }
  }
}

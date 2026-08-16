import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../_shared/database/prisma.service';
import {
  UpdateInventoryDto,
  InventoryAdjustmentReason,
} from './dto/update-inventory.dto';
import { QueryInventoryTransactionsDto } from './dto/query-inventory-transactions.dto';
import { SortOrder } from './dto/query-products.dto';
import { AuthUser } from './products.service';

/**
 * Type alias for the Prisma transaction client. When a caller passes one
 * in, the inventory methods participate in the caller's transaction;
 * otherwise they open their own (the historical behaviour).
 */
type TxClient = Prisma.TransactionClient;

/**
 * InventoryService — stock-level management for products.
 *
 * Each Product has at most one Inventory row (1-1, enforced by
 * `Inventory.productId @unique`). The Inventory row tracks:
 *  - `quantity`   — total units physically in stock
 *  - `reserved`   — units held for PENDING/CONFIRMED orders (not yet shipped)
 *  - `lowStockThreshold` — at-or-below triggers a low-stock alert
 *
 * Every stock change (reserve / release / adjust) writes an
 * `InventoryTransaction` row for audit + reconciliation purposes. The
 * `quantityChange` field is signed (positive = stock in, negative = stock out).
 *
 * `reserveStock()` and `releaseStock()` are called internally by the Orders
 * service — they're not exposed via the controller.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  /**
   * Current stock levels for a product (quantity, reserved, available).
   */
  async getInventory(productId: string, user: AuthUser) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { productId },
    });
    if (!inventory || inventory.tenantId !== user.tenantId) {
      await this.assertProductExists(productId, user);
      // Product exists but no inventory row yet — return zero defaults.
      return {
        productId,
        tenantId: user.tenantId,
        quantity: 0,
        reserved: 0,
        available: 0,
        lowStockThreshold: 10,
      };
    }
    return {
      ...inventory,
      available: inventory.quantity - inventory.reserved,
    };
  }

  /**
   * All products at or below the supplied threshold across the tenant.
   * Default threshold: 10 units.
   */
  async getLowStock(user: AuthUser, threshold = 10) {
    const rows = await this.prisma.inventory.findMany({
      where: {
        tenantId: user.tenantId,
        lowStockThreshold: { lte: threshold },
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });
    return rows.filter((r) => r.quantity - r.reserved <= r.lowStockThreshold);
  }

  /**
   * Paginated inventory history for a product (newest first by default).
   */
  async getTransactions(productId: string, user: AuthUser, query: QueryInventoryTransactionsDto) {
    await this.assertProductExists(productId, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { productId, tenantId: user.tenantId };
    if (query.reason) where.reason = query.reason;

    const sortOrder = (query.sortOrder ?? SortOrder.DESC) as Prisma.SortOrder;
    const orderBy: Prisma.InventoryTransactionOrderByWithRelationInput =
      query.sortBy === 'createdAt'
        ? { createdAt: sortOrder }
        : { createdAt: 'desc' };

    const [transactions, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);

    return {
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------

  /**
   * Set the absolute stock level for a product. Computes the delta against
   * the current value, updates the Inventory row, and writes an
   * InventoryTransaction audit row.
   */
  async updateStock(productId: string, user: AuthUser, dto: UpdateInventoryDto) {
    await this.assertProductExists(productId, user);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Upsert the inventory row (defensive — ProductsService.create() already
      // creates one, but legacy products imported outside the service may not
      // have one).
      const current = await tx.inventory.upsert({
        where: { productId },
        update: {},
        create: {
          tenantId: user.tenantId,
          productId,
          quantity: 0,
          reserved: 0,
        },
      });

      const delta = dto.quantity - current.quantity;
      if (delta === 0) {
        return { inventory: { ...current, available: current.quantity - current.reserved }, delta };
      }

      // For stock-out operations, ensure we don't go negative.
      if (current.quantity + delta < 0) {
        throw new BadRequestException(
          `Cannot reduce inventory below zero (current=${current.quantity}, delta=${delta})`,
        );
      }

      const updated = await tx.inventory.update({
        where: { productId },
        data: { quantity: { increment: delta } },
      });

      await tx.inventoryTransaction.create({
        data: {
          tenantId: user.tenantId,
          productId,
          inventoryId: updated.id,
          quantityChange: delta,
          reason: dto.reason as any,
          referenceType: 'ADJUSTMENT',
          notes: dto.notes,
          createdById: user.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'UPDATE',
          resourceType: 'Inventory',
          resourceId: updated.id,
          oldValues: { quantity: current.quantity },
          newValues: { quantity: updated.quantity },
        },
      });

      return {
        inventory: { ...updated, available: updated.quantity - updated.reserved },
        delta,
      };
    });
  }

  /**
   * Reserve `quantity` units for an in-flight order (PENDING / CONFIRMED).
   * Throws if there isn't enough available stock.
   *
   * Called internally by {@link OrdersService.create} — never exposed via
   * the controller.
   *
   * Atomicity: when `tx` is provided, the reserve runs inside the caller's
   * Prisma `$transaction` (so a subsequent order-create failure rolls
   * back the reservation too). When `tx` is omitted, the method opens
   * its own `$transaction` — preserved for backward compatibility with
   * callers that aren't wrapped in one.
   */
  async reserveStock(
    tenantId: string,
    productId: string,
    quantity: number,
    referenceType = 'ORDER',
    referenceId?: string,
    tx?: TxClient,
  ) {
    if (quantity <= 0) return;

    const run = async (client: TxClient) => {
      const inv = await client.inventory.findUnique({ where: { productId } });
      if (!inv || inv.tenantId !== tenantId) {
        throw new BadRequestException(
          `No inventory record for product ${productId}`,
        );
      }

      const available = inv.quantity - inv.reserved;
      if (available < quantity) {
        throw new BadRequestException(
          `Insufficient inventory for product ${productId}: available=${available}, requested=${quantity}`,
        );
      }

      const updated = await client.inventory.update({
        where: { productId },
        data: { reserved: { increment: quantity } },
      });

      await client.inventoryTransaction.create({
        data: {
          tenantId,
          productId,
          inventoryId: updated.id,
          quantityChange: -quantity,
          reason: 'RESERVATION' as any,
          referenceType,
          referenceId,
        },
      });

      return updated;
    };

    // Participate in the caller's transaction when provided; otherwise
    // open one of our own (the historical behaviour).
    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  /**
   * Release previously-reserved units back to the available pool (e.g. when
   * an order is cancelled). Idempotent — capping at the current reserved
   * count so we never go negative.
   */
  async releaseStock(
    tenantId: string,
    productId: string,
    quantity: number,
    referenceType = 'ORDER',
    referenceId?: string,
  ) {
    if (quantity <= 0) return;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const inv = await tx.inventory.findUnique({ where: { productId } });
      if (!inv || inv.tenantId !== tenantId) return null;

      const releaseQty = Math.min(quantity, inv.reserved);
      if (releaseQty === 0) return inv;

      const updated = await tx.inventory.update({
        where: { productId },
        data: { reserved: { decrement: releaseQty } },
      });

      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          productId,
          inventoryId: updated.id,
          quantityChange: releaseQty,
          reason: 'RELEASE' as any,
          referenceType,
          referenceId,
        },
      });

      return updated;
    });
  }

  /**
   * Physically deduct units from `quantity` (called when an order is
   * delivered — reserved units are converted into actual stock-out).
   */
  async deductStock(
    tenantId: string,
    productId: string,
    quantity: number,
    referenceType = 'ORDER',
    referenceId?: string,
  ) {
    if (quantity <= 0) return;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const inv = await tx.inventory.findUnique({ where: { productId } });
      if (!inv || inv.tenantId !== tenantId) return null;

      // Cap the reserved decrement at what's actually reserved (same
      // idempotent-safety pattern as releaseStock above), while quantity
      // is always deducted in full — the units are physically gone.
      const releaseQty = Math.min(quantity, inv.reserved);

      const updated = await tx.inventory.update({
        where: { productId },
        data: {
          quantity: { decrement: quantity },
          reserved: { decrement: releaseQty },
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          productId,
          inventoryId: updated.id,
          quantityChange: -quantity,
          reason: 'SALE' as any,
          referenceType,
          referenceId,
        },
      });

      return updated;
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async assertProductExists(productId: string, user: AuthUser) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, tenantId: true },
    });
    if (!product || product.tenantId !== user.tenantId) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }
}

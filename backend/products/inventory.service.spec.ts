import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { InventoryService } from './inventory.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import {
  UpdateInventoryDto,
  InventoryAdjustmentReason,
} from './dto/update-inventory.dto';

/**
 * The shared mock now carries the `inventory` + `inventoryTransaction`
 * models. It must NOT be spread-extended here: the mock's `$transaction`
 * hands the callback the object it closed over at construction time, so a
 * spread copy would give the test different `vi.fn()`s than the ones the
 * service sees inside a transaction (mocked return values would be lost).
 */
function createExtendedMockPrisma() {
  return createMockPrismaService();
}

const USER = { userId: 'u1', tenantId: 't1', email: 'a@b.c' };

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: ReturnType<typeof createExtendedMockPrisma>;

  beforeEach(async () => {
    prisma = createExtendedMockPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(InventoryService);
  });

  describe('getInventory', () => {
    it('returns the inventory row + computed available field', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        id: 'inv1',
        tenantId: 't1',
        productId: 'p1',
        quantity: 20,
        reserved: 5,
        lowStockThreshold: 10,
      });

      const result = await service.getInventory('p1', USER);
      expect(result.quantity).toBe(20);
      expect(result.reserved).toBe(5);
      expect(result.available).toBe(15);
    });

    it('returns zero defaults when the product exists but has no inventory row', async () => {
      prisma.inventory.findUnique.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', tenantId: 't1' });

      const result = await service.getInventory('p1', USER);
      expect(result.quantity).toBe(0);
      expect(result.available).toBe(0);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.inventory.findUnique.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.getInventory('missing', USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateStock', () => {
    it('sets the absolute stock level + writes an InventoryTransaction row', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', tenantId: 't1' });
      prisma.inventory.upsert.mockResolvedValue({
        id: 'inv1',
        productId: 'p1',
        tenantId: 't1',
        quantity: 10,
        reserved: 0,
      });
      prisma.inventory.update.mockResolvedValue({
        id: 'inv1',
        quantity: 25,
        reserved: 0,
      });
      prisma.inventoryTransaction.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: UpdateInventoryDto = {
        quantity: 25,
        reason: InventoryAdjustmentReason.PURCHASE,
        notes: 'Restock from supplier',
      };

      const result = await service.updateStock('p1', USER, dto);

      expect(result.delta).toBe(15); // 25 - 10
      expect(result.inventory.quantity).toBe(25);

      const txnCall = prisma.inventoryTransaction.create.mock.calls[0][0];
      expect(txnCall.data.quantityChange).toBe(15);
      expect(txnCall.data.reason).toBe('PURCHASE');
      expect(txnCall.data.notes).toBe('Restock from supplier');
    });

    it('refuses to go negative', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', tenantId: 't1' });
      prisma.inventory.upsert.mockResolvedValue({
        id: 'inv1',
        quantity: 5,
        reserved: 0,
      });

      const dto: UpdateInventoryDto = {
        quantity: -1,
        reason: InventoryAdjustmentReason.ADJUSTMENT,
      };

      await expect(service.updateStock('p1', USER, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('reserveStock', () => {
    it('throws when available stock is insufficient', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        id: 'inv1',
        tenantId: 't1',
        productId: 'p1',
        quantity: 5,
        reserved: 2,
      });
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      await expect(
        service.reserveStock('t1', 'p1', 10),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('increments reserved and writes a RESERVATION transaction', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        id: 'inv1',
        tenantId: 't1',
        productId: 'p1',
        quantity: 20,
        reserved: 0,
      });
      prisma.inventory.update.mockResolvedValue({
        id: 'inv1',
        quantity: 20,
        reserved: 5,
      });
      prisma.inventoryTransaction.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const result = await service.reserveStock('t1', 'p1', 5, 'ORDER', 'o1');
      expect(result.reserved).toBe(5);

      const txnCall = prisma.inventoryTransaction.create.mock.calls[0][0];
      expect(txnCall.data.quantityChange).toBe(-5);
      expect(txnCall.data.reason).toBe('RESERVATION');
      expect(txnCall.data.referenceType).toBe('ORDER');
      expect(txnCall.data.referenceId).toBe('o1');
    });
  });

  describe('releaseStock', () => {
    it('caps the release at the current reserved count (never goes negative)', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        id: 'inv1',
        tenantId: 't1',
        productId: 'p1',
        quantity: 20,
        reserved: 3,
      });
      prisma.inventory.update.mockResolvedValue({
        id: 'inv1',
        quantity: 20,
        reserved: 0,
      });
      prisma.inventoryTransaction.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const result = await service.releaseStock('t1', 'p1', 10, 'ORDER', 'o1');
      // Should only release 3 (the actual reserved count), not 10.
      expect(result.reserved).toBe(0);

      const txnCall = prisma.inventoryTransaction.create.mock.calls[0][0];
      expect(txnCall.data.quantityChange).toBe(3);
      expect(txnCall.data.reason).toBe('RELEASE');
    });
  });

  describe('getLowStock', () => {
    it('returns inventory rows where available <= lowStockThreshold', async () => {
      prisma.inventory.findMany.mockResolvedValue([
        {
          id: 'inv1',
          tenantId: 't1',
          productId: 'p1',
          quantity: 5,
          reserved: 0,
          lowStockThreshold: 10,
          product: { id: 'p1', name: 'Widget', sku: 'W-001' },
        },
        {
          id: 'inv2',
          tenantId: 't1',
          productId: 'p2',
          quantity: 100,
          reserved: 0,
          lowStockThreshold: 10,
          product: { id: 'p2', name: 'Gadget', sku: 'G-001' },
        },
      ]);

      const result = await service.getLowStock(USER, 10);

      // Only the row with available (5) <= threshold (10) should be returned.
      expect(result).toHaveLength(1);
      expect(result[0].productId).toBe('p1');
    });
  });
});

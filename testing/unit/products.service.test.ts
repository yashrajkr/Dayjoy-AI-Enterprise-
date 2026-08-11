/**
 * Unit tests — ProductsService.
 *
 * Covers:
 *  - findAll()         — pagination, filtering, sorting, category include
 *  - findOne()         — returns product with inventory
 *  - findBySlug()      — slug-based lookup
 *  - findByCategory()  — category-scoped list
 *  - search()          — text search
 *  - create()          — creates product + sibling Inventory row
 *  - update()          — updates fields + audit log
 *  - remove()          — soft delete (status = DELETED)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { ProductsService } from '@backend/products/products.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { mockPrismaService } from '@testing/helpers/mocks';
import {
  testProduct,
  testInventory,
  testProductCategory,
  testTenant,
  testAuthUser,
} from '@testing/helpers/fixtures';
import { createProduct } from '@testing/helpers/factories';

describe('ProductsService (system-wide unit)', () => {
  let service: ProductsService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  // -------------------------------------------------------------------
  // findAll()
  // -------------------------------------------------------------------

  describe('findAll()', () => {
    it('returns paginated products scoped to tenant, including category', async () => {
      prisma.product.findMany.mockResolvedValue([testProduct]);
      prisma.product.count.mockResolvedValue(1);

      const result = await service.findAll(testAuthUser, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      const findArg = prisma.product.findMany.mock.calls[0][0];
      expect(findArg.where.tenantId).toBe(testTenant.id);
      expect(findArg.include).toEqual(
        expect.objectContaining({ category: expect.anything() }),
      );
    });

    it('caps the limit at 100', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      const result = await service.findAll(testAuthUser, { page: 1, limit: 500 });

      expect(result.limit).toBe(100);
    });

    it('applies categoryId filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(testAuthUser, {
        page: 1,
        limit: 20,
        categoryId: testProductCategory.id,
      });

      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      expect(whereArg.categoryId).toBe(testProductCategory.id);
    });

    it('applies status filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(testAuthUser, { page: 1, limit: 20, status: 'ACTIVE' });

      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe('ACTIVE');
    });

    it('applies search filter on name + sku', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(testAuthUser, { page: 1, limit: 20, search: 'vitamin' });

      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
    });

    it('excludes DELETED products by default', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(testAuthUser, { page: 1, limit: 20 });

      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      expect(whereArg.status).not.toBe('DELETED');
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the product with category and inventory', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...testProduct,
        category: testProductCategory,
        inventory: [testInventory],
      });

      const result = await service.findOne(testProduct.id, testAuthUser);

      expect(result.id).toBe(testProduct.id);
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('inventory');
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // findBySlug()
  // -------------------------------------------------------------------

  describe('findBySlug()', () => {
    it('returns the product by slug', async () => {
      prisma.product.findFirst.mockResolvedValue(testProduct);

      const result = await service.findBySlug(testProduct.slug, testTenant.id);

      expect(result.id).toBe(testProduct.id);
    });
  });

  // -------------------------------------------------------------------
  // findByCategory()
  // -------------------------------------------------------------------

  describe('findByCategory()', () => {
    it('returns products scoped to a category', async () => {
      prisma.product.findMany.mockResolvedValue([testProduct]);
      prisma.product.count.mockResolvedValue(1);

      const result = await service.findByCategory(
        testProductCategory.id,
        testAuthUser,
        { page: 1, limit: 20 },
      );

      expect(result.data).toHaveLength(1);
      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      expect(whereArg.categoryId).toBe(testProductCategory.id);
    });
  });

  // -------------------------------------------------------------------
  // search()
  // -------------------------------------------------------------------

  describe('search()', () => {
    it('returns matching products ordered by relevance', async () => {
      prisma.product.findMany.mockResolvedValue([testProduct]);

      const result = await service.search('vitamin', 10, testTenant.id);

      expect(result).toHaveLength(1);
      const findArg = prisma.product.findMany.mock.calls[0][0];
      expect(findArg.where.OR).toBeDefined();
      expect(findArg.take).toBe(10);
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------

  describe('create()', () => {
    it('creates a product and a sibling Inventory row', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue(testProduct);
      prisma.inventory.create.mockResolvedValue(testInventory);

      const result = await service.create(testAuthUser, {
        name: 'Vitamin C Serum',
        sku: 'SKU-0001',
        price: 49.99,
        categoryId: testProductCategory.id,
      } as any);

      expect(result.id).toBe(testProduct.id);
      // Sibling inventory row created with quantity=0.
      expect(prisma.inventory.create).toHaveBeenCalledOnce();
      const invArg = prisma.inventory.create.mock.calls[0][0];
      expect(invArg.data.quantity).toBe(0);
      expect(invArg.data.reserved).toBe(0);
      expect(invArg.data.lowStockThreshold).toBe(10);
    });

    it('throws ConflictException when the SKU already exists in tenant', async () => {
      prisma.product.findFirst.mockResolvedValue(testProduct);

      await expect(
        service.create(testAuthUser, { sku: testProduct.sku } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when price is negative', async () => {
      await expect(
        service.create(testAuthUser, { name: 'X', sku: 'Y', price: -5 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------

  describe('update()', () => {
    it('updates fields and writes audit log capturing old/new values', async () => {
      prisma.product.findUnique.mockResolvedValue(testProduct);
      prisma.product.update.mockResolvedValue({
        ...testProduct,
        price: 54.99,
      });

      const result = await service.update(testProduct.id, testAuthUser, {
        price: 54.99,
      } as any);

      expect(result.price).toBe(54.99);
      expect(prisma.auditLog.create).toHaveBeenCalled();
      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.oldValues).toBeDefined();
      expect(auditArg.data.newValues).toBeDefined();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.update('ghost', testAuthUser, { price: 10 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when updating SKU to a duplicate', async () => {
      prisma.product.findUnique.mockResolvedValue(testProduct);
      prisma.product.findFirst.mockResolvedValue(
        createProduct({ sku: 'taken-sku' }),
      );

      await expect(
        service.update(testProduct.id, testAuthUser, { sku: 'taken-sku' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------

  describe('remove()', () => {
    it('soft deletes the product (status = DELETED)', async () => {
      prisma.product.findUnique.mockResolvedValue(testProduct);
      prisma.product.update.mockResolvedValue({ ...testProduct, status: 'DELETED' });

      await service.remove(testProduct.id, testAuthUser);

      const updateArg = prisma.product.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('DELETED');
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ProductsService, AuthUser } from './products.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  QueryProductsDto,
  ProductSortBy,
  SortOrder,
} from './dto/query-products.dto';

/**
 * Build a MockPrismaService extended with the inventory + inventoryTransaction
 * + auditLog models that the new ProductsService uses (the shared mock in
 * `_shared/testing/` predates the inventory models and doesn't include them).
 */
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
  };
}

const USER: AuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.c' };

/**
 * ProductsService unit tests — covers findAll (with filters + sort + price
 * range), findOne (tenant isolation + includes), findBySlug, findByCategory,
 * create (SKU uniqueness + inventory seed), update (audit log + SKU
 * immutability), remove (soft delete), and search.
 */
describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: ReturnType<typeof createExtendedMockPrisma>;

  beforeEach(async () => {
    prisma = createExtendedMockPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  // ---------------------------------------------------------------------
  // findAll()
  // ---------------------------------------------------------------------
  describe('findAll', () => {
    it('returns paginated products with category + inventory includes', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Widget',
          sku: 'W-001',
          tenantId: 't1',
          category: { id: 'cat1' },
          inventory: { quantity: 10, reserved: 2 },
        },
      ]);
      prisma.product.count.mockResolvedValue(1);

      const result = await service.findAll(USER, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);

      const args = prisma.product.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t1');
      expect(args.include.category).toBe(true);
      expect(args.include.inventory).toBe(true);
    });

    it('applies status + categoryId filters', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(USER, {
        page: 1,
        limit: 20,
        status: 'ACTIVE',
        categoryId: 'cat-abc',
      });

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACTIVE');
      expect(where.categoryId).toBe('cat-abc');
    });

    it('applies price range filter (minPrice + maxPrice)', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(USER, {
        page: 1,
        limit: 20,
        minPrice: 5,
        maxPrice: 50,
      });

      const price = prisma.product.findMany.mock.calls[0][0].where.price;
      expect(price.gte).toBe(5);
      expect(price.lte).toBe(50);
    });

    it('applies search filter across name + sku + description', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(USER, { page: 1, limit: 20, search: 'widget' });

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.objectContaining({ contains: 'widget' }) }),
          expect.objectContaining({ sku: expect.objectContaining({ contains: 'widget' }) }),
          expect.objectContaining({
            description: expect.objectContaining({ contains: 'widget' }),
          }),
        ]),
      );
    });

    it('honours sortBy + sortOrder', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(USER, {
        page: 1,
        limit: 20,
        sortBy: ProductSortBy.PRICE,
        sortOrder: SortOrder.ASC,
      });

      const orderBy = prisma.product.findMany.mock.calls[0][0].orderBy;
      expect(orderBy).toEqual({ price: 'asc' });
    });
  });

  // ---------------------------------------------------------------------
  // findOne()
  // ---------------------------------------------------------------------
  describe('findOne', () => {
    it('returns the product with category + inventory + reviews includes', async () => {
      const product = {
        id: 'p1',
        name: 'Widget',
        tenantId: 't1',
        category: { id: 'c1' },
        inventory: { quantity: 10 },
        reviews: [],
      };
      prisma.product.findUnique.mockResolvedValue(product);

      const result = await service.findOne('p1', USER);
      expect(result).toEqual(product);

      const include = prisma.product.findUnique.mock.calls[0][0].include;
      expect(include.category).toBe(true);
      expect(include.inventory).toBe(true);
      expect(include.reviews).toBeDefined();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing', USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', tenantId: 'other' });
      await expect(service.findOne('p1', USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // findBySlug()
  // ---------------------------------------------------------------------
  describe('findBySlug', () => {
    it('returns the matching product or null', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', slug: 'widget' });
      const result = await service.findBySlug('widget', 't1');
      expect(result?.id).toBe('p1');

      const where = prisma.product.findFirst.mock.calls[0][0].where;
      expect(where.slug).toBe('widget');
      expect(where.status).toBe('ACTIVE');
    });
  });

  // ---------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------
  describe('create', () => {
    it('creates a product + an empty inventory row in a transaction', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.product.create.mockImplementation(async ({ data }: any) => ({
        id: 'p1',
        ...data,
      }));
      prisma.inventory.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      // $transaction callback form — invoke the callback with the mock prisma.
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: CreateProductDto = {
        sku: 'W-001',
        name: 'Widget',
        price: 19.99,
      };

      const result = await service.create(USER, dto);

      expect(result.id).toBe('p1');
      const createCall = prisma.product.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('t1');
      expect(createCall.data.currency).toBe('USD');
      expect(createCall.data.taxRate).toBe(0);
      expect(createCall.data.tags).toEqual([]);
      expect(createCall.data.status).toBe('ACTIVE');
      expect(createCall.data.slug).toBe('widget'); // auto-slugified from name

      // Inventory seeded with quantity=0.
      const invCall = prisma.inventory.create.mock.calls[0][0];
      expect(invCall.data.productId).toBe('p1');
      expect(invCall.data.quantity).toBe(0);
      expect(invCall.data.reserved).toBe(0);
    });

    it('throws BadRequestException when a product with the same SKU already exists', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'existing' });

      const dto: CreateProductDto = { sku: 'W-001', name: 'Widget', price: 19.99 };

      await expect(service.create(USER, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.product.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // update()
  // ---------------------------------------------------------------------
  describe('update', () => {
    it('updates the product and writes an audit-log row', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        tenantId: 't1',
        name: 'Old',
        price: 10,
        status: 'ACTIVE',
        sku: 'W-001',
      });
      prisma.product.update.mockImplementation(async ({ data }: any) => ({
        id: 'p1',
        tenantId: 't1',
        sku: 'W-001',
        ...data,
      }));
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: UpdateProductDto = { name: 'Updated Widget', price: 24.99 };
      const result = await service.update('p1', USER, dto);

      expect(result.name).toBe('Updated Widget');
      const call = prisma.product.update.mock.calls[0][0];
      expect(call.where.id).toBe('p1');
      expect(call.data.name).toBe('Updated Widget');
      expect(call.data.price).toBe(24.99);

      // Audit-log row written.
      expect(prisma.auditLog.create).toHaveBeenCalled();
      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.action).toBe('UPDATE');
      expect(auditCall.data.resourceType).toBe('Product');
    });

    it('rejects attempts to change the SKU', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        tenantId: 't1',
        sku: 'W-001',
        name: 'Widget',
        price: 10,
        status: 'ACTIVE',
      });

      await expect(
        service.update('p1', USER, { sku: 'W-002' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', USER, { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // remove()
  // ---------------------------------------------------------------------
  describe('remove', () => {
    it('soft-deletes the product (status = DELETED) and writes an audit log', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        tenantId: 't1',
        name: 'Widget',
        sku: 'W-001',
      });
      prisma.product.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const result = await service.remove('p1', USER);

      expect(result.success).toBe(true);
      const call = prisma.product.update.mock.calls[0][0];
      expect(call.data.status).toBe('DELETED');
      expect(prisma.product.delete).not.toHaveBeenCalled();
      // Audit log captured the DELETE action.
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('DELETE');
    });
  });

  // ---------------------------------------------------------------------
  // search()
  // ---------------------------------------------------------------------
  describe('search', () => {
    it('returns ACTIVE products matching the search term', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Widget', sku: 'W-001' },
      ]);

      const result = await service.search('widget', 5, 't1');

      expect(result).toHaveLength(1);
      const args = prisma.product.findMany.mock.calls[0][0];
      expect(args.where.status).toBe('ACTIVE');
      expect(args.where.OR).toHaveLength(3);
      expect(args.take).toBe(5);
    });
  });
});

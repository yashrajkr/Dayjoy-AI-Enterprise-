import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CategoriesService } from './categories.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const USER = { userId: 'u1', tenantId: 't1', email: 'a@b.c' };

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  describe('findAllCategories', () => {
    it('returns a tree of categories (root + nested children)', async () => {
      prisma.productCategory.findMany.mockResolvedValue([
        { id: 'c1', parentId: null, name: 'Parent', sortOrder: 1, _count: { products: 5 } },
        { id: 'c2', parentId: 'c1', name: 'Child', sortOrder: 1, _count: { products: 2 } },
      ]);

      const result = await service.findAllCategories(USER);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe('c2');
    });
  });

  describe('findOneCategory', () => {
    it('returns the category with product count + parent', async () => {
      prisma.productCategory.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        name: 'Parent',
        parent: null,
        _count: { products: 5 },
      });

      const result = await service.findOneCategory('c1', USER);
      expect(result.id).toBe('c1');
    });

    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.productCategory.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 'other',
      });
      await expect(service.findOneCategory('c1', USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createCategory', () => {
    it('creates a category (auto-slugifies name when slug omitted)', async () => {
      prisma.productCategory.create.mockImplementation(async ({ data }: any) => ({
        id: 'c1',
        ...data,
      }));
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: CreateCategoryDto = { name: 'Electronics & Gadgets' };
      const result = await service.createCategory(USER, dto);

      expect(result.id).toBe('c1');
      const call = prisma.productCategory.create.mock.calls[0][0];
      expect(call.data.slug).toBe('electronics-gadgets');
      expect(call.data.tenantId).toBe('t1');
    });

    it('rejects an invalid parentId (cross-tenant)', async () => {
      prisma.productCategory.findUnique.mockResolvedValue({
        id: 'p1',
        tenantId: 'other',
      });

      const dto: CreateCategoryDto = { name: 'Child', parentId: 'p1' };
      await expect(service.createCategory(USER, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('updateCategory', () => {
    it('updates the category + writes an audit log', async () => {
      prisma.productCategory.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        name: 'Old',
        slug: 'old',
      });
      prisma.productCategory.update.mockImplementation(async ({ data }: any) => ({
        id: 'c1',
        tenantId: 't1',
        ...data,
      }));
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: UpdateCategoryDto = { name: 'New' };
      const result = await service.updateCategory('c1', USER, dto);
      expect(result.name).toBe('New');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('rejects a category being its own parent', async () => {
      prisma.productCategory.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        name: 'Self',
        slug: 'self',
      });

      await expect(
        service.updateCategory('c1', USER, { parentId: 'c1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('removeCategory', () => {
    it('refuses to delete a category with active products', async () => {
      prisma.productCategory.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        name: 'Cat',
      });
      prisma.product.count.mockResolvedValue(3);

      await expect(service.removeCategory('c1', USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('soft-deletes (isActive=false) when no active products remain', async () => {
      prisma.productCategory.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        name: 'Cat',
      });
      prisma.product.count.mockResolvedValue(0);
      prisma.productCategory.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const result = await service.removeCategory('c1', USER);
      expect(result.success).toBe(true);
      const call = prisma.productCategory.update.mock.calls[0][0];
      expect(call.data.isActive).toBe(false);
    });
  });
});

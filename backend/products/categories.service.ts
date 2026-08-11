import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuthUser } from './products.service';

/**
 * CategoriesService — hierarchical product-category CRUD.
 *
 * Categories form a self-referential tree via `parentId`. The tree is
 * materialised lazily on `findAllCategories()` by fetching all rows for the
 * tenant and stitching them in-memory (N categories → O(N) stitch). For
 * tenants with thousands of categories a recursive CTE would be better, but
 * the typical catalog has < 100 categories.
 *
 * Soft-delete is via the `isActive = false` flag (the SQL schema has a
 * `deleted_at` column but the Prisma model surfaces it as `isActive`).
 */
@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return all categories for the tenant as a tree (root nodes have
   * `parentId = null`, children nested under `children[]`).
   */
  async findAllCategories(user: AuthUser) {
    const all = await this.prisma.productCategory.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } },
    });

    const byParent = new Map<string | null, any[]>();
    for (const c of all) {
      const key = c.parentId ?? null;
      const list = byParent.get(key) ?? [];
      list.push({ ...c, children: [] });
      byParent.set(key, list);
    }

    const build = (parent: string | null): any[] => {
      const nodes = byParent.get(parent) ?? [];
      for (const n of nodes) n.children = build(n.id);
      return nodes;
    };

    return build(null);
  }

  /**
   * Single category with its direct product count.
   */
  async findOneCategory(id: string, user: AuthUser) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true } },
        parent: true,
      },
    });
    if (!category || category.tenantId !== user.tenantId) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async createCategory(user: AuthUser, dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findUnique({
        where: { id: dto.parentId },
        select: { id: true, tenantId: true },
      });
      if (!parent || parent.tenantId !== user.tenantId) {
        throw new BadRequestException('Invalid parentId');
      }
    }

    const slug = dto.slug ?? this.slugify(dto.name);

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.create({
        data: {
          tenantId: user.tenantId,
          parentId: dto.parentId,
          name: dto.name,
          slug,
          description: dto.description,
          imageUrl: dto.imageUrl,
          sortOrder: dto.sortOrder ?? 0,
          isActive: true,
          metadata: dto.metadata,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'INSERT',
          resourceType: 'ProductCategory',
          resourceId: category.id,
          newValues: { name: category.name, slug: category.slug },
        },
      });

      return category;
    });
  }

  async updateCategory(id: string, user: AuthUser, dto: UpdateCategoryDto) {
    const category = await this.findOneCategory(id, user);

    if (dto.parentId && dto.parentId === category.id) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productCategory.update({
        where: { id: category.id },
        data: {
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.metadata !== undefined ? { metadata: dto.metadata } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'UPDATE',
          resourceType: 'ProductCategory',
          resourceId: category.id,
          oldValues: { name: category.name, slug: category.slug },
          newValues: { name: updated.name, slug: updated.slug },
        },
      });

      return updated;
    });
  }

  /**
   * Soft delete — sets `isActive = false`. Refuses if any products are
   * still assigned to the category (caller must reassign or delete them
   * first).
   */
  async removeCategory(id: string, user: AuthUser) {
    const category = await this.findOneCategory(id, user);

    const productCount = await this.prisma.product.count({
      where: {
        categoryId: id,
        tenantId: user.tenantId,
        status: { not: 'DELETED' },
      },
    });
    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${productCount} active products — reassign or delete them first`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productCategory.update({
        where: { id: category.id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'DELETE',
          resourceType: 'ProductCategory',
          resourceId: category.id,
          oldValues: { name: category.name },
        },
      });
    });

    return { success: true };
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }
}

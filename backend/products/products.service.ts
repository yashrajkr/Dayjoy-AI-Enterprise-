import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../_shared/database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  QueryProductsDto,
  ProductSortBy,
  SortOrder,
} from './dto/query-products.dto';

/**
 * Authenticated user shape injected via `@CurrentUser()`.
 *
 * Matches the JwtStrategy `validate()` return value
 * (`{ userId, tenantId, email, jti }`).
 */
export interface AuthUser {
  userId: string;
  tenantId: string;
  email?: string;
  jti?: string;
}

/**
 * Default low-stock threshold applied when a new Inventory row is created
 * without an explicit value. Mirrors the SQL schema default of 10.
 */
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

/**
 * ProductsService — product catalog CRUD + search.
 *
 * Lifecycle of a product:
 *  1. `create()` writes a `Product` row + a sibling `Inventory` row
 *     (quantity=0, reserved=0). Stock is then adjusted via the inventory
 *     endpoints exposed by {@link InventoryService}.
 *  2. `update()` writes the new field values + an `AuditLog` row capturing
 *     old/new values for compliance.
 *  3. `remove()` is a soft-delete: sets `status = DELETED`. Hard deletes are
 *     never performed from the application layer (DB retention policy owns it).
 *
 * All read methods accept an `AuthUser` so tenant isolation is enforced.
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --------- ----------------------------------------------------------
  // Read
  // --------- ----------------------------------------------------------

  /**
   * Paginated, filtered, sorted list of products with `category` and
   * `inventory` includes.
   */
  async findAll(user: AuthUser, query: QueryProductsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(user.tenantId, query);
    const orderBy = this.buildOrderBy(query);

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: true,
          inventory: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Single product with category, inventory, last 10 reviews, and images.
   * Tenant-scoped — throws `NotFoundException` if the product doesn't exist
   * or belongs to a different tenant.
   */
  async findOne(id: string, user: AuthUser) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        inventory: true,
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!product || product.tenantId !== user.tenantId) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /**
   * Public catalog lookup by slug. Returns `null` (not an exception) when
   * the slug doesn't resolve so callers can render a 404 page without
   * try/catch.
   */
  async findBySlug(slug: string, tenantId: string) {
    return this.prisma.product.findFirst({
      where: { tenantId, slug, status: 'ACTIVE' },
      include: {
        category: true,
        inventory: true,
      },
    });
  }

  /**
   * Products in a specific category. Paginated. Includes inventory.
   */
  async findByCategory(categoryId: string, user: AuthUser, query: QueryProductsDto) {
    return this.findAll(user, { ...query, categoryId });
  }

  /**
   * Full-text-style search across name + sku + description. Used by the
   * public `GET /api/products/search` endpoint (no auth required).
   *
   * Implementation note: Prisma 6 doesn't expose Postgres `tsvector @@`
   * operators directly. We use `contains: { mode: 'insensitive' }` which
   * resolves to `ILIKE` — functionally equivalent for short search strings.
   * For larger catalogs, switch to a `$queryRaw` backed FTS query that
   * leverages the `search_vector` GIN index.
   */
  async search(query: string, limit = 10, tenantId?: string) {
    const where: any = {
      status: 'ACTIVE',
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    };
    if (tenantId) where.tenantId = tenantId;

    return this.prisma.product.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        inventory: true,
      },
    });
  }

  // --------- ----------------------------------------------------------
  // Write
  // --------- ----------------------------------------------------------

  /**
   * Create a new product + an empty Inventory row (quantity=0, reserved=0).
   * SKU uniqueness is enforced per-tenant (DB unique index).
   */
  async create(user: AuthUser, dto: CreateProductDto) {
    // Pre-check SKU uniqueness so we can return a friendly BadRequest instead
    // of leaking the Prisma P2002 unique-violation error.
    const existing = await this.prisma.product.findFirst({
      where: { tenantId: user.tenantId, sku: dto.sku },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Product with this SKU already exists');
    }

    const slug = dto.slug ?? this.slugify(dto.name);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const product = await tx.product.create({
        data: {
          tenantId: user.tenantId,
          categoryId: dto.categoryId,
          sku: dto.sku,
          name: dto.name,
          slug,
          description: dto.description,
          shortDescription: dto.shortDescription,
          price: dto.price,
          cost: dto.cost,
          compareAtPrice: dto.compareAtPrice,
          currency: dto.currency ?? 'USD',
          taxRate: dto.taxRate ?? 0,
          images: dto.images,
          attributes: dto.attributes,
          tags: dto.tags ?? [],
          status: (dto.status as any) ?? 'ACTIVE',
        },
        include: { category: true, inventory: true },
      });

      // Seed an empty inventory row. Stock is then adjusted via the
      // PATCH /api/products/:id/inventory endpoint.
      await tx.inventory.create({
        data: {
          tenantId: user.tenantId,
          productId: product.id,
          quantity: 0,
          reserved: 0,
          lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'INSERT',
          resourceType: 'Product',
          resourceId: product.id,
          newValues: { name: product.name, sku: product.sku, price: product.price } as any,
        },
      });

      return product;
    });
  }

  /**
   * Update product fields. Writes an audit-log row capturing the diff.
   * SKU is immutable (DB unique index would block changes anyway).
   */
  async update(id: string, user: AuthUser, dto: UpdateProductDto) {
    const product = await this.findOne(id, user);
    const { sku: _sku, ...updates } = dto as any;

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const result = await tx.product.update({
        where: { id: product.id },
        data: {
          ...(updates.categoryId !== undefined ? { categoryId: updates.categoryId } : {}),
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.slug !== undefined ? { slug: updates.slug } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.shortDescription !== undefined
            ? { shortDescription: updates.shortDescription }
            : {}),
          ...(updates.price !== undefined ? { price: updates.price } : {}),
          ...(updates.cost !== undefined ? { cost: updates.cost } : {}),
          ...(updates.compareAtPrice !== undefined ? { compareAtPrice: updates.compareAtPrice } : {}),
          ...(updates.currency !== undefined ? { currency: updates.currency } : {}),
          ...(updates.taxRate !== undefined ? { taxRate: updates.taxRate } : {}),
          ...(updates.images !== undefined ? { images: updates.images } : {}),
          ...(updates.attributes !== undefined ? { attributes: updates.attributes } : {}),
          ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
          ...(updates.status !== undefined ? { status: updates.status as any } : {}),
        },
        include: { category: true, inventory: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'UPDATE',
          resourceType: 'Product',
          resourceId: product.id,
          oldValues: {
            name: product.name,
            price: product.price,
            status: product.status,
          } as any,
          newValues: {
            name: result.name,
            price: result.price,
            status: result.status,
          } as any,
        },
      });

      return result;
    });

    return updated;
  }

  /**
   * Soft delete — sets `status = DELETED`. Hard deletes are never performed
   * from the application layer (the retention policy owns physical deletion).
   */
  async remove(id: string, user: AuthUser) {
    const product = await this.findOne(id, user);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.product.update({
        where: { id: product.id },
        data: { status: 'DELETED' as any },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'DELETE',
          resourceType: 'Product',
          resourceId: product.id,
          oldValues: { name: product.name, sku: product.sku } as any,
        },
      });
    });

    return { success: true };
  }

  // --------- ----------------------------------------------------------
  // Helpers
  // --------- ----------------------------------------------------------

  private buildWhereClause(tenantId: string, query: QueryProductsDto): any {
    const where: any = { tenantId };

    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {};
      if (query.minPrice !== undefined) where.price.gte = query.minPrice;
      if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildOrderBy(query: QueryProductsDto): any {
    const field =
      query.sortBy === ProductSortBy.PRICE
        ? 'price'
        : query.sortBy === ProductSortBy.NAME
          ? 'name'
          : 'createdAt';
    return { [field]: query.sortOrder ?? SortOrder.DESC };
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

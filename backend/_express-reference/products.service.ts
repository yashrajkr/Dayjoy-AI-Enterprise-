/**
 * Products Service
 */

import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler';

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string;
  price: number;
  cost?: number;
  categoryId?: string;
  inventoryCount?: number;
  tenantId: string;
}

export async function listProducts(tenantId: string, page = 1, limit = 20, categoryId?: string, status?: string) {
  const skip = (page - 1) * limit;
  const where: any = { tenant_id: tenantId };
  if (categoryId) where.category_id = categoryId;
  if (status) where.status = status;

  const [products, total] = await Promise.all([
    prisma.product.findMany({ where, include: { category: true }, skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.product.count({ where }),
  ]);
  return { data: products, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getProductById(id: string, tenantId: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: { category: true } });
  if (!product || product.tenant_id !== tenantId) throw new NotFoundError('Product');
  return product;
}

export async function createProduct(input: CreateProductInput) {
  if (input.price < 0) throw new ValidationError('Price must be non-negative');
  if (input.cost && input.cost < 0) throw new ValidationError('Cost must be non-negative');

  const existing = await prisma.product.findFirst({ where: { tenant_id: input.tenantId, sku: input.sku } });
  if (existing) throw new Error('Product with this SKU already exists');

  return prisma.product.create({
    data: {
      tenant_id: input.tenantId,
      sku: input.sku,
      name: input.name,
      description: input.description,
      price: input.price,
      cost: input.cost,
      category_id: input.categoryId,
      inventory_count: input.inventoryCount ?? 0,
      status: 'ACTIVE',
    },
  });
}

export async function updateProduct(id: string, tenantId: string, input: Partial<CreateProductInput>) {
  await getProductById(id, tenantId);
  const updateData: any = { ...input };
  delete updateData.tenantId;
  return prisma.product.update({ where: { id }, data: updateData });
}

export async function deleteProduct(id: string, tenantId: string) {
  await getProductById(id, tenantId);
  await prisma.product.update({ where: { id }, data: { status: 'DELETED' } });
  return { success: true };
}

export async function listCategories(tenantId: string) {
  return prisma.productCategory.findMany({ where: { tenant_id: tenantId }, orderBy: { sort_order: 'asc' } });
}

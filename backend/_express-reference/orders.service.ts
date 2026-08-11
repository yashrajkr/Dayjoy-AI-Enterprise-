/**
 * Orders Service
 */

import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../middleware/errorHandler';

export interface CreateOrderInput {
  customerId: string;
  distributorId?: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
  tenantId: string;
}

export async function listOrders(tenantId: string, page = 1, limit = 20, status?: string) {
  const skip = (page - 1) * limit;
  const where: any = { tenant_id: tenantId };
  if (status) where.status = status;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, include: { customer: true, items: { include: { product: true } } }, skip, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.order.count({ where }),
  ]);
  return { data: orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getOrderById(id: string, tenantId: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: { customer: true, distributor: true, items: { include: { product: true } } } });
  if (!order || order.tenant_id !== tenantId) throw new NotFoundError('Order');
  return order;
}

export async function createOrder(input: CreateOrderInput) {
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  return prisma.order.create({
    data: {
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      distributor_id: input.distributorId,
      order_number: `ORD-${Date.now()}`,
      status: 'PENDING',
      subtotal,
      tax,
      total,
      items: {
        create: input.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
          total: item.quantity * item.unitPrice,
        })),
      },
    },
    include: { items: true },
  });
}

export async function updateOrderStatus(id: string, tenantId: string, status: string) {
  await getOrderById(id, tenantId);
  return prisma.order.update({ where: { id }, data: { status: status as any } });
}

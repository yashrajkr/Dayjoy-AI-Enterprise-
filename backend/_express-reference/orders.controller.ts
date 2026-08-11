/**
 * Orders Controller
 */

import { Request, Response } from 'express';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler';
import { listOrders, getOrderById, createOrder, updateOrderStatus } from './orders.service';
import { AuthRequest } from '../../middleware/authenticate';

export const listOrdersController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit, status } = req.query;
  const result = await listOrders(req.tenantId!, Number(page) || 1, Number(limit) || 20, status as string);
  res.json(result);
});

export const getOrderController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const order = await getOrderById(req.params.id, req.tenantId!);
  res.json({ data: order });
});

export const createOrderController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { customerId, distributorId, items } = req.body;
  if (!customerId || !items?.length) throw new ValidationError('Customer and items required');
  const order = await createOrder({ customerId, distributorId, items, tenantId: req.tenantId! });
  res.status(201).json({ data: order, message: 'Order created' });
});

export const updateOrderStatusController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.body;
  if (!status) throw new ValidationError('Status required');
  const order = await updateOrderStatus(req.params.id, req.tenantId!, status);
  res.json({ data: order, message: 'Order updated' });
});

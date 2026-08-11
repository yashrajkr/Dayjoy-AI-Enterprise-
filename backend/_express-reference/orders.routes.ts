/**
 * Orders Routes
 */

import { Router } from 'express';
import { listOrdersController, getOrderController, createOrderController, updateOrderStatusController } from './orders.controller';
import { authenticate, requirePermission } from '../../middleware/authenticate';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

ordersRouter.get('/', requirePermission('orders', 'read'), listOrdersController);
ordersRouter.get('/:id', requirePermission('orders', 'read'), getOrderController);
ordersRouter.post('/', requirePermission('orders', 'create'), createOrderController);
ordersRouter.put('/:id/status', requirePermission('orders', 'update'), updateOrderStatusController);

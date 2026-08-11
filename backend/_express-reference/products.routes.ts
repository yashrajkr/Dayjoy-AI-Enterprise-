/**
 * Products Routes
 */

import { Router } from 'express';
import { listProductsController, getProductController, createProductController, updateProductController, deleteProductController, listCategoriesController } from './products.controller';
import { authenticate, requirePermission } from '../../middleware/authenticate';

export const productsRouter = Router();
productsRouter.use(authenticate);

// GET /api/products - List products
productsRouter.get('/', requirePermission('products', 'read'), listProductsController);

// GET /api/products/categories - List categories
productsRouter.get('/categories', requirePermission('products', 'read'), listCategoriesController);

// GET /api/products/:id - Get product
productsRouter.get('/:id', requirePermission('products', 'read'), getProductController);

// POST /api/products - Create product
productsRouter.post('/', requirePermission('products', 'create'), createProductController);

// PUT /api/products/:id - Update product
productsRouter.put('/:id', requirePermission('products', 'update'), updateProductController);

// DELETE /api/products/:id - Delete product
productsRouter.delete('/:id', requirePermission('products', 'delete'), deleteProductController);

/**
 * Products Controller
 */

import { Request, Response } from 'express';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler';
import { listProducts, getProductById, createProduct, updateProduct, deleteProduct, listCategories } from './products.service';
import { AuthRequest } from '../../middleware/authenticate';

export const listProductsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit, categoryId, status } = req.query;
  const result = await listProducts(req.tenantId!, Number(page) || 1, Number(limit) || 20, categoryId as string, status as string);
  res.json(result);
});

export const getProductController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const product = await getProductById(req.params.id, req.tenantId!);
  res.json({ data: product });
});

export const createProductController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sku, name, description, price, cost, categoryId, inventoryCount } = req.body;
  if (!sku || !name || price === undefined) throw new ValidationError('SKU, name, and price required');
  const product = await createProduct({ sku, name, description, price, cost, categoryId, inventoryCount, tenantId: req.tenantId! });
  res.status(201).json({ data: product, message: 'Product created' });
});

export const updateProductController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const product = await updateProduct(req.params.id, req.tenantId!, req.body);
  res.json({ data: product, message: 'Product updated' });
});

export const deleteProductController = asyncHandler(async (req: AuthRequest, res: Response) => {
  await deleteProduct(req.params.id, req.tenantId!);
  res.json({ message: 'Product deleted' });
});

export const listCategoriesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const categories = await listCategories(req.tenantId!);
  res.json({ data: categories });
});

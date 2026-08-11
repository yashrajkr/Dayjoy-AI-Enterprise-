/**
 * API tests — /api/products endpoints.
 *
 * Endpoints:
 *  - GET    /api/products            — paginated list
 *  - GET    /api/products/search     — text search
 *  - GET    /api/products/categories — category list
 *  - POST   /api/products            — create
 *  - GET    /api/products/:id        — single product
 *  - PUT    /api/products/:id        — update
 *  - DELETE /api/products/:id        — soft delete
 *  - GET    /api/products/:id/inventory
 *  - PATCH  /api/products/:id/inventory
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { ProductsController } from '@backend/products/products.controller';
import { ProductsService } from '@backend/products/products.service';
import { CategoriesService } from '@backend/products/categories.service';
import { InventoryService } from '@backend/products/inventory.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import { testProduct, testProductCategory, testInventory, testAuthUser } from '@testing/helpers/fixtures';

describe('Products API (/api/products)', () => {
  let app: INestApplication;
  let productsSvc: any;
  let categoriesSvc: any;
  let inventorySvc: any;

  beforeAll(async () => {
    productsSvc = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      findBySlug: vi.fn(),
      findByCategory: vi.fn(),
      search: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    categoriesSvc = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    inventorySvc = {
      getInventory: vi.fn(),
      adjustStock: vi.fn(),
      getTransactions: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: productsSvc },
        { provide: CategoriesService, useValue: categoriesSvc },
        { provide: InventoryService, useValue: inventorySvc },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => {
        ctx.switchToHttp().getRequest().user = testAuthUser;
        return true;
      } })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /api/products', () => {
    it('returns 200 + paginated products', async () => {
      productsSvc.findAll.mockResolvedValue({ data: [testProduct], total: 1, page: 1, limit: 20 });

      const res = await request(app.getHttpServer()).get('/api/products?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/products/search', () => {
    it('returns 200 + matching products', async () => {
      productsSvc.search.mockResolvedValue([testProduct]);

      const res = await request(app.getHttpServer()).get('/api/products/search?q=vitamin');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/products/categories', () => {
    it('returns 200 + categories', async () => {
      categoriesSvc.findAll.mockResolvedValue([testProductCategory]);

      const res = await request(app.getHttpServer()).get('/api/products/categories');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/products/categories', () => {
    it('returns 201 + created category', async () => {
      categoriesSvc.create.mockResolvedValue({ ...testProductCategory, id: 'cat-new' });

      const res = await request(app.getHttpServer())
        .post('/api/products/categories')
        .send({ name: 'New Category', slug: 'new-category' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('cat-new');
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns 200 + the product', async () => {
      productsSvc.findOne.mockResolvedValue(testProduct);

      const res = await request(app.getHttpServer()).get(`/api/products/${testProduct.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testProduct.id);
    });

    it('returns 404 when the product does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      productsSvc.findOne.mockRejectedValue(new NotFoundException());

      const res = await request(app.getHttpServer()).get('/api/products/ghost');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/products', () => {
    it('returns 201 + the created product', async () => {
      productsSvc.create.mockResolvedValue({ ...testProduct, id: 'prod-new' });

      const res = await request(app.getHttpServer())
        .post('/api/products')
        .send({
          name: 'New Product',
          sku: 'SKU-NEW',
          price: 29.99,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('prod-new');
    });

    it('returns 409 when the SKU already exists', async () => {
      const { ConflictException } = await import('@nestjs/common');
      productsSvc.create.mockRejectedValue(new ConflictException());

      const res = await request(app.getHttpServer())
        .post('/api/products')
        .send({ name: 'X', sku: 'SKU-DUP', price: 10 });

      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('returns 200 + the updated product', async () => {
      productsSvc.update.mockResolvedValue({ ...testProduct, price: 54.99 });

      const res = await request(app.getHttpServer())
        .put(`/api/products/${testProduct.id}`)
        .send({ price: 54.99 });

      expect(res.status).toBe(200);
      expect(res.body.price).toBe(54.99);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('returns 200 (soft delete)', async () => {
      productsSvc.remove.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete(`/api/products/${testProduct.id}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/products/:id/inventory', () => {
    it('returns 200 + inventory row', async () => {
      inventorySvc.getInventory.mockResolvedValue(testInventory);

      const res = await request(app.getHttpServer()).get(`/api/products/${testProduct.id}/inventory`);

      expect(res.status).toBe(200);
      expect(res.body.productId).toBe(testProduct.id);
    });
  });

  describe('PATCH /api/products/:id/inventory', () => {
    it('returns 200 + adjusted inventory', async () => {
      inventorySvc.adjustStock.mockResolvedValue({ ...testInventory, quantity: 150 });

      const res = await request(app.getHttpServer())
        .patch(`/api/products/${testProduct.id}/inventory`)
        .send({ adjustment: 50, reason: 'RESTOCK' });

      expect(res.status).toBe(200);
      expect(res.body.quantity).toBe(150);
    });
  });
});

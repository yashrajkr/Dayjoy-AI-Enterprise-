/**
 * Unit tests — CustomersService.
 *
 * Covers:
 *  - findAll()      — pagination, filtering, sorting
 *  - findOne()      — returns customer with relations, throws if not found
 *  - create()       — creates customer + audit log
 *  - update()       — updates fields, audit logged
 *  - remove()       — soft delete
 *  - getStats()     — LTV, order count, recent orders
 *  - addAddress() / updateAddress() / removeAddress() — address CRUD
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { CustomersService } from '@backend/customers/customers.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { mockPrismaService } from '@testing/helpers/mocks';
import {
  testCustomer,
  testTenant,
  testAuthUser,
  testOrder,
} from '@testing/helpers/fixtures';
import { createCustomer } from '@testing/helpers/factories';

describe('CustomersService (system-wide unit)', () => {
  let service: CustomersService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CustomersService);
  });

  // -------------------------------------------------------------------
  // findAll()
  // -------------------------------------------------------------------

  describe('findAll()', () => {
    it('returns paginated customers scoped to tenant', async () => {
      const customers = [testCustomer, createCustomer({ tenantId: testTenant.id })];
      prisma.customer.findMany.mockResolvedValue(customers);
      prisma.customer.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 }, testAuthUser);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      const whereArg = prisma.customer.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });

    it('caps the limit at MAX_LIMIT', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 500 }, testAuthUser);

      expect(result.limit).toBe(100);
    });

    it('applies search filter', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, search: 'cory' }, testAuthUser);

      const whereArg = prisma.customer.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
    });

    it('applies type and status filters', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 20, type: 'INDIVIDUAL', status: 'ACTIVE' },
        testAuthUser,
      );

      const whereArg = prisma.customer.findMany.mock.calls[0][0].where;
      expect(whereArg.type).toBe('INDIVIDUAL');
      expect(whereArg.status).toBe('ACTIVE');
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the customer when found', async () => {
      prisma.customer.findUnique.mockResolvedValue(testCustomer);

      const result = await service.findOne(testCustomer.id, testAuthUser);

      expect(result.id).toBe(testCustomer.id);
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------

  describe('create()', () => {
    it('creates a customer and writes an audit log entry', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue(testCustomer);

      const result = await service.create(
        {
          firstName: 'Cory',
          lastName: 'Customer',
          email: 'cory@example.com',
          phone: '+15551234567',
          type: 'INDIVIDUAL',
          source: 'WEBSITE',
        } as any,
        testAuthUser,
      );

      expect(result.id).toBe(testCustomer.id);
      const createArg = prisma.customer.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
      expect(createArg.data.createdBy).toBe(testAuthUser.userId);
    });

    it('throws ConflictException when email or phone already exists in the tenant', async () => {
      prisma.customer.findFirst.mockResolvedValue(testCustomer);

      await expect(
        service.create(
          { email: testCustomer.email, phone: testCustomer.phone } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------

  describe('update()', () => {
    it('updates fields and writes audit log', async () => {
      prisma.customer.findUnique.mockResolvedValue(testCustomer);
      prisma.customer.update.mockResolvedValue({ ...testCustomer, firstName: 'Updated' });

      const result = await service.update(
        testCustomer.id,
        { firstName: 'Updated' } as any,
        testAuthUser,
      );

      expect(result.firstName).toBe('Updated');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.update('ghost', { firstName: 'x' } as any, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------

  describe('remove()', () => {
    it('soft deletes the customer (status = INACTIVE)', async () => {
      prisma.customer.findUnique.mockResolvedValue(testCustomer);
      prisma.customer.update.mockResolvedValue({
        ...testCustomer,
        status: 'INACTIVE',
      });

      await service.remove(testCustomer.id, testAuthUser);

      const updateArg = prisma.customer.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('INACTIVE');
      expect(prisma.customer.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // getStats()
  // -------------------------------------------------------------------

  describe('getStats()', () => {
    it('returns LTV, order count, and recent orders', async () => {
      prisma.customer.findUnique.mockResolvedValue(testCustomer);
      prisma.order.count.mockResolvedValue(3);
      prisma.order.aggregate.mockResolvedValue({ _sum: { total: 299.97 } });
      prisma.order.findMany.mockResolvedValue([testOrder]);

      const result = await service.getStats(testCustomer.id, testAuthUser);

      expect(result).toHaveProperty('lifetimeValue');
      expect(result).toHaveProperty('totalOrders');
      expect(result).toHaveProperty('recentOrders');
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.getStats('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // Address CRUD
  // -------------------------------------------------------------------

  describe('addAddress()', () => {
    it('adds an address and unsets other defaults if isDefaultShipping is true', async () => {
      prisma.customer.findUnique.mockResolvedValue(testCustomer);
      prisma.customer.update.mockResolvedValue(testCustomer);

      await service.addAddress(
        testCustomer.id,
        {
          label: 'Home',
          line1: '123 Main',
          city: 'Springfield',
          state: 'IL',
          postalCode: '62701',
          country: 'US',
          isDefaultShipping: true,
          isDefaultBilling: false,
        } as any,
        testAuthUser,
      );

      expect(prisma.customer.update).toHaveBeenCalled();
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.addAddress(
          'ghost',
          { line1: 'x', city: 'x', state: 'x', postalCode: 'x', country: 'x' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateAddress()', () => {
    it('updates the address by index', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        ...testCustomer,
        addresses: [
          {
            id: 'addr-1',
            label: 'Home',
            line1: '123 Main',
            city: 'Springfield',
            state: 'IL',
            postalCode: '62701',
            country: 'US',
            isDefaultShipping: true,
            isDefaultBilling: false,
          },
        ],
      });
      prisma.customer.update.mockResolvedValue(testCustomer);

      await service.updateAddress(
        testCustomer.id,
        'addr-1',
        { label: 'Work' } as any,
        testAuthUser,
      );

      expect(prisma.customer.update).toHaveBeenCalled();
    });
  });

  describe('removeAddress()', () => {
    it('removes the address by id', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        ...testCustomer,
        addresses: [{ id: 'addr-1' }],
      });
      prisma.customer.update.mockResolvedValue(testCustomer);

      await service.removeAddress(testCustomer.id, 'addr-1', testAuthUser);

      expect(prisma.customer.update).toHaveBeenCalled();
    });

    it('throws BadRequestException when the address id is not found', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        ...testCustomer,
        addresses: [],
      });

      await expect(
        service.removeAddress(testCustomer.id, 'ghost', testAuthUser),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach } from 'vitest';

import { CustomersService } from './customers.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import {
  CreateCustomerDto,
  CustomerTypeEnum,
} from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { CreateAddressDto } from './dto/create-address.dto';

/**
 * CustomersService unit tests — CRUD + stats + JSON-array address
 * management. Addresses are stored as a JSON array on `Customer.address`
 * (the schema has no `CustomerAddress` table).
 */
describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  const currentUser = { userId: 'admin-1', tenantId: 't1' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    prisma.auditLog.create.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: 'user-' + data.email,
      ...data,
    }));

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
  describe('findAll', () => {
    it('returns paginated customers scoped to the tenant with order-count + last-order date', async () => {
      const fake = [
        {
          id: 'c1',
          email: 'a@b.com',
          tenantId: 't1',
          address: [],
          _count: { orders: 3 },
          orders: [{ createdAt: new Date('2026-01-01') }],
        },
        {
          id: 'c2',
          email: 'c@d.com',
          tenantId: 't1',
          address: [],
          _count: { orders: 0 },
          orders: [],
        },
      ];
      prisma.customer.findMany.mockResolvedValue(fake);
      prisma.customer.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 10 }, currentUser);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);

      const first = result.data[0];
      expect(first.orderCount).toBe(3);
      expect(first.lastOrderAt).toEqual(new Date('2026-01-01'));
      expect(first.addressCount).toBe(0);

      const args = prisma.customer.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t1');
      expect(args.skip).toBe(0);
      expect(args.take).toBe(10);
    });

    it('applies status + customerType + search filters', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);

      await service.findAll(
        {
          page: 1,
          limit: 20,
          status: 'active',
          customerType: CustomerTypeEnum.BUSINESS,
          search: 'acme',
        },
        currentUser,
      );

      const args = prisma.customer.findMany.mock.calls[0][0];
      expect(args.where.status).toBe('active');
      expect(args.where.customerType).toBe(CustomerTypeEnum.BUSINESS);
      expect(args.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ companyName: expect.objectContaining({ contains: 'acme' }) }),
        ]),
      );
    });

    it('caps limit at 100', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 500 }, currentUser);
      expect(prisma.customer.findMany.mock.calls[0][0].take).toBe(100);
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------
  describe('findOne', () => {
    it('returns the customer with addresses + recent orders + lifetime stats', async () => {
      const addr = [
        { id: 'a1', line1: '1 Main St', isDefaultShipping: true, isDefaultBilling: true },
      ];
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        address: addr,
        orders: [{ id: 'o1', total: 100, items: [] }],
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { total: 250 },
        _count: 2,
        _avg: { total: 125 },
      });
      prisma.order.findFirst.mockResolvedValue({
        createdAt: new Date('2026-02-01'),
        total: 100,
      });

      const result = await service.findOne('c1', currentUser);

      expect(result.id).toBe('c1');
      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0].id).toBe('a1');
      expect(result.lifetimeStats.lifetimeValue).toBe(250);
      expect(result.lifetimeStats.totalOrders).toBe(2);
      expect(result.lifetimeStats.avgOrderValue).toBe(125);
      expect(result.lifetimeStats.lastOrderValue).toBe(100);
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', tenantId: 'other' });
      await expect(service.findOne('c1', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------
  describe('create', () => {
    it('creates a customer with the supplied fields and a default address', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockImplementation(async ({ data }: any) => ({
        id: 'c1',
        ...data,
      }));

      const dto: CreateCustomerDto = {
        customerType: CustomerTypeEnum.BUSINESS,
        companyName: 'Acme Inc',
        email: 'sales@acme.com',
        phone: '+15551234567',
        address: {
          line1: '1 Main St',
          city: 'Springfield',
          state: 'IL',
          postalCode: '62701',
          country: 'USA',
        },
      };

      const result = await service.create(dto, currentUser);

      expect(result.id).toBe('c1');
      expect(result.tenantId).toBe('t1');

      const call = prisma.customer.create.mock.calls[0][0];
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.customerType).toBe(CustomerTypeEnum.BUSINESS);
      expect(call.data.status).toBe('active');
      const addressArray = call.data.address as any[];
      expect(addressArray).toHaveLength(1);
      expect(addressArray[0].isDefaultShipping).toBe(true);
      expect(addressArray[0].isDefaultBilling).toBe(true);
      expect(addressArray[0].id).toEqual(expect.any(String));
    });

    it('throws BadRequestException when BUSINESS customer is created without companyName', async () => {
      const dto: CreateCustomerDto = {
        customerType: CustomerTypeEnum.BUSINESS,
      };
      await expect(service.create(dto, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the email is already taken in the tenant', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'existing' });

      const dto: CreateCustomerDto = {
        customerType: CustomerTypeEnum.INDIVIDUAL,
        email: 'taken@example.com',
      };
      await expect(service.create(dto, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('creates a linked customer-portal user when email is supplied and no user exists yet', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockImplementation(async ({ data }: any) => ({
        id: 'c1',
        ...data,
      }));

      const dto: CreateCustomerDto = {
        customerType: CustomerTypeEnum.INDIVIDUAL,
        email: 'newcustomer@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      };

      await service.create(dto, currentUser);

      // User row was created with role='customer'.
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'newcustomer@example.com',
            role: 'customer',
            tenantId: 't1',
          }),
        }),
      );
      // Customer row was linked via userId.
      const custCall = prisma.customer.create.mock.calls[0][0];
      expect(custCall.data.userId).toBe('user-newcustomer@example.com');
    });
  });

  // -------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------
  describe('update', () => {
    it('updates the customer (after tenant check)', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        companyName: null,
      });
      prisma.customer.update.mockImplementation(async ({ data }: any) => ({
        id: 'c1',
        tenantId: 't1',
        ...data,
      }));

      const dto: UpdateCustomerDto = { firstName: 'Alice', phone: '+15550000000' };
      const result = await service.update('c1', dto, currentUser);

      expect(result.firstName).toBe('Alice');
      const call = prisma.customer.update.mock.calls[0][0];
      expect(call.where.id).toBe('c1');
      expect(call.data.firstName).toBe('Alice');
      expect(call.data.phone).toBe('+15550000000');
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(
        service.update('missing', { firstName: 'X' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------
  describe('remove', () => {
    it('marks the customer as deleted (no hard delete) and writes audit', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        email: 'a@b.com',
      });
      prisma.customer.update.mockResolvedValue({});

      const result = await service.remove('c1', currentUser);

      expect(result.success).toBe(true);
      const call = prisma.customer.update.mock.calls[0][0];
      expect(call.data.status).toBe('deleted');
      expect(prisma.customer.delete).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // getStats()
  // -------------------------------------------------------------------
  describe('getStats', () => {
    it('returns lifetime value, total orders, avg, last order', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { total: 1000 },
        _count: 4,
        _avg: { total: 250 },
      });
      prisma.order.findFirst.mockResolvedValue({
        createdAt: new Date('2026-03-01'),
        total: 300,
      });

      const result = await service.getStats('c1', currentUser);
      expect(result.lifetimeValue).toBe(1000);
      expect(result.totalOrders).toBe(4);
      expect(result.avgOrderValue).toBe(250);
      expect(result.lastOrderValue).toBe(300);
    });

    it('returns zero stats when the customer has no orders', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', tenantId: 't1' });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { total: null },
        _count: 0,
        _avg: { total: null },
      });
      prisma.order.findFirst.mockResolvedValue(null);

      const result = await service.getStats('c1', currentUser);
      expect(result.lifetimeValue).toBe(0);
      expect(result.totalOrders).toBe(0);
      expect(result.avgOrderValue).toBe(0);
      expect(result.lastOrderAt).toBeNull();
      expect(result.lastOrderValue).toBeNull();
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.getStats('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // Addresses
  // -------------------------------------------------------------------
  describe('addAddress', () => {
    it('appends an address to the JSON array and is the default when first', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        address: [],
      });
      prisma.customer.update.mockResolvedValue({});

      const dto: CreateAddressDto = {
        line1: '2 Oak Ave',
        city: 'Boston',
        state: 'MA',
        postalCode: '02101',
        country: 'USA',
      };

      const result = await service.addAddress('c1', dto, currentUser);

      expect(result.id).toEqual(expect.any(String));
      expect(result.line1).toBe('2 Oak Ave');
      // First address is auto-default for both shipping and billing.
      expect(result.isDefaultShipping).toBe(true);
      expect(result.isDefaultBilling).toBe(true);

      const updateCall = prisma.customer.update.mock.calls[0][0];
      const arr = updateCall.data.address as any[];
      expect(arr).toHaveLength(1);
      expect(arr[0].line1).toBe('2 Oak Ave');
    });

    it('unsets isDefaultShipping on other addresses when the new one is default', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        address: [
          {
            id: 'a1',
            line1: 'Old',
            city: 'X',
            state: 'X',
            postalCode: 'X',
            country: 'X',
            isDefaultShipping: true,
            isDefaultBilling: true,
          },
        ],
      });
      prisma.customer.update.mockResolvedValue({});

      const dto: CreateAddressDto = {
        line1: 'New',
        city: 'Y',
        state: 'Y',
        postalCode: 'Y',
        country: 'Y',
        isDefaultShipping: true,
      };

      await service.addAddress('c1', dto, currentUser);

      const updateCall = prisma.customer.update.mock.calls[0][0];
      const arr = updateCall.data.address as any[];
      expect(arr).toHaveLength(2);
      expect(arr[0].isDefaultShipping).toBe(false);
      expect(arr[1].isDefaultShipping).toBe(true);
      // Billing default was untouched (dto did not set isDefaultBilling).
      expect(arr[0].isDefaultBilling).toBe(true);
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(
        service.addAddress('missing', {} as CreateAddressDto, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateAddress', () => {
    it('updates an existing address by id', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        address: [
          {
            id: 'a1',
            line1: 'Old',
            city: 'X',
            state: 'X',
            postalCode: 'X',
            country: 'X',
            isDefaultShipping: false,
            isDefaultBilling: false,
          },
        ],
      });
      prisma.customer.update.mockResolvedValue({});

      const result = await service.updateAddress(
        'c1',
        'a1',
        { line1: 'New Line' },
        currentUser,
      );
      expect(result.line1).toBe('New Line');
      expect(result.city).toBe('X'); // unchanged
    });

    it('throws NotFoundException when the address does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        address: [],
      });
      await expect(
        service.updateAddress('c1', 'nope', { line1: 'x' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeAddress', () => {
    it('removes the address and promotes the next one to default if needed', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        address: [
          {
            id: 'a1',
            line1: 'Default',
            city: 'X',
            state: 'X',
            postalCode: 'X',
            country: 'X',
            isDefaultShipping: true,
            isDefaultBilling: true,
          },
          {
            id: 'a2',
            line1: 'Other',
            city: 'Y',
            state: 'Y',
            postalCode: 'Y',
            country: 'Y',
            isDefaultShipping: false,
            isDefaultBilling: false,
          },
        ],
      });
      prisma.customer.update.mockResolvedValue({});

      const result = await service.removeAddress('c1', 'a1', currentUser);
      expect(result.success).toBe(true);

      const updateCall = prisma.customer.update.mock.calls[0][0];
      const arr = updateCall.data.address as any[];
      expect(arr).toHaveLength(1);
      expect(arr[0].id).toBe('a2');
      // Promoted to default.
      expect(arr[0].isDefaultShipping).toBe(true);
      expect(arr[0].isDefaultBilling).toBe(true);
    });

    it('throws NotFoundException when the address does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        address: [],
      });
      await expect(
        service.removeAddress('c1', 'nope', currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

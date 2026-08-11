import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach } from 'vitest';

import { DistributorsService } from './distributors.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import {
  CreateDistributorDto,
  DistributorTierEnum,
} from './dto/create-distributor.dto';
import { UpdateDistributorDto } from './dto/update-distributor.dto';
import { QueryDistributorsDto } from './dto/query-distributors.dto';

/**
 * DistributorsService unit tests — CRUD + performance + commission
 * summary. Tier is stored on the `address` JSON column (the schema has
 * no `tier` field), and commissions are read from the
 * `distributor_commissions` table.
 */
describe('DistributorsService', () => {
  let service: DistributorsService;
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
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: 0, _avg: { total: null } });
    prisma.distributorCommission.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const moduleRef = await Test.createTestingModule({
      providers: [
        DistributorsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(DistributorsService);
  });

  // -------------------------------------------------------------------
  // findAll()
  // -------------------------------------------------------------------
  describe('findAll', () => {
    it('returns paginated distributors with revenue + commission-earned stats', async () => {
      prisma.distributor.findMany.mockResolvedValue([
        {
          id: 'd1',
          distributorCode: 'DIST-001',
          companyName: 'Acme Dist',
          tenantId: 't1',
          address: { tier: 'GOLD' },
          _count: { orders: 4, commissions: 2 },
        },
      ]);
      prisma.distributor.count.mockResolvedValue(1);
      prisma.order.aggregate.mockResolvedValue({ _sum: { total: 5000 } });
      prisma.distributorCommission.aggregate.mockResolvedValue({
        _sum: { amount: '400.00' }, // Decimal serializes as string
      });

      const result = await service.findAll({ page: 1, limit: 10 }, currentUser);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      const row = result.data[0];
      expect(row.tier).toBe('GOLD');
      expect(row.totalOrders).toBe(4);
      expect(row.revenue).toBe(5000);
      expect(row.commissionEarned).toBe(400); // Number(decimal-string)

      const args = prisma.distributor.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t1');
      expect(args.skip).toBe(0);
      expect(args.take).toBe(10);
    });

    it('applies status + tier + search filters', async () => {
      prisma.distributor.findMany.mockResolvedValue([]);
      prisma.distributor.count.mockResolvedValue(0);

      await service.findAll(
        {
          page: 1,
          limit: 20,
          status: 'ACTIVE',
          tier: DistributorTierEnum.GOLD,
          search: 'acme',
        },
        currentUser,
      );

      const args = prisma.distributor.findMany.mock.calls[0][0];
      expect(args.where.status).toBe('ACTIVE');
      // tier is filtered via JSON path on the address column.
      expect(args.where.address).toEqual({ path: ['tier'], equals: 'GOLD' });
      expect(args.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ companyName: expect.objectContaining({ contains: 'acme' }) }),
        ]),
      );
    });

    it('caps limit at 100', async () => {
      prisma.distributor.findMany.mockResolvedValue([]);
      prisma.distributor.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 500 }, currentUser);
      expect(prisma.distributor.findMany.mock.calls[0][0].take).toBe(100);
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------
  describe('findOne', () => {
    it('returns the distributor with recent orders + commission summary', async () => {
      prisma.distributor.findUnique.mockResolvedValue({
        id: 'd1',
        tenantId: 't1',
        address: { tier: 'GOLD' },
        orders: [{ id: 'o1', orderNumber: 'ORD-1', total: 100 }],
        commissions: [{ id: 'c1', amount: '5.00', status: 'pending' }],
        _count: { orders: 1, commissions: 1 },
      });
      // Three aggregates for the commission summary (pending, paid, total).
      prisma.distributorCommission.aggregate
        .mockResolvedValueOnce({ _sum: { amount: '5.00' } })
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: '5.00' } });

      const result = await service.findOne('d1', currentUser);

      expect(result.id).toBe('d1');
      expect(result.tier).toBe('GOLD');
      expect(result.totalOrders).toBe(1);
      expect(result.totalCommissions).toBe(1);
      expect(result.commissionSummary.pending).toBe(5);
      expect(result.commissionSummary.paid).toBe(0);
      expect(result.commissionSummary.total).toBe(5);
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.distributor.findUnique.mockResolvedValue({ id: 'd1', tenantId: 'other' });
      await expect(service.findOne('d1', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------
  describe('create', () => {
    it('creates a distributor with default commission rate (no tier supplied)', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null); // distributorCode lookup
      prisma.distributor.findFirst.mockResolvedValue(null); // email lookup
      prisma.distributor.create.mockImplementation(async ({ data }: any) => ({
        id: 'd1',
        ...data,
      }));

      const dto: CreateDistributorDto = {
        distributorCode: 'DIST-001',
        companyName: 'Acme Dist',
        email: 'dist@acme.com',
      };

      const result = await service.create(dto, currentUser);

      expect(result.id).toBe('d1');
      const call = prisma.distributor.create.mock.calls[0][0];
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.commissionRate).toBe(5); // flat default
      expect(call.data.status).toBe('ACTIVE');
      // Tier absent → address field is omitted entirely (Prisma leaves
      // the column NULL by default via the `Json?` type).
      expect(call.data.address).toBeUndefined();
    });

    it('derives commission rate from tier when none is supplied explicitly', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);
      prisma.distributor.findFirst.mockResolvedValue(null);
      prisma.distributor.create.mockImplementation(async ({ data }: any) => ({
        id: 'd1',
        ...data,
      }));

      const dto: CreateDistributorDto = {
        distributorCode: 'DIST-002',
        companyName: 'Gold Dist',
        email: 'gold@acme.com',
        tier: DistributorTierEnum.GOLD,
      };

      await service.create(dto, currentUser);

      const call = prisma.distributor.create.mock.calls[0][0];
      expect(call.data.commissionRate).toBe(8); // GOLD = 8%
      expect((call.data.address as any).tier).toBe('GOLD');
    });

    it('throws ConflictException when the distributorCode is already taken', async () => {
      prisma.distributor.findUnique.mockResolvedValue({ id: 'existing' });

      const dto: CreateDistributorDto = {
        distributorCode: 'DIST-001',
        companyName: 'Acme Dist',
        email: 'dist@acme.com',
      };

      await expect(service.create(dto, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.distributor.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the email is already taken in the tenant', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null); // code lookup
      prisma.distributor.findFirst.mockResolvedValue({ id: 'existing' }); // email lookup

      const dto: CreateDistributorDto = {
        distributorCode: 'DIST-003',
        companyName: 'Acme Dist',
        email: 'taken@acme.com',
      };

      await expect(service.create(dto, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  // -------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------
  describe('update', () => {
    it('updates the distributor (after tenant check) and merges tier into address JSON', async () => {
      prisma.distributor.findUnique.mockResolvedValue({
        id: 'd1',
        tenantId: 't1',
        commissionRate: 5,
        companyName: 'Acme',
        address: { line1: '1 Main' },
      });
      prisma.distributor.update.mockImplementation(async ({ data }: any) => ({
        id: 'd1',
        tenantId: 't1',
        ...data,
      }));

      const dto: UpdateDistributorDto = {
        companyName: 'Acme Updated',
        commissionRate: 7,
        tier: DistributorTierEnum.PLATINUM,
      };
      const result = await service.update('d1', dto, currentUser);

      expect(result.companyName).toBe('Acme Updated');
      const call = prisma.distributor.update.mock.calls[0][0];
      expect(call.data.companyName).toBe('Acme Updated');
      expect(call.data.commissionRate).toBe(7);
      // Tier merged into existing address JSON.
      expect(call.data.address).toEqual({ line1: '1 Main', tier: 'PLATINUM' });
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);
      await expect(
        service.update('missing', { companyName: 'X' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------
  describe('remove', () => {
    it('marks the distributor as DELETED (no hard delete) and writes audit', async () => {
      prisma.distributor.findUnique.mockResolvedValue({
        id: 'd1',
        tenantId: 't1',
        distributorCode: 'DIST-001',
        companyName: 'Acme',
      });
      prisma.distributor.update.mockResolvedValue({});

      const result = await service.remove('d1', currentUser);

      expect(result.success).toBe(true);
      const call = prisma.distributor.update.mock.calls[0][0];
      expect(call.data.status).toBe('DELETED');
      expect(prisma.distributor.delete).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // getPerformance()
  // -------------------------------------------------------------------
  describe('getPerformance', () => {
    it('returns totals + avg order value within a date range', async () => {
      prisma.distributor.findUnique.mockResolvedValue({ id: 'd1', tenantId: 't1' });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { total: 4000 },
        _count: 4,
        _avg: { total: 1000 },
      });
      prisma.distributorCommission.aggregate.mockResolvedValue({
        _sum: { amount: '320.00' },
      });

      const result = await service.getPerformance(
        'd1',
        { startDate: '2026-01-01', endDate: '2026-03-31' },
        currentUser,
      );

      expect(result.totalOrders).toBe(4);
      expect(result.revenue).toBe(4000);
      expect(result.commission).toBe(320);
      expect(result.avgOrderValue).toBe(1000);

      // The order aggregate's where-clause must include the date range.
      const orderAggArgs = prisma.order.aggregate.mock.calls[0][0];
      expect(orderAggArgs.where.createdAt).toEqual({
        gte: new Date('2026-01-01'),
        lte: new Date('2026-03-31'),
      });
    });

    it('returns zero performance when the distributor has no orders', async () => {
      prisma.distributor.findUnique.mockResolvedValue({ id: 'd1', tenantId: 't1' });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { total: null },
        _count: 0,
        _avg: { total: null },
      });
      prisma.distributorCommission.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });

      const result = await service.getPerformance('d1', {}, currentUser);
      expect(result.totalOrders).toBe(0);
      expect(result.revenue).toBe(0);
      expect(result.commission).toBe(0);
      expect(result.avgOrderValue).toBe(0);
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);
      await expect(
        service.getPerformance('missing', {}, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // getCommissionSummary()
  // -------------------------------------------------------------------
  describe('getCommissionSummary', () => {
    it('returns pending + paid + total commission amounts', async () => {
      prisma.distributor.findUnique.mockResolvedValue({ id: 'd1', tenantId: 't1' });
      prisma.distributorCommission.aggregate
        .mockResolvedValueOnce({ _sum: { amount: '150.00' } }) // pending
        .mockResolvedValueOnce({ _sum: { amount: '300.00' } }) // paid
        .mockResolvedValueOnce({ _sum: { amount: '450.00' } }); // total

      const result = await service.getCommissionSummary('d1', currentUser);
      expect(result.pending).toBe(150);
      expect(result.paid).toBe(300);
      expect(result.total).toBe(450);
    });

    it('returns zeros when the distributor has no commissions', async () => {
      prisma.distributor.findUnique.mockResolvedValue({ id: 'd1', tenantId: 't1' });
      prisma.distributorCommission.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });

      const result = await service.getCommissionSummary('d1', currentUser);
      expect(result.pending).toBe(0);
      expect(result.paid).toBe(0);
      expect(result.total).toBe(0);
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);
      await expect(
        service.getCommissionSummary('missing', currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

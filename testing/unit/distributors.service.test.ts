/**
 * Unit tests — DistributorsService.
 *
 * Covers:
 *  - findAll()              — pagination, filtering, sorting
 *  - findOne()              — returns distributor with relations
 *  - create()               — creates distributor, sets tier-based commission rate
 *  - update()               — updates fields, recomputes commission on tier change
 *  - remove()               — soft delete (status = DELETED)
 *  - getPerformance()       — sales, orders, commission aggregates
 *  - getCommissionSummary() — commission breakdown by period
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { DistributorsService } from '@backend/distributors/distributors.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { mockPrismaService } from '@testing/helpers/mocks';
import {
  testDistributor,
  testTenant,
  testAuthUser,
} from '@testing/helpers/fixtures';
import { createDistributor } from '@testing/helpers/factories';

describe('DistributorsService (system-wide unit)', () => {
  let service: DistributorsService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
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

  describe('findAll()', () => {
    it('returns paginated distributors scoped to tenant', async () => {
      const dists = [testDistributor, createDistributor({ tenantId: testTenant.id })];
      prisma.distributor.findMany.mockResolvedValue(dists);
      prisma.distributor.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 }, testAuthUser);

      expect(result.data).toHaveLength(2);
      const whereArg = prisma.distributor.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });

    it('caps the limit at 100', async () => {
      prisma.distributor.findMany.mockResolvedValue([]);
      prisma.distributor.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 500 }, testAuthUser);

      expect(result.limit).toBe(100);
    });

    it('applies tier filter', async () => {
      prisma.distributor.findMany.mockResolvedValue([]);
      prisma.distributor.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, tier: 'GOLD' }, testAuthUser);

      const whereArg = prisma.distributor.findMany.mock.calls[0][0].where;
      expect(whereArg.tier).toBe('GOLD');
    });

    it('applies search filter on company / contact name', async () => {
      prisma.distributor.findMany.mockResolvedValue([]);
      prisma.distributor.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, search: 'acme' }, testAuthUser);

      const whereArg = prisma.distributor.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the distributor with relations', async () => {
      prisma.distributor.findUnique.mockResolvedValue(testDistributor);

      const result = await service.findOne(testDistributor.id, testAuthUser);

      expect(result.id).toBe(testDistributor.id);
    });

    it('throws NotFoundException when not found', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------

  describe('create()', () => {
    it('creates a distributor with the tier-derived default commission rate', async () => {
      prisma.distributor.findFirst.mockResolvedValue(null);
      prisma.distributor.create.mockResolvedValue(testDistributor);

      const result = await service.create(
        {
          companyName: 'Acme',
          contactName: 'Dana',
          email: 'dana@acme.test',
          phone: '+15557651234',
          tier: 'GOLD',
        } as any,
        testAuthUser,
      );

      expect(result.id).toBe(testDistributor.id);
      const createArg = prisma.distributor.create.mock.calls[0][0];
      // GOLD tier → 8% default commission.
      expect(createArg.data.commissionRate).toBe(8);
      expect(createArg.data.tenantId).toBe(testTenant.id);
    });

    it('throws ConflictException when email already exists in tenant', async () => {
      prisma.distributor.findFirst.mockResolvedValue(testDistributor);

      await expect(
        service.create(
          { companyName: 'dup', email: testDistributor.email } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('writes an audit log entry on create', async () => {
      prisma.distributor.findFirst.mockResolvedValue(null);
      prisma.distributor.create.mockResolvedValue(testDistributor);

      await service.create(
        { companyName: 'Acme', contactName: 'Dana', tier: 'GOLD' } as any,
        testAuthUser,
      );

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------

  describe('update()', () => {
    it('updates fields and writes audit log', async () => {
      prisma.distributor.findUnique.mockResolvedValue(testDistributor);
      prisma.distributor.update.mockResolvedValue({
        ...testDistributor,
        companyName: 'Updated Co',
      });

      const result = await service.update(
        testDistributor.id,
        { companyName: 'Updated Co' } as any,
        testAuthUser,
      );

      expect(result.companyName).toBe('Updated Co');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('recomputes commission rate when the tier changes', async () => {
      prisma.distributor.findUnique.mockResolvedValue(testDistributor); // GOLD = 8
      prisma.distributor.update.mockResolvedValue({ ...testDistributor, tier: 'PLATINUM' });

      await service.update(
        testDistributor.id,
        { tier: 'PLATINUM' } as any,
        testAuthUser,
      );

      const updateArg = prisma.distributor.update.mock.calls[0][0];
      // PLATINUM tier → 12% default commission.
      expect(updateArg.data.commissionRate).toBe(12);
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);

      await expect(
        service.update('ghost', { companyName: 'x' } as any, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------

  describe('remove()', () => {
    it('soft deletes the distributor (status = DELETED)', async () => {
      prisma.distributor.findUnique.mockResolvedValue(testDistributor);
      prisma.distributor.update.mockResolvedValue({
        ...testDistributor,
        status: 'DELETED',
      });

      await service.remove(testDistributor.id, testAuthUser);

      const updateArg = prisma.distributor.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('DELETED');
      expect(prisma.distributor.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // getPerformance()
  // -------------------------------------------------------------------

  describe('getPerformance()', () => {
    it('returns sales, orders, and commission aggregates for a date range', async () => {
      prisma.distributor.findUnique.mockResolvedValue(testDistributor);
      prisma.order.aggregate.mockResolvedValue({ _sum: { total: 5000 } });
      prisma.order.count.mockResolvedValue(10);
      prisma.distributorCommission.aggregate.mockResolvedValue({
        _sum: { amount: 400 },
      });

      const result = await service.getPerformance(
        testDistributor.id,
        { startDate: '2025-01-01', endDate: '2025-06-30' } as any,
        testAuthUser,
      );

      expect(result).toHaveProperty('totalSales');
      expect(result).toHaveProperty('totalOrders');
      expect(result).toHaveProperty('totalCommission');
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);

      await expect(
        service.getPerformance(
          'ghost',
          { startDate: '2025-01-01', endDate: '2025-06-30' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // getCommissionSummary()
  // -------------------------------------------------------------------

  describe('getCommissionSummary()', () => {
    it('returns commission summary grouped by status', async () => {
      prisma.distributor.findUnique.mockResolvedValue(testDistributor);
      prisma.distributorCommission.groupBy.mockResolvedValue([
        { _sum: { amount: 300 }, status: 'PENDING', _count: 3 },
        { _sum: { amount: 100 }, status: 'PAID', _count: 1 },
      ]);

      const result = await service.getCommissionSummary(testDistributor.id, testAuthUser);

      expect(result).toBeDefined();
      expect(prisma.distributorCommission.groupBy).toHaveBeenCalled();
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      prisma.distributor.findUnique.mockResolvedValue(null);

      await expect(
        service.getCommissionSummary('ghost', testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

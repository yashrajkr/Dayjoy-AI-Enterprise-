import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AdminService } from './admin.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserRoleDto, UserRole, AssignRoleDto } from './dto/update-user-role.dto';
import { CreateTenantDto, TenantStatus, UpdateTenantDto } from './dto/tenant.dto';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { QueryAuditLogsDto, QueryAccessLogsDto } from './dto/query-logs.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { AuthUser } from '../ai/auth-user';

/**
 * Helper — extends the shared mock with the additional Prisma models
 * AdminService touches. Done inline so we don't have to modify the
 * shared `_shared/testing/mock-prisma.service.ts` (off-limits per the
 * task scope).
 */
function createAdminMockPrisma() {
  const mock = createMockPrismaService();
  Object.assign(mock, {
    tenant: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'tnt-1' }),
      update: vi.fn().mockResolvedValue({ id: 'tnt-1' }),
    },
    employee: { count: vi.fn().mockResolvedValue(0) },
    userSession: { count: vi.fn().mockResolvedValue(0) },
    accessLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    integration: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: 'i1' }),
    },
  });
  return mock as ReturnType<typeof createMockPrismaService> & {
    tenant: any;
    employee: any;
    userSession: any;
    accessLog: any;
    integration: any;
  };
}

/**
 * AdminService unit tests.
 *
 * Covers:
 *  - findAllUsers (pagination + filters + tenant scoping)
 *  - findOneUser (tenant isolation / 404)
 *  - updateUserRole (denormalized role column update)
 *  - assignRole (UserRole join table — ConflictException on duplicate)
 *  - removeRole (idempotent — no-op on missing assignment)
 *  - findAllTenants / findOneTenant / createTenant / updateTenant
 *  - getTenantConfig / updateTenantConfig (upsert) / deleteTenantConfig
 *  - getSystemStats (10-way Promise.all + Employee fallback)
 *  - getAuditLogs / getAccessLogs (pagination + filters)
 *  - getIntegrations / updateIntegration (tenant isolation / 404)
 */
describe('AdminService', () => {
  let service: AdminService;
  // `prisma` is typed `any` because we extend the shared mock inline
  // with `tenant`, `employee`, `userSession`, `accessLog`, `integration`
  // (none are on the static mock type).
  let prisma: any;
  const user: AuthUser = { userId: 'u1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createAdminMockPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  // -------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------

  describe('findAllUsers', () => {
    it('returns paginated users with role + status filters', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
      prisma.user.count.mockResolvedValue(1);

      const query: QueryUsersDto = {
        page: 1,
        limit: 10,
        role: 'ADMIN',
        status: 'ACTIVE',
        search: 'alice',
      };
      const result = await service.findAllUsers(query, user);

      expect(result.data).toHaveLength(1);
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(where.role).toBe('ADMIN');
      expect(where.status).toBe('ACTIVE');
      expect(where.OR).toBeDefined();
    });
  });

  describe('findOneUser', () => {
    it('returns the user with all relations', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u2',
        tenantId: 't1',
        employee: null,
        userRoles: [],
      });
      const result = await service.findOneUser('u2', user);
      expect(result.id).toBe('u2');
    });

    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', tenantId: 'other' });
      await expect(service.findOneUser('u2', user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateUserRole', () => {
    it('updates the denormalized role column', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', tenantId: 't1' });
      prisma.user.update.mockResolvedValue({ id: 'u2', role: 'MANAGER' });

      const dto: UpdateUserRoleDto = { role: UserRole.MANAGER };
      const result = await service.updateUserRole('u2', dto, user);

      expect(result.role).toBe('MANAGER');
      const call = prisma.user.update.mock.calls[0][0];
      expect(call.data.role).toBe(UserRole.MANAGER);
    });
  });

  describe('assignRole', () => {
    it('creates a UserRole join row with assignedBy from currentUser', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', tenantId: 't1' });
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', tenantId: 't1' });
      prisma.userRole.create.mockResolvedValue({ id: 'ur1', roleId: 'r1' });

      const dto: AssignRoleDto = { roleId: 'r1' };
      const result = await service.assignRole('u2', dto, user);

      expect(result.roleId).toBe('r1');
      const call = prisma.userRole.create.mock.calls[0][0];
      expect(call.data.userId).toBe('u2');
      expect(call.data.roleId).toBe('r1');
      expect(call.data.assignedBy).toBe('u1');
    });

    it('throws ConflictException on duplicate assignment (P2002)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', tenantId: 't1' });
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', tenantId: 't1' });
      const err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      prisma.userRole.create.mockRejectedValue(err);

      await expect(
        service.assignRole('u2', { roleId: 'r1' }, user),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when the role is not in the tenant', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', tenantId: 't1' });
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', tenantId: 'other' });

      await expect(
        service.assignRole('u2', { roleId: 'r1' }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeRole', () => {
    it('is idempotent — P2025 (not found) is treated as success', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', tenantId: 't1' });
      const err = Object.assign(new Error('Record not found'), { code: 'P2025' });
      prisma.userRole.delete.mockRejectedValue(err);

      const result = await service.removeRole('u2', 'r1', user);
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // Tenants
  // -------------------------------------------------------------------

  describe('findAllTenants', () => {
    it('returns tenants with relation counts', async () => {
      prisma.tenant.findMany.mockResolvedValue([{ id: 'tnt-1', _count: {} }]);
      const result = await service.findAllTenants();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOneTenant', () => {
    it('throws NotFoundException when tenant does not exist', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.findOneTenant('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createTenant', () => {
    it('creates a tenant with default ACTIVE status', async () => {
      prisma.tenant.create.mockImplementation(async ({ data }: any) => ({
        id: 'tnt-1',
        ...data,
      }));

      const dto: CreateTenantDto = { name: 'Acme', slug: 'acme' };
      const result = await service.createTenant(dto);

      expect(result.id).toBe('tnt-1');
      const call = prisma.tenant.create.mock.calls[0][0];
      expect(call.data.status).toBe('ACTIVE');
    });

    it('honours an explicit status when supplied', async () => {
      prisma.tenant.create.mockResolvedValue({ id: 'tnt-1' });

      await service.createTenant({
        name: 'Trial',
        slug: 'trial',
        status: TenantStatus.TRIAL,
      });

      expect(prisma.tenant.create.mock.calls[0][0].data.status).toBe('TRIAL');
    });
  });

  describe('updateTenant', () => {
    it('patches only the supplied fields', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 'tnt-1' });
      prisma.tenant.update.mockResolvedValue({ id: 'tnt-1' });

      const dto: UpdateTenantDto = { name: 'Renamed' };
      await service.updateTenant('tnt-1', dto, user);

      const call = prisma.tenant.update.mock.calls[0][0];
      expect(call.data.name).toBe('Renamed');
      expect(Object.keys(call.data)).toEqual(['name']);
    });
  });

  // -------------------------------------------------------------------
  // Tenant config
  // -------------------------------------------------------------------

  describe('getTenantConfig', () => {
    it('returns config rows ordered by key', async () => {
      prisma.tenantConfig.findMany.mockResolvedValue([
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ]);
      const result = await service.getTenantConfig('t1');
      expect(result).toHaveLength(2);
    });
  });

  describe('updateTenantConfig', () => {
    it('updates an existing config row', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue({
        tenantId: 't1',
        key: 'flag',
        value: 'old',
      });
      prisma.tenantConfig.update.mockResolvedValue({ value: 'new' });

      const dto: UpdateTenantConfigDto = { value: 'new' };
      await service.updateTenantConfig('t1', 'flag', dto, user);

      expect(prisma.tenantConfig.update).toHaveBeenCalled();
    });

    it('creates the config row when it does not exist (upsert)', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(null);
      prisma.tenantConfig.create.mockResolvedValue({ key: 'flag', value: 'new' });

      const dto: UpdateTenantConfigDto = { value: 'new' };
      await service.updateTenantConfig('t1', 'flag', dto, user);

      expect(prisma.tenantConfig.create).toHaveBeenCalledWith({
        data: { tenantId: 't1', key: 'flag', value: 'new', description: undefined },
      });
    });
  });

  describe('deleteTenantConfig', () => {
    it('throws NotFoundException when the key does not exist', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue(null);
      await expect(
        service.deleteTenantConfig('t1', 'missing', user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // System stats
  // -------------------------------------------------------------------

  describe('getSystemStats', () => {
    it('aggregates platform-wide counts', async () => {
      prisma.tenant.count.mockResolvedValue(3);
      prisma.user.count.mockResolvedValue(50);
      prisma.customer.count.mockResolvedValue(100);
      prisma.distributor.count.mockResolvedValue(10);
      prisma.order.count.mockResolvedValue(500);
      prisma.order.aggregate.mockResolvedValue({ _sum: { total: 25000 } });
      prisma.userSession.count.mockResolvedValue(5);
      prisma.employee.count.mockResolvedValue(15);
      // `userRole.count` is called with a `.catch(() => 0)` chain —
      // mock it to resolve so the chain doesn't break.
      prisma.userRole.count.mockResolvedValue(0);

      const result = await service.getSystemStats();

      expect(result.totalTenants).toBe(3);
      expect(result.totalUsers).toBe(50);
      expect(result.totalCustomers).toBe(100);
      expect(result.totalOrders).toBe(500);
      expect(result.totalRevenue).toBe(25000);
      expect(result.activeSessions).toBe(5);
      expect(result.totalEmployees).toBe(15);
    });
  });

  // -------------------------------------------------------------------
  // Audit + access logs
  // -------------------------------------------------------------------

  describe('getAuditLogs', () => {
    it('filters by userId + action + resourceType + date window', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const query: QueryAuditLogsDto = {
        page: 1,
        limit: 50,
        userId: 'u1',
        action: 'UPDATE',
        resourceType: 'User',
        since: '2024-01-01T00:00:00.000Z',
        until: '2024-12-31T23:59:59.000Z',
      };
      await service.getAuditLogs(query, user);

      const where = prisma.auditLog.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(where.userId).toBe('u1');
      expect(where.action).toBe('UPDATE');
      expect(where.resourceType).toBe('User');
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.lte).toBeInstanceOf(Date);
    });
  });

  describe('getAccessLogs', () => {
    it('filters by result + date window', async () => {
      prisma.accessLog.findMany.mockResolvedValue([]);
      prisma.accessLog.count.mockResolvedValue(0);

      const query: QueryAccessLogsDto = {
        page: 1,
        limit: 50,
        result: 'denied',
      };
      await service.getAccessLogs(query, user);

      const where = prisma.accessLog.findMany.mock.calls[0][0].where;
      expect(where.result).toBe('denied');
      expect(where.tenantId).toBe('t1');
    });
  });

  // -------------------------------------------------------------------
  // Integrations
  // -------------------------------------------------------------------

  describe('getIntegrations', () => {
    it('returns integrations scoped to the tenant', async () => {
      prisma.integration.findMany.mockResolvedValue([
        { id: 'i1', tenantId: 't1', type: 'vapi' },
      ]);
      const result = await service.getIntegrations(user);
      expect(result).toHaveLength(1);
      expect(prisma.integration.findMany).toHaveBeenCalledWith({
        where: { tenantId: 't1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('updateIntegration', () => {
    it('patches only the supplied fields', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'i1',
        tenantId: 't1',
      });
      prisma.integration.update.mockResolvedValue({ id: 'i1' });

      const dto: UpdateIntegrationDto = { status: 'inactive' };
      await service.updateIntegration('i1', dto, user);

      const call = prisma.integration.update.mock.calls[0][0];
      expect(call.data.status).toBe('inactive');
      expect(Object.keys(call.data)).toEqual(['status']);
    });

    it('throws NotFoundException on cross-tenant integration access', async () => {
      prisma.integration.findUnique.mockResolvedValue({
        id: 'i1',
        tenantId: 'other',
      });
      await expect(
        service.updateIntegration('i1', { status: 'inactive' }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

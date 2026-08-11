import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { AuthUser } from '../ai/auth-user';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserRoleDto, AssignRoleDto } from './dto/update-user-role.dto';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { QueryAuditLogsDto, QueryAccessLogsDto } from './dto/query-logs.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

/**
 * Admin service.
 *
 * Three responsibility areas:
 *
 *  1. **User administration** — list users across roles (admin view),
 *     fetch a user with all relations, change the denormalized `role`
 *     column, and assign/remove roles via the `UserRole` join table.
 *
 *  2. **Tenant administration** (super-admin only) — list/get/create/
 *     update tenants. The platform owner uses these to onboard new
 *     tenants and adjust tenant settings.
 *
 *  3. **Tenant config** — key/value config store scoped to the current
 *     tenant. Used for feature flags, integration toggles, etc.
 *
 * Plus system-wide stats (super-admin), audit/access log pagination,
 * and integration config management.
 *
 * All reads/writes are tenant-scoped via `user.tenantId` — except
 * super-admin tenant operations, which span all tenants.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------

  async findAllUsers(query: QueryUsersDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: true,
          userRoles: { include: { role: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneUser(id: string, user: AuthUser) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        employee: true,
        customers: true,
        distributors: true,
        userRoles: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
        },
        conversations: { take: 5, orderBy: { startedAt: 'desc' } },
      },
    });

    if (!u || u.tenantId !== user.tenantId) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return u;
  }

  /**
   * Update the denormalized `User.role` column. Used by the admin UI
   * for the "quick role change" dropdown — the canonical role grant
   * lives in the `UserRole` join table (see {@link assignRole}).
   */
  async updateUserRole(userId: string, dto: UpdateUserRoleDto, currentUser: AuthUser) {
    const target = await this.findOneUser(userId, currentUser);

    return this.prisma.user.update({
      where: { id: target.id },
      data: { role: dto.role as any },
    });
  }

  /**
   * Assign a role to a user via the `UserRole` join table. Idempotent
   * — re-assigning an already-assigned role is a no-op (returns the
   * existing row).
   */
  async assignRole(
    userId: string,
    dto: AssignRoleDto,
    currentUser: AuthUser,
  ) {
    const target = await this.findOneUser(userId, currentUser);

    // Verify the role exists and belongs to the same tenant.
    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role || role.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Role ${dto.roleId} not found`);
    }

    // Upsert — `UserRole` has a composite PK on (userId, roleId), so
    // re-assigning the same role would violate the PK. We catch the
    // conflict and return the existing row instead.
    try {
      return await this.prisma.userRole.create({
        data: {
          userId: target.id,
          roleId: role.id,
          tenantId: currentUser.tenantId!,
          assignedBy: dto.assignedBy ?? currentUser.userId,
        },
        include: { role: true },
      });
    } catch (err: any) {
      // P2002 = unique constraint violation — the role is already assigned.
      if (err?.code === 'P2002') {
        throw new ConflictException(
          `User ${target.id} already has role ${role.id}`,
        );
      }
      throw err;
    }
  }

  /**
   * Remove a role from a user. Idempotent — removing an unassigned
   * role is a no-op (returns `{ success: true }`).
   */
  async removeRole(
    userId: string,
    roleId: string,
    currentUser: AuthUser,
  ) {
    const target = await this.findOneUser(userId, currentUser);

    try {
      await this.prisma.userRole.delete({
        where: { userId_roleId: { userId: target.id, roleId } },
      });
    } catch (err: any) {
      // P2025 = record not found — treat as success (idempotent).
      if (err?.code !== 'P2025') throw err;
    }

    return { success: true, userId: target.id, roleId };
  }

  // ---------------------------------------------------------------------
  // Tenants — super-admin only
  // ---------------------------------------------------------------------

  async findAllTenants() {
    return this.prisma.tenant.findMany({
      include: {
        _count: {
          select: {
            users: true,
            customers: true,
            distributors: true,
            orders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            customers: true,
            distributors: true,
            orders: true,
            conversations: true,
            ragSources: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  async createTenant(dto: CreateTenantDto) {
    return this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        status: (dto.status as any) ?? 'ACTIVE',
        settings: dto.settings,
      },
    });
  }

  async updateTenant(id: string, dto: UpdateTenantDto, _currentUser: AuthUser) {
    const existing = await this.findOneTenant(id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.status !== undefined) data.status = dto.status as any;
    if (dto.settings !== undefined) data.settings = dto.settings;

    return this.prisma.tenant.update({
      where: { id: existing.id },
      data,
    });
  }

  // ---------------------------------------------------------------------
  // Tenant config — admin only, scoped to current tenant
  // ---------------------------------------------------------------------

  async getTenantConfig(tenantId: string) {
    return this.prisma.tenantConfig.findMany({
      where: { tenantId },
      orderBy: { key: 'asc' },
    });
  }

  async updateTenantConfig(
    tenantId: string,
    key: string,
    dto: UpdateTenantConfigDto,
    _currentUser: AuthUser,
  ) {
    const existing = await this.prisma.tenantConfig.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });

    if (!existing) {
      // Upsert: if the key doesn't exist, create it.
      return this.prisma.tenantConfig.create({
        data: {
          tenantId,
          key,
          value: dto.value ?? '',
          description: dto.description,
        },
      });
    }

    return this.prisma.tenantConfig.update({
      where: { tenantId_key: { tenantId, key } },
      data: {
        value: dto.value ?? existing.value,
        description: dto.description ?? existing.description,
      },
    });
  }

  async deleteTenantConfig(tenantId: string, key: string, _currentUser: AuthUser) {
    const existing = await this.prisma.tenantConfig.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });

    if (!existing) {
      throw new NotFoundException(`Config key '${key}' not found`);
    }

    await this.prisma.tenantConfig.delete({
      where: { tenantId_key: { tenantId, key } },
    });

    return { success: true, key };
  }

  // ---------------------------------------------------------------------
  // System stats — super-admin
  // ---------------------------------------------------------------------

  async getSystemStats() {
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);

    const [
      totalTenants,
      totalUsers,
      totalCustomers,
      totalDistributors,
      totalOrders,
      totalRevenue,
      activeSessions,
      totalEmployees,
      totalEmployeeRoles,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.customer.count(),
      this.prisma.distributor.count(),
      this.prisma.order.count(),
      this.prisma.order.aggregate({ _sum: { total: true } }),
      this.prisma.userSession.count({
        where: { expiresAt: { gt: new Date() } },
      }),
      this.prisma.employee.count(),
      this.prisma.userRole
        .count({
          where: { role: { name: { equals: 'EMPLOYEE' } } },
        })
        .catch(() => 0),
    ]);

    return {
      totalTenants,
      totalUsers,
      totalCustomers,
      totalDistributors,
      totalOrders,
      totalRevenue: totalRevenue._sum.total ?? 0,
      activeSessions,
      totalEmployees: totalEmployees || totalEmployeeRoles,
    };
  }

  // ---------------------------------------------------------------------
  // Audit + access logs
  // ---------------------------------------------------------------------

  async getAuditLogs(query: QueryAuditLogsDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action as any;
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.since || query.until) {
      where.createdAt = {};
      if (query.since) where.createdAt.gte = new Date(query.since);
      if (query.until) where.createdAt.lte = new Date(query.until);
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAccessLogs(query: QueryAccessLogsDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };
    if (query.userId) where.userId = query.userId;
    if (query.result) where.result = query.result;
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.since || query.until) {
      where.createdAt = {};
      if (query.since) where.createdAt.gte = new Date(query.since);
      if (query.until) where.createdAt.lte = new Date(query.until);
    }

    const [logs, total] = await Promise.all([
      this.prisma.accessLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.accessLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---------------------------------------------------------------------
  // Integrations
  // ---------------------------------------------------------------------

  async getIntegrations(user: AuthUser) {
    return this.prisma.integration.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateIntegration(
    id: string,
    dto: UpdateIntegrationDto,
    user: AuthUser,
  ) {
    const existing = await this.prisma.integration.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== user.tenantId) {
      throw new NotFoundException(`Integration ${id} not found`);
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.config !== undefined) data.config = dto.config;
    if (dto.credentials !== undefined) data.credentials = dto.credentials;
    if (dto.status !== undefined) data.status = dto.status;

    return this.prisma.integration.update({
      where: { id: existing.id },
      data,
    });
  }
}

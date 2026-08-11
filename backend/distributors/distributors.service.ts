import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../_shared/database/prisma.service';
import {
  CreateDistributorDto,
  DistributorTierEnum,
} from './dto/create-distributor.dto';
import { UpdateDistributorDto } from './dto/update-distributor.dto';
import { QueryDistributorsDto } from './dto/query-distributors.dto';
import { PerformanceQueryDto } from './dto/performance-query.dto';
import { AuthenticatedUser } from '../users/users.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_COMMISSION_RATE = 5; // 5% — overridden by dto.tier below.
const TIER_DEFAULT_COMMISSION: Record<DistributorTierEnum, number> = {
  [DistributorTierEnum.BRONZE]: 3,
  [DistributorTierEnum.SILVER]: 5,
  [DistributorTierEnum.GOLD]: 8,
  [DistributorTierEnum.PLATINUM]: 12,
};

@Injectable()
export class DistributorsService {
  private readonly logger = new Logger(DistributorsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private writeAudit(
    tenantId: string,
    actorId: string | null,
    action: 'INSERT' | 'UPDATE' | 'DELETE',
    resourceType: string,
    resourceId: string,
    oldValues?: Prisma.JsonValue,
    newValues?: Prisma.JsonValue,
  ): void {
    Promise.resolve()
      .then(() =>
        this.prisma.auditLog.create({
          data: {
            tenantId,
            userId: actorId,
            action,
            resourceType,
            resourceId,
            oldValues: oldValues as Prisma.InputJsonValue | undefined,
            newValues: newValues as Prisma.InputJsonValue | undefined,
          },
        }),
      )
      .catch((err) =>
        this.logger.error(
          `Failed to write audit log (${action} ${resourceType}:${resourceId}): ${(err as Error).message}`,
        ),
      );
  }

  // -------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------

  async findAll(query: QueryDistributorsDto, currentUser: AuthenticatedUser) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.DistributorWhereInput = {
      tenantId: currentUser.tenantId,
      status: { not: 'DELETED' },
    };

    if (query.status) {
      where.status = query.status as Prisma.EnumDistributorStatusFilter;
    }

    // `tier` is stored on the `address` JSON (the schema has no `tier`
    // column). Filter via a Prisma JSON path query when supplied.
    if (query.tier) {
      where.address = { path: ['tier'], equals: query.tier };
    }

    if (query.search) {
      where.OR = [
        { distributorCode: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [distributors, total] = await Promise.all([
      this.prisma.distributor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { orders: true, commissions: true } },
        },
      }),
      this.prisma.distributor.count({ where }),
    ]);

    // Augment each row with revenue + commission-earned aggregates. We
    // fan out into a per-row aggregate (rather than a single big SQL
    // window) to keep the Prisma surface portable across DBs.
    const statsByDistributor = await Promise.all(
      distributors.map((d) =>
        Promise.all([
          this.prisma.order.aggregate({
            where: { distributorId: d.id, status: { not: 'CANCELLED' } },
            _sum: { total: true },
          }),
          this.prisma.distributorCommission.aggregate({
            where: { distributorId: d.id },
            _sum: { amount: true },
          }),
        ]),
      ),
    );

    const data = distributors.map((d, i) => {
      const [orderAgg, commAgg] = statsByDistributor[i];
      const { _count, ...rest } = d;
      return {
        ...rest,
        tier: (rest.address as any)?.tier ?? null,
        totalOrders: _count.orders,
        revenue: orderAgg._sum.total ?? 0,
        commissionEarned: commAgg._sum.amount
          ? Number(commAgg._sum.amount)
          : 0,
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const distributor = await this.prisma.distributor.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
        commissions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            paidAt: true,
          },
        },
        _count: { select: { orders: true, commissions: true } },
      },
    });

    if (!distributor || distributor.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Distributor ${id} not found`);
    }

    const commissionSummary = await this.getCommissionSummary(id, currentUser);

    const { _count, ...rest } = distributor;
    return {
      ...rest,
      tier: (rest.address as any)?.tier ?? null,
      totalOrders: _count.orders,
      totalCommissions: _count.commissions,
      commissionSummary,
    };
  }

  // -------------------------------------------------------------------
  // Create / Update / Delete
  // -------------------------------------------------------------------

  async create(dto: CreateDistributorDto, currentUser: AuthenticatedUser) {
    const existingCode = await this.prisma.distributor.findUnique({
      where: { distributorCode: dto.distributorCode },
    });
    if (existingCode) {
      throw new ConflictException(
        'Distributor with this code already exists',
      );
    }

    const existingEmail = await this.prisma.distributor.findFirst({
      where: { tenantId: currentUser.tenantId, email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException(
        'Distributor with this email already exists in this tenant',
      );
    }

    // Default commission rate: explicit dto value > tier default > flat default.
    const commissionRate =
      dto.commissionRate ??
      (dto.tier ? TIER_DEFAULT_COMMISSION[dto.tier] : DEFAULT_COMMISSION_RATE);

    // Optional: link to a user account (for the distributor portal). Same
    // pattern as customers — create a `distributor`-role user with no
    // password; the user goes through a "set password" flow.
    let userId: string | undefined;
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser && existingUser.tenantId === currentUser.tenantId) {
      userId = existingUser.id;
    } else if (!existingUser) {
      const user = await this.prisma.user.create({
        data: {
          tenantId: currentUser.tenantId,
          email: dto.email,
          firstName: dto.contactPerson,
          role: 'distributor',
          status: 'ACTIVE',
        },
      });
      userId = user.id;
      this.logger.log(
        `TODO: queue 'set-password' email for new distributor user ${user.email}`,
      );
    }

    // Store tier + address together on the address JSON.
    const addressJson: Record<string, unknown> = {};
    if (dto.tier) addressJson.tier = dto.tier;
    if (dto.address) Object.assign(addressJson, dto.address);

    // Build the create payload. Address is optional — if no tier/address
    // is supplied we omit the field entirely (the schema column defaults
    // to NULL via the `Json?` type) rather than reaching for
    // `Prisma.JsonNull`, which would require a generated Prisma client
    // sentinel value not available in unit-test sandboxes.
    const createData: any = {
      tenantId: currentUser.tenantId,
      userId,
      distributorCode: dto.distributorCode,
      companyName: dto.companyName,
      contactPerson: dto.contactPerson,
      email: dto.email,
      phone: dto.phone,
      commissionRate,
      status: 'ACTIVE',
    };
    if (Object.keys(addressJson).length) {
      createData.address = addressJson;
    }

    const distributor = await this.prisma.distributor.create({
      data: createData,
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'INSERT',
      'Distributor',
      distributor.id,
      undefined,
      { distributorCode: distributor.distributorCode, companyName: distributor.companyName },
    );

    return distributor;
  }

  async update(
    id: string,
    dto: UpdateDistributorDto,
    currentUser: AuthenticatedUser,
  ) {
    const existing = await this.prisma.distributor.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Distributor ${id} not found`);
    }

    const data: Prisma.DistributorUpdateInput = {};
    if (dto.companyName !== undefined) data.companyName = dto.companyName;
    if (dto.contactPerson !== undefined) data.contactPerson = dto.contactPerson;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.commissionRate !== undefined) data.commissionRate = dto.commissionRate;
    if (dto.status !== undefined) {
      data.status = dto.status as Prisma.EnumDistributorStatusFieldUpdateOperationsInput;
    }

    // Merge tier into the existing address JSON (if any).
    if (dto.tier !== undefined) {
      const existingAddress =
        (existing.address as Record<string, unknown> | null) ?? {};
      data.address = { ...existingAddress, tier: dto.tier } as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.distributor.update({
      where: { id },
      data,
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'UPDATE',
      'Distributor',
      id,
      {
        commissionRate: existing.commissionRate,
        companyName: existing.companyName,
      },
      {
        commissionRate: updated.commissionRate,
        companyName: updated.companyName,
      },
    );

    return updated;
  }

  /**
   * Soft-delete: marks the distributor `DELETED`. The schema has no
   * `deletedAt` column on `Distributor`, so `status = 'DELETED'` is the
   * canonical tombstone (consistent with how `findAll` filters them out).
   */
  async remove(id: string, currentUser: AuthenticatedUser) {
    const existing = await this.prisma.distributor.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Distributor ${id} not found`);
    }

    await this.prisma.distributor.update({
      where: { id },
      data: { status: 'DELETED' },
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'DELETE',
      'Distributor',
      id,
      { distributorCode: existing.distributorCode, companyName: existing.companyName },
      { status: 'DELETED' },
    );

    return { success: true };
  }

  // -------------------------------------------------------------------
  // Performance + Commissions
  // -------------------------------------------------------------------

  async getPerformance(
    id: string,
    query: PerformanceQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    const distributor = await this.prisma.distributor.findUnique({
      where: { id },
    });
    if (!distributor || distributor.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Distributor ${id} not found`);
    }

    const start = query.startDate ? new Date(query.startDate) : undefined;
    const end = query.endDate ? new Date(query.endDate) : undefined;

    const orderWhere: Prisma.OrderWhereInput = {
      distributorId: id,
      status: { not: 'CANCELLED' },
    };
    if (start || end) {
      orderWhere.createdAt = {};
      if (start) orderWhere.createdAt.gte = start;
      if (end) orderWhere.createdAt.lte = end;
    }

    const [orderAgg, commAgg] = await Promise.all([
      this.prisma.order.aggregate({
        where: orderWhere,
        _sum: { total: true },
        _count: true,
        _avg: { total: true },
      }),
      this.prisma.distributorCommission.aggregate({
        where: {
          distributorId: id,
          ...(start || end
            ? {
                createdAt: {
                  ...(start ? { gte: start } : {}),
                  ...(end ? { lte: end } : {}),
                },
              }
            : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    const totalOrders = orderAgg._count;
    const revenue = orderAgg._sum.total ?? 0;

    return {
      totalOrders,
      revenue,
      commission: commAgg._sum.amount ? Number(commAgg._sum.amount) : 0,
      avgOrderValue: totalOrders > 0 ? revenue / totalOrders : 0,
      startDate: start ?? null,
      endDate: end ?? null,
    };
  }

  async getCommissionSummary(id: string, currentUser: AuthenticatedUser) {
    const distributor = await this.prisma.distributor.findUnique({
      where: { id },
    });
    if (!distributor || distributor.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Distributor ${id} not found`);
    }

    const [pending, paid, total] = await Promise.all([
      this.prisma.distributorCommission.aggregate({
        where: { distributorId: id, status: 'pending' },
        _sum: { amount: true },
      }),
      this.prisma.distributorCommission.aggregate({
        where: { distributorId: id, status: 'paid' },
        _sum: { amount: true },
      }),
      this.prisma.distributorCommission.aggregate({
        where: { distributorId: id },
        _sum: { amount: true },
      }),
    ]);

    return {
      pending: pending._sum.amount ? Number(pending._sum.amount) : 0,
      paid: paid._sum.amount ? Number(paid._sum.amount) : 0,
      total: total._sum.amount ? Number(total._sum.amount) : 0,
    };
  }
}

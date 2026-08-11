import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
// Type-only namespace import — keeps the service's where-clause / input
// types honest against the generated Prisma client without pulling the
// (heavy) runtime namespace into the bundle.
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../_shared/database/prisma.service';
import { CreateUserDto, UserRoleEnum } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto, SortOrder, UserSortBy } from './dto/query-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import * as bcrypt from 'bcryptjs';

/**
 * Shape of the authenticated user object attached to `req.user` by the
 * JWT strategy. We keep this loose as `any` at the call-site boundary
 * so the service never breaks if the auth module adds new fields.
 */
export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email?: string;
  jti?: string;
}

const BCRYPT_ROUNDS = 12;

/**
 * Default page size when neither the request nor the env specifies one.
 * Public API callers can request up to {@link MAX_LIMIT} rows per page.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Normalize the public-facing role enum (e.g. `EMPLOYEE`) into the
   * denormalized `User.role` column value (e.g. `employee`). The schema
   * column defaults to `'user'`, so unknown values fall back to that.
   */
  private normalizeRole(role: UserRoleEnum | undefined): string {
    if (!role) return 'user';
    return role.toLowerCase();
  }

  /**
   * Best-effort link of a freshly-created user to a tenant Role row via
   * the `user_roles` join table. Silently no-ops if the Role row does
   * not exist yet (the admin/seed is responsible for provisioning
   * canonical roles per tenant).
   */
  private async linkUserRole(
    userId: string,
    tenantId: string,
    roleName: string,
    assignedBy: string | null,
  ): Promise<void> {
    try {
      const role = await this.prisma.role.findUnique({
        where: { tenantId_name: { tenantId, name: roleName } },
      });
      if (!role) {
        this.logger.debug(
          `Role '${roleName}' not found for tenant ${tenantId} — skipping user_roles link for user ${userId}`,
        );
        return;
      }
      await this.prisma.userRole.create({
        data: { userId, roleId: role.id, tenantId, assignedBy },
      });
    } catch (err) {
      // Race-condition: user_roles has a composite PK (userId, roleId)
      // so a duplicate insert throws P2002. Swallow — the denormalized
      // `User.role` column is the source of truth used by RBAC hot-paths.
      this.logger.warn(
        `Failed to link user_role (${roleName}) for ${userId}: ${(err as Error).message}`,
      );
    }
  }

  private writeAudit(
    tenantId: string,
    actorId: string | null,
    action: 'INSERT' | 'UPDATE' | 'DELETE',
    resourceType: string,
    resourceId: string,
    oldValues?: Prisma.JsonValue,
    newValues?: Prisma.JsonValue,
  ): void {
    // Fire-and-forget — audit failures must never block the main flow.
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

  async findAll(query: QueryUsersDto, currentUser: AuthenticatedUser) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      tenantId: currentUser.tenantId,
      status: { not: 'DELETED' },
    };

    if (query.status) {
      where.status = query.status as Prisma.EnumUserStatusFilter;
    }

    if (query.role) {
      where.role = this.normalizeRole(query.role as UserRoleEnum);
    }

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const sortField =
      query.sortBy === UserSortBy.EMAIL
        ? 'email'
        : query.sortBy === UserSortBy.LAST_LOGIN_AT
          ? 'lastLoginAt'
          : 'createdAt';
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [sortField]: query.sortOrder === SortOrder.ASC ? 'asc' : 'desc',
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          userRoles: { include: { role: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
        employee: true,
      },
    });

    if (!user || user.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`User ${id} not found`);
    }

    // Flatten the joined graph into a more friendly shape for callers.
    const permissions = new Set<string>();
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissions.add(`${rp.permission.resource}:${rp.permission.action}`);
      }
    }

    // Strip the passwordHash before returning. The Prisma type still
    // carries it but we never want it crossing the wire.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = user;
    return {
      ...safeUser,
      permissions: Array.from(permissions),
    };
  }

  /**
   * Internal-use lookup (login, password-reset, etc.) — NOT tenant scoped.
   * Email is globally unique on the schema, so a single `findUnique`
   * suffices.
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
  }

  // -------------------------------------------------------------------
  // Create / Update / Delete
  // -------------------------------------------------------------------

  async create(dto: CreateUserDto, currentUser: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const role = this.normalizeRole(dto.role);

    const user = await this.prisma.user.create({
      data: {
        tenantId: currentUser.tenantId,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role,
        status: 'ACTIVE',
      },
      include: { userRoles: { include: { role: true } } },
    });

    // Best-effort: link the user to the tenant Role row.
    if (dto.role) {
      await this.linkUserRole(
        user.id,
        currentUser.tenantId,
        dto.role,
        currentUser.userId,
      );
    }

    // Fire-and-forget audit + welcome email. The notifications module is
    // owned by another agent; for now we log a TODO so it's obvious where
    // to wire the email-queue call later.
    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'INSERT',
      'User',
      user.id,
      undefined,
      { email: user.email, role: user.role },
    );
    this.logger.log(
      `TODO: queue welcome email for new user ${user.email} (notifications module not yet wired).`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUser: AuthenticatedUser,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.password) {
      data.passwordHash = await this.hashPassword(dto.password);
    }
    if (dto.role) {
      data.role = this.normalizeRole(dto.role);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: { userRoles: { include: { role: true } } },
    });

    // If the role changed, keep the denormalized column AND best-effort
    // sync the user_roles join table.
    if (dto.role) {
      await this.linkUserRole(
        id,
        currentUser.tenantId,
        dto.role,
        currentUser.userId,
      );
    }

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'UPDATE',
      'User',
      id,
      { role: existing.role, firstName: existing.firstName, lastName: existing.lastName },
      { role: updated.role, firstName: updated.firstName, lastName: updated.lastName },
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }

  /**
   * Soft-delete: marks the user `DELETED`. The schema has no `deletedAt`
   * column on `User`, so `status = DELETED` is the canonical tombstone
   * (consistent with how `findAll` filters it out).
   */
  async remove(id: string, currentUser: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (id === currentUser.userId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    await this.prisma.user.update({
      where: { id },
      data: { status: 'DELETED' },
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'DELETE',
      'User',
      id,
      { email: existing.email, role: existing.role },
      { status: 'DELETED' },
    );

    return { success: true };
  }

  // -------------------------------------------------------------------
  // Self-service (no admin permission required)
  // -------------------------------------------------------------------

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }

  // -------------------------------------------------------------------
  // Status mutations
  // -------------------------------------------------------------------

  async changeStatus(
    id: string,
    dto: ChangeStatusDto,
    currentUser: AuthenticatedUser,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (existing.status === dto.status) {
      throw new BadRequestException(
        `User is already in status ${dto.status}`,
      );
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'UPDATE',
      'User',
      id,
      { status: existing.status },
      { status: dto.status },
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }
}

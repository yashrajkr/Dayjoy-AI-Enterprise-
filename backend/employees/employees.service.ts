import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../_shared/database/prisma.service';
import { AuthenticatedUser } from '../users/users.service';
import * as bcrypt from 'bcryptjs';
import {
  AssignRoleDto,
  CreateEmployeeDto,
  EmployeeRoleEnum,
  EmployeeStatusEnum,
  QueryEmployeesDto,
  UpdateEmployeeDto,
  UpdateEmployeeStatusDto,
} from './dto/employee.dto';

const BCRYPT_ROUNDS = 12;
const EMPLOYEE_ROLES = new Set<string>([
  EmployeeRoleEnum.EMPLOYEE,
  EmployeeRoleEnum.MANAGER,
  EmployeeRoleEnum.AGENT,
]);

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  private normalizeRole(role: EmployeeRoleEnum): string {
    return role.toLowerCase();
  }

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

  async findAll(query: QueryEmployeesDto, currentUser: AuthenticatedUser) {
    const page = 1; // employees are typically a smaller set; no pagination
    const limit = 100;

    const where: Prisma.UserWhereInput = {
      tenantId: currentUser.tenantId,
      role: { in: Array.from(EMPLOYEE_ROLES).map((r) => r.toLowerCase()) },
      status: { not: 'DELETED' },
    };

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: true,
        userRoles: { include: { role: true } },
        _count: {
          select: {
            assignedLeads: true,
            assignedSupportTickets: true,
            assignedAppointments: true,
          },
        },
      },
    });

    // Optional department + status filters operate on the joined Employee
    // profile, so apply them in JS after the fetch.
    let filtered = users;
    if (query.department) {
      filtered = filtered.filter((u) => u.employee?.department === query.department);
    }
    if (query.status) {
      filtered = filtered.filter((u) => u.employee?.status === query.status);
    }

    const data = filtered.map((u) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, _count, ...rest } = u;
      return {
        ...rest,
        activeTasksCount:
          (_count?.assignedSupportTickets ?? 0) +
          (_count?.assignedAppointments ?? 0),
        openLeadsCount: _count?.assignedLeads ?? 0,
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total: data.length,
        totalPages: 1,
      },
    };
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        employee: true,
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
        interactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            subject: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user || user.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Employee ${id} not found`);
    }

    if (!EMPLOYEE_ROLES.has((user.role ?? '').toUpperCase())) {
      throw new NotFoundException(`User ${id} is not an employee`);
    }

    const permissions = new Set<string>();
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissions.add(`${rp.permission.resource}:${rp.permission.action}`);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = user;
    return {
      ...safeUser,
      permissions: Array.from(permissions),
    };
  }

  // -------------------------------------------------------------------
  // Create / Update
  // -------------------------------------------------------------------

  async create(dto: CreateEmployeeDto, currentUser: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const role = this.normalizeRole(dto.role ?? EmployeeRoleEnum.EMPLOYEE);

    // Generate an employee code if one wasn't supplied.
    const employeeCode =
      dto.employeeCode ?? `EMP-${randomUUID().slice(0, 8).toUpperCase()}`;

    // Check employeeCode uniqueness (it's @unique on the schema).
    const existingCode = await this.prisma.employee.findUnique({
      where: { employeeCode },
    });
    if (existingCode) {
      throw new ConflictException(
        `Employee with code ${employeeCode} already exists`,
      );
    }

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
    });

    // Create the Employee profile row linked 1-1 to the user.
    const employee = await this.prisma.employee.create({
      data: {
        tenantId: currentUser.tenantId,
        userId: user.id,
        employeeCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        department: dto.department,
        designation: dto.designation,
        reportsTo: dto.reportsTo,
        status: EmployeeStatusEnum.ACTIVE,
        hiredAt: new Date(),
      },
    });

    // Best-effort user_role link.
    await this.linkUserRole(
      user.id,
      currentUser.tenantId,
      dto.role ?? EmployeeRoleEnum.EMPLOYEE,
      currentUser.userId,
    );

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'INSERT',
      'Employee',
      user.id,
      undefined,
      { email: user.email, role: user.role, employeeCode },
    );
    this.logger.log(
      `TODO: queue welcome email for new employee ${user.email} (notifications module not yet wired).`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _omit, ...safeUser } = user;
    return { ...safeUser, employee };
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    currentUser: AuthenticatedUser,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!user || user.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Employee ${id} not found`);
    }
    if (!EMPLOYEE_ROLES.has((user.role ?? '').toUpperCase())) {
      throw new NotFoundException(`User ${id} is not an employee`);
    }

    // Update User-row profile fields.
    const userData: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) userData.firstName = dto.firstName;
    if (dto.lastName !== undefined) userData.lastName = dto.lastName;
    if (dto.phone !== undefined) userData.phone = dto.phone;

    if (Object.keys(userData).length) {
      await this.prisma.user.update({ where: { id }, data: userData });
    }

    // Update Employee-row fields.
    let updatedEmployee = user.employee;
    if (user.employee) {
      const empData: Prisma.EmployeeUpdateInput = {};
      if (dto.firstName !== undefined) empData.firstName = dto.firstName;
      if (dto.lastName !== undefined) empData.lastName = dto.lastName;
      if (dto.phone !== undefined) empData.phone = dto.phone;
      if (dto.department !== undefined) empData.department = dto.department;
      if (dto.designation !== undefined) empData.designation = dto.designation;
      if (dto.reportsTo !== undefined) empData.reportsTo = dto.reportsTo;

      if (Object.keys(empData).length) {
        updatedEmployee = await this.prisma.employee.update({
          where: { userId: id },
          data: empData,
        });
      }
    }

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'UPDATE',
      'Employee',
      id,
      { department: user.employee?.department, designation: user.employee?.designation },
      {
        department: updatedEmployee?.department,
        designation: updatedEmployee?.designation,
      },
    );

    return {
      id: user.id,
      email: user.email,
      firstName: dto.firstName ?? user.firstName,
      lastName: dto.lastName ?? user.lastName,
      phone: dto.phone ?? user.phone,
      role: user.role,
      employee: updatedEmployee,
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateEmployeeStatusDto,
    currentUser: AuthenticatedUser,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!user || user.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`Employee ${id} not found`);
    }
    if (!EMPLOYEE_ROLES.has((user.role ?? '').toUpperCase())) {
      throw new NotFoundException(`User ${id} is not an employee`);
    }
    if (!user.employee) {
      throw new NotFoundException(
        `Employee profile for user ${id} not found`,
      );
    }

    if (user.employee.status === dto.status) {
      throw new BadRequestException(
        `Employee is already in status ${dto.status}`,
      );
    }

    const updated = await this.prisma.employee.update({
      where: { userId: id },
      data: { status: dto.status },
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'UPDATE',
      'Employee',
      id,
      { status: user.employee.status },
      { status: dto.status },
    );

    return updated;
  }

  // -------------------------------------------------------------------
  // Role assignment ( UserRole join table )
  // -------------------------------------------------------------------

  async assignRole(
    userId: string,
    dto: AssignRoleDto,
    currentUser: AuthenticatedUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    await this.linkUserRole(
      userId,
      currentUser.tenantId,
      dto.role,
      currentUser.userId,
    );

    // Update the denormalized role column to reflect the new assignment.
    // For an employee-targeted endpoint, the new role always wins.
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: this.normalizeRole(dto.role) },
    });

    this.writeAudit(
      currentUser.tenantId,
      currentUser.userId,
      'UPDATE',
      'User',
      userId,
      { role: user.role },
      { role: updated.role },
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }

  async removeRole(
    userId: string,
    role: string,
    currentUser: AuthenticatedUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.tenantId !== currentUser.tenantId) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const roleRow = await this.prisma.role.findUnique({
      where: { tenantId_name: { tenantId: currentUser.tenantId, name: role } },
    });
    if (!roleRow) {
      throw new NotFoundException(`Role ${role} not found in this tenant`);
    }

    // Composite PK delete — if the row doesn't exist, Prisma throws
    // P2025 (record not found). We translate that to NotFoundException.
    try {
      await this.prisma.userRole.delete({
        where: { userId_roleId: { userId, roleId: roleRow.id } },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        throw new NotFoundException(
          `User ${userId} does not have role ${role}`,
        );
      }
      throw err;
    }

    // If the denormalized role column matched the removed role, fall
    // back to 'user' so subsequent RBAC hot-path checks don't grant
    // permissions the user no longer has.
    if (user.role === role.toLowerCase()) {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { role: 'user' },
      });
      this.writeAudit(
        currentUser.tenantId,
        currentUser.userId,
        'UPDATE',
        'User',
        userId,
        { role: user.role },
        { role: updated.role },
      );
    }

    return { success: true };
  }
}

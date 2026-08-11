import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach } from 'vitest';
import * as bcrypt from 'bcryptjs';

import { EmployeesService } from './employees.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import {
  AssignRoleDto,
  CreateEmployeeDto,
  EmployeeRoleEnum,
  EmployeeStatusEnum,
  UpdateEmployeeDto,
  UpdateEmployeeStatusDto,
} from './dto/employee.dto';

/**
 * EmployeesService unit tests — list (filtered to employee roles +
 * department/status filter), get-one (with permissions + recent
 * interactions), create (User + Employee profile + role link), update,
 * status mutation, and role assign/remove via the UserRole join table.
 */
describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  const currentUser = { userId: 'admin-1', tenantId: 't1' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    prisma.auditLog.create.mockResolvedValue({});
    prisma.userRole.create.mockResolvedValue({});
    prisma.role.findUnique.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  // -------------------------------------------------------------------
  // findAll()
  // -------------------------------------------------------------------
  describe('findAll', () => {
    it('lists users filtered to employee roles, with department/status filters applied in JS', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          email: 'emp@x.com',
          tenantId: 't1',
          role: 'employee',
          passwordHash: 'x',
          employee: { department: 'Sales', status: 'active' },
          userRoles: [],
          _count: { assignedLeads: 2, assignedSupportTickets: 3, assignedAppointments: 1 },
        },
        {
          id: 'u2',
          email: 'mgr@x.com',
          tenantId: 't1',
          role: 'manager',
          passwordHash: 'x',
          employee: { department: 'Ops', status: 'on_leave' },
          userRoles: [],
          _count: { assignedLeads: 0, assignedSupportTickets: 0, assignedAppointments: 0 },
        },
      ]);

      const result = await service.findAll({ department: 'Sales' }, currentUser);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('emp@x.com');
      // passwordHash stripped from response.
      expect(result.data[0].passwordHash).toBeUndefined();
      expect(result.data[0].activeTasksCount).toBe(4); // 3 tickets + 1 appointment
      expect(result.data[0].openLeadsCount).toBe(2);

      // The Prisma where-clause must filter role IN [employee, manager, agent].
      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t1');
      expect(args.where.role.in).toEqual(['employee', 'manager', 'agent']);
    });

    it('returns all employees when no filter is supplied', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          email: 'emp@x.com',
          tenantId: 't1',
          role: 'employee',
          passwordHash: 'x',
          employee: { department: 'Sales', status: 'active' },
          userRoles: [],
          _count: { assignedLeads: 0, assignedSupportTickets: 0, assignedAppointments: 0 },
        },
      ]);

      const result = await service.findAll({}, currentUser);
      expect(result.data).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------
  describe('findOne', () => {
    it('returns the employee with permissions + recent interactions', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'emp@x.com',
        tenantId: 't1',
        role: 'employee',
        passwordHash: 'x',
        employee: { department: 'Sales' },
        userRoles: [
          {
            role: {
              name: 'EMPLOYEE',
              rolePermissions: [
                { permission: { resource: 'customers', action: 'read' } },
              ],
            },
          },
        ],
        interactions: [{ id: 'i1', type: 'CALL', subject: 'Followup', createdAt: new Date() }],
      });

      const result = await service.findOne('u1', currentUser);

      expect(result.id).toBe('u1');
      expect(result.passwordHash).toBeUndefined();
      expect(result.permissions).toContain('customers:read');
      expect(result.interactions).toHaveLength(1);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the user is not an employee', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        role: 'customer',
        userRoles: [],
        interactions: [],
      });
      await expect(service.findOne('u1', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------
  describe('create', () => {
    it('creates a user + employee profile + links the role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.employee.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }: any) => ({
        id: 'u1',
        ...data,
      }));
      prisma.employee.create.mockImplementation(async ({ data }: any) => ({
        id: 'e1',
        ...data,
      }));

      const dto: CreateEmployeeDto = {
        email: 'newemp@x.com',
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Roe',
        role: EmployeeRoleEnum.EMPLOYEE,
        department: 'Sales',
        designation: 'Associate',
      };

      const result = await service.create(dto, currentUser);

      expect(result.id).toBe('u1');
      expect(result.email).toBe('newemp@x.com');
      expect(result.employee.department).toBe('Sales');
      expect(result.passwordHash).toBeUndefined();

      const userCreateCall = prisma.user.create.mock.calls[0][0];
      expect(userCreateCall.data.role).toBe('employee');
      expect(userCreateCall.data.passwordHash).not.toBe('Password123!');
      expect(await bcrypt.compare('Password123!', userCreateCall.data.passwordHash)).toBe(true);

      const empCreateCall = prisma.employee.create.mock.calls[0][0];
      expect(empCreateCall.data.userId).toBe('u1');
      expect(empCreateCall.data.department).toBe('Sales');
      expect(empCreateCall.data.status).toBe('active');
      expect(empCreateCall.data.hiredAt).toBeDefined();
      expect(empCreateCall.data.employeeCode).toMatch(/^EMP-/);
    });

    it('throws ConflictException when the email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      const dto: CreateEmployeeDto = {
        email: 'taken@x.com',
        password: 'Password123!',
      };

      await expect(service.create(dto, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws ConflictException when the employeeCode is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.employee.findUnique.mockResolvedValue({ id: 'existing' });

      const dto: CreateEmployeeDto = {
        email: 'newemp@x.com',
        password: 'Password123!',
        employeeCode: 'EMP-EXISTING',
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
    it('updates both the user profile and the employee profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        role: 'employee',
        email: 'emp@x.com',
        firstName: 'Old',
        employee: { department: 'Sales', designation: 'Associate' },
      });
      prisma.user.update.mockResolvedValue({});
      prisma.employee.update.mockImplementation(async ({ data }: any) => ({
        id: 'e1',
        department: data.department,
        designation: data.designation,
      }));

      const dto: UpdateEmployeeDto = {
        firstName: 'New',
        department: 'Ops',
        designation: 'Lead',
      };
      const result = await service.update('u1', dto, currentUser);

      expect(result.firstName).toBe('New');
      expect(result.employee.department).toBe('Ops');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ firstName: 'New' }),
        }),
      );
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          data: expect.objectContaining({ department: 'Ops', designation: 'Lead' }),
        }),
      );
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.update('missing', { firstName: 'X' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the user is not an employee', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        role: 'customer',
      });
      await expect(
        service.update('u1', { firstName: 'X' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // updateStatus()
  // -------------------------------------------------------------------
  describe('updateStatus', () => {
    it('updates the employee status and writes audit', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        role: 'employee',
        employee: { status: 'active', userId: 'u1' },
      });
      prisma.employee.update.mockImplementation(async ({ data }: any) => ({
        userId: 'u1',
        status: data.status,
      }));

      const dto: UpdateEmployeeStatusDto = { status: EmployeeStatusEnum.ON_LEAVE };
      const result = await service.updateStatus('u1', dto, currentUser);

      expect(result.status).toBe('on_leave');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws BadRequestException when the status is unchanged', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        role: 'employee',
        employee: { status: 'active', userId: 'u1' },
      });
      await expect(
        service.updateStatus(
          'u1',
          { status: EmployeeStatusEnum.ACTIVE },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the employee profile does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        role: 'employee',
        employee: null,
      });
      await expect(
        service.updateStatus(
          'u1',
          { status: EmployeeStatusEnum.ON_LEAVE },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // assignRole()
  // -------------------------------------------------------------------
  describe('assignRole', () => {
    it('links the role via UserRole and updates the denormalized role column', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        role: 'employee',
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'r-mgr', name: 'MANAGER' });
      prisma.user.update.mockImplementation(async ({ data }: any) => ({
        id: 'u1',
        tenantId: 't1',
        role: data.role,
        passwordHash: 'x',
      }));

      const dto: AssignRoleDto = { role: EmployeeRoleEnum.MANAGER };
      const result = await service.assignRole('u1', dto, currentUser);

      expect(result.role).toBe('manager');
      expect(prisma.userRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            roleId: 'r-mgr',
            assignedBy: 'admin-1',
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.assignRole('missing', { role: EmployeeRoleEnum.MANAGER }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // removeRole()
  // -------------------------------------------------------------------
  describe('removeRole', () => {
    it('deletes the UserRole row and resets the denormalized role to "user" if it matched', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        role: 'manager',
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'r-mgr', name: 'MANAGER' });
      prisma.userRole.delete.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({ id: 'u1', role: 'user' });

      const result = await service.removeRole('u1', 'MANAGER', currentUser);

      expect(result.success).toBe(true);
      expect(prisma.userRole.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_roleId: { userId: 'u1', roleId: 'r-mgr' } },
        }),
      );
      // Denormalized role reset because it matched.
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { role: 'user' },
        }),
      );
    });

    it('does NOT reset the denormalized role when it did not match', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        role: 'employee',
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'r-mgr', name: 'MANAGER' });
      prisma.userRole.delete.mockResolvedValue({});

      await service.removeRole('u1', 'MANAGER', currentUser);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the role does not exist in the tenant', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1', role: 'manager' });
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.removeRole('u1', 'NONEXISTENT', currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the user does not have the role (P2025)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1', role: 'manager' });
      prisma.role.findUnique.mockResolvedValue({ id: 'r-mgr', name: 'MANAGER' });
      const err = Object.assign(new Error('Record not found'), { code: 'P2025' });
      prisma.userRole.delete.mockRejectedValue(err);

      await expect(
        service.removeRole('u1', 'MANAGER', currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('re-throws non-P2025 errors verbatim', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1', role: 'manager' });
      prisma.role.findUnique.mockResolvedValue({ id: 'r-mgr', name: 'MANAGER' });
      const err = Object.assign(new Error('Connection lost'), { code: 'P1001' });
      prisma.userRole.delete.mockRejectedValue(err);

      await expect(
        service.removeRole('u1', 'MANAGER', currentUser),
      ).rejects.toThrow('Connection lost');
    });
  });
});

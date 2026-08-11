/**
 * Unit tests — EmployeesService.
 *
 * Covers:
 *  - findAll()      — pagination, filtering, sorting
 *  - findOne()      — returns employee with role + permissions
 *  - create()       — creates user + employee record, hashes password
 *  - update()       — updates fields, optional password hash
 *  - updateStatus() — admin only, audit logged
 *  - assignRole()   — adds role via UserRole join table
 *  - removeRole()   — removes role
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { EmployeesService } from '@backend/employees/employees.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { mockPrismaService } from '@testing/helpers/mocks';
import {
  testTenant,
  testAuthUser,
} from '@testing/helpers/fixtures';
import { createRole } from '@testing/helpers/factories';

describe('EmployeesService (system-wide unit)', () => {
  let service: EmployeesService;
  let prisma: ReturnType<typeof mockPrismaService>;

  const employeeRecord = {
    id: 'emp-00000001',
    tenantId: testTenant.id,
    userId: 'user-00000002',
    employeeId: 'EMP-001',
    firstName: 'Eve',
    lastName: 'Employee',
    email: 'employee@dayjoy.test',
    phone: '+15550000002',
    department: 'Sales',
    designation: 'Sales Rep',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    joinedAt: new Date('2025-02-01'),
  };

  beforeEach(async () => {
    prisma = mockPrismaService();
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

  describe('findAll()', () => {
    it('returns paginated employees scoped to tenant', async () => {
      prisma.employee.findMany.mockResolvedValue([employeeRecord]);
      prisma.employee.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 }, testAuthUser);

      expect(result.data).toHaveLength(1);
      const whereArg = prisma.employee.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });

    it('caps the limit at MAX_LIMIT', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 500 }, testAuthUser);

      expect(result.limit).toBe(100);
    });

    it('applies department filter', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, department: 'Sales' } as any, testAuthUser);

      const whereArg = prisma.employee.findMany.mock.calls[0][0].where;
      expect(whereArg.department).toBe('Sales');
    });

    it('applies status filter', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, status: 'ACTIVE' } as any, testAuthUser);

      const whereArg = prisma.employee.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe('ACTIVE');
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the employee with relations', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRecord);

      const result = await service.findOne(employeeRecord.id, testAuthUser);

      expect(result.id).toBe(employeeRecord.id);
    });

    it('throws NotFoundException when the employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------

  describe('create()', () => {
    it('creates a user + employee record with a hashed password and assigned role', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-new',
        tenantId: testTenant.id,
        email: 'new-emp@dayjoy.test',
      });
      prisma.employee.create.mockResolvedValue(employeeRecord);

      const result = await service.create(
        {
          email: 'new-emp@dayjoy.test',
          password: 'Str0ng!Pass',
          firstName: 'Eve',
          lastName: 'Employee',
          role: 'EMPLOYEE',
          department: 'Sales',
          designation: 'Sales Rep',
        } as any,
        testAuthUser,
      );

      expect(result.id).toBe(employeeRecord.id);
      const userArg = prisma.user.create.mock.calls[0][0];
      expect(userArg.data.passwordHash).not.toBe('Str0ng!Pass');
      expect(userArg.data.role).toBe('employee');
    });

    it('throws ConflictException when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.create(
          { email: 'dup@dayjoy.test', password: 'Str0ng!Pass' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for an invalid role', async () => {
      await expect(
        service.create(
          { email: 'bad@dayjoy.test', password: 'Str0ng!Pass', role: 'INVALID_ROLE' as any } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------

  describe('update()', () => {
    it('updates fields and writes audit log', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRecord);
      prisma.employee.update.mockResolvedValue({
        ...employeeRecord,
        designation: 'Senior Sales Rep',
      });

      const result = await service.update(
        employeeRecord.id,
        { designation: 'Senior Sales Rep' } as any,
        testAuthUser,
      );

      expect(result.designation).toBe('Senior Sales Rep');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('hashes the password if included', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRecord);
      prisma.user.findUnique.mockResolvedValue({ id: employeeRecord.userId });
      prisma.user.update.mockResolvedValue({});
      prisma.employee.update.mockResolvedValue(employeeRecord);

      await service.update(
        employeeRecord.id,
        { password: 'NewStr0ng!Pass' } as any,
        testAuthUser,
      );

      const userArg = prisma.user.update.mock.calls[0][0];
      expect(userArg.data.passwordHash).not.toBe('NewStr0ng!Pass');
    });

    it('throws NotFoundException when the employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.update('ghost', { designation: 'x' } as any, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // updateStatus()
  // -------------------------------------------------------------------

  describe('updateStatus()', () => {
    it('updates the status and writes audit log', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRecord);
      prisma.employee.update.mockResolvedValue({ ...employeeRecord, status: 'SUSPENDED' });

      const result = await service.updateStatus(
        employeeRecord.id,
        { status: 'SUSPENDED' } as any,
        testAuthUser,
      );

      expect(result.status).toBe('SUSPENDED');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when the employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('ghost', { status: 'ACTIVE' } as any, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // assignRole()
  // -------------------------------------------------------------------

  describe('assignRole()', () => {
    it('links the user to a tenant Role via the UserRole join table', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRecord);
      const role = createRole({ tenantId: testTenant.id, name: 'manager' });
      prisma.role.findUnique.mockResolvedValue(role);
      prisma.userRole.findUnique.mockResolvedValue(null);
      prisma.userRole.create.mockResolvedValue({});

      await service.assignRole(
        employeeRecord.id,
        { roleName: 'manager' } as any,
        testAuthUser,
      );

      expect(prisma.userRole.create).toHaveBeenCalled();
    });

    it('throws BadRequestException when the role does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRecord);
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.assignRole(
          employeeRecord.id,
          { roleName: 'nonexistent' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.assignRole('ghost', { roleName: 'manager' } as any, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // removeRole()
  // -------------------------------------------------------------------

  describe('removeRole()', () => {
    it('removes the UserRole join row', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRecord);
      prisma.userRole.findFirst.mockResolvedValue({ id: 'ur-1' });
      prisma.userRole.delete.mockResolvedValue({});

      await service.removeRole(
        employeeRecord.id,
        { roleName: 'manager' } as any,
        testAuthUser,
      );

      expect(prisma.userRole.delete).toHaveBeenCalledWith({ where: { id: 'ur-1' } });
    });

    it('throws BadRequestException when the user does not have that role', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRecord);
      prisma.userRole.findFirst.mockResolvedValue(null);

      await expect(
        service.removeRole(
          employeeRecord.id,
          { roleName: 'manager' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

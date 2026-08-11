/**
 * Unit tests — UsersService.
 *
 * Covers all 7 public methods:
 *  - findAll()    — pagination, filtering, sorting
 *  - findOne()    — returns user, throws if not found
 *  - create()     — creates user, hashes password
 *  - update()     — updates fields, hashes password if changed
 *  - remove()     — soft deletes (status = DELETED)
 *  - updateProfile() — self-service, limited fields
 *  - changeStatus()  — admin only, audit logged
 *
 * Prisma is mocked — no DB access. bcrypt runs for real.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { UsersService } from '@backend/users/users.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';

import { mockPrismaService } from '@testing/helpers/mocks';
import { testUser, testSuperAdmin, testAuthUser, testTenant } from '@testing/helpers/fixtures';
import { createUser, createRole } from '@testing/helpers/factories';

describe('UsersService (system-wide unit)', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  // -------------------------------------------------------------------
  // findAll()
  // -------------------------------------------------------------------

  describe('findAll()', () => {
    it('returns paginated users scoped to the caller tenant', async () => {
      const users = [testUser, createUser({ tenantId: testTenant.id })];
      prisma.user.findMany.mockResolvedValue(users);
      prisma.user.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 }, testAuthUser);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      // Where clause must include tenantId.
      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(testTenant.id);
    });

    it('caps the limit at MAX_LIMIT (100)', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.findAll(
        { page: 1, limit: 500 },
        testAuthUser,
      );

      expect(result.limit).toBe(100);
    });

    it('applies search filter on firstName / lastName / email', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, search: 'ada' }, testAuthUser);

      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
      expect(whereArg.OR.length).toBeGreaterThan(0);
    });

    it('applies role filter', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, role: 'ADMIN' }, testAuthUser);

      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.role).toBe('admin');
    });

    it('applies status filter', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, status: 'ACTIVE' }, testAuthUser);

      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe('ACTIVE');
    });

    it('supports sorting by createdAt desc', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
        testAuthUser,
      );

      const orderByArg = prisma.user.findMany.mock.calls[0][0].orderBy;
      expect(orderByArg).toEqual({ createdAt: 'desc' });
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the user when found', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);

      const result = await service.findOne(testUser.id, testAuthUser);

      expect(result.id).toBe(testUser.id);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows a user to fetch their own record even without users:read permission', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);

      const result = await service.findOne(testUser.id, {
        ...testAuthUser,
        userId: testUser.id,
      });

      expect(result.id).toBe(testUser.id);
    });

    it('blocks a non-admin user from fetching another tenant user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...testUser,
        tenantId: 'other-tenant',
      });

      await expect(service.findOne('user-x', testAuthUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------

  describe('create()', () => {
    it('creates a user with a hashed password and the requested role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...testUser,
        passwordHash: 'hashed',
      });

      const result = await service.create(
        {
          email: 'new@dayjoy.test',
          password: 'Str0ng!Pass',
          firstName: 'New',
          lastName: 'User',
          role: 'EMPLOYEE' as any,
        },
        testAuthUser,
      );

      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.passwordHash).not.toBe('Str0ng!Pass');
      expect(createArg.data.role).toBe('employee');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when the email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);

      await expect(
        service.create(
          { email: testUser.email, password: 'Str0ng!Pass' },
          testAuthUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('best-effort links the new user to a tenant Role row', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...testUser });
      const role = createRole({ tenantId: testTenant.id, name: 'employee' });
      prisma.role.findUnique.mockResolvedValue(role);
      prisma.userRole.create.mockResolvedValue({});

      await service.create(
        { email: 'new2@dayjoy.test', password: 'Str0ng!Pass', role: 'EMPLOYEE' as any },
        testAuthUser,
      );

      expect(prisma.userRole.create).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------

  describe('update()', () => {
    it('updates fields and returns the updated user', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);
      prisma.user.update.mockResolvedValue({ ...testUser, firstName: 'Updated' });

      const result = await service.update(
        testUser.id,
        { firstName: 'Updated' },
        testAuthUser,
      );

      expect(result.firstName).toBe('Updated');
      expect(prisma.user.update).toHaveBeenCalledOnce();
    });

    it('hashes the password when password is included in the update', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);
      prisma.user.update.mockResolvedValue({ ...testUser });

      await service.update(
        testUser.id,
        { password: 'NewStr0ng!Pass' } as any,
        testAuthUser,
      );

      const updateArg = prisma.user.update.mock.calls[0][0];
      expect(updateArg.data.passwordHash).not.toBe('NewStr0ng!Pass');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('ghost', { firstName: 'x' }, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when updating email to a duplicate', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);
      prisma.user.findFirst.mockResolvedValue(createUser({ email: 'taken@dayjoy.test' }));

      await expect(
        service.update(
          testUser.id,
          { email: 'taken@dayjoy.test' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------

  describe('remove()', () => {
    it('soft deletes (status = DELETED) rather than hard-deleting', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);
      prisma.user.update.mockResolvedValue({ ...testUser, status: 'DELETED' });

      await service.remove(testUser.id, testAuthUser);

      const updateArg = prisma.user.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('DELETED');
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when attempting to delete a super admin', async () => {
      prisma.user.findUnique.mockResolvedValue(testSuperAdmin);

      await expect(service.remove(testSuperAdmin.id, testAuthUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // -------------------------------------------------------------------
  // updateProfile()
  // -------------------------------------------------------------------

  describe('updateProfile()', () => {
    it('updates only the allowed self-service fields (firstName, lastName, phone)', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);
      prisma.user.update.mockResolvedValue({ ...testUser, firstName: 'Self' });

      await service.updateProfile(testUser.id, {
        firstName: 'Self',
        lastName: 'Updated',
        phone: '+15559998888',
      });

      const updateArg = prisma.user.update.mock.calls[0][0];
      expect(updateArg.data.firstName).toBe('Self');
      expect(updateArg.data.lastName).toBe('Updated');
      expect(updateArg.data.phone).toBe('+15559998888');
      // Disallowed fields must not be present.
      expect(updateArg.data).not.toHaveProperty('role');
      expect(updateArg.data).not.toHaveProperty('status');
      expect(updateArg.data).not.toHaveProperty('tenantId');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('ghost', { firstName: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // changeStatus()
  // -------------------------------------------------------------------

  describe('changeStatus()', () => {
    it('updates the status and writes an audit log entry', async () => {
      prisma.user.findUnique.mockResolvedValue(testUser);
      prisma.user.update.mockResolvedValue({ ...testUser, status: 'SUSPENDED' });
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.changeStatus(
        testUser.id,
        { status: 'SUSPENDED' } as any,
        testAuthUser,
      );

      expect(result.status).toBe('SUSPENDED');
      expect(prisma.auditLog.create).toHaveBeenCalledOnce();
      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.action).toBe('UPDATE');
      expect(auditArg.data.resourceType).toBe('User');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changeStatus('ghost', { status: 'ACTIVE' } as any, testAuthUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when attempting to suspend a super admin', async () => {
      prisma.user.findUnique.mockResolvedValue(testSuperAdmin);

      await expect(
        service.changeStatus(
          testSuperAdmin.id,
          { status: 'SUSPENDED' } as any,
          testAuthUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

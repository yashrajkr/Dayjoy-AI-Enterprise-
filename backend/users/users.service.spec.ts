import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';

import { UsersService } from './users.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { CreateUserDto, UserRoleEnum } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangeStatusDto, ChangeUserStatus } from './dto/change-status.dto';

/**
 * UsersService unit tests — pagination, single-fetch (with tenant
 * isolation), create (with email-uniqueness guard + password hashing +
 * best-effort role link), update, soft-delete, self-service profile
 * edit, and admin status mutation. Audit-log writes are fire-and-forget
 * so the tests treat them as no-ops.
 */
describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  const currentUser = { userId: 'admin-1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    // Audit-log writes are fire-and-forget — make them resolve cleanly.
    prisma.auditLog.create.mockResolvedValue({});
    prisma.userRole.create.mockResolvedValue({});
    prisma.role.findUnique.mockResolvedValue(null);

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
  describe('findAll', () => {
    it('returns paginated users scoped to the tenant', async () => {
      const fakeUsers = [
        { id: '1', email: 'a@b.com', tenantId: 't1' },
        { id: '2', email: 'c@d.com', tenantId: 't1' },
      ];
      prisma.user.findMany.mockResolvedValue(fakeUsers);
      prisma.user.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 10 }, currentUser);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(1);

      const findManyArgs = prisma.user.findMany.mock.calls[0][0];
      expect(findManyArgs.where.tenantId).toBe('t1');
      expect(findManyArgs.skip).toBe(0);
      expect(findManyArgs.take).toBe(10);
    });

    it('applies status + search filters to the where clause', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 20, status: 'ACTIVE', search: 'alice' },
        currentUser,
      );

      const findManyArgs = prisma.user.findMany.mock.calls[0][0];
      expect(findManyArgs.where.status).toBe('ACTIVE');
      expect(findManyArgs.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: expect.objectContaining({ contains: 'alice' }) }),
        ]),
      );
    });

    it('computes pagination skip from page/limit', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ page: 3, limit: 25 }, currentUser);

      const findManyArgs = prisma.user.findMany.mock.calls[0][0];
      // skip = (page - 1) * limit = 2 * 25 = 50
      expect(findManyArgs.skip).toBe(50);
      expect(findManyArgs.take).toBe(25);
    });

    it('caps limit at 100', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 500 }, currentUser);

      expect(prisma.user.findMany.mock.calls[0][0].take).toBe(100);
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------
  describe('findOne', () => {
    it('returns the user (with roles + flattened permissions) when tenant matches', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.com',
        tenantId: 't1',
        passwordHash: 'secret',
        userRoles: [
          {
            role: {
              name: 'ADMIN',
              rolePermissions: [
                { permission: { resource: 'users', action: 'read' } },
              ],
            },
          },
        ],
        employee: null,
      };
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne('u1', currentUser);
      expect(result.id).toBe('u1');
      // passwordHash must never leak across the wire.
      expect(result.passwordHash).toBeUndefined();
      expect(result.permissions).toContain('users:read');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when tenantId does not match (cross-tenant isolation)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 'other-tenant', userRoles: [] });
      await expect(service.findOne('u1', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // findByEmail()
  // -------------------------------------------------------------------
  describe('findByEmail', () => {
    it('returns the user (no tenant scoping — searches across all tenants)', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      const result = await service.findByEmail('a@b.com');
      expect(result.id).toBe('u1');
    });

    it('returns null when not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const result = await service.findByEmail('nope@b.com');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------
  describe('create', () => {
    it('creates a user with a hashed password and default role', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }: any) => ({
        id: 'u1',
        ...data,
        userRoles: [],
      }));

      const dto: CreateUserDto = {
        email: 'new@example.com',
        password: 'Password123!',
        firstName: 'New',
        lastName: 'User',
      };

      const result = await service.create(dto, currentUser);

      expect(result.email).toBe('new@example.com');
      // passwordHash stripped from response
      expect(result.passwordHash).toBeUndefined();

      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).not.toBe('Password123!');
      expect(await bcrypt.compare('Password123!', createCall.data.passwordHash)).toBe(true);
      // No role supplied → 'user' (lowercased default).
      expect(createCall.data.role).toBe('user');
      expect(createCall.data.status).toBe('ACTIVE');
      expect(createCall.data.tenantId).toBe('t1');
    });

    it('creates a user with an explicit role (lowercased) and links the user_role row', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }: any) => ({
        id: 'u1',
        ...data,
        userRoles: [],
      }));
      prisma.role.findUnique.mockResolvedValue({ id: 'role-emp', name: 'EMPLOYEE' });

      const dto: CreateUserDto = {
        email: 'new@example.com',
        password: 'Password123!',
        role: UserRoleEnum.EMPLOYEE,
      };

      await service.create(dto, currentUser);

      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.role).toBe('employee');
      // user_role link was attempted with the tenant Role row.
      expect(prisma.userRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roleId: 'role-emp',
            userId: 'u1',
            tenantId: 't1',
            assignedBy: 'admin-1',
          }),
        }),
      );
    });

    it('throws ConflictException when the email is already taken', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

      const dto: CreateUserDto = {
        email: 'taken@example.com',
        password: 'Password123!',
      };

      await expect(service.create(dto, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------
  describe('update', () => {
    it('updates the user (after tenant check) and re-hashes a new password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1', role: 'user' });
      prisma.user.update.mockImplementation(async ({ data }: any) => ({
        id: 'u1',
        tenantId: 't1',
        role: data.role ?? 'user',
        firstName: data.firstName,
        lastName: data.lastName,
        userRoles: [],
      }));

      const dto: UpdateUserDto = {
        firstName: 'Updated',
        password: 'NewPassword1!',
      };
      const result = await service.update('u1', dto, currentUser);

      expect(result.firstName).toBe('Updated');
      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.where.id).toBe('u1');
      expect(updateCall.data.firstName).toBe('Updated');
      expect(updateCall.data.passwordHash).not.toBe('NewPassword1!');
      expect(await bcrypt.compare('NewPassword1!', updateCall.data.passwordHash)).toBe(true);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.update('missing', { firstName: 'X' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 'other' });
      await expect(
        service.update('u1', { firstName: 'X' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------
  describe('remove', () => {
    it('marks the user as DELETED (no hard delete) and writes an audit entry', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1', email: 'a@b.com' });
      prisma.user.update.mockResolvedValue({});

      const result = await service.remove('u1', currentUser);

      expect(result.success).toBe(true);
      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('DELETED');
      // Must not call `delete` — soft delete is update-only.
      expect(prisma.user.delete).not.toHaveBeenCalled();
      // Audit entry fired.
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws ForbiddenException when a user tries to delete themselves', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', tenantId: 't1' });
      await expect(service.remove('admin-1', currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // updateProfile()
  // -------------------------------------------------------------------
  describe('updateProfile', () => {
    it('updates firstName/lastName/phone only', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1' });
      prisma.user.update.mockImplementation(async ({ data }: any) => ({
        id: 'u1',
        tenantId: 't1',
        ...data,
        passwordHash: 'pre-existing',
      }));

      const dto: UpdateProfileDto = {
        firstName: 'Self',
        lastName: 'Edit',
        phone: '+15550000000',
      };
      const result = await service.updateProfile('u1', dto);

      expect(result.firstName).toBe('Self');
      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.data.firstName).toBe('Self');
      expect(updateCall.data.lastName).toBe('Edit');
      expect(updateCall.data.phone).toBe('+15550000000');
      // role / status / email / passwordHash are never in the payload.
      expect(updateCall.data.role).toBeUndefined();
      expect(updateCall.data.status).toBeUndefined();
      expect(updateCall.data.email).toBeUndefined();
      expect(updateCall.data.passwordHash).toBeUndefined();
      // passwordHash is stripped from the response.
      expect(result.passwordHash).toBeUndefined();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.updateProfile('missing', { firstName: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // changeStatus()
  // -------------------------------------------------------------------
  describe('changeStatus', () => {
    it('updates the user status and writes an audit entry', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1', status: 'ACTIVE' });
      prisma.user.update.mockImplementation(async ({ data }: any) => ({
        id: 'u1',
        tenantId: 't1',
        status: data.status,
        passwordHash: 'pre-existing',
      }));

      const dto: ChangeStatusDto = { status: ChangeUserStatus.SUSPENDED };
      const result = await service.changeStatus('u1', dto, currentUser);

      expect(result.status).toBe('SUSPENDED');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws BadRequestException when the status is unchanged', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1', status: 'ACTIVE' });
      await expect(
        service.changeStatus('u1', { status: ChangeUserStatus.ACTIVE }, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.changeStatus('missing', { status: ChangeUserStatus.ACTIVE }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

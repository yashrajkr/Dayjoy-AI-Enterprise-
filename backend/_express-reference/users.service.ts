/**
 * Users Service
 */

import { prisma } from '../../lib/prisma';
import { AppError, NotFoundError, ValidationError } from '../../middleware/errorHandler';
import { hashPassword } from '../auth/auth.service';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tenantId: string;
  roleIds?: string[];
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  status?: string;
}

export async function listUsers(tenantId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: { tenant_id: tenantId },
      include: { userRoles: { include: { role: true } } },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.user.count({ where: { tenant_id: tenantId } }),
  ]);
  return { data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getUserById(id: string, tenantId: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
  });
  if (!user || user.tenant_id !== tenantId) throw new NotFoundError('User');
  return user;
}

export async function createUser(input: CreateUserInput) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(input.email)) throw new ValidationError('Invalid email format');
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError('User with this email already exists', 409, 'USER_EXISTS');
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      password_hash: passwordHash,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      tenant_id: input.tenantId,
      status: 'ACTIVE',
    },
  });
  if (input.roleIds?.length) {
    await prisma.userRole.createMany({
      data: input.roleIds.map((roleId) => ({ user_id: user.id, role_id: roleId, tenant_id: input.tenantId })),
    });
  }
  return user;
}

export async function updateUser(id: string, tenantId: string, input: UpdateUserInput) {
  await getUserById(id, tenantId);
  return prisma.user.update({
    where: { id },
    data: { first_name: input.firstName, last_name: input.lastName, phone: input.phone, status: input.status as any },
  });
}

export async function deleteUser(id: string, tenantId: string) {
  await getUserById(id, tenantId);
  await prisma.user.update({ where: { id }, data: { status: 'DELETED' } });
  return { success: true };
}

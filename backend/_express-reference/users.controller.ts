/**
 * Users Controller
 */

import { Request, Response } from 'express';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler';
import { listUsers, getUserById, createUser, updateUser, deleteUser } from './users.service';
import { AuthRequest } from '../../middleware/authenticate';

export const listUsersController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit } = req.query;
  const result = await listUsers(req.tenantId!, Number(page) || 1, Number(limit) || 20);
  res.json(result);
});

export const getUserController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await getUserById(req.params.id, req.tenantId!);
  res.json({ data: user });
});

export const createUserController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, password, firstName, lastName, phone, roleIds } = req.body;
  if (!email || !password) throw new ValidationError('Email and password required');
  const user = await createUser({ email, password, firstName, lastName, phone, tenantId: req.tenantId!, roleIds });
  res.status(201).json({ data: user, message: 'User created' });
});

export const updateUserController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { firstName, lastName, phone, status } = req.body;
  const user = await updateUser(req.params.id, req.tenantId!, { firstName, lastName, phone, status });
  res.json({ data: user, message: 'User updated' });
});

export const deleteUserController = asyncHandler(async (req: AuthRequest, res: Response) => {
  await deleteUser(req.params.id, req.tenantId!);
  res.json({ message: 'User deleted' });
});

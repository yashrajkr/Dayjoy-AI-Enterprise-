/**
 * Users Routes
 */

import { Router } from 'express';
import { listUsersController, getUserController, createUserController, updateUserController, deleteUserController } from './users.controller';
import { authenticate, requirePermission } from '../../middleware/authenticate';

export const usersRouter = Router();

usersRouter.use(authenticate);

// GET /api/users - List users
usersRouter.get('/', requirePermission('users', 'read'), listUsersController);

// GET /api/users/:id - Get user
usersRouter.get('/:id', requirePermission('users', 'read'), getUserController);

// POST /api/users - Create user
usersRouter.post('/', requirePermission('users', 'create'), createUserController);

// PUT /api/users/:id - Update user
usersRouter.put('/:id', requirePermission('users', 'update'), updateUserController);

// DELETE /api/users/:id - Delete user
usersRouter.delete('/:id', requirePermission('users', 'delete'), deleteUserController);

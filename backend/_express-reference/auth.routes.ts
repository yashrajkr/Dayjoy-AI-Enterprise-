/**
 * Authentication Routes
 * 
 * Routes for user authentication and session management.
 */

import { Router } from 'express';
import {
  registerController,
  loginController,
  refreshTokenController,
  logoutController,
  logoutAllController,
  getCurrentUserController,
} from './auth.controller';
import { authenticate } from '../../middleware/authenticate';

// =====================================
// Router
// =====================================

export const authRouter = Router();

// =====================================
// Public Routes
// =====================================

// POST /api/auth/register - Register new user
authRouter.post('/register', registerController);

// POST /api/auth/login - Login user
authRouter.post('/login', loginController);

// POST /api/auth/refresh - Refresh access token
authRouter.post('/refresh', refreshTokenController);

// =====================================
// Protected Routes
// =====================================

// POST /api/auth/logout - Logout user
authRouter.post('/logout', authenticate, logoutController);

// POST /api/auth/logout-all - Logout all sessions
authRouter.post('/logout-all', authenticate, logoutAllController);

// GET /api/auth/me - Get current user
authRouter.get('/me', authenticate, getCurrentUserController);

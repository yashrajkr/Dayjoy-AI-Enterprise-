/**
 * Authentication Controller
 * 
 * Handles HTTP requests for authentication.
 */

import { Request, Response, NextFunction } from 'express';
import { register, login, refreshToken, logout, logoutAllSessions } from './auth.service';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler';
import { prisma } from '../../lib/prisma';

// =====================================
// Types
// =====================================

interface AuthRequest extends Request {
  user?: {
    userId: string;
    tenantId: string;
    email: string;
  };
}

// =====================================
// Register
// =====================================

export const registerController = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, phone, tenantId } = req.body;

  // Validate input
  if (!email || !password || !tenantId) {
    throw new ValidationError('Email, password, and tenantId are required');
  }

  // Register user
  const result = await register({
    email,
    password,
    firstName,
    lastName,
    phone,
    tenantId,
  });

  // Set refresh token in cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Send response
  res.status(201).json({
    message: 'User registered successfully',
    data: result,
  });
});

// =====================================
// Login
// =====================================

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, tenantId } = req.body;

  // Validate input
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Get tenant from header or body
  const tenant = tenantId || req.headers['x-tenant-id'] as string;
  if (!tenant) {
    throw new ValidationError('Tenant ID is required');
  }

  // Login user
  const result = await login({ email, password }, tenant);

  // Set refresh token in cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Send response
  res.json({
    message: 'Login successful',
    data: result,
  });
});

// =====================================
// Refresh Token
// =====================================

export const refreshTokenController = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  // Refresh token
  const result = await refreshToken(refreshToken);

  // Set new refresh token in cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Send response
  res.json({
    message: 'Token refreshed successfully',
    data: {
      accessToken: result.accessToken,
    },
  });
});

// =====================================
// Logout
// =====================================

export const logoutController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken && req.user) {
    await logout(req.user.userId, refreshToken);
  }

  // Clear refresh token cookie
  res.clearCookie('refreshToken');

  // Send response
  res.json({
    message: 'Logout successful',
  });
});

// =====================================
// Logout All Sessions
// =====================================

export const logoutAllController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user) {
    await logoutAllSessions(req.user.userId);
  }

  // Clear refresh token cookie
  res.clearCookie('refreshToken');

  // Send response
  res.json({
    message: 'All sessions logged out successfully',
  });
});

// =====================================
// Get Current User
// =====================================

export const getCurrentUserController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  // Get user with roles
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new ValidationError('User not found');
  }

  // Send response
  res.json({
    data: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      tenantId: user.tenant_id,
      roles: user.userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        permissions: ur.role.rolePermissions.map((rp) => ({
          resource: rp.permission.resource,
          action: rp.permission.action,
        })),
      })),
    },
  });
});

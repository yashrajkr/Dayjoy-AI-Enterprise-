/**
 * Authentication Middleware
 * 
 * Verifies JWT tokens and sets user context.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../modules/auth/auth.service';
import { UnauthorizedError, ForbiddenError } from './errorHandler';

// =====================================
// Types
// =====================================

export interface AuthRequest extends Request {
  user?: TokenPayload;
  tenantId?: string;
}

// =====================================
// Authentication Middleware
// =====================================

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = verifyToken(token);

    // Set user in request
    req.user = payload;
    req.tenantId = payload.tenantId;

    next();
  } catch (error) {
    next(error);
  }
}

// =====================================
// Optional Authentication Middleware
// =====================================

export function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      req.user = payload;
      req.tenantId = payload.tenantId;
    }

    next();
  } catch (error) {
    next();
  }
}

// =====================================
// Permission Check Middleware
// =====================================

export function requirePermission(resource: string, action: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    throw new ForbiddenError(`Permission denied: ${action} ${resource}`);
  };
}

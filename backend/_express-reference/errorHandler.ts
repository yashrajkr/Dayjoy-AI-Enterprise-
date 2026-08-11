/**
 * Error Handler Middleware
 * 
 * Centralized error handling for the application.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

// =====================================
// Custom Error Classes
// =====================================

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

// =====================================
// Error Handler Middleware
// =====================================

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Log error
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    return res.status(400).json({
      error: 'Database Error',
      message: prismaError.message,
      code: prismaError.code,
    });
  }

  // Handle AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.code || 'ERROR',
      message: err.message,
    });
  }

  // Handle unknown errors
  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: config.nodeEnv === 'development' ? err.message : 'Internal server error',
  });
}

// =====================================
// Async Handler Wrapper
// =====================================

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

import { config } from '../config';

/**
 * Request Logger Middleware
 * 
 * Logs all incoming requests with timing information.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

// =====================================
// Request Logger Middleware
// =====================================

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, path, headers } = req;

  // Log request
  logger.http(`${method} ${path}`, {
    headers: {
      'user-agent': headers['user-agent'],
      'x-forwarded-for': headers['x-forwarded-for'],
    },
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    logger.http(`${method} ${path} ${statusCode}`, {
      duration: `${duration}ms`,
      status: statusCode,
    });
  });

  next();
}

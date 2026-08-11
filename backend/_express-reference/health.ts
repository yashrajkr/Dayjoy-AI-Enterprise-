/**
 * Health Check Routes
 * 
 * Health check endpoints for monitoring and load balancers.
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { config } from '../config';

// =====================================
// Router
// =====================================

export const healthRouter = Router();

// =====================================
// Health Check
// =====================================

healthRouter.get('/', async (req, res) => {
  const timestamp = new Date().toISOString();

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp,
      version: config.version,
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp,
      error: 'Database connection failed',
    });
  }
});

// =====================================
// Readiness Check
// =====================================

healthRouter.get('/ready', async (req, res) => {
  const timestamp = new Date().toISOString();

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ready',
      timestamp,
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp,
      error: 'Database connection failed',
    });
  }
});

// =====================================
// Liveness Check
// =====================================

healthRouter.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

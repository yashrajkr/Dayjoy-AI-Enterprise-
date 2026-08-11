/**
 * Dayjoy Enterprise AI Platform - Entry Point
 * 
 * This is the main entry point for the application.
 * It initializes the Express server, Prisma client, and middleware.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { config } from './config';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { productsRouter } from './routes/products';
import { customersRouter } from './routes/customers';
import { ordersRouter } from './routes/orders';
import { leadsRouter } from './routes/leads';
import { aiRouter } from './routes/ai';
import { ragRouter } from './routes/rag';

// =====================================
// Prisma Client
// =====================================

export const prisma = new PrismaClient({
  log: config.nodeEnv === 'development' 
    ? ['query', 'error', 'warn', 'info'] 
    : ['error'],
});

// =====================================
// Express App
// =====================================

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: config.uploadMaxSize }));
app.use(express.urlencoded({ extended: true, limit: config.uploadMaxSize }));
app.use(requestLogger);

// Health check
app.use('/health', healthRouter);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/products', productsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/rag', ragRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Dayjoy Enterprise AI Platform',
    version: config.version,
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// =====================================
// Server Start
// =====================================

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('✅ Database connected');

    // Start server
    app.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`📍 Environment: ${config.nodeEnv}`);
      logger.info(`📍 URL: http://localhost:${config.port}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// =====================================
// Graceful Shutdown
// =====================================

async function gracefulShutdown(signal: string) {
  logger.info(`\n🛑 Received ${signal}. Shutting down gracefully...`);

  try {
    // Close Prisma connections
    await prisma.$disconnect();
    logger.info('✅ Database connections closed');

    // Close server
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start server
startServer();

export { app, prisma };

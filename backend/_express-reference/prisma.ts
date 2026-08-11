/**
 * Prisma Client Singleton
 * 
 * Prevents multiple Prisma Client instances in development.
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../config';

// =====================================
// Global Prisma Client
// =====================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// =====================================
// Create or Reuse Prisma Client
// =====================================

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.nodeEnv === 'development'
      ? ['query', 'error', 'warn', 'info']
      : ['error'],
  });

// =====================================
// Store in Global for Hot Reload
// =====================================

if (config.nodeEnv === 'development') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

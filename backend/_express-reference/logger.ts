/**
 * Logger Utility
 * 
 * Centralized logging with Winston.
 */

import winston from 'winston';
import { config } from '../config';

// =====================================
// Logger Configuration
// =====================================

const logFormat = config.logFormat === 'pretty'
  ? winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    )
  : winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    );

// =====================================
// Create Logger
// =====================================

export const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
  defaultMeta: {
    service: 'dayjoy-enterprise-ai',
    version: config.version,
  },
});

export type Logger = typeof logger;

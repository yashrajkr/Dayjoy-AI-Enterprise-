import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';

/**
 * Sensitive field names whose log payload values are scrubbed before emission.
 * Used by the redaction format below.
 */
const REDACT_KEYS = [
  'password',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'authorization',
  'accessToken',
  'refreshToken',
  'cookie',
];

/**
 * Winston-backed implementation of `LoggerService`.
 *
 * - In `production` logs are emitted as structured JSON (one object per line)
 *   so they can be ingested by Loki / CloudWatch / Datadog without parsing.
 * - In non-production environments the console transport is colorised and
 *   pretty-printed for developer ergonomics.
 * - Every record carries a `timestamp`, `service` tag, and — when attached to
 *   a request — a `requestId` (set by `RequestIdMiddleware` via async-aware
 *   `defaultMeta`). All sensitive fields are recursively scrubbed.
 */
@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly logger: winston.Logger;

  constructor(private readonly config: ConfigService) {
    const level = config.get<string>('LOG_LEVEL') ?? 'info';
    const isProd = config.get<string>('NODE_ENV') === 'production';

    const redactFormat = winston.format((info: any) => {
      return this.redact(info);
    });

    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        redactFormat(),
        winston.format.json(),
      ),
      defaultMeta: { service: 'dayjoy-backend' },
      transports: [
        new winston.transports.Console({
          format: isProd
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
              ),
        }),
      ],
    });
  }

  log(message: string, context?: any): void {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: any, context?: any): void {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: any): void {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: any): void {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: any): void {
    this.logger.verbose(message, { context });
  }

  /**
   * Recursively walks a log info object and replaces values of sensitive keys
   * with `[REDACTED]`. Returns the mutated object so it can be chained as a
   * winston format.
   */
  private redact(info: any): any {
    if (info == null || typeof info !== 'object') return info;

    const walk = (value: any): any => {
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const key of Object.keys(value)) {
          if (REDACT_KEYS.includes(key)) {
            out[key] = '[REDACTED]';
          } else {
            out[key] = walk(value[key]);
          }
        }
        return out;
      }
      return value;
    };

    return walk(info);
  }
}

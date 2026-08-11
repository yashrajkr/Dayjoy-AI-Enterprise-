import { z } from 'zod';

/**
 * Environment variable schema. Validated at app startup by ConfigModule.
 *
 * Notes:
 *  - `CORS_ORIGIN` and `CORS_ORIGINS` are both accepted. `CORS_ORIGINS` is a
 *    comma-separated list and takes precedence when present. `main.ts` reads
 *    `CORS_ORIGINS` directly off `process.env` so it is also kept in the
 *    schema for documentation.
 *  - `REDIS_URL` is required by the security module (JWT blocklist + rate
 *    limiter + OAuth2 state). It is marked optional here so the schema
 *    doesn't fail in test environments that monkey-patch the module.
 *  - `LOG_LEVEL` defaults to `info`.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  VERSION: z.string().default('1.0.0'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  SESSION_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().optional(),
  UPLOAD_MAX_SIZE: z.coerce.number().default(10485760),
  REDIS_URL: z.string().url().optional(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type EnvVars = z.infer<typeof envSchema>;

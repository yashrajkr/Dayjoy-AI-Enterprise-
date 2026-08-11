import { z } from 'zod';

const envSchema = z.object({
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
  UPLOAD_MAX_SIZE: z.coerce.number().default(10485760),
});

const env = envSchema.parse(process.env);

export const config = {
  databaseUrl: env.DATABASE_URL,
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  appUrl: env.APP_URL,
  version: env.VERSION,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  sessionSecret: env.SESSION_SECRET,
  openaiApiKey: env.OPENAI_API_KEY,
  openaiModel: env.OPENAI_MODEL,
  corsOrigin: env.CORS_ORIGIN,
  uploadMaxSize: env.UPLOAD_MAX_SIZE,
};

export type Config = typeof config;

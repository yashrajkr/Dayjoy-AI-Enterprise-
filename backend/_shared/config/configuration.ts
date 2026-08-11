export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  version: process.env.VERSION ?? '1.0.0',

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  },

  session: {
    secret: process.env.SESSION_SECRET,
  },

  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    origins: process.env.CORS_ORIGINS,
  },

  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE ?? '10485760', 10),
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? 'gpt-4',
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  log: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});

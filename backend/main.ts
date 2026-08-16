// Must run before any other import: `VapiConfig`/`DEFAULT_VAPI_CONFIG` (and
// similar env-eval-at-import-time config objects) read `process.env`
// directly at module-eval time. In dev, load .env file; in production (Docker),
// env vars are passed at runtime.
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv/config');
  } catch (e) {
    // dotenv not available; proceed without it
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { json, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './_shared/database/prisma.service';
import { AppLoggerService } from './_shared/logging/logging.service';

/**
 * Application bootstrap.
 *
 * Wires every global cross-cutting concern in the correct order:
 *
 *  1. **Logger** — `AppLoggerService` (Winston-backed, with PII redaction) is
 *     promoted to the application logger so that `Logger.log(...)` calls
 *     anywhere in the framework flow through Winston. Logs are buffered
 *     until the logger is ready (`bufferLogs: true`).
 *  2. **Body parsers** — `json` + `urlencoded` with a 10 MB limit so RAG
 *     document uploads (base64-encoded) fit in a single request. `rawBody`
 *     is enabled so webhook signature verification (Vapi, WhatsApp) can
 *     access the original bytes.
 *  3. **Security** — `helmet` for CSP/HSTS/COOP/COEP, plus `compression`
 *     (gzip) for response payloads > 1 KB.
 *  4. **CORS** — `enableCors` with explicit origin allow-list, methods,
 *     allowed/exposed headers, and `credentials: true` for cookie-based
 *     auth (if/when introduced).
 *  5. **Rate limiting** — IP-based global limiter on `/api/*` (100 req /
 *     15 min) and a stricter one on `/api/auth/*` (10 req / 15 min) to
 *     blunt credential brute-force.
 *  6. **Global pipes** — `ValidationPipe` with `whitelist`,
 *     `forbidNonWhitelisted`, and `transform: true` so DTOs enforce the
 *     request contract and expose typed values.
 *  7. **Swagger** — `/docs` is mounted in every non-production environment
 *     (dev + staging) with bearer-auth + tagged endpoints. Disabled in
 *     `production` to avoid leaking the API surface to scanners.
 *  8. **Graceful shutdown** — `enableShutdownHooks()` translates SIGTERM /
 *     SIGINT into `app.close()` so `OnModuleDestroy` hooks (Prisma
 *     `$disconnect`, Redis `quit`) run before the process exits.
 *
 * Note on global API prefix: the existing controllers (auth, users, etc.)
 * already include the `api/` prefix in their `@Controller('api/...')`
 * declaration, so we intentionally do NOT call `app.setGlobalPrefix('api')`
 * — doing so would double the prefix (`/api/api/auth/...`).
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // ---- Structured logger (Winston-backed, PII redaction) -------------
  // Promote the AppLoggerService to the application logger so every
  // `Logger.log(...)` call (framework + user code) flows through Winston.
  const appLogger = app.get(AppLoggerService);
  app.useLogger(appLogger);

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const port = configService.get<number>('PORT') ?? 3000;
  const env = configService.get<string>('NODE_ENV') ?? 'development';

  // ---- Trust proxy -----------------------------------------------------
  // Render (like Heroku/Fly/any PaaS behind a load balancer) terminates
  // TLS and forwards requests with an `X-Forwarded-For` header. Without
  // this, Express's default `trust proxy: false` makes express-rate-limit's
  // X-Forwarded-For validation throw (`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`),
  // which was surfacing as intermittent 500s on `/api/*` routes. `1` trusts
  // exactly one hop (Render's edge proxy), which also makes `req.ip` /
  // `express-rate-limit`'s IP-based keying reflect the real client IP
  // instead of Render's internal proxy IP.
  app.set('trust proxy', 1);

  // ---- Body parsers --------------------------------------------------
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // ---- Security headers (helmet) + gzip ------------------------------
  app.use(
    helmet({
      // In production, helmet's default CSP is enabled. In dev, CSP is
      // disabled so Swagger UI and the Vite dev server don't get blocked.
      contentSecurityPolicy:
        env === 'production'
          ? undefined
          : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  // ---- CORS ----------------------------------------------------------
  const corsRaw =
    configService.get<string>('CORS_ORIGINS') ??
    configService.get<string>('CORS_ORIGIN') ??
    'http://localhost:3000';
  const allowedOrigins = corsRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow same-origin / no-origin requests (curl, server-to-server).
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy violation: ${origin}`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Tenant-Id',
      'X-Requested-With',
    ],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 3600,
  });

  // ---- Rate limiting -------------------------------------------------
  // Global IP-based limiter on /api/* (100 req / 15 min).
  app.use(
    '/api/',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: configService.get<number>('RATE_LIMIT_API_MAX') ?? 100,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later.',
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Stricter limiter on auth endpoints (10 req / 15 min) to blunt
  // credential brute-force.
  app.use(
    '/api/auth/',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: configService.get<number>('RATE_LIMIT_AUTH_MAX') ?? 10,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts, please try again later.',
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // ---- Global validation pipe ---------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ---- Swagger (dev + staging only) ---------------------------------
  if (env !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Dayjoy AI Enterprise API')
      .setDescription(
        'Enterprise AI platform API — authentication, CRM, AI agents, ' +
          'RAG knowledge base, analytics, and admin operations.',
      )
      .setVersion(configService.get<string>('VERSION') ?? '1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT access token (without the `Bearer ` prefix)',
          in: 'header',
        },
        'access-token',
      )
      .addTag('auth', 'Authentication & authorization')
      .addTag('users', 'User management')
      .addTag('customers', 'Customer management')
      .addTag('distributors', 'Distributor management')
      .addTag('products', 'Product catalog')
      .addTag('orders', 'Order management')
      .addTag('ai', 'AI agents & conversations')
      .addTag('knowledge', 'Knowledge base & RAG')
      .addTag('analytics', 'Analytics & metrics')
      .addTag('admin', 'Admin operations')
      .addTag('notifications', 'Notifications')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    });
  }

  // ---- Graceful shutdown --------------------------------------------
  // Wires Prisma's `$disconnect` to Nest's lifecycle. The PrismaService
  // also installs its own SIGTERM/SIGINT handlers as a backstop in case
  // `enableShutdownHooks()` is ever removed.
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);
  app.enableShutdownHooks();

  // ---- Start ---------------------------------------------------------
  await app.listen(port);

  logger.log(
    `🚀 Dayjoy AI Enterprise backend running on port ${port} (${env})`,
  );
  if (env !== 'production') {
    logger.log(`📚 API docs:      http://localhost:${port}/docs`);
  }
  logger.log(`❤️  Health:        http://localhost:${port}/health`);
  logger.log(`📊 Metrics:       http://localhost:${port}/metrics`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap application:', err);
  process.exit(1);
});

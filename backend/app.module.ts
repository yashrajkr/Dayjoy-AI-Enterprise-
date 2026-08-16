import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';

// ---- Shared infrastructure (cross-cutting) ---------------------------
import { ConfigModule } from './_shared/config/config.module';
import { PrismaModule } from './_shared/database/prisma.module';
import { SecurityModule } from './_shared/security/security.module';
import { HealthModule } from './_shared/health/health.module';
import { MetricsModule } from './_shared/metrics/metrics.module';
import { LoggingModule } from './_shared/logging/logging.module';
import { SharedAiModule } from './_shared/ai/ai.module';
import {
  CommonModule,
  AllExceptionsFilter,
  TransformInterceptor,
  TimeoutInterceptor,
  LoggingInterceptor,
  RequestLoggingMiddleware,
  SecurityMiddleware,
  TenantMiddleware,
  RolesGuard,
} from './_shared/common';

// ---- Middleware (cross-module imports) -------------------------------
import { RequestIdMiddleware } from './_shared/logging/request-id.middleware';

// ---- Interceptors from other shared modules --------------------------
import { MetricsInterceptor } from './_shared/metrics/metrics.interceptor';

// ---- Feature modules -------------------------------------------------
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployeesModule } from './employees/employees.module';
import { CustomersModule } from './customers/customers.module';
import { DistributorsModule } from './distributors/distributors.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AiModule } from './ai/ai.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';
import { WebsiteChatModule } from './website-chat/website-chat.module';

// ---- Cross-cutting feature modules (sibling packages) ----------------
// RAG lives in the sibling `../rag/` workspace package. `RagModule` wires
// every ingestion-side + query-side RAG service (Loaders, Chunking,
// Ingestion, Embeddings, VectorStore, Retrieval, ContextBuilder,
// PromptAssembly, LLMGateway, ResponseProcessing, ResponsePipeline,
// Search, ConversationMemory).
//
// `EvaluationModule` + `RagSecurityModule` live in `../rag/` too but are
// NOT re-exported by `RagModule` (they're independently-importable
// sub-modules), so we import them explicitly here to make
// `EvaluationService` + `DocumentPermissionsService` + the RAG guard /
// tenant-isolation interceptor available app-wide.
import { RagModule } from '../rag/rag.module';
import { EvaluationModule } from '../rag/evaluation/evaluation.module';
import { RagSecurityModule } from '../rag/security/security.module';

// ---- Vapi (Voice AI) — Agent 3 deliverable ---------------------------
// `VapiModule` is the root entry-point for the Voice AI subsystem
// (created by Agent 3). It wires:
//   - VapiConfigModule     → VapiClientService + VapiConfig (from env)
//   - VapiAssistantsModule → VapiAssistantService + REST controller
//   - VapiToolsModule      → 8 voice tools + VapiToolRegistry
//
// `VapiModule` itself imports `PrismaModule` + `SharedAiModule` from
// `../backend/_shared/...` (both `@Global()`-scoped, so the re-import is
// redundant but explicit). `VapiToolsModule` transitively imports
// `KnowledgeModule`, `ProductsModule`, `CustomersModule`,
// `DistributorsModule`, and `NotificationsModule` — using `forwardRef()`
// defensively in case any of those modules ever gain a back-reference
// (none today, but the vapi author wanted insulation from import-order
// surprises). The DI graph still resolves cleanly with no `forwardRef`
// required at the app-module level.
//
// The earlier standalone prototype at `../vapi/config/vapi.module.ts` is
// intentionally NOT imported here — it has no controllers / providers that
// integrate with the NestJS DI graph and would collide with the
// `VapiConfigModule` declared inside the production `VapiModule`.
import { VapiModule } from '../vapi/vapi.module';

// ---- WhatsApp AI — Agent W1 deliverable ------------------------------
// `WhatsAppModule` is the root entry-point for the WhatsApp AI subsystem
// (sibling `../whatsapp-ai/` package, created by Agent W1 / whatsapp-agent-w1-core).
// It wires:
//   - WhatsAppConfigModule  → WhatsAppConfigService (env config + token management)
//   - WhatsAppClientModule  → WhatsAppClientService (Meta Cloud API wrapper)
//   - WhatsAppWebhookModule → webhook controller (GET verify + POST receive) +
//                             service (signature verify + dispatch) + 3 typed
//                             handlers (message / status / error)
//   - WhatsAppServicesModule→ WhatsAppMessageProcessor (the AI pipeline that
//                             reuses the shared OPENAI_CLIENT + ToolsService)
//                             + WhatsAppSessionMemory (Redis-backed)
//
// Architecture: the WhatsApp channel is **just another entry point** over
// the shared AI core — same agents, same RAG pipeline, same tools, same
// memory, same database. `WhatsAppMessageProcessor` injects the shared
// `OPENAI_CLIENT` (from `SharedAiModule`) + `ToolsService` (from `AiModule`,
// re-exported via `WhatsAppServicesModule`) — exactly the same tool
// registry Voice (Vapi) and Website Chat use.
//
// Routes exposed:
//   GET  /api/whatsapp/webhook         — Meta subscription verification
//   POST /api/whatsapp/webhook         — inbound messages + statuses + errors
//   GET  /api/whatsapp/webhook/health  — lightweight health probe
//
// All three routes are `@Public()` — Meta cannot attach a JWT. Security is
// enforced via the HMAC-SHA256 signature on the App Secret (unconditional
// in non-test environments, same policy as the Vapi webhook).
//
// NOTE(audit-fix-backend): `WhatsAppModule` is now IMPLEMENTED (audit-fix-p0-missing-modules).
// The `whatsapp-ai/` package contains the full NestJS module: config +
// client + webhook controller/service/handlers + AI message processor.
// See `whatsapp-ai/whatsapp.module.ts` for the wiring.
import { WhatsAppModule } from '../whatsapp-ai/whatsapp.module';

/**
 * Root application module.
 *
 * Wires every shared infrastructure module + every feature module, and
 * registers the global filters / interceptors / guards in the order
 * they're evaluated at request time.
 *
 * ## Request lifecycle (top → bottom)
 *
 *  1. **Middleware** (`AppModule.configure()`):
 *     `RequestIdMiddleware` → `SecurityMiddleware` → `TenantMiddleware`
 *     → `RequestLoggingMiddleware`
 *  2. **Guards** (top-most first):
 *     - `RolesGuard` (global `APP_GUARD`) — no-op unless `@Roles()` set
 *  3. **Interceptors** (top-most first):
 *     - `MetricsInterceptor` — observes latency + counts requests
 *     - `LoggingInterceptor` — emits per-handler log line
 *     - `TimeoutInterceptor` — aborts handlers > 30s
 *     - `TransformInterceptor` — wraps response in `ApiResponse` envelope
 *  4. **Pipes** (registered in `main.ts`):
 *     - `ValidationPipe` (whitelist + transform)
 *  5. **Controller** handler runs
 *  6. **Interceptors** (reverse order, on the response stream)
 *  7. **Filters** (only if an exception was thrown):
 *     - `AllExceptionsFilter` — formats error into `ApiResponse` envelope
 *
 * ## Why `RolesGuard` and not `JwtAuthGuard` as the global guard?
 *
 * `JwtAuthGuard` would require every public route (`/health`, `/api/auth/login`,
 * `/api/auth/register`, ...) to carry `@Public()` — but the existing auth
 * controller was written before `@Public()` existed, so wiring `JwtAuthGuard`
 * globally would block every unauthenticated endpoint. We therefore leave
 * `JwtAuthGuard` as a per-controller/per-route opt-in (`@UseGuards(JwtAuthGuard)`),
 * and keep `RolesGuard` (which is a no-op unless `@Roles()` is set) as the
 * global APP_GUARD.
 *
 * When `_shared/auth/` (Agent A's deliverable) lands and the auth controller
 * is updated to use `@Public()` on the open routes, the wiring can be flipped
 * to register `JwtAuthGuard` globally and `RolesGuard` as a downstream guard.
 */
@Module({
  imports: [
    // ---- Global config (env vars + validation) ---------------------
    ConfigModule,

    // ---- Shared infrastructure (all @Global() inside their own module)
    PrismaModule,
    LoggingModule,
    SecurityModule,
    SharedAiModule,
    HealthModule,
    MetricsModule,
    CommonModule,

    // ---- Feature modules -------------------------------------------
    AuthModule,
    UsersModule,
    EmployeesModule,
    CustomersModule,
    DistributorsModule,
    ProductsModule,
    OrdersModule,
    NotificationsModule,
    KnowledgeModule,
    AiModule,
    AnalyticsModule,
    AdminModule,
    WebsiteChatModule,

    // ---- Cross-cutting feature modules (sibling `../rag/` package) --
    // RAG ingestion + query pipeline (Loaders, Chunking, Ingestion,
    // Embeddings, VectorStore, Retrieval, ContextBuilder, PromptAssembly,
    // LLMGateway, ResponseProcessing, ResponsePipeline, Search,
    // ConversationMemory). Re-exported for downstream feature modules
    // (AiModule's ConversationsService, KnowledgeService, etc.).
    RagModule,
    // RAG evaluation endpoints + `EvaluationService` (offline query
    // evaluation, hallucination detection, recall/precision metrics).
    EvaluationModule,
    // RAG document-permission service + tenant-isolation guard +
    // interceptor. Imported here so feature modules can `@UseGuards(
    // RagSecurityGuard)` / `@UseInterceptors(TenantIsolationInterceptor)`
    // without each having to import this module.
    RagSecurityModule,

    // ---- Vapi (Voice AI) ----------------------------------------------
    // Root module for the Voice AI subsystem (sibling `../vapi/` package).
    // Re-exports `VapiConfigModule`, `VapiAssistantsModule`, and
    // `VapiToolsModule` so feature modules that want to call into the
    // voice stack (e.g. AiModule's conversation flows, future WhatsApp /
    // web-chat bridges) can grab any service they need.
    VapiModule,

    // ---- WhatsApp AI --------------------------------------------------
    // Root module for the WhatsApp AI subsystem (sibling
    // `../whatsapp-ai/` package). Mirrors `VapiModule`'s shape: a
    // config module + a client module + a webhook module + a services
    // module. The webhook module exposes
    // `GET/POST /api/whatsapp/webhook` (Meta's webhook URL).
    //
    // The WhatsApp AI reuses the shared AI core (OPENAI_CLIENT,
    // ToolsService, RAG) — it does NOT spin up a separate AI system.
    WhatsAppModule,
  ],
  controllers: [AppController],
  providers: [
    // Global exception filter — formats every error as a standard envelope.
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Global interceptors (registered in execution order — NestJS invokes
    // them top-to-bottom on the request path, bottom-to-top on response).
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Global guard — RolesGuard is a no-op unless @Roles() is set on the
    // handler/class. See class docstring for the rationale on NOT also
    // registering JwtAuthGuard globally.
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Single .apply() call with all middleware — NestJS preserves the order
    // of the variadic args. The previous `.apply(A).apply(B)` pattern was a
    // bug that silently dropped the second middleware.
    consumer
      .apply(
        RequestIdMiddleware,
        SecurityMiddleware,
        TenantMiddleware,
        RequestLoggingMiddleware,
      )
      .forRoutes('*');
  }
}

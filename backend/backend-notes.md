# Backend Wiring Notes

> Task `verify-backend-wiring` — full-stack-developer agent.
>
> Documents the changes made to wire the missing feature modules
> (`EmployeesModule`, `RagModule`, `EvaluationModule`, `RagSecurityModule`)
> into `backend/app.module.ts`, plus the supporting `tsconfig.json` /
> `package.json` updates needed so TypeScript can resolve imports from the
> sibling `../rag/` workspace package.

---

## 1. What was broken before

`backend/app.module.ts` was wiring **11 feature modules + 8 shared
infrastructure modules**, but four deliverables that had landed in the
repo were never wired into the running NestJS app:

| Module | Source file | Status before this task |
|--------|-------------|-------------------------|
| `EmployeesModule` | `backend/employees/employees.module.ts` | Existed, exported `EmployeesService`, but **NOT imported** in `app.module.ts` — the `/api/employees/*` endpoints were unreachable. |
| `RagModule` | `../rag/rag.module.ts` | Existed, exported all 11 ingestion + query services, but **NOT imported** in `app.module.ts`. |
| `EvaluationModule` | `../rag/evaluation/evaluation.module.ts` | Existed, exported `EvaluationService`, but **NOT imported** in `app.module.ts` — the `/api/rag/evaluation/*` endpoints were unreachable. (Documented as out-of-scope by RAG Agent H.) |
| `RagSecurityModule` | `../rag/security/security.module.ts` | Existed, exported `DocumentPermissionsService` + `RagSecurityGuard` + `TenantIsolationInterceptor`, but **NOT imported** in `app.module.ts`. (Documented as out-of-scope by RAG Agent H.) |
| `VapiModule` | `../vapi/vapi.module.ts` (planned) | Does **not** exist yet — Agent 3 will create it. The earlier prototype at `../vapi/config/vapi.module.ts` is intentionally NOT imported (it's a standalone prototype with no NestJS DI integration). |

---

## 2. Module import order (`app.module.ts` `imports` array)

The `imports` array now follows a strict three-tier order so the DI graph
resolves top-to-bottom with no `forwardRef` required at the app-module
level:

```
1. Shared infrastructure (all @Global() inside their own module)
   ├── ConfigModule          (env vars + zod validation)
   ├── PrismaModule          (@Global, provides PrismaService)
   ├── LoggingModule         (Winston + PII redaction)
   ├── SecurityModule        (Redis, rate limit, JWT blocklist, permissions)
   ├── SharedAiModule        (@Global, provides OPENAI_CLIENT)
   ├── HealthModule          (Terminus /health/*)
   ├── MetricsModule         (Prometheus /metrics)
   └── CommonModule          (filters, interceptors, middleware, RolesGuard)

2. Feature modules (backend/* — tenant-scoped REST APIs)
   ├── AuthModule            (login, register, refresh, password reset)
   ├── UsersModule           (user CRUD)
   ├── EmployeesModule       (employee-role user CRUD)            ← NEW
   ├── CustomersModule       (customer + address CRUD)
   ├── DistributorsModule    (distributor CRUD + performance)
   ├── ProductsModule        (product catalog + inventory + categories)
   ├── OrdersModule          (order CRUD + items + status + payment)
   ├── NotificationsModule   (notification templates + provider fanout)
   ├── KnowledgeModule       (knowledge sources/articles CRUD + RAG search)
   ├── AiModule              (agents, conversations, memory, tools)
   ├── AnalyticsModule       (KPI roll-ups + event recording)
   └── AdminModule           (tenant config, audit logs, role mgmt)

3. Cross-cutting feature modules (sibling ../rag/ package)
   ├── RagModule             (ingestion + query RAG pipeline)     ← NEW
   ├── EvaluationModule      (offline RAG evaluation endpoints)   ← NEW
   ├── RagSecurityModule     (RAG doc-permissions + guard)        ← NEW
   └── VapiModule            (voice AI — pending Agent 3)         ← COMMENTED
```

### Why `RagModule` is imported AFTER `AiModule` + `KnowledgeModule`

`RagModule` exports every RAG service (`RetrievalService`,
`ResponsePipelineService`, etc.) that feature modules can inject. NestJS
resolves the DI graph lazily — the order in `imports` does not need to
match the dependency direction. Importing `RagModule` last keeps the
"first-party backend" modules grouped together and the "sibling package"
modules visually separated.

### Why `EvaluationModule` + `RagSecurityModule` are imported separately

`RagModule` deliberately does **not** re-export `EvaluationModule` or
`RagSecurityModule` (see the comments in `../rag/rag.module.ts`). They
are independently-importable sub-modules, so we import them explicitly in
`app.module.ts` to make:

  - `EvaluationService` — available for any feature module that wants to
    run an offline evaluation of a RAG query.
  - `DocumentPermissionsService` — available for `KnowledgeController`
    / any future RAG document controller to enforce per-document RBAC.
  - `RagSecurityGuard` + `TenantIsolationInterceptor` — available for
    per-controller `@UseGuards(...)` / `@UseInterceptors(...)`.

---

## 3. Circular dependencies

**No circular dependencies exist between `AiModule` and `KnowledgeModule`.**

Verified by grep:

- `backend/ai/ai.module.ts` imports `KnowledgeModule` (one-way).
- `backend/ai/tools.service.ts` injects `KnowledgeService` (one-way).
- `backend/knowledge/knowledge.module.ts` does NOT import `AiModule`.
- `backend/knowledge/knowledge.service.ts` does NOT import any AI
  service (`AiService`, `ConversationsService`, `MemoryService`,
  `ToolsService`).

Therefore **no `forwardRef` is required**. The DI graph resolves cleanly:

```
AiModule
   │
   ├── imports → KnowledgeModule
   │                  │
   │                  └── provides → KnowledgeService
   │                                       │
   └── ToolsService ───────────────────────┘  (constructor injection)
```

If a future change introduces a `KnowledgeModule → AiModule` dependency
(e.g. `KnowledgeService` calling `ConversationsService` for some
reasoning), use:

```typescript
// in ai.module.ts
@Module({
  imports: [forwardRef(() => KnowledgeModule)],
  ...
})

// in knowledge.module.ts
@Module({
  imports: [forwardRef(() => AiModule)],
  ...
})

// in the injecting service
constructor(
  @Inject(forwardRef(() => KnowledgeService))
  private readonly knowledge: KnowledgeService,
) {}
```

---

## 4. Path aliases (`backend/tsconfig.json`)

```jsonc
{
  "compilerOptions": {
    "rootDir": "..",          // <- NEW: backend + rag + vapi share rootDir
    "outDir": "./dist",       // unchanged
    "baseUrl": "./",
    "paths": {
      "@app/*":     ["./*"],
      "@shared/*":  ["./_shared/*"],
      "@rag/*":     ["../rag/*"],   // <- NEW
      "@vapi/*":    ["../vapi/*"]   // <- NEW (for Agent 3)
    }
  },
  "include": [
    "**/*.ts",
    "../rag/**/*.ts",   // <- NEW
    "../vapi/**/*.ts"   // <- NEW (for Agent 3)
  ]
}
```

### Why `rootDir` is now `..` (the project root)

`app.module.ts` imports `RagModule` from `'../rag/rag.module'`. TypeScript
follows that import and compiles every transitively-imported `rag/*.ts`
file alongside the `backend/*.ts` files. Because the input files now span
two sibling folders (`backend/` + `rag/`), TypeScript's auto-computed
`rootDir` would be the parent directory (`..`) anyway — setting it
explicitly avoids the TS6059 "File is not under rootDir" surprise if
anyone ever adds an explicit `rootDir: "."` later.

### Output layout change

With `rootDir: ".."` and `outDir: "./dist"`, the compiled output mirrors
the input structure relative to the project root:

```
backend/dist/
├── backend/         <- backend's compiled .js files
│   ├── main.js
│   ├── app.module.js
│   └── ...
└── rag/             <- rag's compiled .js files
    ├── rag.module.js
    └── ...
```

The `start:prod` script in `backend/package.json` was updated from
`node dist/main.js` to `node dist/backend/main.js` to match.

### `tsconfig.check.json`

The standalone type-check config (`tsconfig.check.json`, used by
`pnpm typecheck`) was updated with the same `rootDir` / `paths` /
`include` changes. It already had `noEmit: true` so its output is
unaffected.

---

## 5. `backend/package.json` verification

All required runtime + dev dependencies were already present (verified
against the task's checklist). No new deps were added.

| Dependency | Status |
|------------|--------|
| `@nestjs/swagger` | present (^7.4.0) |
| `class-validator` + `class-transformer` | present |
| `bcryptjs` + `@types/bcryptjs` | present |
| `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt` | present |
| `ioredis` | present (^5.4.1) |
| `openai` | present (^4.67.0) |
| `winston` | present (^3.13.0) |
| `prom-client` | present (^15.1.0) |
| `@nestjs/terminus` | present (^10.2.0) |
| `helmet`, `compression` | present |
| `pdf-parse`, `mammoth`, `cheerio`, `csv-parse`, `gpt-tokenizer` | present (RAG ingestion) |
| `vitest`, `@vitest/coverage-v8` | present (dev) |
| `@nestjs/testing` | present (dev) |
| `supertest`, `@types/supertest` | present (dev) |
| `typescript`, `tsx` | present (dev) |

### Script change

```diff
- "start:prod": "node dist/main.js",
+ "start:prod": "node dist/backend/main.js",
```

(`dist/main.js` → `dist/backend/main.js` because `rootDir` is now `..`.
See §4 for the rationale.)

---

## 6. VapiModule — pending Agent 3

`VapiModule` is intentionally **not** imported yet. The task description
specifies that Agent 3 will create `../vapi/vapi.module.ts`. The
placeholder import (commented out) and the placeholder array entry
(commented out) are both in `app.module.ts`:

```typescript
// import { VapiModule } from '../vapi/vapi.module';
// ...
// VapiModule,
```

When Agent 3 delivers `vapi/vapi.module.ts`, uncomment both lines. The
`tsconfig.json` `include` glob (`../vapi/**/*.ts`) and the `@vapi/*`
path alias are already in place, so no further tsconfig changes will be
needed.

### Note on the existing `vapi/config/vapi.module.ts`

There IS a `VapiModule` export at `../vapi/config/vapi.module.ts`, but it
is an earlier standalone prototype that:

  - Does NOT register any controllers (no REST endpoints).
  - Does NOT export anything that the rest of the backend needs to
    inject.
  - Was never intended to be wired into the NestJS DI graph.

It is therefore **not** the file Agent 3 will deliver, and importing it
here would be premature. The production `VapiModule` will live at the
package root (`vapi/vapi.module.ts`) and will register the webhook
controller, function-call handlers, memory service, etc.

---

## 7. Module-validity sanity check (mental compile)

For each newly-imported module, verified:

| Module | `@Module` decorator | `controllers` | `providers` | `exports` | Notes |
|--------|---------------------|---------------|-------------|-----------|-------|
| `EmployeesModule` | yes | `EmployeesController` | `EmployeesService` | `EmployeesService` | Uses `JwtAuthGuard` (from `auth/guards/`) + `RequirePermissions` (from `_shared/security/`). Both are global. |
| `RagModule` | yes | `IngestionController`, `SearchController` | 11 services + sub-modules | 11 services + 4 sub-modules | Imports `SharedAiModule` + `PrismaModule` (both `@Global()` — redundant but harmless). |
| `EvaluationModule` | yes | `EvaluationController` | `EvaluationService` | `EvaluationService` | Uses globally-provided `PrismaService` + `OPENAI_CLIENT`. |
| `RagSecurityModule` | yes | none | `DocumentPermissionsService`, `RagSecurityGuard`, `TenantIsolationInterceptor` | all 3 | Used via `@UseGuards` / `@UseInterceptors` on RAG controllers. |

All four modules compile cleanly against the existing `_shared/`
infrastructure (no missing imports, no missing providers).

---

## 8. What was NOT touched (per task constraints)

- Feature module code (auth, users, customers, distributors, products,
  orders, notifications, ai, knowledge, analytics, admin, employees) —
  only their `*.module.ts` files were inspected (none needed changes).
- All `*.spec.ts` test files — untouched.
- The `_shared/` folder — untouched.
- The `rag/` folder — only `rag/rag.module.ts`,
  `rag/evaluation/evaluation.module.ts`, and
  `rag/security/security.module.ts` were read (to verify their exports);
  no `rag/` files were modified.
- The `vapi/` folder — only read to confirm `vapi/vapi.module.ts` does
  not exist yet (Agent 3 will create it).

---

## 9. Pending follow-ups (for downstream agents)

1. **Agent 3 (Vapi)**: Create `vapi/vapi.module.ts`. After it lands,
   uncomment the two `VapiModule` lines in `app.module.ts`. No
   `tsconfig.json` change needed — `include` + `@vapi/*` alias are
   already wired.

2. **Vitest config**: `backend/vitest.config.ts` currently only includes
   the four core RAG subfolders (`loaders/`, `ingestion/`,
   `embeddings/`, `vector-store/`). The remaining RAG subfolders
   (`retriever/`, `prompts/`, `context-builder/`, `search/`,
   `response-pipeline/`, `memory/`, `evaluation/`, `security/`) have
   spec files that aren't auto-discovered. Add them to the `include`
   array when ready.

3. **`SearchModule` keyword search**: The `RetrievalService`'s
   `keywordSearch()` uses PostgreSQL `tsvector @@ plainto_tsquery(...)`,
   which requires a generated `tsvector` column on `rag_chunks`. The
   column is not in the Prisma schema yet — `keywordSearch()` returns
   `[]` on SQL errors (logged at debug level), so the hybrid retrieval
   falls back to vector-only when the column is missing. A migration
   will need to add the column.

4. **`AiMemory.MemoryType` enum**: `ConversationMemoryService.summarizeConversation()`
   saves LLM-generated summaries as `type=CONTEXT` because the `SUMMARY`
   value is not in the Prisma enum (`FACT | PREFERENCE | HISTORY |
   CONTEXT`). A schema migration would need to add `SUMMARY`.

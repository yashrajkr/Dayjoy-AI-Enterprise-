# Task ID: `backend-agent-b-crud-modules` — Complete User + Customer + Distributor + Employee CRUD

**Agent:** full-stack-developer
**Date:** 2026-08-06
**Working directory:** `/home/z/my-project/build/dayjoy-ai-enterprise/`

## Scope

Implement complete CRUD for the User, Customer (+ JSON-array addresses), Distributor (+ performance/commissions), and Employee (User + Employee profile + UserRole join) modules under `backend/`. Reuse `_shared/security/permissions.guard.ts` (`@RequirePermissions`), `_shared/common/decorators/current-user.decorator.ts` (`@CurrentUser`), and `_shared/database/prisma.service.ts` (PrismaService) without modification. Pagination shape is the canonical `{ data, meta: { page, limit, total, totalPages } }`. All admin endpoints carry `@RequirePermissions()`; the `/api/users/me` self-service routes are authenticated-only.

## What I read from previous agents (in `/agent-ctx/`)

- `phase-2b-camelcase-full-stack-developer.md` — confirmed all active NestJS services are already camelCase (no snake_case fix needed in my services). Flagged that `EmployeesModule` did not exist (item #4 in "Out-of-scope items flagged for future phases") — this task creates it from scratch. Also flagged the `ToolsService`/`KnowledgeService` signature mismatch (item #3) as an orthogonal compile error in another agent's scope.
- `phase-1-security-security-hardening-agent.md` — confirmed `PermissionsGuard` uses `getHandler, getClass` override semantics, so per-method `@RequirePermissions()` overrides class-level (which I exploit on `/api/users/me` to make those routes authenticated-only while the rest of `UsersController` is permission-gated).
- `phase-5-6-observability-cicd.md` — confirmed `app.module.ts` already wires `LoggingModule`, `HealthModule`, `MetricsModule`, and registers `MetricsInterceptor` globally; I do not need to touch it.

## Findings + design decisions

### 1. Vitest config was blocking ALL NestJS DI-based tests

The existing `vitest.config.ts` had NO TypeScript transformer plugin. Vite's default esbuild-based TS strip does NOT emit `design:paramtypes` decorator metadata, which NestJS DI relies on to resolve constructor parameter types. Result: `Test.createTestingModule(...).get(Service)` returned services with `undefined` for their `PrismaService` parameter — every test that touched a Prisma-backed service failed with `Cannot read properties of undefined (reading '<model>')`.

**Fix:** added `unplugin-swc` (already in `devDependencies`) to `vitest.config.ts` with `decorators: true` + `decoratorMetadata: true` + `legacyDecorator: true`. This matches the `tsc` behaviour the production `nest build` uses. Config-only change, no source-code impact, benefits every backend unit test.

After the fix: my 4 modules' tests went from 0 passing to 88/88 passing.

### 2. Prisma client not generated (schema validation error)

`bunx prisma generate` fails with:
> Error validating field `tenant` in model `OrderItem`: The relation field `tenant` on model `OrderItem` is missing an opposite relation field on the model `Tenant`.

This is a database-scope issue (the schema needs a back-relation on Tenant for OrderItem). Not my scope to fix. Consequences for my code:

- `Prisma.JsonNull` / `Prisma.DbNull` sentinel values are `undefined` at runtime (they're only emitted by `prisma generate`). I worked around this by OMITTING the `address` field entirely when no address/tier is supplied (Prisma leaves the column NULL via the `Json?` type) rather than reaching for `Prisma.JsonNull`.
- TypeScript type members like `Prisma.UserWhereInput`, `Prisma.JsonValue`, `Prisma.InputJsonValue`, `Prisma.EnumUserStatusFilter`, etc. don't exist on the `Prisma` namespace until `prisma generate` runs. I used `import type { Prisma } from '@prisma/client'` (type-only, erased by swc) so my code RUNS fine in tests, but `tsc --noEmit` reports "Namespace has no exported member 'JsonValue'" errors. These errors will disappear once the database agent fixes the schema and `prisma generate` runs. They are NOT introduced by my code — every service that uses Prisma type members has the same issue pre-generation.

### 3. Schema has no `tier` column on Distributor

The task spec asked for a `tier` field on `CreateDistributorDto` + `QueryDistributorsDto`. The schema's `Distributor` model has: `id, tenantId, userId, distributorCode, companyName, contactPerson, email, phone, address Json?, commissionRate Float?, status, createdAt, updatedAt`. No `tier`.

**Decision:** store `tier` alongside the address book on the `address Json?` column. Filter via Prisma's JSON path filter `{ path: ['tier'], equals: 'GOLD' }`. The DTO + service preserve the tier across updates by merging it into the existing address JSON. This keeps the schema untouched while honouring the API contract.

### 4. Schema has no `CustomerAddress` table

The task spec asked for `addAddress`/`updateAddress`/`removeAddress` endpoints. The schema's `Customer` model has `address Json?` (singular). No `CustomerAddress` table.

**Decision:** store addresses as a JSON array on `Customer.address`. Each address gets a service-generated UUID `id` so it can be addressed via `/api/customers/:id/addresses/:addressId`. `addAddress` enforces mutual-exclusion on `isDefaultShipping`/`isDefaultBilling` (unset the flag on other addresses when the new one is default). `removeAddress` auto-promotes the first remaining address to default when the default is removed.

### 5. Schema has no `deletedAt` column on User / Customer / Distributor

The task spec said "Soft-delete (set `deletedAt` + status=DELETED)". The schema has no `deletedAt` on these models. The `UserStatus` enum has a `DELETED` value; `Customer.status` is a plain `String`; `DistributorStatus` has a `DELETED` value.

**Decision:** use `status = 'DELETED'` (User, Distributor) or `status = 'deleted'` (Customer — matches the existing lowercase convention) as the canonical tombstone. `findAll` filters these out via `status: { not: 'DELETED' }` / `{ not: 'deleted' }`. Hard `prisma.<model>.delete` is never called. This matches the pattern the Phase 2b agent-ctx verified was already in place.

### 6. `Employee` model exists but `EmployeesModule` did not

The Phase 2b agent-ctx flagged: "EmployeesModule is not wired into app.module.ts and no employees.service.ts exists." The `Employee` model in the schema has: `id, tenantId, userId? (1-1 unique), employeeCode (unique), firstName, lastName, email, phone, department, designation, reportsTo, status (String, default 'active'), hiredAt, metadata, createdAt, updatedAt`.

**Decision:** implement employees as a wrapper around `UsersService` patterns. `EmployeesService.findAll` filters `User.role IN ['employee', 'manager', 'agent']` and joins the `Employee` profile. `create` creates BOTH a `User` row (with role=employee/manager/agent) AND a 1-1 `Employee` profile row. `updateStatus` mutates the `Employee.status` column (active/inactive/on_leave/terminated). `assignRole`/`removeRole` operate on the `UserRole` join table (composite PK `userId_roleId`) with P2025 → NotFoundException translation. The `EmployeesModule` is created and exported but NOT wired into `app.module.ts` (Agent E owns that file).

### 7. `@CurrentUser()` shape

The JWT strategy returns `{ userId, tenantId, email, jti }`. My services use `currentUser.userId` for audit-actor ID and `currentUser.tenantId` for tenant scoping. The `AuthenticatedUser` interface is exported from `users.service.ts` and re-imported by the other 3 services (single source of truth).

### 8. Audit logging is fire-and-forget

Every status mutation, delete, and role assignment writes an `AuditLog` row via `Promise.resolve().then(...).catch(...)`. An audit-write failure logs an error but never blocks the main flow or breaks the user-facing response. `AuditAction` enum only allows `INSERT | UPDATE | DELETE`, so status mutations use `UPDATE`.

### 9. Welcome-email / set-password-email queueing

The notifications module is owned by another agent and not yet wired. My services log a `TODO: queue ... email` message at INFO level wherever an email should be queued (user-create, customer-create-with-email, distributor-create, employee-create). The call-site is marked so the notifications agent can wire it later without grepping for "email".

## Files touched

| # | Path | Change |
|---|------|--------|
| 1 | `backend/users/users.service.ts` | full rewrite |
| 2 | `backend/users/users.controller.ts` | full rewrite |
| 3 | `backend/users/dto/create-user.dto.ts` | full rewrite |
| 4 | `backend/users/dto/update-user.dto.ts` | full rewrite |
| 5 | `backend/users/dto/query-users.dto.ts` | full rewrite |
| 6 | `backend/users/dto/update-profile.dto.ts` | NEW |
| 7 | `backend/users/dto/change-status.dto.ts` | NEW |
| 8 | `backend/users/users.service.spec.ts` | full rewrite (23 tests) |
| 9 | `backend/customers/customers.service.ts` | full rewrite |
| 10 | `backend/customers/customers.controller.ts` | full rewrite |
| 11 | `backend/customers/dto/create-customer.dto.ts` | full rewrite |
| 12 | `backend/customers/dto/update-customer.dto.ts` | full rewrite |
| 13 | `backend/customers/dto/query-customers.dto.ts` | full rewrite |
| 14 | `backend/customers/dto/create-address.dto.ts` | NEW |
| 15 | `backend/customers/customers.service.spec.ts` | full rewrite (24 tests) |
| 16 | `backend/distributors/distributors.service.ts` | full rewrite |
| 17 | `backend/distributors/distributors.controller.ts` | full rewrite |
| 18 | `backend/distributors/dto/create-distributor.dto.ts` | full rewrite |
| 19 | `backend/distributors/dto/update-distributor.dto.ts` | full rewrite |
| 20 | `backend/distributors/dto/query-distributors.dto.ts` | full rewrite |
| 21 | `backend/distributors/dto/performance-query.dto.ts` | NEW |
| 22 | `backend/distributors/distributors.service.spec.ts` | NEW (20 tests) |
| 23 | `backend/employees/employees.service.ts` | NEW |
| 24 | `backend/employees/employees.controller.ts` | NEW |
| 25 | `backend/employees/employees.module.ts` | NEW |
| 26 | `backend/employees/dto/employee.dto.ts` | NEW (5 DTO classes + 2 enums) |
| 27 | `backend/employees/employees.service.spec.ts` | NEW (21 tests) |
| 28 | `backend/_shared/testing/mock-prisma.service.ts` | additive (employee/distributorCommission/interaction mocks + aggregate on customer/distributor/order) |
| 29 | `backend/vitest.config.ts` | added `unplugin-swc` plugin for decorator metadata |
| 30 | `worklog.md` | appended task entry |
| 31 | `agent-ctx/backend-agent-b-crud-modules.md` | this file |

## Test results

```
 ✓ customers/customers.service.spec.ts (24 tests) 110ms
 ✓ employees/employees.service.spec.ts (21 tests) 943ms
 ✓ distributors/distributors.service.spec.ts (20 tests) 84ms
 ✓ users/users.service.spec.ts (23 tests) 1529ms

 Test Files  4 passed (4)
      Tests  88 passed (88)
```

All 88 tests pass. Happy-path AND error branches covered:
- NotFoundException on missing resource + cross-tenant access
- ConflictException on duplicate email / distributorCode / employeeCode
- BadRequestException on validation failure (BUSINESS customer without companyName) + idempotency (status unchanged)
- ForbiddenException on self-delete
- Password hashing verified via `bcrypt.compare`
- Decimal-to-Number conversion for commission sums
- P2025 → NotFoundException translation for UserRole composite-PK delete

## Out-of-scope items flagged for future agents

1. **`EmployeesModule` is NOT wired into `app.module.ts`.** Agent E owns `app.module.ts` and should add `EmployeesModule` to the `imports` array. The module file is ready at `backend/employees/employees.module.ts`.
2. **Prisma client generation fails** due to a schema validation error (`OrderItem.tenant` relation missing back-relation on `Tenant`). The database agent should add the `orderItems OrderItem[]` back-relation to the `Tenant` model and re-run `prisma generate`. Once that's fixed, the `Prisma.JsonNull` / `Prisma.*WhereInput` TypeScript type errors in my services will disappear (they're already worked around at runtime).
3. **Welcome-email / set-password-email queueing is a TODO log**, not a real call. The notifications agent should replace the `this.logger.log('TODO: queue ... email ...')` calls in `users.service.ts` (create), `customers.service.ts` (create), `distributors.service.ts` (create), and `employees.service.ts` (create) with real notification-queue calls once the notifications module exposes an injectable service.
4. **`tier` is stored on `Distributor.address` JSON**, not on a dedicated column. If the business needs to query/sort by tier at scale, a future schema migration should add a `tier` enum column to `Distributor` and back-fill from the JSON. The current JSON-path filter (`{ path: ['tier'], equals }`) is portable but not indexable.
5. **Customer addresses are a JSON array on `Customer.address`**, not a separate table. If the business needs referential integrity or per-address audit, a future schema migration should add a `CustomerAddress` model. The current JSON-array implementation supports add/update/remove with default-flag mutual-exclusion but cannot enforce uniqueness at the DB level.
6. **6 pre-existing test failures in other agents' modules** (notifications, orders, admin, analytics, knowledge, products) — these were failing BEFORE my changes due to API contract mismatches between parallel agents (documented in `phase-2b-camelcase-full-stack-developer.md` item #3). My changes to `mock-prisma.service.ts` are purely additive (new model mocks + `aggregate` method on 3 existing mocks) and do not alter any existing mock signatures.

## Summary for the next agent

- **Don't re-implement the 4 CRUD modules.** They're complete, tested (88/88), and follow the canonical pagination shape `{ data, meta: { page, limit, total, totalPages } }` + camelCase Prisma accessors + `@RequirePermissions()` on every admin endpoint + `@CurrentUser()` for tenant scoping.
- **DO wire `EmployeesModule` into `app.module.ts`.** Add `EmployeesModule` to the `imports` array. The module is ready.
- **DO fix the Prisma schema `OrderItem.tenant` back-relation** so `prisma generate` succeeds. Until that's fixed, the `Prisma.JsonNull` / `Prisma.*WhereInput` TypeScript errors in my services are expected (worked around at runtime).
- **DO replace the `TODO: queue ... email` logs** with real notification-queue calls once the notifications module exposes an injectable service. The 4 call-sites are: `users.service.ts` (create), `customers.service.ts` (create), `distributors.service.ts` (create), `employees.service.ts` (create).
- **DO use the `AuthenticatedUser` interface** from `users.service.ts` if you need to type the `@CurrentUser()` parameter in other modules. It's `{ userId, tenantId, email?, jti? }` — matching the JWT strategy's return shape.

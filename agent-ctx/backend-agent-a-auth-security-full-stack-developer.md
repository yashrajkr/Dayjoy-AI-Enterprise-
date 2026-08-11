# Work Record — `backend-agent-a-auth-security`

**Task ID:** `backend-agent-a-auth-security`
**Agent:** full-stack-developer (Z.ai / Claude)
**Date:** 2026-08-06
**Working directory:** `/home/z/my-project/build/dayjoy-ai-enterprise/`
**Scope:** Complete the Auth + RBAC + Security Infrastructure for the NestJS backend — 8 auth methods, 9 endpoints, 7 DTOs, JWT strategy + guards, shared decorators, RolesGuard, PasswordPolicy, comprehensive tests.

## Context I read from prior agents (in `/agent-ctx/`)

1. **`phase-1-security-security-hardening-agent.md`** — Phase 1 laid the security foundation: `RedisModule` (ioredis, `@Global`), `JwtBlocklistService` (Redis JTI blocklist, fails OPEN), `RateLimitService` (Redis sliding-window, fails OPEN), `PermissionsGuard` (real RBAC, SUPER_ADMIN bypass, `user_roles.expires_at` respected), `SecurityModule` (`@Global` wrapper). Also fixed snake_case → camelCase in `auth.service.ts` (e.g. `passwordHash`, `firstName`, `lastLoginAt`). The phase-1 agent's auth.service.ts had `validateUser` + `login` + `refresh` + `logout` + `requestPasswordReset` + `resetPassword` + `verifyEmail` but used an **in-memory `Set` for the blocklist** (TODO comment: "For production, replace with Redis") — my task was to swap that out for the real `JwtBlocklistService`.

2. **`phase-2b-camelcase-full-stack-developer.md`** — Confirmed all active NestJS services are camelCase (no snake_case Prisma accessors). Also flagged two pre-existing compilation blockers that are NOT my concern: (a) `ToolsService`/`KnowledgeService` signature mismatch, (b) the snake_case seed file. Neither affects auth.

3. **`phase-5-6-observability-cicd.md`** — Phase 5/6 added health/metrics/logging modules + CI/CD hardening. Confirmed `app.module.ts` registers a global `RolesGuard` (from `_shared/common/guards/roles.guard.ts`) as `APP_GUARD` — that guard doesn't support SUPER_ADMIN bypass, which is why I created a NEW `RolesGuard` in `_shared/auth/roles.guard.ts` rather than modifying the existing one.

## What I built

### New files (16)

| File | Purpose |
|------|---------|
| `backend/_shared/security/password.policy.ts` | `PasswordPolicy` class — `validate()` (8+ chars, upper/lower/digit/special), `hash()` (bcrypt 12 rounds), `verify()`. Single source of truth for password rules. |
| `backend/_shared/auth/public.decorator.ts` | `@Public()` decorator + `IS_PUBLIC_KEY` metadata key. Marks endpoints as bypassing the JWT guard. |
| `backend/_shared/auth/current-user.decorator.ts` | `@CurrentUser()` param decorator + `AuthenticatedUser` interface. Injects the user (or a single field) from `request.user`. |
| `backend/_shared/auth/roles.decorator.ts` | `@Roles('ADMIN', 'MANAGER')` decorator + `AUTH_ROLES_KEY` metadata. |
| `backend/_shared/auth/roles.guard.ts` | `RolesGuard` — reads `@Roles()` metadata, SUPER_ADMIN bypass, 401 if no user, denies if role not in allowed set. |
| `backend/_shared/auth/auth.module.ts` | `SharedAuthModule` — exports `RolesGuard`. |
| `backend/_shared/auth/index.ts` | Barrel re-exporting all decorators + guard + module. |
| `backend/auth/dto/change-password.dto.ts` | `oldPassword` + `newPassword` (strong-password `@Matches` pattern). |
| `backend/auth/guards/jwt-refresh.guard.ts` | Passthrough guard for the refresh endpoint. |
| `backend/auth/guards/local.guard.ts` | Passthrough guard for the login endpoint. |
| `backend/auth/notifications-token.ts` | `NOTIFICATIONS_SERVICE` string token + `NotificationsServiceLike` minimal interface. Decouples auth from the still-broken notifications module. |
| (16 total — see worklog for full table) | |

### Modified files (7)

| File | Change |
|------|--------|
| `backend/auth/auth.service.ts` | **Rewritten.** Full 8-method implementation + `getProfile` helper. Removed in-memory blocklist `Set`; uses real `JwtBlocklistService`. Removed direct `NotificationsService` import (replaced with `@Optional()` `@Inject(NOTIFICATIONS_SERVICE)`). Added rate-limiting (per-email 10/15min, per-IP 30/15min, lockout after 5 fails) via `RateLimitService` + direct Redis lockout key. Added session management (`UserSession` rows, JTI=sessionId, rotation on refresh). |
| `backend/auth/auth.controller.ts` | **Rewritten.** 9 endpoints (added `change-password` + `me`). Uses `@CurrentUser()` + `@Public()` from `_shared/auth`. |
| `backend/auth/auth.module.ts` | Removed `NotificationsModule` import (string-token injection instead). |
| `backend/auth/strategies/jwt.strategy.ts` | Now injects `PrismaService` and loads the user's current `role` + `status` from DB on every authenticated request. Rejects deleted/non-ACTIVE users with 401. |
| `backend/auth/guards/jwt-auth.guard.ts` | Now injects `Reflector`, honours `@Public()` decorator, throws `UnauthorizedException` on missing/invalid token. |
| `backend/auth/dto/register.dto.ts` | Strong-password `@Matches` pattern; `tenantId` now optional (defaults to env `DEFAULT_TENANT_ID`). |
| `backend/auth/dto/reset-password.dto.ts` | Strong-password `@Matches` pattern. |
| `backend/auth/dto/login.dto.ts` | Added `@MaxLength` caps. |
| `backend/auth/auth.service.spec.ts` | **Rewritten.** 40 passing tests across all 8 methods + `getProfile`. Local `createMockPrismaWithSessions()` helper extends the shared mock with `userSession` + `updateMany` on the token models. |

## Key design decisions

1. **Session ID = JTI.** Both access and refresh tokens carry the same `jti` claim. `UserSession.tokenHash` stores `sha256(jti)`. Either token can be used to look up the session for revocation — no separate `sessionId` field on the JWT, no extra DB column.

2. **Token rotation on refresh.** Each refresh deletes the old session + blocklists the old JTI (defence in depth) and creates a new session with a fresh JTI. A stolen refresh token can be used at most once before the legitimate user notices (their next refresh fails).

3. **Lockout state in Redis, not DB.** The User schema doesn't have `failedLoginCount`/`lockedUntil` fields (and modifying the schema is out of scope). The lockout state lives in Redis key `auth:lockout:email:{email}` with a 15-min TTL — same effect, no schema change, auto-expires even if the backend crashes. Fails OPEN on Redis errors (consistent with `JwtBlocklistService` / `RateLimitService`).

4. **NotificationsService injected via string token.** The notifications module is under concurrent development by another agent and is currently broken (it imports `./providers/notification.provider.interface` which doesn't exist yet — causes transitive load failures). Introduced `NOTIFICATIONS_SERVICE` string token + `NotificationsServiceLike` minimal interface; `AuthService` injects it `@Optional()` and degrades gracefully to "log-and-skip" when not bound. When the notifications module is stable, it can bind the token via `{ provide: NOTIFICATIONS_SERVICE, useExisting: NotificationsService }`.

5. **NEW RolesGuard, not a modification of the existing one.** The existing `_shared/common/guards/roles.guard.ts` (currently the global `APP_GUARD`) doesn't support SUPER_ADMIN bypass. Rather than modify it (which could break other agents' code), I created a new `RolesGuard` in `_shared/auth/roles.guard.ts` with SUPER_ADMIN bypass. The two coexist; downstream callers can choose via `@UseGuards(RolesGuard)`.

6. **JwtStrategy loads user from DB on every request.** Same pattern as `PermissionsGuard` — load-from-DB so role changes take effect immediately, not after the next token refresh. JWT doesn't carry the role; strategy loads `select: { id, tenantId, email, role, status }` from Prisma.

7. **Mock extension local to the spec file.** The shared `_shared/testing/mock-prisma.service.ts` doesn't have `userSession` or `updateMany` on the token models. Rather than modify the shared mock (which could affect other agents' tests), I created a local `createMockPrismaWithSessions()` helper in `auth.service.spec.ts` that spreads the base mock and adds the missing methods.

## Validation

- **TypeScript:** `tsc --noEmit --project tsconfig.check.json` — auth files are clean except for the project-wide pre-existing TS2564 "Property X has no initializer" pattern on class-validator DTO fields (every DTO in the project has this; tests pass because vitest uses SWC).
- **Unit tests:** `vitest run auth/auth.service.spec.ts` — **40/40 passing**.
- **Security tests:** `vitest run _shared/security/` — **23/23 passing** (no regression on prior phases' work).
- **Full backend suite:** `vitest run` — 251/264 passing; the 13 failures are all in OTHER modules (notifications, orders, knowledge, ai, products) and are pre-existing — none caused by my changes.

## Constraints respected

- ✅ Did NOT modify `_shared/security/redis.module.ts`, `jwt-blocklist.service.ts`, `rate-limit.service.ts`, `permissions.guard.ts`, `security.module.ts` — used them as-is.
- ✅ Did NOT modify `_shared/testing/mock-prisma.service.ts` — extended locally in the spec file.
- ✅ Did NOT modify `app.module.ts` (Agent E owns this) — designed `@Public()` to be a no-op when no global `JwtAuthGuard` is registered, and to work correctly when one is.
- ✅ Did NOT modify `main.ts` (Agent E owns this).
- ✅ Did NOT modify `backend/package.json`'s scripts section (Agent E owns this); all required deps were already present.
- ✅ Did NOT touch other modules (users, customers, products, orders, knowledge, ai, distributors, admin, notifications).
- ✅ Referenced the FastAPI implementation at `_reference/fastapi-backend-reference/app/services/auth.py` for patterns (rate-limiting, lockout, token rotation, password reset, email verification).
- ✅ All code is production-ready TypeScript with proper types and NestJS best practices (DI, decorators, exception filters).

## Files touched (24 total — 16 new + 8 modified)

```
NEW:  backend/_shared/security/password.policy.ts
NEW:  backend/_shared/auth/public.decorator.ts
NEW:  backend/_shared/auth/current-user.decorator.ts
NEW:  backend/_shared/auth/roles.decorator.ts
NEW:  backend/_shared/auth/roles.guard.ts
NEW:  backend/_shared/auth/auth.module.ts
NEW:  backend/_shared/auth/index.ts
NEW:  backend/auth/dto/change-password.dto.ts
NEW:  backend/auth/guards/jwt-refresh.guard.ts
NEW:  backend/auth/guards/local.guard.ts
NEW:  backend/auth/notifications-token.ts
MOD:  backend/auth/auth.service.ts              (rewritten — 8 methods + helper)
MOD:  backend/auth/auth.controller.ts           (rewritten — 9 endpoints)
MOD:  backend/auth/auth.module.ts               (removed NotificationsModule import)
MOD:  backend/auth/strategies/jwt.strategy.ts   (DB-backed role/status lookup)
MOD:  backend/auth/guards/jwt-auth.guard.ts     (@Public() support)
MOD:  backend/auth/dto/register.dto.ts          (strong-password pattern, optional tenantId)
MOD:  backend/auth/dto/reset-password.dto.ts    (strong-password pattern)
MOD:  backend/auth/dto/login.dto.ts             (@MaxLength caps)
MOD:  backend/auth/auth.service.spec.ts         (rewritten — 40 passing tests)
MOD:  worklog.md                                (appended this task's entry)
```

## Summary for the next agent

- **Auth is complete.** All 8 methods + 9 endpoints + 40 unit tests are in place. The auth module is self-contained and doesn't import from any other feature module (notifications dependency is via `@Optional()` string token).
- **To wire up notifications:** in `NotificationsModule`, add `{ provide: NOTIFICATIONS_SERVICE, useExisting: NotificationsService }` to the providers and export it. AuthService will then automatically start dispatching real emails for password reset / email verification / welcome / password change.
- **To wire up a global JwtAuthGuard:** in `app.module.ts`, register `{ provide: APP_GUARD, useClass: JwtAuthGuard }` (in addition to or instead of the existing `RolesGuard`). The `@Public()` decorator on the auth controller's public endpoints will ensure they bypass auth.
- **The existing global `RolesGuard` (from `_shared/common/guards/roles.guard.ts`) doesn't support SUPER_ADMIN bypass.** If you want SUPER_ADMIN bypass globally, swap it for the new `_shared/auth/roles.guard.ts` `RolesGuard` in `app.module.ts`. The two coexist; the new one is a strict superset of the old one's behaviour.
- **Sessions table (`UserSession`) is now actively used.** Make sure the `user_sessions` table exists in the DB (it's in the Prisma schema as `model UserSession` — `@@map("user_sessions")`).
- **The `auth:lockout:email:{email}` Redis key** is the only non-`RateLimitService`/non-`JwtBlocklistService` Redis usage in the auth module. It has a 15-min TTL and is set after 5 failed password attempts.

# Work Record — `phase-1-security`

**Agent:** phase-1-security agent (Claude / Z.ai)
**Task ID:** phase-1-security
**Date:** 2026-08-06
**Scope:** Phase 1 Security Hardening — fix all critical infra + backend security vulnerabilities.

## Context for downstream agents

This phase ran **concurrently** with at least one infrastructure agent (which added KMS / WAF / DNS / Secrets Manager terraform modules) and **after** phase-5-6 (observability) and an earlier phase-4 security agent that had created `_shared/security/redis.module.ts` + `redis.decorators.ts`. By the time phase-1 ran, those earlier security files had been removed (the `_shared/security/` directory did not exist when I started), so I recreated them per the task spec. The phase-5-6 `health.controller.ts` depends on the `@InjectRedis()` contract — I preserved it exactly (`Inject(REDIS_CLIENT)` + `RedisModule` providing `REDIS_CLIENT`).

## What I changed

### Infrastructure (Terraform)
- `deployment/terraform/modules/rds/main.tf` — removed `cidr_blocks=["0.0.0.0/0"]` ingress; added `eks_node_security_group_id` variable; ingress uses `security_groups=[var.eks_node_security_group_id]`. (A concurrent infra agent reworked this into a `dynamic "ingress"` block — final form is safe-by-default when var is null.)
- `deployment/terraform/modules/eks/main.tf` — added `aws_security_group.eks_nodes` + output `eks_node_security_group_id`.
- `deployment/terraform/environments/{production,staging}/main.tf` — pass `eks_node_security_group_id = module.eks.eks_node_security_group_id` to `rds` (and `redis`).

### Kubernetes (`deployment/kubernetes/01-base-manifests.yaml`)
- Replaced plaintext `Secret` (`SECRET_KEY: "CHANGE_ME_IN_PRODUCTION"`) with `ExternalSecret` (20 keys from AWS Secrets Manager) + `SecretStore` (IRSA).
- Added `ServiceAccount dayjoy-backend` with `eks.amazonaws.com/role-arn` annotation.
- Added `backend-pdb` (minAvailable 2) + `frontend-pdb` (minAvailable 1).
- Added pod + container `securityContext` to all 4 Deployments (backend, frontend, redis, qdrant): `runAsNonRoot`, UID/GID 1000 (backend/frontend) or 999 (redis), `seccompProfile: RuntimeDefault`, `drop: ["ALL"]` capabilities, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true` (with `emptyDir` mounts for `/tmp` and Next.js `.next/cache`).
- Qdrant runs as root (official image limitation) but drops ALL caps + no priv escalation.

### Backend (NestJS) — new `backend/_shared/security/` module
- `redis.module.ts` — global `RedisModule` providing `REDIS_CLIENT` (ioredis) from `REDIS_URL`.
- `redis.decorators.ts` — `@InjectRedis()` param decorator.
- `jwt-blocklist.service.ts` — Redis JTI blocklist with auto-expiring TTLs; fails OPEN on Redis errors.
- `rate-limit.service.ts` — sliding-window per-key limiter via Redis sorted sets (pipelined); fails OPEN on Redis errors.
- `permissions.guard.ts` — real RBAC guard + `@RequirePermissions('resource:action')` decorator; SUPER_ADMIN bypass; honours `user_roles.expiresAt`.
- `security.module.ts` — `@Global()` wrapper exporting all of the above.

### Backend (NestJS) — wiring
- `app.module.ts` — imports `SecurityModule`.
- `auth/auth.module.ts` — imports `SecurityModule`.
- `auth/auth.service.ts` — `generateTokens()` mints `jti`; `login()` enforces per-email (10/15m) + per-IP (30/15m) rate limits; `logout(token)` blocklists JTI; `refresh()` honours + rotates blocklist. (Also fixed Prisma field casing to match schema.)
- `auth/auth.controller.ts` — `logout()` reads `Authorization` header; `login()` passes `clientIp`.
- `auth/strategies/jwt.strategy.ts` — injects `JwtBlocklistService`, rejects blocklisted JTIs.
- `auth/interfaces/jwt-payload.interface.ts` — added optional `jti`.
- `_shared/config/configuration.ts` + `configuration.schema.ts` — added `REDIS_URL`, `JWT_REFRESH_EXPIRES_IN`, `VAPI_WEBHOOK_SECRET`, `AWS_REGION`, `AWS_SECRET_MANAGER_SECRET_ID`.

### Vapi webhook
- `vapi/webhooks/vapi-webhook-service.ts` — `verifySignature()` no longer bypasses on `NODE_ENV==='development'` or missing secret; fails CLOSED (`UnauthorizedException`) in non-test envs; uses `crypto.timingSafeEqual`; 5-minute replay window.

### Env examples
- `.env.example` (root) + `backend/.env.example` — added Redis + AWS + Vapi webhook secret vars.

## Validation

- PyYAML `safe_load_all` over `01-base-manifests.yaml`: 23 docs parse; no `kind: Secret`, no `stringData`, no `CHANGE_ME`.
- All Deployments have pod `securityContext` + containers drop ALL caps.
- Terraform: RDS ingress uses `security_groups`; EKS outputs `eks_node_security_group_id`; both env files wire it to `rds` + `redis`.
- `@InjectRedis()` contract preserved for phase-5-6 health controller.

## Not in scope (flagged for follow-up)

- **OAuth2 state in Redis** — infra is in place (`RedisModule`/`@InjectRedis`), but the OAuth2 controller migration is left to the auth-feature owner.
- **CSRF protection** — low-risk for Bearer-token auth (browsers don't auto-attach `Authorization`); revisit if cookie sessions are introduced.
- **PII redaction in logs** — phase-5-6 `logging.service.ts` already recursively redacts `password`/`token`/`apiKey`/`secret`/`authorization`/`cookie` keys; broader PII patterns (email, phone) could be added.
- **Non-root qdrant image** — needs a custom build; current qdrant container drops ALL caps + no priv escalation as an interim.

## Files touched

See the worklog entry (`worklog.md` → `## Task: phase-1-security`) for the full 23-row deliverables table.

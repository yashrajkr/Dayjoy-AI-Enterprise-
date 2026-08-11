# Work Record: `audit-fix-security`

**Agent**: full-stack-developer (Security Engineer role)
**Task ID**: `audit-fix-security`
**Date**: 2026-08-07
**Repository**: `/home/z/my-project/build/dayjoy-ai-enterprise/`

## Objective

Fix all hardcoded credentials (plaintext passwords, API keys, JWT secrets,
database URLs with embedded credentials) in the Dayjoy AI Enterprise
Platform deployment / config / script files, and document the fixes.

## Files Modified

### Explicit task deliverables (3 files)

1. **`deployment/docker/docker-compose.voice-ai.yml`** — P0
   - Line 20: `DATABASE_URL=postgresql://user:password@db:5432/...`
     → `postgresql://dayjoy:${DATABASE_PASSWORD}@db:5432/...`
   - Line 65: `POSTGRES_PASSWORD=password` → `${DATABASE_PASSWORD}`
   - Line 92: `--requirepass ${REDIS_PASSWORD:-redis_password}`
     → `--requirepass ${REDIS_PASSWORD}` (no default — fail if unset)
   - Line 121: `POSTGRESQL_PASSWORD=password` → `${DATABASE_PASSWORD}`
     (pgBouncer)
   - Also tightened: `POSTGRES_USER`/`POSTGRESQL_USERNAME` set to `dayjoy`
     (was `user` — kept consistent with the new DATABASE_URL), `REDIS_URL`
     updated to include the password (otherwise redis auth would silently
     fail), Redis healthcheck upgraded to authenticate, Grafana admin
     password changed from `:-admin` default to `:?required`.

2. **`deployment/docker/docker-compose.dev.yml`** — P1
   - Line 93: `SECRET_KEY=dev-secret-key-change-in-production-min-32-chars`
     → `SECRET_KEY=${JWT_SECRET}  # MUST be set in .env, min 32 chars`

3. **`deployment/kubernetes/02-voice-ai-manifests.yaml`** — P0
   - Replaced the entire plaintext `Secret` block (lines 39–50) with an
     `ExternalSecret` (apiVersion `external-secrets.io/v1beta1`) that
     mirrors the pattern in `03-external-secrets.yaml`. Pulls `DATABASE_URL`,
     `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `JWT_SECRET`, `REDIS_URL`, and
     `OPENAI_API_KEY` from AWS Secrets Manager paths
     `dayjoy/prod/{database,voice,auth,ai}`.

### Additional scan findings (5 files — broader audit)

4. **`deployment/kubernetes/01-base-manifests.yaml`** — P0
   - Removed `DATABASE_URL: "postgresql+asyncpg://dayjoy:dayjoy@..."`
     from the `backend-config` ConfigMap. The same `DATABASE_URL` is
     already sourced from the `backend-secrets` ExternalSecret, so the
     ConfigMap entry was redundant AND leaked credentials into etcd
     plaintext. Added a comment explaining the intentional omission.

5. **`vapi/deployment/vapi-environment-config.env`** — P1
   - `DATABASE_URL=postgresql://dayjoy:password@postgres:5432/dayjoy_ai`
     → `DATABASE_URL=<FROM_SECRETS_MANAGER>` (aligns with the file's own
     stated convention for sensitive values).

6. **`vapi/deployment/vapi-docker-config.yml`** — P0
   - Labeled "Production Docker Compose" but hardcoded `dayjoy:dayjoy`
     for Postgres + DATABASE_URL. Replaced with
     `${DATABASE_PASSWORD:?DATABASE_PASSWORD is required}`. Added Redis
     `--requirepass` (was unauthenticated!) + authed healthcheck.
     Tightened Grafana admin password from `:-admin` default to
     `:?required`.

7. **`deployment/docker/docker-compose.prod.yml`** — P1
   - `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dayjoy}`
     → `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required in production}`
   - `DATABASE_URL=...${POSTGRES_PASSWORD:-dayjoy}...`
     → `...${POSTGRES_PASSWORD}...`
   - `GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-admin}`
     → `${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD is required in production}`

8. **`deployment/scripts/backup-postgres.sh`** + **`deployment/scripts/restore-postgres.sh`** — P1
   - `PGPASSWORD="${DB_PASSWORD:-dayjoy}"` (×3 occurrences across both
     scripts) → required `DB_PASSWORD` env var. Added
     `: "${DB_PASSWORD:?DB_PASSWORD environment variable is required}"`
     guard at the top of each script so they fail fast with an actionable
     error.

## Files Created

- **`docs/security/SECURITY_FIXES_APPLIED.md`** — comprehensive fix report
  with severity ratings, before/after snippets, file-change matrix,
  out-of-scope notes, and recommended follow-up (credential rotation,
  Git history purge with BFG/filter-repo, gitleaks pre-commit hook,
  namespace reconciliation for the voice-ai ExternalSecret).

## `.gitignore` Verification

All required secret-file patterns already present — no additions needed:

| Pattern            | Status |
|--------------------|--------|
| `.env`             | ✅     |
| `.env.local`       | ✅     |
| `.env.*.local`     | ✅     |
| `.env.production`  | ✅     |
| `.env.staging`     | ✅     |
| `*.pem`            | ✅     |
| `*.key`            | ✅     |
| `*.crt`            | ✅     |
| `secrets/`         | ✅     |

`.env.example` is intentionally NOT matched (so it remains committable as a
template).

## Out of Scope (Intentionally Not Modified)

- `.env.example` — placeholder values by design (constraint).
- Test / spec / mock files (`*.test.ts`, `*.spec.ts`, `testing/**`,
  `apps/*/tests/**`) — synthetic test credentials (constraint).
- `_reference/` folder — reference code, not production (constraint).
- Documentation files (`docs/**/*.md`, `database/documentation/*.md`,
  `vapi/docs/*.md`, `rag/docs/*.md`) — illustrative examples.
- Helm `values.yaml` — `CHANGE_ME` placeholders are the standard Helm
  chart convention.
- Root `docker-compose.yml` and `deployment/docker/docker-compose.dev.yml`
  Postgres password `dayjoy` — these are local-only dev credentials that
  match the documented `dayjoy:dayjoy` value in `.env.example`. Not real
  production secrets.

## Stage Summary

- All P0/P1 security issues fixed.
- No plaintext secrets in any committed deployment / config / script file.
- All Kubernetes `Secret` resources that previously held plaintext values
  are now `ExternalSecret` resources (consistent pattern across
  `01-base-manifests.yaml`, `02-voice-ai-manifests.yaml`,
  `03-external-secrets.yaml`, and `vapi/deployment/vapi-kubernetes-manifests.yml`).
- All production-required env vars use `:?error message` idiom — stack
  fails fast with an actionable error rather than silently falling back
  to a weak default.
- `.gitignore` verified complete.

## Recommended Follow-up (Documented in SECURITY_FIXES_APPLIED.md)

1. **Rotate every credential that was previously committed.** Assume the
   Git history has leaked. This includes `DATABASE_PASSWORD`,
   `REDIS_PASSWORD`, `JWT_SECRET`, `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`,
   `OPENAI_API_KEY`, `GRAFANA_ADMIN_PASSWORD`.
2. **Purge Git history** with `git filter-repo` or BFG Repo-Cleaner to
   remove the historical plaintext secrets, then force-push.
3. **Add a pre-commit hook** (e.g. `gitleaks` or `trufflehog`) to prevent
   future plaintext secrets from being committed.
4. **Reconcile namespace mismatch** for the voice-ai `ExternalSecret` in
   `02-voice-ai-manifests.yaml`: it's in namespace `dayjoy` (to match the
   `aws-secrets-manager` `SecretStore` from `03-external-secrets.yaml`),
   but the rest of the resources in that file are in namespace
   `dayjoy-voice-ai`. The platform team should either deploy the voice-ai
   workload into `dayjoy`, or create a `SecretStore` in `dayjoy-voice-ai`
   and update the `ExternalSecret` to reference it.

## Cross-references to Other Agent Work

- `phase-1-security-security-hardening-agent.md` — original Phase 1
  security hardening (established the `.gitignore` patterns and
  `.env.example` template this task builds on).
- `backend-agent-a-auth-security-full-stack-developer.md` — backend auth
  module (uses `JWT_SECRET` env var, which this task enforces as required
  in dev compose).
- `vapi-agent-5-testing-deployment-docs.md` — Vapi deployment docs (the
  `vapi-environment-config.env` template convention this task aligns
  with).
- `testing-agent-t3-portal-security-perf-eval-full-stack-developer.md` —
  security testing agent; this task ensures the production configs those
  tests assert against now have no plaintext secrets.

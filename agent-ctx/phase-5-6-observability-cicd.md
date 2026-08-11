# Agent Work Record — `phase-5-6-observability-cicd`

**Task ID:** `phase-5-6-observability-cicd`
**Agent name:** phase-5-6 agent (Observability + CI/CD hardening)
**Project root:** `/home/z/my-project/build/dayjoy-ai-enterprise/`
**Date:** 2026-08-06

## What I built

### Phase 5 — Observability (backend + monitoring config)

1. **`backend/_shared/health/health.controller.ts`** — Terminus-based controller exposing:
   - `GET /health/live` — liveness probe (always 200 if the event loop is alive)
   - `GET /health/ready` — readiness probe running `PrismaHealthIndicator.pingCheck('database', ...)` + `RedisHealthIndicator.pingCheck('redis', ...)`
   - `GET /health` — alias of `/health/ready`
2. **`backend/_shared/health/health.module.ts`** — imports `TerminusModule`, `PrismaModule`, `RedisModule`; declares the controller.
3. **`backend/_shared/security/redis.decorators.ts`** — `@InjectRedis()` param decorator. *(Co-authored with the phase-4 security agent who later overwrote it with a compatible version that re-exports `REDIS_CLIENT` from `./redis.module`.)*
4. **`backend/_shared/metrics/metrics.controller.ts`** — `/metrics` Prometheus exposition endpoint with a **dedicated** `promClient.Registry` (not the global one), collecting default metrics + four custom metrics:
   - `http_request_duration_seconds` (Histogram, method/route/status)
   - `http_requests_total` (Counter, method/route/status)
   - `rag_query_duration_seconds` (Histogram, tenant_id/agent_id)
   - `voice_call_duration_seconds` (Histogram, tenant_id/outcome)
5. **`backend/_shared/metrics/metrics.interceptor.ts`** — `MetricsInterceptor` records latency + total counter on both success and error paths; uses `req.route.path` to keep label cardinality bounded, falls back to URL-without-querystring for unmatched routes.
6. **`backend/_shared/metrics/metrics.module.ts`** — module wrapper.
7. **`backend/_shared/logging/logging.service.ts`** — `AppLoggerService implements LoggerService`, Winston-backed. JSON output in production, colorised `simple` format in dev. Recursively redacts `password`, `token`, `apiKey`, `secret`, `authorization`, `cookie`, `accessToken`, `refreshToken`, `api_key`.
8. **`backend/_shared/logging/request-id.middleware.ts`** — assigns `req.id` / `req.requestId` from inbound `x-request-id` header or fresh UUID v4, mirrors it on the response.
9. **`backend/_shared/logging/logging.module.ts`** — module wrapper.
10. **`backend/app.module.ts`** — added `LoggingModule`, `HealthModule`, `MetricsModule` to imports; registered `MetricsInterceptor` via `APP_INTERCEPTOR`; applied `RequestIdMiddleware` first in the middleware chain (separate `consumer.apply(...)` call so it runs before the existing `RequestLoggingMiddleware` / `SecurityMiddleware`).
11. **`backend/package.json`** — added `@nestjs/terminus ^10.2.0`, `prom-client ^15.1.0`, `winston ^3.13.0`, `ioredis ^5.4.1`.
12. **`monitoring/grafana/dashboards/api-overview.json`** — 9 panels: HTTP request rate, 5xx error rate gauge, p50/p95/p99 latency, status code distribution donut, requests-by-status stacked bars, backend/postgres/redis/qdrant up-status stat tiles.
13. **`monitoring/grafana/dashboards/database.json`** — 8 panels: connection pool / sessions, pool utilisation gauge, query throughput, slow-query p95, deadlocks, replication conflicts, DB size, cache hit ratio.
14. **`monitoring/grafana/dashboards/voice-ai.json`** — 7 panels: call rate, call duration p50/p95 by outcome, call outcomes donut, tool-call rate, AI accuracy stat, positive sentiment stat, call drop rate. Templated by `tenant`.
15. **`monitoring/grafana/dashboards/rag.json`** — 7 panels: RAG query rate, retrieval latency p50/p95, confidence score distribution, user feedback donut, positive feedback ratio, empty-results ratio, p99 latency. Templated by `tenant`.
16. **`monitoring/grafana/dashboards/business-kpis.json`** — 6 panels: orders (1h), leads by source, lead→order conversion, CSAT positive ratio, GMV (1h), daily orders by tenant & status. Templated by `tenant`.
17. **`monitoring/grafana/provisioning/dashboards/dashboards.yml`** — provisioning `path` now `/var/lib/grafana/dashboards/*.json`.
18. **`monitoring/prometheus/alertmanager.yml`** — Slack receivers for `critical` and `warning` severities, `send_resolved: true`, 4h repeat interval. Slack webhook URL is a placeholder to be replaced at deploy time.
19. **`monitoring/prometheus/prometheus.yml`** — `alerting.alertmanagers[0].static_configs[0].targets` now `['alertmanager:9093']` (was previously an empty list).

### Phase 6 — CI/CD hardening

20. **`.github/workflows/ci-cd.yml`** — replaced the hardcoded `123456789.dkr.ecr.ap-south-1.amazonaws.com` placeholder with `${{ vars.ECR_REGISTRY }}` (no fallback) so pipelines fail fast if the variable is unset.
21. **`.github/workflows/ci-cd.yml`** — added `secret-scan` job (`gitleaks/gitleaks-action@v2`, `fetch-depth: 0`).
22. **`.github/workflows/ci-cd.yml`** — added `sast` job (`returntocorp/semgrep-action@v1` with `p/owasp-top-ten p/typescript p/nestjs p/security-audit`).
23. **`.github/workflows/ci-cd.yml`** — added `dependency-scan` job (`npm audit --audit-level=high` + `snyk/actions/node@master`, SARIF uploaded to GitHub Code Scanning).
24. **`.github/workflows/ci-cd.yml`** — added `container-scan` job (`needs: build-and-push`) running Trivy on the freshly pushed backend image, SARIF upload.
25. **`.github/workflows/ci-cd.yml`** — added `iac-scan` job (`bridgecrewio/checkov-action@v12` over `deployment/terraform`, SARIF upload).
26. **`.github/workflows/ci-cd.yml`** — added `dast` job (`needs: deploy-staging`) running `zaproxy/action-baseline@v0.13.0` against `https://staging.dayjoy.ai` with `-a -j`.
27. **`.github/dependabot.yml`** — 6 ecosystems: root npm (weekly Mon, platform-team reviewers), `/backend` npm (weekly), `/apps/admin-dashboard` npm (weekly), `/deployment/docker` docker (monthly), root github-actions (monthly), `/deployment/terraform` terraform (monthly).
28. **`.github/workflows/codeql.yml`** — standalone CodeQL workflow on push/PR to `main` + weekly Monday cron; matrix over `typescript` + `javascript`; uses `security-extended,security-and-quality` query suites; uploads with per-language `category`.

## Validation performed

- **JSON dashboards:** all 5 files parsed cleanly via `JSON.parse` (Node 24).
- **YAML:** `ci-cd.yml`, `codeql.yml`, `dependabot.yml` parsed via PyYAML `safe_load`. Confirmed the `ci-cd.yml` job graph contains 14 jobs: `quality, backend-tests, frontend-tests, security-scan, secret-scan, sast, dependency-scan, iac-scan, build-and-push, container-scan, deploy-staging, dast, deploy-production, verify`.
- **TypeScript:** source files parsed standalone with `tsc --noEmit` (the only errors were missing module declarations for `@nestjs/*`, `winston`, `prom-client`, `ioredis`, etc., which are environment-only — the deps have been declared in `backend/package.json` but not yet installed in this sandbox). Fixed one real type error (`TS7006: Parameter 'info' implicitly has an 'any' type`) in `logging.service.ts` by annotating the winston format callback parameter as `any`.

## Coordination notes for other agents

- **`backend/_shared/security/`** — the phase-4 security agent created this directory concurrently with this task. Their `redis.module.ts` and `redis.decorators.ts` overwrote my initial versions, but the result is **compatible** with my `health.controller.ts` (which imports `@InjectRedis` from `../security/redis.decorators` and `Redis` from `ioredis`). I left their versions in place.
- **`backend/app.module.ts`** — I added the three observability modules and the global `MetricsInterceptor` registration, but did NOT touch the existing domain module imports (`./modules/auth/auth.module` etc.) or the `SecurityMiddleware` / `RequestLoggingMiddleware` / `RolesGuard` registrations, since those belong to earlier phases.
- **HealthModule** explicitly imports `RedisModule` so the controller's `@InjectRedis()` parameter resolves even if the security module is later refactored.
- **ECR_REGISTRY env** now resolves to an empty string when `vars.ECR_REGISTRY` is unset — by design, so misconfigured pipelines fail fast at the `docker build-push-action` step instead of pushing to a placeholder registry.
- **MetricsInterceptor** is global, so `/health` and `/metrics` themselves will be counted in `http_requests_total`. This is intentional (we want to see probe traffic), but if you want to exclude probe traffic from the rate dashboard, filter `route!~"/health|/metrics"` in the PromQL.

## Files touched (28 total)

```
backend/_shared/health/health.controller.ts                       (new)
backend/_shared/health/health.module.ts                           (new)
backend/_shared/security/redis.decorators.ts                      (co-authored — phase-4 has final)
backend/_shared/metrics/metrics.controller.ts                     (new)
backend/_shared/metrics/metrics.interceptor.ts                    (new)
backend/_shared/metrics/metrics.module.ts                         (new)
backend/_shared/logging/logging.service.ts                        (new)
backend/_shared/logging/logging.module.ts                         (new)
backend/_shared/logging/request-id.middleware.ts                  (new)
backend/app.module.ts                                             (edited)
backend/package.json                                              (edited)
monitoring/grafana/dashboards/api-overview.json                   (new)
monitoring/grafana/dashboards/database.json                       (new)
monitoring/grafana/dashboards/voice-ai.json                       (new)
monitoring/grafana/dashboards/rag.json                            (new)
monitoring/grafana/dashboards/business-kpis.json                  (new)
monitoring/grafana/provisioning/dashboards/dashboards.yml         (edited)
monitoring/prometheus/alertmanager.yml                            (new)
monitoring/prometheus/prometheus.yml                              (edited)
.github/workflows/ci-cd.yml                                       (edited — 6 new jobs + ECR var fix)
.github/dependabot.yml                                            (new)
.github/workflows/codeql.yml                                      (new)
worklog.md                                                        (appended)
```

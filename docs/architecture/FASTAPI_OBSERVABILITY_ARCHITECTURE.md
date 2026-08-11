# Enterprise Observability Platform — Architecture

> Stage 2 Step 7 — Centralized monitoring, logging, tracing, and alerting
> for the entire AI SaaS platform.

## 1. Overview

Every module reports metrics, logs, traces, and health status through this
platform. It supports production debugging, performance analysis, and
proactive alerting.

### Technologies

| Technology | Purpose | Status |
|---|---|---|
| **Prometheus** | Metrics collection + scraping | ✅ Existing `/metrics` endpoint extended |
| **Grafana** | Dashboards + visualization | ✅ Dashboard data via API |
| **OpenTelemetry** | Distributed tracing | ✅ OTLP export (FastAPI, SQLAlchemy, Redis, httpx auto-instrumented) |
| **Sentry** | Error tracking + grouping | ✅ Backend exception capture with PII filtering |
| **Structured JSON Logging** | Centralized logging | ✅ Secret masking, tenant/request/session IDs |

## 2. Architecture

```
Application → OpenTelemetry → OTLP Collector → Jaeger/Zipkin/Datadog
     ↓
Prometheus ← /metrics endpoint
     ↓
Grafana Dashboards
     ↓
Alert Manager → Email / Slack / Webhook

Sentry ← Exception capture (before_send filter for PII)
```

## 3. Database (5 new tables)

| Table | Purpose |
|---|---|
| `system_metrics` | Time-series metric snapshots for historical analysis |
| `alerts` | Alert definitions + fired alert instances |
| `monitoring_events` | System events (health changes, deployments, outages) |
| `error_reports` | Error tracking with fingerprint-based grouping (Sentry-style) |
| `performance_reports` | Periodic performance summaries (hourly/daily/weekly) |

## 4. API endpoints (10 REST)

- `GET /observability/health` — System health (database, redis, providers, circuit breakers)
- `GET/POST /observability/metrics` — Metric snapshots
- `GET/POST /observability/alerts` — Alert management
- `POST /observability/alerts/{id}/resolve` — Resolve alert
- `GET /observability/errors` — Error reports
- `POST /observability/errors/capture` — Capture error
- `POST /observability/errors/{id}/resolve` — Resolve error
- `GET/POST /observability/events` — Monitoring events
- `GET /observability/summary` — Platform dashboard summary
- `GET /observability/config` — Public config

## 5. Sentry integration

Sentry captures unhandled exceptions, AI failures, and provider errors.
Auto-instruments FastAPI, SQLAlchemy, and Redis.

**PII filtering**: `before_send` hook masks `authorization`, `cookie`,
`x-api-key` headers and `password`, `token`, `secret` body fields.

Setup:
1. Create project at [sentry.io](https://sentry.io)
2. Copy DSN from Project Settings → Client Keys
3. Set `SENTRY_DSN=https://xxx@sentry.io/123`
4. Set `ENABLE_SENTRY=true`

## 6. OpenTelemetry tracing

Distributed tracing across API, AI Provider, RAG, Database, Redis, Voice,
Telephony, WhatsApp, and Notification services.

Auto-instruments: FastAPI, SQLAlchemy, Redis, httpx.

Setup:
1. Deploy OTLP collector (e.g. `otel-collector-contrib`)
2. Set `OTEL_EXPORTER_ENDPOINT=http://otel-collector:4317`
3. Set `ENABLE_TRACING=true`
4. Configure collector to forward to Jaeger/Zipkin/Datadog

## 7. Metrics

### Existing (from Phase 8)
- HTTP request count, latency, error rate (per endpoint/method/status)
- Circuit breaker states
- `/metrics` endpoint (Prometheus format)

### Extended (Stage 2 Step 7)
- `SystemMetric` table for historical snapshots
- Business metrics (AI, RAG, Voice, Telephony, WhatsApp, Notifications)
- `record_business_metric()` function for custom metrics

## 8. Alerting

Alert definitions are stored in the `alerts` table with rules:
```json
{"metric": "error_rate", "operator": ">", "threshold": 0.05, "duration_seconds": 300}
```

Alert lifecycle: `active` → `firing` → `resolved`

Notifications via: email, webhook, Slack (future-ready).

## 9. Structured logging

Logs include: user_id, tenant_id, request_id, session_id, provider, latency,
errors, API endpoint, severity, timestamp.

Secret masking: `password`, `token`, `api_key`, `secret`, `auth`, `authorization`
fields are automatically masked with `[REDACTED]`.

## 10. Testing

19 tests in `app/tests/test_observability.py` covering:
- Sentry initialization (no crash when disabled)
- OpenTelemetry initialization (no crash when disabled)
- Metric recording + retrieval
- Alert creation + resolution
- Error capture + fingerprint grouping (deduplication)
- Event recording + listing
- Platform summary
- Performance reports

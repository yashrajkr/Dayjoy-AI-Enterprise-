# Production Readiness Checklist

Use this checklist before each production deployment. Every item must be verified.

## Security

- [ ] RDS security group restricts ingress to EKS node SG only (not 0.0.0.0/0)
- [ ] All K8s Secrets sourced from ExternalSecrets / AWS Secrets Manager
- [ ] OAuth2 authorization codes stored in Redis with TTL
- [ ] JWT JTI blocklist active (checked on every request)
- [ ] All webhooks (Vapi, Twilio, WhatsApp, Stripe) verify signatures unconditionally
- [ ] Pod Security Standards enforced (runAsNonRoot, readOnlyRootFilesystem, drop ALL capabilities)
- [ ] IRSA on all ServiceAccounts
- [ ] No 0.0.0.0/0 security groups (except ALB)
- [ ] All S3 buckets encrypted with KMS, versioning enabled, public access blocked
- [ ] WAF on ALB with rate-limiting + AWS Managed Rules
- [ ] Pass OWASP ZAP scan with 0 High/Critical findings
- [ ] No secrets in git (gitleaks passes)
- [ ] No hardcoded API keys in source

## Reliability

- [ ] All services expose /health/live and /health/ready
- [ ] HPA on all Deployments
- [ ] PDB on all Deployments (minAvailable: 2)
- [ ] Blue/green or canary deploy strategy
- [ ] Backup runs daily, restore tested monthly
- [ ] Multi-AZ RDS
- [ ] Graceful shutdown tested (SIGTERM handled)
- [ ] Circuit breakers on all external calls (Vapi, OpenAI, Twilio, WhatsApp)
- [ ] Database connection pool sized correctly (max 80% of RDS max_connections)

## Observability

- [ ] Grafana dashboards: API, DB, Redis, voice, RAG, K8s, business
- [ ] Alertmanager routes to PagerDuty/Slack
- [ ] Structured JSON logs shipped to Loki/CloudWatch
- [ ] OpenTelemetry traces on all requests
- [ ] Sentry for error tracking (frontend + backend)
- [ ] SLOs defined and measured (99.9% availability, p95 < 500ms)
- [ ] Runbook for every alert

## Testing

- [ ] Backend ≥80% line coverage
- [ ] Frontend ≥60% line coverage
- [ ] E2E covers all critical user journeys (login, voice call, RAG query, order)
- [ ] Load test proves target RPS (100 RPS sustained, 500 RPS burst)
- [ ] Multi-tenant isolation tested
- [ ] Chaos test: DB down, Redis down, provider down

## Documentation

- [ ] Every doc claim verified against code
- [ ] ADRs for all major architectural decisions
- [ ] API docs generated from OpenAPI spec (@nestjs/swagger)
- [ ] Onboarding doc for new engineers (setup in < 1 day)
- [ ] Ops runbook covering all common incidents

## CI/CD

- [ ] Push to main → staging automatically
- [ ] Manual promotion to prod (no auto-deploy to prod)
- [ ] Rollback < 5 minutes
- [ ] Secret scanning (gitleaks) green
- [ ] SAST (Semgrep) green
- [ ] DAST (OWASP ZAP) green
- [ ] Dependency scanning (Snyk) green
- [ ] Container scanning (Trivy) green
- [ ] IaC scanning (checkov) green
- [ ] CodeQL green

## Database

- [ ] `prisma generate` succeeds
- [ ] `prisma migrate deploy` is idempotent
- [ ] All Alembic migrations tested in staging
- [ ] RLS policies active on all tenant-scoped tables
- [ ] pgvector extension enabled
- [ ] Vector indexes (HNSW) created
- [ ] Connection pooling configured (PgBouncer)
- [ ] Slow query log enabled
- [ ] Vacuum schedule configured

## Pre-deployment

- [ ] Staging deploy successful
- [ ] Smoke tests pass in staging
- [ ] DB migration applied to staging
- [ ] Feature flags configured
- [ ] DNS TTL lowered (for fast rollback)
- [ ] On-call schedule confirmed
- [ ] Incident response runbook accessible
- [ ] Status page configured

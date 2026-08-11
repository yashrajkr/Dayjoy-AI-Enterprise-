# Operations Runbook

## Common Incidents

### 1. High 5xx Error Rate

**Symptom:** Prometheus alert `HighErrorRate` fires (>5% 5xx for 5 min)

**Investigation:**
1. Check Grafana → API Overview dashboard → "HTTP Status Codes" panel
2. Identify which routes are failing
3. Check logs: `kubectl logs -n dayjoy -l app=backend --tail=200 | jq 'select(.level=="error")'`
4. Check if DB is healthy: `kubectl exec -it <pod> -- curl http://localhost:3000/health/ready`

**Mitigation:**
- If DB issue: check RDS metrics, failover if needed
- If Redis issue: check ElastiCache, restart pods if cache corrupted
- If code issue: rollback to previous deployment
  ```bash
  kubectl rollout undo deployment/backend -n dayjoy
  ```

### 2. Database Connection Pool Exhausted

**Symptom:** `DatabaseConnectionsHigh` alert, errors "too many connections"

**Investigation:**
1. Check RDS → Performance Insights → top queries
2. Check PgBouncer metrics (if used)
3. Identify long-running queries

**Mitigation:**
- Kill long-running queries: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='active' AND query_start < now() - interval '5 minutes';`
- Reduce backend replicas temporarily
- Investigate N+1 queries in code

### 3. Voice AI Webhook Failures

**Symptom:** `VoiceWebhookErrors` alert, Vapi dashboard shows failed webhooks

**Investigation:**
1. Check webhook pod logs: `kubectl logs -n dayjoy -l app=voice-ai --tail=200`
2. Verify VAPI_WEBHOOK_SECRET matches Vapi dashboard
3. Check signature verification: should be HMAC-SHA256

**Mitigation:**
- If secret mismatch: update ExternalSecret with correct value
- If timeout: increase HPA min replicas for voice-ai

### 4. RAG Query Latency High

**Symptom:** `RAGConfidenceLow` or high p95 latency on /api/knowledge/query

**Investigation:**
1. Check Grafana → RAG dashboard
2. Check pgvector index health: `SELECT * FROM pg_stat_user_indexes WHERE indexname LIKE '%hnsw%';`
3. Check embedding API latency

**Mitigation:**
- Rebuild HNSW index: `REINDEX INDEX rag_chunks_embedding_idx;`
- Increase `hnsw.ef_search` if recall is low
- Cache common queries in Redis

## Deployment Procedures

### Deploy to Staging

```bash
# 1. Merge PR to main (triggers CI/CD automatically)
# 2. CI builds, tests, scans, deploys to staging
# 3. Verify staging:
curl https://staging.dayjoy.ai/health
# 4. Run smoke tests:
cd testing/e2e && npx playwright test --grep @smoke
```

### Promote to Production

```bash
# 1. Manual approval in GitHub Actions
# 2. Approve → CD deploys to production (canary)
# 3. Monitor for 10 minutes
# 4. If healthy → full rollout. If errors → auto-rollback.

# Manual rollback:
kubectl rollout undo deployment/backend -n dayjoy
kubectl rollout undo deployment/admin-dashboard -n dayjoy
kubectl rollout undo deployment/voice-ai -n dayjoy
```

### Database Migration

```bash
# 1. Test migration in staging first
# 2. Backup production DB
bash deployment/scripts/backup-postgres.sh
# 3. Apply migration
cd database
psql -h <rds-host> -U dayjoy -d dayjoy_ai -f migrations/00X_new_migration.sql
# 4. Verify
psql -h <rds-host> -U dayjoy -d dayjoy_ai -c "SELECT * FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;"
# 5. If issue, restore from backup
bash deployment/scripts/restore-postgres.sh backups/dayjoy_ai_YYYYMMDD.dump
```

## Backup & Restore

### Daily Backup (automated)
- Schedule: `0 2 * * *` (2 AM IST)
- Target: S3 `dayjoy-prod-backups/`
- Retention: 30 days, then Glacier for 1 year

### Manual Backup
```bash
bash deployment/scripts/backup-postgres.sh
```

### Restore Test (monthly)
```bash
# 1. Restore to staging
bash deployment/scripts/restore-postgres.sh s3://dayjoy-prod-backups/dayjoy_ai_YYYYMMDD.dump
# 2. Run smoke tests
# 3. Document results in ops wiki
```

## On-Call Responsibilities

### During business hours
- Acknowledge alerts within 5 minutes
- Investigate using this runbook
- Escalate to team lead if unresolved in 30 minutes

### After hours (critical only)
- Page on-call engineer via PagerDuty
- Acknowledge within 15 minutes
- Open incident channel in Slack
- Post-mortem within 48 hours

## Useful Commands

```bash
# Pod status
kubectl get pods -n dayjoy
kubectl describe pod <pod-name> -n dayjoy

# Logs
kubectl logs -f deployment/backend -n dayjoy
kubectl logs -f deployment/voice-ai -n dayjoy --tail=100

# Exec into pod
kubectl exec -it <pod-name> -n dayjoy -- /bin/sh

# Scale deployment
kubectl scale deployment backend -n dayjoy --replicas=5

# Restart deployment (rollout)
kubectl rollout restart deployment/backend -n dayjoy

# Check events
kubectl get events -n dayjoy --sort-by='.lastTimestamp'

# Database port-forward
kubectl port-forward svc/postgres 5432:5432 -n dayjoy
psql -h localhost -U dayjoy -d dayjoy_ai

# Redis port-forward
kubectl port-forward svc/redis 6379:6379 -n dayjoy
redis-cli -h localhost
```

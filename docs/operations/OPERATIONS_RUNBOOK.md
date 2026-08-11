# Operations Runbook — Dayjoy AI Platform

> Common operational issues, troubleshooting steps, and recovery procedures.

## 1. Health Checks

### Check overall health
```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/live    # Liveness (K8s)
curl http://localhost:8000/health/ready   # Readiness (K8s)
```

### Check observability dashboard
```bash
curl http://localhost:8000/api/v1/observability/health
curl http://localhost:8000/api/v1/observability/summary
```

## 2. Common Issues

### Backend won't start

**Symptom**: `uvicorn` fails to bind or crashes immediately

**Steps**:
1. Check database connectivity: `psql $DATABASE_URL -c "SELECT 1"`
2. Check Redis: `redis-cli ping`
3. Check environment variables: `python -c "from app.core.config import settings; settings.validate_production()"`
4. Check logs: `docker compose logs backend`
5. Run migrations: `alembic upgrade head`

### Database connection errors

**Symptom**: `OperationalError: could not connect to server`

**Steps**:
1. Verify `DATABASE_URL` is correct
2. Check PostgreSQL is running: `docker compose ps postgres`
3. Check connection pool: `SELECT count(*) FROM pg_stat_activity;`
4. Restart backend pod: `kubectl rollout restart deployment/backend -n production`

### Redis connection errors

**Symptom**: `ConnectionRefusedError` on cache operations

**Steps**:
1. App will degrade gracefully (in-memory fallback)
2. Check Redis: `redis-cli ping`
3. Restart Redis: `kubectl rollout restart deployment/redis -n production`

### AI provider timeout

**Symptom**: `/api/v1/ai/chat` returns 504 or takes >30s

**Steps**:
1. Check provider API key: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
2. Check circuit breaker: `GET /api/v1/observability/health` → circuit_breakers
3. Switch provider: Set `DEFAULT_AI_PROVIDER=anthropic` (or other)
4. Check provider status pages:
   - OpenAI: https://status.openai.com
   - Anthropic: https://status.anthropic.com

### WhatsApp webhook not receiving

**Symptom**: Messages sent to WhatsApp number get no response

**Steps**:
1. Check webhook URL is accessible: `curl -X GET "https://your-domain.com/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"`
2. Check Meta dashboard → WhatsApp → Configuration → Webhook is subscribed
3. Check webhook logs: `GET /api/v1/observability/events?event_type=message.received`
4. Verify `META_APP_SECRET` is set (for signature verification)

### Telephony calls not connecting

**Symptom**: Inbound calls get busy signal or no response

**Steps**:
1. Check Twilio webhook URLs in Twilio console
2. Verify `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set
3. Check phone number is registered: `GET /api/v1/telephony/phone-numbers`
4. Test webhook: `curl -X POST https://your-domain.com/api/v1/telephony/webhook/twilio/voice`

## 3. Recovery Procedures

### Database Recovery

```bash
# 1. Stop backend
kubectl scale deployment backend --replicas=0 -n production

# 2. Restore from backup
./infra/backups/restore_postgres.sh /backups/dayjoyai_20240101_020000.sql.gz

# 3. Run migrations
alembic upgrade head

# 4. Restart backend
kubectl scale deployment backend --replicas=3 -n production

# 5. Verify
curl http://localhost:8000/health/ready
```

### Rollback Deployment

```bash
# Kubernetes rollout undo
kubectl rollout undo deployment/backend -n production
kubectl rollout undo deployment/frontend -n production

# Check status
kubectl rollout status deployment/backend -n production

# Helm rollback
helm rollback dayjoyai <REVISION> -n dayjoyai
```

### Clear Stuck Queue

```bash
# Clear Redis notification queue
redis-cli FLUSHDB

# Or selectively:
redis-cli KEYS "cache:*" | xargs redis-cli DEL
```

## 4. Monitoring Alerts

### High Error Rate (>5%)
1. Check `/api/v1/observability/errors` for recent errors
2. Check Sentry dashboard for new issues
3. Check provider status pages
4. Consider rolling back if error spike correlates with deployment

### High Latency (>500ms P95)
1. Check `/metrics` for slow endpoints
2. Check database slow query log
3. Check Redis hit rate (should be >80%)
4. Consider scaling: `kubectl scale deployment backend --replicas=5`

### Database Unavailable
1. Check RDS console for maintenance windows
2. Check failover status (if multi-AZ)
3. Restart connection pool: `kubectl rollout restart deployment/backend`

## 5. Backup Verification

### Verify PostgreSQL backup
```bash
# Create test backup
./infra/backups/backup_postgres.sh

# Verify it can be restored (on a test DB)
createdb dayjoyai_test_restore
PGPASSWORD=dayjoy psql -h localhost -U dayjoy -d dayjoyai_test_restore < <(gunzip -c /backups/dayjoyai_*.sql.gz | head -1000)
dropdb dayjoyai_test_restore
```

## 6. Scaling

### Scale backend
```bash
# Manual
kubectl scale deployment backend --replicas=5 -n production

# HPA (automatic)
kubectl autoscale deployment backend --min=3 --max=10 --cpu-percent=70 -n production
```

### Scale database
```bash
# Modify RDS instance class
aws rds modify-db-instance \
    --db-instance-identifier dayjoyai-production-postgres \
    --db-instance-class db.r6g.xlarge \
    --apply-immediately
```

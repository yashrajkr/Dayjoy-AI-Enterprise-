# Dayjoy AI Platform — Incident Response Runbook

## Incident Severity Matrix

| Severity | Definition | Response Time | Escalation | Examples |
|----------|-----------|---------------|------------|----------|
| **P0** | Production down; data loss | 5 min | CEO, CTO, all-hands | All API 500s, DB down, data breach |
| **P1** | Major feature broken; SLA breach | 15 min | CTO, VP Eng, on-call | Voice calls failing, auth down, AI not responding |
| **P2** | Degraded service; workaround exists | 2 hours | On-call lead | Slow responses, some endpoints failing |
| **P3** | Minor issue; cosmetic | Next business day | Ticket queue | UI glitch, typo, non-critical bug |

## Escalation Policy

### P0/P1: Immediate Response
1. **On-call engineer** acknowledges within 5 min (PagerDuty)
2. If no ack in 5 min → escalate to **secondary on-call**
3. If no ack in 10 min → call **CTO**
4. If no ack in 15 min → call **CEO**

### P2: Standard Response
1. On-call engineer acknowledges within 30 min
2. Create incident in incident tracking system
3. Investigate and resolve within SLA

### P3: Low Priority
1. Create Jira ticket
2. Assign to sprint backlog

---

## Incident Response Process

### 1. Detect
- Prometheus alert fires → PagerDuty → on-call engineer
- Customer reports issue → support → engineering
- Dashboard anomaly detected → on-call engineer

### 2. Acknowledge
- Acknowledge in PagerDuty
- Post in #incidents Slack channel: "🚨 [P1] [Brief description] — investigating"
- Create incident ticket

### 3. Investigate
- Check dashboards: Grafana, Datadog, CloudWatch
- Check logs: `kubectl logs -n dayjoyai -l app=backend --tail=200`
- Check recent deployments: `kubectl rollout history deployment/backend -n dayjoyai`
- Check circuit breakers: `curl localhost:8000/health/ready`

### 4. Mitigate
- **Rollback**: `kubectl rollout undo deployment/backend -n dayjoyai`
- **Scale up**: `kubectl scale deployment/backend --replicas=10 -n dayjoyai`
- **Circuit break**: Trigger circuit breaker for failing external service
- **Traffic control**: Enable rate limiting, block problematic endpoints

### 5. Resolve
- Apply fix
- Deploy fix via CI/CD pipeline
- Verify resolution: health checks, smoke tests
- Close incident in PagerDuty

### 6. Postmortem
- Within 48 hours of resolution
- Use postmortem template (see below)
- Share with team in retrospective meeting

---

## Recovery Procedures

### Database Failover
```bash
# 1. Check RDS status
aws rds describe-db-instances --db-instance-identifier dayjoyai-postgres

# 2. If primary is down, promote read replica
aws rds promote-read-replica --db-instance-identifier dayjoyai-postgres-replica

# 3. Update application config with new endpoint
kubectl patch configmap dayjoyai-config -n dayjoyai \
  --patch '{"data":{"DATABASE_URL":"postgresql+asyncpg://dayjoy:NEW_ENDPOINT:5432/dayjoyai"}}'

# 4. Restart backend pods
kubectl rollout restart deployment/backend -n dayjoyai

# 5. Verify
kubectl exec -n dayjoyai deployment/backend -- curl -sf http://localhost:8000/health/ready
```

### Redis Failover
```bash
# Redis is configured with automatic failover (multi-AZ)
# If failover doesn't happen automatically:
aws elasticache test-failover --replication-group-id dayjoyai-redis --node-group-id 0001

# Verify new primary
aws elasticache describe-replication-groups --replication-group-id dayjoyai-redis
```

### Restore from Backup
```bash
# 1. Find the backup snapshot
aws rds describe-db-snapshots --db-instance-identifier dayjoyai-postgres

# 2. Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier dayjoyai-postgres-restored \
  --db-snapshot-identifier dayjoyai-postgres-snapshot-2026-07-15

# 3. Wait for restore to complete
aws rds wait db-instance-available --db-instance-identifier dayjoyai-postgres-restored

# 4. Update application to point to restored instance
# 5. Verify data integrity
# 6. Switch DNS/Config to restored instance
```

---

## Postmortem Template

```markdown
# Postmortem: [Incident Title]

**Date**: YYYY-MM-DD
**Severity**: P0/P1/P2/P3
**Duration**: X hours Y minutes
**Impact**: [Brief description of customer impact]

## Summary
[1-2 sentence summary of what happened]

## Timeline (all times UTC)
- HH:MM — Alert fired: [description]
- HH:MM — On-call acknowledged: [name]
- HH:MM — Investigation began: [initial findings]
- HH:MM — Root cause identified: [description]
- HH:MM — Mitigation applied: [what was done]
- HH:MM — Service restored: [how verified]
- HH:MM — Incident closed

## Root Cause
[Detailed technical explanation of what went wrong]

## Contributing Factors
- [Factor 1]
- [Factor 2]

## What Went Well
- [Thing that worked]

## What Went Wrong
- [Thing that didn't work]

## Action Items
- [ ] [Action item] — Owner: [name] — Due: [date]
- [ ] [Action item] — Owner: [name] — Due: [date]

## Lessons Learned
[What we learned from this incident]
```

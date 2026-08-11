# n8n Operations Guide

This is the day-to-day operations runbook for the Dayjoy AI Enterprise n8n instance. Bookmark this — every on-call engineer should be familiar with it.

> **Audience**: On-call engineers, Platform / DevOps team.
> **On-call rotation**: 1 week, Monday 09:00 IST → next Monday 09:00 IST.
> **Escalation**: Slack `#platform-n8n` → PagerDuty `dayjoy-n8n` service → Platform Lead.

---

## Table of Contents

1. [Daily Operations](#1-daily-operations)
2. [Monitoring Workflows](#2-monitoring-workflows)
3. [Troubleshooting Failures](#3-troubleshooting-failures)
4. [Retrying Failed Executions](#4-retrying-failed-executions)
5. [Updating Workflows](#5-updating-workflows)
6. [Adding New Workflows](#6-adding-new-workflows)
7. [Managing Credentials](#7-managing-credentials)
8. [Upgrading n8n](#8-upgrading-n8n)
9. [Incident Response](#9-incident-response)
10. [Common Runbooks](#10-common-runbooks)

---

## 1. Daily Operations

### 1.1 Morning check (09:00 IST, before standup)

1. Open `https://n8n.dayjoy.ai/grafana` → **Dayjoy n8n Overview** dashboard.
2. Check the last 24 hours:
   - Total executions (expected: ~5,000–20,000 depending on the day).
   - Success rate (expected: >95%).
   - Failure rate (expected: <5%).
   - Avg execution time (expected: <30s).
   - Queue depth (expected: 0 most of the time, occasional spikes <50).
3. Open n8n UI → **Executions** → filter by `status=error` for last 24h.
4. Check Slack `#ops-alerts` for any overnight alerts.
5. Check PagerDuty for any unresolved incidents.

### 1.2 Midday check (14:00 IST)

1. Glance at the Grafana dashboard — confirm no anomalies.
2. Check the DLQ item count: `https://api.dayjoy.ai/admin/n8n/dlq?status=pending`.
3. If DLQ > 0: investigate (see §4).

### 1.3 End-of-day check (18:00 IST)

1. Verify all scheduled reports (daily business report) were sent successfully.
2. Confirm the DLQ daily report (09:00 IST) was posted to Slack.
3. Note any anomalies in the on-call handover doc.

### 1.4 On-call handover (Friday 18:00 IST)

Update `#platform-n8n` with:
- Open incidents (if any).
- Pending DLQ items needing investigation.
- Any ongoing workflow issues.
- Recent deployments that the next on-call should be aware of.

---

## 2. Monitoring Workflows

### 2.1 The three monitoring workflows

| Workflow | Purpose | Where to look |
|----------|---------|---------------|
| `Workflow Metrics Dashboard` | Pushes gauges to Prometheus every 5 min | Grafana dashboard |
| `Alert Rules` | Evaluates 6 alert rules every 5 min | Slack `#ops-alerts` + PagerDuty |
| `Health Check` | Probes n8n + backend + DB + Redis every 1 min | Slack `#ops-alerts` + PagerDuty |

### 2.2 The Grafana dashboard

URL: `https://n8n.dayjoy.ai/grafana/d/dayjoy-n8n-overview`

Panels:
1. **Executions (1h/24h/7d)** — total + success/error breakdown.
2. **Success rate (%) over time** — last 7 days.
3. **Per-workflow success rate** — table, sorted by failure rate.
4. **Avg execution time** — per workflow.
5. **Active workflows** — count over time.
6. **Queue depth** — current + 24h history.
7. **n8n CPU + memory** — instance utilization.
8. **Service health** — n8n, backend, DB, Redis status (1 = up, 0 = down).

### 2.3 Alert rules

| Rule ID | Condition | Severity | Action |
|---------|-----------|----------|--------|
| `WF_FAILURE_RATE_HIGH` | Failure rate > 10% in 1h (and >10 execs) | warning → critical at >25% | Slack + (PagerDuty if critical) |
| `WF_SLOW_EXECUTION` | Avg duration > 5 min for any workflow | warning | Slack |
| `N8N_QUEUE_DEPTH_HIGH` | Queue depth > 100 | warning → critical at >500 | Slack + (PagerDuty if critical) |
| `WF_NOT_EXECUTED_24H` | Scheduled workflow hasn't run in 24h | warning | Slack |
| `N8N_CPU_HIGH` | n8n CPU > 80% | warning → critical at >95% | Slack + (PagerDuty if critical) |
| `N8N_MEMORY_HIGH` | n8n memory > 80% | warning → critical at >95% | Slack + (PagerDuty if critical) |

### 2.4 Alert acknowledgment

- **Slack alerts**: react with 👀 when you start investigating, ✅ when resolved.
- **PagerDuty**: acknowledge within 5 minutes, resolve when fixed.
- **Audit log**: every alert is logged to `audit_logs` with `event_type=n8n_alert_fired`.

---

## 3. Troubleshooting Failures

### 3.1 Where to start

When you get an alert or notice a failure:

1. **Open the n8n UI** → **Executions** → filter by `status=error`.
2. Click into the failed execution to see:
   - Which node failed.
   - The error message + stack trace.
   - The input data for the failing node.
3. **Check the audit log**: `https://api.dayjoy.ai/admin/audit-logs?event_type=n8n_workflow_error` for the same execution_id.
4. **Check the DLQ**: if the global error handler routed it there.

### 3.2 Common error categories

The global error handler classifies every error into one of:

| Category | Symptoms | Action |
|----------|----------|--------|
| **transient** | Timeout, ECONNRESET, 5xx, 429 | Auto-retried 3×/30s. If still failing → DLQ. Investigate the downstream service. |
| **data** | Validation error, schema mismatch, missing field | Not retried. Sent to data team. Investigate the upstream data source. |
| **auth** | 401, 403, token expired | Auto-retried once after token refresh. If still failing → page on-call + rotate credential. |
| **external** | WhatsApp/SendGrid/Razorpay/Google returned an error | Probe the provider's status page. If down → wait. If our issue → investigate. |
| **unknown** | Doesn't match any classifier | Review the classifier rules in `global-error-handler.json`. May need to add a new pattern. |

### 3.3 Step-by-step debugging

#### Case: WhatsApp send failed with 401

1. Check n8n UI → Credentials → WhatsApp Cloud API → "Test connection".
2. If test fails → the access token expired. Generate a new one in Meta Business Manager.
3. Update the credential in n8n.
4. Retry the failed execution (see §4).
5. Investigate why the token refresh didn't catch it (the global error handler should refresh on auth errors).

#### Case: Backend API call returns 503

1. Check `https://api.dayjoy.ai/health` — is the backend up?
2. If backend is up but n8n got 503 → check the backend logs for the failing request ID.
3. If backend is down → escalate to the backend on-call (different PagerDuty service).

#### Case: Workflow stuck in "running" state

1. Check n8n UI → Executions → filter by `status=running` older than 30 min.
2. The worker likely crashed mid-execution. Force-cancel:
   ```bash
   curl -X POST -u "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" \
     http://localhost:5678/api/v1/executions/<execution-id>/stop
   ```
3. Check the worker logs: `docker compose logs n8n-worker | tail -100`.
4. If a specific node is the culprit (e.g., infinite loop in a Code node) → fix the workflow.

#### Case: Queue depth > 100

1. Check Grafana → queue depth panel. Is it sustained or a spike?
2. Check worker health: `docker compose ps n8n-worker` — are both workers up?
3. If workers are down: `docker compose up -d n8n-worker`.
4. If workers are up but queue is growing: scale out:
   ```bash
   docker compose up -d --scale n8n-worker=4
   ```
5. Investigate the slow workflow — is one workflow monopolizing the workers? (Check per-workflow duration in Grafana.)

---

## 4. Retrying Failed Executions

### 4.1 Retry from the n8n UI

1. n8n UI → **Executions** → click the failed execution.
2. Click **Retry** in the top-right.
3. n8n re-runs the workflow from the beginning with the same input data.

> **Note**: this re-runs the ENTIRE workflow, not from the failed node. For idempotency, ensure your workflows send `Idempotency-Key` headers on write operations.

### 4.2 Retry from the DLQ

If the global error handler routed the execution to the DLQ:

1. Wait for the dead-letter processor (runs every 5 min) — it auto-retries up to 3 total attempts.
2. If you need to retry manually:
   ```bash
   curl -X POST https://api.dayjoy.ai/api/internal/n8n/dead-letter-queue/<dlq-id>/retry \
     -H "Authorization: Bearer $DAYJOY_API_TOKEN"
   ```
3. If the item is already archived (max attempts exceeded), you can re-queue it:
   ```bash
   curl -X POST https://api.dayjoy.ai/api/internal/n8n/dead-letter-queue/<dlq-id>/requeue \
     -H "Authorization: Bearer $DAYJOY_API_TOKEN"
   ```

### 4.3 Bulk retry

To retry all failed executions of a specific workflow in the last 24 hours:

```bash
curl -X POST https://api.dayjoy.ai/api/internal/n8n/bulk-retry \
  -H "Authorization: Bearer $DAYJOY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "<wf-id>", "since_hours": 24, "status": "error"}'
```

### 4.4 Retry with modified payload

Sometimes you need to fix the input data and retry:

```bash
curl -X POST https://n8n.dayjoy.ai/api/v1/executions \
  -H "Authorization: Basic $(echo -n "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "<wf-id>",
    "startNodes": [{"name": "Webhook", "json": { ... your fixed payload ... }}]
  }'
```

---

## 5. Updating Workflows

### 5.1 Make changes in staging first

- Staging n8n: `https://n8n-staging.dayjoy.ai`
- Test the change with realistic sample data.
- Verify error paths still route correctly.

### 5.2 Promote to production

1. **Deactivate** the production workflow (if it has scheduled/webhook triggers).
2. **Edit** the workflow in the production n8n UI (or re-import the JSON via API).
3. **Test** manually once.
4. **Activate**.
5. **Watch** the executions for the next 10 minutes — confirm no errors.

### 5.3 Version control

- All workflow JSONs live in `automation/n8n/workflows/<category>/`.
- Commit changes with: `chore(n8n): update <workflow-name> — <reason>`.
- Tag releases: `n8n-workflows-vYYYY.MM.DD`.
- Production should always match a tagged release in git.

### 5.4 Rollback

See [DEPLOYMENT_GUIDE.md §12.2](./DEPLOYMENT_GUIDE.md#122-rollback-a-workflow-change).

---

## 6. Adding New Workflows

### 6.1 Naming + location

- File: `automation/n8n/workflows/<category>/<kebab-case-name>.json`
- Workflow name: `Dayjoy — <Category> — <Specific Name>`
- Tags: include `production` (when live), the category, and `reusable` (for sub-workflows).

### 6.2 Checklist for new workflows

- [ ] Workflow JSON in git under the right category folder.
- [ ] All credentials referenced by name (not hardcoded).
- [ ] Error handling: either rely on the global error handler, or include explicit error branches.
- [ ] Idempotency: write operations include `Idempotency-Key` header.
- [ ] Logging: critical actions logged to `audit_logs` via the backend API.
- [ ] Tested in staging with realistic data.
- [ ] Reviewed by a second engineer.
- [ ] Added to [WORKFLOW_README.md](./WORKFLOW_README.md) inventory table.
- [ ] Owner + on-call escalation in `meta.description`.
- [ ] Activated in production.
- [ ] Verified on the Grafana dashboard within 5 minutes.

### 6.3 Workflow template

Use this skeleton for new workflows:

```json
{
  "name": "Dayjoy — <Category> — <Name>",
  "nodes": [
    {
      "parameters": { /* trigger config */ },
      "name": "<Trigger>",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [0, 0]
    }
    /* ... business logic ... */
  ],
  "connections": { /* ... */ },
  "settings": {
    "executionOrder": "v1",
    "timezone": "Asia/Kolkata",
    "saveExecutionProgress": true,
    "saveManualExecutions": true,
    "callerPolicy": "workflowsFromSameOwner"
  },
  "active": false,
  "tags": [{ "name": "<category>" }, { "name": "production" }],
  "meta": {
    "templateCreatedBy": "Dayjoy Platform Team",
    "description": "What this workflow does, who owns it, escalation path.",
    "version": "1.0.0"
  }
}
```

---

## 7. Managing Credentials

### 7.1 Adding a new credential

1. n8n UI → **Settings → Credentials → Add credential**.
2. Pick the type (HTTP Header Auth, OAuth2, SMTP, etc.).
3. Fill in the secret value (paste from your password manager — never type secrets by hand).
4. Test the connection.
5. Name it descriptively: `Dayjoy API Token (prod)`, `SendGrid (prod)`, etc.

### 7.2 Rotating credentials

When a credential needs rotation (quarterly, or after a suspected leak):

1. Generate the new secret in the source system (SendGrid, Meta, Google, etc.).
2. Update the credential in n8n UI → **Settings → Credentials → Edit**.
3. Test the connection.
4. **Deactivate the old secret** in the source system (don't delete yet — wait 24h to confirm no workflow is still using it).
5. After 24h, delete the old secret.
6. Log the rotation in the audit log: `event_type=credential_rotated`.

### 7.3 Credential encryption

- All credentials are encrypted at rest with `N8N_ENCRYPTION_KEY`.
- If `N8N_ENCRYPTION_KEY` is lost → **all credentials are unrecoverable**. Store it in AWS Secrets Manager.
- If `N8N_ENCRYPTION_KEY` is rotated → re-encrypt all credentials via:
  ```bash
  docker exec -it dayjoy-n8n-main n8n user-management:reset
  # (or use the dedicated re-encryption command if available)
  ```

### 7.4 Least-privilege

- API tokens scoped to specific endpoints (not global admin).
- Example: the WhatsApp credential only has `whatsapp_business_messaging` scope, not full Meta admin.
- Review scopes quarterly (see [MAINTENANCE_GUIDE.md](./MAINTENANCE_GUIDE.md)).

---

## 8. Upgrading n8n

See [DEPLOYMENT_GUIDE.md §11](./DEPLOYMENT_GUIDE.md#11-updating-n8n).

Key points:
- **Always back up first** (`./scripts/backup.sh`).
- **Test in staging** before promoting.
- **Pin the version** (don't use `:latest`).
- **Watch the logs** for 30 minutes after the upgrade.
- **Have a rollback plan** (see DEPLOYMENT_GUIDE.md §12.1).

---

## 9. Incident Response

### 9.1 Severity levels

| Severity | Definition | Response time | Escalation |
|----------|------------|---------------|------------|
| **SEV-1** | n8n is down, or a critical workflow is failing for >15 min, impacting customers | 5 min ack | Page on-call → escalate to Platform Lead after 15 min → CTO after 1 hr |
| **SEV-2** | A workflow is failing, but customers are not directly impacted | 30 min ack | Page on-call |
| **SEV-3** | A non-critical workflow is failing, or a warning alert fired | Next business hour | Slack only |

### 9.2 SEV-1 response procedure

1. **Acknowledge** the PagerDuty incident within 5 minutes.
2. **Open the incident channel** in Slack: `#inc-n8n-<date>` (create if it doesn't exist).
3. **Assign an Incident Commander** (usually the on-call) — they coordinate, others execute.
4. **Assess impact**:
   - Is the n8n UI accessible?
   - Are WhatsApp messages flowing?
   - Are voice calls being processed?
   - Are reports being sent?
5. **Communicate** in `#inc-n8n-<date>` every 15 minutes with status updates.
6. **Mitigate**:
   - If n8n is down: restart `docker compose restart n8n-main n8n-worker`.
   - If DB is down: failover to RDS standby.
   - If a specific workflow is the culprit: deactivate it.
7. **Resolve** the root cause.
8. **Post-incident review** within 48 hours: timeline, root cause, action items.

### 9.3 Common SEV-1 scenarios

#### n8n won't start

1. Check `docker compose logs n8n-main` — look for DB connection errors or migration failures.
2. Check Postgres: `docker compose logs postgres` — is it accepting connections?
3. If DB migration failed: restore from backup and retry the upgrade.

#### All WhatsApp messages failing

1. Check the WhatsApp Cloud API status: https://metastatus.com/whatsapp-business-cloud-api
2. Check the credential in n8n (Settings → Credentials → Test).
3. If the token expired: rotate it (see §7.2).
4. If Meta is down: switch to the SMS fallback workflow (manual trigger).

#### All alerts firing simultaneously

1. Check the alert rules workflow — is it misfiring?
2. Check the metrics dashboard workflow — did it return bad data?
3. Look at the most recent execution of each: n8n UI → Workflows → filter by `monitoring` tag.

### 9.4 Post-incident review template

```markdown
# Incident Report — <SEV-X> — <YYYY-MM-DD>

## Summary
<1-2 sentences>

## Timeline (all times IST)
- HH:MM — Alert fired (rule: <rule_id>)
- HH:MM — On-call acknowledged
- HH:MM — Root cause identified
- HH:MM — Mitigation applied
- HH:MM — Resolved

## Impact
- Duration: <X> hours
- Customers affected: <Y>
- Workflows impacted: <list>

## Root Cause
<detailed explanation>

## Contributing Factors
- <factor 1>
- <factor 2>

## What went well
- <thing 1>

## What went poorly
- <thing 1>

## Action items
- [ ] <action 1> — owner: <name> — due: <date>
- [ ] <action 2> — owner: <name> — due: <date>
```

Store post-incident reviews in `docs/incidents/<YYYY-MM-DD>-<short-description>.md`.

---

## 10. Common Runbooks

### 10.1 Restart the n8n stack

```bash
ssh ubuntu@n8n.dayjoy.ai
cd /opt/dayjoy-ai-enterprise/automation/n8n
docker compose restart
# Verify:
docker compose ps
curl -u "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" http://localhost:5678/healthz
```

### 10.2 Clear a stuck queue

```bash
# Flush the Redis queue (n8n will repopulate from trigger events):
docker exec -it dayjoy-n8n-redis redis-cli -a "$REDIS_PASSWORD" FLUSHDB

# Restart workers:
docker compose restart n8n-worker
```

> **Warning**: this discards in-flight executions. Use only as a last resort.

### 10.3 Free up disk space (n8n_data)

If `/home/node/.n8n` is filling up:

```bash
# Check size:
docker exec dayjoy-n8n-main du -sh /home/node/.n8n

# Prune old execution data (already auto-pruned at 14 days, but you can force it):
docker exec dayjoy-n8n-main n8n executeBatch --prune

# Or manually delete the sqlite DB (only if using sqlite; we use Postgres):
# (skip — we use Postgres)
```

### 10.4 Force-deactivate all workflows (emergency stop)

```bash
# List all active workflow IDs:
WFS=$(curl -s -u "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" \
  http://localhost:5678/api/v1/workflows | jq -r '.data[] | select(.active) | .id')

# Deactivate each:
for id in $WFS; do
  curl -X PATCH -u "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" \
    -H "Content-Type: application/json" \
    -d '{"active": false}' \
    http://localhost:5678/api/v1/workflows/$id
done
```

> **Note**: do NOT deactivate the Global Error Handler — leave it on so you still get alerts during the emergency.

### 10.5 Check the audit log

```bash
# Last 100 n8n-related audit events:
curl -s -H "Authorization: Bearer $DAYJOY_API_TOKEN" \
  "https://api.dayjoy.ai/api/audit-logs?source=n8n&limit=100" | jq '.data[]'
```

---

## See Also

- [WORKFLOW_README.md](./WORKFLOW_README.md) — Workflow inventory.
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — Initial deployment.
- [MAINTENANCE_GUIDE.md](./MAINTENANCE_GUIDE.md) — Maintenance schedule.
- [../security/security-checklist.md](../security/security-checklist.md) — Security checklist.

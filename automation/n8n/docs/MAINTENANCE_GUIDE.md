# n8n Maintenance Guide

This guide defines the maintenance schedule for the Dayjoy AI Enterprise n8n instance. Every task has an owner, a cadence, and an estimated time.

> **Audience**: Platform / DevOps team.
> **Cadence**: daily → weekly → monthly → quarterly → annual.
> **Tracking**: each task has a ticket in the project tracker (Linear/Jira) under the `n8n-maintenance` project.

---

## Table of Contents

1. [Daily Maintenance](#1-daily-maintenance)
2. [Weekly Maintenance](#2-weekly-maintenance)
3. [Monthly Maintenance](#3-monthly-maintenance)
4. [Quarterly Maintenance](#4-quarterly-maintenance)
5. [Annual Maintenance](#5-annual-maintenance)
6. [Maintenance Windows](#6-maintenance-windows)
7. [Change Management](#7-change-management)

---

## 1. Daily Maintenance

| # | Task | Owner | Est. time | How |
|---|------|-------|-----------|-----|
| 1.1 | Check error rates on Grafana dashboard | On-call | 5 min | Open Grafana → Dayjoy n8n Overview. Confirm failure rate <5%. |
| 1.2 | Review failed executions from last 24h | On-call | 15 min | n8n UI → Executions → filter by status=error. Investigate any new patterns. |
| 1.3 | Check DLQ pending count | On-call | 2 min | `curl -s -H "Authorization: Bearer $DAYJOY_API_TOKEN" https://api.dayjoy.ai/api/internal/n8n/dead-letter-queue?status=pending\&limit=1` → check `total`. If >10, investigate. |
| 1.4 | Verify backup ran successfully | On-call | 2 min | Check `/var/log/dayjoy-n8n-backup.log` for last entry. Confirm S3 upload. |
| 1.5 | Check Slack `#ops-alerts` for unresolved alerts | On-call | 2 min | Slack → #ops-alerts → filter unresolved. |
| 1.6 | Confirm all scheduled reports were sent | On-call | 5 min | n8n UI → Workflows → reports → check last execution status. |

**Total daily time**: ~30 min.

---

## 2. Weekly Maintenance

| # | Task | Owner | Est. time | Cadence | How |
|---|------|-------|-----------|---------|-----|
| 2.1 | Review workflow performance | Platform Lead | 30 min | Every Monday 09:00 IST | Grafana → per-workflow success rate. Identify any workflow with >5% failure rate. |
| 2.2 | Clean up old executions | Platform Lead | 10 min | Every Monday 10:00 IST | Already auto-pruned at 14 days, but verify: `SELECT count(*) FROM execution_entity WHERE "startedAt" < now() - interval '15 days';` should return 0. |
| 2.3 | Review DLQ weekly summary | On-call | 15 min | Every Monday 11:00 IST | Read the daily DLQ reports from the past week. Identify recurring failure patterns. |
| 2.4 | Test the backup restore (staging) | On-call | 30 min | Every Friday 14:00 IST | Restore the most recent backup into a throwaway staging instance. Verify workflows import + execute. |
| 2.5 | Rotate the n8n admin password (if due) | Security Lead | 5 min | Per policy (every 90 days) | Update `.env`, `docker compose up -d --force-recreate n8n-main caddy`. |
| 2.6 | Review on-call handover notes | Incoming on-call | 10 min | Every Monday 09:00 IST | Read the previous on-call's notes in `#platform-n8n`. |

**Total weekly time**: ~2 hours.

---

## 3. Monthly Maintenance

| # | Task | Owner | Est. time | How |
|---|------|-------|-----------|-----|
| 3.1 | Rotate credentials | Security Lead | 60 min | Rotate: WhatsApp access token, SendGrid API key, Razorpay key secret, Google OAuth refresh token. See OPERATIONS_GUIDE.md §7.2. |
| 3.2 | Review security checklist | Security Lead | 60 min | Walk through `security/security-checklist.md`. Tick boxes. Document exceptions. |
| 3.3 | Update n8n to latest patch release | Platform Lead | 30 min | See DEPLOYMENT_GUIDE.md §11. Test in staging first. |
| 3.4 | Update base images (Postgres, Redis, Caddy) | Platform Lead | 30 min | `docker compose pull` → review changelog → update → restart. |
| 3.5 | Review disk usage | On-call | 10 min | `df -h` on EC2. `docker system df`. Prune unused images: `docker image prune -a --filter "until=720h"`. |
| 3.6 | Review audit log volume | Platform Lead | 15 min | Check audit_logs table growth. If >10M rows/month, consider archiving to S3. |
| 3.7 | Run a chaos drill | On-call | 60 min | Pick one: kill a worker, restart Postgres, simulate Redis failure. Verify alerts fire and recovery works. |
| 3.8 | Review workflow inventory | Platform Lead | 30 min | Cross-reference [WORKFLOW_README.md](./WORKFLOW_README.md) with active workflows in n8n. Archive unused. |
| 3.9 | Patch EC2 OS | DevOps | 30 min | `sudo apt update && sudo apt upgrade -y`. Reboot if kernel updated (schedule maintenance window). |
| 3.10 | Review PagerDuty incident history | Platform Lead | 30 min | PagerDuty → Analytics → last 30 days. Identify recurring incidents. Create action items. |

**Total monthly time**: ~6 hours.

---

## 4. Quarterly Maintenance

| # | Task | Owner | Est. time | How |
|---|------|-------|-----------|-----|
| 4.1 | Update n8n to latest minor release | Platform Lead | 2 hours | Read release notes. Test in staging for 1 week. Promote to production during a maintenance window. See DEPLOYMENT_GUIDE.md §11.2. |
| 4.2 | Full backup restore test | Platform Lead | 2 hours | Restore the n8n_data volume + Postgres DB into a fresh staging instance. Verify all workflows + credentials work. Document the restore time. |
| 4.3 | Review all workflows for optimization | Platform + Workflow owners | 4 hours | Each workflow owner reviews their workflows. Identify: slow nodes, redundant API calls, missing error handling, missing idempotency keys. Create optimization tickets. |
| 4.4 | Archive unused workflows | Platform Lead | 1 hour | Any workflow not executed in 90 days → deactivate. After 30 more days → delete (export to git first). |
| 4.5 | Rotate `N8N_ENCRYPTION_KEY` | Security Lead | 2 hours | Generate new key. Re-encrypt all credentials. Test all workflows. See OPERATIONS_GUIDE.md §7.3. |
| 4.6 | External penetration test | Security Lead | 4 hours | Run a pentest tool (OWASP ZAP, Burp) against n8n.dayjoy.ai. Remediate findings. |
| 4.7 | Review IAM access to n8n | Security Lead | 1 hour | List all n8n users. Remove departed employees. Confirm role-based access. |
| 4.8 | Review Slack + PagerDuty integrations | Platform Lead | 30 min | Confirm Slack webhook still works. Confirm PagerDuty routing key still valid. Update on-call schedule. |
| 4.9 | Update Terraform + K8s manifests | DevOps | 2 hours | Review `deployment/terraform/` and `deployment/kubernetes/`. Apply any infrastructure drift fixes. |
| 4.10 | Capacity planning review | Platform Lead | 1 hour | Review 90-day metrics: executions/day, queue depth, CPU/mem usage. Forecast when to scale up. |

**Total quarterly time**: ~20 hours.

---

## 5. Annual Maintenance

| # | Task | Owner | Est. time | How |
|---|------|-------|-----------|-----|
| 5.1 | Full security audit | Security Lead + External | 40 hours | Engage an external auditor. Review: access control, secret management, webhook security, audit logs, network, data protection, vulnerability management, compliance. |
| 5.2 | Disaster recovery (DR) test | Platform Lead | 8 hours | Simulate complete region failure. Restore n8n from backups in a different region. Measure RTO + RPO. |
| 5.3 | Update n8n to latest major release | Platform Lead | 8 hours | Major releases (e.g., 1.x → 2.x) may have breaking changes. Schedule a maintenance window. Test in staging for 2 weeks first. |
| 5.4 | Review and update all documentation | Platform Lead | 8 hours | Update: WORKFLOW_README.md, DEPLOYMENT_GUIDE.md, OPERATIONS_GUIDE.md, MAINTENANCE_GUIDE.md, security-checklist.md. Reflect any architecture changes. |
| 5.5 | Rotate all credentials (annual hard rotation) | Security Lead | 4 hours | Even if not expired, rotate every credential: WhatsApp, SendGrid, Razorpay, Google, Slack, PagerDuty, AWS, DB password, Redis password, N8N_ENCRYPTION_KEY. |
| 5.6 | Compliance review (DPDPA, GST) | Legal + Security | 8 hours | Verify: data residency (ap-south-1), audit log retention (7 years for GST), right-to-erasure procedure. |
| 5.7 | Renew SSL certificates | DevOps | 30 min | Caddy auto-renews Let's Encrypt certs. Verify renewal happened: `caddy validate --config /etc/caddy/Caddyfile`. |
| 5.8 | Review and prune backup archives | DevOps | 1 hour | S3 lifecycle: move >30 day backups to Glacier. Delete >1 year backups (except annual snapshots). |

**Total annual time**: ~80 hours (mostly concentrated in 1-2 weeks of "maintenance week").

---

## 6. Maintenance Windows

### 6.1 Scheduled maintenance window

- **Day**: Sunday 02:00–04:00 IST.
- **Notification**: post in `#platform-n8n` and `#company-announcements` 24 hours in advance.
- **What's allowed**: n8n upgrades, credential rotations, infrastructure changes.
- **What's NOT allowed**: SEV-1 emergency changes (those happen any time, with IC approval).

### 6.2 Emergency maintenance

- **Approval**: Platform Lead (or designate).
- **Notification**: post in `#platform-n8n` immediately + page on-call.
- **Post-mortem**: required if the emergency change was unplanned.

### 6.3 Change freeze

- **Diwali, year-end (Dec 24–Jan 2)**: no non-emergency changes.
- **Sales events (e.g., Big Billion Day)**: change freeze for the duration.

---

## 7. Change Management

### 7.1 Change request process

Every maintenance task that touches production requires a change request (CR):

1. **Create CR** in the project tracker:
   - Title: `[n8n] <short description>`
   - Type: standard / normal / emergency
   - Risk: low / medium / high
   - Rollback plan
   - Test plan
2. **Approval**:
   - Standard (pre-approved, e.g., daily backup check): no approval needed.
   - Normal (e.g., monthly credential rotation): Platform Lead approval.
   - Emergency (e.g., SEV-1 fix): verbal approval from IC, documented after.
3. **Execute** during the appropriate maintenance window.
4. **Verify** smoke test (see DEPLOYMENT_GUIDE.md §9).
5. **Close CR** with outcome + post-mortem (if applicable).

### 7.2 Standard changes (pre-approved)

These tasks don't need a new CR each time:
- Daily backup verification.
- Weekly execution cleanup.
- Monthly security checklist review.
- PagerDuty / Slack integration tests.

### 7.3 Normal changes (require CR + approval)

- n8n version updates (patch + minor).
- Credential rotations.
- New workflow activation.
- Workflow JSON modifications.
- Infrastructure scaling (adding workers).

### 7.4 Emergency changes

- SEV-1 incident fixes.
- Security patches for critical CVEs.
- Rollbacks.

**Post-incident**: a CR is created retrospectively within 24 hours.

---

## Maintenance Calendar (template)

```
January:   Q1 starts — full security audit kickoff
February:  Major n8n release evaluation (staging)
March:     Q1 maintenance week (DR test + major upgrade)
April:     Q2 starts — pentest
May:       Capacity planning review
June:      Q2 maintenance week (mid-year DR test)
July:      Q3 starts — workflow optimization sprint
August:    Mid-year security refresher
September: Q3 maintenance week (encryption key rotation)
October:   Q4 starts — sales event prep (change freeze)
November:  Diwali change freeze
December:  Year-end change freeze + annual review
```

---

## See Also

- [WORKFLOW_README.md](./WORKFLOW_README.md) — Workflow inventory.
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — Initial deployment + updates.
- [OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md) — Day-to-day operations.
- [../security/security-checklist.md](../security/security-checklist.md) — Security checklist (reviewed monthly).

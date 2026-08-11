# n8n Deployment Guide

This guide walks you through deploying the Dayjoy AI Enterprise n8n instance from zero to production. Follow each section in order; do not skip prerequisites.

> **Audience**: Platform / DevOps engineers.
> **Estimated time**: 4 hours (first deployment) — 30 minutes (subsequent updates).
> **Outcome**: A production-ready n8n instance at `https://n8n.dayjoy.ai` with queue mode, monitoring, backups, and alerts.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Architecture](#2-architecture)
3. [Provision Infrastructure](#3-provision-infrastructure)
4. [Configure Environment](#4-configure-environment)
5. [Deploy n8n](#5-deploy-n8n)
6. [Initial Setup](#6-initial-setup)
7. [Configure Backups](#7-configure-backups)
8. [Configure Monitoring](#8-configure-monitoring)
9. [Smoke Test](#9-smoke-test)
10. [Scaling](#10-scaling)
11. [Updating n8n](#11-updating-n8n)
12. [Rollback](#12-rollback)

---

## 1. Prerequisites

### 1.1 Infrastructure

- **EC2 instance** (or equivalent VM): `t3.large` minimum (2 vCPU, 8 GB RAM). `t3.xlarge` recommended for production with 10+ active workflows.
- **OS**: Ubuntu 22.04 LTS (or Amazon Linux 2023).
- **Disk**: 100 GB gp3 EBS volume (for n8n_data + Postgres data + Docker images).
- **Docker Engine** 24+ and **Docker Compose** v2.
- **Domain name**: `n8n.dayjoy.ai` (and a wildcard `*.dayjoy.ai` cert or specific cert).
- **SSL certificate**: Let's Encrypt (auto-provisioned by Caddy) or ACM + ALB.

### 1.2 External services

- **RDS PostgreSQL 15** (for n8n internal DB) — OR run postgres in Docker (this guide uses Docker for simplicity; production should use RDS).
- **Redis 7** (for queue mode) — OR run redis in Docker.
- **SMTP credentials** (SendGrid recommended) — for workflow email notifications.
- **Google Calendar API credentials** (OAuth2 client ID + secret) — for meeting-booking workflows.
- **WhatsApp Business API** (Cloud API by Meta) — phone number ID + access token + webhook verify token.
- **Slack incoming webhook URL** for `#ops-alerts` — for alerts.
- **PagerDuty integration key** (Events API v2) — for critical alerts.
- **S3 bucket** (or S3-compatible) — for backups.

### 1.3 Access

- SSH key for the EC2 instance.
- AWS console access (for security groups, RDS, ALB).
- Cloudflare account (for DNS + DDoS protection).

---

## 2. Architecture

```
                      ┌─────────────────────────────────────┐
                      │           Internet                  │
                      └────────────────┬────────────────────┘
                                       │
                              ┌────────▼────────┐
                              │  Cloudflare DNS │
                              │  (DDoS shield)  │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │  ALB (HTTPS)    │
                              │  443 → 80       │
                              └────────┬────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  EC2 (t3.large)         │
                          │  ┌──────────────────┐   │
                          │  │  Caddy (TLS)     │   │
                          │  └────────┬─────────┘   │
                          │           │             │
                          │  ┌────────▼─────────┐   │
                          │  │  n8n-main        │   │
                          │  │  (webhooks + UI) │   │
                          │  └────────┬─────────┘   │
                          │           │             │
                          │  ┌────────▼─────────┐   │
                          │  │  Redis (queue)   │   │
                          │  └────────┬─────────┘   │
                          │           │             │
                          │  ┌────────▼─────────┐   │
                          │  │  n8n-worker x2   │   │
                          │  │  (executes jobs) │   │
                          │  └────────┬─────────┘   │
                          │           │             │
                          │  ┌────────▼─────────┐   │
                          │  │  PostgreSQL      │   │
                          │  └──────────────────┘   │
                          └─────────────────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  Monitoring sidecar    │
                          │  Prometheus + Grafana  │
                          │  + Pushgateway         │
                          └─────────────────────────┘
```

**Why this layout?**
- **Caddy** terminates TLS and enforces basic auth + rate limits.
- **n8n-main** handles the UI, webhook ingress, and orchestrates the queue.
- **n8n-worker** (2 replicas) pulls executions off the Redis queue — this is **queue mode** and lets you scale horizontally.
- **PostgreSQL** stores workflow definitions, credentials, execution history.
- **Redis** is the queue broker (BullMQ).
- **Prometheus + Grafana** scrape n8n /metrics and visualize health.

---

## 3. Provision Infrastructure

### 3.1 EC2 instance

Use the Terraform module in `deployment/terraform/` (recommended) or provision manually:

```bash
# Via Terraform (recommended)
cd automation/n8n/deployment/terraform/
cp terraform.tfvars.example terraform.tfvars  # edit values
terraform init
terraform plan
terraform apply
```

### 3.2 Security groups

| Inbound | Port | Source | Purpose |
|---------|------|--------|---------|
| HTTP | 80 | ALB | Caddy HTTP→HTTPS redirect |
| HTTPS | 443 | ALB | Caddy TLS termination |
| SSH | 22 | Bastion only | Admin access |
| PostgreSQL | 5432 | Same SG (internal) | n8n ↔ Postgres |
| Redis | 6379 | Same SG (internal) | n8n ↔ Redis |

**Outbound**: allow all (egress is filtered at the NAT + egress firewall layer).

### 3.3 DNS

In Cloudflare, create an A record:
- `n8n.dayjoy.ai` → EC2 public IP (orange cloud enabled for DDoS protection).

### 3.4 Install Docker

```bash
ssh ubuntu@n8n.dayjoy.ai
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# log out and back in for group change to take effect
```

### 3.5 Create the external Docker network

```bash
docker network create dayjoy-network
```

---

## 4. Configure Environment

### 4.1 Clone the repo

```bash
cd /opt
git clone https://github.com/dayjoy/dayjoy-ai-enterprise.git
cd dayjoy-ai-enterprise/automation/n8n
```

### 4.2 Create the .env file

```bash
cp .env.example .env
```

Edit `.env` and replace every placeholder:

| Variable | How to generate |
|----------|-----------------|
| `N8N_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `N8N_ADMIN_PASSWORD` | Password manager (16+ chars) |
| `DATABASE_PASSWORD` | `openssl rand -hex 24` |
| `REDIS_PASSWORD` | `openssl rand -hex 24` |
| `DAYJOY_API_TOKEN` | IAM service issues a long-lived JWT |
| `SMTP_PASSWORD` | SendGrid API key |
| `WHATSAPP_ACCESS_TOKEN` | Meta Business Manager |
| `SLACK_WEBHOOK_URL` | Slack app config |
| `PAGERDUTY_INTEGRATION_KEY` | PagerDuty service config |
| `GRAFANA_ADMIN_PASSWORD` | Password manager |

### 4.3 Verify the .env file

```bash
# Confirm no placeholders remain:
grep -E "replace-with|REPLACE" .env && echo "ERROR: placeholders remain" || echo "OK: all values set"
```

### 4.4 Permissions

```bash
chmod 600 .env
chown root:root .env
```

---

## 5. Deploy n8n

### 5.1 Pull images

```bash
docker compose --env-file .env pull
```

### 5.2 Start the stack

```bash
docker compose --env-file .env up -d
```

### 5.3 Verify services are up

```bash
docker compose ps
# All services should show "Up (healthy)" within 60 seconds.
```

### 5.4 Check logs

```bash
docker compose logs -f n8n-main
# Look for: "Editor is now accessible via: http://localhost:5678/"
```

### 5.5 Verify the health endpoint

```bash
curl -u "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" http://localhost:5678/healthz
# Expected: {"status":"ok","db":"connected","redis":"connected"}
```

---

## 6. Initial Setup

### 6.1 Access the n8n UI

1. Browse `https://n8n.dayjoy.ai`.
2. Enter basic auth credentials (from `.env`).
3. n8n shows the owner-setup screen on first launch — create the admin account.
4. Sign in.

### 6.2 Import credentials

In n8n UI → **Settings → Credentials**, add each credential used by the workflows:

| Credential type | Name | Source of secret |
|-----------------|------|------------------|
| HTTP Header Auth | Dayjoy API Token | `.env: DAYJOY_API_TOKEN` |
| SMTP | SendGrid | `.env: SMTP_*` |
| Google Calendar OAuth2 | Google Calendar | Google Cloud Console |
| WhatsApp Cloud API | WhatsApp | `.env: WHATSAPP_*` |
| Slack Webhook | Slack Alerts | `.env: SLACK_WEBHOOK_URL` |
| Razorpay | Razorpay | `.env: RAZORPAY_*` |
| Webhook Signing Secret | Dayjoy Webhook Secret | Generated per-webhook |

> **Important**: never paste secrets into the workflow JSON. Always reference the credential by name.

### 6.3 Import workflows

1. n8n UI → **Workflows → Import from File**.
2. Import every `.json` in `automation/n8n/workflows/<category>/`.
3. See [WORKFLOW_README.md §3](./WORKFLOW_README.md#3-how-to-import-a-workflow) for the bulk-import script.

### 6.4 Activate workflows

Activate workflows in this order (dependencies first):

1. `Dayjoy — Retry Strategy` (reusable sub-workflow; activate first).
2. `Dayjoy — Global Error Handler` (safety net; activate second).
3. `Dayjoy — Dead-Letter Queue Processor`.
4. `Dayjoy — Health Check`.
5. `Dayjoy — Workflow Metrics Dashboard`.
6. `Dayjoy — Alert Rules`.
7. `Dayjoy — Webhook HMAC Signature Verification` (reference; activate if used).
8. All other business workflows (WhatsApp, Voice, CRM, etc.).

### 6.5 Verify activation

```bash
# All active workflows:
curl -u "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" \
  http://localhost:5678/api/v1/workflows | jq '.data | map({name, active})'
```

---

## 7. Configure Backups

### 7.1 What to back up

| Item | Frequency | Retention | Tool |
|------|-----------|-----------|------|
| n8n_data volume (credentials, workflow JSON) | Daily 02:00 | 30 days | `docker run --volumes-from ... restic` |
| PostgreSQL DB | Daily 02:30 + WAL archiving | 30 days | `pg_dump` + WAL-G |
| Redis (optional — queue state) | Daily 02:45 | 7 days | `redis-cli BGSAVE` |

### 7.2 Install the backup script

```bash
cp automation/n8n/scripts/backup.sh /opt/dayjoy-n8n-backup.sh
chmod +x /opt/dayjoy-n8n-backup.sh
crontab -e
# Add:
0 2 * * * /opt/dayjoy-n8n-backup.sh >> /var/log/dayjoy-n8n-backup.log 2>&1
```

### 7.3 Test the restore

```bash
# Restore Postgres from a backup:
docker exec -i dayjoy-n8n-postgres psql -U dayjoy -d dayjoy_n8n < /backups/n8n_2024_01_15.sql

# Restore n8n_data volume:
docker run --rm -v n8n_data:/data -v /backups:/backup alpine tar xzf /backup/n8n_data_2024_01_15.tar.gz -C /data
```

Test the restore in staging quarterly — see [MAINTENANCE_GUIDE.md](./MAINTENANCE_GUIDE.md).

---

## 8. Configure Monitoring

### 8.1 Prometheus

Already running as part of the docker-compose stack. Verify it's scraping:

```bash
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets | map({job: .labels.job, health})'
# All jobs should be "up".
```

### 8.2 Grafana

1. Browse `https://n8n.dayjoy.ai/grafana` (admin / `GRAFANA_ADMIN_PASSWORD`).
2. Prometheus data source is auto-provisioned (see `grafana/provisioning/datasources/`).
3. Import the Dayjoy n8n dashboard (JSON in `grafana/dashboards/`).

### 8.3 Alert routing

Alerts flow as follows:

```
n8n workflow fires alert
  → Slack #ops-alerts (all severities)
  → PagerDuty (critical only)
  → Audit log (always)
```

Test the alert pipeline:

```bash
# Trigger a test alert via Slack:
curl -X POST "$SLACK_WEBHOOK_URL" -H "Content-Type: application/json" \
  -d '{"channel":"#ops-alerts","text":":wave: Test alert from n8n deployment"}'

# Trigger a test PagerDuty incident:
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H "Content-Type: application/json" \
  -d "{\"routing_key\":\"$PAGERDUTY_INTEGRATION_KEY\",\"event_action\":\"trigger\",\"payload\":{\"summary\":\"Test n8n alert\",\"severity\":\"critical\",\"source\":\"manual-test\"}}"
```

### 8.4 Import monitoring workflows

Activate the three monitoring workflows (see §6.4). Within 5 minutes:
- The `Workflow Metrics Dashboard` should push the first batch of metrics.
- The `Health Check` should report all-green.
- The `Alert Rules` workflow should evaluate all 6 rules and find none firing.

---

## 9. Smoke Test

Run through this checklist after deployment:

- [ ] `https://n8n.dayjoy.ai` loads (TLS valid, basic auth prompt).
- [ ] n8n UI accessible after auth.
- [ ] All credentials visible in Settings → Credentials.
- [ ] All workflows imported and visible in the Workflows list.
- [ ] Health check workflow fired successfully (check Executions tab).
- [ ] Metrics dashboard workflow fired successfully.
- [ ] Grafana dashboard shows data points (give it 5 min).
- [ ] Slack #ops-alerts receives no error alerts.
- [ ] PagerDuty test incident acknowledged.
- [ ] Manual test of one business workflow (e.g., send a test WhatsApp message).
- [ ] Backup script ran once and uploaded to S3.

---

## 10. Scaling

### 10.1 Vertical (bigger instance)

- `t3.large` (2 vCPU / 8 GB) → handles ~20 active workflows.
- `t3.xlarge` (4 vCPU / 16 GB) → handles ~50 active workflows.
- `t3.2xlarge` (8 vCPU / 32 GB) → handles ~100+ active workflows.

### 10.2 Horizontal (queue mode + more workers)

The docker-compose file already uses queue mode. To add more workers:

```bash
docker compose up -d --scale n8n-worker=4
```

Or update `deploy.replicas` in `docker-compose.yml`.

### 10.3 Externalize Postgres + Redis (for >100 workflows)

Move Postgres to RDS and Redis to ElastiCache for production:

1. Provision RDS Postgres in ap-south-1.
2. Provision ElastiCache Redis (cluster mode disabled) in ap-south-1.
3. Update `.env`:
   ```
   DB_POSTGRESDB_HOST=<rds-endpoint>
   QUEUE_BULL_REDIS_HOST=<elasticache-endpoint>
   ```
4. Remove `postgres` and `redis` services from `docker-compose.yml`.
5. Restart n8n: `docker compose up -d --force-recreate n8n-main n8n-worker`.

### 10.4 Multi-AZ

- For HA, deploy n8n across 2 AZs with an ALB in front.
- Use RDS Multi-AZ for Postgres.
- Use ElastiCache Redis with replica nodes.
- n8n-main should run as 2 replicas behind the ALB (stateless; sessions in Postgres).

---

## 11. Updating n8n

### 11.1 Pin the version (production)

Always pin to a specific version (not `:latest`):

```yaml
# docker-compose.yml
services:
  n8n-main:
    image: n8nio/n8n:1.62.0   # pin me
```

### 11.2 Update procedure

```bash
cd /opt/dayjoy-ai-enterprise/automation/n8n

# 1. Backup
./scripts/backup.sh

# 2. Pull new image
docker compose pull n8n-main n8n-worker

# 3. Stop
docker compose stop n8n-main n8n-worker

# 4. Start (n8n auto-migrates the DB on first boot of the new version)
docker compose up -d n8n-main n8n-worker

# 5. Verify
docker compose logs -f n8n-main
curl -u "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" http://localhost:5678/healthz
```

### 11.3 Update cadence

- **Patch releases** (e.g., 1.62.0 → 1.62.1): update within 7 days.
- **Minor releases** (e.g., 1.62 → 1.63): update within 14 days, after testing in staging.
- **Major releases** (e.g., 1.x → 2.x): schedule a maintenance window, test thoroughly in staging first.

### 11.4 CVE response

- Critical CVEs (RCE, auth bypass): patch within 48 hours.
- High CVEs: patch within 7 days.
- Subscribe to n8n security advisories: https://github.com/n8n-io/n8n/security/advisories

---

## 12. Rollback

### 12.1 Rollback to previous n8n version

```bash
# 1. Stop new version
docker compose stop n8n-main n8n-worker

# 2. Restore DB from backup taken before the upgrade
docker exec -i dayjoy-n8n-postgres psql -U dayjoy -d dayjoy_n8n < /backups/pre-upgrade.sql

# 3. Pin the old version in docker-compose.yml
#    image: n8nio/n8n:1.61.1   # the version we rolled back from

# 4. Start
docker compose up -d n8n-main n8n-worker
```

> **Note**: n8n DB downgrades are not officially supported — always restore the DB from backup before starting the older version.

### 12.2 Rollback a workflow change

```bash
# Find the previous version in git:
git log --oneline automation/n8n/workflows/monitoring/health-check.json

# Checkout the previous version:
git checkout <commit-sha> -- automation/n8n/workflows/monitoring/health-check.json

# Re-import in n8n UI (or via API):
curl -X PUT https://n8n.dayjoy.ai/api/v1/workflows/<workflow-id> \
  -H "Authorization: Basic $(echo -n "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" | base64)" \
  -H "Content-Type: application/json" \
  -d @automation/n8n/workflows/monitoring/health-check.json
```

---

## See Also

- [WORKFLOW_README.md](./WORKFLOW_README.md) — Workflow inventory + import guide.
- [OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md) — Day-to-day operations.
- [MAINTENANCE_GUIDE.md](./MAINTENANCE_GUIDE.md) — Maintenance schedule.
- [../security/security-checklist.md](../security/security-checklist.md) — Security checklist.
- [../deployment/kubernetes/](../deployment/kubernetes/) — Kubernetes manifests (alternative to docker-compose).
- [../deployment/terraform/](../deployment/terraform/) — Terraform IaC.

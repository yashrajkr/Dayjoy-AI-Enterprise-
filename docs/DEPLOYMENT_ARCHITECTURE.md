# Deployment Architecture

> How the Dayjoy AI Enterprise Platform is deployed, what services run, and
> how traffic flows from the public internet to each pod. For step-by-step
> setup instructions see [SETUP_GUIDE.md](./SETUP_GUIDE.md). For the full
> infrastructure reference see
> [`docs/infrastructure/04_DEPLOYMENT_ARCHITECTURE.md`](./infrastructure/04_DEPLOYMENT_ARCHITECTURE.md).

---

## 1. Overview

The platform is a pnpm monorepo split into **one NestJS backend**, **five
Next.js portals**, **two AI-channel services** (Vapi voice, WhatsApp), **one
n8n automation server**, and a **monitoring stack** (Prometheus + Grafana +
Loki). All services are containerised and deployed to **AWS EKS** behind a
single Application Load Balancer (ALB) with path-based routing.

```
                                    ┌──────────────────────────────┐
                                    │         Internet             │
                                    └──────────────┬───────────────┘
                                                   │
                                                   ▼
                                    ┌──────────────────────────────┐
                                    │     CloudFront (CDN)         │
                                    │   static assets + WAF        │
                                    └──────────────┬───────────────┘
                                                   │
                                                   ▼
                                    ┌──────────────────────────────┐
                                    │   AWS ALB (HTTPS :443)       │
                                    │   TLS termination (ACM)      │
                                    └──────────────┬───────────────┘
                                                   │
                          ┌────────────────────────┼────────────────────────┐
                          │                        │                        │
                          ▼                        ▼                        ▼
                ┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
                │  nginx ingress  │    │  nginx ingress      │    │  nginx ingress      │
                │  api.dayjoy.ai  │    │  admin.dayjoy.ai    │    │  app.dayjoy.ai      │
                │  /api/*         │    │  /                  │    │  /portal/*          │
                └────────┬────────┘    └──────────┬──────────┘    └──────────┬──────────┘
                         │                        │                          │
                         ▼                        ▼                          ▼
                ┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
                │  backend        │    │  admin-dashboard    │    │  customer-portal    │
                │  (NestJS :3000) │    │  (Next.js :3000)    │    │  (Next.js :3000)    │
                │  2-4 replicas   │    │  2 replicas         │    │  2 replicas         │
                └────────┬────────┘    └─────────────────────┘    └─────────────────────┘
                         │
            ┌────────────┴───────────┬───────────────────┬────────────────┐
            │                        │                   │                │
            ▼                        ▼                   ▼                ▼
   ┌─────────────────┐    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │  vapi            │    │  whatsapp-ai     │  │  website-chat    │  │  employee-portal │
   │  (voice webhook) │    │  (WA webhook)    │  │  (Next.js :3000) │  │  (Next.js :3000) │
   │  :3001           │    │  :3002           │  │  2 replicas      │  │  2 replicas      │
   │  1-2 replicas    │    │  1-2 replicas    │  └──────────────────┘  └──────────────────┘
   └────────┬─────────┘    └────────┬─────────┘
            │                       │
            ▼                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │                            Data plane                                   │
   │  ┌───────────────────┐   ┌──────────────────┐   ┌──────────────────┐   │
   │  │  Amazon RDS       │   │  ElastiCache     │   │  Amazon S3       │   │
   │  │  PostgreSQL 15    │   │  Redis 7         │   │  uploads +       │   │
   │  │  + pgvector       │   │  (cluster mode)  │   │  backups         │   │
   │  │  Multi-AZ        │   │  1 primary +     │   └──────────────────┘   │
   │  │  1 primary +     │   │  1 replica       │                           │
   │  │  1 read replica  │   │                  │   ┌──────────────────┐   │
   │  └───────────────────┘   └──────────────────┘   │  ECR             │   │
   │                                                  │  container       │   │
   │  ┌───────────────────────────────────────────┐  │  registry        │   │
   │  │  External Secrets Operator                │  └──────────────────┘   │
   │  │  syncs AWS Secrets Manager → K8s Secrets  │                          │
   │  └───────────────────────────────────────────┘                          │
   └────────────────────────────────────────────────────────────────────────┘

                ┌─────────────────────────────────────────────────┐
                │  Automation + Observability (separate namespace)│
                │                                                  │
                │  ┌──────────┐  ┌────────────┐  ┌──────────────┐ │
                │  │  n8n     │  │ Prometheus │  │  Grafana     │ │
                │  │  :5678   │  │  :9090     │  │  :3030       │ │
                │  │  1-2     │  │  1         │  │  1           │ │
                │  └──────────┘  └────────────┘  └──────────────┘ │
                │                                                  │
                │  ┌──────────┐  ┌────────────────────────────┐   │
                │  │  Loki    │  │  Alertmanager → Slack      │   │
                │  │  :3100   │  │  (PagerDuty for Sev-1)     │   │
                │  └──────────┘  └────────────────────────────┘   │
                └─────────────────────────────────────────────────┘
```

---

## 2. Services

| Service            | Port | Purpose                                  | Scaling          | K8s Namespace   |
| ------------------ | ---- | ---------------------------------------- | ---------------- | --------------- |
| Backend API        | 3000 | NestJS REST API + WebSocket + Swagger    | 2–4 replicas     | `dayjoy`        |
| Admin Dashboard    | 3003 | Admin UI (Next.js)                       | 2 replicas       | `dayjoy`        |
| Customer Portal    | 3005 | Customer UI (Next.js)                    | 2 replicas       | `dayjoy`        |
| Distributor Portal | 3006 | Distributor UI (Next.js)                 | 2 replicas       | `dayjoy`        |
| Employee Portal    | 3007 | Employee UI (Next.js)                    | 2 replicas       | `dayjoy`        |
| Website Chat       | 3004 | Embedded chat widget (Next.js)           | 2 replicas       | `dayjoy`        |
| Voice AI (Vapi)    | 3001 | Voice AI webhook handlers (NestJS module)| 1–2 replicas     | `dayjoy`        |
| WhatsApp AI        | 3002 | WhatsApp webhook handlers                | 1–2 replicas     | `dayjoy`        |
| PostgreSQL         | 5432 | Primary database (RDS, Multi-AZ)         | 1 primary + 1 RR | (managed, RDS)  |
| Redis              | 6379 | Cache + sessions + rate-limit state      | 1 primary + 1 RR | (managed, EC)   |
| n8n                | 5678 | Workflow automation (45 workflows)       | 1–2 instances    | `dayjoy-auto`   |
| Prometheus         | 9090 | Metrics scraping + alerting              | 1                | `dayjoy-mon`    |
| Grafana            | 3030 | Dashboards (5 pre-built)                 | 1                | `dayjoy-mon`    |
| Loki               | 3100 | Log aggregation                          | 1                | `dayjoy-mon`    |
| Alertmanager       | 9093 | Routes alerts to Slack/PagerDuty         | 1                | `dayjoy-mon`    |
| nginx (ingress)    | 80/443 | Ingress controller + TLS               | 2 replicas       | `ingress-nginx` |

### Resource Requests / Limits (production defaults)

| Service            | CPU (req/limit) | Memory (req/limit) | Notes                          |
| ------------------ | --------------- | ------------------ | ------------------------------ |
| Backend API        | 500m / 2000m    | 512Mi / 2Gi        | HPA at 70% CPU                 |
| Frontend portals   | 250m / 1000m    | 256Mi / 512Mi      | HPA at 80% CPU                 |
| Voice AI           | 500m / 1000m    | 512Mi / 1Gi        |                                |
| WhatsApp AI        | 250m / 500m     | 256Mi / 512Mi      |                                |
| n8n                | 250m / 1000m    | 512Mi / 1Gi        |                                |
| Prometheus         | 500m / 1000m    | 1Gi / 2Gi          | 30-day retention               |
| Grafana            | 100m / 500m     | 128Mi / 512Mi      |                                |
| Loki               | 500m / 2000m    | 1Gi / 4Gi          | 14-day retention               |

---

## 3. Network Flow

A typical request from an end user to the backend follows this path:

```
User (browser / mobile / voice / WhatsApp)
   │
   1.  DNS lookup — dayjoy.ai → CloudFront
   │
   2.  CloudFront (CDN)
         • serves cached static assets (CSS, JS, images)
         • applies WAF rules (SQLi, XSS, rate-limit, geo-block)
         • forwards dynamic requests to ALB
   │
   3.  AWS ALB (HTTPS :443)
         • terminates TLS (ACM certificate auto-renewed)
         • path-based routing:
              /api/*            → backend-service:3000
              /admin/*          → admin-dashboard:3000
              /portal/*         → customer-portal:3000
              /distributor/*    → distributor-portal:3000
              /employee/*       → employee-portal:3000
              /chat/*           → website-chat:3000
              /voice/webhook    → voice-ai:3001
              /whatsapp/webhook → whatsapp-ai:3002
   │
   4.  nginx Ingress Controller (ClusterIP)
         • per-service Ingress objects (cert-manager + Let's Encrypt for
           internal TLS between ALB and pods)
         • rate-limit per IP (ngx_http_limit_req_module)
         • request body size limit (10 MB default)
   │
   5.  Kubernetes Service (ClusterIP)
         • load-balances across pods via kube-proxy / iptables
         • sticky sessions disabled (stateless backend)
   │
   6.  Pod (Backend API container)
         • NestJS app on port 3000
         • JWT auth on protected routes
         • tenant resolution via subdomain / header / JWT claim
   │
   7.  Data plane
         • PostgreSQL (Prisma client, connection pool size 20)
         • Redis (ioredis, used for cache + sessions + rate-limit state)
         • S3 (file uploads, backups)
```

### Outbound Flows from Backend

| Destination            | Purpose                          | Egress            |
| ---------------------- | -------------------------------- | ----------------- |
| `api.openai.com:443`   | LLM + embeddings                 | NAT Gateway       |
| `api.vapi.ai:443`      | Voice AI control plane           | NAT Gateway       |
| `graph.facebook.com`   | WhatsApp Cloud API               | NAT Gateway       |
| `api.twilio.com:443`   | SMS / telephony fallback         | NAT Gateway       |
| `smtp.sendgrid.net:587`| Transactional email              | NAT Gateway       |
| RDS (private subnet)   | Database                         | VPC private       |
| ElastiCache (private)  | Cache                            | VPC private       |
| S3 (VPC endpoint)      | File storage + backups           | VPC endpoint      |

---

## 4. Security Groups

Only two ports are exposed to the public internet. Every other port is
private to the VPC.

### Public Ingress (0.0.0.0/0)

| Port | Protocol | Service                         | Source              |
| ---- | -------- | ------------------------------- | ------------------- |
| 443  | HTTPS    | ALB → nginx → all web services  | CloudFront only     |
| 80   | HTTP     | ALB (301 → 443)                 | CloudFront only     |

### VPC-Private Ingress

| Port | Protocol | Service                  | Source                                  |
| ---- | -------- | ------------------------ | --------------------------------------- |
| 5432 | TCP      | RDS PostgreSQL           | EKS worker nodes + bastion              |
| 6379 | TCP      | ElastiCache Redis        | EKS worker nodes                        |
| 9090 | TCP      | Prometheus               | Grafana pod + bastion                   |
| 9093 | TCP      | Alertmanager             | Prometheus pod                          |
| 3000 | TCP      | Backend (internal)       | EKS pods + bastion                      |
| 5678 | TCP      | n8n                      | EKS pods (via ingress only)             |

### Egress

| Destination                | Port | Service                          | Reason                |
| -------------------------- | ---- | -------------------------------- | --------------------- |
| `0.0.0.0/0` (via NAT GW)   | 443  | All pods                         | External APIs         |
| `0.0.0.0/0` (via NAT GW)   | 587  | Backend + n8n                    | SMTP                  |
| S3 VPC endpoint            | 443  | All pods                         | File uploads/backups  |
| RDS security group         | 5432 | Backend + n8n + voice + whatsapp | Database              |
| ElastiCache security group | 6379 | Backend + n8n + voice + whatsapp | Cache                 |

### Network Policies (Kubernetes)

The `dayjoy` namespace enforces a default-deny policy. Explicit allows:

| From (namespace/pod)     | To (namespace/pod)              | Port |
| ------------------------ | ------------------------------- | ---- |
| `ingress-nginx/*`        | `dayjoy/backend`                | 3000 |
| `ingress-nginx/*`        | `dayjoy/admin-dashboard`        | 3000 |
| `ingress-nginx/*`        | `dayjoy/customer-portal`        | 3000 |
| `ingress-nginx/*`        | `dayjoy/distributor-portal`     | 3000 |
| `ingress-nginx/*`        | `dayjoy/employee-portal`        | 3000 |
| `ingress-nginx/*`        | `dayjoy/website-chat`           | 3000 |
| `ingress-nginx/*`        | `dayjoy/voice-ai`               | 3001 |
| `ingress-nginx/*`        | `dayjoy/whatsapp-ai`            | 3002 |
| `dayjoy/*`               | `dayjoy-mon/prometheus`         | 9090 |
| `dayjoy-mon/prometheus`  | `dayjoy/*` (scrape /metrics)    | 3000 |
| `dayjoy/*`               | (egress via NAT)                | 443  |

---

## 5. DNS Layout

| Hostname                     | Type  | Target                        | Purpose                  |
| ---------------------------- | ----- | ----------------------------- | ------------------------ |
| `dayjoy.ai`                  | A     | CloudFront                    | Marketing site           |
| `app.dayjoy.ai`              | A     | ALB                           | Customer portal          |
| `admin.dayjoy.ai`            | A     | ALB                           | Admin dashboard          |
| `distributor.dayjoy.ai`      | A     | ALB                           | Distributor portal       |
| `employee.dayjoy.ai`         | A     | ALB                           | Employee portal          |
| `chat.dayjoy.ai`             | A     | ALB                           | Website chat widget      |
| `api.dayjoy.ai`              | A     | ALB                           | Backend REST + WebSocket |
| `n8n.dayjoy.ai`              | A     | ALB                           | n8n UI (auth-gated)      |
| `grafana.dayjoy.ai`          | A     | ALB                           | Grafana dashboards       |
| `prometheus.dayjoy.ai`       | A     | ALB (internal-only SG)        | Prometheus UI            |

---

## 6. TLS / Certificate Management

| Layer                    | Mechanism                                   |
| ------------------------ | ------------------------------------------- |
| CloudFront → User        | ACM certificate (auto-renewed)              |
| ALB → CloudFront         | ACM certificate (auto-renewed)              |
| ALB → nginx ingress      | Re-encryption with cert-manager + Let's Encrypt |
| nginx → pods             | Plain HTTP (within trusted VPC)             |
| RDS / ElastiCache        | AWS-managed TLS (enforced in transit)       |
| External API calls       | TLS 1.2+ enforced (Node `--tls-min-v1.2`)   |

cert-manager is wired up in
`deployment/kubernetes/04-cert-manager.yaml` and auto-issues certificates
via a `ClusterIssuer` for Let's Encrypt.

---

## 7. Secrets Management

All secrets live in **AWS Secrets Manager** and are synced into Kubernetes
by the **External Secrets Operator** (ESO). No secret is ever committed to
Git.

```
AWS Secrets Manager
   ├── dayjoy/prod/database      → K8s Secret: dayjoy-db
   ├── dayjoy/prod/redis         → K8s Secret: dayjoy-redis
   ├── dayjoy/prod/jwt           → K8s Secret: dayjoy-jwt
   ├── dayjoy/prod/openai        → K8s Secret: dayjoy-openai
   ├── dayjoy/prod/vapi          → K8s Secret: dayjoy-vapi
   ├── dayjoy/prod/whatsapp      → K8s Secret: dayjoy-whatsapp
   ├── dayjoy/prod/twilio        → K8s Secret: dayjoy-twilio
   ├── dayjoy/prod/smtp          → K8s Secret: dayjoy-smtp
   ├── dayjoy/prod/stripe        → K8s Secret: dayjoy-stripe
   └── dayjoy/prod/encryption    → K8s Secret: dayjoy-encryption
                ↓
   External Secrets Operator (ESO) polls every 60s
                ↓
   Kubernetes Secret (mounted as env vars in pods)
```

ESO manifest: `deployment/kubernetes/03-external-secrets.yaml`.

---

## 8. High Availability + Disaster Recovery

| Concern                  | Strategy                                                         |
| ------------------------ | ---------------------------------------------------------------- |
| Backend availability     | 2–4 replicas across 2 AZs, HPA on CPU 70%                        |
| Database availability    | RDS Multi-AZ (synchronous standby in second AZ), automated failover |
| Redis availability       | ElastiCache cluster mode, 1 primary + 1 read replica             |
| Zone failure             | EKS spans 3 AZs; pods distributed via `topologySpreadConstraints` |
| Region failure           | Warm-standby in secondary region (manual cutover, RPO 1h, RTO 4h) |
| Database backup          | Automated daily snapshot + 5-min PITR (point-in-time recovery)   |
| Object storage backup    | S3 cross-region replication to ap-south-2                        |
| Configuration backup     | Terraform state in S3 + version control (Git)                    |
| Secret backup            | AWS Secrets Manager automatic rotation + KMS-encrypted at rest   |

**Recovery objectives:**

| Metric            | Target                  |
| ----------------- | ----------------------- |
| RPO (data loss)   | ≤ 5 minutes (PITR)      |
| RTO (downtime)    | ≤ 4 hours (region fail) |
| Backup retention  | 35 days (RDS)           |

See [`docs/infrastructure/15_DISASTER_RECOVERY.md`](./infrastructure/15_DISASTER_RECOVERY.md)
for the full DR runbook.

---

## 9. CI/CD Pipeline Stages

The full pipeline is in [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml).
Every push to `main` or `develop` triggers:

```
  Push / PR
     │
     ▼
  1. Quality (lint + typecheck)  ──┐
     │                              │
     ▼                              ▼
  2. Backend tests (unit+integ)  3. Frontend tests
     │                              │
     └──────────────┬───────────────┘
                    ▼
  4. Security scans (parallel):
       • gitleaks  (secret scan)
       • Semgrep   (SAST)
       • Snyk      (dependency scan)
       • Trivy     (filesystem scan)
       • Checkov   (IaC scan)
                    │
                    ▼
  5. Build + push Docker images to ECR
                    │
                    ▼
  6. Container scan (Trivy on built image)
                    │
                    ▼
  7. Deploy to staging (develop branch only)
                    │
                    ▼
  8. DAST (OWASP ZAP baseline) against staging
                    │
                    ▼
  9. Production deploy (main branch only, MANUAL APPROVAL via GitHub env gate)
                    │
                    ▼
 10. Health check (curl /health/ready)
                    │
              ┌─────┴─────┐
              ▼           ▼
        ✅ Verify    ❌ Rollback
                    (kubectl rollout undo)
```

Required GitHub **secrets**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SNYK_TOKEN`.
Required GitHub **variables**: `AWS_REGION`, `ECR_REGISTRY`.

---

## 10. Local Development Topology

For local dev the same services run on `localhost` via Docker Compose:

```
localhost
   ├── :3000  backend (NestJS)         ← API + Swagger + /health
   ├── :3001  voice-ai                 ← Vapi webhook receiver
   ├── :3002  whatsapp-ai              ← WhatsApp webhook receiver
   ├── :3003  admin-dashboard          ← Admin UI
   ├── :3004  website-chat             ← Chat widget
   ├── :3005  customer-portal          ← Customer UI
   ├── :3006  distributor-portal       ← Distributor UI
   ├── :3007  employee-portal          ← Employee UI
   ├── :5432  PostgreSQL (pgvector)
   ├── :6379  Redis
   ├── :5678  n8n (automation)
   ├── :9090  Prometheus
   ├── :3030  Grafana
   └── :3100  Loki
```

Single command: `docker compose up -d` (root `docker-compose.yml`).

---

## 11. Related Documentation

| Topic                   | Document                                                     |
| ----------------------- | ------------------------------------------------------------ |
| Complete setup guide    | [`SETUP_GUIDE.md`](./SETUP_GUIDE.md)                         |
| High-level architecture | [`architecture/01_HIGH_LEVEL_ARCHITECTURE.md`](./architecture/01_HIGH_LEVEL_ARCHITECTURE.md) |
| Infrastructure deep-dive| [`infrastructure/04_DEPLOYMENT_ARCHITECTURE.md`](./infrastructure/04_DEPLOYMENT_ARCHITECTURE.md) |
| CI/CD architecture      | [`infrastructure/06_CICD_ARCHITECTURE.md`](./infrastructure/06_CICD_ARCHITECTURE.md) |
| Network architecture    | [`infrastructure/03_NETWORK_ARCHITECTURE.md`](./infrastructure/03_NETWORK_ARCHITECTURE.md) |
| Secret management       | [`infrastructure/08_SECRET_MANAGEMENT.md`](./infrastructure/08_SECRET_MANAGEMENT.md) |
| Disaster recovery       | [`infrastructure/15_DISASTER_RECOVERY.md`](./infrastructure/15_DISASTER_RECOVERY.md) |
| Ops runbook             | [`operations/OPS_RUNBOOK.md`](./operations/OPS_RUNBOOK.md)  |
| Production readiness    | [`security/PRODUCTION_READINESS_CHECKLIST.md`](./security/PRODUCTION_READINESS_CHECKLIST.md) |

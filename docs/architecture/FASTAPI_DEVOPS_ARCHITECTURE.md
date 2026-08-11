# Enterprise DevOps & Infrastructure Guide — Stage 2 Step 8

> Production-grade CI/CD, containerization, Kubernetes, Terraform, and
> disaster recovery for the Dayjoy AI Platform.

## 1. Architecture

```
Developer → GitHub → GitHub Actions → Tests → Security Scan → Docker Build
    → ECR Push → K8s Deploy (Helm) → Ingress → Pods → Monitoring → Production
```

## 2. Containerization

### Backend Dockerfile
- Multi-stage build (builder + runtime)
- Non-root user (`appuser`)
- Health check (`/health/live`)
- Production uvicorn (4 workers, no access log)
- Image size: ~200MB (slim base)

### Frontend Dockerfile
- Multi-stage build (deps + builder + runtime)
- Standalone output (Next.js)
- Non-root user (`nextjs`)
- Health check (`/`)
- Image size: ~150MB (alpine base)

### Docker Compose (Production)
File: `docker-compose.prod.yml`

Services: PostgreSQL, Redis, Qdrant, Backend, Frontend, Prometheus, Grafana

```bash
# Start full production stack
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f backend

# Stop
docker compose -f docker-compose.prod.yml down
```

## 3. CI/CD Pipeline (GitHub Actions)

File: `.github/workflows/enterprise-cicd.yml`

### Pipeline stages
1. **Code Quality** — ruff lint + format (backend), ESLint + typecheck (frontend)
2. **Backend Tests** — pytest with PostgreSQL + Redis services
3. **Frontend Tests** — vitest with coverage
4. **Security Scanning** — pip-audit, npm audit, Trivy filesystem, Trufflehog secrets
5. **Docker Build + Push** — Multi-arch build, ECR push, Trivy image scan
6. **Deploy Staging** — Automatic on `develop` branch
7. **Deploy Production** — Manual approval required on `main` branch
8. **Post-Deployment Verification** — Smoke tests (health, API)

### Secrets required (GitHub → Settings → Secrets)
- `AWS_ACCESS_KEY_ID` — ECR + EKS access
- `AWS_SECRET_ACCESS_KEY` — ECR + EKS access
- `SLACK_WEBHOOK_URL` — Deployment notifications (optional)

### Environments (GitHub → Settings → Environments)
- `staging` — auto-approve
- `production` — required reviewers (manual approval)

## 4. Kubernetes

### Manifests (Kustomize)
- Base: `infra/k8s/base/manifests.yaml` — all resources (deployments, services, HPA, ingress, network policies, PVCs)
- Staging overlay: `infra/k8s/overlays/staging/` — 2 backend replicas, debug=true
- Production overlay: `infra/k8s/overlays/production/` — 4 backend replicas, Sentry enabled

### Deploy with Kustomize
```bash
# Staging
kubectl apply -k infra/k8s/overlays/staging/

# Production
kubectl apply -k infra/k8s/overlays/production/
```

### Helm Chart
Location: `infra/k8s/helm/dayjoyai/`

```bash
# Install
helm install dayjoyai infra/k8s/helm/dayjoyai/ -n dayjoyai --create-namespace

# Upgrade
helm upgrade dayjoyai infra/k8s/helm/dayjoyai/ -n dayjoyai

# Uninstall
helm uninstall dayjoyai -n dayjoyai
```

### Resources included
- Backend Deployment (3 replicas, HPA 3-10)
- Frontend Deployment (2 replicas, HPA 2-6)
- PostgreSQL StatefulSet (50Gi PVC)
- Redis Deployment (10Gi PVC)
- Qdrant Deployment (20Gi PVC)
- Ingress (TLS, rate limiting, Nginx)
- Network Policies (restrict pod-to-pod traffic)
- ConfigMaps + Secrets
- Readiness/Liveness/Startup probes

## 5. Terraform (Infrastructure as Code)

### Modules
- `modules/vpc` — VPC, public/private subnets, NAT gateway, IGW
- `modules/eks` — EKS cluster, node group, IAM roles
- `modules/rds` — PostgreSQL RDS (encrypted, backups, multi-AZ in prod)
- `modules/elasticache` — Redis (replication group in prod)
- `modules/s3` — S3 bucket for backups (versioned, encrypted, lifecycle)

### Environments
- `environments/staging/` — 2 EKS nodes, db.t3.medium, no multi-AZ
- `environments/production/` — 3-10 EKS nodes, db.r6g.large, multi-AZ

### Deploy infrastructure
```bash
cd infra/terraform/environments/staging
terraform init
terraform plan -var="db_password=YOUR_PASSWORD"
terraform apply -var="db_password=YOUR_PASSWORD"
```

## 6. Backup & Recovery

### PostgreSQL Backup
Script: `infra/backups/backup_postgres.sh`

```bash
# Manual backup
./infra/backups/backup_postgres.sh dayjoyai-backups

# Scheduled (cron / Kubernetes CronJob)
0 2 * * * /path/to/backup_postgres.sh dayjoyai-backups
```

Features:
- pg_dump with compression
- S3 upload (encrypted)
- Automatic cleanup (7-day retention)
- CronJob-ready

### PostgreSQL Restore
Script: `infra/backups/restore_postgres.sh`

```bash
./infra/backups/restore_postgres.sh /backups/dayjoyai_20240101_020000.sql.gz
```

### Qdrant Backup
```bash
# Qdrant snapshots are created via API:
curl -X POST http://qdrant:6333/collections/dayjoyai_shared/snapshots
```

## 7. Monitoring Stack

### Prometheus
- Config: `docker/prometheus/prometheus.yml`
- Scrapes: backend (/metrics), frontend, postgres, redis, qdrant
- Retention: 30 days
- Alert rules: `infra/monitoring/prometheus-rules.yaml`

### Grafana
- Auto-provisioned datasource (Prometheus)
- Auto-provisioned dashboards
- Admin: `admin` / `admin` (change in production)

## 8. Environments

| Environment | Branch | Replicas | DB | Auto-Deploy |
|---|---|---|---|---|
| Development | feature/* | 1 | SQLite/memory | N/A |
| Staging | develop | 2 | db.t3.medium | Yes |
| Production | main | 4 | db.r6g.large (multi-AZ) | Manual approval |

## 9. Rollback

### Kubernetes rollback
```bash
# Rollback backend to previous version
kubectl rollout undo deployment/backend -n production

# Rollback frontend
kubectl rollout undo deployment/frontend -n production

# Check rollout status
kubectl rollout status deployment/backend -n production
```

### Helm rollback
```bash
# List revisions
helm history dayjoyai -n dayjoyai

# Rollback to previous revision
helm rollback dayjoyai <REVISION> -n dayjoyai
```

### Database rollback (Alembic)
```bash
# Rollback one migration
alembic downgrade -1

# Rollback to specific revision
alembic downgrade <revision_id>
```

## 10. Security

- **Non-root containers**: Both Dockerfiles use non-root users
- **Image scanning**: Trivy scans filesystem + built images (CRITICAL/HIGH)
- **Dependency scanning**: pip-audit (Python) + npm audit (Node)
- **Secret scanning**: Trufflehog scans for committed secrets
- **Network policies**: Restrict pod-to-pod traffic (backend only talks to DB/Redis/Qdrant)
- **TLS**: Ingress configured with cert-manager (Let's Encrypt)
- **Rate limiting**: Nginx ingress rate limit (100 req/min)
- **RBAC**: Kubernetes RBAC for namespace isolation
- **Encrypted storage**: RDS + S3 + EBS encryption enabled
- **Secret management**: Kubernetes Secrets (use External Secrets Operator in production)

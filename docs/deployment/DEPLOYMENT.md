# DayJoy AI Platform — Deployment Guide

This guide covers deploying the platform in development and production.

---

## Quick Start (Development)

### Prerequisites

- **Docker** 24+ with Docker Compose v2
- **Python** 3.12+ (for local dev without Docker)
- **Node.js** 22+ with pnpm (for frontend dev)
- **PostgreSQL** 16+ (or use the Docker-managed one)

### Option 1: Docker Compose (Recommended — 1 command)

```bash
# 1. Clone / extract the project
cd DayJoy-AI-Voice-Assistant

# 2. (Optional) Create .env with your API keys
cp .env.example .env
# Edit .env and add at minimum:
#   OPENAI_API_KEY=sk-...        (for AI features)
#   SECRET_KEY=<random 32+ chars> (for production)

# 3. Start the full stack
docker compose up -d

# 4. Wait for services to be healthy (30-60s)
docker compose ps

# 5. Run database migrations (auto-run by backend on startup, but you can manually run)
docker compose exec backend alembic upgrade head

# 6. Access the app
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# API Docs:  http://localhost:8000/docs
# Health:    http://localhost:8000/health
# Qdrant:    http://localhost:6333/dashboard
```

### Option 2: Local Development

```bash
# Terminal 1 — Start infrastructure (Postgres + Redis + Qdrant)
docker compose up -d postgres redis qdrant

# Terminal 2 — Backend
cd apps/backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev,rag-prod]"
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql+asyncpg://dayjoy:dayjoy@localhost:5432/dayjoyai
#   SECRET_KEY=<random 32+ chars>
#   OPENAI_API_KEY=sk-...
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd apps/frontend
pnpm install
pnpm dev
```

---

## Production Deployment

### Prerequisites

- A server with:
  - 4+ CPU cores, 8+ GB RAM, 50+ GB disk
  - Docker 24+ with Compose v2
  - A registered domain name (for HTTPS)
  - SSL certificates (Let's Encrypt recommended)

### Step 1: Prepare the server

```bash
# Clone the project to /opt/dayjoyai
git clone <your-repo> /opt/dayjoyai
cd /opt/dayjoyai

# Or: scp the zip + extract
unzip DayJoy-AI-Voice-Assistant.zip
mv DayJoy-AI-Voice-Assistant /opt/dayjoyai
cd /opt/dayjoyai
```

### Step 2: Create the production .env

```bash
cp .env.example .env

# Generate a strong SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Edit .env with production values:
# - SECRET_KEY=<generated value>
# - POSTGRES_PASSWORD=<strong password>
# - OPENAI_API_KEY=sk-...
# - VOICE_PROVIDER=vapi (if using) + VAPI_API_KEY
# - TELEPHONY_PROVIDER=twilio (if using) + TWILIO creds
# - WHATSAPP_PROVIDER=meta_cloud (if using) + Meta creds
# - STRIPE_SECRET_KEY (if marketplace payments enabled)
# - ENABLE_SENTRY=true + SENTRY_DSN (recommended)
```

### Step 3: Start the production stack

```bash
# Build + start all services (Postgres, Redis, Qdrant, Backend, Frontend, Prometheus, Grafana)
docker compose -f docker-compose.prod.yml up -d --build

# Verify all services are healthy
docker compose -f docker-compose.prod.yml ps

# Tail logs to check for errors
docker compose -f docker-compose.prod.yml logs -f backend
```

### Step 4: Set up a reverse proxy (nginx + Let's Encrypt)

```bash
# Install nginx + certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Create nginx config
sudo tee /etc/nginx/sites-available/dayjoyai <<'EOF'
server {
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API + Swagger
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /docs {
        proxy_pass http://127.0.0.1:8000;
    }

    location /openapi.json {
        proxy_pass http://127.0.0.1:8000;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000;
    }

    # WebSocket support (for voice AI + real-time features)
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    client_max_body_size 50M;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}

EOF

sudo ln -s /etc/nginx/sites-available/dayjoyai /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

### Step 5: Verify deployment

```bash
# Health checks
curl https://your-domain.com/health         # → {"status": "healthy"}
curl https://your-domain.com/health/live    # → {"status": "alive"}
curl https://your-domain.com/health/ready   # → {"status": "ready", "checks": {...}}

# API check
curl https://your-domain.com/api/v1/health  # → 200 OK

# Frontend
open https://your-domain.com                # → Login page
```

---

## Configuration Reference

### Environment Variables (`.env`)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SECRET_KEY` | — | **Yes (prod)** | JWT signing + Fernet encryption key (≥ 32 chars) |
| `POSTGRES_USER` | `dayjoy` | No | PostgreSQL username |
| `POSTGRES_PASSWORD` | `dayjoy` | **Yes (prod)** | PostgreSQL password |
| `POSTGRES_DB` | `dayjoyai` | No | PostgreSQL database name |
| `OPENAI_API_KEY` | — | Recommended | For embeddings + GPT-4o |
| `ANTHROPIC_API_KEY` | — | Optional | For Claude in model router |
| `VOICE_PROVIDER` | `none` | No | `none` / `vapi` / `retell` / `bland` / `livekit` / `pipecat` |
| `VAPI_API_KEY` | — | If `VOICE_PROVIDER=vapi` | Vapi API key |
| `TELEPHONY_PROVIDER` | `none` | No | `none` / `twilio` / `plivo` / `exotel` / `knowlarity` |
| `TWILIO_ACCOUNT_SID` | — | If `TELEPHONY_PROVIDER=twilio` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | — | If `TELEPHONY_PROVIDER=twilio` | Twilio auth token |
| `WHATSAPP_PROVIDER` | `none` | No | `none` / `meta_cloud` / `twilio_whatsapp` |
| `WHATSAPP_ACCESS_TOKEN` | — | If `WHATSAPP_PROVIDER=meta_cloud` | Meta access token |
| `EMBEDDING_PROVIDER` | `fake` (dev) / `openai` (prod) | No | `fake` / `openai` / `bge_local` |
| `VECTOR_DB_PROVIDER` | `qdrant` | No | `qdrant` / `pgvector` / `memory` |
| `STRIPE_SECRET_KEY` | — | Optional | For marketplace payments (Phase 11) |
| `STRIPE_WEBHOOK_SECRET` | — | Optional | For Stripe webhook verification |
| `ENABLE_SENTRY` | `false` | No | Set to `true` for error tracking |
| `SENTRY_DSN` | — | If `ENABLE_SENTRY=true` | Sentry DSN |
| `GRAFANA_ADMIN_USER` | `admin` | No | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | `admin` | **Yes (prod)** | Grafana admin password |

### Production Validation

The backend enforces these rules when `ENVIRONMENT=production`:

1. `SECRET_KEY` must not be the default dev value
2. `DEBUG` must be `false`
3. `DATABASE_URL` must not reference `localhost`
4. `VECTOR_DB_PROVIDER` must be `qdrant` or `pgvector` (not `memory`)
5. `EMBEDDING_PROVIDER` must be `openai` or `bge_local` (not `fake`)
6. If `VOICE_PROVIDER=vapi`, then `VAPI_API_KEY` must be set
7. If `TELEPHONY_PROVIDER=twilio`, then `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` must be set
8. If `WHATSAPP_PROVIDER=meta_cloud`, then `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` must be set
9. If `ENABLE_SENTRY=true`, then `SENTRY_DSN` must be set

---

## Common Operations

### View logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Just backend
docker compose -f docker-compose.prod.yml logs -f backend

# Just frontend
docker compose -f docker-compose.prod.yml logs -f frontend
```

### Restart a service

```bash
docker compose -f docker-compose.prod.yml restart backend
```

### Run database migrations

```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### Create a database backup

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U dayjoy dayjoyai > backup_$(date +%Y%m%d).sql
```

### Restore from backup

```bash
cat backup_20260101.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U dayjoy dayjoyai
```

### Update to a new version

```bash
cd /opt/dayjoyai
git pull origin main  # or: unzip new-version.zip

# Rebuild + restart
docker compose -f docker-compose.prod.yml up -d --build

# Run any new migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### Scale the backend (horizontal)

```bash
docker compose -f docker-compose.prod.yml up -d --scale backend=3
```

---

## Monitoring

### Prometheus

- URL: `http://your-server:9090`
- Metrics endpoint: `http://backend:8000/metrics`
- Pre-configured scrape config in `monitoring/prometheus/prometheus.yml`

### Grafana

- URL: `http://your-server:3001`
- Default login: `admin` / `admin` (change in production!)
- Pre-provisioned datasource (Prometheus) + dashboard location

### Health checks

```bash
# Liveness (process alive?)
curl http://localhost:8000/health/live
# → {"status": "alive"}

# Readiness (DB + Redis + circuit breakers OK?)
curl http://localhost:8000/health/ready
# → {"status": "ready", "checks": {"database": "healthy", "redis": "healthy", ...}}

# Full health
curl http://localhost:8000/health
# → {"status": "healthy", "app": "Dayjoy AI Platform", ...}
```

---

## Troubleshooting

### Backend won't start: "SECRET_KEY must be set"

You're running in production mode without a SECRET_KEY. Either:
- Set `ENVIRONMENT=dev` in `.env` (for local testing), OR
- Generate a real SECRET_KEY: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

### Backend won't start: "EMBEDDING_PROVIDER must be 'openai' or 'bge_local' in production"

In production, you must use a real embedding provider. Either:
- Set `EMBEDDING_PROVIDER=openai` + `OPENAI_API_KEY=sk-...`, OR
- Set `EMBEDDING_PROVIDER=bge_local` (installs `sentence-transformers`), OR
- Switch to dev mode: `ENVIRONMENT=dev`

### Backend won't start: "VAPI_API_KEY must be set"

You have `VOICE_PROVIDER=vapi` but no key. Either:
- Set `VAPI_API_KEY=...`, OR
- Set `VOICE_PROVIDER=none` to disable voice features

### Frontend can't reach backend

1. Verify the backend is running: `curl http://localhost:8000/health`
2. Check `NEXT_PUBLIC_API_URL` in `.env` — should be `http://localhost:8000/api/v1` (dev) or `https://your-domain.com/api/v1` (prod)
3. Check CORS: `BACKEND_CORS_ORIGINS` in backend `.env` must include the frontend URL

### Database migration fails

```bash
# Check current migration state
docker compose exec backend alembic current

# Rollback last migration
docker compose exec backend alembic downgrade -1

# View migration history
docker compose exec backend alembic history
```

### Qdrant connection refused

Qdrant takes ~10 seconds to start. Wait for it to be healthy:

```bash
docker compose ps qdrant
# Wait until STATUS shows "healthy"
```

---

## Kubernetes Deployment

For K8s deployments, see:
- `infra/k8s/base/manifests.yaml` — base manifests
- `infra/k8s/overlays/staging/kustomization.yaml` — staging overlay
- `infra/k8s/overlays/production/kustomization.yaml` — production overlay
- `infra/k8s/helm/dayjoyai/` — Helm chart

```bash
# Deploy via Helm
helm install dayjoyai infra/k8s/helm/dayjoyai \
  -f infra/k8s/helm/dayjoyai/values.yaml \
  --namespace dayjoyai --create-namespace

# Or via Kustomize
kubectl apply -k infra/k8s/overlays/production
```

---

## Terraform Infrastructure

Provision cloud resources with Terraform:

```bash
cd infra/terraform/environments/production
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply
```

Modules included:
- `vpc` — VPC + subnets + NAT gateway
- `rds` — PostgreSQL with pgvector
- `elasticache` — Redis
- `eks` — EKS cluster for K8s
- `s3` — S3 buckets for uploads + backups

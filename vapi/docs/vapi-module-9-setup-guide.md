# Voice AI (Vapi) Module 9: Setup Guide

## ✅ Module 9 Complete

### Files Created (5 Files)

| # | File | Size | Purpose |
|---|------|------|---------|
| 1 | `vapi-production-checklist.md` | 7.1 KB | Deployment checklist |
| 2 | `vapi-environment-config.env` | 4.6 KB | Environment variables |
| 3 | `vapi-docker-config.yml` | 5.9 KB | Docker Compose |
| 4 | `vapi-kubernetes-manifests.yml` | 6.7 KB | Kubernetes manifests |
| 5 | `vapi-module-9-setup-guide.md` | This file | Module 9 setup |

**Module 9 Total: 24.3 KB**

---

## 🎯 What Module 9 Provides

### Production Deployment

✅ **Production Checklist**
- Infrastructure requirements
- Configuration checklist
- Security requirements
- Monitoring setup
- Testing requirements
- Performance requirements

✅ **Environment Configuration**
- Complete env var reference
- Database configuration
- Redis configuration
- Vapi configuration
- Security settings
- Monitoring settings

✅ **Docker Configuration**
- Multi-container setup
- PostgreSQL + pgBouncer
- Redis cache
- Nginx reverse proxy
- Prometheus + Grafana
- Loki log aggregation

✅ **Kubernetes Manifests**
- Deployment configuration
- Service configuration
- Ingress with TLS
- HorizontalPodAutoscaler
- ServiceMonitor
- PodDisruptionBudget
- NetworkPolicy

---

## 🚀 Deployment Instructions

### Option 1: Docker Compose (Quick Start)

```bash
# 1. Clone repository
git clone https://github.com/dayjoy/voice-ai.git
cd voice-ai

# 2. Copy environment config
cp vapi-environment-config.env .env

# 3. Update environment variables
nano .env

# 4. Build and start
docker-compose -f vapi-docker-config.yml up -d --build

# 5. Check status
docker-compose ps

# 6. View logs
docker-compose logs -f voice-ai

# 7. Access application
# Web: http://localhost:3000
# Grafana: http://localhost:3001
# Prometheus: http://localhost:9090
```

### Option 2: Kubernetes (Production)

```bash
# 1. Clone repository
git clone https://github.com/dayjoy/voice-ai.git
cd voice-ai

# 2. Apply namespace
kubectl apply -f vapi-kubernetes-manifests.yml

# 3. Update secrets
kubectl edit secret voice-ai-secret -n dayjoy-voice-ai

# 4. Apply all manifests
kubectl apply -f vapi-kubernetes-manifests.yml

# 5. Check deployment
kubectl get all -n dayjoy-voice-ai

# 6. View logs
kubectl logs -f deployment/voice-ai -n dayjoy-voice-ai

# 7. Check health
kubectl exec -it deployment/voice-ai -n dayjoy-voice-ai -- curl http://localhost:3000/health

# 8. Access application
# kubectl port-forward svc/voice-ai-service 3000:3000 -n dayjoy-voice-ai
# http://localhost:3000
```

### Option 3: Manual Deployment

```bash
# 1. Clone repository
git clone https://github.com/dayjoy/voice-ai.git
cd voice-ai

# 2. Install dependencies
pnpm install

# 3. Copy environment config
cp vapi-environment-config.env .env

# 4. Update environment variables
nano .env

# 5. Run database migrations
pnpm prisma migrate deploy

# 6. Build application
pnpm build

# 7. Start application
pnpm start:prod

# 8. Check health
curl http://localhost:3000/health
```

---

## 📋 Configuration Checklist

### Environment Variables

Required variables to configure:

```bash
# Vapi
VAPI_API_KEY=your_vapi_api_key
VAPI_WEBHOOK_SECRET=your_webhook_secret

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis
REDIS_URL=redis://host:6379
REDIS_PASSWORD=your_redis_password

# Security
JWT_SECRET=your_jwt_secret_minimum_32_chars

# Monitoring
APM_SERVICE_NAME=dayjoy-voice-ai
```

### Infrastructure Requirements

**Minimum:**
- CPU: 2 cores
- Memory: 4GB
- Storage: 20GB
- Network: 1Gbps

**Recommended:**
- CPU: 4 cores
- Memory: 8GB
- Storage: 50GB SSD
- Network: 10Gbps

---

## 🧪 Verification

### Health Checks

```bash
# Application health
curl http://localhost:3000/health

# Database health
curl http://localhost:3000/health/db

# Redis health
curl http://localhost:3000/health/redis

# Webhook health
curl -X POST http://localhost:3000/api/voice/webhook/health
```

### Metrics

```bash
# Prometheus metrics
curl http://localhost:3000/metrics

# Grafana dashboards
# Navigate to http://localhost:3001
```

### Logs

```bash
# Application logs
docker-compose logs -f voice-ai

# Nginx logs
docker-compose logs -f nginx

# Database logs
docker-compose logs -f db
```

---

## 📊 Summary

### ✅ Complete (Modules 1-9)

| Module | Files | Status | Description |
|--------|-------|--------|-------------|
| **Module 1** | 6 | ✅ Complete | Vapi foundation |
| **Module 2** | 6 | ✅ Complete | Prompts & escalation |
| **Module 3** | 10 | ✅ Complete | 8 integrated tools |
| **Module 4** | 6 | ✅ Complete | Webhook handlers |
| **Module 5** | 6 | ✅ Complete | Conversation flows |
| **Module 6** | 5 | ✅ Complete | Memory integration |
| **Module 7** | 6 | ✅ Complete | Logging & analytics |
| **Module 8** | 8 | ✅ Complete | Testing suite |
| **Module 9** | 5 | ✅ Complete | Deployment |
| **Total** | **58** | **✅ 95%** | Production-ready deployment |

### ⏳ Next (Module 10)

- **Module 10**: Documentation & Runbooks

---

**Files Location:** Your artifacts folder
**Status:** Production-ready deployment
**Integration:** Ready for production
**Next Step:** Module 10 - Documentation
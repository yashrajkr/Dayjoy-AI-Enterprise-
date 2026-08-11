# Dayjoy AI Platform - Monorepo Structure

## Overview

This is a monorepo containing all Dayjoy AI Enterprise Platform components:
- 7 Frontend Applications
- 5 Backend Services
- 5 Shared Libraries
- 3 AI Agent Categories
- RAG Knowledge Base
- Database Layer
- Infrastructure
- Automation
- Tests
- Documentation

## Directory Structure

```
dayjoy-ai-platform/
├── apps/                    # 7 frontend applications
│   ├── voice-ai/           # Voice AI (Vapi integration)
│   ├── whatsapp-ai/        # WhatsApp Business AI
│   ├── website-ai/         # Website chat widget
│   ├── admin-dashboard/    # Admin dashboard
│   ├── customer-portal/    # Customer self-service
│   ├── distributor-portal/ # Distributor management
│   └── employee-portal/    # Employee workspace
│
├── services/                # 5 backend services
│   ├── api-gateway/        # NestJS API gateway (main backend)
│   ├── rag-service/        # RAG processing service
│   ├── agent-orchestrator/ # AI agent orchestration
│   ├── integration-service/# CRM/ERP integrations
│   └── notification-service/# Email, SMS, WhatsApp, Push
│
├── packages/                # 5 shared libraries
│   ├── ui/                 # Shared UI components
│   ├── utils/              # Utility functions
│   ├── config/             # Shared configuration
│   ├── types/              # TypeScript types
│   └── sdk/                # Dayjoy SDK
│
├── agents/                  # 3 AI agent categories
│   ├── business-assistants/
│   ├── support-agents/
│   └── automation-agents/
│
├── knowledge/               # RAG knowledge base
│   ├── sources/            # Raw documents (Product PDFs, Policies, FAQs, etc.)
│   ├── processed/          # Processed chunks and embeddings
│   └── validation/         # Quality and compliance validation
│
├── database/                # Database layer
│   ├── migrations/         # Database migrations (core, business, ai, channels, etc.)
│   ├── models/             # Data models (Prisma schema)
│   └── seeds/              # Seed data
│
├── infrastructure/          # Infrastructure as code
│   ├── terraform/          # Terraform configurations
│   ├── kubernetes/         # K8s manifests
│   └── docker/             # Dockerfiles
│
├── automation/              # Business automation
│   ├── business-workflows/
│   ├── ai-workflows/
│   └── integration-flows/
│
├── tests/                   # Test suites
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── performance/
│
├── scripts/                 # Development scripts
├── tools/                   # Development tools
├── docs/                    # Documentation
│   ├── architecture/
│   ├── getting-started/
│   ├── standards/
│   └── runbooks/
│
└── .github/                 # GitHub configurations
```

## Current Status

### ✅ Complete (Production-Ready)

- **Backend API** (`services/api-gateway/`) - 17 NestJS modules
- **RAG Service** (`services/rag-service/`) - 34 files for complete RAG pipeline
- **Database Schema** (`database/migrations/`) - 20+ tables with pgvector support
- **Knowledge Sources** (`knowledge/sources/`) - 9 document types supported
- **Documentation** (`docs/`) - Complete README and RAG docs

### ⏳ Next Phase

- Frontend applications (7 apps)
- Agent orchestration service
- Integration service
- CI/CD pipelines
- Docker/Kubernetes deployment

## Getting Started

```bash
# Clone repository
git clone https://github.com/yashrajkr/dayjoy-ai-platform.git
cd dayjoy-ai-platform

# Install dependencies
pnpm install

# Setup database
pnpm db:migrate
pnpm db:seed

# Start services
pnpm dev
```

## Knowledge Sources Supported

| Source | Formats | Location |
|--------|---------|----------|
| Product PDFs | PDF | `knowledge/sources/product-pdfs/` |
| Policies | PDF, DOCX | `knowledge/sources/policies/` |
| FAQs | CSV, PDF, DOCX | `knowledge/sources/faqs/` |
| Compensation Plan | PDF, DOCX | `knowledge/sources/compensation-plan/` |
| Training Material | PDF, PPTX, DOCX | `knowledge/sources/training-material/` |
| Marketing Documents | PDF, DOCX, HTML | `knowledge/sources/marketing-docs/` |
| SOPs | PDF, DOCX | `knowledge/sources/sops/` |
| Company Documents | PDF, DOCX, TXT | `knowledge/sources/company-docs/` |
| Website Content | HTML, MD | `knowledge/sources/website-content/` |

## RAG Pipeline

```
knowledge/sources/ → Ingestion → Chunks → Embeddings → Vector Store (pgvector) → Retrieval → LLM → Response
```

## Backend Services

### 1. API Gateway (`services/api-gateway/`)

Main NestJS backend with 17 modules:
- Config, Database (Prisma), Auth, Users, Customers, Distributors
- Products, Orders, Employees, Notifications
- AI, Knowledge (RAG), Analytics, Admin, RBAC, Security

### 2. RAG Service (`services/rag-service/`)

Complete RAG pipeline (34 files):
- Chunking, Embeddings, Vector Store, Retrieval
- Prompt Assembly, LLM Gateway, Response Processing

### 3. Notification Service (`services/notification-service/`)

Multi-channel notifications:
- Email, SMS, WhatsApp, In-App, Push

## Database Schema

### Core Tables
- `tenants`, `users`, `auth`, `rbac`

### Business Tables
- `crm`, `products`, `orders`, `leads`

### AI Tables
- `conversations`, `agents`, `memory`, `rag`

### Channels Tables
- `voice`, `whatsapp`, `web`, `notifications`

### Portals Tables
- `customer`, `distributor`, `employee`

### Analytics Tables
- `metrics`, `events`, `reports`

### Automation Tables
- `workflows`, `executions`, `triggers`

### Audit Tables
- `logs`, `compliance`

## Technology Stack

- **Backend**: NestJS, TypeScript, Prisma
- **Database**: PostgreSQL 14+, pgvector
- **AI/ML**: OpenAI, Anthropic, Google, Azure
- **Frontend**: React, Next.js, TypeScript
- **Infrastructure**: Docker, Kubernetes, Terraform
- **Monitoring**: Prometheus, Grafana

## License

Proprietary - Dayjoy AI Platform

---

**Status**: Backend + RAG complete, ready for frontend development

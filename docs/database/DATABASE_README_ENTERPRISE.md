# Database Schema

PostgreSQL database with pgvector extension for Dayjoy AI Enterprise Platform.

## Tables Organization

### Core Tables
- `core.tenants` - Multi-tenancy
- `core.users` - User management
- `core.auth` - Authentication
- `core.rbac` - Roles and permissions

### Business Tables
- `business.crm` - Customers, leads
- `business.products` - Product catalog
- `business.orders` - Order management
- `business.leads` - Lead management

### AI Tables
- `ai.conversations` - AI conversations
- `ai.agents` - AI agents
- `ai.memory` - AI memory
- `ai.rag_sources` - RAG knowledge sources
- `ai.rag_documents` - Processed documents
- `ai.rag_chunks` - Document chunks with embeddings
- `ai.rag_embeddings` - Vector embeddings
- `ai.rag_queries` - Query history

### Channels Tables
- `channels.voice_sessions` - Voice AI
- `channels.whatsapp_messages` - WhatsApp AI
- `channels.web_sessions` - Website chat
- `channels.notifications` - Notifications

### Portals Tables
- `portals.customer` - Customer portal
- `portals.distributor` - Distributor portal
- `portals.employee` - Employee portal

### Analytics Tables
- `analytics.metrics` - Business metrics
- `analytics.events` - Event tracking
- `analytics.reports` - Reports

### Automation Tables
- `automation.workflows` - Workflows
- `automation.executions` - Executions
- `automation.triggers` - Triggers

### Audit Tables
- `audit.logs` - Audit logs
- `audit.compliance` - Compliance records

## Setup

```bash
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma db seed
```

## Vector Support

- pgvector extension
- HNSW index for 1536-dim embeddings
- Cosine similarity search

## Status

✅ Production-ready (20+ tables)

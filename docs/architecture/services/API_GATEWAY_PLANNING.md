# API Gateway Service - NestJS Backend

Main NestJS backend with 17 modules for Dayjoy AI Enterprise Platform.

## Modules

- Config
- Database (Prisma)
- Auth
- Users
- Customers
- Distributors
- Products
- Orders
- Employees
- Notifications
- AI
- Knowledge (RAG)
- Analytics
- Admin
- RBAC Guards
- Security

## Setup

```bash
cd services/api-gateway
pnpm install
pnpm dev
```

## API

Base URL: `http://localhost:3000`

### Endpoints

- `/api/auth` - Authentication
- `/api/ai` - AI agents and conversations
- `/api/knowledge` - RAG knowledge base
- `/api/analytics` - Metrics and analytics
- `/api/admin` - Admin operations

## Status

✅ Production-ready

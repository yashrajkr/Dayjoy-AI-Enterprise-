# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Unified Prisma schema (63 models, 28 enums) consolidating 5 source schemas.
- All 63 Vapi Voice AI files organized into 10 modules under `/vapi/`.
- RAG pipeline with chunking, embeddings, vector-store, retriever, prompts, evaluation.
- 189 architecture / research / implementation markdown docs organized into 9 topic folders under `/docs/`.
- Backend modules: auth, users, customers, distributors, products, orders, ai, rag, analytics, notifications, admin, employees.
- Express reference backend under `/backend/_express-reference/`.
- Deployment configs (Docker, Kubernetes, Terraform).
- Monitoring configs (Prometheus, Grafana, Loki).
- CI/CD workflow (GitHub Actions).
- Production Readiness Roadmap document.

### Known Issues
- NestJS backend services use snake_case Prisma field accessors (must be migrated to camelCase).
- `prisma/schema.prisma` references 4 models not yet declared (`Distributor`, `Interaction`, `FollowUp`, `AiMemory`) — these are now declared in the unified schema but the original NestJS scaffold's `schema.prisma` (kept under `schema-reference-nestjs.prisma`) does not include them.
- Voice/telephony provider stubs (Retell, Bland, LiveKit, Pipecat, Plivo, Exotel, Knowlarity) raise `NotImplementedError`. Delete before production unless you have a contract with each provider.
- Vapi tools (Module 3) currently return mock data. Wire to real Prisma + RAG before production.
- Vapi memory (Module 6) uses in-process `Map`s. Migrate to Redis for multi-replica deployments.
- OAuth2 state in `oauth_service.py` is in-memory — must move to Redis for multi-replica.

## [1.0.0] — 2026-08-07
- Initial consolidated repository built from 6 source ZIPs.

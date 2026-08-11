# Changelog

All notable changes to the Dayjoy AI Platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Stage 2 (Enterprise AI Platform)

#### Step 1: Multi-LLM Provider Gateway
- Unified LLM abstraction (OpenAI, Anthropic, Groq, Gemini)
- Provider switching via configuration
- Retry with exponential backoff
- Streaming support
- JSON mode + tool calling
- Usage tracking + cost reporting
- 27 tests

#### Step 2: Enterprise RAG & Knowledge Management
- Multi-tenant knowledge base with Qdrant vector database
- 9 document format processors (PDF, DOCX, TXT, MD, CSV, JSON, HTML, Web, FAQ)
- 3 embedding providers (OpenAI, BGE local, fake for tests)
- Hybrid retrieval (70% semantic + 30% keyword)
- Confidence scoring + hallucination prevention
- Document versioning
- 55 tests

#### Step 3: Enterprise Voice AI Platform
- 5 voice providers (Vapi fully implemented; Retell, Bland, LiveKit, Pipecat stubs)
- WebSocket real-time streaming
- Barge-in handling
- Webhook signature verification (HMAC-SHA256)
- Escalation policy
- 51 tests

#### Step 4: Enterprise Telephony Integration
- Twilio fully implemented (calls, recordings, TwiML, HMAC-SHA1 webhooks)
- Rule-based call routing
- Business hours + holiday schedules
- Call recording with access control
- 51 tests

#### Step 5: Enterprise WhatsApp AI Platform
- Meta Cloud API fully implemented
- HMAC-SHA256 webhook verification
- 24-hour conversation sessions
- All message types supported
- Human handoff with auto-escalation
- 35 tests

#### Step 6: Enterprise Notification Platform
- Email (Resend, SendGrid), SMS (Twilio), Push (FCM), In-App
- Jinja2 template engine with per-tenant branding
- Per-user preferences (opt-in/opt-out, quiet hours)
- Bulk notifications
- Retry with exponential backoff
- 38 tests

#### Step 7: Enterprise Observability Platform
- Prometheus metrics
- OpenTelemetry distributed tracing
- Sentry error tracking with PII filtering
- Alert engine with severity levels
- Error grouping (fingerprint deduplication)
- 19 tests

#### Step 8: Enterprise CI/CD & DevOps
- 8-stage GitHub Actions pipeline
- Multi-stage Docker builds (non-root, health checks)
- Kubernetes manifests with HPA + network policies
- Helm charts
- Terraform IaC (VPC, EKS, RDS, ElastiCache, S3)
- Backup + restore scripts

#### Step 9: Production Readiness & Security Hardening
- CSRF protection middleware
- Redis caching layer
- 25 E2E tests (full user journeys + failure recovery)
- Multi-tenant isolation verified across all modules
- Load testing scripts
- Production readiness report
- Operations runbook

#### Step 10: Commercial SaaS Platform
- Company registration (auto-provisioning)
- 5 subscription plans (Free, Starter, Professional, Business, Enterprise)
- Billing architecture (Stripe/Razorpay-ready)
- Usage metering with limit enforcement
- 10-step guided onboarding wizard
- Support tickets + feature requests + system status
- Admin dashboard
- 25 tests

### Repository Audit
- Removed 5 duplicate files
- Removed 8 empty directories
- Moved 20+ files to proper locations
- Organized documentation into 7 subdirectories
- Consolidated CI/CD into single enterprise workflow
- Created documentation index
- Total: 399 tests passing

### Statistics
- **Source files**: 250+
- **Database tables**: 90+
- **API endpoints**: 400+
- **Tests**: 399 (all passing)
- **Documentation**: 24 organized docs
- **Migrations**: 14 (all reversible)

## [0.1.0] - 2026-07-15

### Added — Phase 1-8 (Initial Platform)
- Monorepo structure (FastAPI + Next.js + PostgreSQL + Redis)
- Authentication (JWT, RBAC, 10 roles, 33 permissions)
- Business modules (customers, products, tickets, knowledge articles)
- AI platform (gateway, orchestrator, memory, tools, RAG stub)
- Omnichannel (voice, WhatsApp, email, chat)
- Workflow automation
- Analytics & BI
- Production hardening (rate limiting, circuit breakers, graceful shutdown)

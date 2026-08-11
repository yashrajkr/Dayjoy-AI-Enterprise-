# Dayjoy AI Enterprise Platform — Project Plan

> **Status:** VERIFIED / PARTIALLY VERIFIED / REQUIRES CLIENT INPUT
> **Last updated:** 2026-08-04
> **Purpose:** Consolidated Phase 1 project plan tying together Vision, Objectives, Scope, Roadmap, Architecture, and Requirements.
> **Audience:** Executives, project managers, architects, developers, AI engineers, future AI coding assistants.
> **Synthesizes:** `docs/research/00_MASTER_CONTEXT.md`, `docs/research/01_PROJECT_BRIEF.md`, `docs/research/02_BUSINESS_CONTEXT.md`, `docs/research/03_PRODUCT_CONTEXT.md`, `docs/research/04_AI_VISION.md`, `docs/research/05_PERSONAS.md`, `docs/research/06_FEATURE_WISHLIST.md`, `docs/research/07_BUSINESS_PROCESSES.md`, `docs/research/08_CONSTRAINTS.md`, `docs/research/09_TECH_STACK.md`, `docs/research/15_SUCCESS_METRICS.md`, `docs/architecture/00_SYSTEM_OVERVIEW.md`, `docs/architecture/01_HIGH_LEVEL_ARCHITECTURE.md`.

---

## 1. Vision

The Dayjoy AI Enterprise Platform is being built as a **unified, AI-first, multi-channel enterprise system** that supports Dayjoy's customers, distributors, employees, and management across support, sales, training, operations, and knowledge management. Dayjoy Marketing Private Limited is a wellness direct selling company headquartered in Kota, Rajasthan, incorporated on 17 September 2018, with a distributor-led business model spanning health, beauty, nutrition, home, and lifestyle product categories.

The platform vision is to evolve Dayjoy into an **AI-enabled enterprise** where every stakeholder receives accurate, fast, compliant, and context-aware support across every channel — voice (Vapi), WhatsApp, web chat, customer portal, distributor portal, employee portal, and the admin dashboard. Rather than building a single chatbot, the platform is an **AI-enabled enterprise operating layer** that wraps verified company knowledge, policies, workflows, and compensation rules with retrieval-augmented generation (RAG), tool-calling agents, and workflow automation.

The long-term transformation goal is to move from AI-assisted support today → intelligent automation → AI-driven business workflows → multi-agent collaboration → governed autonomy for safe workflows. This plan defines the scope, objectives, roadmap, architecture summary, and functional/non-functional requirements that govern Phase 1 delivery and lay the foundation for Phases 2–4.

---

## 2. Objectives

### 2.1 Business Objectives

- **Unify all AI interactions** across Dayjoy into one intelligent, governed platform.
- Serve **customers, distributors, employees, and admins** through voice, WhatsApp, web chat, and self-service portals.
- **Reduce customer support response time by 80%** via AI-assisted resolution and self-service.
- **Increase lead conversion by 40%** via AI-assisted capture, qualification, and follow-up.
- Provide **24/7 availability** across voice, WhatsApp, and web chat.
- **Reduce cost-to-serve** through call deflection, ticket automation, and self-service RAG.
- **Improve distributor productivity** through AI-assisted onboarding, product training, and compensation coaching.

### 2.2 Technical Objectives

- Build a **production-ready, scalable, multi-tenant** platform with role-based access control (RBAC).
- Achieve **99.9% uptime** SLO.
- **Sub-3-second response time** for AI queries (RAG → LLM → response).
- **80%+ AI accuracy** on knowledge base questions (RAG grounded responses).
- **Full audit trail** for every AI interaction, tool call, and admin action.
- **Multi-tenant data isolation** via Row-Level Security (RLS) on PostgreSQL.
- **RAG-grounded responses only** — no hallucinated business facts (every claim traceable to a source).

### 2.3 Success Metrics

| Dimension | Metric | Target |
|---|---|---|
| Customer satisfaction | CSAT score | > 4.5 / 5 |
| AI quality | AI accuracy on KB questions | > 80% |
| Voice AI | Call success rate | > 90% |
| Sales | Lead capture rate of qualified calls | > 60% |
| Support | Mean time to resolution (MTTR) | < 5 minutes |
| Cost | Deflection rate (calls/tickets avoided) | > 40% |
| Distributor growth | Distributor activation rate (post-onboarding) | > 70% |
| Platform | Uptime SLO | 99.9% |
| Platform | AI response latency (P95) | < 3 seconds |
| Platform | API latency (P95, CRUD) | < 500 ms |

---

## 3. Scope

### 3.1 In Scope (Phase 1)

- **Voice AI (Vapi)** — inbound and outbound calls with 8 tools (search knowledge, search products, customer lookup, distributor lookup, lead capture, appointment booking, support ticket, human transfer).
- **WhatsApp AI** — customer and distributor messaging via Meta Cloud API.
- **Website AI Chat** — real-time web chat widget.
- **Customer Portal** — self-service for orders, support tickets, FAQs.
- **Distributor Portal** — distributor management, downline, commissions, training.
- **Employee Portal** — internal tools for support staff and ops.
- **Admin Dashboard** — platform administration, analytics, content management.
- **RAG Knowledge Base** — unified knowledge across all channels (10 categories: company, products, policies, compensation, FAQs, support, marketing, compliance, training, SOPs).
- **Multi-tenant architecture** — tenant isolation at the database layer (RLS).
- **Audit logging + observability** — Prometheus, Grafana, Loki.
- **CI/CD** — GitHub Actions, Docker, Kubernetes.

### 3.2 Out of Scope (Phase 1)

- **Mobile apps (iOS/Android)** — deferred to Phase 2.
- **Multi-language support** beyond English and Hindi — deferred to Phase 2.
- **Advanced analytics with ML predictions** — deferred to Phase 3.
- **Marketplace for third-party plugins** — deferred to Phase 3.
- **White-label support** — deferred to Phase 4.
- **Voice biometrics** — future scope.
- **AI vision** — future scope.

### 3.3 Future Scope

- Advanced forecasting (revenue, churn, distributor attrition).
- Autonomous workflow orchestration (n8n-style governed automation).
- Multilingual AI (regional Indian languages).
- Mobile apps with push notifications.
- Third-party integrations (n8n, Zapier, marketplace).
- White-label support for partner brands.

---

## 4. Roadmap

### Phase 1 — Foundation (Q1 2026) ✅ COMPLETE

- Repository structure (pnpm monorepo with `apps/`, `packages/`, `rag/`, `vapi/`, `database/`, `deployment/`, `monitoring/`).
- Database design + implementation (PostgreSQL 15 + pgvector, Prisma 6, 12 migrations, RLS, vector indexes).
- Backend foundation (NestJS 10, TypeScript 5, auth + RBAC, CRUD modules, AI module, knowledge module, analytics, admin, infrastructure).
- RAG system (loaders, chunking, embeddings, vector store, retrieval pipeline, response pipeline, context builder, security, memory, evaluation, prompts).
- Voice AI (Vapi) — assistants, 8 tools, 7 conversation flows, webhooks, memory, analytics, config, deployment, docs, tests.
- Admin dashboard (Next.js app with 30+ pages, shadcn/ui, telephony, WhatsApp, voice, knowledge, agents, AI console, plugins).
- Knowledge base (10 categories — 6 pre-existing + 4 added in this phase).
- Monitoring (Prometheus, Grafana dashboards, Loki, alert rules).
- Deployment (Terraform AWS modules, Kubernetes manifests, Helm chart, Docker Compose).

### Phase 2 — Channels (Q2 2026)

- WhatsApp AI integration (Meta Cloud API, templates, handoffs, conversations).
- Website chat widget (embedded widget with conversation persistence).
- Customer / Distributor / Employee portals (Next.js apps, separate from admin dashboard).
- Mobile-responsive admin dashboard (current dashboard is desktop-first).
- Multi-language support (Hindi + English at launch, regional languages added iteratively).
- Distributor mobile app (React Native or PWA — TBD).

### Phase 3 — Intelligence (Q3 2026)

- Advanced analytics (predictive lead scoring, churn prediction, distributor attrition forecasting).
- Conversation summarization (auto-summary of every call/chat for CRM).
- Auto-resolution workflows (low-risk tickets auto-resolved by AI with human review).
- Multi-agent orchestration (multiple agents collaborate on complex queries).
- Marketplace beta (third-party plugins, n8n-style workflow marketplace).
- AI-driven content generation (compliant marketing content, distributor training material).

### Phase 4 — Scale (Q4 2026)

- Multi-region deployment (active-active across AWS regions in India).
- Mobile apps (iOS + Android native).
- Third-party integrations (n8n, Zapier, CRM connectors, ERP connectors).
- Marketplace general availability.
- White-label support (resell platform to partner brands).
- Voice biometrics (caller identification).
- AI vision (product image recognition, document scanning).

---

## 5. Architecture

### 5.1 Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui | Admin dashboard + future portals |
| Backend | NestJS 10, TypeScript 5, Prisma 6 | API-first, modular monolith |
| Database | PostgreSQL 15 + pgvector | Primary datastore + vector store |
| Cache | Redis 7 | Session, rate limit, queue |
| Voice AI | Vapi SDK | Inbound/outbound calls, 8 tools |
| WhatsApp | Meta Cloud API | Customer + distributor messaging |
| Telephony | Twilio | Voice + SMS fallback |
| RAG | OpenAI embeddings + pgvector + Qdrant | Hybrid retrieval |
| LLM | OpenAI GPT-4o | Primary LLM; Claude Sonnet fallback |
| Auth | JWT + refresh tokens + RBAC | Role-based access control |
| Observability | Prometheus + Grafana + Loki + AlertManager | Metrics, dashboards, logs, alerts |
| CI/CD | GitHub Actions | Build, test, deploy |
| Infra | Docker, Kubernetes, Terraform (AWS) | Containerized, IaC |

### 5.2 High-Level Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                              CHANNELS                                   │
│  Voice AI   WhatsApp AI   Website Chat   Customer Portal   Distributor │
│  (Vapi)     (Meta API)    (Widget)       (Next.js)          Portal     │
└──────┬──────────┬─────────────┬──────────────┬─────────────────┬──────┘
       │          │             │              │                 │
       └──────────┴─────────────┴──────────────┴─────────────────┘
                                   │
                            ┌──────▼──────┐
                            │ API Gateway │  (NestJS, JWT auth, RBAC, rate-limit)
                            └──────┬──────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │                           │                           │
┌──────▼──────┐            ┌───────▼────────┐         ┌───────▼────────┐
│ AI Layer    │            │ Business Logic │         │ Integrations   │
│ (RAG, LLM,  │            │ (CRUD modules: │         │ (Vapi, Meta,   │
│  Tools,     │            │  Users, Custy, │         │  Twilio, Email,│
│  Memory,    │            │  Distrib, Prod,│         │  SMS, Push)    │
│  Workflows) │            │  Orders, etc.) │         │                │
└──────┬──────┘            └───────┬────────┘         └───────┬────────┘
       │                           │                          │
       └───────────┬───────────────┴──────────────────────────┘
                   │
            ┌──────▼──────┐     ┌──────────────┐
            │ PostgreSQL  │◄───►│    Redis     │
            │ + pgvector  │     │ (cache/queue)│
            └──────┬──────┘     └──────────────┘
                   │
            ┌──────▼──────┐
            │ Object Store│  (S3 — recordings, documents, exports)
            └─────────────┘

Observability:  Prometheus → Grafana + AlertManager  |  Loki ← Promtail
Compliance:     Audit Log → immutable store  |  KMS-managed encryption keys
CI/CD:          GitHub Actions → ECR → EKS (Helm)
Infra:          Terraform (VPC, RDS, ElastiCache, EKS, S3, KMS, WAF, Route53)
```

### 5.3 Architecture Principles

1. **Modularity over monoliths** — each AI capability separable by function, channel, and permission.
2. **API-first** — every feature exposed via versioned REST API before any UI.
3. **Security by default** — RBAC, RLS, JWT, KMS encryption, full audit trail.
4. **RAG-first AI** — no LLM output without retrieval grounding (when business facts are involved).
5. **Documentation-first development** — architecture before code, decisions in ADRs.
6. **Simplicity over cleverness** — prefer maintainable, testable, boring solutions.
7. **Reusability** — shared packages (`packages/shared`, `packages/types`, `packages/ui`) prevent duplication.
8. **Multi-tenancy from day one** — tenant_id on every table, RLS on every query.
9. **Observability built-in** — every service emits Prometheus metrics + structured logs.
10. **Graceful degradation** — AI features fail open to human escalation, never silent failures.

---

## 6. Requirements

### 6.1 Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | User authentication with JWT access tokens + refresh tokens + RBAC roles (admin, employee, distributor, customer). |
| FR-2 | Multi-tenant data isolation via PostgreSQL Row-Level Security (RLS) policies on every tenant-scoped table. |
| FR-3 | CRUD operations for users, customers, distributors, products, orders, support tickets, knowledge documents, conversations. |
| FR-4 | AI conversations with persistent context + memory (per-customer profile, per-session memory, long-term memory). |
| FR-5 | RAG-based knowledge search across 10 knowledge categories with hybrid (vector + keyword) retrieval. |
| FR-6 | Voice AI (Vapi) with 8 tools: search knowledge, search products, customer lookup, distributor lookup, lead capture, appointment booking, support ticket creation, human transfer. |
| FR-7 | WhatsApp messaging via Meta Cloud API with template management, conversation state, human handoff. |
| FR-8 | Analytics dashboard with KPIs: call volume, AI accuracy, lead capture, CSAT, distributor growth. |
| FR-9 | Audit logging of every admin action, AI interaction, tool call, and data access. |
| FR-10 | Notification system (email, SMS, WhatsApp, push) with template management and delivery tracking. |
| FR-11 | Knowledge base ingestion pipeline (loaders for .md, .pdf, .docx, .csv, .json, .html → chunk → embed → store). |
| FR-12 | Conversation flow manager for voice (7 flows: lead collection, product inquiry, customer support, distributor support, business plan, appointment booking, human escalation). |
| FR-13 | Human escalation protocol (AI → human agent with full context, transcripts, customer profile). |
| FR-14 | Tenant management (create, configure, suspend tenants; per-tenant knowledge base isolation). |
| FR-15 | Role management (create roles, assign permissions, role inheritance). |

### 6.2 Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Uptime:** 99.9% availability SLO (≤ 8.76 hours downtime per year). |
| NFR-2 | **AI response latency:** < 3 seconds P95 for RAG-grounded responses. |
| NFR-3 | **API latency:** < 500 ms P95 for CRUD operations; < 200 ms P95 for cached reads. |
| NFR-4 | **Concurrency:** Support 1,000 concurrent users (portals + dashboard). |
| NFR-5 | **Voice concurrency:** Support 100 concurrent voice calls (Vapi). |
| NFR-6 | **Encryption:** All data encrypted at rest (AWS KMS) and in transit (TLS 1.3). |
| NFR-7 | **Compliance:** GDPR and DPDP (Digital Personal Data Protection Act 2023) compliant. |
| NFR-8 | **Audit:** Full audit trail retained for 7 years (per Indian regulatory requirements). |
| NFR-9 | **Scalability:** Horizontal scaling via Kubernetes HPA; vertical up to 8 vCPU / 16 GB per pod. |
| NFR-10 | **Recoverability:** RPO ≤ 15 minutes (point-in-time recovery); RTO ≤ 4 hours. |
| NFR-11 | **Testability:** Unit test coverage ≥ 70% for backend, ≥ 60% for frontend. |
| NFR-12 | **Accessibility:** WCAG 2.1 AA compliance for all portals and dashboard. |

### 6.3 Constraints

- **Must use existing Dayjoy brand guidelines** — logo, color palette, typography (see `packages/knowledge-base/marketing/brand-guidelines.md`).
- **Must support Indian phone numbers (+91)** — Vapi phone numbers, Twilio fallback, WhatsApp India.
- **Must handle Hindi + English** — bilingual system prompts, future multilingual expansion.
- **Must integrate with existing CRM** (if any) — TBD per client input; CRM not yet identified.
- **Budget:** [PLACEHOLDER — pending client confirmation]
- **Timeline:** Q1 2026 for Phase 1 delivery; Phases 2–4 sequenced quarterly through Q4 2026.
- **Regulatory constraints:**
  - Direct Selling Guidelines issued by Government of India (9 September 2016).
  - Information Technology Act, 2000 + IT (Intermediaries Guidelines) Rules, 2011.
  - Digital Personal Data Protection Act, 2023 (DPDP).
  - GST regulations (GSTIN 08AAGCD8452J1ZA — Dayjoy Marketing Pvt. Ltd.).
  - Consumer Protection Act, 2019 (direct selling rules).
- **Geographic constraints:** Primary market India; state registrations in Tamil Nadu, Telangana, Kerala, Himachal Pradesh, Punjab, Rajasthan, Karnataka, Andhra Pradesh, New Delhi.

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI hallucination on business facts | Medium | High | RAG-grounded responses only; no business claim without source; human escalation fallback. |
| Regulatory non-compliance (DPDP) | Low | Critical | Privacy-by-design; data minimization; consent management; full audit trail; legal review. |
| Voice AI call quality issues | Medium | Medium | Vapi SLA monitoring; Twilio fallback; call quality alerts; continuous prompt tuning. |
| Distributor compensation miscalculation | Low | High | Compensation logic isolated in service module; unit-tested; manual review of all payouts above threshold. |
| Knowledge base staleness | High | Medium | Per-document `last_updated` field; weekly stale-content report; SME review workflow. |
| Multi-tenant data leak | Low | Critical | RLS on every query; tenant_id enforced in Prisma middleware; automated RLS tests in CI. |
| Vendor lock-in (Vapi, OpenAI) | Medium | Medium | Abstract vendor interfaces (LLM gateway, voice gateway); design for swappable providers. |
| Cost overrun (LLM API spend) | Medium | Medium | Per-tenant usage quotas; cost dashboards; caching for common queries; model tiering (GPT-4o for complex, GPT-4o-mini for simple). |

---

## 8. Stakeholders

| Stakeholder | Role | Primary Channel |
|---|---|---|
| Customer | Buys products, seeks support | Voice AI, WhatsApp, Website Chat, Customer Portal |
| Distributor | Sells products, builds downline | Voice AI (distributor support), WhatsApp, Distributor Portal |
| Employee (Support) | Handles escalations, answers queries | Employee Portal, Admin Dashboard |
| Employee (Ops) | Manages orders, shipping, exceptions | Admin Dashboard |
| Admin | Manages platform, content, users | Admin Dashboard |
| Sales | Qualifies leads, follows up | Admin Dashboard, Sales AI |
| Marketing | Creates campaigns, content | Admin Dashboard, Marketing AI |
| Management | Monitors KPIs, makes decisions | Admin Dashboard, Analytics AI |

---

## 9. Reference Documents

| Document | Role |
|---|---|
| `docs/research/00_MASTER_CONTEXT.md` | Master engineering context |
| `docs/research/01_PROJECT_BRIEF.md` | Project brief |
| `docs/research/02_BUSINESS_CONTEXT.md` | Business context |
| `docs/research/03_PRODUCT_CONTEXT.md` | Product context |
| `docs/research/04_AI_VISION.md` | Long-term AI vision |
| `docs/research/05_PERSONAS.md` | User personas |
| `docs/research/06_FEATURE_WISHLIST.md` | Feature wishlist |
| `docs/research/07_BUSINESS_PROCESSES.md` | Business processes |
| `docs/research/08_CONSTRAINTS.md` | Constraints |
| `docs/research/09_TECH_STACK.md` | Tech stack decisions |
| `docs/research/10_CODING_STANDARDS.md` | Coding standards |
| `docs/research/15_SUCCESS_METRICS.md` | Success metrics |
| `docs/architecture/00_SYSTEM_OVERVIEW.md` | Architecture overview |
| `docs/architecture/01_HIGH_LEVEL_ARCHITECTURE.md` | High-level architecture |
| `docs/research/RESEARCH_INDEX.md` | Research source index |
| `packages/knowledge-base/INDEX.md` | Knowledge base index |

---

**END OF DOCUMENT**

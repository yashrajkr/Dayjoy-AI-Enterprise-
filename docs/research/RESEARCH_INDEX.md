# Research Index

> **Status:** VERIFIED
> **Last updated:** 2026-08-04
> **Purpose:** Catalog all research sources used to build the Dayjoy AI Enterprise Platform knowledge base. This index is the entry point for RAG ingestion, AI assistant context, and ongoing research updates.
> **Audience:** AI engineers, RAG pipeline operators, knowledge managers, future AI coding assistants.

---

## 1. Overview

The Dayjoy research repository contains **28 source documents** organized into 5 categories. Every knowledge base document in `packages/knowledge-base/` traces back to one or more research sources listed here. Every AI assistant working on Dayjoy should consult this index before generating business facts to ensure claims are grounded in verified research.

### 1.1 Research Process

```text
Public Sources (Dayjoy website, MCA, GST) → Research Docs → Verified Facts → Knowledge Base → RAG → AI Assistants
```

### 1.2 Verification Standards

Every research document marks claims with one of:

- **VERIFIED** — Confirmed by ≥ 2 independent sources, or by an official Dayjoy-published page.
- **PARTIALLY VERIFIED** — Claimed by Dayjoy but not independently confirmed.
- **UNKNOWN** — No reliable source available; flagged for client input.
- **REQUIRES CLIENT INPUT** — Explicitly needs Dayjoy team to provide data.

---

## 2. Source Categories

### 2.1 Company Research

Background, legal structure, leadership, locations, certifications.

| File | Description |
|---|---|
| `Company_Research.md` | Dayjoy company background — incorporation, CIN, address, leadership, products, target customers, market position. |
| `02_Business_Model.md` | Business model analysis — direct selling, distributor structure, revenue model. |
| `02_BUSINESS_CONTEXT.md` | Business context for the AI platform. |
| `02_KNOWN_FACTS.md` | Verified facts repository (single source of truth for safe claims). |
| `03_UNKNOWN_INFORMATION.md` | Open questions and gaps requiring client input. |

### 2.2 Product Research

Product catalog, categories, brands, pricing.

| File | Description |
|---|---|
| `03_Product_Research.md` | Product catalog analysis — categories, brands, pricing gaps. |
| `03_PRODUCT_CONTEXT.md` | Product context for the AI platform. |
| `04_Distributor_System.md` | Distributor network structure, compensation, ranks, payouts. |

### 2.3 Policies & Compliance

Company policies, regulatory framework, competitor landscape.

| File | Description |
|---|---|
| `05_Policies.md` | Company policies — shipping, returns, refunds, cancellations, payments, privacy, terms. |
| `05_Policies.md` (KB copy) | Knowledge-base-ready version with VERIFIED tags. |
| `09_Competitor_Analysis.md` | Competitor landscape — Indian direct selling competitors, positioning, differentiation. |
| `08_CONSTRAINTS.md` | Project constraints (regulatory, technical, business). |

### 2.4 Customer Insights

FAQs, customer journey, business processes, pain points.

| File | Description |
|---|---|
| `06_FAQs.md` | Frequently asked questions from customers, distributors, employees. |
| `06_FAQs.md` (KB copy) | Knowledge-base-ready version with alternative phrasings. |
| `07_Customer_Journey.md` | Customer journey maps — awareness, consideration, purchase, onboarding, support, advocacy. |
| `08_Business_Processes.md` | Business processes — order, shipping, returns, distributor onboarding, support. |
| `07_BUSINESS_PROCESSES.md` | Business processes (Phase 1 context pack version). |
| `10_Pain_Points.md` | Pain point inventory across customer, distributor, employee, ops, sales, marketing, management. |
| `05_PERSONAS.md` | User personas for AI assistant design. |
| `07_NEXT_ACTIONS.md` | Next-action roadmap. |

### 2.5 AI Opportunities

AI use cases, gaps, vision, decisions.

| File | Description |
|---|---|
| `11_AI_Opportunities.md` | AI use cases and capability map. |
| `12_Research_Gap_Analysis.md` | Gaps in research, readiness blockers, client questions. |
| `04_AI_VISION.md` | Long-term AI vision (3–5 years). |
| `06_DECISIONS.md` | Decision register. |
| `06_FEATURE_WISHLIST.md` | Feature wishlist for the AI platform. |
| `09_TECH_STACK.md` | Tech stack decisions and rationale. |
| `10_CODING_STANDARDS.md` | Coding standards for the platform. |
| `13_AI_BEHAVIOR.md` | AI behavior expectations and guardrails. |
| `14_FUTURE_INTEGRATIONS.md` | Future integration roadmap (CRM, ERP, n8n, Zapier). |
| `15_SUCCESS_METRICS.md` | Success metrics and KPIs. |
| `11_DOCUMENTATION_RULES.md` | Documentation rules for AI assistants. |
| `12_ARCHITECTURE_PRINCIPLES.md` | Architecture principles. |

### 2.6 Project Governance

Master context, navigation, governance.

| File | Description |
|---|---|
| `00_MASTER_CONTEXT.md` | Master engineering context — read first. |
| `01_PROJECT_BRIEF.md` | Project brief. |
| `01_PROJECT_INDEX.md` | Documentation index. |
| `04_DOCUMENT_MAP.md` | Document dependency and navigation map. |
| `05_RESEARCH_LOG.md` | Research audit trail. |

---

## 3. Source Index Table

| Source | Category | Status | Last Updated | Used In |
|---|---|---|---|---|
| `Company_Research.md` | Company | ✅ Verified | 2026-08-04 | Knowledge Base (`company/`), AI Prompts |
| `02_Business_Model.md` | Company | ✅ Verified | 2026-08-04 | Knowledge Base, Business Plan Flow |
| `02_BUSINESS_CONTEXT.md` | Company | ✅ Verified | 2026-08-04 | Architecture, AI Vision |
| `02_KNOWN_FACTS.md` | Company | ✅ Verified | 2026-08-04 | All AI assistants (truth layer) |
| `03_UNKNOWN_INFORMATION.md` | Company | ⚠️ Gaps | 2026-08-04 | Gap analysis, client workshops |
| `03_Product_Research.md` | Product | ✅ Verified | 2026-08-04 | Knowledge Base (`products/`), Product Flow |
| `03_PRODUCT_CONTEXT.md` | Product | ✅ Verified | 2026-08-04 | Architecture, Knowledge engineering |
| `04_Distributor_System.md` | Product | ✅ Verified | 2026-08-04 | Knowledge Base (`compensation-plan/`), Distributor Flow |
| `05_Policies.md` | Compliance | ✅ Verified | 2026-08-04 | Knowledge Base (`policies/`, `support/`, `compliance/`) |
| `09_Competitor_Analysis.md` | Compliance | ✅ Verified | 2026-08-04 | Marketing AI, Strategy |
| `08_CONSTRAINTS.md` | Compliance | ✅ Verified | 2026-08-04 | Architecture, Delivery planning |
| `06_FAQs.md` | Customer | ✅ Verified | 2026-08-04 | Knowledge Base (`faqs/`), Voice/WhatsApp/Web AI |
| `07_Customer_Journey.md` | Customer | ✅ Verified | 2026-08-04 | Knowledge Base (`sops/customer-journey.md`), Personas |
| `08_Business_Processes.md` | Customer | ✅ Verified | 2026-08-04 | Knowledge Base (`sops/business-processes.md`), Workflows |
| `07_BUSINESS_PROCESSES.md` | Customer | ✅ Verified | 2026-08-04 | Workflow automation, AI flows |
| `10_Pain_Points.md` | Customer | ✅ Verified | 2026-08-04 | AI Opportunities, Feature Wishlist |
| `05_PERSONAS.md` | Customer | ✅ Verified | 2026-08-04 | Conversation design, CRM, UX |
| `07_NEXT_ACTIONS.md` | Customer | ✅ Verified | 2026-08-04 | PM execution roadmap |
| `11_AI_Opportunities.md` | AI | ✅ Verified | 2026-08-04 | AI Vision, Architecture, Roadmap |
| `12_Research_Gap_Analysis.md` | AI | ⚠️ Gaps | 2026-08-04 | Planning, workshops, blockers |
| `04_AI_VISION.md` | AI | ✅ Verified | 2026-08-04 | PROJECT_PLAN.md, Architecture |
| `06_DECISIONS.md` | AI | ✅ Verified | 2026-08-04 | Architecture ADRs |
| `06_FEATURE_WISHLIST.md` | AI | ✅ Verified | 2026-08-04 | Product management, Roadmap |
| `09_TECH_STACK.md` | AI | ✅ Verified | 2026-08-04 | Engineering, Integration |
| `10_CODING_STANDARDS.md` | AI | ✅ Verified | 2026-08-04 | Development teams |
| `13_AI_BEHAVIOR.md` | AI | ✅ Verified | 2026-08-04 | AI assistants, guardrails |
| `14_FUTURE_INTEGRATIONS.md` | AI | ✅ Verified | 2026-08-04 | Architects, IT, roadmap |
| `15_SUCCESS_METRICS.md` | AI | ✅ Verified | 2026-08-04 | PM, Analytics, KPIs |
| `11_DOCUMENTATION_RULES.md` | Governance | ✅ Verified | 2026-08-04 | Documentation governance |
| `12_ARCHITECTURE_PRINCIPLES.md` | Governance | ✅ Verified | 2026-08-04 | Architecture |
| `00_MASTER_CONTEXT.md` | Governance | ✅ Verified | 2026-08-04 | All AI assistants (read first) |
| `01_PROJECT_BRIEF.md` | Governance | ✅ Verified | 2026-08-04 | Architecture, PM |
| `01_PROJECT_INDEX.md` | Governance | ✅ Verified | 2026-08-04 | Navigation |
| `04_DOCUMENT_MAP.md` | Governance | ✅ Verified | 2026-08-04 | Navigation, dependencies |
| `05_RESEARCH_LOG.md` | Governance | ✅ Verified | 2026-08-04 | Research audit trail |

---

## 4. Knowledge Base Coverage Map

The `packages/knowledge-base/` directory maps research sources to ingested KB documents:

| KB Folder | Source Research Docs | Document Count |
|---|---|---|
| `company/` | `Company_Research.md`, `02_Business_Model.md`, `02_KNOWN_FACTS.md` | 5 |
| `products/` | `03_Product_Research.md`, `03_PRODUCT_CONTEXT.md` | 1 |
| `policies/` | `05_Policies.md`, `08_CONSTRAINTS.md` | 1 |
| `compensation-plan/` | `04_Distributor_System.md` | 1 |
| `faqs/` | `06_FAQs.md` | 1 |
| `support/` | `05_Policies.md` (shipping/return/warranty/payment sections) | 5 |
| `marketing/` | `Company_Research.md`, `09_Competitor_Analysis.md`, `03_Product_Research.md` | 5 |
| `compliance/` | `05_Policies.md`, `08_CONSTRAINTS.md`, `09_Competitor_Analysis.md` | 4 |
| `training-material/` | `04_Distributor_System.md`, `06_FAQs.md`, `03_Product_Research.md` | 4 |
| `sops/` | `07_Customer_Journey.md`, `08_Business_Processes.md` | 2 |
| **Total** | | **29** |

See `packages/knowledge-base/INDEX.md` for per-document metadata (tags, word count, chunk count estimate).

---

## 5. Research Gaps (Open Questions)

The following items require client input before they can be promoted from `03_UNKNOWN_INFORMATION.md` to verified knowledge:

1. **Exact compensation plan formulas** — BV/PV slabs, payout thresholds, rank advancement criteria beyond what's in the public compensation plan PDF.
2. **Complete product catalog** — Full SKU list, ingredient lists, MRP/DP for every product.
3. **Audited financial statements** — Revenue, profitability, growth rate.
4. **Director biographies** — Full board composition, equity ownership.
5. **Mobile app** — Whether an official Dayjoy mobile app exists or is planned.
6. **CRM** — Which CRM (if any) Dayjoy currently uses.
7. **Certifications** — ISO 9001:2015 certificate copy, awards verification.
8. **State-specific compliance** — Whether distributors can operate only in registered states or pan-India.

These gaps are tracked in `03_UNKNOWN_INFORMATION.md` and `12_Research_Gap_Analysis.md`. AI assistants must treat them as blockers, not facts.

---

## 6. Document Map

For the full document dependency and navigation map, see: [`04_DOCUMENT_MAP.md`](./04_DOCUMENT_MAP.md).

For the consolidated project plan, see: [`../PROJECT_PLAN.md`](../PROJECT_PLAN.md).

For the knowledge base index, see: [`../../packages/knowledge-base/INDEX.md`](../../packages/knowledge-base/INDEX.md).

---

## 7. Maintenance

- **Review cadence:** Quarterly review of all sources; immediate update when Dayjoy publishes new content.
- **Source updates:** When a research document is updated, bump the `Last Updated` date and re-ingest affected KB documents into RAG.
- **New sources:** Add new research files to the appropriate category in Section 2 and the Source Index Table in Section 3.
- **Verification upgrades:** When a `PARTIALLY VERIFIED` claim gets independent confirmation, upgrade to `VERIFIED` and remove from `03_UNKNOWN_INFORMATION.md`.

---

**END OF DOCUMENT**

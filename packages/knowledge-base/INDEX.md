# Knowledge Base Index

> **Status:** VERIFIED
> **Last updated:** 2026-08-04
> **Purpose:** Catalog all knowledge base documents with metadata for RAG ingestion, AI assistant context, and ongoing maintenance.
> **Audience:** RAG pipeline operators, AI engineers, knowledge managers, AI assistants.

---

## 1. Overview

The Dayjoy Knowledge Base contains **29 documents** organized into **10 categories**. These documents are the source of truth for the Dayjoy AI Enterprise Platform's RAG pipeline. Every AI response grounded in business facts must trace back to a document listed in this index.

### 1.1 Document Format

Every KB document follows this format:

```markdown
# [Document Title]

> **Status:** VERIFIED / PARTIALLY VERIFIED / REQUIRES CLIENT INPUT
> **Last updated:** YYYY-MM-DD
> **Category:** [Company | Products | Policies | Compensation Plan | FAQs | Support | Marketing | Compliance | Training | SOPs]
> **Tags:** [comma-separated tags from Section 5]
> **Primary Sources:** [list of research docs or official sources]

---

## 1. [Section]
...
```

### 1.2 Verification Standards

- **VERIFIED** — Confirmed by ≥ 2 independent sources, or by an official Dayjoy-published page.
- **PARTIALLY VERIFIED** — Claimed by Dayjoy but not independently confirmed.
- **REQUIRES CLIENT INPUT** — Explicitly needs Dayjoy team to provide data; marked with `[PLACEHOLDER]`.

---

## 2. Documents

| # | Document | Category | Tags | Last Updated | Word Count (Est.) | Chunk Count (Est.) |
|---|---|---|---|---|---|---|
| 1 | `company/about-dayjoy.md` | Company | customer-facing, company, about, history, background | 2026-08-04 | ~700 | ~3 |
| 2 | `company/mission-vision-values.md` | Company | customer-facing, company, mission, vision, values, brand-promise | 2026-08-04 | ~650 | ~3 |
| 3 | `company/leadership-team.md` | Company | internal-only, company, leadership, executives, directors | 2026-08-04 | ~750 | ~3 |
| 4 | `company/company-milestones.md` | Company | customer-facing, company, milestones, history, achievements, awards | 2026-08-04 | ~700 | ~3 |
| 5 | `company/contact-information.md` | Company | customer-facing, company, contact, address, phone, email, business-hours | 2026-08-04 | ~800 | ~3 |
| 6 | `products/product-research.md` | Products | customer-facing, product, catalog, research | 2026-08-04 | ~80 | ~1 |
| 7 | `policies/policies.md` | Policies | customer-facing, policy, shipping, returns, refunds, privacy, terms | 2026-08-04 | ~14000 | ~50 |
| 8 | `compensation-plan/distributor-system.md` | Compensation Plan | distributor-only, compensation, plan, distributor-system, ranks | 2026-08-04 | ~13000 | ~45 |
| 9 | `faqs/faqs.md` | FAQs | customer-facing, faq, customer, distributor, employee, product | 2026-08-04 | ~15000 | ~55 |
| 10 | `sops/customer-journey.md` | SOPs | internal-only, sop, customer-journey, journey-map | 2026-08-04 | ~5000 | ~18 |
| 11 | `sops/business-processes.md` | SOPs | internal-only, sop, business-process, workflow | 2026-08-04 | ~6000 | ~22 |
| 12 | `support/return-policy.md` | Support | customer-facing, policy, returns, refunds, support | 2026-08-04 | ~1100 | ~4 |
| 13 | `support/shipping-policy.md` | Support | customer-facing, policy, shipping, delivery, support | 2026-08-04 | ~1200 | ~4 |
| 14 | `support/warranty-policy.md` | Support | customer-facing, policy, warranty, support, products | 2026-08-04 | ~1100 | ~4 |
| 15 | `support/payment-options.md` | Support | customer-facing, policy, payments, support, security | 2026-08-04 | ~1100 | ~4 |
| 16 | `support/faq-troubleshooting.md` | Support | customer-facing, faq, troubleshooting, support | 2026-08-04 | ~1500 | ~5 |
| 17 | `marketing/brand-guidelines.md` | Marketing | distributor-only, internal-only, marketing, brand, guidelines, voice, tone, visual | 2026-08-04 | ~1400 | ~5 |
| 18 | `marketing/product-catalog.md` | Marketing | customer-facing, marketing, product, catalog, bestsellers | 2026-08-04 | ~1200 | ~4 |
| 19 | `marketing/promotional-offers.md` | Marketing | customer-facing, distributor-only, marketing, promotions, discounts, campaigns | 2026-08-04 | ~1300 | ~5 |
| 20 | `marketing/testimonials.md` | Marketing | customer-facing, distributor-only, marketing, testimonials, success-stories | 2026-08-04 | ~1300 | ~5 |
| 21 | `marketing/social-media-links.md` | Marketing | customer-facing, distributor-only, internal-only, marketing, social-media, guidelines | 2026-08-04 | ~1500 | ~5 |
| 22 | `compliance/privacy-policy.md` | Compliance | customer-facing, compliance, privacy, policy, legal, dpdp | 2026-08-04 | ~1600 | ~6 |
| 23 | `compliance/terms-of-service.md` | Compliance | customer-facing, compliance, terms, policy, legal | 2026-08-04 | ~1500 | ~5 |
| 24 | `compliance/gst-tax-information.md` | Compliance | customer-facing, distributor-only, compliance, gst, tax, legal | 2026-08-04 | ~1400 | ~5 |
| 25 | `compliance/dsa-compliance.md` | Compliance | internal-only, distributor-only, compliance, dsa, legal, direct-selling | 2026-08-04 | ~1700 | ~6 |
| 26 | `training-material/distributor-onboarding.md` | Training | distributor-only, training, onboarding | 2026-08-04 | ~1600 | ~6 |
| 27 | `training-material/product-training.md` | Training | distributor-only, training, products, sales | 2026-08-04 | ~1800 | ~6 |
| 28 | `training-material/sales-techniques.md` | Training | distributor-only, training, sales, techniques, objections | 2026-08-04 | ~1800 | ~6 |
| 29 | `training-material/compensation-plan-training.md` | Training | distributor-only, training, compensation, plan, ranks, commissions | 2026-08-04 | ~1900 | ~7 |
| **Total** | | | | | **~86000** | **~310** |

> **Word and chunk counts are estimates.** Actual counts depend on RAG chunking configuration (typically 250–500 words per chunk with 50-word overlap).

---

## 3. Categories

### 3.1 Company (5 documents)

Background, mission, leadership, milestones, contact info.

- `about-dayjoy.md` — Company background, history, legal identity, business model.
- `mission-vision-values.md` — Mission, vision, core values, brand promise.
- `leadership-team.md` — Directors, executives, regional leadership, Grievance Officer.
- `company-milestones.md` — Timeline of milestones, achievements, awards.
- `contact-information.md` — Office addresses, phone numbers, emails, business hours, social media.

### 3.2 Products (1 document)

Product research + catalog.

- `product-research.md` — Product catalog analysis (placeholder; client to expand with full SKU data).

### 3.3 Policies (1 document)

All company policies in a single comprehensive document.

- `policies.md` — Shipping, returns, refunds, cancellations, payments, privacy, terms, distributor policies.

### 3.4 Compensation Plan (1 document)

Distributor system + compensation.

- `distributor-system.md` — Distributor program, eligibility, compensation plan, ranks, payouts, compliance.

### 3.5 FAQs (1 document)

All FAQs in a single comprehensive document.

- `faqs.md` — Customer, distributor, employee, admin FAQs + product-specific FAQs + policy FAQs.

### 3.6 Support (5 documents)

Returns, shipping, warranty, payments, troubleshooting.

- `return-policy.md` — Detailed return/refund policy.
- `shipping-policy.md` — Shipping methods, delivery times, costs, tracking.
- `warranty-policy.md` — Product warranty terms, claim process.
- `payment-options.md` — Accepted payment methods, EMI, security.
- `faq-troubleshooting.md` — Common issues + troubleshooting steps.

### 3.7 Marketing (5 documents)

Brand, catalog, promotions, testimonials, social.

- `brand-guidelines.md` — Brand voice, tone, visual identity, logo usage.
- `product-catalog.md` — Product catalog overview, categories, price ranges, bestsellers.
- `promotional-offers.md` — Current promotions, discount structure, seasonal campaigns.
- `testimonials.md` — Customer testimonials, distributor success stories (with income disclosures).
- `social-media-links.md` — Official handles, posting guidelines, distributor social media rules.

### 3.8 Compliance (4 documents)

Privacy, terms, GST, DSA compliance.

- `privacy-policy.md` — Privacy policy, DPDP compliance, data subject rights.
- `terms-of-service.md` — Terms of service for customers + distributors + AI platform.
- `gst-tax-information.md` — GST registration, tax rates, invoice process, ITC for distributors.
- `dsa-compliance.md` — Direct Selling Association compliance, legal framework for network marketing in India.

### 3.9 Training (4 documents)

Onboarding, product, sales, compensation training.

- `distributor-onboarding.md` — 5-module, 30-day onboarding training.
- `product-training.md` — Product knowledge training for 12 categories.
- `sales-techniques.md` — Sales process, objection handling, closing techniques, recruiting.
- `compensation-plan-training.md` — How to explain the compensation plan, rank advancement.

### 3.10 SOPs (2 documents)

Customer journey, business processes.

- `customer-journey.md` — Customer journey maps across stages.
- `business-processes.md` — Standard operating procedures for business processes.

---

## 4. Document Dependencies

```text
Research Docs (docs/research/)
       │
       ▼
Knowledge Base (packages/knowledge-base/)
       │
       ├── company/ ← Company_Research.md, 02_Business_Model.md
       ├── products/ ← 03_Product_Research.md
       ├── policies/ ← 05_Policies.md
       ├── compensation-plan/ ← 04_Distributor_System.md
       ├── faqs/ ← 06_FAQs.md
       ├── support/ ← 05_Policies.md (sections)
       ├── marketing/ ← Company_Research.md, 09_Competitor_Analysis.md, 03_Product_Research.md
       ├── compliance/ ← 05_Policies.md, 08_CONSTRAINTS.md, 09_Competitor_Analysis.md
       ├── training-material/ ← 04_Distributor_System.md, 06_FAQs.md, 03_Product_Research.md
       └── sops/ ← 07_Customer_Journey.md, 08_Business_Processes.md
```

See `docs/research/RESEARCH_INDEX.md` for the full source-to-KB mapping.

---

## 5. Tags (for RAG Filtering)

Tags are used by the RAG pipeline to filter retrieval results by audience and topic. Each document has 4–7 tags from the taxonomy below.

### 5.1 Audience Tags

| Tag | Description | Use Case |
|---|---|---|
| `customer-facing` | Safe to share with customers | Customer-facing AI assistants (Voice, WhatsApp, Web Chat) can retrieve |
| `distributor-only` | For distributors only | Distributor AI assistant + Distributor Portal can retrieve; customer-facing AI must NOT |
| `internal-only` | For employees/admins only | Employee AI + Admin Dashboard can retrieve; external AI must NOT |
| `compliance` | Legal/compliance content | Compliance team + Grievance Officer + Legal can retrieve |

### 5.2 Topic Tags

| Tag | Description |
|---|---|
| `company` | Company information (about, history, mission, leadership, contact) |
| `product` | Product information (catalog, ingredients, usage) |
| `policy` | Company policies (shipping, returns, privacy, terms) |
| `compensation` | Compensation plan, ranks, commissions |
| `faq` | Frequently asked questions |
| `support` | Customer support (troubleshooting, warranty, payments) |
| `marketing` | Marketing materials (brand, promotions, testimonials, social) |
| `training` | Training material (onboarding, product, sales, compensation) |
| `sop` | Standard operating procedures |
| `legal` | Legal content (terms, privacy, compliance) |
| `gst` | GST and tax information |
| `dsa` | Direct Selling Association compliance |
| `dpdp` | Digital Personal Data Protection Act, 2023 |

### 5.3 Sub-Topic Tags (Optional)

| Tag | Description |
|---|---|
| `about` | Company background |
| `history` | Company history |
| `mission` | Mission statement |
| `vision` | Vision statement |
| `values` | Core values |
| `brand-promise` | Brand promise |
| `leadership` | Leadership team |
| `executives` | Executives |
| `directors` | Directors |
| `milestones` | Company milestones |
| `achievements` | Achievements |
| `awards` | Awards |
| `contact` | Contact information |
| `address` | Address |
| `phone` | Phone numbers |
| `email` | Email addresses |
| `business-hours` | Business hours |
| `returns` | Return policy |
| `refunds` | Refund policy |
| `shipping` | Shipping policy |
| `delivery` | Delivery information |
| `warranty` | Warranty policy |
| `payments` | Payment options |
| `security` | Payment security |
| `troubleshooting` | Troubleshooting |
| `brand` | Brand guidelines |
| `guidelines` | Guidelines |
| `voice` | Brand voice |
| `tone` | Brand tone |
| `visual` | Visual identity |
| `catalog` | Product catalog |
| `bestsellers` | Bestselling products |
| `promotions` | Promotional offers |
| `discounts` | Discounts |
| `campaigns` | Marketing campaigns |
| `testimonials` | Customer testimonials |
| `success-stories` | Distributor success stories |
| `social-media` | Social media |
| `privacy` | Privacy policy |
| `terms` | Terms of service |
| `gst` | GST information |
| `tax` | Tax information |
| `direct-selling` | Direct selling |
| `onboarding` | Distributor onboarding |
| `sales` | Sales techniques |
| `techniques` | Sales techniques |
| `objections` | Objection handling |
| `plan` | Compensation plan |
| `ranks` | Distributor ranks |
| `commissions` | Commissions |
| `customer-journey` | Customer journey |
| `journey-map` | Journey mapping |
| `business-process` | Business process |
| `workflow` | Workflow |

---

## 6. RAG Ingestion

### 6.1 Ingestion Pipeline

The knowledge base documents are ingested by the RAG pipeline as follows:

```text
packages/knowledge-base/*.md
       │
       ▼
  Loaders (rag/loaders/) — markdown.loader.ts
       │
       ▼
  Chunking (rag/ingestion/chunking-service.ts)
       │  Chunk size: 250-500 words
       │  Overlap: 50 words
       │  Split on headings
       ▼
  Embeddings (rag/embeddings/embeddings-service.ts)
       │  Model: text-embedding-3-small (OpenAI)
       │  Dimensions: 1536
       ▼
  Vector Store (rag/vector-store/) — pgvector + Qdrant
       │  Hybrid retrieval: vector + keyword
       │  Metadata: document, category, tags, last_updated
       ▼
  Retrieval (rag/retriever/) — top-K (default K=5)
       │
       ▼
  Response Pipeline (rag/response-pipeline/) — LLM with context
       │
       ▼
  AI Assistants (Voice, WhatsApp, Web Chat)
```

### 6.2 Ingestion Commands

To ingest all knowledge base documents:

```bash
# Ingest all knowledge base documents
cd rag
npx tsx ingestion/ingest-bulk.ts --source ../packages/knowledge-base

# Or ingest a single category
npx tsx ingestion/ingest-bulk.ts --source ../packages/knowledge-base/company

# Verify ingestion
psql -c "SELECT count(*) FROM rag_chunks;"
psql -c "SELECT document_name, count(*) FROM rag_chunks GROUP BY document_name;"
```

### 6.3 Re-Ingestion Triggers

Re-ingest when:

- A document's `Last updated` date changes.
- A new document is added.
- A document is removed.
- Tags are modified.
- The chunking strategy is updated.

### 6.4 Retrieval Configuration

Default retrieval configuration:

| Parameter | Default Value | Notes |
|---|---|---|
| Top-K | 5 | Number of chunks retrieved |
| Min similarity | 0.7 | Below this, chunk is filtered out |
| Hybrid weight | 0.7 (vector) + 0.3 (keyword) | Hybrid retrieval |
| Tag filter | audience-aware | Filter by user's role (customer/distributor/employee/admin) |
| Category filter | optional | Restrict to specific categories |
| Re-ranker | enabled | Cross-encoder re-ranking for relevance |

---

## 7. Maintenance

### 7.1 Update Cadence

| Category | Update Cadence | Owner |
|---|---|---|
| Company | Quarterly | Marketing |
| Products | Monthly | Product + Marketing |
| Policies | On change | Compliance |
| Compensation Plan | On change | Compliance + Sales |
| FAQs | Monthly | Customer Support |
| Support | On policy change | Customer Support |
| Marketing | Weekly (promotions) | Marketing |
| Compliance | On regulatory change | Compliance |
| Training | Quarterly | Training |
| SOPs | On process change | Operations |

### 7.2 Review Process

1. **Author** drafts/updates document.
2. **Subject Matter Expert (SME)** reviews for accuracy.
3. **Compliance** reviews for legal/regulatory alignment (mandatory for compliance/policy/marketing).
4. **Marketing** reviews for brand alignment (mandatory for customer-facing).
5. **Final approver** (varies by category) signs off.
6. **RAG operator** re-ingests into vector store.
7. **Last updated** date bumped.

### 7.3 Stale Content Detection

- Documents with `Last updated` older than 6 months are flagged for review.
- Documents marked `REQUIRES CLIENT INPUT` are tracked in `docs/research/03_UNKNOWN_INFORMATION.md`.
- Monthly stale-content report generated for Management review.

---

## 8. Quality Metrics

| Metric | Target | Status |
|---|---|---|
| **Retrieval accuracy** | > 80% | Tracked via `rag/evaluation/` |
| **AI groundedness** | > 90% (no hallucinated facts) | Tracked via `rag/evaluation/` |
| **Coverage** | All 10 categories populated | ✅ Achieved |
| **Verification status** | > 70% VERIFIED | Currently ~60% VERIFIED, ~30% PARTIALLY VERIFIED, ~10% REQUIRES CLIENT INPUT |
| **Stale documents (< 6 months)** | < 10% of total | Tracked monthly |
| **Customer satisfaction (CSAT)** | > 4.5 / 5 | Tracked via AI feedback |
| **AI escalation rate** | < 20% (AI → human) | Tracked via Voice AI analytics |

---

## 9. Open Items (REQUIRES CLIENT INPUT)

The following items are marked `[PLACEHOLDER]` across multiple KB documents and require client input to fully verify:

1. **Income Disclosure Statement (IDS)** — Critical compliance gap; needed for `compensation-plan/distributor-system.md`, `marketing/testimonials.md`, `training-material/compensation-plan-training.md`, `training-material/sales-techniques.md`, `compliance/dsa-compliance.md`.
2. **Exact rank advancement criteria** — BV, PV, team structure per rank; needed for `compensation-plan/distributor-system.md`, `training-material/compensation-plan-training.md`.
3. **Brand asset library** — Logo files, color palette, fonts; needed for `marketing/brand-guidelines.md`.
4. **Official social media handles** — YouTube, Facebook, Instagram, X, Telegram; needed for `company/contact-information.md`, `marketing/social-media-links.md`.
5. **Contact channel details** — Customer Care, Business Support, WhatsApp, Dispatch, Franchise Manager, Grievance Officer phone/email; needed for `company/contact-information.md`.
6. **Business hours** — Days and times; needed for `company/contact-information.md`.
7. **Grievance Officer name** — Needed for `company/contact-information.md`, `company/leadership-team.md`, `compliance/privacy-policy.md`, `compliance/terms-of-service.md`, `compliance/dsa-compliance.md`.
8. **Product details per SKU** — Ingredients, dosage, contraindications, MRP, DP, BV, PV; needed for `products/product-research.md`, `training-material/product-training.md`, `marketing/product-catalog.md`.
9. **Return window and refund processing times** — Needed for `support/return-policy.md`.
10. **Shipping charge slabs** — Needed for `support/shipping-policy.md`.
11. **Warranty periods per product** — Needed for `support/warranty-policy.md`.
12. **EMI eligibility and bank list** — Needed for `support/payment-options.md`.
13. **Promotional offers and pricing** — Needed for `marketing/promotional-offers.md`.
14. **Customer testimonials and consent forms** — Needed for `marketing/testimonials.md`.
15. **State registration dates** — Needed for `company/company-milestones.md`, `compliance/dsa-compliance.md`.

---

## 10. Related Documents

- **Research Index:** `docs/research/RESEARCH_INDEX.md`
- **Project Plan:** `docs/PROJECT_PLAN.md`
- **Document Map:** `docs/research/04_DOCUMENT_MAP.md`
- **RAG README:** `rag/README.md`
- **Ingestion Guide:** `rag/docs/INGESTION_GUIDE.md`
- **Sources README:** `packages/knowledge-base/SOURCES_README.md`
- **Knowledge Base README:** `packages/knowledge-base/README.md`

---

**END OF DOCUMENT**

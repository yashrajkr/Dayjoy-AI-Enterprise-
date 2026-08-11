# Knowledge Base - RAG Sources

Raw documents for RAG (Retrieval-Augmented Generation) system.

## Knowledge Sources

### 1. Product PDFs
**Location:** `knowledge/sources/product-pdfs/`
**Formats:** PDF
**Examples:** Product brochures, price lists, feature sheets

### 2. Policies
**Location:** `knowledge/sources/policies/`
**Formats:** PDF, DOCX
**Examples:** Return policy, privacy policy, terms of service

### 3. FAQs
**Location:** `knowledge/sources/faqs/`
**Formats:** CSV, PDF, DOCX
**Examples:** Customer FAQs, distributor FAQs, product FAQs

### 4. Compensation Plan
**Location:** `knowledge/sources/compensation-plan/`
**Formats:** PDF, DOCX
**Examples:** BV plan, bonus structure, incentive programs

### 5. Training Material
**Location:** `knowledge/sources/training-material/`
**Formats:** PDF, PPTX, DOCX
**Examples:** Onboarding guides, product training, sales training

### 6. Marketing Documents
**Location:** `knowledge/sources/marketing-docs/`
**Formats:** PDF, DOCX, HTML
**Examples:** Brochures, flyers, promotional materials

### 7. SOPs (Standard Operating Procedures)
**Location:** `knowledge/sources/sops/`
**Formats:** PDF, DOCX
**Examples:** Business processes, compliance procedures

### 8. Company Documents
**Location:** `knowledge/sources/company-docs/`
**Formats:** PDF, DOCX, TXT
**Examples:** About us, mission, vision, history

### 9. Website Content
**Location:** `knowledge/sources/website-content/`
**Formats:** HTML, MD
**Examples:** Website pages, blog posts, help articles

## Processing Pipeline

```
sources/ → Ingestion → Chunks → Embeddings → Vector Store → Retrieval
```

## Status

✅ Structure ready for document upload

## Next Steps

1. Upload actual documents to appropriate folders
2. Run RAG ingestion pipeline
3. Validate chunking and embeddings
4. Test retrieval accuracy

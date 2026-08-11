# Dayjoy Knowledge Architecture

## Data Flow
ZIP → Extract → Clean → Classify → Store (SQL) → Chunk (882) → Embed (OpenAI 1536-dim) → Index (HNSW) → Retrieve (Hybrid: Vector + Keyword) → Context Assembly → AI Assistant → Grounded Answer

## Database Schema
- `rag_sources` — knowledge source documents
- `rag_documents` — individual documents with status + metadata
- `rag_chunks` — text chunks with `embedding vector(1536)` + HNSW index
- `rag_embeddings` — embedding tracking
- `dayjoy_products` — 170 products (46 fields)
- `dayjoy_faqs` — 2,209 Q&A pairs
- `dayjoy_compensation_rules` — 81 rules (with conflict flags)
- `dayjoy_support_policies` — 17 policies
- `dayjoy_company_facts` — 69 facts
- `dayjoy_conflict_fields` — 3 CONFLICT_UNRESOLVED fields

## Retrieval Strategy
- Hybrid search: 70% vector + 30% keyword (Reciprocal Rank Fusion)
- HNSW index for O(log n) vector similarity
- GIN index for metadata JSONB filtering
- Access control: role_scope + risk_level filtering at SQL level
- DocumentPermissionsService: per-document role/user restrictions

## Access Control
- 7 AI assistants with different knowledge access levels
- Config: rag/config/assistant-knowledge-access.json
- Enforced at: SQL filter + DocumentPermissionsService.filterAccessibleChunks

## Abstain Policy
- 5 categories: health, dosage, compensation_conflicts, popularity, income
- 3 CONFLICT_UNRESOLVED fields: retail_profit_rate, mentorship_bonus_rate, business_matching_structure
- Pre-generation: checkQuery() intercepts and abstains
- Post-generation: checkResponse() appends disclaimers

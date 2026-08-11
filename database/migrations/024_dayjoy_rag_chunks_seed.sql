-- 024_dayjoy_rag_chunks_seed.sql
-- Seed 882 canonical RAG chunks into the rag_chunks table
-- Embeddings will be generated separately by generate-embeddings.mjs

BEGIN;

-- Create a deterministic rag_source for Dayjoy knowledge
INSERT INTO rag_sources (id, tenant_id, name, type, description, status)
SELECT '00000000-0000-4000-8000-00000000a001',
       id, 'Dayjoy Knowledge Base', 'document',
       'Canonical Dayjoy knowledge — products, FAQs, compensation, policies',
       'active'
FROM tenants
WHERE NOT EXISTS (SELECT 1 FROM rag_sources WHERE id = '00000000-0000-4000-8000-00000000a001')
LIMIT 1;

-- Create rag_documents for each category
INSERT INTO rag_documents (id, tenant_id, source_id, title, content, metadata, status)
SELECT '00000000-0000-4000-8000-00000000b001',
       t.id, '00000000-0000-4000-8000-00000000a001',
       'Dayjoy Product Catalog', '170 products with pricing, ingredients, benefits',
       '{"category":"products","authority":"verified_price_list","role_scope":"public,distributor,internal"}'::jsonb,
       'READY'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM rag_documents WHERE id = '00000000-0000-4000-8000-00000000b001')
LIMIT 1;

INSERT INTO rag_documents (id, tenant_id, source_id, title, content, metadata, status)
SELECT '00000000-0000-4000-8000-00000000b002',
       t.id, '00000000-0000-4000-8000-00000000a001',
       'Dayjoy FAQs', 'Product-specific frequently asked questions',
       '{"category":"faq","authority":"canonical","role_scope":"public,distributor,internal"}'::jsonb,
       'READY'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM rag_documents WHERE id = '00000000-0000-4000-8000-00000000b002')
LIMIT 1;

INSERT INTO rag_documents (id, tenant_id, source_id, title, content, metadata, status)
SELECT '00000000-0000-4000-8000-00000000b003',
       t.id, '00000000-0000-4000-8000-00000000a001',
       'Dayjoy Compensation Plan', 'Distributor compensation rules, ranks, rewards',
       '{"category":"compensation","authority":"verified_pdf","role_scope":"distributor,internal"}'::jsonb,
       'READY'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM rag_documents WHERE id = '00000000-0000-4000-8000-00000000b003')
LIMIT 1;

INSERT INTO rag_documents (id, tenant_id, source_id, title, content, metadata, status)
SELECT '00000000-0000-4000-8000-00000000b004',
       t.id, '00000000-0000-4000-8000-00000000a001',
       'Dayjoy Policies & Support', 'Company policies, support procedures, escalation rules',
       '{"category":"policies","authority":"official_pdf","role_scope":"public,distributor,internal"}'::jsonb,
       'READY'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM rag_documents WHERE id = '00000000-0000-4000-8000-00000000b004')
LIMIT 1;

COMMIT;

-- Load RAG chunks from the canonical CSV using a temporary staging table
CREATE TEMP TABLE IF NOT EXISTS temp_rag_chunks (
    chunk_id TEXT,
    chunk_type TEXT,
    document_id TEXT,
    source_page TEXT,
    product_code TEXT,
    sku TEXT,
    category TEXT,
    role_scope TEXT,
    risk_level TEXT,
    confidence TEXT,
    effective_from TEXT,
    approval_status TEXT,
    text TEXT
);

\copy temp_rag_chunks (chunk_id, chunk_type, document_id, source_page, product_code, sku, category, role_scope, risk_level, confidence, effective_from, approval_status, text) FROM 'packages/knowledge-base/dayjoy-kb/rag-data/chunks/dayjoy_rag_chunks_CANONICAL.csv' WITH (FORMAT csv, HEADER true, NULL '');

-- Insert into rag_chunks with proper metadata
INSERT INTO rag_chunks (id, tenant_id, document_id, content, chunk_type, metadata, status)
SELECT
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    CASE
        WHEN t.chunk_type LIKE 'product%' OR t.chunk_type LIKE 'pricing%' THEN '00000000-0000-4000-8000-00000000b001'
        WHEN t.chunk_type LIKE 'faq%' THEN '00000000-0000-4000-8000-00000000b002'
        WHEN t.chunk_type LIKE 'compensation%' OR t.chunk_type LIKE 'rank%' THEN '00000000-0000-4000-8000-00000000b003'
        ELSE '00000000-0000-4000-8000-00000000b004'
    END,
    t.text,
    COALESCE(t.chunk_type, 'text'),
    jsonb_build_object(
        'chunk_id', t.chunk_id,
        'product_code', t.product_code,
        'sku', t.sku,
        'category', t.category,
        'role_scope', COALESCE(t.role_scope, 'public,distributor,internal'),
        'risk_level', COALESCE(t.risk_level, 'low'),
        'confidence', COALESCE(t.confidence, 'high'),
        'approval_status', COALESCE(t.approval_status, 'approved'),
        'effective_from', t.effective_from,
        'source_page', t.source_page
    ),
    'READY'
FROM temp_rag_chunks t
WHERE t.text IS NOT NULL AND LENGTH(t.text) > 10;

-- Verify chunk count
DO $$
DECLARE
    chunk_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO chunk_count FROM rag_chunks WHERE status = 'READY';
    RAISE NOTICE 'Total RAG chunks seeded: %', chunk_count;
END $$;

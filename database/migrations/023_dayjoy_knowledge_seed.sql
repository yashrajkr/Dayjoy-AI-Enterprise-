-- 023_dayjoy_knowledge_seed.sql
-- Seed Dayjoy knowledge: 170 products, FAQs, compensation rules, support policies
-- Uses \copy for bulk loading from canonical CSV files

BEGIN;

-- Create Dayjoy-specific tables
CREATE TABLE IF NOT EXISTS dayjoy_products (
    product_id VARCHAR(20) PRIMARY KEY,
    sku VARCHAR(30) UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    sub_category TEXT,
    manufacturer TEXT,
    country TEXT,
    pack_size TEXT,
    unit TEXT,
    mrp DECIMAL(10,2),
    dp DECIMAL(10,2),
    bv DECIMAL(10,2),
    pv DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'INR',
    ingredients TEXT,
    benefits TEXT,
    features TEXT,
    usage TEXT,
    dosage TEXT,
    warnings TEXT,
    storage TEXT,
    target_customer TEXT,
    description TEXT,
    image_ids TEXT,
    faq_ids TEXT,
    source_document_id TEXT,
    approval_status VARCHAR(20) DEFAULT 'approved',
    effective_from DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dayjoy_faqs (
    faq_id INTEGER PRIMARY KEY,
    product_id VARCHAR(20) REFERENCES dayjoy_products(product_id) ON DELETE CASCADE,
    sku VARCHAR(30),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    faq_category VARCHAR(50) DEFAULT 'general_info',
    source_document TEXT,
    confidence VARCHAR(20) DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dayjoy_faqs_product ON dayjoy_faqs(product_id);
CREATE INDEX IF NOT EXISTS idx_dayjoy_faqs_sku ON dayjoy_faqs(sku);

CREATE TABLE IF NOT EXISTS dayjoy_compensation_rules (
    rule_id VARCHAR(30) PRIMARY KEY,
    rule_category TEXT,
    rule_text TEXT NOT NULL,
    source_id TEXT,
    verified BOOLEAN DEFAULT FALSE,
    verification_status VARCHAR(30) DEFAULT 'UNVERIFIED',
    audience VARCHAR(20) DEFAULT 'distributor',
    confidence VARCHAR(20) DEFAULT 'medium',
    require_human_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dayjoy_support_policies (
    policy_id VARCHAR(30) PRIMARY KEY,
    topic TEXT NOT NULL,
    policy_text TEXT NOT NULL,
    source_document TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dayjoy_company_facts (
    id SERIAL PRIMARY KEY,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    source_document TEXT,
    confidence VARCHAR(20) DEFAULT 'high',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dayjoy_conflict_fields (
    id SERIAL PRIMARY KEY,
    field TEXT NOT NULL,
    existing_kb_value TEXT,
    authoritative_pdf_value TEXT,
    source_document TEXT,
    source_page TEXT,
    recommended_action TEXT,
    status VARCHAR(30) DEFAULT 'CONFLICT_UNRESOLVED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMIT;

-- Load data via \copy (must be run with psql, not inside a transaction block)
-- Products
\copy dayjoy_products (product_id, sku, product_name, brand, category, sub_category, manufacturer, country, pack_size, pack_size_alt_formatting, unit, mrp, dp, bv, pv, currency, price_effective_date, pricing_confidence, ingredients, benefits, features, usage, dosage, warnings, storage, target_customer, related_products, alternative_products, cross_sell_products, frequently_bought_together, certifications, search_keywords, faqs, contraindications, description, faq_ids, image_ids, similar_product_ids, related_product_ids, source_document_id, content_source_document, source_version, approval_status, effective_from, effective_to, content_extraction_status, content_confidence, missing_pricing_governance_fields_count, missing_content_fields_count, pricing_risk_level, content_risk_level, verification_status, confidence, last_verified) FROM 'packages/knowledge-base/dayjoy-kb/canonical/products/dayjoy_product_master_canonical.csv' WITH (FORMAT csv, HEADER true, NULL '');

-- Compensation rules
\copy dayjoy_compensation_rules (rule_id, rule_category, rule_text, source_id, source_version, effective_date, verified, verification_status, audience, confidence, notes) FROM 'packages/knowledge-base/dayjoy-kb/canonical/compensation/compensation_rules.csv' WITH (FORMAT csv, HEADER true, NULL '');

-- Support policies
\copy dayjoy_support_policies (policy_id, topic, policy_text, source_document, source_page) FROM 'packages/knowledge-base/dayjoy-kb/canonical/support/support_policies.csv' WITH (FORMAT csv, HEADER true, NULL '');

-- Company facts
\copy dayjoy_company_facts (field, value, source_document, confidence) FROM 'packages/knowledge-base/dayjoy-kb/canonical/company/dayjoy_company_knowledge.csv' WITH (FORMAT csv, HEADER true, NULL '');

-- Flag the 3 CONFLICT_UNRESOLVED compensation fields
INSERT INTO dayjoy_conflict_fields (field, existing_kb_value, authoritative_pdf_value, source_document, source_page, recommended_action, status)
VALUES
    ('retail_profit_rate', 'Up to 30% / 50%', 'UP TO 100% (headline); 20% worked example', 'Dayjoy GrowthX Plan Presentation', '30', 'Needs human decision', 'CONFLICT_UNRESOLVED'),
    ('mentorship_bonus_rate', '100% of binary', '50% of Direct Introduced Distributors BMI', 'Dayjoy GrowthX Plan Presentation', '34', 'Recommend adopting PDF value', 'CONFLICT_UNRESOLVED'),
    ('business_matching_structure', 'Flat Rs 500/pair, daily capping', 'Tiered (Rs 250-1000 by BV level), weekly closing', 'Dayjoy GrowthX Plan Presentation', '33', 'Recommend adopting PDF value', 'CONFLICT_UNRESOLVED')
ON CONFLICT DO NOTHING;

-- Mark compensation rules that mention conflict fields as requiring human review
UPDATE dayjoy_compensation_rules
SET require_human_review = TRUE
WHERE rule_text ILIKE '%retail profit%' OR rule_text ILIKE '%mentorship%' OR rule_text ILIKE '%business matching%';

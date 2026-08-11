-- 022_create_rag_tables_vector.sql
-- Create RAG tables with vector(1536) for pgvector
-- This is the ACTIVE migration that creates the tables the retriever expects

BEGIN;

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- rag_sources
CREATE TABLE IF NOT EXISTS rag_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'document',
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rag_sources_tenant ON rag_sources(tenant_id);

-- rag_documents
CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
    title VARCHAR(1000) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'READY' NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rag_documents_tenant ON rag_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_source ON rag_documents(source_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_status ON rag_documents(status);

-- rag_chunks — WITH vector(1536) column for pgvector
CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_type VARCHAR(50) DEFAULT 'text',
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(1536),
    status VARCHAR(20) DEFAULT 'READY' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tenant ON rag_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_status ON rag_chunks(status);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_metadata ON rag_chunks USING GIN (metadata);

-- HNSW index for vector similarity search (cosine distance)
DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
        ON rag_chunks USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
EXCEPTION WHEN undefined_function THEN
    -- pgvector not installed — skip index creation
    RAISE NOTICE 'pgvector extension not available — HNSW index skipped';
END $$;

-- rag_embeddings (tracking table)
CREATE TABLE IF NOT EXISTS rag_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chunk_id UUID NOT NULL REFERENCES rag_chunks(id) ON DELETE CASCADE,
    model VARCHAR(100) DEFAULT 'text-embedding-3-small',
    dimensions INTEGER DEFAULT 1536,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chunk_id)
);
CREATE INDEX IF NOT EXISTS idx_rag_embeddings_chunk ON rag_embeddings(chunk_id);

-- rag_queries (for analytics)
CREATE TABLE IF NOT EXISTS rag_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    retrieved_chunks JSONB,
    response_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rag_queries_tenant ON rag_queries(tenant_id);

COMMIT;

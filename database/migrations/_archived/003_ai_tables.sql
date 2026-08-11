-- Migration: 003_ai_tables
-- Dayjoy Enterprise AI Platform - AI Tables
-- PostgreSQL 15+

-- 1. Create ChannelType Enum

DO $$ BEGIN
    CREATE TYPE "ChannelType" AS ENUM ('VOICE', 'WHATSAPP', 'WEB', 'API');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create AgentType Enum

DO $$ BEGIN
    CREATE TYPE "AgentType" AS ENUM ('SUPPORT', 'SALES', 'ONBOARDING', 'TECHNICAL', 'BILLING', 'DISTRIBUTOR', 'ADMIN', 'VOICE', 'WHATSAPP', 'WEB');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create MemoryType Enum

DO $$ BEGIN
    CREATE TYPE "MemoryType" AS ENUM ('FACT', 'PREFERENCE', 'HISTORY', 'CONTEXT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. Create AI Agents Table

CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type "AgentType" NOT NULL,
    description TEXT,
    configuration JSONB,
    capabilities JSONB,
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comments
COMMENT ON TABLE ai_agents IS 'AI agent definitions';
COMMENT ON COLUMN ai_agents.type IS 'Agent type: SUPPORT, SALES, etc.';
COMMENT ON COLUMN ai_agents.configuration IS 'Agent configuration (LLM settings, prompts, etc.)';
COMMENT ON COLUMN ai_agents.capabilities IS 'Agent capabilities (tools, integrations)';

-- Indexes
CREATE INDEX IF NOT EXISTS ai_agents_tenant_id_idx ON ai_agents(tenant_id);
CREATE INDEX IF NOT EXISTS ai_agents_type_idx ON ai_agents(type);
CREATE INDEX IF NOT EXISTS ai_agents_status_idx ON ai_agents(status);

-- 5. Create Conversations Table

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    channel "ChannelType" NOT NULL,
    session_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    context JSONB,
    metadata JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comments
COMMENT ON TABLE conversations IS 'AI conversation threads';
COMMENT ON COLUMN conversations.channel IS 'Conversation channel: VOICE, WHATSAPP, WEB, API';
COMMENT ON COLUMN conversations.context IS 'Conversation context (LLM context)';

-- Indexes
CREATE INDEX IF NOT EXISTS conversations_tenant_id_idx ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS conversations_agent_id_idx ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_customer_id_idx ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS conversations_channel_idx ON conversations(channel);
CREATE INDEX IF NOT EXISTS conversations_status_idx ON conversations(status);
CREATE INDEX IF NOT EXISTS conversations_started_at_idx ON conversations(started_at);

-- 6. Create Messages Table

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- user, assistant, system
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text' NOT NULL,
    metadata JSONB,
    tokens_used INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comments
COMMENT ON TABLE messages IS 'Conversation messages';
COMMENT ON COLUMN messages.role IS 'Message role: user, assistant, system';
COMMENT ON COLUMN messages.content_type IS 'Content type: text, markdown, audio, image';
COMMENT ON COLUMN messages.tokens_used IS 'Token count for this message';

-- Indexes
CREATE INDEX IF NOT EXISTS messages_tenant_id_idx ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at);

-- 7. Create AI Memory Table

CREATE TABLE IF NOT EXISTS ai_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    type "MemoryType" NOT NULL,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    importance INTEGER DEFAULT 5,
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comments
COMMENT ON TABLE ai_memory IS 'AI contextual memory storage';
COMMENT ON COLUMN ai_memory.type IS 'Memory type: FACT, PREFERENCE, HISTORY, CONTEXT';
COMMENT ON COLUMN ai_memory.importance IS 'Importance score (1-10)';
COMMENT ON COLUMN ai_memory.key IS 'Memory key (e.g., preferred_language)';
COMMENT ON COLUMN ai_memory.value IS 'Memory value (e.g., English)';

-- Indexes
CREATE INDEX IF NOT EXISTS ai_memory_tenant_id_idx ON ai_memory(tenant_id);
CREATE INDEX IF NOT EXISTS ai_memory_user_id_idx ON ai_memory(user_id);
CREATE INDEX IF NOT EXISTS ai_memory_customer_id_idx ON ai_memory(customer_id);
CREATE INDEX IF NOT EXISTS ai_memory_type_idx ON ai_memory(type);
CREATE INDEX IF NOT EXISTS ai_memory_key_idx ON ai_memory(key);
CREATE INDEX IF NOT EXISTS ai_memory_expires_at_idx ON ai_memory(expires_at);

-- 8. Create RAG Sources Table

CREATE TABLE IF NOT EXISTS rag_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- document, website, database, api, manual
    description TEXT,
    configuration JSONB,
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comments
COMMENT ON TABLE rag_sources IS 'RAG knowledge source definitions';
COMMENT ON COLUMN rag_sources.type IS 'Source type: document, website, database, api, manual';

-- Indexes
CREATE INDEX IF NOT EXISTS rag_sources_tenant_id_idx ON rag_sources(tenant_id);
CREATE INDEX IF NOT EXISTS rag_sources_type_idx ON rag_sources(type);
CREATE INDEX IF NOT EXISTS rag_sources_status_idx ON rag_sources(status);

-- 9. Create RAG Documents Table

CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    metadata JSONB,
    word_count INTEGER,
    status VARCHAR(20) DEFAULT 'processed' NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comments
COMMENT ON TABLE rag_documents IS 'Processed RAG documents';
COMMENT ON COLUMN rag_documents.word_count IS 'Document word count';
COMMENT ON COLUMN rag_documents.status IS 'Document status: pending, processed, error';

-- Indexes
CREATE INDEX IF NOT EXISTS rag_documents_tenant_id_idx ON rag_documents(tenant_id);
CREATE INDEX IF NOT EXISTS rag_documents_source_id_idx ON rag_documents(source_id);
CREATE INDEX IF NOT EXISTS rag_documents_status_idx ON rag_documents(status);
CREATE INDEX IF NOT EXISTS rag_documents_title_idx ON rag_documents USING GIN (to_tsvector('english', title));

-- 10. Create RAG Chunks Table

CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding BYTEA, -- Vector embedding (stored as bytea)
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(document_id, chunk_index)
);

-- Comments
COMMENT ON TABLE rag_chunks IS 'Document chunks for vector retrieval';
COMMENT ON COLUMN rag_chunks.chunk_index IS 'Chunk sequence number';
COMMENT ON COLUMN rag_chunks.embedding IS 'Vector embedding (pgvector)';

-- Indexes
CREATE INDEX IF NOT EXISTS rag_chunks_tenant_id_idx ON rag_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS rag_chunks_document_id_idx ON rag_chunks(document_id);
CREATE INDEX IF NOT EXISTS rag_chunks_chunk_index_idx ON rag_chunks(chunk_index);

-- 11. Create Embeddings Table

CREATE TABLE IF NOT EXISTS embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    embedding BYTEA NOT NULL, -- Vector embedding (stored as bytea)
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comments
COMMENT ON TABLE embeddings IS 'Vector embeddings index';
COMMENT ON COLUMN embeddings.entity_type IS 'Entity type (e.g., rag_chunk, product)';
COMMENT ON COLUMN embeddings.entity_id IS 'Entity identifier';
COMMENT ON COLUMN embeddings.embedding IS 'Vector embedding (1536 dimensions)';

-- Indexes
CREATE INDEX IF NOT EXISTS embeddings_tenant_id_idx ON embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS embeddings_entity_idx ON embeddings(entity_type, entity_id);

-- 12. Enable Row-Level Security (RLS)

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- 13. Create RLS Policies

-- AI Agents
CREATE POLICY ai_agents_tenant_isolation ON ai_agents
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Conversations
CREATE POLICY conversations_tenant_isolation ON conversations
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Messages
CREATE POLICY messages_tenant_isolation ON messages
    FOR ALL
    USING (
        conversation_id IN (
            SELECT id FROM conversations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid
        )
    );

-- AI Memory
CREATE POLICY ai_memory_tenant_isolation ON ai_memory
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- RAG Sources
CREATE POLICY rag_sources_tenant_isolation ON rag_sources
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- RAG Documents
CREATE POLICY rag_documents_tenant_isolation ON rag_documents
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- RAG Chunks
CREATE POLICY rag_chunks_tenant_isolation ON rag_chunks
    FOR ALL
    USING (
        document_id IN (
            SELECT id FROM rag_documents WHERE tenant_id = current_setting('app.current_tenant', true)::uuid
        )
    );

-- Embeddings
CREATE POLICY embeddings_tenant_isolation ON embeddings
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- 14. Apply updated_at Trigger to AI Tables

CREATE TRIGGER update_ai_agents_updated_at
    BEFORE UPDATE ON ai_agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_memory_updated_at
    BEFORE UPDATE ON ai_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rag_sources_updated_at
    BEFORE UPDATE ON rag_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rag_documents_updated_at
    BEFORE UPDATE ON rag_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 15. Create Vector Similarity Search Function (Optional - requires pgvector extension)

-- Note: Uncomment these if you have pgvector extension installed
-- CREATE EXTENSION IF NOT EXISTS vector;

-- CREATE OR REPLACE FUNCTION rag_chunks_similarity(
--     query_embedding vector(1536),
--     match_count INTEGER DEFAULT 5,
--     filter_tenant_id UUID DEFAULT NULL
-- ) RETURNS TABLE(id UUID, document_id UUID, content TEXT, similarity FLOAT) AS $$
-- #variable_conflict use_column
-- BEGIN
--     RETURN QUERY
--     SELECT
--         rag_chunks.id,
--         rag_chunks.document_id,
--         rag_chunks.content,
--         1 - (rag_chunks.embedding::vector <=> query_embedding) AS similarity
--     FROM rag_chunks
--     WHERE filter_tenant_id IS NULL OR rag_chunks.tenant_id = filter_tenant_id
--     ORDER BY rag_chunks.embedding::vector <=> query_embedding
--     LIMIT match_count;
-- END;
-- $$ LANGUAGE plpgsql;

-- 16. Verification Queries (Optional)

-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
--     'ai_agents', 'conversations', 'messages', 'ai_memory', 'rag_sources', 
--     'rag_documents', 'rag_chunks', 'embeddings'
-- ) ORDER BY tablename;

-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND 
--     tablename IN ('ai_agents', 'conversations', 'messages', 'ai_memory', 'rag_sources', 'rag_documents', 'rag_chunks', 'embeddings');

-- End of migration 003_ai_tables
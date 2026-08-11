-- RAG Chunks Table
CREATE TABLE IF NOT EXISTS ai.rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES ai.rag_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),  -- pgvector for similarity search
  metadata JSONB NOT NULL DEFAULT '{}',
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT rag_chunks_unique UNIQUE (document_id, chunk_index)
);

-- Indexes for efficient querying
CREATE INDEX idx_rag_chunks_tenant ON ai.rag_chunks(tenant_id);
CREATE INDEX idx_rag_chunks_document ON ai.rag_chunks(document_id);
CREATE INDEX idx_rag_chunks_content_search ON ai.rag_chunks USING GIN (content gin_trgm_ops);

-- HNSW index for vector similarity search (requires pgvector)
-- CREATE INDEX idx_rag_chunks_embedding ON ai.rag_chunks USING hnsw (embedding vector_cosine_ops);
-- Note: Enable HNSW after creating pgvector extension and setting appropriate parameters

-- Comments
COMMENT ON TABLE ai.rag_chunks IS 'Processed document chunks for RAG retrieval';
COMMENT ON COLUMN ai.rag_chunks.embedding IS 'OpenAI ada-002 embedding (1536 dimensions)';
COMMENT ON COLUMN ai.rag_chunks.metadata IS 'Chunk metadata: heading, paragraphIndex, hasCode, hasTable, etc.';
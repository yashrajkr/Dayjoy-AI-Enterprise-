-- 019_add_hnsw_index.sql
-- Add HNSW index for fast vector similarity search
-- HNSW is faster than IVFFlat for most use cases and doesn't require training

BEGIN;

-- Drop existing IVFFlat index if it exists
DROP INDEX IF EXISTS rag_chunks_embedding_idx;

-- Create HNSW index for cosine distance (most common for text embeddings)
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
  ON rag_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Analyze the table for query planner
ANALYZE rag_chunks;

COMMIT;

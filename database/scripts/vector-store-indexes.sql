-- Vector Store Index Configuration for pgvector
-- Run this after creating the rag_chunks table

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Set HNSW index parameters (tune based on your data size)
-- These should be set BEFORE creating the index
SET hnsw.ef_search = 40;  -- Search depth (higher = more accurate, slower)

-- Create HNSW index for cosine similarity
-- This is the recommended index for production use
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_hnsw
  ON ai.rag_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Alternative: IVFFlat index (faster to build, less accurate)
-- Use this for very large datasets (>1M vectors) during initial build
-- CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_ivfflat
--   ON ai.rag_chunks
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- Create index for BM25 full-text search (for hybrid search)
CREATE INDEX IF NOT EXISTS idx_rag_chunks_content_fts
  ON ai.rag_chunks
  USING GIN (to_tsvector('english', content));

-- Create composite index for filtered searches
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tenant_document
  ON ai.rag_chunks(tenant_id, document_id);

-- Create index for metadata queries
CREATE INDEX IF NOT EXISTS idx_rag_chunks_metadata
  ON ai.rag_chunks USING GIN (metadata);

-- Analyze tables for query planner
ANALYZE ai.rag_chunks;
ANALYZE ai.rag_documents;

-- Comments
COMMENT ON INDEX ai.idx_rag_chunks_embedding_hnsw IS 'HNSW index for vector similarity search (cosine)';
COMMENT ON INDEX ai.idx_rag_chunks_content_fts IS 'GIN index for BM25 full-text search';

-- Performance tuning queries

-- Check index size
SELECT pg_size_pretty(pg_relation_size('ai.idx_rag_chunks_embedding_hnsw')) AS index_size;

-- Check index usage
SELECT 
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_rag_chunks_embedding_hnsw';

-- Vacuum and analyze for optimal performance
VACUUM ANALYZE ai.rag_chunks;

-- For very large datasets, consider partitioning
-- Example: Partition by tenant_id or date
-- CREATE TABLE ai.rag_chunks_partitioned (
--   LIKE ai.rag_chunks INCLUDING ALL
-- ) PARTITION BY LIST (tenant_id);
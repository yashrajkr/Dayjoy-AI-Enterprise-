-- 026_add_rag_chunks_chunk_index.sql
-- Fixes schema drift: KnowledgeService (backend/knowledge/knowledge.service.ts) and
-- the broader rag/* pipeline (ingestion, retrieval, evaluation, admin dashboard UI)
-- all require RagChunk.chunkIndex (Prisma @map("chunk_index")) to order chunks
-- within a document, but 022_create_rag_tables_vector.sql never created that
-- column. This left database/prisma/schema.prisma out of sync with the deployed
-- table, breaking every default-select Prisma query against rag_chunks (including
-- KnowledgeService.query()'s text-search fallback and the search_knowledge tool).
--
-- Additive only: adds the column, backfills existing rows deterministically
-- (ordered by created_at, id, 0-indexed per document), then enforces NOT NULL.
-- No rows are deleted, no other tables are touched.
--
-- Applied directly to Supabase project mukscvaqnhtftyoyuvzx via the Supabase MCP
-- apply_migration tool (name: add_chunk_index_to_rag_chunks) on 2026-08-15;
-- mirrored here so the SQL migration history in this repo stays authoritative
-- for fresh deployments.

BEGIN;

ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS chunk_index INTEGER;

UPDATE rag_chunks rc
SET chunk_index = sub.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY created_at, id) AS rn
  FROM rag_chunks
) sub
WHERE rc.id = sub.id
  AND rc.chunk_index IS NULL;

ALTER TABLE rag_chunks ALTER COLUMN chunk_index SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rag_chunks_document_chunk_index
  ON rag_chunks(document_id, chunk_index);

COMMIT;

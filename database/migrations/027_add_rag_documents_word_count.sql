-- 027_add_rag_documents_word_count.sql
-- Fixes schema drift: KnowledgeService (backend/knowledge/knowledge.service.ts)
-- writes/reads RagDocument.wordCount (Prisma @map("word_count")) on ingest,
-- but 022_create_rag_tables_vector.sql never created that column, breaking
-- any Prisma query with `include: { document: true }` (e.g. the
-- KnowledgeService.query() text-search fallback / search_knowledge tool).
--
-- Additive only: nullable INTEGER, backfilled for existing rows using the
-- same whitespace-split word-count algorithm KnowledgeService uses. No rows
-- deleted, no other tables touched.
--
-- Applied directly to Supabase project mukscvaqnhtftyoyuvzx via the Supabase
-- MCP apply_migration tool (name: add_word_count_to_rag_documents) on
-- 2026-08-15; mirrored here for the repo's SQL migration history.

BEGIN;

ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS word_count INTEGER;

UPDATE rag_documents
SET word_count = CASE
  WHEN content IS NULL OR trim(content) = '' THEN 0
  ELSE array_length(regexp_split_to_array(trim(content), '\s+'), 1)
END
WHERE word_count IS NULL;

COMMIT;

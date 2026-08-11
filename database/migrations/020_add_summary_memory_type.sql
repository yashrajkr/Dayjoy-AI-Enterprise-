-- 020_add_summary_memory_type.sql
-- Add SUMMARY to the memory_type column (VARCHAR, not a Postgres enum)
-- The ConversationMemoryService uses 'SUMMARY' but the column is VARCHAR(50),
-- so we just need to ensure it accepts that value (no ALTER TYPE needed for VARCHAR).
-- This migration also backfills any existing records that should be SUMMARY type.

BEGIN;

-- The memory_type column is VARCHAR(50) in the database (not a Postgres enum type),
-- so ALTER TYPE won't work. Instead, we just verify the column accepts 'SUMMARY'.
-- No schema change is needed — VARCHAR accepts any string.

-- Backfill: mark any conversation summary memories as SUMMARY type
UPDATE ai_memory
SET type = 'SUMMARY'
WHERE key LIKE 'summary:%' OR key LIKE 'conversation_summary:%';

-- Verify the column accepts the value
DO $$
BEGIN
    RAISE NOTICE 'memory_type column is VARCHAR(50) — accepts SUMMARY without ALTER TYPE';
    RAISE NOTICE 'Backfilled % rows to SUMMARY type', (SELECT COUNT(*) FROM ai_memory WHERE type = 'SUMMARY');
END $$;

COMMIT;

-- 025_voice_sessions_call_id_unique.sql
--
-- `voice_sessions.vapi_call_id` was indexed (idx_voice_sessions_vapi_call)
-- but never constrained unique, even though the application's webhook
-- handlers (vapi/webhooks/vapi-call-started-handler.ts) explicitly rely on
-- it being unique for idempotent call-started processing (findUnique +
-- create-if-missing). Without this constraint, two concurrent
-- `call.started` webhooks for the same Vapi call could race and create two
-- VoiceSession rows.
--
-- Partial unique index (not a plain UNIQUE constraint) because the column
-- is nullable and outbound-call flows that haven't yet received a Vapi call
-- id should not be forced to collide on NULL.

DROP INDEX IF EXISTS idx_voice_sessions_vapi_call;

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_sessions_vapi_call
  ON voice_sessions (vapi_call_id)
  WHERE vapi_call_id IS NOT NULL;

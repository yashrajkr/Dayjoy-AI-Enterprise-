-- Reconcile production DB with schema.prisma: the DB was originally created
-- via manual/raw SQL, never through `prisma migrate`, so none of the 30
-- Postgres enum types Prisma expects existed — every enum-typed column was
-- left as plain varchar. This broke every write that touched one (Prisma
-- generates `value::"EnumName"` casts). All tables touched below were
-- verified empty (0 rows) except `tenants` (1 row, value 'ACTIVE' —
-- compatible), so these conversions are safe. No data is dropped or lost.

BEGIN;

-- Reuse the existing `order_status` enum (already correct values) instead of
-- creating a duplicate — just rename it to match Prisma's expected identifier.
ALTER TYPE "order_status" RENAME TO "OrderStatus";

-- ---- Create all other missing enum types (additive only) ----
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS');
CREATE TYPE "DistributorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_PAID', 'REFUNDED', 'FAILED');
CREATE TYPE "InventoryTxnReason" AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'TRANSFER', 'RESERVATION', 'RELEASE');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST', 'DELETED');
CREATE TYPE "InteractionType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'MESSAGE', 'NOTE', 'OTHER');
CREATE TYPE "WorkflowType" AS ENUM ('BUSINESS', 'AI', 'INTEGRATION', 'NOTIFICATION');
CREATE TYPE "WorkflowStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DRAFT', 'ARCHIVED');
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "NotificationType" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP');
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "ChannelType" AS ENUM ('VOICE', 'WHATSAPP', 'WEB', 'API');
CREATE TYPE "AgentType" AS ENUM ('SUPPORT', 'SALES', 'ONBOARDING', 'TECHNICAL', 'BILLING', 'DISTRIBUTOR', 'ADMIN', 'VOICE', 'WHATSAPP', 'WEB');
CREATE TYPE "MemoryType" AS ENUM ('FACT', 'PREFERENCE', 'HISTORY', 'CONTEXT', 'SUMMARY');
CREATE TYPE "MetricType" AS ENUM ('COUNT', 'SUM', 'AVERAGE', 'PERCENTAGE', 'RATIO');
CREATE TYPE "MetricUnit" AS ENUM ('NUMBER', 'PERCENT', 'CURRENCY', 'DURATION');
CREATE TYPE "AuditAction" AS ENUM ('INSERT', 'UPDATE', 'DELETE');
CREATE TYPE "VoiceCallStatus" AS ENUM ('INITIATED', 'RINGING', 'IN_PROGRESS', 'ENDED', 'FAILED', 'CANCELLED');
CREATE TYPE "VoiceCallDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "VoiceCallOutcome" AS ENUM ('COMPLETED', 'TRANSFERRED', 'ABANDONED', 'FAILED', 'VOICEMAIL');
CREATE TYPE "TranscriptRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE "WhatsAppMessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'TEMPLATE', 'INTERACTIVE', 'LOCATION', 'CONTACTS');
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED');
CREATE TYPE "WhatsAppDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "NotificationProvider" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP', 'WEBHOOK');

-- ---- Convert existing varchar columns to their proper enum types ----
-- (every table below verified empty except tenants, which is compatible)

ALTER TABLE tenants ALTER COLUMN status DROP DEFAULT;
ALTER TABLE tenants ALTER COLUMN status TYPE "TenantStatus" USING status::"TenantStatus";
ALTER TABLE tenants ALTER COLUMN status SET DEFAULT 'ACTIVE'::"TenantStatus";

ALTER TABLE users ALTER COLUMN status DROP DEFAULT;
ALTER TABLE users ALTER COLUMN status TYPE "UserStatus" USING status::"UserStatus";
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'ACTIVE'::"UserStatus";

ALTER TABLE customers ALTER COLUMN customer_type DROP DEFAULT;
ALTER TABLE customers ALTER COLUMN customer_type TYPE "CustomerType" USING customer_type::"CustomerType";
ALTER TABLE customers ALTER COLUMN customer_type SET DEFAULT 'INDIVIDUAL'::"CustomerType";

ALTER TABLE distributors ALTER COLUMN status DROP DEFAULT;
ALTER TABLE distributors ALTER COLUMN status TYPE "DistributorStatus" USING status::"DistributorStatus";
ALTER TABLE distributors ALTER COLUMN status SET DEFAULT 'ACTIVE'::"DistributorStatus";

ALTER TABLE products ALTER COLUMN status DROP DEFAULT;
ALTER TABLE products ALTER COLUMN status TYPE "ProductStatus" USING status::"ProductStatus";
ALTER TABLE products ALTER COLUMN status SET DEFAULT 'ACTIVE'::"ProductStatus";

ALTER TABLE inventory_transactions ALTER COLUMN reason TYPE "InventoryTxnReason" USING reason::"InventoryTxnReason";

ALTER TABLE leads ALTER COLUMN status DROP DEFAULT;
ALTER TABLE leads ALTER COLUMN status TYPE "LeadStatus" USING status::"LeadStatus";
ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'NEW'::"LeadStatus";

ALTER TABLE interactions ALTER COLUMN type TYPE "InteractionType" USING type::"InteractionType";

ALTER TABLE workflows ALTER COLUMN type TYPE "WorkflowType" USING type::"WorkflowType";
ALTER TABLE workflows ALTER COLUMN status DROP DEFAULT;
ALTER TABLE workflows ALTER COLUMN status TYPE "WorkflowStatus" USING status::"WorkflowStatus";
ALTER TABLE workflows ALTER COLUMN status SET DEFAULT 'DRAFT'::"WorkflowStatus";

ALTER TABLE workflow_executions ALTER COLUMN status DROP DEFAULT;
ALTER TABLE workflow_executions ALTER COLUMN status TYPE "ExecutionStatus" USING status::"ExecutionStatus";
ALTER TABLE workflow_executions ALTER COLUMN status SET DEFAULT 'RUNNING'::"ExecutionStatus";

-- Two partial indexes have a predicate on `status` cast to text
-- (`WHERE (status)::text = 'QUEUED'::text`) — Postgres can't verify that
-- predicate stays IMMUTABLE across a column type change, so drop + recreate
-- them around the ALTER (recreated using the enum literal directly, which
-- also avoids the ::text cast going forward).
DROP INDEX IF EXISTS idx_notifications_scheduled;
DROP INDEX IF EXISTS idx_notifications_status_scheduled_created;

ALTER TABLE notifications ALTER COLUMN type TYPE "NotificationType" USING type::"NotificationType";
ALTER TABLE notifications ALTER COLUMN priority DROP DEFAULT;
ALTER TABLE notifications ALTER COLUMN priority TYPE "NotificationPriority" USING priority::"NotificationPriority";
ALTER TABLE notifications ALTER COLUMN priority SET DEFAULT 'NORMAL'::"NotificationPriority";
ALTER TABLE notifications ALTER COLUMN status DROP DEFAULT;
-- existing default 'QUEUED' isn't a valid NotificationStatus value (table is
-- empty) — reset to Prisma's actual default, PENDING.
ALTER TABLE notifications ALTER COLUMN status TYPE "NotificationStatus" USING 'PENDING'::"NotificationStatus";
ALTER TABLE notifications ALTER COLUMN status SET DEFAULT 'PENDING'::"NotificationStatus";

-- 'QUEUED' has no direct equivalent in NotificationStatus (PENDING, SENDING,
-- SENT, FAILED, CANCELLED) — PENDING is the closest semantic match
-- (not-yet-sent).
CREATE INDEX idx_notifications_scheduled ON public.notifications USING btree (scheduled_at) WHERE (status = 'PENDING'::"NotificationStatus" AND scheduled_at IS NOT NULL);
CREATE INDEX idx_notifications_status_scheduled_created ON public.notifications USING btree (status, scheduled_at, created_at) WHERE (status = 'PENDING'::"NotificationStatus");

ALTER TABLE notification_logs ALTER COLUMN provider TYPE "NotificationProvider" USING provider::"NotificationProvider";

ALTER TABLE metrics ALTER COLUMN type TYPE "MetricType" USING type::"MetricType";
ALTER TABLE metrics ALTER COLUMN unit TYPE "MetricUnit" USING unit::"MetricUnit";

ALTER TABLE audit_logs ALTER COLUMN action TYPE "AuditAction" USING action::"AuditAction";

ALTER TABLE ai_agents ALTER COLUMN type TYPE "AgentType" USING type::"AgentType";

ALTER TABLE conversations ALTER COLUMN channel TYPE "ChannelType" USING channel::"ChannelType";

ALTER TABLE ai_memory ALTER COLUMN type TYPE "MemoryType" USING type::"MemoryType";

-- trg_voice_sessions_ended_at fires BEFORE UPDATE OF status — Postgres
-- refuses to change the type of a column referenced by a trigger's column
-- list, so drop + recreate it identically around the ALTER.
DROP TRIGGER IF EXISTS trg_voice_sessions_ended_at ON voice_sessions;

ALTER TABLE voice_sessions ALTER COLUMN status DROP DEFAULT;
ALTER TABLE voice_sessions ALTER COLUMN status TYPE "VoiceCallStatus" USING status::"VoiceCallStatus";
ALTER TABLE voice_sessions ALTER COLUMN status SET DEFAULT 'INITIATED'::"VoiceCallStatus";
ALTER TABLE voice_sessions ALTER COLUMN direction TYPE "VoiceCallDirection" USING direction::"VoiceCallDirection";
ALTER TABLE voice_sessions ALTER COLUMN outcome TYPE "VoiceCallOutcome" USING outcome::"VoiceCallOutcome";

CREATE TRIGGER trg_voice_sessions_ended_at BEFORE UPDATE OF status ON public.voice_sessions FOR EACH ROW EXECUTE FUNCTION set_voice_session_ended_at();

ALTER TABLE voice_transcripts ALTER COLUMN role TYPE "TranscriptRole" USING role::"TranscriptRole";

ALTER TABLE whatsapp_messages ALTER COLUMN type TYPE "WhatsAppMessageType" USING type::"WhatsAppMessageType";
ALTER TABLE whatsapp_messages ALTER COLUMN status DROP DEFAULT;
ALTER TABLE whatsapp_messages ALTER COLUMN status TYPE "WhatsAppMessageStatus" USING status::"WhatsAppMessageStatus";
ALTER TABLE whatsapp_messages ALTER COLUMN status SET DEFAULT 'QUEUED'::"WhatsAppMessageStatus";
ALTER TABLE whatsapp_messages ALTER COLUMN direction TYPE "WhatsAppDirection" USING direction::"WhatsAppDirection";

-- ---- Seed one default AI agent per tenant so Conversation/AiMemory rows
-- (which require a non-null agentId FK) can actually be created. Without
-- this, real conversation/memory persistence is impossible even with the
-- enum types fixed, since ai_agents had zero rows.
INSERT INTO ai_agents (id, tenant_id, name, type, status, description)
SELECT gen_random_uuid(), id, 'Dayjoy Voice Assistant', 'VOICE'::"AgentType", 'active', 'Default voice agent (Vapi) — auto-seeded'
FROM tenants
WHERE NOT EXISTS (SELECT 1 FROM ai_agents WHERE ai_agents.tenant_id = tenants.id);

COMMIT;

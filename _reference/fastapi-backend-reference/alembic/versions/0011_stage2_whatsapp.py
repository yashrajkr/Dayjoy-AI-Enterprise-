"""stage 2 step 5: enterprise whatsapp ai platform

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-16 00:11:00.000000

Stage 2 Step 5 — Enterprise WhatsApp AI Platform:
- whatsapp_accounts (Meta Business Account credentials, per-tenant)
- whatsapp_numbers (phone numbers linked to accounts)
- whatsapp_sessions (conversations, 24h window)
- whatsapp_messages (all message types)
- whatsapp_media (uploaded/downloaded files)
- whatsapp_templates (Meta-approved message templates)
- whatsapp_analytics (daily aggregates)
- whatsapp_webhooks (inbound webhook audit trail)
- whatsapp_handoffs (human handoff requests)

Tenant isolation: every table has organization_id + composite indexes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== WhatsApp Accounts =====
    op.create_table(
        "whatsapp_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("business_account_id", sa.String(100), nullable=False),
        sa.Column("app_id", sa.String(100), nullable=True),
        sa.Column("app_secret", sa.String(255), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("access_token_ref", sa.String(255), nullable=True),
        sa.Column("verify_token", sa.String(255), nullable=False),
        sa.Column("webhook_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("business_name", sa.String(255), nullable=True),
        sa.Column("business_category", sa.String(100), nullable=True),
        sa.Column("business_description", sa.Text(), nullable=True),
        sa.Column("ai_provider", sa.String(50), nullable=True),
        sa.Column("ai_model", sa.String(100), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("greeting_message", sa.Text(), nullable=False),
        sa.Column("fallback_message", sa.Text(), nullable=False),
        sa.Column("enable_rag", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("rag_categories", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("enable_typing_indicator", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("enable_human_handoff", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("auto_reply_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("business_hours", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("timezone", sa.String(50), server_default="UTC", nullable=False),
        sa.Column("escalation_phone", sa.String(20), nullable=True),
        sa.Column("escalation_threshold", sa.Float(), server_default="0.4", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_whatsapp_accounts_org_active", "whatsapp_accounts", ["organization_id", "is_active"])

    # ===== WhatsApp Numbers =====
    op.create_table(
        "whatsapp_numbers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phone_number_id", sa.String(100), nullable=False),
        sa.Column("display_phone_number", sa.String(20), nullable=False),
        sa.Column("display_name", sa.String(255), server_default="WhatsApp Line", nullable=False),
        sa.Column("quality_rating", sa.String(20), nullable=True),
        sa.Column("quality_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("messaging_limit_tier", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_whatsapp_numbers_org_active", "whatsapp_numbers", ["organization_id", "is_active"])
    op.create_index("ix_whatsapp_numbers_account", "whatsapp_numbers", ["account_id"])

    # ===== WhatsApp Sessions =====
    op.create_table(
        "whatsapp_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("whatsapp_numbers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("customer_phone", sa.String(20), nullable=False),
        sa.Column("customer_name", sa.String(255), nullable=True),
        sa.Column("ai_conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.Column("started_by", sa.String(20), server_default="customer", nullable=False),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("inbound_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("outbound_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_response_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("human_response_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("avg_ai_latency_ms", sa.Integer(), nullable=True),
        sa.Column("ai_confidence_avg", sa.Float(), nullable=True),
        sa.Column("low_confidence_turns", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_escalated", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("escalated_to", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("escalation_reason", sa.String(255), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("summary_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(50), nullable=True),
        sa.Column("sentiment", sa.String(20), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rag_used", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("rag_citations_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rag_fallback_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_whatsapp_sessions_org_status", "whatsapp_sessions", ["organization_id", "status"])
    op.create_index("ix_whatsapp_sessions_org_customer", "whatsapp_sessions", ["organization_id", "customer_phone"])
    op.create_index("ix_whatsapp_sessions_org_started", "whatsapp_sessions", ["organization_id", "started_at"])

    # ===== WhatsApp Messages =====
    op.create_table(
        "wa_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("number_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("wa_message_id", sa.String(255), nullable=True),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("from_number", sa.String(20), nullable=False),
        sa.Column("to_number", sa.String(20), nullable=False),
        sa.Column("message_type", sa.String(50), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("location_name", sa.String(255), nullable=True),
        sa.Column("location_address", sa.Text(), nullable=True),
        sa.Column("interactive_type", sa.String(50), nullable=True),
        sa.Column("interactive_payload", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("template_name", sa.String(100), nullable=True),
        sa.Column("template_language", sa.String(10), nullable=True),
        sa.Column("template_components", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("contacts", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("reaction_emoji", sa.String(20), nullable=True),
        sa.Column("reaction_target_message_id", sa.String(255), nullable=True),
        sa.Column("is_ai_response", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("ai_latency_ms", sa.Integer(), nullable=True),
        sa.Column("ai_model", sa.String(100), nullable=True),
        sa.Column("ai_citations", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("ai_rag_used", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("ai_was_fallback", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("delivery_status", sa.String(20), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivery_error_code", sa.String(100), nullable=True),
        sa.Column("delivery_error_message", sa.Text(), nullable=True),
        sa.Column("reply_to_message_id", sa.String(255), nullable=True),
        sa.Column("wa_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_wa_messages_session", "wa_messages", ["session_id"])
    op.create_index("ix_wa_messages_org_created", "wa_messages", ["organization_id", "created_at"])
    op.create_index("ix_wa_messages_wa_id", "wa_messages", ["wa_message_id"])

    # ===== WhatsApp Media =====
    op.create_table(
        "whatsapp_media",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wa_media_id", sa.String(255), nullable=False),
        sa.Column("media_type", sa.String(50), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_extension", sa.String(10), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("meta_url", sa.Text(), nullable=True),
        sa.Column("meta_url_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stored_url", sa.Text(), nullable=True),
        sa.Column("storage_provider", sa.String(50), nullable=True),
        sa.Column("stored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("direction", sa.String(20), server_default="downloaded", nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_whatsapp_media_org_created", "whatsapp_media", ["organization_id", "created_at"])

    # ===== WhatsApp Templates =====
    op.create_table(
        "whatsapp_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("wa_template_id", sa.String(255), nullable=True),
        sa.Column("category", sa.String(50), server_default="MARKETING", nullable=False),
        sa.Column("body_text", sa.Text(), nullable=False),
        sa.Column("body_params", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("header_type", sa.String(20), nullable=True),
        sa.Column("header_text", sa.Text(), nullable=True),
        sa.Column("header_media_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("footer_text", sa.String(60), nullable=True),
        sa.Column("buttons", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("status_reason", sa.Text(), nullable=True),
        sa.Column("quality_rating", sa.String(20), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_whatsapp_templates_org_name", "whatsapp_templates", ["organization_id", "name"])
    op.create_index("ix_whatsapp_templates_org_status", "whatsapp_templates", ["organization_id", "status"])

    # ===== WhatsApp Analytics =====
    op.create_table(
        "whatsapp_analytics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_conversations", sa.Integer(), server_default="0", nullable=False),
        sa.Column("new_conversations", sa.Integer(), server_default="0", nullable=False),
        sa.Column("resolved_conversations", sa.Integer(), server_default="0", nullable=False),
        sa.Column("escalated_conversations", sa.Integer(), server_default="0", nullable=False),
        sa.Column("inbound_messages", sa.Integer(), server_default="0", nullable=False),
        sa.Column("outbound_messages", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_messages", sa.Integer(), server_default="0", nullable=False),
        sa.Column("human_messages", sa.Integer(), server_default="0", nullable=False),
        sa.Column("delivered_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("read_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_resolution_rate", sa.Float(), nullable=True),
        sa.Column("ai_avg_latency_ms", sa.Integer(), nullable=True),
        sa.Column("ai_avg_confidence", sa.Float(), nullable=True),
        sa.Column("ai_fallback_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("human_handoff_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("human_handoff_rate", sa.Float(), nullable=True),
        sa.Column("avg_handoff_time_ms", sa.Integer(), nullable=True),
        sa.Column("rag_used_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rag_citations_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rag_success_rate", sa.Float(), nullable=True),
        sa.Column("satisfaction_score", sa.Float(), nullable=True),
        sa.Column("satisfaction_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_whatsapp_analytics_org_date", "whatsapp_analytics", ["organization_id", "date"])
    op.create_index("ix_whatsapp_analytics_org_account", "whatsapp_analytics", ["organization_id", "account_id"])

    # ===== WhatsApp Webhooks =====
    op.create_table(
        "whatsapp_webhooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("headers", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("body", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("raw_body", sa.Text(), nullable=True),
        sa.Column("signature_valid", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("signature_header", sa.Text(), nullable=True),
        sa.Column("verification_error", sa.Text(), nullable=True),
        sa.Column("processed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_error", sa.Text(), nullable=True),
        sa.Column("processing_result", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_ip", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_whatsapp_webhooks_org_created", "whatsapp_webhooks", ["organization_id", "created_at"])
    op.create_index("ix_whatsapp_webhooks_type", "whatsapp_webhooks", ["event_type"])

    # ===== WhatsApp Handoffs =====
    op.create_table(
        "whatsapp_handoffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.String(100), nullable=False),
        sa.Column("reason_details", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("ai_last_message", sa.Text(), nullable=True),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("satisfaction_score", sa.Integer(), nullable=True),
        sa.Column("response_time_ms", sa.Integer(), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_whatsapp_handoffs_org_status", "whatsapp_handoffs", ["organization_id", "status"])
    op.create_index("ix_whatsapp_handoffs_session", "whatsapp_handoffs", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_handoffs_session", table_name="whatsapp_handoffs")
    op.drop_index("ix_whatsapp_handoffs_org_status", table_name="whatsapp_handoffs")
    op.drop_table("whatsapp_handoffs")

    op.drop_index("ix_whatsapp_webhooks_type", table_name="whatsapp_webhooks")
    op.drop_index("ix_whatsapp_webhooks_org_created", table_name="whatsapp_webhooks")
    op.drop_table("whatsapp_webhooks")

    op.drop_index("ix_whatsapp_analytics_org_account", table_name="whatsapp_analytics")
    op.drop_index("ix_whatsapp_analytics_org_date", table_name="whatsapp_analytics")
    op.drop_table("whatsapp_analytics")

    op.drop_index("ix_whatsapp_templates_org_status", table_name="whatsapp_templates")
    op.drop_index("ix_whatsapp_templates_org_name", table_name="whatsapp_templates")
    op.drop_table("whatsapp_templates")

    op.drop_index("ix_whatsapp_media_org_created", table_name="whatsapp_media")
    op.drop_table("whatsapp_media")

    op.drop_index("ix_wa_messages_wa_id", table_name="wa_messages")
    op.drop_index("ix_wa_messages_org_created", table_name="wa_messages")
    op.drop_index("ix_wa_messages_session", table_name="wa_messages")
    op.drop_table("wa_messages")

    op.drop_index("ix_whatsapp_sessions_org_started", table_name="whatsapp_sessions")
    op.drop_index("ix_whatsapp_sessions_org_customer", table_name="whatsapp_sessions")
    op.drop_index("ix_whatsapp_sessions_org_status", table_name="whatsapp_sessions")
    op.drop_table("whatsapp_sessions")

    op.drop_index("ix_whatsapp_numbers_account", table_name="whatsapp_numbers")
    op.drop_index("ix_whatsapp_numbers_org_active", table_name="whatsapp_numbers")
    op.drop_table("whatsapp_numbers")

    op.drop_index("ix_whatsapp_accounts_org_active", table_name="whatsapp_accounts")
    op.drop_table("whatsapp_accounts")

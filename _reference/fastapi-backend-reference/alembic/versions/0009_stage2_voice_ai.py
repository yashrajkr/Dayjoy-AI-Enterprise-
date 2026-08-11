"""stage 2 step 3: enterprise voice ai platform

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-16 00:09:00.000000

Stage 2 Step 3 — Enterprise Voice AI Platform Integration:
- voice_assistants (per-tenant assistant configurations)
- voice_settings (per-tenant global voice config)
- voice_sessions (live + historical call sessions)
- voice_messages (streaming transcript segments)
- voice_analytics (per-call aggregate metrics)
- voice_providers (registered provider configurations)
- call_events (granular event log)
- voice_webhook_logs (inbound webhook audit trail)

Tenant isolation: every table has organization_id + composite indexes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== Voice Assistants =====
    op.create_table(
        "voice_assistants",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("assistant_type", sa.String(50), server_default="support", nullable=False, index=True),
        sa.Column("greeting", sa.Text(), nullable=False),
        sa.Column("fallback_message", sa.Text(), nullable=False),
        sa.Column("end_of_call_message", sa.Text(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("voice", sa.String(100), server_default="aria", nullable=False),
        sa.Column("voice_provider", sa.String(50), server_default="11labs", nullable=False),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("temperature", sa.Float(), server_default="0.7", nullable=False),
        sa.Column("max_tokens", sa.Integer(), server_default="500", nullable=False),
        sa.Column("stt_provider", sa.String(50), server_default="deepgram", nullable=False),
        sa.Column("tts_provider", sa.String(50), server_default="11labs", nullable=False),
        sa.Column("ai_provider", sa.String(50), nullable=True),
        sa.Column("ai_model", sa.String(100), nullable=True),
        sa.Column("enable_rag", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("rag_categories", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("enable_barge_in", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("enable_vad", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("silence_timeout_seconds", sa.Integer(), server_default="30", nullable=False),
        sa.Column("max_call_duration", sa.Integer(), server_default="1800", nullable=False),
        sa.Column("max_turns", sa.Integer(), server_default="100", nullable=False),
        sa.Column("escalation_phone", sa.String(20), nullable=True),
        sa.Column("escalation_threshold", sa.Float(), server_default="0.4", nullable=False),
        sa.Column("business_hours", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("provider", sa.String(50), server_default="vapi", nullable=False),
        sa.Column("provider_assistant_id", sa.String(255), nullable=True, index=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_voice_assistants_org_active",
        "voice_assistants",
        ["organization_id", "is_active"],
    )
    op.create_index(
        "ix_voice_assistants_org_type",
        "voice_assistants",
        ["organization_id", "assistant_type"],
    )

    # ===== Voice Settings =====
    op.create_table(
        "voice_settings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("provider", sa.String(50), server_default="vapi", nullable=False),
        sa.Column(
            "default_assistant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("voice_assistants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("provider_config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("inbound_phone_numbers", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("outbound_phone_number", sa.String(20), nullable=True),
        sa.Column("default_voice", sa.String(100), server_default="aria", nullable=False),
        sa.Column("default_language", sa.String(10), server_default="en", nullable=False),
        sa.Column("default_stt_provider", sa.String(50), server_default="deepgram", nullable=False),
        sa.Column("default_tts_provider", sa.String(50), server_default="11labs", nullable=False),
        sa.Column("webhook_url", sa.Text(), nullable=True),
        sa.Column("webhook_secret", sa.String(255), nullable=True),
        sa.Column("enable_recording", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("enable_transcription", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("enable_sentiment_analysis", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("enable_barge_in", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("max_call_duration", sa.Integer(), server_default="1800", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_voice_settings_org",
        "voice_settings",
        ["organization_id"],
        unique=True,
    )

    # ===== Voice Sessions =====
    op.create_table(
        "voice_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "assistant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("voice_assistants.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("ai_conversation_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("provider", sa.String(50), server_default="vapi", nullable=False),
        sa.Column("call_sid", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("provider_assistant_id", sa.String(255), nullable=True),
        sa.Column("direction", sa.String(20), server_default="inbound", nullable=False),
        sa.Column("caller_phone", sa.String(20), nullable=True, index=True),
        sa.Column("callee_phone", sa.String(20), nullable=True),
        sa.Column("caller_name", sa.String(255), nullable=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="ringing", nullable=False, index=True),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("wait_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_talk_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("customer_talk_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("silence_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("overlap_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("turn_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("interruption_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("barge_in_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("recording_url", sa.Text(), nullable=True),
        sa.Column("recording_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("consent_obtained", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("transcript_url", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("summary_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(50), nullable=True),
        sa.Column("sentiment", sa.String(20), nullable=True),
        sa.Column("satisfaction_score", sa.Integer(), nullable=True),
        sa.Column("transferred_to", sa.String(20), nullable=True),
        sa.Column("transferred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transfer_reason", sa.String(255), nullable=True),
        sa.Column("cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("hangup_cause", sa.String(100), nullable=True),
        sa.Column("hangup_by", sa.String(20), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_voice_sessions_org_status",
        "voice_sessions",
        ["organization_id", "status"],
    )
    op.create_index(
        "ix_voice_sessions_org_started",
        "voice_sessions",
        ["organization_id", "started_at"],
    )

    # ===== Voice Messages =====
    op.create_table(
        "voice_messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("voice_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("speaker", sa.String(20), nullable=False, index=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_partial", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_final", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("interrupted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("interrupted_by", sa.String(20), nullable=True),
        sa.Column("start_time", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("end_time", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("latency_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("stt_confidence", sa.Float(), nullable=True),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("tokens_in", sa.Integer(), server_default="0", nullable=False),
        sa.Column("tokens_out", sa.Integer(), server_default="0", nullable=False),
        sa.Column("citations", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("retrieved_chunks", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("tool_calls", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("audio_url", sa.Text(), nullable=True),
        sa.Column("audio_duration_seconds", sa.Float(), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_voice_messages_session_seq",
        "voice_messages",
        ["session_id", "sequence"],
    )
    op.create_index(
        "ix_voice_messages_session_speaker",
        "voice_messages",
        ["session_id", "speaker"],
    )

    # ===== Voice Analytics =====
    op.create_table(
        "voice_analytics",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("voice_sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("assistant_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("avg_stt_latency_ms", sa.Integer(), nullable=True),
        sa.Column("avg_ai_latency_ms", sa.Integer(), nullable=True),
        sa.Column("avg_tts_latency_ms", sa.Integer(), nullable=True),
        sa.Column("avg_total_latency_ms", sa.Integer(), nullable=True),
        sa.Column("max_ai_latency_ms", sa.Integer(), nullable=True),
        sa.Column("p95_ai_latency_ms", sa.Integer(), nullable=True),
        sa.Column("ai_talk_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("customer_talk_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("silence_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("overlap_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("talk_ratio", sa.Float(), nullable=True),
        sa.Column("turn_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("interruption_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("barge_in_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("avg_stt_confidence", sa.Float(), nullable=True),
        sa.Column("avg_ai_confidence", sa.Float(), nullable=True),
        sa.Column("low_confidence_turns", sa.Integer(), server_default="0", nullable=False),
        sa.Column("outcome", sa.String(50), nullable=True),
        sa.Column("was_escalated", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("was_transferred", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("was_resolved", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("satisfaction_score", sa.Integer(), nullable=True),
        sa.Column("rag_used", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("rag_citations_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rag_fallback_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_tokens_in", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_tokens_out", sa.Integer(), server_default="0", nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("stt_provider", sa.String(50), nullable=True),
        sa.Column("tts_provider", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_voice_analytics_org_started",
        "voice_analytics",
        ["organization_id", "started_at"],
    )

    # ===== Voice Providers =====
    op.create_table(
        "voice_providers",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("provider_type", sa.String(50), nullable=False, index=True),
        sa.Column("credentials", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("phone_number", sa.String(20), nullable=True),
        sa.Column("phone_number_id", sa.String(255), nullable=True),
        sa.Column("webhook_url", sa.Text(), nullable=True),
        sa.Column("webhook_secret", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_health_check_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_health_check_status", sa.String(20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_voice_providers_org_name",
        "voice_providers",
        ["organization_id", "name"],
    )

    # ===== Call Events =====
    op.create_table(
        "call_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("voice_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False, index=True),
        sa.Column("payload", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("timestamp_offset", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("severity", sa.String(20), server_default="info", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_call_events_session_seq",
        "call_events",
        ["session_id", "sequence"],
    )
    op.create_index(
        "ix_call_events_org_type",
        "call_events",
        ["organization_id", "event_type"],
    )

    # ===== Voice Webhook Logs =====
    op.create_table(
        "voice_webhook_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("provider", sa.String(50), nullable=False, index=True),
        sa.Column("event_type", sa.String(100), nullable=False, index=True),
        sa.Column("call_sid", sa.String(255), nullable=True, index=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("headers", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("body", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("raw_body", sa.Text(), nullable=True),
        sa.Column("signature_valid", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("signature_header", sa.Text(), nullable=True),
        sa.Column("verification_error", sa.Text(), nullable=True),
        sa.Column("processed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_error", sa.Text(), nullable=True),
        sa.Column("response_status", sa.Integer(), nullable=True),
        sa.Column("response_body", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("source_ip", sa.String(45), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_voice_webhook_logs_org_created",
        "voice_webhook_logs",
        ["organization_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_voice_webhook_logs_org_created", table_name="voice_webhook_logs")
    op.drop_table("voice_webhook_logs")

    op.drop_index("ix_call_events_org_type", table_name="call_events")
    op.drop_index("ix_call_events_session_seq", table_name="call_events")
    op.drop_table("call_events")

    op.drop_index("ix_voice_providers_org_name", table_name="voice_providers")
    op.drop_table("voice_providers")

    op.drop_index("ix_voice_analytics_org_started", table_name="voice_analytics")
    op.drop_table("voice_analytics")

    op.drop_index("ix_voice_messages_session_speaker", table_name="voice_messages")
    op.drop_index("ix_voice_messages_session_seq", table_name="voice_messages")
    op.drop_table("voice_messages")

    op.drop_index("ix_voice_sessions_org_started", table_name="voice_sessions")
    op.drop_index("ix_voice_sessions_org_status", table_name="voice_sessions")
    op.drop_table("voice_sessions")

    op.drop_index("ix_voice_settings_org", table_name="voice_settings")
    op.drop_table("voice_settings")

    op.drop_index("ix_voice_assistants_org_type", table_name="voice_assistants")
    op.drop_index("ix_voice_assistants_org_active", table_name="voice_assistants")
    op.drop_table("voice_assistants")

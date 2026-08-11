"""stage 2 step 4: enterprise telephony integration

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-16 00:10:00.000000

Stage 2 Step 4 — Enterprise Telephony Integration Platform:
- telephony_providers (registered provider configurations)
- phone_numbers (tenant-owned business phone numbers)
- business_hours_schedules (per-tenant business hours + holiday schedules)
- routing_rules (per-tenant call routing rules)
- telephony_call_sessions (live + historical telephony call sessions)
- telephony_call_logs (per-call summary log)
- call_recordings (recording metadata)
- telephony_call_events (granular event log)
- telephony_settings (per-tenant global config)

Tenant isolation: every table has organization_id + composite indexes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== Telephony Providers =====
    op.create_table(
        "telephony_providers",
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
        sa.Column("webhook_base_url", sa.Text(), nullable=True),
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
        "ix_telephony_providers_org_name",
        "telephony_providers",
        ["organization_id", "name"],
    )

    # ===== Business Hours Schedules =====
    op.create_table(
        "business_hours_schedules",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("timezone", sa.String(50), server_default="UTC", nullable=False),
        sa.Column("weekly_schedule", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("holidays", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("after_hours_strategy", sa.String(20), server_default="voicemail", nullable=False),
        sa.Column("after_hours_forward_to", sa.String(20), nullable=True),
        sa.Column("after_hours_message", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False),
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
        "ix_business_hours_org_name",
        "business_hours_schedules",
        ["organization_id", "name"],
    )

    # ===== Phone Numbers =====
    op.create_table(
        "phone_numbers",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("display_name", sa.String(255), server_default="Main Line", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("telephony_providers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("provider_type", sa.String(50), server_default="twilio", nullable=False),
        sa.Column("provider_number_sid", sa.String(255), nullable=True),
        sa.Column("country_code", sa.String(2), server_default="US", nullable=False),
        sa.Column("number_type", sa.String(20), server_default="local", nullable=False),
        sa.Column("voice_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("sms_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("mms_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("fax_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("routing_strategy", sa.String(20), server_default="ai", nullable=False),
        sa.Column("voice_assistant_id", sa.String(36), nullable=True),
        sa.Column("forward_to_number", sa.String(20), nullable=True),
        sa.Column(
            "business_hours_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("business_hours_schedules.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("recording_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("recording_announcement", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False),
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
        "ix_phone_numbers_org_active",
        "phone_numbers",
        ["organization_id", "is_active"],
    )
    op.create_index(
        "ix_phone_numbers_org_number",
        "phone_numbers",
        ["organization_id", "number"],
    )
    # Note: 'number' uniqueness is enforced at the application layer to allow
    # multi-tenant testing with SQLite (where unique constraints on indexed
    # columns can conflict with composite indexes).

    # ===== Routing Rules =====
    op.create_table(
        "routing_rules",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "phone_number_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("phone_numbers.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.Integer(), server_default="100", nullable=False),
        sa.Column("conditions", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("action_config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
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
        "ix_routing_rules_org_priority",
        "routing_rules",
        ["organization_id", "priority"],
    )
    op.create_index(
        "ix_routing_rules_org_number",
        "routing_rules",
        ["organization_id", "phone_number_id"],
    )

    # ===== Telephony Call Sessions =====
    op.create_table(
        "telephony_call_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("provider", sa.String(50), server_default="twilio", nullable=False),
        sa.Column("call_sid", sa.String(255), nullable=False),
        sa.Column(
            "phone_number_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("phone_numbers.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("voice_session_id", sa.String(36), nullable=True, index=True),
        sa.Column("voice_assistant_id", sa.String(36), nullable=True),
        sa.Column("direction", sa.String(20), server_default="inbound", nullable=False),
        sa.Column("from_number", sa.String(20), nullable=False),
        sa.Column("to_number", sa.String(20), nullable=False),
        sa.Column("caller_name", sa.String(255), nullable=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("status", sa.String(20), server_default="ringing", nullable=False, index=True),
        sa.Column(
            "routing_rule_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("routing_rules.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("routing_decision", sa.String(50), nullable=True),
        sa.Column("routing_reason", sa.String(255), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("wait_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_talk_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("customer_talk_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("silence_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("transferred_to", sa.String(20), nullable=True),
        sa.Column("transferred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transfer_reason", sa.String(255), nullable=True),
        sa.Column("hold_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_hold_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("recording_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("recording_id", sa.String(36), nullable=True, index=True),
        sa.Column("outcome", sa.String(50), nullable=True),
        sa.Column("sentiment", sa.String(20), nullable=True),
        sa.Column("is_voicemail", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("voicemail_transcription", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("hangup_cause", sa.String(100), nullable=True),
        sa.Column("hangup_by", sa.String(20), nullable=True),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("parent_call_sid", sa.String(255), nullable=True),
        sa.Column("cost_cents", sa.Integer(), server_default="0", nullable=False),
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
        "ix_telephony_sessions_org_status",
        "telephony_call_sessions",
        ["organization_id", "status"],
    )
    op.create_index(
        "ix_telephony_sessions_org_started",
        "telephony_call_sessions",
        ["organization_id", "started_at"],
    )
    op.create_index(
        "ix_telephony_sessions_call_sid",
        "telephony_call_sessions",
        ["call_sid"],
    )

    # ===== Telephony Call Logs =====
    op.create_table(
        "telephony_call_logs",
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
            sa.ForeignKey("telephony_call_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("call_sid", sa.String(255), nullable=False, index=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("from_number", sa.String(20), nullable=False),
        sa.Column("to_number", sa.String(20), nullable=False),
        sa.Column("caller_name", sa.String(255), nullable=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("phone_number_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("phone_number_display", sa.String(255), nullable=True),
        sa.Column("voice_session_id", sa.String(36), nullable=True),
        sa.Column("voice_assistant_id", sa.String(36), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("outcome", sa.String(50), nullable=True),
        sa.Column("routing_decision", sa.String(50), nullable=True),
        sa.Column("routing_reason", sa.String(255), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("wait_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("has_recording", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("recording_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("recording_url", sa.Text(), nullable=True),
        sa.Column("transferred_to", sa.String(20), nullable=True),
        sa.Column("transfer_reason", sa.String(255), nullable=True),
        sa.Column("ai_handled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("ai_resolution", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("ai_latency_ms", sa.Integer(), nullable=True),
        sa.Column("ai_turns", sa.Integer(), server_default="0", nullable=False),
        sa.Column("cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("sentiment", sa.String(20), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("hangup_cause", sa.String(100), nullable=True),
        sa.Column("hangup_by", sa.String(20), nullable=True),
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
        "ix_telephony_logs_org_started",
        "telephony_call_logs",
        ["organization_id", "started_at"],
    )
    op.create_index(
        "ix_telephony_logs_org_outcome",
        "telephony_call_logs",
        ["organization_id", "outcome"],
    )

    # ===== Call Recordings =====
    op.create_table(
        "call_recordings",
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
            sa.ForeignKey("telephony_call_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("call_sid", sa.String(255), nullable=False, index=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("recording_sid", sa.String(255), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("format", sa.String(10), server_default="mp3", nullable=False),
        sa.Column("channels", sa.String(10), server_default="dual", nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), server_default="processing", nullable=False, index=True),
        sa.Column("stored_url", sa.Text(), nullable=True),
        sa.Column("storage_provider", sa.String(50), nullable=True),
        sa.Column("access_level", sa.String(20), server_default="org_admin", nullable=False),
        sa.Column("consent_obtained", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("consent_method", sa.String(50), nullable=True),
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
        "ix_call_recordings_org_created",
        "call_recordings",
        ["organization_id", "created_at"],
    )

    # ===== Telephony Call Events =====
    op.create_table(
        "telephony_call_events",
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
            sa.ForeignKey("telephony_call_sessions.id", ondelete="CASCADE"),
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
        "ix_telephony_events_session_seq",
        "telephony_call_events",
        ["session_id", "sequence"],
    )
    op.create_index(
        "ix_telephony_events_org_type",
        "telephony_call_events",
        ["organization_id", "event_type"],
    )

    # ===== Telephony Settings =====
    op.create_table(
        "telephony_settings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("provider", sa.String(50), server_default="twilio", nullable=False),
        sa.Column(
            "default_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("telephony_providers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "default_phone_number_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("phone_numbers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "default_business_hours_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("business_hours_schedules.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("default_routing_strategy", sa.String(20), server_default="ai", nullable=False),
        sa.Column("default_voice_assistant_id", sa.String(36), nullable=True),
        sa.Column("enable_recording", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("recording_format", sa.String(10), server_default="mp3", nullable=False),
        sa.Column("recording_channels", sa.String(10), server_default="dual", nullable=False),
        sa.Column("recording_announcement", sa.Text(), nullable=True),
        sa.Column("enable_voicemail", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("voicemail_max_duration", sa.Integer(), server_default="120", nullable=False),
        sa.Column("webhook_base_url", sa.Text(), nullable=True),
        sa.Column("webhook_secret", sa.String(255), nullable=True),
        sa.Column("max_call_duration", sa.Integer(), server_default="1800", nullable=False),
        sa.Column("enable_media_stream", sa.Boolean(), server_default="true", nullable=False),
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
        "ix_telephony_settings_org",
        "telephony_settings",
        ["organization_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_telephony_settings_org", table_name="telephony_settings")
    op.drop_table("telephony_settings")

    op.drop_index("ix_telephony_events_org_type", table_name="telephony_call_events")
    op.drop_index("ix_telephony_events_session_seq", table_name="telephony_call_events")
    op.drop_table("telephony_call_events")

    op.drop_index("ix_call_recordings_org_created", table_name="call_recordings")
    op.drop_table("call_recordings")

    op.drop_index("ix_telephony_logs_org_outcome", table_name="telephony_call_logs")
    op.drop_index("ix_telephony_logs_org_started", table_name="telephony_call_logs")
    op.drop_table("telephony_call_logs")

    op.drop_index("ix_telephony_sessions_call_sid", table_name="telephony_call_sessions")
    op.drop_index("ix_telephony_sessions_org_started", table_name="telephony_call_sessions")
    op.drop_index("ix_telephony_sessions_org_status", table_name="telephony_call_sessions")
    op.drop_table("telephony_call_sessions")

    op.drop_index("ix_routing_rules_org_number", table_name="routing_rules")
    op.drop_index("ix_routing_rules_org_priority", table_name="routing_rules")
    op.drop_table("routing_rules")

    op.drop_index("ix_phone_numbers_org_number", table_name="phone_numbers")
    op.drop_index("ix_phone_numbers_org_active", table_name="phone_numbers")
    op.drop_table("phone_numbers")

    op.drop_index("ix_business_hours_org_name", table_name="business_hours_schedules")
    op.drop_table("business_hours_schedules")

    op.drop_index("ix_telephony_providers_org_name", table_name="telephony_providers")
    op.drop_table("telephony_providers")

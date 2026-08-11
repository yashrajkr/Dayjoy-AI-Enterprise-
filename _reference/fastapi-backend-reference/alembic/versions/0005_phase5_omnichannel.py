"""phase 5 omnichannel platform

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-15 00:04:00.000000

Phase 5 — Omnichannel AI Platform:
- channel_conversations (Module 5: Conversation Management)
- call_logs + call_transcripts (Module 1: Voice AI)
- whatsapp_messages (Module 2: WhatsApp AI)
- email_threads + email_messages (Module 4: Email AI)
- handoff_requests + agent_availability (Module 6: Live Agent Handoff)
- channel_metrics (Module 7/8: Voice Analytics + Omnichannel Dashboard)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== Module 5: Channel Conversations =====
    op.create_table(
        "channel_conversations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("ai_conversation_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("channel", sa.String(20), nullable=False, index=True),
        sa.Column("channel_conversation_id", sa.String(255), nullable=True, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("distributor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("caller_phone", sa.String(20), nullable=True),
        sa.Column("caller_email", sa.String(255), nullable=True),
        sa.Column("caller_name", sa.String(255), nullable=True),
        sa.Column("agent_type", sa.String(50), nullable=True),
        sa.Column("intent", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=False, index=True),
        sa.Column("outcome", sa.String(50), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("satisfaction_score", sa.Integer(), nullable=True),
        sa.Column("satisfaction_comment", sa.Text(), nullable=True),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_escalated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("escalated_to", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("escalation_reason", sa.String(255), nullable=True),
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

    # ===== Module 1: Voice AI — Call Logs =====
    op.create_table(
        "call_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "channel_conversation_id", postgresql.UUID(as_uuid=True), nullable=True, index=True
        ),
        sa.Column("call_sid", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("call_provider", sa.String(50), server_default="twilio", nullable=False),
        sa.Column("direction", sa.String(20), server_default="inbound", nullable=False),
        sa.Column("from_number", sa.String(20), nullable=False),
        sa.Column("to_number", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), server_default="ringing", nullable=False, index=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("wait_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_talk_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("customer_talk_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("silence_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("interruption_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("language_detected", sa.String(10), nullable=True),
        sa.Column("recording_url", sa.Text(), nullable=True),
        sa.Column("recording_duration_seconds", sa.Integer(), nullable=True),
        sa.Column(
            "consent_obtained", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("transcript_url", sa.Text(), nullable=True),
        sa.Column("transcript_text", sa.Text(), nullable=True),
        sa.Column("transferred_to", sa.String(20), nullable=True),
        sa.Column("transferred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transfer_reason", sa.String(255), nullable=True),
        sa.Column("sentiment", sa.String(20), nullable=True),
        sa.Column("cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("hangup_cause", sa.String(100), nullable=True),
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

    op.create_table(
        "call_transcripts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("call_log_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("speaker", sa.String(20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("start_time", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("end_time", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("language", sa.String(10), nullable=True),
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

    # ===== Module 2: WhatsApp Messages =====
    op.create_table(
        "whatsapp_messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "channel_conversation_id", postgresql.UUID(as_uuid=True), nullable=True, index=True
        ),
        sa.Column("wa_message_id", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("from_number", sa.String(20), nullable=False),
        sa.Column("to_number", sa.String(20), nullable=False),
        sa.Column("message_type", sa.String(20), server_default="text", nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("media_url", sa.Text(), nullable=True),
        sa.Column("media_type", sa.String(50), nullable=True),
        sa.Column("media_id", sa.String(255), nullable=True),
        sa.Column("template_name", sa.String(100), nullable=True),
        sa.Column("template_language", sa.String(10), nullable=True),
        sa.Column("interactive_type", sa.String(20), nullable=True),
        sa.Column("interactive_payload", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("status", sa.String(20), server_default="sent", nullable=False),
        sa.Column("is_ai_response", sa.Boolean(), server_default=sa.text("false"), nullable=False),
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

    # ===== Module 4: Email Threads + Messages =====
    op.create_table(
        "email_threads",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "channel_conversation_id", postgresql.UUID(as_uuid=True), nullable=True, index=True
        ),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("thread_id", sa.String(255), nullable=True, index=True),
        sa.Column("from_email", sa.String(255), nullable=False),
        sa.Column("from_name", sa.String(255), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False),
        sa.Column("sentiment", sa.String(20), nullable=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("ai_draft_reply", sa.Text(), nullable=True),
        sa.Column("ai_processed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="new", nullable=False, index=True),
        sa.Column("message_count", sa.Integer(), server_default="1", nullable=False),
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

    op.create_table(
        "email_messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email_thread_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("message_id", sa.String(255), nullable=False, index=True),
        sa.Column("from_email", sa.String(255), nullable=False),
        sa.Column("to_email", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("direction", sa.String(10), server_default="inbound", nullable=False),
        sa.Column("attachments", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("is_ai_draft", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_ai_sent", sa.Boolean(), server_default=sa.text("false"), nullable=False),
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

    # ===== Module 6: Handoff Requests + Agent Availability =====
    op.create_table(
        "handoff_requests",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "channel_conversation_id", postgresql.UUID(as_uuid=True), nullable=False, index=True
        ),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("ai_agent_type", sa.String(50), nullable=True),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("customer_name", sa.String(255), nullable=True),
        sa.Column("customer_phone", sa.String(20), nullable=True),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("queue_position", sa.Integer(), nullable=True),
        sa.Column("wait_time_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False, index=True),
        sa.Column("resolution", sa.Text(), nullable=True),
        sa.Column("agent_notes", sa.Text(), nullable=True),
        sa.Column("satisfaction_score", sa.Integer(), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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

    op.create_table(
        "agent_availability",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("status", sa.String(20), server_default="offline", nullable=False, index=True),
        sa.Column("active_conversations", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_conversations", sa.Integer(), server_default="3", nullable=False),
        sa.Column(
            "channels",
            postgresql.JSON(astext_type=sa.Text()),
            server_default='["voice", "whatsapp", "web_chat"]',
        ),
        sa.Column("skills", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
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

    # ===== Module 7/8: Channel Metrics =====
    op.create_table(
        "channel_metrics",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("channel", sa.String(20), nullable=False, index=True),
        sa.Column("date", sa.String(10), nullable=False, index=True),
        sa.Column("total_conversations", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_resolved", sa.Integer(), server_default="0", nullable=False),
        sa.Column("human_escalated", sa.Integer(), server_default="0", nullable=False),
        sa.Column("abandoned", sa.Integer(), server_default="0", nullable=False),
        sa.Column("avg_response_time_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("avg_duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("avg_satisfaction", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("ai_resolution_rate", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("escalation_rate", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("total_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("channel_metrics", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
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


def downgrade() -> None:
    op.drop_table("channel_metrics")
    op.drop_table("agent_availability")
    op.drop_table("handoff_requests")
    op.drop_table("email_messages")
    op.drop_table("email_threads")
    op.drop_table("whatsapp_messages")
    op.drop_table("call_transcripts")
    op.drop_table("call_logs")
    op.drop_table("channel_conversations")

"""stage 2 step 6: enterprise notification platform

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-16 00:12:00.000000

Stage 2 Step 6 — Enterprise Notification Platform:
- notification_templates (reusable templates, multi-channel, multi-language)
- notification_channels (registered provider configs per tenant)
- notification_logs (per-attempt delivery log)
- notification_branding (per-tenant email/SMS branding)

Note: `notifications` and `notification_preferences` tables already exist
from the original schema (migration 0003). This migration only creates the
NEW tables and adds missing columns to the existing ones.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== Notification Templates (new) =====
    op.create_table(
        "notification_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("template_type", sa.String(50), server_default="transactional", nullable=False),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("variables", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("apply_branding", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_notif_templates_org_name", "notification_templates", ["organization_id", "name"])
    op.create_index("ix_notif_templates_org_channel", "notification_templates", ["organization_id", "channel"])
    op.create_index("ix_notif_templates_org_type", "notification_templates", ["organization_id", "template_type"])

    # ===== Notification Channels (new) =====
    op.create_table(
        "notification_channels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("channel_type", sa.String(20), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("credentials", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("from_email", sa.String(255), nullable=True),
        sa.Column("from_name", sa.String(255), nullable=True),
        sa.Column("reply_to", sa.String(255), nullable=True),
        sa.Column("sender_id", sa.String(50), nullable=True),
        sa.Column("config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_health_check_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_health_check_status", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_notif_channels_org_type", "notification_channels", ["organization_id", "channel_type"])

    # ===== Notification Logs (new) =====
    op.create_table(
        "notification_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("notification_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("provider", sa.String(50), nullable=True),
        sa.Column("provider_message_id", sa.String(255), nullable=True),
        sa.Column("provider_response", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("webhook_received", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("webhook_data", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("webhook_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_notif_logs_notif", "notification_logs", ["notification_id"])
    op.create_index("ix_notif_logs_org_created", "notification_logs", ["organization_id", "created_at"])

    # ===== Notification Branding (new) =====
    op.create_table(
        "notification_branding",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("company_name", sa.String(255), server_default="Dayjoy AI", nullable=False),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("primary_color", sa.String(7), server_default="#2563eb", nullable=False),
        sa.Column("secondary_color", sa.String(7), server_default="#64748b", nullable=False),
        sa.Column("background_color", sa.String(7), server_default="#f8fafc", nullable=False),
        sa.Column("text_color", sa.String(7), server_default="#1e293b", nullable=False),
        sa.Column("email_wrapper_html", sa.Text(), nullable=True),
        sa.Column("footer_text", sa.Text(), nullable=True),
        sa.Column("footer_links", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("social_links", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("sms_sender_id", sa.String(50), nullable=True),
        sa.Column("sms_opt_out_text", sa.Text(), server_default="Reply STOP to unsubscribe", nullable=False),
        sa.Column("push_icon_url", sa.Text(), nullable=True),
        sa.Column("push_color", sa.String(7), server_default="#2563eb", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_notif_branding_org", "notification_branding", ["organization_id"], unique=True)

    # ===== Add new columns to existing `notifications` table =====
    # The original notifications table had simpler columns; we add the new
    # ones needed for the full notification platform.
    try:
        op.add_column("notifications", sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("notification_templates.id", ondelete="SET NULL"), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("template_name", sa.String(100), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("channel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("notification_channels.id", ondelete="SET NULL"), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("channel", sa.String(20), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("provider", sa.String(50), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("recipient", sa.String(500), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("recipient_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("recipient_name", sa.String(255), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("subject", sa.String(500), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("body_html", sa.Text(), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("body_text", sa.Text(), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("variables", postgresql.JSON(astext_type=sa.Text()), server_default="{}"))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("attachments", postgresql.JSON(astext_type=sa.Text()), server_default="[]"))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("priority", sa.String(20), server_default="normal"))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("provider_message_id", sa.String(255), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("read_at", sa.DateTime(timezone=True), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("retry_count", sa.Integer(), server_default="0"))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("max_retries", sa.Integer(), server_default="3"))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("error_message", sa.Text(), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("error_code", sa.String(100), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notifications", sa.Column("bulk_id", postgresql.UUID(as_uuid=True), nullable=True))
    except Exception:
        pass

    # Create indexes on new columns
    try:
        op.create_index("ix_notifications_org_status", "notifications", ["organization_id", "status"])
    except Exception:
        pass
    try:
        op.create_index("ix_notifications_org_channel", "notifications", ["organization_id", "channel"])
    except Exception:
        pass
    try:
        op.create_index("ix_notifications_org_created", "notifications", ["organization_id", "created_at"])
    except Exception:
        pass
    try:
        op.create_index("ix_notifications_recipient", "notifications", ["recipient"])
    except Exception:
        pass
    try:
        op.create_index("ix_notifications_provider_msg_id", "notifications", ["provider_message_id"])
    except Exception:
        pass
    try:
        op.create_index("ix_notifications_bulk_id", "notifications", ["bulk_id"])
    except Exception:
        pass

    # ===== Add new columns to existing `notification_preferences` table =====
    try:
        op.add_column("notification_preferences", sa.Column("channel", sa.String(20), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notification_preferences", sa.Column("quiet_hours_start", sa.String(5), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notification_preferences", sa.Column("quiet_hours_end", sa.String(5), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("notification_preferences", sa.Column("quiet_hours_timezone", sa.String(50), server_default="UTC"))
    except Exception:
        pass
    try:
        op.add_column("notification_preferences", sa.Column("daily_cap", sa.Integer(), nullable=True))
    except Exception:
        pass
    try:
        op.create_index("ix_notif_prefs_org_user", "notification_preferences", ["organization_id", "user_id"])
    except Exception:
        pass
    try:
        op.create_index("ix_notif_prefs_user_channel", "notification_preferences", ["user_id", "channel"])
    except Exception:
        pass


def downgrade() -> None:
    # Drop new tables
    op.drop_index("ix_notif_branding_org", table_name="notification_branding")
    op.drop_table("notification_branding")

    op.drop_index("ix_notif_logs_org_created", table_name="notification_logs")
    op.drop_index("ix_notif_logs_notif", table_name="notification_logs")
    op.drop_table("notification_logs")

    op.drop_index("ix_notif_channels_org_type", table_name="notification_channels")
    op.drop_table("notification_channels")

    op.drop_index("ix_notif_templates_org_type", table_name="notification_templates")
    op.drop_index("ix_notif_templates_org_channel", table_name="notification_templates")
    op.drop_index("ix_notif_templates_org_name", table_name="notification_templates")
    op.drop_table("notification_templates")

    # Note: columns added to `notifications` and `notification_preferences`
    # are NOT dropped in downgrade (they may contain data). The tables
    # themselves remain from the original schema.

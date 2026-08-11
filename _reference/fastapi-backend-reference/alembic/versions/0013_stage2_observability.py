"""stage 2 step 7: enterprise observability platform

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-16 00:13:00.000000

Tables: system_metrics, alerts, monitoring_events, error_reports, performance_reports
"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table("system_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("metric_name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("labels", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_sys_metrics_name_time", "system_metrics", ["metric_name", "timestamp"])
    op.create_index("ix_sys_metrics_category", "system_metrics", ["category"])

    op.create_table("alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), server_default="warning", nullable=False),
        sa.Column("rule", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.Column("fired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_value", sa.Float(), nullable=True),
        sa.Column("notification_channels", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("auto_resolve", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_alerts_org_status", "alerts", ["organization_id", "status"])
    op.create_index("ix_alerts_severity", "alerts", ["severity"])
    op.create_index("ix_alerts_category", "alerts", ["category"])

    op.create_table("monitoring_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(20), server_default="info", nullable=False),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("payload", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("alert_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("alerts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_mon_events_org_created", "monitoring_events", ["organization_id", "created_at"])
    op.create_index("ix_mon_events_type", "monitoring_events", ["event_type"])
    op.create_index("ix_mon_events_severity", "monitoring_events", ["severity"])

    op.create_table("error_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("exception_type", sa.String(255), nullable=False),
        sa.Column("exception_message", sa.Text(), nullable=False),
        sa.Column("stack_trace", sa.Text(), nullable=True),
        sa.Column("file", sa.String(500), nullable=True),
        sa.Column("line", sa.Integer(), nullable=True),
        sa.Column("function", sa.String(255), nullable=True),
        sa.Column("module", sa.String(255), nullable=True),
        sa.Column("request_id", sa.String(100), nullable=True),
        sa.Column("request_method", sa.String(10), nullable=True),
        sa.Column("request_url", sa.Text(), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sentry_event_id", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), server_default="unresolved", nullable=False),
        sa.Column("occurrence_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("affected_user_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("environment", sa.String(50), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_error_reports_fingerprint", "error_reports", ["fingerprint"])
    op.create_index("ix_error_reports_status", "error_reports", ["status"])
    op.create_index("ix_error_reports_org_created", "error_reports", ["organization_id", "created_at"])

    op.create_table("performance_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_type", sa.String(20), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("metrics", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_perf_reports_org_period", "performance_reports", ["organization_id", "period_start"])
    op.create_index("ix_perf_reports_category", "performance_reports", ["category"])


def downgrade() -> None:
    op.drop_index("ix_perf_reports_category", table_name="performance_reports")
    op.drop_index("ix_perf_reports_org_period", table_name="performance_reports")
    op.drop_table("performance_reports")
    op.drop_index("ix_error_reports_org_created", table_name="error_reports")
    op.drop_index("ix_error_reports_status", table_name="error_reports")
    op.drop_index("ix_error_reports_fingerprint", table_name="error_reports")
    op.drop_table("error_reports")
    op.drop_index("ix_mon_events_severity", table_name="monitoring_events")
    op.drop_index("ix_mon_events_type", table_name="monitoring_events")
    op.drop_index("ix_mon_events_org_created", table_name="monitoring_events")
    op.drop_table("monitoring_events")
    op.drop_index("ix_alerts_category", table_name="alerts")
    op.drop_index("ix_alerts_severity", table_name="alerts")
    op.drop_index("ix_alerts_org_status", table_name="alerts")
    op.drop_table("alerts")
    op.drop_index("ix_sys_metrics_category", table_name="system_metrics")
    op.drop_index("ix_sys_metrics_name_time", table_name="system_metrics")
    op.drop_table("system_metrics")

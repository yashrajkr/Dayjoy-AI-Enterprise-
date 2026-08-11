"""phase 7 analytics

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-15 00:06:00.000000

Phase 7 — Enterprise Analytics, BI, AI Insights & Decision Intelligence:
- analytics_kpi_metrics + analytics_metric_snapshots (Module 2)
- analytics_dashboards (Module 3)
- analytics_insights (Module 4)
- analytics_forecasts + analytics_churn_risk (Module 5)
- analytics_reports + analytics_report_executions (Module 6)
- analytics_alert_rules + analytics_alert_events (Module 7)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== KPI Metrics =====
    op.create_table(
        "analytics_kpi_metrics",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("metric_type", sa.String(20), server_default="simple", nullable=False),
        sa.Column("query_template", sa.Text(), nullable=True),
        sa.Column("formula", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(20), server_default="count", nullable=False),
        sa.Column("aggregation", sa.String(10), server_default="sum", nullable=False),
        sa.Column("default_window_days", sa.Integer(), server_default="30", nullable=False),
        sa.Column("target_value", sa.Float(), nullable=True),
        sa.Column("direction", sa.String(20), server_default="higher_is_better", nullable=False),
        sa.Column("category", sa.String(50), nullable=True, index=True),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
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
        "analytics_metric_snapshots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("metric_name", sa.String(100), nullable=False, index=True),
        sa.Column("date", sa.String(10), nullable=False, index=True),
        sa.Column("dimension_type", sa.String(50), nullable=True),
        sa.Column("dimension_value", sa.String(100), nullable=True),
        sa.Column("value", sa.Float(), server_default="0.0", nullable=False),
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

    # ===== Dashboards =====
    op.create_table(
        "analytics_dashboards",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("dashboard_type", sa.String(50), nullable=False, index=True),
        sa.Column("target_role", sa.String(50), nullable=True),
        sa.Column("widgets", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("filters", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("refresh_interval_seconds", sa.Integer(), server_default="60", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
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

    # ===== Insights =====
    op.create_table(
        "analytics_insights",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("insight_type", sa.String(30), nullable=False, index=True),
        sa.Column("severity", sa.String(20), server_default="info", nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("metric_name", sa.String(100), nullable=True),
        sa.Column("metric_value", sa.Float(), nullable=True),
        sa.Column("context", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("is_actionable", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("recommended_action", sa.Text(), nullable=True),
        sa.Column("period_start", sa.String(10), nullable=True),
        sa.Column("period_end", sa.String(10), nullable=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=False, index=True),
        sa.Column("generated_by", sa.String(50), server_default="rule_engine", nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
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

    # ===== Forecasts =====
    op.create_table(
        "analytics_forecasts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("metric_name", sa.String(100), nullable=False, index=True),
        sa.Column("model_type", sa.String(50), server_default="linear_trend", nullable=False),
        sa.Column("forecast_date", sa.String(10), nullable=False, index=True),
        sa.Column("predicted_value", sa.Float(), nullable=False),
        sa.Column("confidence_lower", sa.Float(), nullable=True),
        sa.Column("confidence_upper", sa.Float(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("historical_data", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("model_params", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("dimension_type", sa.String(50), nullable=True),
        sa.Column("dimension_value", sa.String(100), nullable=True),
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
        "analytics_churn_risk",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("risk_score", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("risk_level", sa.String(20), server_default="low", nullable=False),
        sa.Column("factors", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column(
            "recommended_actions", postgresql.JSON(astext_type=sa.Text()), server_default="[]"
        ),
        sa.Column("last_interaction_days", sa.Integer(), nullable=True),
        sa.Column("total_interactions", sa.Integer(), nullable=True),
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

    # ===== Reports =====
    op.create_table(
        "analytics_reports",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("report_type", sa.String(50), nullable=False),
        sa.Column("config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("format", sa.String(10), server_default="pdf", nullable=False),
        sa.Column("schedule_cron", sa.String(100), nullable=True),
        sa.Column("recipients", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_generated", sa.Integer(), server_default="0", nullable=False),
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
        "analytics_report_executions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("period_start", sa.String(10), nullable=True),
        sa.Column("period_end", sa.String(10), nullable=True),
        sa.Column("format", sa.String(10), server_default="pdf", nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("data", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(20), server_default="running", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("delivered", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), server_default="0", nullable=False),
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

    # ===== Alerts =====
    op.create_table(
        "analytics_alert_rules",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("metric_name", sa.String(100), nullable=False),
        sa.Column("condition_type", sa.String(20), server_default="threshold", nullable=False),
        sa.Column("condition_config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("severity", sa.String(20), server_default="warning", nullable=False),
        sa.Column("channels", postgresql.JSON(astext_type=sa.Text()), server_default='["in_app"]'),
        sa.Column("recipients", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("cooldown_minutes", sa.Integer(), server_default="60", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("total_triggered", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
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
        "analytics_alert_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("alert_rule_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(20), server_default="warning", nullable=False),
        sa.Column("metric_name", sa.String(100), nullable=False),
        sa.Column("metric_value", sa.Float(), nullable=False),
        sa.Column("threshold_value", sa.Float(), nullable=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=False, index=True),
        sa.Column("acknowledged_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("context", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
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

    # ===== Seed system KPI metrics =====
    import json

    kpis = [
        (
            "ai_resolution_rate",
            "AI Resolution Rate",
            "Percentage of conversations resolved by AI without human escalation",
            "percentage",
            "higher_is_better",
            "ai",
            80.0,
        ),
        (
            "avg_response_time",
            "Average Response Time",
            "Average AI response time in seconds",
            "seconds",
            "lower_is_better",
            "operations",
            2.0,
        ),
        (
            "call_volume",
            "Call Volume",
            "Total number of calls",
            "count",
            "higher_is_better",
            "voice",
            None,
        ),
        (
            "ticket_backlog",
            "Ticket Backlog",
            "Open tickets older than 24h",
            "count",
            "lower_is_better",
            "support",
            10.0,
        ),
        (
            "customer_growth",
            "Customer Growth",
            "Net new customers",
            "count",
            "higher_is_better",
            "customer",
            None,
        ),
        (
            "workflow_success_rate",
            "Workflow Success Rate",
            "Percentage of successful workflow executions",
            "percentage",
            "higher_is_better",
            "automation",
            95.0,
        ),
        (
            "first_contact_resolution",
            "First Contact Resolution",
            "Percentage resolved on first contact",
            "percentage",
            "higher_is_better",
            "support",
            70.0,
        ),
        (
            "avg_satisfaction",
            "Average Satisfaction",
            "Average customer satisfaction score (1-5)",
            "ratio",
            "higher_is_better",
            "customer",
            4.0,
        ),
    ]
    kpi_table = sa.table(
        "analytics_kpi_metrics",
        sa.column("name", sa.String),
        sa.column("display_name", sa.String),
        sa.column("description", sa.Text),
        sa.column("unit", sa.String),
        sa.column("direction", sa.String),
        sa.column("category", sa.String),
        sa.column("target_value", sa.Float),
        sa.column("metric_type", sa.String),
        sa.column("is_system", sa.Boolean),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        kpi_table,
        [
            {
                "name": n,
                "display_name": d,
                "description": desc,
                "unit": u,
                "direction": dir_,
                "category": cat,
                "target_value": tv,
                "metric_type": "simple",
                "is_system": True,
                "is_active": True,
            }
            for n, d, desc, u, dir_, cat, tv in kpis
        ],
    )

    # ===== Seed system dashboards =====
    dashboards = [
        (
            "Executive Overview",
            "executive",
            "ceo",
            json.dumps(
                [
                    {
                        "id": "w1",
                        "title": "Total Conversations",
                        "type": "kpi_card",
                        "config": {"metric": "call_volume"},
                        "position": {"x": 0, "y": 0},
                    },
                    {
                        "id": "w2",
                        "title": "AI Resolution Rate",
                        "type": "kpi_card",
                        "config": {"metric": "ai_resolution_rate"},
                        "position": {"x": 1, "y": 0},
                    },
                    {
                        "id": "w3",
                        "title": "Customer Satisfaction",
                        "type": "gauge",
                        "config": {"metric": "avg_satisfaction"},
                        "position": {"x": 2, "y": 0},
                    },
                    {
                        "id": "w4",
                        "title": "Call Volume Trend",
                        "type": "line_chart",
                        "config": {"metric": "call_volume", "period": "30d"},
                        "position": {"x": 0, "y": 1, "w": 2},
                    },
                ]
            ),
        ),
        (
            "Operations Dashboard",
            "operations",
            "ops_analyst",
            json.dumps(
                [
                    {
                        "id": "w1",
                        "title": "Active Conversations",
                        "type": "kpi_card",
                        "config": {},
                        "position": {"x": 0, "y": 0},
                    },
                    {
                        "id": "w2",
                        "title": "Ticket Backlog",
                        "type": "kpi_card",
                        "config": {"metric": "ticket_backlog"},
                        "position": {"x": 1, "y": 0},
                    },
                    {
                        "id": "w3",
                        "title": "Response Time",
                        "type": "line_chart",
                        "config": {"metric": "avg_response_time"},
                        "position": {"x": 0, "y": 1},
                    },
                ]
            ),
        ),
        (
            "AI Performance",
            "ai_ops",
            "ops_analyst",
            json.dumps(
                [
                    {
                        "id": "w1",
                        "title": "AI Resolution Rate",
                        "type": "kpi_card",
                        "config": {"metric": "ai_resolution_rate"},
                        "position": {"x": 0, "y": 0},
                    },
                    {
                        "id": "w2",
                        "title": "Workflow Success",
                        "type": "kpi_card",
                        "config": {"metric": "workflow_success_rate"},
                        "position": {"x": 1, "y": 0},
                    },
                ]
            ),
        ),
    ]
    dash_table = sa.table(
        "analytics_dashboards",
        sa.column("name", sa.String),
        sa.column("dashboard_type", sa.String),
        sa.column("target_role", sa.String),
        sa.column("widgets", sa.Text),
        sa.column("is_system", sa.Boolean),
        sa.column("is_active", sa.Boolean),
        sa.column("organization_id", sa.Text),
    )
    # Note: dashboards are system-level (org_id will be set per-tenant on first access)
    # For seed, we use a placeholder org_id
    op.bulk_insert(
        dash_table,
        [
            {
                "name": n,
                "dashboard_type": t,
                "target_role": r,
                "widgets": w,
                "is_system": True,
                "is_active": True,
                "organization_id": "00000000-0000-0000-0000-000000000000",
            }
            for n, t, r, w in dashboards
        ],
    )


def downgrade() -> None:
    op.drop_table("analytics_alert_events")
    op.drop_table("analytics_alert_rules")
    op.drop_table("analytics_report_executions")
    op.drop_table("analytics_reports")
    op.drop_table("analytics_churn_risk")
    op.drop_table("analytics_forecasts")
    op.drop_table("analytics_insights")
    op.drop_table("analytics_dashboards")
    op.drop_table("analytics_metric_snapshots")
    op.drop_table("analytics_kpi_metrics")

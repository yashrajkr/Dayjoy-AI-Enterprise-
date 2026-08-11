"""phase 6 workflow automation

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-15 00:05:00.000000

Phase 6 — Enterprise Workflow Automation, Integration Platform & Operational Intelligence:
- workflows + workflow_executions + workflow_templates + workflow_approvals (Module 1)
- event_subscriptions + event_logs + dead_letter_queue (Module 2)
- connectors + connector_logs + webhook_endpoints (Module 3)
- rule_sets (Module 5)
- scheduled_jobs + job_executions (Module 6)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== Module 1: Workflows =====
    op.create_table(
        "workflows",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("trigger_type", sa.String(50), nullable=False),
        sa.Column("trigger_config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("definition", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False, index=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("total_executions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("successful_executions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed_executions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tags", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
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
        "workflow_executions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("trigger_type", sa.String(50), nullable=False),
        sa.Column("trigger_data", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("status", sa.String(20), server_default="running", nullable=False, index=True),
        sa.Column("current_node_id", sa.String(100), nullable=True),
        sa.Column("variables", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("execution_log", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("triggered_by", postgresql.UUID(as_uuid=True), nullable=True),
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
        "workflow_templates",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(100), nullable=True, index=True),
        sa.Column("definition", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("trigger_type", sa.String(50), nullable=False),
        sa.Column("trigger_config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column(
            "required_variables", postgresql.JSON(astext_type=sa.Text()), server_default="[]"
        ),
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
        "workflow_approvals",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("execution_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("node_id", sa.String(100), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("approver_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approver_role", sa.String(50), nullable=True),
        sa.Column("context", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False, index=True),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_notes", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
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

    # ===== Module 2: Event Bus =====
    op.create_table(
        "event_subscriptions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("event_type", sa.String(100), nullable=False, index=True),
        sa.Column("handler_type", sa.String(20), nullable=False),
        sa.Column("handler_config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("filter", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("max_retries", sa.Integer(), server_default="3", nullable=False),
        sa.Column("retry_delay_seconds", sa.Integer(), server_default="60", nullable=False),
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
        "event_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("event_type", sa.String(100), nullable=False, index=True),
        sa.Column("event_version", sa.String(20), server_default="1.0", nullable=False),
        sa.Column("data", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("subscribers_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("delivered_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("correlation_id", sa.String(255), nullable=True, index=True),
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
        "dead_letter_queue",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("event_log_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("event_data", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(20), server_default="failed", nullable=False, index=True),
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

    # ===== Module 3: Connectors =====
    op.create_table(
        "connectors",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("connector_type", sa.String(50), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("credentials_ref", sa.String(500), nullable=True),
        sa.Column("auth_type", sa.String(20), server_default="api_key", nullable=False),
        sa.Column("last_health_check_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_health_status", sa.String(20), nullable=True),
        sa.Column("last_health_error", sa.Text(), nullable=True),
        sa.Column("sync_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("sync_interval_minutes", sa.Integer(), server_default="60", nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_status", sa.String(20), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("rate_limit_per_minute", sa.Integer(), server_default="60", nullable=False),
        sa.Column("rate_limit_remaining", sa.Integer(), server_default="60", nullable=False),
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
        "connector_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("connector_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("operation", sa.String(50), nullable=False),
        sa.Column("method", sa.String(10), nullable=True),
        sa.Column("endpoint", sa.String(500), nullable=True),
        sa.Column("request_data", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("response_status", sa.Integer(), nullable=True),
        sa.Column("response_data", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(20), server_default="success", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
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
        "webhook_endpoints",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("path", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("handler_type", sa.String(20), nullable=False),
        sa.Column("handler_config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("secret", sa.String(255), nullable=True),
        sa.Column("verify_signature", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("total_received", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_received_at", sa.DateTime(timezone=True), nullable=True),
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

    # ===== Module 5: Rule Sets =====
    op.create_table(
        "rule_sets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rules", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("evaluation_mode", sa.String(10), server_default="all", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
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

    # ===== Module 6: Scheduler =====
    op.create_table(
        "scheduled_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("schedule_type", sa.String(20), nullable=False),
        sa.Column("schedule_config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("job_type", sa.String(50), nullable=False),
        sa.Column("job_config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("status", sa.String(20), server_default="active", nullable=False, index=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_runs", sa.Integer(), server_default="0", nullable=False),
        sa.Column("successful_runs", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed_runs", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_retries", sa.Integer(), server_default="3", nullable=False),
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
        "job_executions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("scheduled_job_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("status", sa.String(20), server_default="running", nullable=False),
        sa.Column("result", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
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

    # ===== Seed workflow templates =====
    import json

    templates_data = [
        (
            "New Customer Onboarding",
            "Automated onboarding flow for new customers",
            "customer",
            "event",
            json.dumps({"event": "customer.created"}),
        ),
        (
            "Lead Qualification",
            "AI-powered lead qualification workflow",
            "sales",
            "manual",
            json.dumps({}),
        ),
        (
            "Support Ticket Escalation",
            "Escalate tickets that are unresolved after 24h",
            "support",
            "schedule",
            json.dumps({"cron": "0 * * * *"}),
        ),
        (
            "Callback Scheduling",
            "Schedule callbacks for missed calls",
            "voice",
            "event",
            json.dumps({"event": "call.missed"}),
        ),
        (
            "Payment Reminder",
            "Send payment reminders via WhatsApp/Email",
            "finance",
            "schedule",
            json.dumps({"cron": "0 9 * * *"}),
        ),
        (
            "AI Knowledge Approval",
            "Route new KB articles for approval before publishing",
            "knowledge",
            "event",
            json.dumps({"event": "kb.article.submitted"}),
        ),
    ]
    templates_table = sa.table(
        "workflow_templates",
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("category", sa.String),
        sa.column("trigger_type", sa.String),
        sa.column("trigger_config", sa.Text),
        sa.column("definition", sa.Text),
        sa.column("required_variables", sa.Text),
        sa.column("is_system", sa.Boolean),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        templates_table,
        [
            {
                "name": n,
                "description": d,
                "category": c,
                "trigger_type": t,
                "trigger_config": tc,
                "definition": json.dumps({"nodes": [], "edges": []}),
                "required_variables": json.dumps([]),
                "is_system": True,
                "is_active": True,
            }
            for n, d, c, t, tc in templates_data
        ],
    )


def downgrade() -> None:
    op.drop_table("job_executions")
    op.drop_table("scheduled_jobs")
    op.drop_table("rule_sets")
    op.drop_table("webhook_endpoints")
    op.drop_table("connector_logs")
    op.drop_table("connectors")
    op.drop_table("dead_letter_queue")
    op.drop_table("event_logs")
    op.drop_table("event_subscriptions")
    op.drop_table("workflow_approvals")
    op.drop_table("workflow_templates")
    op.drop_table("workflow_executions")
    op.drop_table("workflows")

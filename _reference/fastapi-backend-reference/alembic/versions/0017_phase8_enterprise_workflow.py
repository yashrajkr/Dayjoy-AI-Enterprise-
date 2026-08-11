"""Phase 8: Enterprise Workflow Automation — versions, variables, logs, queue, schedule, node types.

Revision ID: 0017
Revises: 0016
"""

from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ===== 1. workflow_versions =====
    op.create_table(
        "workflow_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workflow_id", sa.String(36), sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("definition_snapshot", sa.JSON, nullable=False),
        sa.Column("change_summary", sa.String(500), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_wf_versions_wf_version", "workflow_versions", ["workflow_id", "version"], unique=True)

    # ===== 2. workflow_variables =====
    op.create_table(
        "workflow_variables",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("workflow_id", sa.String(36), sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("execution_id", sa.String(36), sa.ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("var_type", sa.String(20), nullable=False, server_default=sa.text("'string'")),
        sa.Column("value", sa.JSON, nullable=True),
        sa.Column("is_encrypted", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("scope", sa.String(20), nullable=False, server_default=sa.text("'execution'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_wf_vars_org_wf", "workflow_variables", ["organization_id", "workflow_id"])
    op.create_index("ix_wf_vars_exec", "workflow_variables", ["execution_id"])

    # ===== 3. workflow_logs =====
    op.create_table(
        "workflow_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("execution_id", sa.String(36), sa.ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("node_id", sa.String(100), nullable=True),
        sa.Column("node_type", sa.String(50), nullable=True),
        sa.Column("level", sa.String(20), nullable=False, server_default=sa.text("'info'")),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("input_data", sa.JSON, nullable=True),
        sa.Column("output_data", sa.JSON, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_wf_logs_exec_ts", "workflow_logs", ["execution_id", "timestamp"])

    # ===== 4. workflow_queue =====
    op.create_table(
        "workflow_queue",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("workflow_id", sa.String(36), sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True),
        sa.Column("execution_id", sa.String(36), sa.ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("priority", sa.Integer, nullable=False, server_default=sa.text("5")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("input_data", sa.JSON, nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("max_retries", sa.Integer, nullable=False, server_default=sa.text("3")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_wf_queue_org_status", "workflow_queue", ["organization_id", "status"])
    op.create_index("ix_wf_queue_priority", "workflow_queue", ["priority", "status", "scheduled_at"])

    # ===== 5. workflow_schedule =====
    op.create_table(
        "workflow_schedule",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("workflow_id", sa.String(36), sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("schedule_type", sa.String(20), nullable=False),
        sa.Column("cron_expression", sa.String(100), nullable=True),
        sa.Column("timezone", sa.String(50), nullable=False, server_default=sa.text("'UTC'")),
        sa.Column("input_data", sa.JSON, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_runs", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_wf_schedule_org_active", "workflow_schedule", ["organization_id", "is_active"])
    op.create_index("ix_wf_schedule_next_run", "workflow_schedule", ["is_active", "next_run_at"])

    # ===== 6. Add columns to existing workflow_executions =====
    op.execute("ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS current_node_id VARCHAR(100) NULL;")
    op.execute("ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS variables JSONB NULL;")
    op.execute("ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS checkpoint JSONB NULL;")
    op.execute("ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS cost_cents INTEGER NOT NULL DEFAULT 0;")
    op.execute("ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0;")
    op.execute("ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;")
    op.execute("ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS parent_execution_id VARCHAR(36) NULL;")
    op.execute("ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS workflow_version INTEGER NULL;")

    # ===== 7. Add columns to existing workflow_approvals =====
    op.execute("ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS approval_type VARCHAR(20) NOT NULL DEFAULT 'single';")
    op.execute("ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS timeout_hours INTEGER NULL;")
    op.execute("ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS escalation_to VARCHAR(36) NULL;")
    op.execute("ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS reassigned_to VARCHAR(36) NULL;")
    op.execute("ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;")
    op.execute("ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS total_approvals INTEGER NOT NULL DEFAULT 0;")
    op.execute("ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS required_approvals INTEGER NOT NULL DEFAULT 1;")

    # ===== 8. Add columns to existing workflows =====
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;")
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;")
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS category VARCHAR(50) NULL;")
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::json;")
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS icon VARCHAR(50) NULL;")
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS owner_id VARCHAR(36) NULL;")
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;")
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS retry_policy JSONB NOT NULL DEFAULT '{}'::json;")
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 300;")
    op.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER NOT NULL DEFAULT 60;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_workflows_org_archived ON workflows (organization_id, is_active);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_workflows_org_published ON workflows (organization_id, is_published);")

    # ===== 9. Seed workflow templates =====
    op.execute("""
        INSERT INTO workflows (id, organization_id, name, description, definition, trigger_type, trigger_config, status, is_active, is_system, priority, version, is_template, category, tags, icon, created_at, updated_at)
        VALUES
        (gen_random_uuid(), NULL, 'Customer Onboarding', 'Automated onboarding flow: create CRM record → send welcome email → schedule follow-up call',
         '{"nodes":[{"id":"start","type":"trigger"},{"id":"crm","type":"action","action":"create_crm_record"},{"id":"email","type":"action","action":"send_email"},{"id":"schedule","type":"action","action":"schedule_call"},{"id":"end","type":"end"}],"edges":[{"from":"start","to":"crm"},{"from":"crm","to":"email"},{"from":"email","to":"schedule"},{"from":"schedule","to":"end"}]}',
         'manual', '{}', 'active', true, true, 50, 1, true, 'onboarding', '["customer","onboarding","automation"]', 'user-plus', now(), now()),
        (gen_random_uuid(), NULL, 'Lead Qualification', 'AI-powered lead scoring and qualification with human approval for high-value leads',
         '{"nodes":[{"id":"start","type":"trigger"},{"id":"ai","type":"ai_decision","agent_type":"lead_qualification"},{"id":"check","type":"condition","condition":"score > 0.7"},{"id":"approve","type":"approval","approver_role":"sales_manager"},{"id":"assign","type":"action","action":"assign_sales_rep"},{"id":"end","type":"end"}],"edges":[{"from":"start","to":"ai"},{"from":"ai","to":"check"},{"from":"check","to":"approve","condition":"true"},{"from":"check","to":"end","condition":"false"},{"from":"approve","to":"assign"},{"from":"assign","to":"end"}]}',
         'webhook', '{}', 'active', true, true, 50, 1, true, 'sales', '["lead","sales","ai","approval"]', 'filter', now(), now()),
        (gen_random_uuid(), NULL, 'Support Ticket Escalation', 'Auto-escalate support tickets after SLA breach with notification chain',
         '{"nodes":[{"id":"start","type":"trigger"},{"id":"check_sla","type":"condition","condition":"sla_breached == true"},{"id":"escalate","type":"action","action":"escalate_ticket"},{"id":"notify_email","type":"action","action":"send_email"},{"id":"notify_sms","type":"action","action":"send_sms"},{"id":"end","type":"end"}],"edges":[{"from":"start","to":"check_sla"},{"from":"check_sla","to":"escalate","condition":"true"},{"from":"check_sla","to":"end","condition":"false"},{"from":"escalate","to":"notify_email"},{"from":"notify_email","to":"notify_sms"},{"from":"notify_sms","to":"end"}]}',
         'event', '{}', 'active', true, true, 50, 1, true, 'support', '["support","escalation","sla"]', 'alert-triangle', now(), now()),
        (gen_random_uuid(), NULL, 'Weekly Report Generator', 'Scheduled weekly report: collect data → AI summary → generate PDF → email stakeholders',
         '{"nodes":[{"id":"start","type":"trigger"},{"id":"collect","type":"action","action":"query_database"},{"id":"ai_summary","type":"ai_decision","agent_type":"reporting"},{"id":"pdf","type":"action","action":"generate_pdf"},{"id":"email","type":"action","action":"send_email"},{"id":"end","type":"end"}],"edges":[{"from":"start","to":"collect"},{"from":"collect","to":"ai_summary"},{"from":"ai_summary","to":"pdf"},{"from":"pdf","to":"email"},{"from":"email","to":"end"}]}',
         'schedule', '{"schedule_type":"weekly","cron":"0 9 * * 1"}', 'active', true, true, 50, 1, true, 'reporting', '["report","weekly","scheduled","ai"]', 'file-text', now(), now())
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    for col in ["rate_limit_per_minute", "timeout_seconds", "retry_policy", "is_published", "owner_id", "icon", "tags", "category", "is_template", "version"]:
        op.execute(f"ALTER TABLE workflows DROP COLUMN IF EXISTS {col};")
    for col in ["required_approvals", "total_approvals", "expires_at", "reassigned_to", "escalation_to", "timeout_hours", "approval_type"]:
        op.execute(f"ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS {col};")
    for col in ["workflow_version", "parent_execution_id", "version", "total_tokens", "cost_cents", "checkpoint", "variables", "current_node_id"]:
        op.execute(f"ALTER TABLE workflow_executions DROP COLUMN IF EXISTS {col};")
    op.drop_table("workflow_schedule")
    op.drop_table("workflow_queue")
    op.drop_table("workflow_logs")
    op.drop_table("workflow_variables")
    op.drop_table("workflow_versions")

"""Phase 7: Multi-Agent Orchestration — task queue, communications, health, 31 specialized agents.

Revision ID: 0016
Revises: 0015
"""

from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ===== 1. task_queue =====
    op.create_table(
        "task_queue",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("task_type", sa.String(50), nullable=False, index=True),
        sa.Column("priority", sa.Integer, nullable=False, server_default=sa.text("5")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("input", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("output", sa.JSON, nullable=True),
        sa.Column("assigned_agent_id", sa.String(36), nullable=True, index=True),
        sa.Column("planner_output", sa.JSON, nullable=True),
        sa.Column("supervisor_output", sa.JSON, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("max_retries", sa.Integer, nullable=False, server_default=sa.text("3")),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cost_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("latency_ms", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_task_queue_org_status", "task_queue", ["organization_id", "status"])
    op.create_index("ix_task_queue_org_priority", "task_queue", ["organization_id", "priority", "status"])

    # ===== 2. task_history =====
    op.create_table(
        "task_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("task_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("agent_id", sa.String(36), nullable=True, index=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("event_data", sa.JSON, nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_task_history_org_ts", "task_history", ["organization_id", "timestamp"])

    # ===== 3. agent_communications =====
    op.create_table(
        "agent_communications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("task_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("from_agent_id", sa.String(36), nullable=True),
        sa.Column("to_agent_id", sa.String(36), nullable=True),
        sa.Column("message_type", sa.String(30), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_agent_comms_org_task", "agent_communications", ["organization_id", "task_id"])

    # ===== 4. agent_health =====
    op.create_table(
        "agent_health",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'healthy'")),
        sa.Column("last_execution_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_message", sa.Text, nullable=True),
        sa.Column("consecutive_failures", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_executions", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_failures", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("avg_latency_ms", sa.Float, nullable=True),
        sa.Column("avg_cost_cents", sa.Float, nullable=True),
        sa.Column("avg_confidence", sa.Float, nullable=True),
        sa.Column("circuit_breaker_state", sa.String(20), nullable=False, server_default=sa.text("'closed'")),
        sa.Column("circuit_breaker_reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_agent_health_org_status", "agent_health", ["organization_id", "status"])

    # ===== 5. Seed 31 specialized agents as templates =====
    agents_data = [
        ("Customer Support Agent", "support", "Handles customer queries with knowledge base grounding"),
        ("Sales Agent", "sales", "Product recommendations, pricing, lead conversion"),
        ("Marketing Agent", "marketing", "Campaign ideas, content strategy, market analysis"),
        ("HR Agent", "hr", "Employee policies, onboarding, benefits questions"),
        ("Recruitment Agent", "recruitment", "Job descriptions, candidate screening, interview questions"),
        ("Finance Agent", "finance", "Invoice questions, expense policies, financial reports"),
        ("Analytics Agent", "analytics", "Data analysis, KPIs, trend insights, forecasting"),
        ("CRM Agent", "crm", "Customer records, interaction history, pipeline management"),
        ("Email Agent", "email", "Draft, review, and send professional emails"),
        ("WhatsApp Agent", "whatsapp", "WhatsApp conversation management and responses"),
        ("Calendar Agent", "calendar", "Schedule management, meeting booking, availability"),
        ("Scheduler Agent", "scheduler", "Task scheduling, reminders, deadline tracking"),
        ("Knowledge Agent", "knowledge", "Knowledge base search, fact retrieval, citations"),
        ("Research Agent", "research", "Deep research, information gathering, source verification"),
        ("Document Agent", "document", "Document analysis, extraction, summarization"),
        ("Summarization Agent", "summarization", "Condense long text into concise summaries"),
        ("Reporting Agent", "reporting", "Generate structured reports from data and context"),
        ("Database Agent", "database", "Query databases, retrieve records, data validation"),
        ("Workflow Agent", "workflow", "Orchestrate multi-step business processes"),
        ("Voice Agent", "voice", "Voice call handling, speech-to-text, text-to-speech"),
        ("Call Agent", "call", "Inbound/outbound call management, call routing"),
        ("Lead Qualification Agent", "lead_qualification", "Score and qualify leads based on criteria"),
        ("Appointment Agent", "appointment", "Book, reschedule, confirm appointments"),
        ("Compliance Agent", "compliance", "Policy compliance checking, risk assessment"),
        ("Security Agent", "security", "Security analysis, threat detection, access review"),
        ("Translation Agent", "translation", "Multi-language translation and localization"),
        ("Content Agent", "content", "Content creation, editing, SEO optimization"),
        ("Image Agent", "image", "Image analysis, description, alt-text generation"),
        ("Automation Agent", "automation", "Automate repetitive tasks, trigger workflows"),
        ("Notification Agent", "notification", "Send alerts, reminders, status updates"),
        ("Admin Assistant", "admin_assistant", "Administrative tasks, scheduling, document management"),
        ("CEO Assistant", "ceo_assistant", "Executive summaries, strategic insights, decision support"),
    ]

    for name, agent_type, desc in agents_data:
        slug = name.lower().replace(" ", "-")
        op.execute(f"""
            INSERT INTO ai_agent_templates (id, organization_id, name, slug, description, category, config,
                                            is_published, is_system, clone_count, tags, icon, created_at, updated_at)
            SELECT gen_random_uuid(), NULL, '{name}', '{slug}', '{desc}', '{agent_type}',
                   '{{"agent_type":"{agent_type}","system_prompt":"You are a {desc}. Be helpful, accurate, and cite sources when possible.","llm_provider":"openai","model":"gpt-4o-mini","temperature":0.3,"max_tokens":2000,"enable_rag":true,"enable_memory":true,"enable_tool_calling":true,"enable_safety_filter":true}}',
                   true, true, 0, '["{agent_type}"]', 'bot', now(), now()
            WHERE NOT EXISTS (SELECT 1 FROM ai_agent_templates WHERE slug = '{slug}' AND organization_id IS NULL);
        """)


def downgrade() -> None:
    op.drop_table("agent_health")
    op.drop_table("agent_communications")
    op.drop_table("task_history")
    op.drop_table("task_queue")

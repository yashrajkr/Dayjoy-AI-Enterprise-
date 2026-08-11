"""Phase 6: Enterprise AI Agent Platform — agent versions, executions, memory, templates, bindings, workflows.

Revision ID: 0015
Revises: 0014
Created on: 2026-07-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ===== 1. ai_agent_versions =====
    op.create_table(
        "ai_agent_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("config_snapshot", sa.JSON, nullable=False),
        sa.Column("change_summary", sa.String(500), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ai_agent_versions_agent_version", "ai_agent_versions", ["agent_id", "version"], unique=True)

    # ===== 2. ai_agent_executions =====
    op.create_table(
        "ai_agent_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("ai_agent_configs.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("conversation_id", sa.String(36), nullable=True, index=True),
        sa.Column("input_message", sa.Text, nullable=False),
        sa.Column("input_metadata", sa.JSON, nullable=True),
        sa.Column("output_message", sa.Text, nullable=True),
        sa.Column("output_metadata", sa.JSON, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'running'")),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("llm_provider", sa.String(50), nullable=True),
        sa.Column("llm_model", sa.String(100), nullable=True),
        sa.Column("temperature", sa.Float, nullable=True),
        sa.Column("input_tokens", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("output_tokens", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("cost_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("latency_ms", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("llm_latency_ms", sa.Integer, nullable=True),
        sa.Column("tool_latency_ms", sa.Integer, nullable=True),
        sa.Column("retrieval_latency_ms", sa.Integer, nullable=True),
        sa.Column("tool_calls_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("tool_calls", sa.JSON, nullable=True),
        sa.Column("retrieved_chunks_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("citations", sa.JSON, nullable=True),
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("max_retries", sa.Integer, nullable=False, server_default=sa.text("3")),
        sa.Column("workflow_execution_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("workflow_step_id", UUID(as_uuid=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ai_executions_org_created", "ai_agent_executions", ["organization_id", "created_at"])
    op.create_index("ix_ai_executions_org_status", "ai_agent_executions", ["organization_id", "status"])
    op.create_index("ix_ai_executions_agent_created", "ai_agent_executions", ["agent_id", "created_at"])

    # ===== 3. ai_agent_memory =====
    op.create_table(
        "ai_agent_memory",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("user_id", sa.String(36), nullable=True, index=True),
        sa.Column("conversation_id", sa.String(36), nullable=True, index=True),
        sa.Column("memory_type", sa.String(20), nullable=False, index=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("metadata_", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("importance", sa.Float, nullable=False, server_default=sa.text("0.5")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ai_memory_org_type", "ai_agent_memory", ["organization_id", "memory_type"])
    op.create_index("ix_ai_memory_org_agent_user", "ai_agent_memory", ["organization_id", "agent_id", "user_id"])

    # ===== 4. ai_agent_templates =====
    op.create_table(
        "ai_agent_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=True, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=True, index=True),
        sa.Column("config", sa.JSON, nullable=False),
        sa.Column("author_id", sa.String(36), nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("clone_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("rating_sum", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("rating_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ai_templates_org_slug", "ai_agent_templates", ["organization_id", "slug"], unique=True)
    op.create_index("ix_ai_templates_published", "ai_agent_templates", ["is_published", "category"])

    # ===== 5. ai_agent_knowledge =====
    op.create_table(
        "ai_agent_knowledge",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("collection_name", sa.String(255), nullable=True),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("filter_config", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ai_agent_knowledge_agent_coll", "ai_agent_knowledge", ["agent_id", "collection_name"], unique=True)

    # ===== 6. ai_agent_tools =====
    op.create_table(
        "ai_agent_tools",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tool_id", sa.String(36), sa.ForeignKey("ai_tool_definitions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("requires_approval", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("rate_limit_override", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ai_agent_tools_agent_tool", "ai_agent_tools", ["agent_id", "tool_id"], unique=True)

    # ===== 7. ai_workflow_definitions =====
    op.create_table(
        "ai_workflow_definitions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("steps", sa.JSON, nullable=False),
        sa.Column("trigger_type", sa.String(30), nullable=False, server_default=sa.text("'manual'")),
        sa.Column("trigger_config", sa.JSON, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("is_template", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ai_wf_defs_org_active", "ai_workflow_definitions", ["organization_id", "is_active"])

    # ===== 8. ai_workflow_executions =====
    op.create_table(
        "ai_workflow_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("workflow_id", UUID(as_uuid=True), sa.ForeignKey("ai_workflow_definitions.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("input_context", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("output_context", sa.JSON, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'running'")),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("step_results", sa.JSON, nullable=True),
        sa.Column("current_step_index", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_steps", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("completed_steps", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_cost_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("latency_ms", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ai_wf_exec_org_status", "ai_workflow_executions", ["organization_id", "status"])

    # ===== 9. ai_agent_evaluations =====
    op.create_table(
        "ai_agent_evaluations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_id", sa.String(36), nullable=True, index=True),
        sa.Column("execution_id", UUID(as_uuid=True), sa.ForeignKey("ai_agent_executions.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("workflow_execution_id", UUID(as_uuid=True), nullable=True),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("answer", sa.Text, nullable=False),
        sa.Column("context", sa.Text, nullable=True),
        sa.Column("citations", sa.JSON, nullable=True),
        sa.Column("groundedness", sa.Float, nullable=True),
        sa.Column("faithfulness", sa.Float, nullable=True),
        sa.Column("answer_relevance", sa.Float, nullable=True),
        sa.Column("context_precision", sa.Float, nullable=True),
        sa.Column("tool_accuracy", sa.Float, nullable=True),
        sa.Column("hallucination_rate", sa.Float, nullable=True),
        sa.Column("success", sa.Boolean, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("cost_cents", sa.Integer, nullable=True),
        sa.Column("total_tokens", sa.Integer, nullable=True),
        sa.Column("user_rating", sa.Integer, nullable=True),
        sa.Column("user_feedback", sa.Text, nullable=True),
        sa.Column("eval_method", sa.String(20), nullable=False, server_default=sa.text("'auto'")),
        sa.Column("eval_model", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ai_evals_org_created", "ai_agent_evaluations", ["organization_id", "created_at"])
    op.create_index("ix_ai_evals_org_agent", "ai_agent_evaluations", ["organization_id", "agent_id"])

    # ===== 10. Add columns to ai_agent_configs =====
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS system_prompt TEXT NULL;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS instructions TEXT NULL;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 30;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS context_window INTEGER NOT NULL DEFAULT 4096;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS memory_config JSONB NOT NULL DEFAULT '{}'::json;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS guardrails JSONB NOT NULL DEFAULT '{}'::json;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS created_by VARCHAR(36) NULL;")
    op.execute("ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS slug VARCHAR(100) NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ai_agent_configs_org_archived ON ai_agent_configs (organization_id, is_archived);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ai_agent_configs_org_published ON ai_agent_configs (organization_id, is_published);")

    # ===== 11. Seed default agent templates =====
    op.execute("""
        INSERT INTO ai_agent_templates (id, organization_id, name, slug, description, category, config, is_published, is_system, clone_count, tags, icon, created_at, updated_at)
        VALUES
        (gen_random_uuid(), NULL, 'Customer Support Agent', 'customer-support', 'Handles customer queries with knowledge base grounding', 'support',
         '{"agent_type":"support","system_prompt":"You are a helpful customer support agent. Answer questions based on the knowledge base. If you don''t know, say so.","llm_provider":"openai","model":"gpt-4o-mini","temperature":0.3,"max_tokens":2000,"enable_rag":true,"enable_memory":true,"enable_tool_calling":true,"enable_safety_filter":true}',
         true, true, 0, '["support","customer","help"]', 'bot', now(), now()),
        (gen_random_uuid(), NULL, 'Sales Assistant', 'sales-assistant', 'Helps with product recommendations and pricing', 'sales',
         '{"agent_type":"sales","system_prompt":"You are a knowledgeable sales assistant. Recommend products based on customer needs. Always cite product information.","llm_provider":"openai","model":"gpt-4o-mini","temperature":0.5,"max_tokens":2000,"enable_rag":true,"enable_memory":true,"enable_tool_calling":true,"enable_safety_filter":true}',
         true, true, 0, '["sales","products","recommendations"]', 'shopping-cart', now(), now()),
        (gen_random_uuid(), NULL, 'Knowledge Researcher', 'knowledge-researcher', 'Researches and summarizes information from the knowledge base', 'research',
         '{"agent_type":"knowledge","system_prompt":"You are a research assistant. Search the knowledge base thoroughly, provide detailed answers with citations, and suggest follow-up questions.","llm_provider":"openai","model":"gpt-4o","temperature":0.2,"max_tokens":4000,"enable_rag":true,"enable_memory":true,"enable_tool_calling":true,"enable_safety_filter":true}',
         true, true, 0, '["research","knowledge","analysis"]', 'search', now(), now()),
        (gen_random_uuid(), NULL, 'Workflow Supervisor', 'workflow-supervisor', 'Orchestrates multi-agent workflows by routing tasks to specialized agents', 'supervisor',
         '{"agent_type":"supervisor","system_prompt":"You are a workflow supervisor. Analyze the user request, break it into subtasks, and delegate to the appropriate agents. Synthesize their responses into a coherent answer.","llm_provider":"openai","model":"gpt-4o","temperature":0.3,"max_tokens":4000,"enable_rag":false,"enable_memory":true,"enable_tool_calling":true,"enable_safety_filter":true}',
         true, true, 0, '["workflow","orchestration","supervisor"]', 'network', now(), now())
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    for col in ["slug", "created_by", "guardrails", "memory_config", "context_window",
                "max_retries", "timeout_seconds", "instructions", "system_prompt",
                "avatar_url", "published_at", "is_published", "archived_at", "is_archived", "version"]:
        op.execute(f"ALTER TABLE ai_agent_configs DROP COLUMN IF EXISTS {col};")
    op.execute("DROP INDEX IF EXISTS ix_ai_agent_configs_org_published;")
    op.execute("DROP INDEX IF EXISTS ix_ai_agent_configs_org_archived;")
    op.drop_table("ai_agent_evaluations")
    op.drop_table("ai_workflow_executions")
    op.drop_table("ai_workflow_definitions")
    op.drop_table("ai_agent_tools")
    op.drop_table("ai_agent_knowledge")
    op.drop_index("ix_ai_templates_published", table_name="ai_agent_templates")
    op.drop_index("uq_ai_templates_org_slug", table_name="ai_agent_templates")
    op.drop_table("ai_agent_templates")
    op.drop_table("ai_agent_memory")
    op.drop_table("ai_agent_executions")
    op.drop_table("ai_agent_versions")

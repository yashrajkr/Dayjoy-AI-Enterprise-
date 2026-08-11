"""phase 4 ai platform

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-15 00:03:00.000000

Phase 4 — Enterprise AI Platform:

- ai_prompts + ai_prompt_versions (Module 2: Prompt Management)
- ai_conversations + ai_conversation_turns (Module 3: Conversation Memory)
- ai_tool_definitions + ai_tool_call_logs (Module 4: Tool Calling)
- ai_agent_configs (Module 5: Multi-Agent Orchestrator)
- rag_documents + rag_chunks + rag_embeddings (Module 6: RAG)
- ai_eval_runs + ai_eval_results (Module 8: AI Evaluation)
- ai_configs (Module 9: AI Configuration)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== Module 2: Prompt Management =====
    op.create_table(
        "ai_prompts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("name", sa.String(100), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("prompt_type", sa.String(20), server_default="system", nullable=False),
        sa.Column("current_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("environment", sa.String(20), server_default="dev", nullable=False),
        sa.Column("variables", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
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
        "ai_prompt_versions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("prompt_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("change_summary", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("test_score", sa.Float(), nullable=True),
        sa.Column("test_notes", sa.Text(), nullable=True),
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

    # ===== Module 3: Conversation Memory =====
    op.create_table(
        "ai_conversations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("channel", sa.String(20), server_default="web", nullable=False),
        sa.Column("agent_type", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.Column("context", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("long_term_memory", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("user_preferences", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("total_tokens_in", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_tokens_out", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
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
        "ai_conversation_turns",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("turn_number", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("agent_type", sa.String(50), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("tokens_in", sa.Integer(), server_default="0", nullable=False),
        sa.Column("tokens_out", sa.Integer(), server_default="0", nullable=False),
        sa.Column("latency_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("tool_calls", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("retrieved_chunks", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("citations", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("was_filtered", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("filter_reason", sa.String(200), nullable=True),
        sa.Column("cost_cents", sa.Integer(), server_default="0", nullable=False),
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

    # ===== Module 4: Tool Calling =====
    op.create_table(
        "ai_tool_definitions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("handler", sa.String(255), nullable=False),
        sa.Column("input_schema", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("output_schema", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("allowed_agents", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("is_destructive", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "requires_approval", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("rate_limit", sa.Integer(), server_default="60", nullable=False),
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
        "ai_tool_call_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("turn_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tool_name", sa.String(100), nullable=False, index=True),
        sa.Column("agent_type", sa.String(50), nullable=True),
        sa.Column("input", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("output", postgresql.JSON(astext_type=sa.Text()), nullable=True),
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

    # ===== Module 5: Agent Configs =====
    op.create_table(
        "ai_agent_configs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("agent_type", sa.String(50), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("llm_provider", sa.String(50), server_default="openai", nullable=False),
        sa.Column("model", sa.String(100), server_default="gpt-4o-mini", nullable=False),
        sa.Column("temperature", sa.Float(), server_default="0.2", nullable=False),
        sa.Column("max_tokens", sa.Integer(), server_default="2000", nullable=False),
        sa.Column("prompt_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("allowed_tools", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("enable_rag", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("enable_memory", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "enable_tool_calling", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "enable_safety_filter", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("confidence_threshold", sa.Float(), server_default="0.55", nullable=False),
        sa.Column("latency_budget_ms", sa.Integer(), server_default="2000", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
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

    # ===== Module 6: RAG =====
    op.create_table(
        "rag_documents",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("source_uri", sa.Text(), nullable=True),
        sa.Column("content_sha256", sa.String(64), nullable=True, index=True),
        sa.Column("format", sa.String(20), nullable=False),
        sa.Column("category", sa.String(100), nullable=True, index=True),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), server_default="uploaded", nullable=False, index=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("chunk_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("parent_document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True),
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
        "rag_chunks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("heading_path", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=True),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("embedding_model", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), server_default="ready", nullable=False),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
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
        "rag_embeddings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("chunk_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("model_id", sa.String(100), nullable=False),
        sa.Column("model_version", sa.String(50), nullable=False),
        # NOTE: In production with pgvector, this would be: sa.Column("embedding", Vector(1536))
        # For now, we use JSON for cross-DB compatibility
        sa.Column("embedding", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
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

    # ===== Module 8: AI Evaluation =====
    op.create_table(
        "ai_eval_runs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("eval_type", sa.String(50), nullable=False),
        sa.Column("config", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("total_queries", sa.Integer(), server_default="0", nullable=False),
        sa.Column("passed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("metrics", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("status", sa.String(20), server_default="running", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
        "ai_eval_results",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("eval_run_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("response", sa.Text(), nullable=False),
        sa.Column("expected", sa.Text(), nullable=True),
        sa.Column("accuracy", sa.Float(), nullable=True),
        sa.Column("grounding", sa.Float(), nullable=True),
        sa.Column("relevance", sa.Float(), nullable=True),
        sa.Column("hallucination_score", sa.Float(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("tokens_in", sa.Integer(), nullable=True),
        sa.Column("tokens_out", sa.Integer(), nullable=True),
        sa.Column("cost_cents", sa.Integer(), nullable=True),
        sa.Column("tool_calls", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("tool_success", sa.Boolean(), nullable=True),
        sa.Column("has_citation", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("citation_correct", sa.Boolean(), nullable=True),
        sa.Column("passed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
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

    # ===== Module 9: AI Configuration =====
    op.create_table(
        "ai_configs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("llm_provider", sa.String(50), server_default="openai", nullable=False),
        sa.Column("default_model", sa.String(100), server_default="gpt-4o-mini", nullable=False),
        sa.Column("fallback_model", sa.String(100), server_default="gpt-4o", nullable=False),
        sa.Column("default_temperature", sa.Float(), server_default="0.2", nullable=False),
        sa.Column("default_max_tokens", sa.Integer(), server_default="2000", nullable=False),
        sa.Column("memory_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("short_term_turns", sa.Integer(), server_default="10", nullable=False),
        sa.Column(
            "long_term_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("rag_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("rag_top_k", sa.Integer(), server_default="5", nullable=False),
        sa.Column("rag_confidence_threshold", sa.Float(), server_default="0.55", nullable=False),
        sa.Column(
            "embedding_model",
            sa.String(100),
            server_default="text-embedding-3-small",
            nullable=False,
        ),
        sa.Column(
            "safety_filter_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "prompt_injection_filter", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("pii_redaction", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("max_requests_per_minute", sa.Integer(), server_default="100", nullable=False),
        sa.Column(
            "enabled_agents",
            postgresql.JSON(astext_type=sa.Text()),
            server_default='["support", "knowledge", "escalation"]',
        ),
        sa.Column(
            "enabled_tools",
            postgresql.JSON(astext_type=sa.Text()),
            server_default='["customer_lookup", "product_search", "knowledge_search"]',
        ),
        sa.Column("daily_budget_cents", sa.Integer(), server_default="1000", nullable=False),
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

    # ===== Seed default tools =====
    tools_data = [
        (
            "customer_lookup",
            "Customer Lookup",
            "Look up a customer by email, phone, or ID",
            "app.ai.tools.business:lookup_customer",
            False,
            False,
        ),
        (
            "product_search",
            "Product Search",
            "Search the product catalogue",
            "app.ai.tools.business:search_products",
            False,
            False,
        ),
        (
            "knowledge_search",
            "Knowledge Search",
            "Search the knowledge base (RAG)",
            "app.ai.tools.rag:knowledge_search",
            False,
            False,
        ),
        (
            "ticket_create",
            "Create Ticket",
            "Create a support ticket",
            "app.ai.tools.business:create_ticket",
            False,
            True,
        ),
        (
            "crm_search",
            "CRM Search",
            "Search CRM records",
            "app.ai.tools.business:crm_search",
            False,
            False,
        ),
        (
            "notification_send",
            "Send Notification",
            "Send a notification to a user",
            "app.ai.tools.business:send_notification",
            False,
            True,
        ),
    ]
    tools_table = sa.table(
        "ai_tool_definitions",
        sa.column("name", sa.String),
        sa.column("display_name", sa.String),
        sa.column("description", sa.Text),
        sa.column("handler", sa.String),
        sa.column("is_destructive", sa.Boolean),
        sa.column("requires_approval", sa.Boolean),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        tools_table,
        [
            {
                "name": n,
                "display_name": d,
                "description": desc,
                "handler": h,
                "is_destructive": destr,
                "requires_approval": appr,
                "is_active": True,
            }
            for n, d, desc, h, destr, appr in tools_data
        ],
    )

    # ===== Seed default agent configs =====
    agents_data = [
        (
            "support",
            "Support Agent",
            "Handles customer support queries",
            ["customer_lookup", "product_search", "knowledge_search", "ticket_create"],
        ),
        (
            "sales",
            "Sales Agent",
            "Qualifies leads and recommends products",
            ["product_search", "customer_lookup", "notification_send"],
        ),
        ("knowledge", "Knowledge Agent", "Answers from knowledge base (RAG)", ["knowledge_search"]),
        ("escalation", "Escalation Agent", "Escalates to human when needed", ["notification_send"]),
        ("crm", "CRM Agent", "Manages CRM records", ["crm_search", "customer_lookup"]),
    ]
    agents_table = sa.table(
        "ai_agent_configs",
        sa.column("agent_type", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("allowed_agents", sa.Text),
        sa.column("is_active", sa.Boolean),
    )
    # Actually use allowed_tools column
    agents_table = sa.table(
        "ai_agent_configs",
        sa.column("agent_type", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("allowed_tools", postgresql.JSON(astext_type=sa.Text())),
        sa.column("is_active", sa.Boolean),
    )
    import json

    op.bulk_insert(
        agents_table,
        [
            {
                "agent_type": at,
                "name": n,
                "description": desc,
                "allowed_tools": json.dumps(tools),
                "is_active": True,
            }
            for at, n, desc, tools in agents_data
        ],
    )


def downgrade() -> None:
    op.drop_table("ai_configs")
    op.drop_table("ai_eval_results")
    op.drop_table("ai_eval_runs")
    op.drop_table("rag_embeddings")
    op.drop_table("rag_chunks")
    op.drop_table("rag_documents")
    op.drop_table("ai_agent_configs")
    op.drop_table("ai_tool_call_logs")
    op.drop_table("ai_tool_definitions")
    op.drop_table("ai_conversation_turns")
    op.drop_table("ai_conversations")
    op.drop_table("ai_prompt_versions")
    op.drop_table("ai_prompts")

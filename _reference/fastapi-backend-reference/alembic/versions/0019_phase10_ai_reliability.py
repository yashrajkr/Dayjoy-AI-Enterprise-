"""Phase 10: AI Reliability Platform — prompt registry, LLM tracing, guardrails, evaluation, cost analytics.

Revision ID: 0019
Revises: 0018
"""

from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ===== 1. prompt_registry =====
    op.create_table(
        "prompt_registry",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=True, index=True),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("system_prompt", sa.Text, nullable=True),
        sa.Column("user_prompt_template", sa.Text, nullable=False),
        sa.Column("variables", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("default_model", sa.String(100), nullable=True),
        sa.Column("default_temperature", sa.Float, nullable=False, server_default=sa.text("0.3")),
        sa.Column("default_max_tokens", sa.Integer, nullable=False, server_default=sa.text("2000")),
        sa.Column("current_version", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_encrypted", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_prompt_registry_org_slug", "prompt_registry", ["organization_id", "slug"], unique=True)
    op.create_index("ix_prompt_registry_org_status", "prompt_registry", ["organization_id", "status"])

    # ===== 2. prompt_registry_versions =====
    op.create_table(
        "prompt_registry_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("prompt_id", UUID(as_uuid=True), sa.ForeignKey("prompt_registry.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("system_prompt", sa.Text, nullable=True),
        sa.Column("user_prompt_template", sa.Text, nullable=False),
        sa.Column("variables", sa.JSON, nullable=True),
        sa.Column("change_summary", sa.String(500), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("approval_status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("approved_by", sa.String(36), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("test_score", sa.Float, nullable=True),
        sa.Column("test_notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_prompt_reg_versions_prompt_version", "prompt_registry_versions", ["prompt_id", "version"], unique=True)

    # ===== 3. prompt_experiments =====
    op.create_table(
        "prompt_experiments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("prompt_id", UUID(as_uuid=True), sa.ForeignKey("prompt_registry.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prompt_version", sa.Integer, nullable=True),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("temperature", sa.Float, nullable=False, server_default=sa.text("0.3")),
        sa.Column("max_tokens", sa.Integer, nullable=False, server_default=sa.text("2000")),
        sa.Column("input_variables", sa.JSON, nullable=True),
        sa.Column("output", sa.Text, nullable=True),
        sa.Column("input_tokens", sa.Integer, nullable=True),
        sa.Column("output_tokens", sa.Integer, nullable=True),
        sa.Column("cost_cents", sa.Integer, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("quality_score", sa.Float, nullable=True),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_prompt_exp_org_created", "prompt_experiments", ["organization_id", "created_at"])

    # ===== 4. llm_requests =====
    op.create_table(
        "llm_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("agent_id", sa.String(36), nullable=True, index=True),
        sa.Column("workflow_execution_id", sa.String(36), nullable=True),
        sa.Column("trace_id", sa.String(64), nullable=False, index=True),
        sa.Column("span_id", sa.String(64), nullable=False),
        sa.Column("parent_span_id", sa.String(64), nullable=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("system_prompt", sa.Text, nullable=True),
        sa.Column("user_input", sa.Text, nullable=False),
        sa.Column("context", sa.Text, nullable=True),
        sa.Column("retrieved_docs", sa.JSON, nullable=True),
        sa.Column("tools_used", sa.JSON, nullable=True),
        sa.Column("output", sa.Text, nullable=True),
        sa.Column("citations", sa.JSON, nullable=True),
        sa.Column("temperature", sa.Float, nullable=True),
        sa.Column("max_tokens", sa.Integer, nullable=True),
        sa.Column("input_tokens", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("output_tokens", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("cost_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("latency_ms", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'completed'")),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("confidence_score", sa.Float, nullable=True),
        sa.Column("hallucination_score", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_llm_req_org_created", "llm_requests", ["organization_id", "created_at"])
    op.create_index("ix_llm_req_trace", "llm_requests", ["trace_id"])
    op.create_index("ix_llm_req_org_agent", "llm_requests", ["organization_id", "agent_id"])

    # ===== 5. llm_traces =====
    op.create_table(
        "llm_traces",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("trace_id", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("spans", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("total_duration_ms", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_cost_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'completed'")),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ===== 6. guardrail_events =====
    op.create_table(
        "guardrail_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("trace_id", sa.String(64), nullable=True, index=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("guardrail_type", sa.String(50), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("input", sa.Text, nullable=True),
        sa.Column("output", sa.Text, nullable=True),
        sa.Column("action", sa.String(20), nullable=False, server_default=sa.text("'block'")),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("severity", sa.String(20), nullable=False, server_default=sa.text("'warning'")),
        sa.Column("details", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_guardrail_org_type", "guardrail_events", ["organization_id", "guardrail_type"])

    # ===== 7. evaluation_runs =====
    op.create_table(
        "evaluation_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("eval_type", sa.String(30), nullable=False),
        sa.Column("prompt_id", UUID(as_uuid=True), nullable=True),
        sa.Column("prompt_version", sa.Integer, nullable=True),
        sa.Column("agent_id", sa.String(36), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("dataset_id", UUID(as_uuid=True), nullable=True),
        sa.Column("total_samples", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("completed_samples", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("results", sa.JSON, nullable=True),
        sa.Column("avg_correctness", sa.Float, nullable=True),
        sa.Column("avg_groundedness", sa.Float, nullable=True),
        sa.Column("avg_faithfulness", sa.Float, nullable=True),
        sa.Column("avg_relevance", sa.Float, nullable=True),
        sa.Column("avg_hallucination_score", sa.Float, nullable=True),
        sa.Column("avg_latency_ms", sa.Float, nullable=True),
        sa.Column("avg_cost_cents", sa.Float, nullable=True),
        sa.Column("pass_rate", sa.Float, nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_eval_runs_org_created", "evaluation_runs", ["organization_id", "created_at"])

    # ===== 8. golden_datasets =====
    op.create_table(
        "golden_datasets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("dataset_type", sa.String(30), nullable=False, server_default=sa.text("'golden'")),
        sa.Column("samples", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("total_samples", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_golden_ds_org_type", "golden_datasets", ["organization_id", "dataset_type"])

    # ===== 9. cost_reports =====
    op.create_table(
        "cost_reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_cost_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("total_requests", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("cost_by_model", sa.JSON, nullable=True),
        sa.Column("cost_by_agent", sa.JSON, nullable=True),
        sa.Column("cost_by_workflow", sa.JSON, nullable=True),
        sa.Column("cost_by_user", sa.JSON, nullable=True),
        sa.Column("cost_by_day", sa.JSON, nullable=True),
        sa.Column("forecast_next_month_cents", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_cost_reports_org_period", "cost_reports", ["organization_id", "period_start"])


def downgrade() -> None:
    op.drop_table("cost_reports")
    op.drop_table("golden_datasets")
    op.drop_table("evaluation_runs")
    op.drop_table("guardrail_events")
    op.drop_table("llm_traces")
    op.drop_table("llm_requests")
    op.drop_table("prompt_experiments")
    op.drop_table("prompt_registry_versions")
    op.drop_index("uq_prompt_registry_org_slug", table_name="prompt_registry")
    op.drop_table("prompt_registry")

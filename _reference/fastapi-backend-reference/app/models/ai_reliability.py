"""AI Reliability Platform models — prompt registry, LLM tracing, guardrails, evaluation, cost."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, BigInteger, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


class PromptRegistry(UUIDMixin, TimestampMixin, Base):
    """A managed prompt in the prompt library — with versioning, approval, publishing."""
    __tablename__ = "prompt_registry"
    __table_args__ = (
        Index("uq_prompt_registry_org_slug", "organization_id", "slug", unique=True),
        Index("ix_prompt_registry_org_status", "organization_id", "status"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    default_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    default_temperature: Mapped[float] = mapped_column(Float, default=0.3, nullable=False)
    default_max_tokens: Mapped[int] = mapped_column(Integer, default=2000, nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class PromptRegistryVersion(UUIDMixin, Base):
    """A versioned snapshot of a prompt in the registry."""
    __tablename__ = "prompt_registry_versions"
    __table_args__ = (Index("ix_prompt_reg_versions_prompt_version", "prompt_id", "version", unique=True),)

    prompt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("prompt_registry.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approval_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    test_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    test_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PromptExperiment(UUIDMixin, Base):
    """A playground experiment — testing prompts with different models/temps/configs."""
    __tablename__ = "prompt_experiments"
    __table_args__ = (Index("ix_prompt_exp_org_created", "organization_id", "created_at"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("prompt_registry.id", ondelete="SET NULL"), nullable=True)
    prompt_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.3, nullable=False)
    max_tokens: Mapped[int] = mapped_column(Integer, default=2000, nullable=False)
    input_variables: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LLMRequest(UUIDMixin, Base):
    """A single LLM API call — fully logged for observability + cost tracking."""
    __tablename__ = "llm_requests"
    __table_args__ = (
        Index("ix_llm_req_org_created", "organization_id", "created_at"),
        Index("ix_llm_req_trace", "trace_id"),
        Index("ix_llm_req_org_agent", "organization_id", "agent_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    workflow_execution_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    span_id: Mapped[str] = mapped_column(String(64), nullable=False)
    parent_span_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_input: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    retrieved_docs: Mapped[list | None] = mapped_column(JSONBType, nullable=True)
    tools_used: Mapped[list | None] = mapped_column(JSONBType, nullable=True)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    citations: Mapped[list | None] = mapped_column(JSONBType, nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="completed", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    hallucination_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LLMTrace(UUIDMixin, Base):
    """A distributed trace spanning multiple spans (workflow → agent → LLM → DB → vector)."""
    __tablename__ = "llm_traces"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    spans: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    total_duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="completed", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class GuardrailEvent(UUIDMixin, Base):
    """A guardrail event — input/output safety check result."""
    __tablename__ = "guardrail_events"
    __table_args__ = (Index("ix_guardrail_org_type", "organization_id", "guardrail_type"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    guardrail_type: Mapped[str] = mapped_column(String(50), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # input, output
    input: Mapped[str | None] = mapped_column(Text, nullable=True)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    action: Mapped[str] = mapped_column(String(20), default="block", nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="warning", nullable=False)
    details: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EvaluationRun(UUIDMixin, Base):
    """An evaluation run — tests prompts/agents against datasets with 14 metrics."""
    __tablename__ = "evaluation_runs"
    __table_args__ = (Index("ix_eval_runs_org_created", "organization_id", "created_at"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    eval_type: Mapped[str] = mapped_column(String(30), nullable=False)
    prompt_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    prompt_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    total_samples: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_samples: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    results: Mapped[list | None] = mapped_column(JSONBType, nullable=True)
    avg_correctness: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_groundedness: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_faithfulness: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_relevance: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_hallucination_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_cost_cents: Mapped[float | None] = mapped_column(Float, nullable=True)
    pass_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class GoldenDataset(UUIDMixin, TimestampMixin, Base):
    """A test dataset for evaluation — golden, regression, adversarial, benchmark."""
    __tablename__ = "golden_datasets"
    __table_args__ = (Index("ix_golden_ds_org_type", "organization_id", "dataset_type"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dataset_type: Mapped[str] = mapped_column(String(30), default="golden", nullable=False)
    samples: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    total_samples: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class CostReport(UUIDMixin, Base):
    """A periodic cost report — per-org breakdown by model/agent/workflow/user/day."""
    __tablename__ = "cost_reports"
    __table_args__ = (Index("ix_cost_reports_org_period", "organization_id", "period_start"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    total_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_by_model: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    cost_by_agent: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    cost_by_workflow: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    cost_by_user: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    cost_by_day: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    forecast_next_month_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

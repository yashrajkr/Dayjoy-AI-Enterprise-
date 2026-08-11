"""AI Agent Platform models — versions, executions, memory, templates, bindings, workflows, evaluations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


class AgentVersion(UUIDMixin, Base):
    __tablename__ = "ai_agent_versions"
    __table_args__ = (Index("ix_ai_agent_versions_agent_version", "agent_id", "version", unique=True),)

    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    config_snapshot: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentExecution(UUIDMixin, Base):
    __tablename__ = "ai_agent_executions"
    __table_args__ = (
        Index("ix_ai_executions_org_created", "organization_id", "created_at"),
        Index("ix_ai_executions_org_status", "organization_id", "status"),
        Index("ix_ai_executions_agent_created", "agent_id", "created_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("ai_agent_configs.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    input_message: Mapped[str] = mapped_column(Text, nullable=False)
    input_metadata: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    output_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_metadata: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    llm_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tool_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retrieval_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tool_calls_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tool_calls: Mapped[list | None] = mapped_column(JSONBType, nullable=True)
    retrieved_chunks_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    citations: Mapped[list | None] = mapped_column(JSONBType, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    workflow_execution_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    workflow_step_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentMemory(UUIDMixin, Base):
    __tablename__ = "ai_agent_memory"
    __table_args__ = (
        Index("ix_ai_memory_org_type", "organization_id", "memory_type"),
        Index("ix_ai_memory_org_agent_user", "organization_id", "agent_id", "user_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    memory_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONBType, default=dict, nullable=False)
    importance: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentTemplate(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_agent_templates"
    __table_args__ = (
        Index("uq_ai_templates_org_slug", "organization_id", "slug", unique=True),
        Index("ix_ai_templates_published", "is_published", "category"),
    )

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    config: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    author_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    clone_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_sum: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tags: Mapped[list] = mapped_column(JSONBType, default=list)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)


class AgentKnowledge(UUIDMixin, Base):
    __tablename__ = "ai_agent_knowledge"
    __table_args__ = (Index("uq_ai_agent_knowledge_agent_coll", "agent_id", "collection_name", unique=True),)

    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    collection_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    filter_config: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentTool(UUIDMixin, Base):
    __tablename__ = "ai_agent_tools"
    __table_args__ = (Index("uq_ai_agent_tools_agent_tool", "agent_id", "tool_id", unique=True),)

    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=False, index=True)
    tool_id: Mapped[str] = mapped_column(String(36), ForeignKey("ai_tool_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rate_limit_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AIWorkflowDefinition(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_workflow_definitions"
    __table_args__ = (Index("ix_ai_wf_defs_org_active", "organization_id", "is_active"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    steps: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)
    trigger_config: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class AIWorkflowExecution(UUIDMixin, Base):
    __tablename__ = "ai_workflow_executions"
    __table_args__ = (Index("ix_ai_wf_exec_org_status", "organization_id", "status"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_workflow_definitions.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    input_context: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    output_context: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    step_results: Mapped[list | None] = mapped_column(JSONBType, nullable=True)
    current_step_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_steps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_steps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentEvaluation(UUIDMixin, Base):
    __tablename__ = "ai_agent_evaluations"
    __table_args__ = (
        Index("ix_ai_evals_org_created", "organization_id", "created_at"),
        Index("ix_ai_evals_org_agent", "organization_id", "agent_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    execution_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_agent_executions.id", ondelete="CASCADE"), nullable=True, index=True)
    workflow_execution_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    citations: Mapped[list | None] = mapped_column(JSONBType, nullable=True)
    groundedness: Mapped[float | None] = mapped_column(Float, nullable=True)
    faithfulness: Mapped[float | None] = mapped_column(Float, nullable=True)
    answer_relevance: Mapped[float | None] = mapped_column(Float, nullable=True)
    context_precision: Mapped[float | None] = mapped_column(Float, nullable=True)
    tool_accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    hallucination_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    eval_method: Mapped[str] = mapped_column(String(20), default="auto", nullable=False)
    eval_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

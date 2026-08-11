"""Multi-Agent Orchestration models — task queue, history, communications, health."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, UUIDMixin


class TaskQueue(UUIDMixin, Base):
    """A queued task for agent execution — the central task dispatch table."""
    __tablename__ = "task_queue"
    __table_args__ = (
        Index("ix_task_queue_org_status", "organization_id", "status"),
        Index("ix_task_queue_org_priority", "organization_id", "priority", "status"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False)
    input: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    output: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    assigned_agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    planner_output: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    supervisor_output: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TaskHistory(UUIDMixin, Base):
    """Append-only event log for task execution — every state change is recorded."""
    __tablename__ = "task_history"
    __table_args__ = (Index("ix_task_history_org_ts", "organization_id", "timestamp"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_data: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentCommunication(UUIDMixin, Base):
    """Structured messages between agents — enables inter-agent collaboration."""
    __tablename__ = "agent_communications"
    __table_args__ = (Index("ix_agent_comms_org_task", "organization_id", "task_id"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    from_agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    to_agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    message_type: Mapped[str] = mapped_column(String(30), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentHealth(UUIDMixin, Base):
    """Per-agent health tracking — circuit breaker state, failure counts, avg latency/cost."""
    __tablename__ = "agent_health"
    __table_args__ = (Index("ix_agent_health_org_status", "organization_id", "status"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("ai_agent_configs.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="healthy", nullable=False)
    last_execution_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_executions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_cost_cents: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    circuit_breaker_state: Mapped[str] = mapped_column(String(20), default="closed", nullable=False)
    circuit_breaker_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

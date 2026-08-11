"""Enterprise Workflow Automation models — versions, variables, logs, queue, schedule."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


class WorkflowVersion(UUIDMixin, Base):
    """A versioned snapshot of a workflow definition for rollback + audit."""
    __tablename__ = "workflow_versions"
    __table_args__ = (Index("ix_wf_versions_wf_version", "workflow_id", "version", unique=True),)

    workflow_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    definition_snapshot: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkflowVariable(UUIDMixin, Base):
    """A variable in a workflow execution — stores state between nodes."""
    __tablename__ = "workflow_variables"
    __table_args__ = (
        Index("ix_wf_vars_org_wf", "organization_id", "workflow_id"),
        Index("ix_wf_vars_exec", "execution_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    workflow_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True, index=True)
    execution_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    var_type: Mapped[str] = mapped_column(String(20), default="string", nullable=False)
    value: Mapped[Any] = mapped_column(JSONBType, nullable=True)
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    scope: Mapped[str] = mapped_column(String(20), default="execution", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkflowLog(UUIDMixin, Base):
    """A detailed log entry for a single node execution within a workflow run."""
    __tablename__ = "workflow_logs"
    __table_args__ = (Index("ix_wf_logs_exec_ts", "execution_id", "timestamp"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=False, index=True)
    node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    node_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    level: Mapped[str] = mapped_column(String(20), default="info", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    input_data: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkflowQueueItem(UUIDMixin, Base):
    """A queued workflow execution — priority-based dispatch table."""
    __tablename__ = "workflow_queue"
    __table_args__ = (
        Index("ix_wf_queue_org_status", "organization_id", "status"),
        Index("ix_wf_queue_priority", "priority", "status", "scheduled_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    workflow_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True)
    execution_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=True, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False)
    input_data: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkflowSchedule(UUIDMixin, TimestampMixin, Base):
    """A schedule for recurring workflow execution — cron/daily/weekly/monthly."""
    __tablename__ = "workflow_schedule"
    __table_args__ = (
        Index("ix_wf_schedule_org_active", "organization_id", "is_active"),
        Index("ix_wf_schedule_next_run", "is_active", "next_run_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    workflow_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    schedule_type: Mapped[str] = mapped_column(String(20), nullable=False)
    cron_expression: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)
    input_data: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

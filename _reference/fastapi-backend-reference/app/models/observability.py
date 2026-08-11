"""Enterprise Observability models — Stage 2 Step 7.

Tables:
- system_metrics: time-series metric snapshots (for historical analysis)
- alerts: alert definitions + fired alerts
- alert_events: individual alert firings (history)
- monitoring_events: system events (health changes, deployments, etc.)
- error_reports: error tracking (Sentry-style grouping)
- performance_reports: periodic performance summaries

Tenant isolation:
Most observability data is system-wide (not per-tenant). Tables that could
be tenant-scoped (like cost reporting) have organization_id as nullable.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


# ====================================================================
# System Metrics (time-series snapshots for historical analysis)
# ====================================================================


class SystemMetric(UUIDMixin, TimestampMixin, Base):
    """A time-series metric snapshot.

    Prometheus handles real-time metrics; this table stores periodic
    snapshots for long-term historical analysis (e.g., trend charts
    in the admin dashboard without needing Grafana).
    """

    __tablename__ = "system_metrics"
    __table_args__ = (
        Index("ix_sys_metrics_name_time", "metric_name", "timestamp"),
        Index("ix_sys_metrics_category", "category"),
    )

    # Metric identity
    metric_name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    # system, application, ai, rag, voice, telephony, whatsapp, notification, database, redis

    # Value
    value: Mapped[float] = mapped_column(Float, nullable=False)

    # Labels (key-value pairs for dimensions)
    labels: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    # e.g. {"endpoint": "/api/v1/ai/chat", "method": "POST", "status": "200"}

    # Timing
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Optional tenant scope (for per-tenant metrics)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<SystemMetric {self.metric_name}={self.value}>"


# ====================================================================
# Alerts (definitions + fired alerts)
# ====================================================================


class Alert(UUIDMixin, TimestampMixin, Base):
    """An alert definition or a fired alert instance.

    Alert definitions are rules (e.g., "error_rate > 5% for 5 minutes").
    Fired alerts are instances where the rule was triggered.
    """

    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_org_status", "organization_id", "status"),
        Index("ix_alerts_severity", "severity"),
        Index("ix_alerts_category", "category"),
    )

    # Scope (system-wide or per-tenant)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Alert identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Category: system, application, ai, rag, voice, telephony, whatsapp, notification, database, redis, security
    category: Mapped[str] = mapped_column(String(50), nullable=False)

    # Severity: info, warning, error, critical
    severity: Mapped[str] = mapped_column(String(20), default="warning", nullable=False)

    # Rule definition
    # Format: {"metric": "http_error_rate", "operator": ">", "threshold": 0.05, "duration_seconds": 300}
    rule: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Status: active, firing, resolved, suppressed, disabled
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False
    )

    # Firing info (when status=firing)
    fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Notification
    notification_channels: Mapped[list] = mapped_column(JSONBType, default=list)
    # ["email", "webhook", "slack"]
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notification_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Auto-resolve
    auto_resolve: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    # Audit
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<Alert {self.name!r} severity={self.severity} status={self.status}>"


# ====================================================================
# Monitoring Events (system events log)
# ====================================================================


class MonitoringEvent(UUIDMixin, TimestampMixin, Base):
    """A system monitoring event.

    Events include:
    - Health status changes (healthy → degraded → down)
    - Deployments
    - Configuration changes
    - Alert firings + resolutions
    - Provider outages
    - Scale events
    """

    __tablename__ = "monitoring_events"
    __table_args__ = (
        Index("ix_mon_events_org_created", "organization_id", "created_at"),
        Index("ix_mon_events_type", "event_type"),
        Index("ix_mon_events_severity", "severity"),
    )

    # Scope
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Event identity
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # health_change, deployment, config_change, alert_fired, alert_resolved,
    # provider_outage, scale_event, error_spike

    # Details
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Severity: info, warning, error, critical
    severity: Mapped[str] = mapped_column(String(20), default="info", nullable=False)

    # Source: system, api, database, redis, ai, rag, voice, telephony, whatsapp, notification
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Payload (event-specific data)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Related alert (if event is from an alert)
    alert_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("alerts.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<MonitoringEvent {self.event_type} severity={self.severity}>"


# ====================================================================
# Error Reports (Sentry-style error tracking)
# ====================================================================


class ErrorReport(UUIDMixin, TimestampMixin, Base):
    """An error report (grouped by fingerprint for deduplication).

    Similar to Sentry's error grouping: errors with the same fingerprint
    (exception type + message hash + stack trace hash) are grouped.
    """

    __tablename__ = "error_reports"
    __table_args__ = (
        Index("ix_error_reports_fingerprint", "fingerprint"),
        Index("ix_error_reports_status", "status"),
        Index("ix_error_reports_org_created", "organization_id", "created_at"),
    )

    # Scope
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Error identity
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    # SHA256 of (exception_type + message + file + line)

    # Error details
    exception_type: Mapped[str] = mapped_column(String(255), nullable=False)
    exception_message: Mapped[str] = mapped_column(Text, nullable=False)
    stack_trace: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Context
    file: Mapped[str | None] = mapped_column(String(500), nullable=True)
    line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    function: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Module / service
    module: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # e.g. "app.ai.gateway", "app.whatsapp.service"

    # Request context
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    request_method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    request_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Sentry link
    sentry_event_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Status: unresolved, resolved, ignored
    status: Mapped[str] = mapped_column(
        String(20), default="unresolved", nullable=False
    )

    # Aggregation
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Affected users
    affected_user_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Environment
    environment: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Metadata (extra context)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<ErrorReport {self.exception_type} count={self.occurrence_count}>"


# ====================================================================
# Performance Reports (periodic summaries)
# ====================================================================


class PerformanceReport(UUIDMixin, TimestampMixin, Base):
    """A periodic performance summary (hourly/daily/weekly).

    Stores aggregated metrics for trend analysis without needing to
    query raw Prometheus data. Used by the admin dashboard.
    """

    __tablename__ = "performance_reports"
    __table_args__ = (
        Index("ix_perf_reports_org_period", "organization_id", "period_start"),
        Index("ix_perf_reports_category", "category"),
    )

    # Scope
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Period
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # hourly, daily, weekly, monthly

    # Category
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    # system, application, ai, rag, voice, telephony, whatsapp, notification, database, redis

    # Metrics (JSON — category-specific)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    # For application: {"request_count": 1234, "avg_latency_ms": 45, "error_rate": 0.02}
    # For ai: {"total_requests": 500, "avg_prompt_latency_ms": 200, "total_tokens": 150000, "cost_cents": 75}
    # For voice: {"total_calls": 50, "avg_duration_seconds": 120, "handoff_rate": 0.1}

    # Summary text (human-readable)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<PerformanceReport {self.category} {self.period_type} {self.period_start}>"

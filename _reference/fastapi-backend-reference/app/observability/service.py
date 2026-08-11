"""Observability Service — the main observability platform service.

Provides:
- Health aggregation (database, redis, providers, circuit breakers)
- System metrics collection + storage
- Alert management (CRUD + evaluation)
- Error report management (capture, group, resolve)
- Performance reporting
- Monitoring events
- Analytics aggregation (AI usage, cost, platform health)

This service is the single source of truth for observability data.
Business modules call it to report errors, metrics, and events.
"""

import hashlib
import uuid
from datetime import datetime, UTC, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.observability import (
    Alert,
    ErrorReport,
    MonitoringEvent,
    PerformanceReport,
    SystemMetric,
)

logger = get_logger(__name__)


class ObservabilityService:
    """Centralized observability service."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ====================================================================
    # Health
    # ====================================================================

    async def get_system_health(self) -> dict[str, Any]:
        """Get overall system health (aggregated from all subsystems)."""
        checks: dict[str, str] = {}
        all_healthy = True

        # Database
        try:
            from sqlalchemy import text
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                result = await session.execute(text("SELECT 1"))
                result.scalar_one()
            checks["database"] = "healthy"
        except Exception as e:
            checks["database"] = f"unhealthy: {e!s}"
            all_healthy = False

        # Redis
        try:
            import redis.asyncio as aioredis
            redis = aioredis.from_url(settings.REDIS_URL)
            await redis.ping()
            await redis.close()
            checks["redis"] = "healthy"
        except Exception:
            checks["redis"] = "degraded (non-critical)"

        # Circuit breakers
        try:
            from app.middleware.circuit_breaker import get_all_circuit_breaker_stats
            open_breakers = [
                cb["name"] for cb in get_all_circuit_breaker_stats() if cb["state"] == "open"
            ]
            checks["circuit_breakers"] = (
                "all_closed" if not open_breakers else f"open: {', '.join(open_breakers)}"
            )
            if open_breakers:
                all_healthy = False
        except Exception:
            checks["circuit_breakers"] = "unknown"

        # AI providers (check if at least one is configured)
        try:
            from app.ai.providers import get_available_providers
            providers = get_available_providers()
            checks["ai_providers"] = (
                f"healthy ({len(providers)} available)"
                if providers
                else "no providers configured"
            )
            if not providers:
                all_healthy = False
        except Exception:
            checks["ai_providers"] = "unknown"

        # Vector DB
        try:
            from app.ai.vector_store import get_vector_store
            vs = get_vector_store()
            checks["vector_db"] = f"healthy ({vs.name})"
        except Exception as e:
            checks["vector_db"] = f"unhealthy: {e!s}"
            all_healthy = False

        status = "ready" if all_healthy else "degraded"
        return {"status": status, "checks": checks}

    # ====================================================================
    # Metrics
    # ====================================================================

    async def record_metric(
        self,
        *,
        metric_name: str,
        value: float,
        category: str = "application",
        labels: dict[str, Any] | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> SystemMetric:
        """Record a system metric snapshot."""
        metric = SystemMetric(
            metric_name=metric_name,
            category=category,
            value=value,
            labels=labels or {},
            organization_id=str(organization_id) if organization_id else None,
        )
        self.db.add(metric)
        await self.db.flush()
        return metric

    async def get_metrics(
        self,
        *,
        category: str | None = None,
        metric_name: str | None = None,
        limit: int = 100,
    ) -> list[SystemMetric]:
        """Get recent metric snapshots."""
        conditions = []
        if category:
            conditions.append(SystemMetric.category == category)
        if metric_name:
            conditions.append(SystemMetric.metric_name == metric_name)
        result = await self.db.execute(
            select(SystemMetric)
            .where(*conditions)
            .order_by(SystemMetric.timestamp.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # ====================================================================
    # Alerts
    # ====================================================================

    async def create_alert(
        self,
        *,
        name: str,
        category: str,
        severity: str = "warning",
        rule: dict[str, Any] | None = None,
        notification_channels: list[str] | None = None,
        description: str | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> Alert:
        """Create an alert definition."""
        alert = Alert(
            organization_id=str(organization_id) if organization_id else None,
            name=name,
            description=description,
            category=category,
            severity=severity,
            rule=rule or {},
            notification_channels=notification_channels or ["email"],
            status="active",
        )
        self.db.add(alert)
        await self.db.flush()
        return alert

    async def list_alerts(
        self,
        *,
        status: str | None = None,
        category: str | None = None,
        limit: int = 50,
    ) -> list[Alert]:
        conditions = []
        if status:
            conditions.append(Alert.status == status)
        if category:
            conditions.append(Alert.category == category)
        result = await self.db.execute(
            select(Alert)
            .where(*conditions)
            .order_by(Alert.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def resolve_alert(self, alert_id: uuid.UUID) -> Alert:
        result = await self.db.execute(
            select(Alert).where(Alert.id == alert_id)
        )
        alert = result.scalar_one_or_none()
        if alert is None:
            from app.core.exceptions import NotFoundError
            raise NotFoundError(f"Alert {alert_id} not found")
        alert.status = "resolved"
        alert.resolved_at = datetime.now(UTC)
        await self.db.flush()

        # Emit monitoring event
        await self.record_event(
            event_type="alert_resolved",
            title=f"Alert resolved: {alert.name}",
            severity="info",
            source="alert_engine",
            payload={"alert_id": str(alert.id), "category": alert.category},
            alert_id=str(alert.id),
        )
        return alert

    # ====================================================================
    # Error Reports
    # ====================================================================

    async def capture_error(
        self,
        *,
        exception: Exception,
        organization_id: uuid.UUID | None = None,
        request_id: str | None = None,
        request_method: str | None = None,
        request_url: str | None = None,
        user_id: uuid.UUID | None = None,
        module: str | None = None,
        extra_context: dict[str, Any] | None = None,
    ) -> ErrorReport:
        """Capture an error, group it by fingerprint, and optionally send to Sentry."""
        import traceback

        exc_type = type(exception).__name__
        exc_message = str(exception)
        tb = traceback.format_exc()

        # Extract file + line from traceback
        file_path = None
        line_number = None
        function_name = None
        try:
            tb_list = traceback.extract_tb(exception.__traceback__)
            if tb_list:
                last_frame = tb_list[-1]
                file_path = last_frame.filename
                line_number = last_frame.lineno
                function_name = last_frame.name
        except Exception:
            pass

        # Compute fingerprint
        fingerprint_str = f"{exc_type}:{exc_message}:{file_path}:{line_number}"
        fingerprint = hashlib.sha256(fingerprint_str.encode()).hexdigest()

        # Check if error already exists (group)
        result = await self.db.execute(
            select(ErrorReport).where(ErrorReport.fingerprint == fingerprint)
        )
        error_report = result.scalar_one_or_none()

        if error_report is not None:
            # Increment occurrence count
            error_report.occurrence_count += 1
            error_report.last_seen = datetime.now(UTC)
            if user_id:
                error_report.affected_user_count += 1
        else:
            # Create new error report
            error_report = ErrorReport(
                organization_id=str(organization_id) if organization_id else None,
                fingerprint=fingerprint,
                exception_type=exc_type,
                exception_message=exc_message,
                stack_trace=tb,
                file=file_path,
                line=line_number,
                function=function_name,
                module=module,
                request_id=request_id,
                request_method=request_method,
                request_url=request_url,
                user_id=str(user_id) if user_id else None,
                status="unresolved",
                first_seen=datetime.now(UTC),
                last_seen=datetime.now(UTC),
                affected_user_count=1 if user_id else 0,
                environment=settings.ENVIRONMENT,
                metadata_=extra_context or {},
            )
            self.db.add(error_report)

        await self.db.flush()

        # Send to Sentry (if enabled)
        from app.observability.sentry_init import capture_exception
        capture_error_sentry(exception, error_report, extra_context)

        return error_report

    async def list_errors(
        self,
        *,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ErrorReport], int]:
        conditions = []
        if status:
            conditions.append(ErrorReport.status == status)

        count_stmt = select(func.count()).select_from(ErrorReport).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(ErrorReport)
            .where(*conditions)
            .order_by(ErrorReport.last_seen.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def resolve_error(self, error_id: uuid.UUID) -> ErrorReport:
        result = await self.db.execute(
            select(ErrorReport).where(ErrorReport.id == error_id)
        )
        error = result.scalar_one_or_none()
        if error is None:
            from app.core.exceptions import NotFoundError
            raise NotFoundError(f"Error report {error_id} not found")
        error.status = "resolved"
        await self.db.flush()
        return error

    # ====================================================================
    # Monitoring Events
    # ====================================================================

    async def record_event(
        self,
        *,
        event_type: str,
        title: str,
        severity: str = "info",
        source: str | None = None,
        payload: dict[str, Any] | None = None,
        description: str | None = None,
        organization_id: uuid.UUID | None = None,
        alert_id: str | None = None,
    ) -> MonitoringEvent:
        """Record a monitoring event."""
        event = MonitoringEvent(
            organization_id=str(organization_id) if organization_id else None,
            event_type=event_type,
            title=title,
            description=description,
            severity=severity,
            source=source,
            payload=payload or {},
            alert_id=alert_id,
        )
        self.db.add(event)
        await self.db.flush()
        return event

    async def list_events(
        self,
        *,
        event_type: str | None = None,
        severity: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[MonitoringEvent], int]:
        conditions = []
        if event_type:
            conditions.append(MonitoringEvent.event_type == event_type)
        if severity:
            conditions.append(MonitoringEvent.severity == severity)

        count_stmt = select(func.count()).select_from(MonitoringEvent).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(MonitoringEvent)
            .where(*conditions)
            .order_by(MonitoringEvent.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    # ====================================================================
    # Performance Reports
    # ====================================================================

    async def create_performance_report(
        self,
        *,
        period_start: datetime,
        period_end: datetime,
        period_type: str,
        category: str,
        metrics: dict[str, Any],
        summary: str | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> PerformanceReport:
        """Create a performance report."""
        report = PerformanceReport(
            organization_id=str(organization_id) if organization_id else None,
            period_start=period_start,
            period_end=period_end,
            period_type=period_type,
            category=category,
            metrics=metrics,
            summary=summary,
        )
        self.db.add(report)
        await self.db.flush()
        return report

    async def get_platform_summary(self) -> dict[str, Any]:
        """Get a real-time platform summary for the admin dashboard."""
        # Error count (unresolved)
        error_count_stmt = (
            select(func.count())
            .select_from(ErrorReport)
            .where(ErrorReport.status == "unresolved")
        )
        unresolved_errors = (await self.db.execute(error_count_stmt)).scalar_one()

        # Active alerts
        active_alerts_stmt = (
            select(func.count())
            .select_from(Alert)
            .where(Alert.status == "firing")
        )
        active_alerts = (await self.db.execute(active_alerts_stmt)).scalar_one()

        # Recent events (last 24h)
        cutoff = datetime.now(UTC) - timedelta(hours=24)
        events_stmt = (
            select(func.count())
            .select_from(MonitoringEvent)
            .where(MonitoringEvent.created_at >= cutoff)
        )
        recent_events = (await self.db.execute(events_stmt)).scalar_one()

        # Recent errors (last 24h)
        recent_errors_stmt = (
            select(func.count())
            .select_from(ErrorReport)
            .where(ErrorReport.last_seen >= cutoff)
        )
        recent_errors = (await self.db.execute(recent_errors_stmt)).scalar_one()

        return {
            "unresolved_errors": unresolved_errors,
            "active_alerts": active_alerts,
            "recent_events_24h": recent_events,
            "recent_errors_24h": recent_errors,
            "monitoring_enabled": settings.ENABLE_METRICS,
            "tracing_enabled": settings.ENABLE_TRACING,
            "sentry_enabled": settings.ENABLE_SENTRY,
        }


def capture_error_sentry(
    exception: Exception,
    error_report: ErrorReport,
    extra_context: dict[str, Any] | None,
) -> None:
    """Send error to Sentry (if initialized)."""
    from app.observability.sentry_init import capture_exception
    capture_exception(
        exception,
        error_report={
            "fingerprint": error_report.fingerprint,
            "occurrence_count": error_report.occurrence_count,
            "module": error_report.module,
        },
        **(extra_context or {}),
    )

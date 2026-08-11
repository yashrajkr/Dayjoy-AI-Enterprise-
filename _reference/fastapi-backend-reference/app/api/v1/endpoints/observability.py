"""Observability REST API endpoints (Stage 2 Step 7).

Endpoints:
- GET  /observability/health          — System health (aggregated)
- GET  /observability/metrics         — Recent metric snapshots
- POST /observability/metrics         — Record a metric
- GET  /observability/alerts          — List alerts
- POST /observability/alerts          — Create alert
- POST /observability/alerts/{id}/resolve — Resolve alert
- GET  /observability/errors          — List error reports
- POST /observability/errors/{id}/resolve — Resolve error
- POST /observability/errors/capture  — Capture an error
- GET  /observability/events          — List monitoring events
- POST /observability/events          — Record an event
- GET  /observability/summary         — Platform summary (dashboard)
- GET  /observability/performance     — List performance reports
- GET  /observability/config          — Public config
"""

import uuid
from typing import Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.core.logging import get_logger
from app.observability import ObservabilityService

logger = get_logger(__name__)

router = APIRouter()


# ===== Schemas =====


class RecordMetricRequest(BaseModel):
    metric_name: str = Field(..., min_length=1)
    value: float
    category: str = "application"
    labels: dict[str, Any] | None = None


class CreateAlertRequest(BaseModel):
    name: str = Field(..., min_length=1)
    category: str
    severity: str = "warning"
    rule: dict[str, Any] | None = None
    notification_channels: list[str] | None = None
    description: str | None = None


class CaptureErrorRequest(BaseModel):
    exception_type: str
    exception_message: str
    module: str | None = None
    request_id: str | None = None
    request_method: str | None = None
    request_url: str | None = None
    extra_context: dict[str, Any] | None = None


class RecordEventRequest(BaseModel):
    event_type: str
    title: str
    severity: str = "info"
    source: str | None = None
    payload: dict[str, Any] | None = None
    description: str | None = None


# ===== Health =====


@router.get("/health", summary="System health (aggregated)")
async def get_health() -> dict[str, Any]:
    svc = ObservabilityService(None)  # type: ignore
    return await svc.get_system_health()


# ===== Metrics =====


@router.get("/metrics", summary="Recent metric snapshots")
async def list_metrics(
    user: CurrentUser,
    db: DBSession,
    category: str | None = None,
    metric_name: str | None = None,
    limit: int = Query(100, ge=1, le=500),
) -> list[dict[str, Any]]:
    svc = ObservabilityService(db)
    metrics = await svc.get_metrics(category=category, metric_name=metric_name, limit=limit)
    return [
        {
            "id": str(m.id),
            "metric_name": m.metric_name,
            "category": m.category,
            "value": m.value,
            "labels": dict(m.labels or {}),
            "timestamp": m.timestamp.isoformat() if m.timestamp else "",
            "organization_id": m.organization_id,
        }
        for m in metrics
    ]


@router.post("/metrics", summary="Record a metric")
async def record_metric(
    request: RecordMetricRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    svc = ObservabilityService(db)
    metric = await svc.record_metric(
        metric_name=request.metric_name,
        value=request.value,
        category=request.category,
        labels=request.labels,
    )
    return {"id": str(metric.id), "metric_name": metric.metric_name, "value": metric.value}


# ===== Alerts =====


@router.get("/alerts", summary="List alerts")
async def list_alerts(
    user: CurrentUser,
    db: DBSession,
    status_filter: str | None = Query(None, alias="status"),
    category: str | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> list[dict[str, Any]]:
    svc = ObservabilityService(db)
    alerts = await svc.list_alerts(status=status_filter, category=category, limit=limit)
    return [
        {
            "id": str(a.id),
            "name": a.name,
            "description": a.description,
            "category": a.category,
            "severity": a.severity,
            "rule": dict(a.rule or {}),
            "status": a.status,
            "fired_at": a.fired_at.isoformat() if a.fired_at else None,
            "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
            "current_value": a.current_value,
            "notification_count": a.notification_count,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        }
        for a in alerts
    ]


@router.post("/alerts", status_code=status.HTTP_201_CREATED, summary="Create alert")
async def create_alert(
    request: CreateAlertRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    svc = ObservabilityService(db)
    alert = await svc.create_alert(
        name=request.name,
        category=request.category,
        severity=request.severity,
        rule=request.rule,
        notification_channels=request.notification_channels,
        description=request.description,
    )
    return {"id": str(alert.id), "name": alert.name, "status": alert.status}


@router.post("/alerts/{alert_id}/resolve", summary="Resolve alert")
async def resolve_alert(
    alert_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    svc = ObservabilityService(db)
    alert = await svc.resolve_alert(alert_id)
    return {"id": str(alert.id), "status": alert.status}


# ===== Errors =====


@router.get("/errors", summary="List error reports")
async def list_errors(
    user: CurrentUser,
    db: DBSession,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    svc = ObservabilityService(db)
    errors, total = await svc.list_errors(status=status_filter, limit=limit, offset=offset)
    return {
        "errors": [
            {
                "id": str(e.id),
                "exception_type": e.exception_type,
                "exception_message": e.exception_message[:200],
                "module": e.module,
                "file": e.file,
                "line": e.line,
                "status": e.status,
                "occurrence_count": e.occurrence_count,
                "first_seen": e.first_seen.isoformat() if e.first_seen else "",
                "last_seen": e.last_seen.isoformat() if e.last_seen else "",
                "affected_user_count": e.affected_user_count,
                "sentry_event_id": e.sentry_event_id,
            }
            for e in errors
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/errors/capture", summary="Capture an error")
async def capture_error(
    request: CaptureErrorRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    """Manually capture an error (for non-exception error reporting)."""
    svc = ObservabilityService(db)
    # Create a synthetic exception
    exc = Exception(request.exception_message)
    exc.__class__.__name__ = request.exception_type
    error_report = await svc.capture_error(
        exception=exc,
        request_id=request.request_id,
        request_method=request.request_method,
        request_url=request.request_url,
        module=request.module,
        extra_context=request.extra_context,
    )
    return {
        "id": str(error_report.id),
        "fingerprint": error_report.fingerprint,
        "occurrence_count": error_report.occurrence_count,
        "status": error_report.status,
    }


@router.post("/errors/{error_id}/resolve", summary="Resolve error")
async def resolve_error(
    error_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    svc = ObservabilityService(db)
    error = await svc.resolve_error(error_id)
    return {"id": str(error.id), "status": error.status}


# ===== Events =====


@router.get("/events", summary="List monitoring events")
async def list_events(
    user: CurrentUser,
    db: DBSession,
    event_type: str | None = None,
    severity: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    svc = ObservabilityService(db)
    events, total = await svc.list_events(
        event_type=event_type, severity=severity, limit=limit, offset=offset
    )
    return {
        "events": [
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "title": e.title,
                "description": e.description,
                "severity": e.severity,
                "source": e.source,
                "payload": dict(e.payload or {}),
                "created_at": e.created_at.isoformat() if e.created_at else "",
            }
            for e in events
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/events", status_code=status.HTTP_201_CREATED, summary="Record an event")
async def record_event(
    request: RecordEventRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    svc = ObservabilityService(db)
    event = await svc.record_event(
        event_type=request.event_type,
        title=request.title,
        severity=request.severity,
        source=request.source,
        payload=request.payload,
        description=request.description,
    )
    return {"id": str(event.id), "event_type": event.event_type}


# ===== Summary + Config =====


@router.get("/summary", summary="Platform summary (dashboard)")
async def get_summary(
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    svc = ObservabilityService(db)
    return await svc.get_platform_summary()


@router.get("/config", summary="Observability configuration (public)")
async def get_config() -> dict[str, Any]:
    return {
        "enable_metrics": settings.ENABLE_METRICS,
        "enable_tracing": settings.ENABLE_TRACING,
        "enable_sentry": settings.ENABLE_SENTRY,
        "prometheus_enabled": settings.PROMETHEUS_ENABLED,
        "sentry_configured": bool(settings.SENTRY_DSN),
        "otel_configured": bool(settings.OTEL_EXPORTER_ENDPOINT),
        "otel_service_name": settings.OTEL_SERVICE_NAME,
        "metrics_path": settings.METRICS_PATH,
        "alert_evaluation_interval": settings.ALERT_EVALUATION_INTERVAL_SECONDS,
        "log_level": settings.LOG_LEVEL,
        "environment": settings.ENVIRONMENT,
    }

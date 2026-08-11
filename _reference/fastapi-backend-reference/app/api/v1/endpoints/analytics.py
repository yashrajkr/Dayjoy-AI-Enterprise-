"""Analytics API endpoints.

Endpoints:
- KPIs: GET /analytics/kpis, GET /analytics/kpis/{name}, GET /analytics/kpis/{name}/trend
- Dashboards: GET /analytics/dashboards, GET /analytics/dashboards/{type}
- Insights: GET /analytics/insights, POST /analytics/insights/generate
- Forecasts: GET /analytics/forecasts/{metric}, GET /analytics/churn-risk
- Reports: GET /analytics/reports, POST /analytics/reports/{id}/generate
- Alerts: GET /analytics/alerts, POST /analytics/alerts/rules
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.insights_engine import ForecastEngine, InsightsEngine
from app.analytics.kpi_engine import KPIEngine
from app.api.deps import CurrentUser
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.analytics import (
    AlertEvent,
    AlertRule,
    Dashboard,
    Report,
    ReportExecution,
)

router = APIRouter()


# ===== Schemas =====


class InsightGenerateRequest(BaseModel):
    days: int = Field(default=7, ge=1, le=90)


class AlertRuleCreateRequest(BaseModel):
    name: str
    metric_name: str
    condition_type: str = "threshold"
    condition_config: dict = Field(default_factory=dict)
    severity: str = "warning"
    channels: list[str] = Field(default_factory=lambda: ["in_app"])
    recipients: list[str] = Field(default_factory=list)
    cooldown_minutes: int = 60


class ReportCreateRequest(BaseModel):
    name: str
    report_type: str
    format: str = "json"
    config: dict = Field(default_factory=dict)
    schedule_cron: str | None = None
    recipients: list[str] = Field(default_factory=list)


# ===== Helper =====


async def _get_org_id(db: AsyncSession, user) -> str | None:
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    return user_orgs[0].organization_id if user_orgs else None


# ===== KPIs =====


@router.get("/kpis", summary="Get all KPIs")
async def get_all_kpis(
    start_date: str | None = None,
    end_date: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """Get all KPI values for the current tenant."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    engine = KPIEngine(db)
    return await engine.compute_all_kpis(
        uuid.UUID(org_id), start_date=start_date, end_date=end_date
    )


@router.get("/kpis/{metric_name}", summary="Get a specific KPI")
async def get_kpi(
    metric_name: str,
    start_date: str | None = None,
    end_date: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Get a specific KPI value."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return {"error": "No organization"}
    engine = KPIEngine(db)
    return await engine.compute_kpi(
        uuid.UUID(org_id), metric_name, start_date=start_date, end_date=end_date
    )


@router.get("/kpis/{metric_name}/trend", summary="Get KPI trend")
async def get_kpi_trend(
    metric_name: str,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """Get a KPI trend (daily breakdown) for charting."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    engine = KPIEngine(db)
    return await engine.compute_trend(uuid.UUID(org_id), metric_name, days=days)


# ===== Dashboards =====


@router.get("/dashboards", summary="List dashboards")
async def list_dashboards(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List all available dashboards."""
    org_id = await _get_org_id(db, user)
    result = await db.execute(
        select(Dashboard).where(
            Dashboard.is_active == True,  # noqa: E712
            (Dashboard.organization_id == org_id) | (Dashboard.is_system == True),  # noqa: E712
        )
    )
    dashboards = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "dashboard_type": d.dashboard_type,
            "target_role": d.target_role,
            "is_system": d.is_system,
            "widgets_count": len(d.widgets or []),
        }
        for d in dashboards
    ]


@router.get("/dashboards/{dashboard_type}", summary="Get dashboard by type")
async def get_dashboard(
    dashboard_type: str,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Get a dashboard definition with live KPI data for its widgets."""
    org_id = await _get_org_id(db, user)
    result = await db.execute(
        select(Dashboard).where(
            Dashboard.dashboard_type == dashboard_type,
            Dashboard.is_active == True,  # noqa: E712
            (Dashboard.organization_id == org_id) | (Dashboard.is_system == True),  # noqa: E712
        )
    )
    dashboard = result.scalar_one_or_none()
    if dashboard is None:
        raise NotFoundError("Dashboard", dashboard_type)

    # Populate KPI values for widgets
    kpi_engine = KPIEngine(db)
    widgets_with_data = []
    for widget in dashboard.widgets or []:
        widget_copy = dict(widget)
        metric = widget.get("config", {}).get("metric")
        if metric:
            kpi = await kpi_engine.compute_kpi(uuid.UUID(org_id), metric)
            widget_copy["data"] = kpi
        widgets_with_data.append(widget_copy)

    return {
        "id": str(dashboard.id),
        "name": dashboard.name,
        "description": dashboard.description,
        "dashboard_type": dashboard.dashboard_type,
        "widgets": widgets_with_data,
        "refresh_interval_seconds": dashboard.refresh_interval_seconds,
    }


# ===== Insights =====


@router.get("/insights", summary="List insights")
async def list_insights(
    insight_type: str | None = None,
    status: str = "active",
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List AI-generated insights."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    engine = InsightsEngine(db)
    insights = await engine.list_insights(
        uuid.UUID(org_id), insight_type=insight_type, status=status, skip=skip, limit=limit
    )
    return [
        {
            "id": str(i.id),
            "insight_type": i.insight_type,
            "severity": i.severity,
            "title": i.title,
            "body": i.body[:200],
            "metric_name": i.metric_name,
            "metric_value": i.metric_value,
            "is_actionable": i.is_actionable,
            "recommended_action": i.recommended_action,
            "status": i.status,
            "created_at": i.created_at.isoformat(),
        }
        for i in insights
    ]


@router.post("/insights/generate", summary="Generate insights")
async def generate_insights(
    request: InsightGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Generate new insights by analyzing current metrics."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return {"error": "No organization"}
    engine = InsightsEngine(db)
    insights = await engine.generate_insights(uuid.UUID(org_id), days=request.days)
    saved = await engine.save_insights(uuid.UUID(org_id), insights)
    return {"generated": len(insights), "saved": len(saved), "insights": insights}


# ===== Forecasts =====


@router.get("/forecasts/{metric_name}", summary="Get forecast")
async def get_forecast(
    metric_name: str,
    days: int = Query(7, ge=1, le=30),
    model: str = "linear_trend",
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """Get a forecast for a metric."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    engine = ForecastEngine(db)
    return await engine.forecast(uuid.UUID(org_id), metric_name, days=days, model_type=model)


@router.get("/churn-risk", summary="Get churn risk scores")
async def get_churn_risk(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """Get customer churn risk scores."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    engine = ForecastEngine(db)
    return await engine.compute_churn_risk(uuid.UUID(org_id))


# ===== Reports =====


@router.get("/reports", summary="List reports")
async def list_reports(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List report definitions."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    result = await db.execute(
        select(Report).where(
            (Report.organization_id == org_id) | (Report.is_system == True)  # noqa: E712
        )
    )
    reports = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "report_type": r.report_type,
            "format": r.format,
            "is_system": r.is_system,
            "is_active": r.is_active,
            "last_generated_at": r.last_generated_at.isoformat() if r.last_generated_at else None,
            "total_generated": r.total_generated,
        }
        for r in reports
    ]


@router.post("/reports/{report_id}/generate", summary="Generate a report")
async def generate_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Generate a report on demand."""
    org_id = await _get_org_id(db, user)
    report = await db.get(Report, report_id)
    if report is None:
        raise NotFoundError("Report", str(report_id))

    # Generate report data (compute all KPIs as report content)
    kpi_engine = KPIEngine(db)
    kpis = await kpi_engine.compute_all_kpis(uuid.UUID(org_id))

    execution = ReportExecution(
        organization_id=org_id,
        report_id=str(report_id),
        format="json",
        data={
            "kpis": kpis,
            "report_name": report.name,
            "generated_at": datetime.now(UTC).isoformat(),
        },
        status="completed",
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        duration_ms=0,
    )
    db.add(execution)

    report.last_generated_at = datetime.now(UTC)
    report.total_generated += 1

    await db.commit()
    await db.refresh(execution)

    return {
        "execution_id": str(execution.id),
        "status": "completed",
        "format": "json",
        "data": execution.data,
    }


# ===== Alerts =====


@router.get("/alerts", summary="List alert events")
async def list_alerts(
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List alert events."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    stmt = select(AlertEvent).where(AlertEvent.organization_id == org_id)
    if status:
        stmt = stmt.where(AlertEvent.status == status)
    stmt = stmt.order_by(AlertEvent.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return [
        {
            "id": str(a.id),
            "title": a.title,
            "message": a.message,
            "severity": a.severity,
            "metric_name": a.metric_name,
            "metric_value": a.metric_value,
            "threshold_value": a.threshold_value,
            "status": a.status,
            "created_at": a.created_at.isoformat(),
        }
        for a in result.scalars().all()
    ]


@router.get("/alerts/rules", summary="List alert rules")
async def list_alert_rules(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List alert rules."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    result = await db.execute(select(AlertRule).where(AlertRule.organization_id == org_id))
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "metric_name": r.metric_name,
            "condition_type": r.condition_type,
            "severity": r.severity,
            "is_active": r.is_active,
            "total_triggered": r.total_triggered,
            "last_triggered_at": r.last_triggered_at.isoformat() if r.last_triggered_at else None,
        }
        for r in result.scalars().all()
    ]


@router.post("/alerts/rules", status_code=status.HTTP_201_CREATED, summary="Create alert rule")
async def create_alert_rule(
    request: AlertRuleCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Create a new alert rule."""
    org_id = await _get_org_id(db, user)
    rule = AlertRule(
        organization_id=org_id,
        name=request.name,
        metric_name=request.metric_name,
        condition_type=request.condition_type,
        condition_config=request.condition_config,
        severity=request.severity,
        channels=request.channels,
        recipients=request.recipients,
        cooldown_minutes=request.cooldown_minutes,
        is_active=True,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"id": str(rule.id), "name": rule.name, "metric_name": rule.metric_name}


@router.post("/alerts/{alert_id}/acknowledge", summary="Acknowledge alert")
async def acknowledge_alert(
    alert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Acknowledge an alert."""
    alert = await db.get(AlertEvent, alert_id)
    if alert is None:
        raise NotFoundError("Alert", str(alert_id))
    alert.status = "acknowledged"
    alert.acknowledged_by = str(user.id)
    alert.acknowledged_at = datetime.now(UTC)
    await db.commit()
    return {"id": str(alert.id), "status": "acknowledged"}

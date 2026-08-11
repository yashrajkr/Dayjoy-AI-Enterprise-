"""KPI Engine — computes business metrics from live data.

The KPI engine:
1. Queries live data from all platform modules (customers, tickets, calls, conversations, workflows)
2. Computes KPI values for the requested time period
3. Supports time windows, rolling averages, trends
4. Returns structured data for dashboards

This is the real-time computation path. For historical data, the ETL pipeline
pre-computes snapshots into MetricSnapshot table.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.ai import AIConversation
from app.models.analytics import KPIMetric
from app.models.customer import Customer
from app.models.omnichannel import CallLog, ChannelConversation
from app.models.ticket import Ticket
from app.models.workflow import WorkflowExecution

logger = get_logger(__name__)


class KPIEngine:
    """Computes KPI values from live platform data."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def compute_kpi(
        self,
        organization_id: uuid.UUID,
        metric_name: str,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        """Compute a single KPI value."""
        org_id = str(organization_id)
        now = datetime.now(UTC)

        if end_date is None:
            end_date = now.strftime("%Y-%m-%d")
        if start_date is None:
            start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")

        compute_fn = getattr(self, f"_compute_{metric_name}", None)
        if compute_fn is None:
            return {"metric": metric_name, "value": 0.0, "error": f"Unknown metric: {metric_name}"}

        value = await compute_fn(org_id, start_date, end_date)

        result = await self.db.execute(
            select(KPIMetric).where(
                KPIMetric.name == metric_name,
                (KPIMetric.organization_id == org_id) | (KPIMetric.is_system == True),  # noqa: E712
            )
        )
        metric_def = result.scalar_one_or_none()

        return {
            "metric": metric_name,
            "display_name": metric_def.display_name if metric_def else metric_name,
            "value": round(value, 2),
            "unit": metric_def.unit if metric_def else "count",
            "target": metric_def.target_value if metric_def else None,
            "direction": metric_def.direction if metric_def else "higher_is_better",
            "period": {"start": start_date, "end": end_date},
        }

    async def compute_all_kpis(
        self,
        organization_id: uuid.UUID,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]:
        """Compute all active KPIs for a tenant."""
        org_id = str(organization_id)
        result = await self.db.execute(
            select(KPIMetric).where(
                KPIMetric.is_active == True,  # noqa: E712
                (KPIMetric.organization_id == org_id) | (KPIMetric.is_system == True),  # noqa: E712
            )
        )
        metrics = result.scalars().all()
        results = []
        for metric in metrics:
            kpi = await self.compute_kpi(
                organization_id, metric.name, start_date=start_date, end_date=end_date
            )
            results.append(kpi)
        return results

    async def compute_trend(
        self,
        organization_id: uuid.UUID,
        metric_name: str,
        *,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """Compute a metric trend over time (daily breakdown)."""
        now = datetime.now(UTC)
        trend = []
        for i in range(days, 0, -1):
            date = (now - timedelta(days=i)).strftime("%Y-%m-%d")
            next_date = (now - timedelta(days=i - 1)).strftime("%Y-%m-%d")
            kpi = await self.compute_kpi(
                organization_id, metric_name, start_date=date, end_date=next_date
            )
            trend.append({"date": date, "value": kpi["value"]})
        return trend

    # ===== Metric Computations =====

    async def _compute_ai_resolution_rate(self, org_id: str, start: str, end: str) -> float:
        result = await self.db.execute(
            select(
                func.count().label("total"),
                func.sum(cast(ChannelConversation.outcome == "resolved", Integer)).label(
                    "resolved"
                ),
            )
            .select_from(ChannelConversation)
            .where(
                ChannelConversation.organization_id == org_id,
                func.date(ChannelConversation.created_at) >= start,
            )
        )
        row = result.one()
        total = row.total or 0
        resolved = row.resolved or 0
        return (resolved / total * 100) if total > 0 else 0.0

    async def _compute_avg_response_time(self, org_id: str, start: str, end: str) -> float:
        result = await self.db.execute(
            select(func.avg(AIConversation.total_tokens_out)).where(
                AIConversation.organization_id == org_id, func.date(AIConversation.created_at) >= start
            )
        )
        return float(result.scalar_one_or_none() or 0)

    async def _compute_call_volume(self, org_id: str, start: str, end: str) -> float:
        result = await self.db.execute(
            select(func.count())
            .select_from(CallLog)
            .where(CallLog.organization_id == org_id, func.date(CallLog.created_at) >= start)
        )
        return float(result.scalar_one_or_none() or 0)

    async def _compute_ticket_backlog(self, org_id: str, start: str, end: str) -> float:
        result = await self.db.execute(
            select(func.count())
            .select_from(Ticket)
            .where(Ticket.organization_id == org_id, Ticket.status.in_(["open", "in_progress"]))
        )
        return float(result.scalar_one_or_none() or 0)

    async def _compute_customer_growth(self, org_id: str, start: str, end: str) -> float:
        result = await self.db.execute(
            select(func.count())
            .select_from(Customer)
            .where(
                Customer.organization_id == org_id,
                func.date(Customer.created_at) >= start,
                func.date(Customer.created_at) <= end,
            )
        )
        return float(result.scalar_one_or_none() or 0)

    async def _compute_workflow_success_rate(self, org_id: str, start: str, end: str) -> float:
        result = await self.db.execute(
            select(
                func.count().label("total"),
                func.sum(cast(WorkflowExecution.status == "completed", Integer)).label("success"),
            )
            .select_from(WorkflowExecution)
            .where(
                WorkflowExecution.organization_id == org_id, func.date(WorkflowExecution.created_at) >= start
            )
        )
        row = result.one()
        total = row.total or 0
        success = row.success or 0
        return (success / total * 100) if total > 0 else 0.0

    async def _compute_first_contact_resolution(self, org_id: str, start: str, end: str) -> float:
        result = await self.db.execute(
            select(
                func.count().label("total"),
                func.sum(cast(ChannelConversation.is_escalated == False, Integer)).label("fcr"),
            )
            .select_from(ChannelConversation)
            .where(
                ChannelConversation.organization_id == org_id,
                ChannelConversation.outcome == "resolved",
                func.date(ChannelConversation.created_at) >= start,
            )
        )
        row = result.one()
        total = row.total or 0
        fcr = row.fcr or 0
        return (fcr / total * 100) if total > 0 else 0.0

    async def _compute_avg_satisfaction(self, org_id: str, start: str, end: str) -> float:
        result = await self.db.execute(
            select(func.avg(ChannelConversation.satisfaction_score)).where(
                ChannelConversation.organization_id == org_id,
                ChannelConversation.satisfaction_score.isnot(None),
                func.date(ChannelConversation.created_at) >= start,
            )
        )
        return float(result.scalar_one_or_none() or 0)

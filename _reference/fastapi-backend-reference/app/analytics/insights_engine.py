"""AI Insights Engine — generates insights from metric analysis.

Insight types:
- anomaly: unusual spike or drop in a metric
- trend: direction and rate of change
- recommendation: actionable suggestion based on data
- summary: natural-language summary of business performance
- comparison: period-over-period comparison
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.kpi_engine import KPIEngine
from app.core.logging import get_logger
from app.models.analytics import Insight

logger = get_logger(__name__)


class InsightsEngine:
    """Generates AI-powered insights from analytics data."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.kpi_engine = KPIEngine(db)

    async def generate_insights(
        self, organization_id: uuid.UUID, *, days: int = 7
    ) -> list[dict[str, Any]]:
        """Generate insights for the specified period.

        Analyzes all KPIs and generates insights for:
        - Anomalies (spikes/drops > 20% vs previous period)
        - Trends (consistent direction over time)
        - Threshold breaches (below target)
        """
        insights: list[dict[str, Any]] = []
        org_id = str(organization_id)
        now = datetime.now(UTC)

        # Get all KPIs
        kpis = await self.kpi_engine.compute_all_kpis(organization_id)

        for kpi in kpis:
            metric_name = kpi["metric"]
            value = kpi["value"]
            target = kpi.get("target")
            direction = kpi.get("direction", "higher_is_better")
            display_name = kpi.get("display_name", metric_name)

            # Check threshold breach
            if target is not None:
                if direction == "higher_is_better" and value < target * 0.8:
                    insights.append(
                        {
                            "insight_type": "alert",
                            "severity": "warning",
                            "title": f"{display_name} below target",
                            "body": f"{display_name} is {value}{kpi.get('unit', '')}, which is below the target of {target}{kpi.get('unit', '')}.",
                            "metric_name": metric_name,
                            "metric_value": value,
                            "is_actionable": True,
                            "recommended_action": f"Investigate factors affecting {display_name.lower()} and consider corrective actions.",
                        }
                    )
                elif direction == "lower_is_better" and value > target * 1.2:
                    insights.append(
                        {
                            "insight_type": "alert",
                            "severity": "warning",
                            "title": f"{display_name} above target",
                            "body": f"{display_name} is {value}{kpi.get('unit', '')}, which is above the target of {target}{kpi.get('unit', '')}.",
                            "metric_name": metric_name,
                            "metric_value": value,
                            "is_actionable": True,
                            "recommended_action": f"Investigate factors contributing to high {display_name.lower()}.",
                        }
                    )

            # Compute trend (current vs previous period)
            current_start = (now - timedelta(days=days)).strftime("%Y-%m-%d")
            current_end = now.strftime("%Y-%m-%d")
            prev_start = (now - timedelta(days=days * 2)).strftime("%Y-%m-%d")
            prev_end = (now - timedelta(days=days)).strftime("%Y-%m-%d")

            current_kpi = await self.kpi_engine.compute_kpi(
                organization_id, metric_name, start_date=current_start, end_date=current_end
            )
            prev_kpi = await self.kpi_engine.compute_kpi(
                organization_id, metric_name, start_date=prev_start, end_date=prev_end
            )

            current_val = current_kpi["value"]
            prev_val = prev_kpi["value"]

            if prev_val > 0:
                change_pct = ((current_val - prev_val) / prev_val) * 100

                # Detect anomaly (>20% change)
                if abs(change_pct) > 20:
                    direction_text = "increased" if change_pct > 0 else "decreased"
                    severity = (
                        "info"
                        if (change_pct > 0 and direction == "higher_is_better")
                        or (change_pct < 0 and direction == "lower_is_better")
                        else "warning"
                    )

                    insights.append(
                        {
                            "insight_type": "anomaly",
                            "severity": severity,
                            "title": f"{display_name} {direction_text} by {abs(change_pct):.1f}%",
                            "body": f"{display_name} has {direction_text} from {prev_val} to {current_val} ({change_pct:+.1f}%) compared to the previous {days}-day period.",
                            "metric_name": metric_name,
                            "metric_value": current_val,
                            "is_actionable": True,
                            "recommended_action": f"Review recent changes that may have affected {display_name.lower()}.",
                            "context": {
                                "current": current_val,
                                "previous": prev_val,
                                "change_pct": round(change_pct, 2),
                            },
                        }
                    )

        # Generate a summary insight
        insights.append(await self._generate_summary(organization_id, kpis, days))

        return insights

    async def _generate_summary(
        self, organization_id: uuid.UUID, kpis: list[dict], days: int
    ) -> dict[str, Any]:
        """Generate a natural-language business summary."""
        parts = [f"Business Performance Summary (last {days} days):"]

        for kpi in kpis:
            name = kpi.get("display_name", kpi["metric"])
            value = kpi["value"]
            unit = kpi.get("unit", "")
            target = kpi.get("target")

            if target is not None:
                status = "above" if value >= target else "below"
                parts.append(f"• {name}: {value}{unit} ({status} target of {target}{unit})")
            else:
                parts.append(f"• {name}: {value}{unit}")

        return {
            "insight_type": "summary",
            "severity": "info",
            "title": "Business Performance Summary",
            "body": "\n".join(parts),
            "is_actionable": False,
            "generated_by": "rule_engine",
        }

    async def save_insights(
        self, organization_id: uuid.UUID, insights: list[dict[str, Any]]
    ) -> list[Insight]:
        """Save generated insights to the database."""
        saved = []
        for ins_data in insights:
            insight = Insight(
                organization_id=str(organization_id),
                insight_type=ins_data["insight_type"],
                severity=ins_data.get("severity", "info"),
                title=ins_data["title"],
                body=ins_data["body"],
                metric_name=ins_data.get("metric_name"),
                metric_value=ins_data.get("metric_value"),
                context=ins_data.get("context", {}),
                is_actionable=ins_data.get("is_actionable", False),
                recommended_action=ins_data.get("recommended_action"),
                status="active",
                generated_by=ins_data.get("generated_by", "rule_engine"),
                confidence=ins_data.get("confidence"),
            )
            self.db.add(insight)
            saved.append(insight)
        await self.db.flush()
        return saved

    async def list_insights(
        self,
        organization_id: uuid.UUID,
        *,
        insight_type: str | None = None,
        status: str = "active",
        skip: int = 0,
        limit: int = 50,
    ) -> list[Insight]:
        """List insights for a tenant."""
        stmt = select(Insight).where(
            Insight.organization_id == str(organization_id),
            Insight.status == status,
        )
        if insight_type:
            stmt = stmt.where(Insight.insight_type == insight_type)
        stmt = stmt.order_by(Insight.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())


# ====================================================================
# Predictive Analytics (Forecasting)
# ====================================================================


class ForecastEngine:
    """Generates forecasts using simple statistical models.

    Models:
    - linear_trend: linear regression on historical data
    - moving_average: simple moving average
    - exponential_smoothing: weighted exponential smoothing

    NOTE: In production, this would use proper ML libraries (scikit-learn, Prophet, etc.)
    For now, we use basic statistics that work without external dependencies.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.kpi_engine = KPIEngine(db)

    async def forecast(
        self,
        organization_id: uuid.UUID,
        metric_name: str,
        *,
        days: int = 7,
        model_type: str = "linear_trend",
    ) -> list[dict[str, Any]]:
        """Generate a forecast for a metric.

        Args:
            organization_id: Tenant ID.
            metric_name: Metric to forecast.
            days: Number of days to forecast ahead.
            model_type: Forecasting model to use.

        Returns:
            List of {date, predicted_value, confidence_lower, confidence_upper} dicts.
        """
        # Get historical data (last 30 days)
        history = await self.kpi_engine.compute_trend(organization_id, metric_name, days=30)

        if not history or len(history) < 3:
            return [
                {
                    "date": (datetime.now(UTC) + timedelta(days=i + 1)).strftime(
                        "%Y-%m-%d"
                    ),
                    "predicted_value": 0.0,
                    "confidence_lower": 0.0,
                    "confidence_upper": 0.0,
                    "model": model_type,
                    "note": "Insufficient historical data",
                }
                for i in range(days)
            ]

        # Extract values
        values = [h["value"] for h in history]

        if model_type == "moving_average":
            # Simple moving average: average of last N values
            window = min(7, len(values))
            avg = sum(values[-window:]) / window
            forecasts = [avg] * days
            confidence = max(values[-window:]) - min(values[-window:]) if len(values) >= 2 else 0

        elif model_type == "exponential_smoothing":
            # Exponential smoothing: weighted average with alpha=0.3
            alpha = 0.3
            smoothed = values[0]
            for v in values[1:]:
                smoothed = alpha * v + (1 - alpha) * smoothed
            forecasts = [smoothed] * days
            # Confidence: standard deviation of recent values
            recent = values[-7:] if len(values) >= 7 else values
            mean = sum(recent) / len(recent)
            variance = sum((x - mean) ** 2 for x in recent) / len(recent)
            confidence = variance**0.5

        else:  # linear_trend (default)
            # Simple linear regression: y = a + b*x
            n = len(values)
            x_vals = list(range(n))
            x_mean = sum(x_vals) / n
            y_mean = sum(values) / n

            numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, values))
            denominator = sum((x - x_mean) ** 2 for x in x_vals)

            if denominator == 0:
                slope = 0
                intercept = y_mean
            else:
                slope = numerator / denominator
                intercept = y_mean - slope * x_mean

            # Project forward
            forecasts = [intercept + slope * (n + i) for i in range(days)]

            # Confidence: residual standard error
            predictions = [intercept + slope * x for x in x_vals]
            residuals = [(y - p) for y, p in zip(values, predictions)]
            mse = sum(r**2 for r in residuals) / max(n - 2, 1)
            confidence = mse**0.5

        # Build forecast results
        results = []
        for i, pred in enumerate(forecasts):
            forecast_date = (datetime.now(UTC) + timedelta(days=i + 1)).strftime(
                "%Y-%m-%d"
            )
            results.append(
                {
                    "date": forecast_date,
                    "predicted_value": round(max(pred, 0), 2),  # Don't predict negative
                    "confidence_lower": round(max(pred - confidence, 0), 2),
                    "confidence_upper": round(pred + confidence, 2),
                    "model": model_type,
                    "confidence_score": round(1 - min(confidence / max(abs(pred), 1), 1), 2)
                    if pred != 0
                    else 0.5,
                }
            )

        return results

    async def compute_churn_risk(self, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        """Compute churn risk scores for customers.

        Risk factors:
        - No interactions in 30+ days (high)
        - Low satisfaction score
        - Escalated conversations
        """
        from app.models.customer import Customer
        from app.models.omnichannel import ChannelConversation

        org_id = str(organization_id)

        # Get all customers
        result = await self.db.execute(
            select(Customer).where(Customer.organization_id == org_id, Customer.status == "active")
        )
        customers = result.scalars().all()

        risk_scores = []
        now = datetime.now(UTC)

        for customer in customers:
            risk = 0.0
            factors = []

            # Check last conversation
            conv_result = await self.db.execute(
                select(ChannelConversation)
                .where(ChannelConversation.customer_id == str(customer.id))
                .order_by(ChannelConversation.created_at.desc())
                .limit(1)
            )
            last_conv = conv_result.scalar_one_or_none()

            if last_conv is None:
                risk += 0.4
                factors.append("No conversations on record")
            else:
                days_since = (now - last_conv.created_at.replace(tzinfo=UTC)).days
                if days_since > 60:
                    risk += 0.5
                    factors.append(f"No interaction in {days_since} days")
                elif days_since > 30:
                    risk += 0.3
                    factors.append(f"No interaction in {days_since} days")

                # Check satisfaction
                if last_conv.satisfaction_score and last_conv.satisfaction_score <= 2:
                    risk += 0.2
                    factors.append(f"Low satisfaction: {last_conv.satisfaction_score}/5")

                # Check escalation
                if last_conv.is_escalated:
                    risk += 0.15
                    factors.append("Last conversation was escalated")

            risk = min(risk, 1.0)
            level = (
                "low"
                if risk < 0.3
                else "medium"
                if risk < 0.6
                else "high"
                if risk < 0.8
                else "critical"
            )

            risk_scores.append(
                {
                    "entity_type": "customer",
                    "entity_id": str(customer.id),
                    "entity_name": customer.full_name,
                    "risk_score": round(risk, 2),
                    "risk_level": level,
                    "factors": factors,
                    "recommended_actions": self._recommend_actions(level, factors),
                }
            )

        # Sort by risk (highest first)
        risk_scores.sort(key=lambda x: x["risk_score"], reverse=True)
        return risk_scores

    def _recommend_actions(self, level: str, factors: list[str]) -> list[str]:
        """Generate recommended actions based on risk level and factors."""
        actions = []
        if level in ("high", "critical"):
            actions.append("Schedule a follow-up call within 48 hours")
            actions.append("Assign a dedicated account manager")
        if any("No interaction" in f for f in factors):
            actions.append("Send a re-engagement message via WhatsApp/Email")
        if any("Low satisfaction" in f for f in factors):
            actions.append("Conduct satisfaction survey and address concerns")
        if any("escalated" in f.lower() for f in factors):
            actions.append("Review escalation resolution and follow up")
        if not actions:
            actions.append("Monitor for changes in engagement")
        return actions

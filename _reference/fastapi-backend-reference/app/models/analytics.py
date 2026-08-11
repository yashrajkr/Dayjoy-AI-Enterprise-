"""Analytics models — KPIs, dashboards, reports, insights, forecasts, alerts.

Phase 7: Enterprise Analytics, BI, AI Insights & Decision Intelligence.
All models are multi-tenant (organization_id).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin

# ====================================================================
# MODULE 2: Metrics & KPI Engine
# ====================================================================


class KPIMetric(UUIDMixin, TimestampMixin, Base):
    """A KPI metric definition.

    Metrics can be: simple (direct query), derived (computed from other metrics),
    or composite (aggregation across dimensions).
    """

    __tablename__ = "analytics_kpi_metrics"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metric type: simple, derived, composite
    metric_type: Mapped[str] = mapped_column(String(20), default="simple", nullable=False)

    # For simple metrics: SQL query template (Jinja2 with {{org_id}}, {{start_date}}, {{end_date}})
    query_template: Mapped[str | None] = mapped_column(Text, nullable=True)

    # For derived metrics: formula referencing other metrics (e.g., "metric_a / metric_b * 100")
    formula: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Unit: count, percentage, seconds, currency, ratio
    unit: Mapped[str] = mapped_column(String(20), default="count", nullable=False)

    # Time aggregation: sum, avg, min, max, count, last
    aggregation: Mapped[str] = mapped_column(String(10), default="sum", nullable=False)

    # Default time window (days) for rolling calculation
    default_window_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)

    # Target value (for comparison)
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Direction: higher_is_better, lower_is_better
    direction: Mapped[str] = mapped_column(String(20), default="higher_is_better", nullable=False)

    # Category for grouping
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

    # Is this a system metric (pre-defined)?
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<KPIMetric {self.name}>"


class MetricSnapshot(UUIDMixin, TimestampMixin, Base):
    """A pre-computed metric value at a point in time.

    Snapshots are computed by the ETL pipeline and cached for fast dashboard queries.
    """

    __tablename__ = "analytics_metric_snapshots"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # Time period: the date this snapshot represents
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD

    # Dimensions (optional: for grouping by channel, agent, product, etc.)
    dimension_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # channel, agent, product
    dimension_value: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Value
    value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Metadata
    metadata_: Mapped[dict] = mapped_column("metadata", JSONBType, default=dict)

    def __repr__(self) -> str:
        return f"<MetricSnapshot {self.metric_name} {self.date}={self.value}>"


# ====================================================================
# MODULE 3: Dashboards
# ====================================================================


class Dashboard(UUIDMixin, TimestampMixin, Base):
    """A dashboard definition with widgets.

    Dashboards are role-based (CEO, COO, Support Manager, etc.)
    """

    __tablename__ = "analytics_dashboards"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Dashboard type: executive, operations, support, sales, ai_ops, custom
    dashboard_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Target role (who sees this dashboard)
    target_role: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Widgets (JSON array of widget definitions)
    # Each widget: {id, title, type, config, position}
    # Widget types: kpi_card, line_chart, bar_chart, donut_chart, heatmap, table, funnel, gauge
    widgets: Mapped[list] = mapped_column(JSONBType, default=list)

    # Filters (default filter values for the dashboard)
    filters: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Refresh interval (seconds)
    refresh_interval_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<Dashboard {self.name}>"


# ====================================================================
# MODULE 4: AI Insights
# ====================================================================


class Insight(UUIDMixin, TimestampMixin, Base):
    """An AI-generated insight.

    Insights are generated by analyzing metrics and patterns.
    Types: anomaly, trend, recommendation, summary, comparison.
    """

    __tablename__ = "analytics_insights"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Insight type: anomaly, trend, recommendation, summary, comparison, alert
    insight_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # Severity: info, warning, critical
    severity: Mapped[str] = mapped_column(String(20), default="info", nullable=False)

    # Content
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # Related metric
    metric_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metric_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Context (JSON: what data triggered this insight)
    context: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Actionable?
    is_actionable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Time period this insight covers
    period_start: Mapped[str | None] = mapped_column(String(10), nullable=True)
    period_end: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Status: active, dismissed, acted_on
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)

    # AI generation metadata
    generated_by: Mapped[str] = mapped_column(String(50), default="rule_engine", nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    def __repr__(self) -> str:
        return f"<Insight {self.insight_type} {self.severity}>"


# ====================================================================
# MODULE 5: Predictive Analytics
# ====================================================================


class Forecast(UUIDMixin, TimestampMixin, Base):
    """A prediction/forecast for a metric.

    Generated by the predictive analytics engine.
    """

    __tablename__ = "analytics_forecasts"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # What is being forecasted
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # Model: linear_trend, moving_average, exponential_smoothing, ml_model
    model_type: Mapped[str] = mapped_column(String(50), default="linear_trend", nullable=False)

    # Forecast target date
    forecast_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)

    # Predicted value
    predicted_value: Mapped[float] = mapped_column(Float, nullable=False)

    # Confidence interval
    confidence_lower: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_upper: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Historical data used (for context)
    historical_data: Mapped[list] = mapped_column(JSONBType, default=list)

    # Model metadata
    model_params: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Dimensions (optional: for per-channel, per-product forecasts)
    dimension_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    dimension_value: Mapped[str | None] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<Forecast {self.metric_name} {self.forecast_date}={self.predicted_value}>"


class ChurnRiskScore(UUIDMixin, TimestampMixin, Base):
    """Customer/distributor churn risk score.

    Higher score = higher risk of churn.
    """

    __tablename__ = "analytics_churn_risk"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Entity: customer, distributor
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Risk score (0.0 = no risk, 1.0 = very high risk)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Risk level: low, medium, high, critical
    risk_level: Mapped[str] = mapped_column(String(20), default="low", nullable=False)

    # Contributing factors (JSON: what factors drove this score)
    factors: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Recommended actions
    recommended_actions: Mapped[list] = mapped_column(JSONBType, default=list)

    # Last interaction (for context)
    last_interaction_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_interactions: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<ChurnRiskScore {self.entity_type}={self.entity_id} {self.risk_level}>"


# ====================================================================
# MODULE 6: Reports
# ====================================================================


class Report(UUIDMixin, TimestampMixin, Base):
    """A report definition (template + schedule)."""

    __tablename__ = "analytics_reports"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Report type: daily_ops, weekly_ai, monthly_support, customer_activity, distributor_activity, workflow_perf, custom
    report_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Configuration (JSON: what data to include, filters, grouping)
    config: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Output format: pdf, csv, xlsx, json
    format: Mapped[str] = mapped_column(String(10), default="pdf", nullable=False)

    # Schedule (optional — if set, report is generated automatically)
    schedule_cron: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recipients: Mapped[list] = mapped_column(JSONBType, default=list)  # list of email addresses

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Last generated
    last_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    total_generated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<Report {self.name}>"


class ReportExecution(UUIDMixin, TimestampMixin, Base):
    """A single report generation execution."""

    __tablename__ = "analytics_report_executions"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    report_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Time period covered
    period_start: Mapped[str | None] = mapped_column(String(10), nullable=True)
    period_end: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Output
    format: Mapped[str] = mapped_column(String(10), default="pdf", nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Data (JSON: the actual report data, if format is json)
    data: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)

    # Status: running, completed, failed
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Delivery
    delivered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<ReportExecution report={self.report_id} {self.status}>"


# ====================================================================
# MODULE 7: Alerts
# ====================================================================


class AlertRule(UUIDMixin, TimestampMixin, Base):
    """A configurable alert rule.

    When a metric crosses a threshold or an anomaly is detected,
    an alert is triggered.
    """

    __tablename__ = "analytics_alert_rules"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # What to monitor
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Condition: threshold, anomaly, sla_breach, rate_change
    condition_type: Mapped[str] = mapped_column(String(20), default="threshold", nullable=False)

    # Threshold config (JSON: {operator: "gt", value: 100, window: "1h"})
    condition_config: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Severity: info, warning, critical
    severity: Mapped[str] = mapped_column(String(20), default="warning", nullable=False)

    # Notification channels: email, whatsapp, in_app, webhook
    channels: Mapped[list] = mapped_column(JSONBType, default=lambda: ["in_app"])
    recipients: Mapped[list] = mapped_column(JSONBType, default=list)  # user IDs

    # Cooldown (minutes between repeated alerts)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Stats
    total_triggered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_triggered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<AlertRule {self.name}>"


class AlertEvent(UUIDMixin, TimestampMixin, Base):
    """A triggered alert event."""

    __tablename__ = "analytics_alert_events"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    alert_rule_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Alert details
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="warning", nullable=False)

    # Metric context
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    threshold_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Status: active, acknowledged, resolved
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)

    # Acknowledgment
    acknowledged_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Context
    context: Mapped[dict] = mapped_column(JSONBType, default=dict)

    def __repr__(self) -> str:
        return f"<AlertEvent {self.severity} {self.status}>"

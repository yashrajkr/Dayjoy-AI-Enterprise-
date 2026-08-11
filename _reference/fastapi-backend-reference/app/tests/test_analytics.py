"""Tests for Phase 7 Analytics."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_password

# Import ALL models to create all tables
from app.models.ai import *  # noqa: F401, F403
from app.models.ai import AIConversation  # noqa: F401
from app.models.analytics import *  # noqa: F401, F403
from app.models.customer import Customer  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.omnichannel import *  # noqa: F401, F403
from app.models.omnichannel import ChannelConversation  # noqa: F401
from app.models.organization import Organization, UserOrganization
from app.models.product import Product  # noqa: F401
from app.models.ticket import Ticket  # noqa: F401
from app.models.user import User
from app.models.workflow import *  # noqa: F401, F403
from app.models.workflow import WorkflowExecution  # noqa: F401


@pytest_asyncio.fixture
async def test_db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        org = Organization(name="Test Org", slug="test-org", is_active=True)
        session.add(org)
        await session.flush()
        user = User(
            email="admin@test.com",
            full_name="Admin",
            hashed_password=hash_password("pass123!"),
            is_active=True,
            is_email_verified=True,
        )
        session.add(user)
        await session.flush()
        membership = UserOrganization(
            user_id=str(user.id),
            organization_id=str(org.id),
            role="org_owner",
            is_active=True,
        )
        session.add(membership)
        # Seed a customer
        cust = Customer(organization_id=str(org.id), full_name="Test Customer", status="active")
        session.add(cust)
        # Seed system KPI metrics
        from app.models.analytics import KPIMetric
        for name, display, unit, cat, target in [
            ("ai_resolution_rate", "AI Resolution Rate", "percentage", "ai", 80.0),
            ("avg_response_time", "Avg Response Time", "seconds", "ops", 2.0),
            ("call_volume", "Call Volume", "count", "voice", None),
            ("ticket_backlog", "Ticket Backlog", "count", "support", 10.0),
            ("customer_growth", "Customer Growth", "count", "customer", None),
            ("workflow_success_rate", "Workflow Success", "percentage", "automation", 95.0),
            ("first_contact_resolution", "First Contact Resolution", "percentage", "support", 70.0),
            ("avg_satisfaction", "Avg Satisfaction", "ratio", "customer", 4.0),
        ]:
            kpi = KPIMetric(organization_id=str(org.id),
                name=name, display_name=display, unit=unit, category=cat,
                target_value=target, metric_type="simple", is_system=True, is_active=True,
                direction="higher_is_better" if unit != "seconds" and unit != "count" or name in ("call_volume", "customer_growth") else "lower_is_better",
            )
            session.add(kpi)
        await session.flush()
        # Set org_id to a placeholder for system metrics
        await session.commit()
        yield session, org, user
    await engine.dispose()


@pytest.mark.integration
class TestKPIEngine:
    @pytest.mark.asyncio
    async def test_compute_customer_growth(self, test_db):
        session, org, user = test_db
        from app.analytics.kpi_engine import KPIEngine

        engine = KPIEngine(session)
        result = await engine.compute_kpi(org.id, "customer_growth")
        assert result["metric"] == "customer_growth"
        assert result["value"] >= 1  # At least the seeded customer

    @pytest.mark.asyncio
    async def test_compute_all_kpis(self, test_db):
        session, org, user = test_db
        from app.analytics.kpi_engine import KPIEngine

        engine = KPIEngine(session)
        kpis = await engine.compute_all_kpis(org.id)
        assert len(kpis) > 0
        # Should include system KPIs
        names = [k["metric"] for k in kpis]
        assert "customer_growth" in names
        assert "ticket_backlog" in names

    @pytest.mark.asyncio
    async def test_compute_unknown_kpi(self, test_db):
        session, org, user = test_db
        from app.analytics.kpi_engine import KPIEngine

        engine = KPIEngine(session)
        result = await engine.compute_kpi(org.id, "nonexistent_metric")
        assert "error" in result


@pytest.mark.integration
class TestInsightsEngine:
    @pytest.mark.asyncio
    async def test_generate_insights(self, test_db):
        session, org, user = test_db
        from app.analytics.insights_engine import InsightsEngine

        engine = InsightsEngine(session)
        insights = await engine.generate_insights(org.id, days=7)
        assert len(insights) > 0
        # Should include a summary
        types = [i["insight_type"] for i in insights]
        assert "summary" in types

    @pytest.mark.asyncio
    async def test_save_insights(self, test_db):
        session, org, user = test_db
        from app.analytics.insights_engine import InsightsEngine

        engine = InsightsEngine(session)
        insights = await engine.generate_insights(org.id, days=7)
        saved = await engine.save_insights(org.id, insights)
        assert len(saved) == len(insights)


@pytest.mark.integration
class TestForecastEngine:
    @pytest.mark.asyncio
    async def test_forecast_linear_trend(self, test_db):
        session, org, user = test_db
        from app.analytics.insights_engine import ForecastEngine

        engine = ForecastEngine(session)
        forecast = await engine.forecast(
            org.id, "customer_growth", days=7, model_type="linear_trend"
        )
        assert len(forecast) == 7
        for f in forecast:
            assert "date" in f
            assert "predicted_value" in f
            assert "model" in f
            assert f["model"] == "linear_trend"

    @pytest.mark.asyncio
    async def test_forecast_moving_average(self, test_db):
        session, org, user = test_db
        from app.analytics.insights_engine import ForecastEngine

        engine = ForecastEngine(session)
        forecast = await engine.forecast(org.id, "call_volume", days=3, model_type="moving_average")
        assert len(forecast) == 3

    @pytest.mark.asyncio
    async def test_churn_risk(self, test_db):
        session, org, user = test_db
        from app.analytics.insights_engine import ForecastEngine

        engine = ForecastEngine(session)
        risks = await engine.compute_churn_risk(org.id)
        assert len(risks) > 0
        # The seeded customer should be in the list
        assert any(r["entity_type"] == "customer" for r in risks)
        # Risk scores should be 0-1
        for r in risks:
            assert 0.0 <= r["risk_score"] <= 1.0
            assert r["risk_level"] in ("low", "medium", "high", "critical")

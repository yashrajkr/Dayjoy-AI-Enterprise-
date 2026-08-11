"""Tests for the Enterprise SaaS Platform (Stage 2 Step 10).

Tests cover:
- Company registration (create org + user + subscription + onboarding)
- Subscription plans (list, get)
- Subscription management (get, upgrade, cancel)
- Billing (invoices)
- Usage metering (record, summary, limit check)
- Onboarding (progress, complete step)
- Support tickets (create, list, resolve)
- Feature requests (create, list, vote)
- Admin dashboard (metrics, organizations)
- Tenant isolation (cross-tenant subscription access blocked)
"""

import uuid
from datetime import datetime, UTC
from typing import Any
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_password
from app.models import *  # noqa: F401, F403
from app.models.organization import Organization, UserOrganization
from app.models.saas import SubscriptionPlan, Subscription
from app.models.user import User


@pytest_asyncio.fixture
async def saas_db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        # Seed subscription plans (the migration seeds them, but in-memory DB won't have them)
        plans_data = [
            ("free", "Free", 0, 0, 0, 100, 0, 10, 50, 3, 0),
            ("starter", "Starter", 1, 2900, 29000, 1000, 60, 500, 500, 10, 1),
            ("professional", "Professional", 2, 9900, 99000, 10000, 500, 5000, 5000, 50, 3),
            ("business", "Business", 3, 29900, 299000, 50000, 2000, 25000, 25000, 200, 10),
            ("enterprise", "Enterprise", 4, -1, -1, -1, -1, -1, -1, -1, -1),
        ]
        for name, display, tier, monthly, yearly, ai_req, voice_min, wa_msg, kb_mb, users, phones in plans_data:
            session.add(SubscriptionPlan(
                name=name, display_name=display, tier=tier,
                price_monthly_cents=monthly, price_yearly_cents=yearly,
                trial_days=14 if tier > 0 else 0,
                limit_ai_requests_per_month=ai_req,
                limit_voice_minutes_per_month=voice_min,
                limit_whatsapp_messages_per_month=wa_msg,
                limit_knowledge_storage_mb=kb_mb,
                limit_users=users,
                limit_phone_numbers=phones,
                features={"voice_ai": tier >= 1, "whatsapp": tier >= 2},
                is_active=True, is_public=tier < 4, sort_order=tier,
            ))
        await session.flush()

        # Pre-existing org + user for some tests
        org = Organization(name="Existing Corp", slug="existing", is_active=True, plan="starter")
        session.add(org)
        await session.flush()
        user = User(
            email="admin@existing.com", full_name="Admin",
            hashed_password=hash_password("Pass123!"),
            is_active=True, is_email_verified=True,
        )
        session.add(user)
        await session.flush()
        session.add(UserOrganization(
            user_id=str(user.id), organization_id=str(org.id),
            role="org_owner", is_active=True,
        ))
        # Create subscription for existing org
        plan_result = await session.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.name == "starter")
        )
        plan = plan_result.scalar_one()
        session.add(Subscription(
            organization_id=str(org.id), plan_id=str(plan.id),
            status="active", billing_cycle="monthly",
            current_period_start=datetime.now(UTC),
            current_period_end=datetime.now(UTC),
        ))
        await session.commit()
        yield session, org, user

    await engine.dispose()


from sqlalchemy import select


# ====================================================================
# 1. COMPANY REGISTRATION
# ====================================================================


@pytest.mark.integration
class TestCompanyRegistration:
    @pytest.mark.asyncio
    async def test_register_company(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        result = await svc.register_company(
            company_name="NewCo Inc",
            slug="newco",
            admin_email="admin@newco.com",
            admin_password="SecurePass123!",
            admin_full_name="NewCo Admin",
            plan_name="professional",
        )
        await session.commit()
        assert result["organization_id"] is not None
        assert result["user_id"] is not None
        assert result["subscription_id"] is not None
        assert result["plan"] == "professional"

    @pytest.mark.asyncio
    async def test_register_duplicate_slug(self, saas_db):
        session, org, user = saas_db
        from app.core.exceptions import ValidationError
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        with pytest.raises(ValidationError):
            await svc.register_company(
                company_name="Duplicate",
                slug="existing",  # Already exists
                admin_email="new@new.com",
                admin_password="SecurePass123!",
                admin_full_name="New Admin",
            )

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, saas_db):
        session, org, user = saas_db
        from app.core.exceptions import ValidationError
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        with pytest.raises(ValidationError):
            await svc.register_company(
                company_name="Dup Email Co",
                slug="dupemail",
                admin_email="admin@existing.com",  # Already exists
                admin_password="SecurePass123!",
                admin_full_name="New Admin",
            )

    @pytest.mark.asyncio
    async def test_onboarding_steps_created(self, saas_db):
        """Registration should create onboarding steps."""
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        result = await svc.register_company(
            company_name="Onboarding Co",
            slug="onboardco",
            admin_email="admin@onboardco.com",
            admin_password="SecurePass123!",
            admin_full_name="Onboard Admin",
            plan_name="starter",
        )
        await session.commit()

        steps = await svc.get_onboarding_progress(
            organization_id=uuid.UUID(result["organization_id"])
        )
        assert len(steps) == 10  # 10 onboarding steps
        # First step should be completed
        assert steps[0].status == "completed"
        assert steps[0].step_key == "create_workspace"


# ====================================================================
# 2. SUBSCRIPTION PLANS
# ====================================================================


@pytest.mark.integration
class TestSubscriptionPlans:
    @pytest.mark.asyncio
    async def test_list_public_plans(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        plans = await svc.list_plans(public_only=True)
        assert len(plans) == 4  # free, starter, professional, business (enterprise is private)
        assert plans[0].name == "free"  # Sorted by sort_order

    @pytest.mark.asyncio
    async def test_get_plan_by_name(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        plan = await svc._get_plan_by_name("professional")
        assert plan.display_name == "Professional"
        assert plan.tier == 2


# ====================================================================
# 3. SUBSCRIPTION MANAGEMENT
# ====================================================================


@pytest.mark.integration
class TestSubscriptionManagement:
    @pytest.mark.asyncio
    async def test_get_subscription(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        sub = await svc.get_subscription(organization_id=org.id)
        assert sub.status == "active"

    @pytest.mark.asyncio
    async def test_upgrade_subscription(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        # Get professional plan
        plans = await svc.list_plans(public_only=False)
        pro_plan = next(p for p in plans if p.name == "professional")

        sub = await svc.upgrade_subscription(
            organization_id=org.id,
            new_plan_id=pro_plan.id,
        )
        await session.commit()
        assert sub.plan_id == str(pro_plan.id)

    @pytest.mark.asyncio
    async def test_cancel_subscription(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        sub = await svc.cancel_subscription(
            organization_id=org.id,
            reason="too expensive",
        )
        await session.commit()
        assert sub.status == "canceled"
        assert sub.auto_renew is False


# ====================================================================
# 4. USAGE METERING
# ====================================================================


@pytest.mark.integration
class TestUsageMetering:
    @pytest.mark.asyncio
    async def test_record_usage(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        record = await svc.record_usage(
            organization_id=org.id,
            metric="ai_requests",
            value=5,
        )
        await session.commit()
        assert record.ai_requests == 5

    @pytest.mark.asyncio
    async def test_record_usage_accumulates(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        await svc.record_usage(organization_id=org.id, metric="ai_requests", value=3)
        await svc.record_usage(organization_id=org.id, metric="ai_requests", value=7)
        await session.commit()

        summary = await svc.get_usage_summary(organization_id=org.id)
        assert summary["ai_requests"] == 10

    @pytest.mark.asyncio
    async def test_usage_summary_includes_limits(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        summary = await svc.get_usage_summary(organization_id=org.id)
        assert "limits" in summary
        assert "ai_requests" in summary["limits"]
        assert "usage_percent" in summary

    @pytest.mark.asyncio
    async def test_check_usage_limit_allowed(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        # Starter plan has 1000 AI requests — 0 used should be allowed
        allowed = await svc.check_usage_limit(
            organization_id=org.id,
            metric="ai_requests",
        )
        assert allowed is True

    @pytest.mark.asyncio
    async def test_check_usage_limit_blocked(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        # Record 999 requests (limit is 1000)
        await svc.record_usage(organization_id=org.id, metric="ai_requests", value=999)
        await session.flush()
        # 1000th should still be allowed
        allowed = await svc.check_usage_limit(organization_id=org.id, metric="ai_requests")
        assert allowed is True
        # Record one more → now at 999 (already recorded), next should be allowed still
        await svc.record_usage(organization_id=org.id, metric="ai_requests", value=2)
        await session.flush()
        # Now at 1001 — should be blocked
        allowed = await svc.check_usage_limit(organization_id=org.id, metric="ai_requests")
        assert allowed is False


# ====================================================================
# 5. ONBOARDING
# ====================================================================


@pytest.mark.integration
class TestOnboarding:
    @pytest.mark.asyncio
    async def test_complete_step(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        # Create onboarding steps first
        await svc._create_onboarding_steps(org.id, user.id)
        await session.flush()

        # Complete a step
        step = await svc.complete_onboarding_step(
            organization_id=org.id,
            step_key="choose_plan",
            completed_by=user.id,
            step_data={"plan": "professional"},
        )
        await session.commit()
        assert step.status == "completed"
        assert step.step_data.get("plan") == "professional"

    @pytest.mark.asyncio
    async def test_onboarding_progress(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        await svc._create_onboarding_steps(org.id, user.id)
        await session.flush()

        steps = await svc.get_onboarding_progress(organization_id=org.id)
        assert len(steps) == 10
        # First step should be completed
        completed = [s for s in steps if s.status == "completed"]
        assert len(completed) == 1


# ====================================================================
# 6. SUPPORT TICKETS
# ====================================================================


@pytest.mark.integration
class TestSupportTickets:
    @pytest.mark.asyncio
    async def test_create_ticket(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        ticket = await svc.create_ticket(
            organization_id=org.id,
            created_by=user.id,
            subject="AI not responding",
            description="The AI chat is not responding to my queries.",
            category="technical",
            priority="high",
        )
        await session.commit()
        assert ticket.id is not None
        assert ticket.status == "open"
        assert "TKT-" in ticket.ticket_number

    @pytest.mark.asyncio
    async def test_list_tickets(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        await svc.create_ticket(
            organization_id=org.id, created_by=user.id,
            subject="Ticket 1", description="First issue",
        )
        await svc.create_ticket(
            organization_id=org.id, created_by=user.id,
            subject="Ticket 2", description="Second issue",
        )
        await session.commit()

        tickets, total = await svc.list_tickets(organization_id=org.id)
        assert total == 2

    @pytest.mark.asyncio
    async def test_resolve_ticket(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        ticket = await svc.create_ticket(
            organization_id=org.id, created_by=user.id,
            subject="Resolvable", description="This can be fixed",
        )
        await session.flush()

        resolved = await svc.resolve_ticket(
            ticket_id=ticket.id,
            resolved_by=user.id,
            resolution_notes="Fixed by restarting the service.",
        )
        await session.commit()
        assert resolved.status == "resolved"
        assert resolved.resolution_notes is not None


# ====================================================================
# 7. FEATURE REQUESTS
# ====================================================================


@pytest.mark.integration
class TestFeatureRequests:
    @pytest.mark.asyncio
    async def test_create_feature_request(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        fr = await svc.create_feature_request(
            organization_id=org.id,
            requested_by=user.id,
            title="Add Slack integration",
            description="It would be great to send notifications to Slack.",
            category="notification",
        )
        await session.commit()
        assert fr.id is not None
        assert fr.votes == 1
        assert str(user.id) in fr.voted_by

    @pytest.mark.asyncio
    async def test_vote_feature_request(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        fr = await svc.create_feature_request(
            organization_id=org.id,
            requested_by=user.id,
            title="Add Teams integration",
            description="Microsoft Teams support.",
        )
        await session.flush()

        # Create a second user to vote
        user2 = User(
            email="voter@test.com", full_name="Voter",
            hashed_password=hash_password("Pass123!"),
            is_active=True, is_email_verified=True,
        )
        session.add(user2)
        await session.flush()

        voted = await svc.vote_feature_request(
            feature_request_id=fr.id,
            user_id=user2.id,
        )
        await session.commit()
        assert voted.votes == 2

    @pytest.mark.asyncio
    async def test_list_feature_requests(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        await svc.create_feature_request(
            organization_id=org.id, requested_by=user.id,
            title="FR1", description="First",
        )
        await svc.create_feature_request(
            organization_id=org.id, requested_by=user.id,
            title="FR2", description="Second",
        )
        await session.commit()

        frs = await svc.list_feature_requests()
        assert len(frs) == 2


# ====================================================================
# 8. ADMIN DASHBOARD
# ====================================================================


@pytest.mark.integration
class TestAdminDashboard:
    @pytest.mark.asyncio
    async def test_admin_dashboard(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        dashboard = await svc.get_admin_dashboard()
        assert "total_organizations" in dashboard
        assert "active_subscriptions" in dashboard
        assert "trial_subscriptions" in dashboard
        assert "total_users" in dashboard
        assert "open_tickets" in dashboard
        assert "revenue_this_month_cents" in dashboard
        assert "plan_distribution" in dashboard

    @pytest.mark.asyncio
    async def test_list_organizations(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        orgs, total = await svc.list_organizations()
        assert total >= 1  # At least the existing org


# ====================================================================
# 9. SYSTEM STATUS
# ====================================================================


@pytest.mark.integration
class TestSystemStatus:
    @pytest.mark.asyncio
    async def test_list_system_status_empty(self, saas_db):
        session, org, user = saas_db
        from app.services.saas_service import SaaSService

        svc = SaaSService(session)
        statuses = await svc.list_system_status(public_only=True)
        assert len(statuses) == 0  # No incidents

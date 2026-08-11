"""Tests for Enterprise SaaS Control Plane — API keys, usage, quotas, secrets, billing."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_password
from app.models.enterprise_saas import ApiKey, ApiUsage, UsageQuota, EncryptedSecret
from app.models.organization import Organization, UserOrganization
from app.models.role import Role
from app.models.user import User
from app.services.enterprise_saas import (
    AdminConsoleService, ApiKeyService, BillingService,
    QuotaService, SecretsManager, UsageTrackingService,
)

import app.models  # noqa: F401


@pytest_asyncio.fixture
async def saas_setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        org = Organization(name="SaaS Test", slug=f"saas-{uuid.uuid4().hex[:8]}", is_active=True, plan="enterprise")
        session.add(org); await session.flush()
        user = User(email="saas@test.com", full_name="SaaS User",
                    hashed_password=hash_password("TestPass123!"), is_active=True, is_email_verified=True)
        session.add(user); await session.flush()
        session.add(UserOrganization(user_id=str(user.id), organization_id=str(org.id), role="org_owner", is_active=True))
        session.add(Role(name="org_owner", display_name="Owner", is_system=True, scope="global", priority=90))
        await session.commit()
        org_id = str(org.id); user_id = str(user.id)

    async with async_session() as session:
        yield session, org_id, user_id
    await engine.dispose()


# ===== API Key Service Tests =====

@pytest.mark.asyncio
class TestApiKeyService:
    async def test_create_and_validate_key(self, saas_setup):
        """Should create an API key and validate it."""
        session, org_id, user_id = saas_setup
        svc = ApiKeyService(session)
        metadata, raw_key = await svc.create_key(
            organization_id=uuid.UUID(org_id), user_id=uuid.UUID(user_id),
            name="Test Key", scopes=["read"])
        await session.commit()
        assert metadata["name"] == "Test Key"
        assert raw_key.startswith("djkey_")

        # Validate
        result = await svc.validate_key(raw_key)
        assert result is not None
        assert result["organization_id"] == org_id

    async def test_validate_invalid_key(self, saas_setup):
        """Should return None for invalid key."""
        session, _, _ = saas_setup
        svc = ApiKeyService(session)
        result = await svc.validate_key("djkey_invalid")
        assert result is None

    async def test_revoke_key(self, saas_setup):
        """Should revoke an API key."""
        session, org_id, user_id = saas_setup
        svc = ApiKeyService(session)
        metadata, raw_key = await svc.create_key(
            organization_id=uuid.UUID(org_id), user_id=uuid.UUID(user_id), name="To Revoke")
        await session.flush()
        await svc.revoke_key(organization_id=uuid.UUID(org_id), key_id=uuid.UUID(metadata["id"]))
        await session.commit()

        # Revoked key should not validate
        result = await svc.validate_key(raw_key)
        assert result is None

    async def test_list_keys(self, saas_setup):
        """Should list API keys."""
        session, org_id, user_id = saas_setup
        svc = ApiKeyService(session)
        await svc.create_key(organization_id=uuid.UUID(org_id), user_id=uuid.UUID(user_id), name="Key 1")
        await svc.create_key(organization_id=uuid.UUID(org_id), user_id=uuid.UUID(user_id), name="Key 2")
        await session.commit()
        keys = await svc.list_keys(organization_id=uuid.UUID(org_id))
        assert len(keys) == 2


# ===== Usage Tracking Tests =====

@pytest.mark.asyncio
class TestUsageTrackingService:
    async def test_log_and_summary(self, saas_setup):
        """Should log API calls and return summary."""
        session, org_id, _ = saas_setup
        svc = UsageTrackingService(session)
        await svc.log_api_call(organization_id=uuid.UUID(org_id), endpoint="/api/v1/test",
                               method="GET", status_code=200, latency_ms=50, tokens_used=100, cost_cents=5)
        await svc.log_api_call(organization_id=uuid.UUID(org_id), endpoint="/api/v1/test",
                               method="POST", status_code=201, latency_ms=100, tokens_used=200, cost_cents=10)
        await session.commit()

        summary = await svc.get_usage_summary(organization_id=uuid.UUID(org_id), days=30)
        assert summary["total_calls"] == 2
        assert summary["total_tokens"] == 300
        assert summary["total_cost_cents"] == 15

    async def test_usage_by_endpoint(self, saas_setup):
        """Should group usage by endpoint."""
        session, org_id, _ = saas_setup
        svc = UsageTrackingService(session)
        await svc.log_api_call(organization_id=uuid.UUID(org_id), endpoint="/api/v1/agents",
                               method="GET", status_code=200, tokens_used=50)
        await svc.log_api_call(organization_id=uuid.UUID(org_id), endpoint="/api/v1/agents",
                               method="GET", status_code=200, tokens_used=30)
        await svc.log_api_call(organization_id=uuid.UUID(org_id), endpoint="/api/v1/workflows",
                               method="POST", status_code=201, tokens_used=100)
        await session.commit()

        by_endpoint = await svc.get_usage_by_endpoint(organization_id=uuid.UUID(org_id), days=7)
        assert len(by_endpoint) == 2
        # /api/v1/agents should have 2 calls
        agents = [e for e in by_endpoint if e["endpoint"] == "/api/v1/agents"][0]
        assert agents["calls"] == 2
        assert agents["tokens"] == 80


# ===== Quota Service Tests =====

@pytest.mark.asyncio
class TestQuotaService:
    async def test_get_or_create_quota(self, saas_setup):
        """Should create default quota if not exists."""
        session, org_id, _ = saas_setup
        svc = QuotaService(session)
        quota = await svc.get_or_create_quota(organization_id=uuid.UUID(org_id))
        assert quota.max_users == 10  # default
        assert quota.max_agents == 5  # default

    async def test_check_quota_within_limit(self, saas_setup):
        """Should allow when within limit."""
        session, org_id, _ = saas_setup
        svc = QuotaService(session)
        result = await svc.check_quota(organization_id=uuid.UUID(org_id), resource="users", current_count=5)
        assert result["allowed"] is True
        assert result["remaining"] == 5  # 10 - 5

    async def test_check_quota_exceeded(self, saas_setup):
        """Should deny when over limit."""
        session, org_id, _ = saas_setup
        svc = QuotaService(session)
        result = await svc.check_quota(organization_id=uuid.UUID(org_id), resource="users", current_count=10)
        assert result["allowed"] is False
        assert result["remaining"] == 0

    async def test_check_quota_unlimited(self, saas_setup):
        """Should allow unlimited (-1) resources."""
        session, org_id, _ = saas_setup
        svc = QuotaService(session)
        await svc.update_quota(organization_id=uuid.UUID(org_id), max_users=-1)
        result = await svc.check_quota(organization_id=uuid.UUID(org_id), resource="users", current_count=999999)
        assert result["allowed"] is True
        assert result["limit"] == -1

    async def test_update_quota(self, saas_setup):
        """Should update quota limits."""
        session, org_id, _ = saas_setup
        svc = QuotaService(session)
        await svc.update_quota(organization_id=uuid.UUID(org_id), max_users=100, max_agents=50)
        await session.commit()
        quota = await svc.get_or_create_quota(organization_id=uuid.UUID(org_id))
        assert quota.max_users == 100
        assert quota.max_agents == 50


# ===== Secrets Manager Tests =====

@pytest.mark.asyncio
class TestSecretsManager:
    async def test_store_and_get_secret(self, saas_setup):
        """Should store and retrieve an encrypted secret."""
        session, org_id, user_id = saas_setup
        svc = SecretsManager(session)
        await svc.store_secret(
            organization_id=uuid.UUID(org_id), name="openai_api_key",
            secret_type="openai_key", value="sk-test-12345",
            created_by=uuid.UUID(user_id))
        await session.commit()

        value = await svc.get_secret(organization_id=uuid.UUID(org_id), name="openai_api_key")
        assert value == "sk-test-12345"

    async def test_get_nonexistent_secret(self, saas_setup):
        """Should return None for nonexistent secret."""
        session, org_id, _ = saas_setup
        svc = SecretsManager(session)
        value = await svc.get_secret(organization_id=uuid.UUID(org_id), name="nonexistent")
        assert value is None

    async def test_list_secrets(self, saas_setup):
        """Should list secrets without values."""
        session, org_id, user_id = saas_setup
        svc = SecretsManager(session)
        await svc.store_secret(organization_id=uuid.UUID(org_id), name="key1",
                               secret_type="openai_key", value="val1", created_by=uuid.UUID(user_id))
        await svc.store_secret(organization_id=uuid.UUID(org_id), name="key2",
                               secret_type="anthropic_key", value="val2", created_by=uuid.UUID(user_id))
        await session.commit()

        secrets = await svc.list_secrets(organization_id=uuid.UUID(org_id))
        assert len(secrets) == 2
        # Should NOT contain values
        for s in secrets:
            assert "val" not in str(s)

    async def test_delete_secret(self, saas_setup):
        """Should deactivate (soft delete) a secret."""
        session, org_id, user_id = saas_setup
        svc = SecretsManager(session)
        secret = await svc.store_secret(
            organization_id=uuid.UUID(org_id), name="to_delete",
            secret_type="custom", value="secret123", created_by=uuid.UUID(user_id))
        await session.flush()
        await svc.delete_secret(organization_id=uuid.UUID(org_id), secret_id=secret.id)
        await session.commit()

        # Should not be retrievable
        value = await svc.get_secret(organization_id=uuid.UUID(org_id), name="to_delete")
        assert value is None

    async def test_encrypted_value_not_plaintext(self, saas_setup):
        """The encrypted value stored in DB should not contain plaintext."""
        session, org_id, user_id = saas_setup
        svc = SecretsManager(session)
        await svc.store_secret(
            organization_id=uuid.UUID(org_id), name="sensitive",
            secret_type="database_url", value="postgresql://user:pass@host/db",
            created_by=uuid.UUID(user_id))
        await session.flush()

        # Check the raw DB value
        from sqlalchemy import select
        result = await session.execute(select(EncryptedSecret).where(EncryptedSecret.name == "sensitive"))
        secret = result.scalar_one()
        assert "postgresql://user:pass" not in secret.encrypted_value


# ===== Admin Console Tests =====

@pytest.mark.asyncio
class TestAdminConsoleService:
    async def test_platform_stats(self, saas_setup):
        """Should return platform-wide statistics."""
        session, _, _ = saas_setup
        svc = AdminConsoleService(session)
        stats = await svc.get_platform_stats()
        assert stats["total_organizations"] >= 1
        assert stats["total_users"] >= 1

    async def test_list_organizations(self, saas_setup):
        """Should list all organizations."""
        session, _, _ = saas_setup
        svc = AdminConsoleService(session)
        orgs, total = await svc.list_organizations(skip=0, limit=50)
        assert total >= 1
        assert len(orgs) >= 1
        assert orgs[0]["member_count"] >= 1

    async def test_tenant_settings_default(self, saas_setup):
        """Should return default settings for new org."""
        session, org_id, _ = saas_setup
        svc = AdminConsoleService(session)
        settings = await svc.get_tenant_settings(organization_id=uuid.UUID(org_id))
        assert settings["timezone"] == "UTC"
        assert settings["locale"] == "en"

    async def test_update_tenant_settings(self, saas_setup):
        """Should update tenant settings."""
        session, org_id, _ = saas_setup
        svc = AdminConsoleService(session)
        await svc.update_tenant_settings(
            organization_id=uuid.UUID(org_id), timezone="Asia/Kolkata",
            locale="hi", custom_domain="custom.example.com")
        await session.commit()

        settings = await svc.get_tenant_settings(organization_id=uuid.UUID(org_id))
        assert settings["timezone"] == "Asia/Kolkata"
        assert settings["locale"] == "hi"
        assert settings["custom_domain"] == "custom.example.com"

    async def test_ai_cost_breakdown(self, saas_setup):
        """Should return AI cost breakdown."""
        session, org_id, _ = saas_setup
        svc = AdminConsoleService(session)
        breakdown = await svc.get_ai_cost_breakdown(organization_id=uuid.UUID(org_id), days=30)
        assert "by_endpoint" in breakdown
        assert "total_cost_cents" in breakdown


# ===== Billing Service Tests =====

@pytest.mark.asyncio
class TestBillingService:
    async def test_list_plans(self, saas_setup):
        """Should list active subscription plans."""
        from app.models.saas import SubscriptionPlan
        session, _, _ = saas_setup
        # Seed a plan directly (migration would do this in prod)
        plan = SubscriptionPlan(name="Test Plan", display_name="Test Plan", description="Test",
                                tier=1, price_monthly_cents=1000, price_yearly_cents=10000,
                                currency="USD", trial_days=14, is_active=True)
        session.add(plan)
        await session.commit()

        svc = BillingService(session)
        plans = await svc.list_plans()
        assert len(plans) >= 1

    async def test_create_billing_event(self, saas_setup):
        """Should create a billing event."""
        session, org_id, _ = saas_setup
        svc = BillingService(session)
        event = await svc.create_billing_event(
            organization_id=uuid.UUID(org_id), event_type="charge",
            amount_cents=500, description="Monthly subscription", provider="stripe")
        await session.commit()
        assert event.event_type == "charge"
        assert event.amount_cents == 500
        assert event.status == "pending"

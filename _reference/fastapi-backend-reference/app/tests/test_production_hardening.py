"""Tests for production hardening — OAuth2, webhook delivery, event bus worker, full-text search, MCP client, plugin sandbox, plugin analytics, SDK generator, marketplace payments, connector OAuth."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_password
from app.models.marketplace_ecosystem import (
    ApiCatalogEntry,
    DeveloperApp,
    EcosystemConnector,
    EcosystemPlugin,
    EcosystemPluginInstallation,
    MarketplaceDownload,
    MarketplaceItem,
    WebhookEventLog,
    WebhookSubscription,
)
from app.models.organization import Organization, UserOrganization
from app.models.role import Role
from app.models.user import User
from app.services.connector_oauth import ConnectorOAuthService
from app.services.event_bus_worker import EventBusWorker, _matches_filter
from app.services.fulltext_search import FullTextSearchService
from app.services.marketplace_ecosystem import (
    DeveloperPortalService,
    MarketplaceService,
    PluginService,
    ConnectorService,
    EventBusService,
    _decrypt_value,
    _encrypt_value,
)
from app.services.marketplace_payments import MarketplacePaymentsService
from app.services.mcp_client import McpClient, McpClientError, McpClientManager
from app.services.oauth_service import (
    OAuthService,
    cleanup_expired_codes_and_tokens,
    _AUTH_CODES,
    _REFRESH_TOKENS,
    AUTH_CODE_TTL_SECONDS,
)
from app.services.plugin_analytics import PluginAnalyticsService
from app.services.plugin_sandbox import PluginSandbox
from app.services.sdk_generator import SdkGeneratorService, SUPPORTED_LANGUAGES
from app.services.webhook_delivery import (
    WebhookDeliveryWorker,
    compute_next_retry,
    should_retry,
    sign_payload,
    BACKOFF_MINUTES,
)

import app.models  # noqa: F401


@pytest_asyncio.fixture
async def prod_setup():
    """Spin up in-memory SQLite + org + user for production-hardening tests."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        org = Organization(name="Prod Test Org", slug=f"prod-{uuid.uuid4().hex[:8]}", is_active=True)
        session.add(org); await session.flush()
        user = User(email="prod@test.com", full_name="Prod User",
                    hashed_password=hash_password("TestPass123!"), is_active=True, is_email_verified=True)
        session.add(user); await session.flush()
        session.add(UserOrganization(user_id=str(user.id), organization_id=str(org.id),
                                       role="org_owner", is_active=True))
        session.add(Role(name="org_owner", display_name="Owner", is_system=True,
                           scope="global", priority=90))
        await session.commit()
        org_id = str(org.id); user_id = str(user.id)

    async with async_session() as session:
        yield session, org_id, user_id
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clear_oauth_state():
    """Clear OAuth state stores between tests."""
    _AUTH_CODES.clear()
    _REFRESH_TOKENS.clear()
    yield
    _AUTH_CODES.clear()
    _REFRESH_TOKENS.clear()


# ====================================================================
# OAuth2 Service tests
# ====================================================================

@pytest.mark.asyncio
class TestOAuthService:
    async def test_client_credentials_grant(self, prod_setup):
        session, org_id, _ = prod_setup
        # Create a developer app
        dev_svc = DeveloperPortalService(db=session)
        app, raw_secret = await dev_svc.create_app(
            organization_id=uuid.UUID(org_id), name="Test OAuth App",
            scopes=["read:agents", "write:workflows"])
        await session.commit()

        svc = OAuthService(session)
        result = await svc.exchange_client_credentials(
            client_id=app.client_id, client_secret=raw_secret,
            scopes=["read:agents"])
        await session.commit()
        assert result["token_type"] == "Bearer"
        assert result["access_token"]
        assert result["refresh_token"]
        assert result["expires_in"] == 3600
        assert "read:agents" in result["scope"]

    async def test_client_credentials_invalid_secret_rejected(self, prod_setup):
        session, org_id, _ = prod_setup
        dev_svc = DeveloperPortalService(db=session)
        app, _ = await dev_svc.create_app(
            organization_id=uuid.UUID(org_id), name="Wrong Secret App")
        await session.commit()
        svc = OAuthService(session)
        from app.core.exceptions import AuthenticationError
        with pytest.raises(AuthenticationError):
            await svc.exchange_client_credentials(
                client_id=app.client_id, client_secret="wrong_secret")

    async def test_authorization_code_grant_full_flow(self, prod_setup):
        session, org_id, user_id = prod_setup
        dev_svc = DeveloperPortalService(db=session)
        app, raw_secret = await dev_svc.create_app(
            organization_id=uuid.UUID(org_id), name="Auth Code App",
            redirect_uris=["https://example.com/callback"],
            scopes=["read:agents"])
        await session.commit()
        svc = OAuthService(session)
        # Step 1: Create authorization code
        code = await svc.create_authorization_code(
            client_id=app.client_id, user_id=user_id,
            redirect_uri="https://example.com/callback",
            scopes=["read:agents"], state="xyz123")
        await session.commit()
        assert code.startswith("djcode_")
        # Step 2: Exchange code for tokens
        result = await svc.exchange_authorization_code(
            code=code, client_id=app.client_id, client_secret=raw_secret,
            redirect_uri="https://example.com/callback")
        await session.commit()
        assert result["access_token"]
        assert result["refresh_token"]
        assert result["expires_in"] == 3600

    async def test_authorization_code_one_time_use(self, prod_setup):
        session, org_id, user_id = prod_setup
        dev_svc = DeveloperPortalService(db=session)
        app, raw_secret = await dev_svc.create_app(
            organization_id=uuid.UUID(org_id), name="One Time App",
            redirect_uris=["https://example.com/cb"], scopes=["read:agents"])
        await session.commit()
        svc = OAuthService(session)
        code = await svc.create_authorization_code(
            client_id=app.client_id, user_id=user_id,
            redirect_uri="https://example.com/cb", scopes=["read:agents"])
        await session.commit()
        # First exchange — succeeds
        await svc.exchange_authorization_code(
            code=code, client_id=app.client_id, client_secret=raw_secret,
            redirect_uri="https://example.com/cb")
        await session.commit()
        # Second exchange — should fail
        from app.core.exceptions import AuthenticationError
        with pytest.raises(AuthenticationError):
            await svc.exchange_authorization_code(
                code=code, client_id=app.client_id, client_secret=raw_secret,
                redirect_uri="https://example.com/cb")

    async def test_refresh_token_rotates(self, prod_setup):
        session, org_id, _ = prod_setup
        dev_svc = DeveloperPortalService(db=session)
        app, _ = await dev_svc.create_app(
            organization_id=uuid.UUID(org_id), name="Refresh App",
            scopes=["read:agents"])
        await session.commit()
        svc = OAuthService(session)
        result = await svc.exchange_client_credentials(
            client_id=app.client_id, client_secret=await _get_app_secret(dev_svc, app.id, uuid.UUID(org_id)),
            scopes=["read:agents"])
        await session.commit()
        first_refresh = result["refresh_token"]
        # Refresh — should return a new refresh token
        new_result = await svc.refresh_access_token(
            refresh_token=first_refresh, client_id=app.client_id)
        await session.commit()
        assert new_result["access_token"]
        assert new_result["refresh_token"] != first_refresh
        # Old refresh token should no longer work
        from app.core.exceptions import AuthenticationError
        with pytest.raises(AuthenticationError):
            await svc.refresh_access_token(refresh_token=first_refresh)

    async def test_validate_access_token(self, prod_setup):
        session, org_id, _ = prod_setup
        dev_svc = DeveloperPortalService(db=session)
        app, raw_secret = await dev_svc.create_app(
            organization_id=uuid.UUID(org_id), name="Validate App",
            scopes=["read:agents"])
        await session.commit()
        svc = OAuthService(session)
        result = await svc.exchange_client_credentials(
            client_id=app.client_id, client_secret=raw_secret, scopes=["read:agents"])
        await session.commit()
        claims = await svc.validate_access_token(result["access_token"])
        assert claims["sub"] == str(app.id)
        assert claims["client_id"] == app.client_id
        assert claims["token_type"] == "oauth"
        assert "read:agents" in claims["scopes"]

    async def test_validate_access_token_invalid(self, prod_setup):
        session, _, _ = prod_setup
        svc = OAuthService(session)
        from app.core.exceptions import AuthenticationError
        with pytest.raises(AuthenticationError):
            await svc.validate_access_token("invalid.jwt.token")

    async def test_revoke_refresh_token(self, prod_setup):
        session, org_id, _ = prod_setup
        dev_svc = DeveloperPortalService(db=session)
        app, raw_secret = await dev_svc.create_app(
            organization_id=uuid.UUID(org_id), name="Revoke App",
            scopes=["read:agents"])
        await session.commit()
        svc = OAuthService(session)
        result = await svc.exchange_client_credentials(
            client_id=app.client_id, client_secret=raw_secret, scopes=["read:agents"])
        await session.commit()
        revoked = await svc.revoke_token(token=result["refresh_token"])
        assert revoked is True
        # Refresh should fail after revocation
        from app.core.exceptions import AuthenticationError
        with pytest.raises(AuthenticationError):
            await svc.refresh_access_token(refresh_token=result["refresh_token"])

    async def test_cleanup_expired(self, prod_setup):
        session, org_id, _ = prod_setup
        dev_svc = DeveloperPortalService(db=session)
        app, raw_secret = await dev_svc.create_app(
            organization_id=uuid.UUID(org_id), name="Cleanup App", scopes=["read:agents"])
        await session.commit()
        svc = OAuthService(session)
        result = await svc.exchange_client_credentials(
            client_id=app.client_id, client_secret=raw_secret, scopes=["read:agents"])
        await session.commit()
        # Manually expire the refresh token
        token_hash_key = None
        for k, v in _REFRESH_TOKENS.items():
            if v["client_id"] == app.client_id:
                v["expires_at"] = datetime.now(UTC) - timedelta(seconds=1)
                token_hash_key = k
                break
        cleaned = cleanup_expired_codes_and_tokens()
        assert cleaned >= 1
        assert token_hash_key not in _REFRESH_TOKENS


async def _get_app_secret(dev_svc, app_id, org_id) -> str:
    """Helper — rotate to get a new secret (since create_app returns it once)."""
    app, raw_secret = await dev_svc.rotate_secret(app_id=app_id, organization_id=org_id)
    return raw_secret


# ====================================================================
# Webhook Delivery Worker tests
# ====================================================================

class TestWebhookDeliveryHelpers:
    def test_compute_next_retry_exponential(self):
        from datetime import datetime
        first = compute_next_retry(1)
        second = compute_next_retry(2)
        third = compute_next_retry(3)
        # Each retry should be progressively later
        first_delay = (first - datetime.now(first.tzinfo)).total_seconds()
        second_delay = (second - datetime.now(second.tzinfo)).total_seconds()
        third_delay = (third - datetime.now(third.tzinfo)).total_seconds()
        # First retry: ~1 minute (allow jitter)
        assert 30 <= first_delay <= 90
        # Second: ~2 minutes
        assert 90 <= second_delay <= 180
        # Third: ~4 minutes
        assert 180 <= third_delay <= 360

    def test_compute_next_retry_capped_at_32_min(self):
        from datetime import datetime
        tenth = compute_next_retry(10)
        delay_min = (tenth - datetime.now(tenth.tzinfo)).total_seconds() / 60
        # Should be capped at 32 minutes (with jitter)
        assert delay_min <= 40

    def test_should_retry_on_5xx(self):
        assert should_retry(500, None) is True
        assert should_retry(502, None) is True
        assert should_retry(503, None) is True

    def test_should_retry_on_429(self):
        assert should_retry(429, None) is True

    def test_should_retry_on_timeout(self):
        assert should_retry(None, "timeout") is True

    def test_should_not_retry_on_4xx(self):
        assert should_retry(400, None) is False
        assert should_retry(401, None) is False
        assert should_retry(403, None) is False
        assert should_retry(404, None) is False

    def test_should_not_retry_on_2xx(self):
        assert should_retry(200, None) is False
        assert should_retry(201, None) is False

    def test_sign_payload_format(self):
        signature = sign_payload(b'{"event": "test"}', "my_secret")
        assert signature.startswith("t=")
        assert "v1=" in signature
        # Different payloads produce different signatures
        sig2 = sign_payload(b'{"event": "other"}', "my_secret")
        assert signature != sig2

    def test_sign_payload_secret_dependent(self):
        sig1 = sign_payload(b'{"x": 1}', "secret_one")
        sig2 = sign_payload(b'{"x": 1}', "secret_two")
        assert sig1 != sig2


@pytest.mark.asyncio
class TestWebhookDeliveryWorker:
    async def test_run_once_no_pending(self, prod_setup):
        session, org_id, _ = prod_setup
        worker = WebhookDeliveryWorker(session, max_events=10)
        stats = await worker.run_once()
        assert stats["total_processed"] == 0
        assert stats["delivered"] == 0
        await worker.close()

    async def test_run_once_delivers_pending_event(self, prod_setup):
        session, org_id, _ = prod_setup
        # Create a subscription + incoming event (auto-fan-out creates outgoing events)
        from app.services.marketplace_ecosystem import WebhookPlatformService
        wh_svc = WebhookPlatformService(session)
        sub, secret = await wh_svc.create_subscription(
            organization_id=uuid.UUID(org_id), name="Test Sub",
            target_url="https://example.com/hook", event_types=["test.event"])
        await session.commit()
        await wh_svc.receive_incoming(
            organization_id=uuid.UUID(org_id), event_type="test.event",
            event_id="evt_test_1", payload={"hello": "world"})
        await session.commit()
        # Verify outgoing events exist
        from sqlalchemy import select
        outgoing_q = await session.execute(
            select(WebhookEventLog).where(WebhookEventLog.direction == "outgoing"))
        outgoing = outgoing_q.scalars().all()
        assert len(outgoing) >= 1
        # Inject a fake HTTP client that always returns 200
        class FakeResponse:
            status_code = 200
            text = '{"ok": true}'
        class FakeClient:
            async def post(self, *args, **kwargs):
                return FakeResponse()
            async def aclose(self):
                pass
        worker = WebhookDeliveryWorker(session, max_events=10, http_client=FakeClient())
        stats = await worker.run_once()
        await session.commit()
        assert stats["delivered"] >= 1
        await worker.close()

    async def test_run_once_retries_on_5xx(self, prod_setup):
        session, org_id, _ = prod_setup
        from app.services.marketplace_ecosystem import WebhookPlatformService
        wh_svc = WebhookPlatformService(session)
        sub, _ = await wh_svc.create_subscription(
            organization_id=uuid.UUID(org_id), name="Retry Sub",
            target_url="https://example.com/hook", event_types=["retry.event"],
            max_retries=3)
        await session.commit()
        await wh_svc.receive_incoming(
            organization_id=uuid.UUID(org_id), event_type="retry.event",
            event_id="evt_retry_1", payload={"x": 1})
        await session.commit()
        # Fake HTTP client that always returns 503
        class FakeResponse:
            status_code = 503
            text = 'Service Unavailable'
        class FakeClient:
            async def post(self, *args, **kwargs):
                return FakeResponse()
            async def aclose(self):
                pass
        worker = WebhookDeliveryWorker(session, max_events=10, http_client=FakeClient())
        stats = await worker.run_once()
        await session.commit()
        assert stats["retried"] >= 1
        # Event should be scheduled for retry
        from sqlalchemy import select
        events_q = await session.execute(
            select(WebhookEventLog).where(WebhookEventLog.direction == "outgoing"))
        for ev in events_q.scalars().all():
            if ev.event_id.startswith("evt_retry_1"):
                assert ev.status == "retry"
                assert ev.next_retry_at is not None
                break
        await worker.close()


# ====================================================================
# Event Bus Worker tests
# ====================================================================

class TestEventBusFilter:
    def test_filter_match_all(self):
        assert _matches_filter({"a": 1}, "*") is True
        assert _matches_filter({}, "") is True

    def test_filter_equality_string(self):
        assert _matches_filter({"event_type": "order.created"},
                                'event_type == "order.created"') is True
        assert _matches_filter({"event_type": "order.cancelled"},
                                'event_type == "order.created"') is False

    def test_filter_numeric_comparison(self):
        assert _matches_filter({"priority": 10}, "priority >= 5") is True
        assert _matches_filter({"priority": 2}, "priority >= 5") is False

    def test_filter_not_equal(self):
        assert _matches_filter({"status": "open"}, 'status != "closed"') is True
        assert _matches_filter({"status": "closed"}, 'status != "closed"') is False

    def test_filter_invalid_expression_returns_true(self):
        # On parse errors, default to True (don't filter out)
        # An empty filter expression should also return True
        assert _matches_filter({"a": 1}, "") is True
        assert _matches_filter({"a": 1}, None) is True


@pytest.mark.asyncio
class TestEventBusWorker:
    async def test_run_once_no_pending(self, prod_setup):
        session, org_id, _ = prod_setup
        worker = EventBusWorker(session, max_messages=10)
        stats = await worker.run_once()
        assert stats["total_processed"] == 0

    async def test_run_once_delivers_messages(self, prod_setup):
        session, org_id, _ = prod_setup
        # Create topic + subscription + publish
        from app.services.marketplace_ecosystem import EventBusService
        eb_svc = EventBusService(session)
        topic = await eb_svc.create_topic(
            organization_id=uuid.UUID(org_id), name="worker.test")
        await session.commit()
        await eb_svc.create_subscription(
            organization_id=uuid.UUID(org_id), topic_id=topic.id,
            subscriber_type="queue", name="Worker Sub")
        await session.commit()
        await eb_svc.publish(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                              event_id="evt_worker_1", payload={"x": 1})
        await session.commit()
        worker = EventBusWorker(session, max_messages=10)
        stats = await worker.run_once()
        await session.commit()
        assert stats["delivered"] == 1
        assert stats["total_processed"] == 1

    async def test_filtered_subscription_no_op(self, prod_setup):
        session, org_id, _ = prod_setup
        from app.services.marketplace_ecosystem import EventBusService
        eb_svc = EventBusService(session)
        topic = await eb_svc.create_topic(
            organization_id=uuid.UUID(org_id), name="filter.test")
        await session.commit()
        await eb_svc.create_subscription(
            organization_id=uuid.UUID(org_id), topic_id=topic.id,
            subscriber_type="queue", name="Filtered Sub",
            filter_expression='event_type == "skip_me"')
        await session.commit()
        # Publish an event that doesn't match the filter
        await eb_svc.publish(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                              event_id="evt_filtered_1", payload={"event_type": "different"})
        await session.commit()
        worker = EventBusWorker(session, max_messages=10)
        stats = await worker.run_once()
        await session.commit()
        # Should be marked delivered (filter-out = no-op success)
        assert stats["delivered"] == 1


# ====================================================================
# Full-text Search Service tests
# ====================================================================

@pytest.mark.asyncio
class TestFullTextSearchService:
    async def test_search_marketplace_short_query_rejected(self, prod_setup):
        session, org_id, _ = prod_setup
        svc = FullTextSearchService(session)
        result = await svc.search_marketplace(query="a", organization_id=uuid.UUID(org_id))
        assert result["total"] == 0

    async def test_search_marketplace_finds_published(self, prod_setup):
        session, org_id, _ = prod_setup
        mkt_svc = MarketplaceService(session)
        item = await mkt_svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="GitHub Sync Master",
            slug="gh-sync-master", summary="Sync GitHub repos with DayJoy",
            description="Full GitHub integration")
        item.status = "published"
        await session.commit()
        svc = FullTextSearchService(session)
        result = await svc.search_marketplace(query="github", organization_id=uuid.UUID(org_id))
        assert result["total"] >= 1
        assert "GitHub" in result["results"][0]["name"]

    async def test_search_plugins(self, prod_setup):
        session, org_id, _ = prod_setup
        plugin_svc = PluginService(session)
        plugin = await plugin_svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="Stripe Payments",
            slug="stripe-payments", description="Accept payments via Stripe")
        plugin.is_published = True
        await session.commit()
        svc = FullTextSearchService(session)
        result = await svc.search_plugins(query="stripe", organization_id=uuid.UUID(org_id))
        assert result["total"] >= 1

    async def test_search_connectors(self, prod_setup):
        session, _, _ = prod_setup
        conn_svc = ConnectorService(session)
        await conn_svc.create_connector(
            name="Slack", slug="slack-search-test", category="communication",
            provider="slack", auth_type="oauth2", description="Team chat")
        await session.commit()
        svc = FullTextSearchService(session)
        result = await svc.search_connectors(query="slack")
        assert result["total"] >= 1

    async def test_unified_search(self, prod_setup):
        session, org_id, _ = prod_setup
        mkt_svc = MarketplaceService(session)
        item = await mkt_svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Unified Test Item",
            slug="unified-test")
        item.status = "published"
        await session.commit()
        svc = FullTextSearchService(session)
        result = await svc.unified_search(query="unified", organization_id=uuid.UUID(org_id))
        assert result["total"] >= 1
        assert "marketplace" in result["results"]


# ====================================================================
# Plugin Sandbox tests
# ====================================================================

@pytest.mark.asyncio
class TestPluginSandbox:
    async def test_execute_stub_plugin(self, prod_setup):
        session, org_id, user_id = prod_setup
        # Create + install a plugin
        plugin_svc = PluginService(session)
        plugin = await plugin_svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="Sandbox Test Plugin",
            slug="sandbox-test-plugin", entrypoint="main.py",
            permissions=[{"name": "filesystem:read", "required": True, "risk_level": "low"}])
        await session.commit()
        installation = await plugin_svc.install_plugin(
            plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
            installed_by=user_id,
            granted_permissions=["filesystem:read"])
        await session.commit()
        sandbox = PluginSandbox(session, timeout=10, memory_limit_mb=64)
        result = await sandbox.execute(installation_id=installation.id,
                                         args={"hello": "world"})
        assert result.success is True
        assert result.exit_code == 0
        assert isinstance(result.result, dict)
        # The stub echoes back the args
        assert "echo" in result.result

    async def test_execute_nonexistent_installation(self, prod_setup):
        session, _, _ = prod_setup
        sandbox = PluginSandbox(session)
        from app.core.exceptions import NotFoundError
        with pytest.raises(NotFoundError):
            await sandbox.execute(installation_id=uuid.uuid4())

    async def test_execute_inactive_installation(self, prod_setup):
        session, org_id, user_id = prod_setup
        plugin_svc = PluginService(session)
        plugin = await plugin_svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="Inactive Plugin",
            slug="inactive-plugin")
        await session.commit()
        installation = await plugin_svc.install_plugin(
            plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
            installed_by=user_id)
        installation.status = "disabled"
        await session.commit()
        sandbox = PluginSandbox(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await sandbox.execute(installation_id=installation.id)

    async def test_execute_missing_required_permission(self, prod_setup):
        session, org_id, user_id = prod_setup
        plugin_svc = PluginService(session)
        plugin = await plugin_svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="Permission Plugin",
            slug="perm-plugin",
            permissions=[{"name": "network:access", "required": True, "risk_level": "high"}])
        await session.commit()
        # Install WITHOUT granting the required permission
        installation = await plugin_svc.install_plugin(
            plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
            installed_by=user_id, granted_permissions=[])  # empty!
        await session.commit()
        sandbox = PluginSandbox(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await sandbox.execute(installation_id=installation.id)

    async def test_health_check(self, prod_setup):
        session, org_id, user_id = prod_setup
        plugin_svc = PluginService(session)
        plugin = await plugin_svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="Health Plugin",
            slug="health-plugin")
        await session.commit()
        installation = await plugin_svc.install_plugin(
            plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
            installed_by=user_id)
        await session.commit()
        sandbox = PluginSandbox(session, timeout=10)
        result = await sandbox.health_check(installation_id=installation.id)
        await session.commit()
        assert result["success"] is True
        assert result["duration_ms"] > 0


# ====================================================================
# Plugin Analytics tests
# ====================================================================

@pytest.mark.asyncio
class TestPluginAnalyticsService:
    async def test_get_overview_empty(self, prod_setup):
        session, org_id, _ = prod_setup
        svc = PluginAnalyticsService(session)
        overview = await svc.get_overview(organization_id=uuid.UUID(org_id))
        assert overview["total_installations"] == 0
        assert overview["active_installations"] == 0
        assert overview["health_check_pass_rate"] == 0.0

    async def test_get_overview_with_installations(self, prod_setup):
        session, org_id, user_id = prod_setup
        # Create + install plugins
        plugin_svc = PluginService(session)
        plugin = await plugin_svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="Analytics Plugin",
            slug="analytics-plugin")
        await session.commit()
        await plugin_svc.install_plugin(
            plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
            installed_by=user_id)
        await session.commit()
        svc = PluginAnalyticsService(session)
        overview = await svc.get_overview(organization_id=uuid.UUID(org_id))
        assert overview["total_installations"] == 1
        assert overview["active_installations"] == 1
        assert overview["healthy_installations"] == 1

    async def test_get_top_plugins(self, prod_setup):
        session, org_id, _ = prod_setup
        plugin_svc = PluginService(session)
        p1 = await plugin_svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="Top Plugin 1",
            slug="top-plugin-1")
        p1.is_published = True
        p2 = await plugin_svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="Top Plugin 2",
            slug="top-plugin-2")
        p2.is_published = True
        await session.commit()
        svc = PluginAnalyticsService(session)
        result = await svc.get_top_plugins(organization_id=uuid.UUID(org_id), limit=5)
        assert len(result["plugins"]) == 2

    async def test_get_error_summary(self, prod_setup):
        session, org_id, user_id = prod_setup
        plugin_svc = PluginService(session)
        plugin = await plugin_svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="Error Plugin",
            slug="error-plugin")
        await session.commit()
        installation = await plugin_svc.install_plugin(
            plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
            installed_by=user_id)
        installation.status = "error"
        installation.health_status = "error"
        installation.error_message = "Plugin crashed"
        await session.commit()
        svc = PluginAnalyticsService(session)
        result = await svc.get_error_summary(organization_id=uuid.UUID(org_id), days=7)
        assert result["total_errors"] == 1
        assert result["errors"][0]["plugin_name"] == "Error Plugin"


# ====================================================================
# SDK Generator tests
# ====================================================================

SAMPLE_OPENAPI_SPEC = {
    "openapi": "3.0.0",
    "info": {
        "title": "Sample API",
        "version": "1.0.0",
        "description": "A sample API for SDK generation tests",
    },
    "paths": {
        "/users": {
            "get": {
                "operationId": "list_users",
                "summary": "List all users",
                "description": "Returns a paginated list of users.",
                "parameters": [
                    {"name": "limit", "in": "query", "schema": {"type": "integer"}},
                    {"name": "offset", "in": "query", "schema": {"type": "integer"}},
                ],
                "responses": {"200": {"description": "OK"}},
            },
            "post": {
                "operationId": "create_user",
                "summary": "Create a new user",
                "requestBody": {"content": {"application/json": {"schema": {"type": "object"}}}},
                "responses": {"201": {"description": "Created"}},
            },
        },
        "/users/{user_id}": {
            "get": {
                "operationId": "get_user",
                "summary": "Get a single user",
                "parameters": [
                    {"name": "user_id", "in": "path", "required": True, "schema": {"type": "string"}},
                ],
                "responses": {"200": {"description": "OK"}},
            },
            "delete": {
                "operationId": "delete_user",
                "summary": "Delete a user",
                "parameters": [
                    {"name": "user_id", "in": "path", "required": True, "schema": {"type": "string"}},
                ],
                "responses": {"204": {"description": "Deleted"}},
            },
        },
    },
}


class TestSdkGeneratorService:
    def test_extract_operations(self):
        svc = SdkGeneratorService()
        ops = svc._extract_operations(SAMPLE_OPENAPI_SPEC)
        assert len(ops) == 4
        op_ids = [op["operation_id"] for op in ops]
        assert "list_users" in op_ids
        assert "create_user" in op_ids
        assert "get_user" in op_ids
        assert "delete_user" in op_ids

    def test_generate_python_sdk(self):
        svc = SdkGeneratorService()
        result = svc.generate_from_spec(
            spec=SAMPLE_OPENAPI_SPEC, language="python",
            package_name="sample_sdk", version="1.0.0",
            base_url="https://api.example.com",
            api_name="Sample API", api_description="Test API")
        assert result["language"] == "python"
        assert result["package_name"] == "sample_sdk"
        assert result["operation_count"] == 4
        assert "sample_sdk/client.py" in result["files"]
        assert "sample_sdk/__init__.py" in result["files"]
        assert "sample_sdk/pyproject.toml" in result["files"]
        assert "sample_sdk/README.md" in result["files"]
        # Verify client.py has the methods (camelCase by convention)
        client_code = result["files"]["sample_sdk/client.py"]
        assert "def listUsers" in client_code
        assert "def createUser" in client_code
        assert "def getUser" in client_code
        assert "def deleteUser" in client_code
        assert "SampleSdkClient" in client_code

    def test_generate_typescript_sdk(self):
        svc = SdkGeneratorService()
        result = svc.generate_from_spec(
            spec=SAMPLE_OPENAPI_SPEC, language="typescript",
            package_name="sample-sdk", version="1.0.0",
            base_url="https://api.example.com",
            api_name="Sample API", api_description="Test API")
        assert "client.ts" in result["files"]
        assert "package.json" in result["files"]
        assert "tsconfig.json" in result["files"]
        ts_code = result["files"]["client.ts"]
        assert "listUsers" in ts_code
        assert "createUser" in ts_code
        assert "SampleSdkClient" in ts_code

    def test_generate_javascript_sdk(self):
        svc = SdkGeneratorService()
        result = svc.generate_from_spec(
            spec=SAMPLE_OPENAPI_SPEC, language="javascript",
            package_name="sample-sdk-js", version="1.0.0",
            base_url="https://api.example.com",
            api_name="Sample API", api_description="Test API")
        assert "client.js" in result["files"]
        assert "tsconfig.json" not in result["files"]  # JS doesn't need tsconfig

    def test_generate_go_sdk(self):
        svc = SdkGeneratorService()
        result = svc.generate_from_spec(
            spec=SAMPLE_OPENAPI_SPEC, language="go",
            package_name="sample_sdk", version="1.0.0",
            base_url="https://api.example.com",
            api_name="Sample API", api_description="Test API")
        assert "client.go" in result["files"]
        assert "go.mod" in result["files"]
        go_code = result["files"]["client.go"]
        assert "func (c *Client) ListUsers" in go_code

    def test_generate_java_sdk(self):
        svc = SdkGeneratorService()
        result = svc.generate_from_spec(
            spec=SAMPLE_OPENAPI_SPEC, language="java",
            package_name="sample-sdk", version="1.0.0",
            base_url="https://api.example.com",
            api_name="Sample API", api_description="Test API")
        assert "pom.xml" in result["files"]
        assert any(k.endswith(".java") for k in result["files"])

    def test_generate_csharp_sdk(self):
        svc = SdkGeneratorService()
        result = svc.generate_from_spec(
            spec=SAMPLE_OPENAPI_SPEC, language="csharp",
            package_name="Sample.Sdk", version="1.0.0",
            base_url="https://api.example.com",
            api_name="Sample API", api_description="Test API")
        assert any(k.endswith(".cs") for k in result["files"])
        assert any(k.endswith(".csproj") for k in result["files"])

    def test_generate_rust_sdk(self):
        svc = SdkGeneratorService()
        result = svc.generate_from_spec(
            spec=SAMPLE_OPENAPI_SPEC, language="rust",
            package_name="sample_sdk", version="1.0.0",
            base_url="https://api.example.com",
            api_name="Sample API", api_description="Test API")
        assert "src/lib.rs" in result["files"]
        assert "Cargo.toml" in result["files"]
        rust_code = result["files"]["src/lib.rs"]
        assert "async fn listUsers" in rust_code

    def test_unsupported_language_rejected(self):
        svc = SdkGeneratorService()
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            svc.generate_from_spec(
                spec=SAMPLE_OPENAPI_SPEC, language="cobol",
                package_name="x", base_url="", api_name="", api_description="")

    def test_spec_without_paths_rejected(self):
        svc = SdkGeneratorService()
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            svc.generate_from_spec(spec={"info": {}}, language="python",
                                     package_name="x", base_url="", api_name="", api_description="")

    def test_supported_languages_count(self):
        assert len(SUPPORTED_LANGUAGES) == 7
        assert "python" in SUPPORTED_LANGUAGES
        assert "typescript" in SUPPORTED_LANGUAGES
        assert "rust" in SUPPORTED_LANGUAGES


# ====================================================================
# Marketplace Payments tests
# ====================================================================

@pytest.mark.asyncio
class TestMarketplacePaymentsService:
    async def test_calculate_fee_default_commission(self, prod_setup):
        session, _, _ = prod_setup
        svc = MarketplacePaymentsService(session)
        # 10% commission by default
        fees = svc.calculate_fee(1000)  # $10.00
        assert fees["price_cents"] == 1000
        assert fees["platform_fee_cents"] == 100  # 10% of 1000 = 100
        assert fees["seller_take_cents"] == 900
        assert fees["commission_rate_bps"] == 1000

    async def test_calculate_fee_zero_price(self, prod_setup):
        session, _, _ = prod_setup
        svc = MarketplacePaymentsService(session)
        fees = svc.calculate_fee(0)
        assert fees["platform_fee_cents"] == 0
        assert fees["seller_take_cents"] == 0

    async def test_calculate_fee_negative_rejected(self, prod_setup):
        session, _, _ = prod_setup
        svc = MarketplacePaymentsService(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            svc.calculate_fee(-100)

    async def test_create_payment_intent_ledger_mode(self, prod_setup):
        session, org_id, user_id = prod_setup
        # Create a paid marketplace item
        mkt_svc = MarketplaceService(session)
        item = await mkt_svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Paid Plugin", slug="paid-plugin",
            is_free=False, price_cents=1500)  # $15.00
        item.status = "published"
        await session.commit()
        svc = MarketplacePaymentsService(session)
        result = await svc.create_payment_intent(
            item_id=item.id, buyer_org_id=uuid.UUID(org_id), buyer_user_id=user_id)
        assert result["mode"] == "ledger"  # No Stripe configured
        assert result["intent_id"].startswith("djpay_ledger_")
        assert result["amount_cents"] == 1500
        assert result["platform_fee_cents"] == 150  # 10%
        assert result["seller_take_cents"] == 1350

    async def test_create_payment_intent_free_item_rejected(self, prod_setup):
        session, org_id, _ = prod_setup
        mkt_svc = MarketplaceService(session)
        item = await mkt_svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Free Plugin", slug="free-plugin",
            is_free=True, price_cents=0)
        await session.commit()
        svc = MarketplacePaymentsService(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.create_payment_intent(item_id=item.id,
                                              buyer_org_id=uuid.UUID(org_id))

    async def test_confirm_purchase_ledger_mode(self, prod_setup):
        session, org_id, user_id = prod_setup
        mkt_svc = MarketplaceService(session)
        item = await mkt_svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Confirm Plugin", slug="confirm-plugin",
            is_free=False, price_cents=500)
        item.status = "published"
        await session.commit()
        svc = MarketplacePaymentsService(session)
        intent = await svc.create_payment_intent(
            item_id=item.id, buyer_org_id=uuid.UUID(org_id), buyer_user_id=user_id)
        await session.commit()
        result = await svc.confirm_purchase(
            intent_id=intent["intent_id"], item_id=item.id,
            buyer_org_id=uuid.UUID(org_id), buyer_user_id=user_id)
        await session.commit()
        assert result["granted"] is True
        assert result["payment_status"] == "succeeded"
        # Item counters should be bumped
        refreshed = await mkt_svc.get_item(item_id=item.id, organization_id=uuid.UUID(org_id))
        assert refreshed.install_count == 1

    def test_verify_webhook_signature_valid(self, prod_setup):
        session, _, _ = prod_setup
        svc = MarketplacePaymentsService(session)
        secret = "whsec_test_secret"
        payload = b'{"id": "evt_123", "type": "payment_intent.succeeded"}'
        # Build a valid signature
        import hmac, hashlib, time
        timestamp = str(int(time.time()))
        signed = f"{timestamp}.".encode() + payload
        sig = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
        signature = f"t={timestamp},v1={sig}"
        assert svc.verify_webhook_signature(payload=payload, signature=signature,
                                              webhook_secret=secret) is True

    def test_verify_webhook_signature_invalid(self, prod_setup):
        session, _, _ = prod_setup
        svc = MarketplacePaymentsService(session)
        payload = b'{"id": "evt_123"}'
        assert svc.verify_webhook_signature(payload=payload, signature="t=1,v1=invalid",
                                              webhook_secret="secret") is False

    def test_verify_webhook_signature_no_secret(self, prod_setup):
        session, _, _ = prod_setup
        svc = MarketplacePaymentsService(session)
        assert svc.verify_webhook_signature(payload=b"{}", signature="",
                                              webhook_secret=None) is False

    async def test_process_webhook_payment_succeeded(self, prod_setup):
        session, org_id, user_id = prod_setup
        mkt_svc = MarketplaceService(session)
        item = await mkt_svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="WH Plugin", slug="wh-plugin",
            is_free=False, price_cents=1000)
        item.status = "published"
        await session.commit()
        # Build a fake Stripe event
        event = {
            "id": "evt_test_1",
            "type": "payment_intent.succeeded",
            "data": {"object": {
                "id": "djpay_ledger_fake",  # so confirm_purchase goes through ledger path
                "metadata": {
                    "item_id": str(item.id),
                    "buyer_org_id": org_id,
                    "buyer_user_id": user_id,
                },
            }},
        }
        svc = MarketplacePaymentsService(session)
        result = await svc.process_webhook_event(event=event)
        await session.commit()
        assert result["processed"] is True
        assert result["event_type"] == "payment_intent.succeeded"

    async def test_process_webhook_unhandled_event_type(self, prod_setup):
        session, _, _ = prod_setup
        svc = MarketplacePaymentsService(session)
        event = {"id": "evt_2", "type": "customer.created", "data": {"object": {}}}
        result = await svc.process_webhook_event(event=event)
        assert result["processed"] is False
        assert "unhandled" in result["reason"]


# ====================================================================
# Connector OAuth Service tests
# ====================================================================

@pytest.mark.asyncio
class TestConnectorOAuthService:
    async def test_build_authorization_url_for_non_oauth_rejected(self, prod_setup):
        session, _, _ = prod_setup
        conn_svc = ConnectorService(session)
        connector = await conn_svc.create_connector(
            name="API Key Connector", slug="api-key-test",
            category="database", provider="mysql", auth_type="api_key")
        await session.commit()
        svc = ConnectorOAuthService(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.build_authorization_url_async(
                connector_id=connector.id, organization_id=uuid.uuid4(),
                user_id="user", redirect_uri="https://example.com/cb")

    async def test_build_authorization_url_missing_config(self, prod_setup):
        session, _, _ = prod_setup
        conn_svc = ConnectorService(session)
        connector = await conn_svc.create_connector(
            name="No Config OAuth", slug="no-config-oauth",
            category="crm", provider="test", auth_type="oauth2",
            auth_config={})  # Empty config — missing authorize_url + client_id
        await session.commit()
        svc = ConnectorOAuthService(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.build_authorization_url_async(
                connector_id=connector.id, organization_id=uuid.uuid4(),
                user_id="user", redirect_uri="https://example.com/cb")

    async def test_build_authorization_url_with_pkce(self, prod_setup):
        session, org_id, user_id = prod_setup
        conn_svc = ConnectorService(session)
        connector = await conn_svc.create_connector(
            name="GitHub OAuth", slug="github-oauth-test",
            category="development", provider="github", auth_type="oauth2",
            auth_config={
                "authorize_url": "https://github.com/login/oauth/authorize",
                "token_url": "https://github.com/login/oauth/access_token",
                "client_id": "test_client_id",
                "client_secret_encrypted": _encrypt_value("test_secret"),
                "scopes": ["repo", "user"],
                "pkce": True,
            })
        await session.commit()
        svc = ConnectorOAuthService(session)
        result = await svc.build_authorization_url_async(
            connector_id=connector.id, organization_id=uuid.UUID(org_id),
            user_id=user_id, redirect_uri="https://example.com/cb",
            scopes=["repo"], use_pkce=True)
        assert "authorization_url" in result
        assert "state" in result
        assert "code_verifier" in result
        assert "github.com/login/oauth/authorize" in result["authorization_url"]
        assert "client_id=test_client_id" in result["authorization_url"]
        assert "code_challenge" in result["authorization_url"]
        assert "code_challenge_method=S256" in result["authorization_url"]

    async def test_exchange_code_invalid_state(self, prod_setup):
        session, _, _ = prod_setup
        svc = ConnectorOAuthService(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.exchange_code(code="invalid_code", state="invalid_state")

    async def test_refresh_token_non_oauth_rejected(self, prod_setup):
        session, org_id, _ = prod_setup
        # Create an api_key instance
        conn_svc = ConnectorService(session)
        connector = await conn_svc.create_connector(
            name="API Key Refused", slug="api-key-refused",
            category="database", provider="mysql", auth_type="api_key")
        await session.commit()
        instance = await conn_svc.create_instance(
            connector_id=connector.id, organization_id=uuid.UUID(org_id),
            name="Test Instance", auth_type="api_key",
            credentials={"api_key": "abc"})
        await session.commit()
        svc = ConnectorOAuthService(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.refresh_token(instance_id=instance.id, organization_id=uuid.UUID(org_id))


# ====================================================================
# MCP Client tests (mocked)
# ====================================================================

class TestMcpClientHelpers:
    def test_method_constants(self):
        from app.services.mcp_client import (
            METHOD_INITIALIZE, METHOD_TOOLS_LIST, METHOD_TOOLS_CALL,
            METHOD_RESOURCES_LIST, METHOD_RESOURCES_READ, METHOD_PING)
        assert METHOD_INITIALIZE == "initialize"
        assert METHOD_TOOLS_LIST == "tools/list"
        assert METHOD_TOOLS_CALL == "tools/call"
        assert METHOD_RESOURCES_LIST == "resources/list"
        assert METHOD_RESOURCES_READ == "resources/read"
        assert METHOD_PING == "ping"

    def test_client_constants(self):
        from app.services.mcp_client import CLIENT_NAME, CLIENT_VERSION, PROTOCOL_VERSION
        assert CLIENT_NAME == "dayjoy-mcp-client"
        assert CLIENT_VERSION == "1.0.0"
        assert PROTOCOL_VERSION == "2024-11-05"


@pytest.mark.asyncio
class TestMcpClient:
    async def test_client_init_no_endpoint_raises(self, prod_setup):
        from app.models.marketplace_ecosystem import McpServer
        session, _, _ = prod_setup
        # Build a minimal server with no endpoint
        server = McpServer(
            name="No Endpoint", slug="no-endpoint", transport="http",
            endpoint=None, organization_id=None, is_enabled=True,
            auth_type="none")
        session.add(server)
        await session.commit()
        client = McpClient(server=server)
        from app.services.mcp_client import McpClientError
        with pytest.raises(McpClientError, match="no endpoint"):
            await client._send_request("ping")

    async def test_client_auth_headers_bearer(self, prod_setup):
        from app.models.marketplace_ecosystem import McpServer
        session, _, _ = prod_setup
        server = McpServer(
            name="Bearer Auth", slug="bearer-auth", transport="http",
            endpoint="http://localhost:8080/mcp", organization_id=None,
            is_enabled=True, auth_type="bearer",
            auth_config_encrypted=_encrypt_value(json.dumps({"token": "abc123"})))
        session.add(server)
        await session.commit()
        client = McpClient(server=server)
        headers = client._build_auth_headers()
        assert headers["Authorization"] == "Bearer abc123"

    async def test_client_auth_headers_api_key(self, prod_setup):
        from app.models.marketplace_ecosystem import McpServer
        session, _, _ = prod_setup
        server = McpServer(
            name="API Key Auth", slug="api-key-auth", transport="http",
            endpoint="http://localhost:8080/mcp", organization_id=None,
            is_enabled=True, auth_type="api_key",
            auth_config_encrypted=_encrypt_value(json.dumps({"api_key": "key_abc"})))
        session.add(server)
        await session.commit()
        client = McpClient(server=server)
        headers = client._build_auth_headers()
        assert headers["X-API-Key"] == "key_abc"

    async def test_client_auth_headers_custom_header(self, prod_setup):
        from app.models.marketplace_ecosystem import McpServer
        session, _, _ = prod_setup
        server = McpServer(
            name="Custom Header", slug="custom-header", transport="http",
            endpoint="http://localhost:8080/mcp", organization_id=None,
            is_enabled=True, auth_type="api_key",
            auth_config_encrypted=_encrypt_value(json.dumps({
                "api_key": "key_xyz", "header_name": "X-Custom-Key"})))
        session.add(server)
        await session.commit()
        client = McpClient(server=server)
        headers = client._build_auth_headers()
        assert headers["X-Custom-Key"] == "key_xyz"

    async def test_client_auth_headers_none_auth(self, prod_setup):
        from app.models.marketplace_ecosystem import McpServer
        session, _, _ = prod_setup
        server = McpServer(
            name="No Auth", slug="no-auth", transport="http",
            endpoint="http://localhost:8080/mcp", organization_id=None,
            is_enabled=True, auth_type="none")
        session.add(server)
        await session.commit()
        client = McpClient(server=server)
        headers = client._build_auth_headers()
        assert headers == {}  # No auth headers when type=none


@pytest.mark.asyncio
class TestMcpClientManager:
    async def test_get_client_disabled_server_rejected(self, prod_setup):
        session, org_id, _ = prod_setup
        from app.models.marketplace_ecosystem import McpServer
        server = McpServer(
            name="Disabled", slug="disabled-srv", transport="http",
            endpoint="http://localhost:8080", organization_id=str(org_id),
            is_enabled=False, auth_type="none")
        session.add(server)
        await session.commit()
        from app.services.marketplace_ecosystem import McpService
        # Need to set organization_id properly
        server.organization_id = str(org_id)
        await session.commit()
        manager = McpClientManager(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await manager.get_client(server_id=server.id)

    async def test_get_client_unsupported_transport_rejected(self, prod_setup):
        session, org_id, _ = prod_setup
        from app.models.marketplace_ecosystem import McpServer
        server = McpServer(
            name="Stdio Server", slug="stdio-srv", transport="stdio",
            endpoint="/usr/local/bin/mcp-server", organization_id=str(org_id),
            is_enabled=True, auth_type="none")
        session.add(server)
        await session.commit()
        manager = McpClientManager(session)
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError, match="transport"):
            await manager.get_client(server_id=server.id)

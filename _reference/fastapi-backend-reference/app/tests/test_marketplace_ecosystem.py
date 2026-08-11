"""Tests for Enterprise AI Ecosystem — marketplace, plugins, connectors, MCP, webhooks, event bus, developer portal, AI gateway, search, governance."""

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
from app.models.marketplace_ecosystem import (
    EventBusMessage,
    EcosystemPlugin,
    EcosystemPluginInstallation,
    EcosystemPluginVersion,
    MarketplaceItem,
    WebhookEventLog,
    WebhookSubscription,
)
from app.models.organization import Organization, UserOrganization
from app.models.role import Role
from app.models.user import User
from app.services.marketplace_ecosystem import (
    AiGatewayService,
    ConnectorService,
    DeveloperPortalService,
    EventBusService,
    GlobalSearchService,
    GovernanceService,
    MarketplaceService,
    McpService,
    PluginService,
    WebhookPlatformService,
    _encrypt_value,
    _decrypt_value,
    _hash_secret,
    _generate_client_id,
    _generate_client_secret,
    _generate_signing_secret,
)

import app.models  # noqa: F401


@pytest_asyncio.fixture
async def ecosystem_setup():
    """Spin up in-memory SQLite + create org + user for ecosystem tests."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        org = Organization(name="Ecosystem Test Org", slug=f"eco-{uuid.uuid4().hex[:8]}", is_active=True)
        session.add(org); await session.flush()
        user = User(email="eco@test.com", full_name="Eco User",
                    hashed_password=hash_password("TestPass123!"), is_active=True, is_email_verified=True)
        session.add(user); await session.flush()
        session.add(UserOrganization(user_id=str(user.id), organization_id=str(org.id), role="org_owner", is_active=True))
        session.add(Role(name="org_owner", display_name="Owner", is_system=True, scope="global", priority=90))
        await session.commit()
        org_id = str(org.id); user_id = str(user.id)

    async with async_session() as session:
        yield session, org_id, user_id
    await engine.dispose()


# ====================================================================
# Helper tests — encryption, hashing, ID generation
# ====================================================================

class TestHelpers:
    def test_encrypt_decrypt_roundtrip(self):
        original = "super-secret-api-key-12345"
        encrypted = _encrypt_value(original)
        assert encrypted != original
        decrypted = _decrypt_value(encrypted)
        assert decrypted == original

    def test_encrypt_with_unicode(self):
        original = "ünïcödé-sécrét-🔑"
        encrypted = _encrypt_value(original)
        assert _decrypt_value(encrypted) == original

    def test_hash_secret_is_deterministic(self):
        secret = "my_client_secret_value"
        h1 = _hash_secret(secret)
        h2 = _hash_secret(secret)
        assert h1 == h2
        assert h1 != secret
        assert len(h1) == 64  # SHA-256 hex

    def test_generate_client_id_format(self):
        cid = _generate_client_id()
        assert cid.startswith("djapp_")
        assert len(cid) > 30

    def test_generate_client_id_uniqueness(self):
        ids = {_generate_client_id() for _ in range(20)}
        assert len(ids) == 20

    def test_generate_client_secret_format(self):
        sec = _generate_client_secret()
        assert sec.startswith("djsec_")
        assert len(sec) > 40

    def test_generate_signing_secret_format(self):
        sec = _generate_signing_secret()
        assert sec.startswith("djwh_")
        assert len(sec) > 30


# ====================================================================
# Marketplace Service tests
# ====================================================================

@pytest.mark.asyncio
class TestMarketplaceService:
    async def test_create_category(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = MarketplaceService(session)
        cat = await svc.create_category(slug="crms", name="CRMs", item_type="connector")
        await session.commit()
        assert cat.slug == "crms"
        assert cat.item_type == "connector"
        assert cat.is_active is True

    async def test_list_categories_filter_by_item_type(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = MarketplaceService(session)
        await svc.create_category(slug="plug", name="Plugins", item_type="plugin")
        await svc.create_category(slug="conn", name="Connectors", item_type="connector")
        await session.commit()
        plugin_cats = await svc.list_categories(item_type="plugin")
        assert len(plugin_cats) == 1
        assert plugin_cats[0].slug == "plug"

    async def test_create_item(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Test Plugin", slug="test-plugin",
            summary="A test plugin for testing", description="Full description here",
            tags=["test", "demo"])
        await session.commit()
        assert item.item_type == "plugin"
        assert item.status == "draft"
        assert item.visibility == "public"
        assert item.is_free is True
        assert "test" in item.tags

    async def test_get_item_increments_view_count(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="View Counter", slug="view-counter")
        await session.commit()
        initial_views = item.view_count
        await svc.get_item(item_id=item.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        refreshed = await svc.get_item(item_id=item.id, organization_id=uuid.UUID(org_id))
        assert refreshed.view_count >= initial_views + 2

    async def test_publish_item(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Pub Test", slug="pub-test")
        await session.commit()
        published = await svc.publish_item(item_id=item.id, organization_id=uuid.UUID(org_id))
        assert published.status == "published"
        assert published.published_at is not None

    async def test_archive_item(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Archive", slug="archive")
        await session.commit()
        archived = await svc.archive_item(item_id=item.id, organization_id=uuid.UUID(org_id))
        assert archived.status == "archived"

    async def test_list_items_with_search(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = MarketplaceService(session)
        await svc.create_item(organization_id=uuid.UUID(org_id), item_type="plugin",
                              entity_id=str(uuid.uuid4()), name="Salesforce Sync", slug="sf-sync")
        await svc.create_item(organization_id=uuid.UUID(org_id), item_type="plugin",
                              entity_id=str(uuid.uuid4()), name="Slack Notifier", slug="slack-notify")
        await session.commit()
        # Publish both so they show up in the default published filter
        items, _ = await svc.list_items(organization_id=uuid.UUID(org_id), status=None, search="salesforce")
        assert len(items) == 1
        assert items[0].name == "Salesforce Sync"

    async def test_record_download_increments_counts(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Download Test", slug="dl-test")
        await session.commit()
        initial_dl = item.download_count
        await svc.record_download(item_id=item.id, organization_id=uuid.UUID(org_id),
                                   user_id=user_id, action="install")
        await session.commit()
        refreshed = await svc.get_item(item_id=item.id, organization_id=uuid.UUID(org_id))
        assert refreshed.download_count == initial_dl + 1
        assert refreshed.install_count == 1

    async def test_rate_item(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Rate Test", slug="rate-test")
        await session.commit()
        await svc.rate_item(item_id=item.id, organization_id=uuid.UUID(org_id),
                             user_id=user_id, rating=4)
        await session.commit()
        refreshed = await svc.get_item(item_id=item.id, organization_id=uuid.UUID(org_id))
        assert refreshed.rating_count == 1
        assert refreshed.rating_sum == 4
        assert refreshed.rating_avg == 4.0

    async def test_rate_item_updates_existing(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Rate Update", slug="rate-update")
        await session.commit()
        await svc.rate_item(item_id=item.id, organization_id=uuid.UUID(org_id),
                             user_id=user_id, rating=5)
        await session.commit()
        await svc.rate_item(item_id=item.id, organization_id=uuid.UUID(org_id),
                             user_id=user_id, rating=3)
        await session.commit()
        refreshed = await svc.get_item(item_id=item.id, organization_id=uuid.UUID(org_id))
        assert refreshed.rating_count == 1  # didn't increment
        assert refreshed.rating_sum == 3  # replaced 5 with 3
        assert refreshed.rating_avg == 3.0

    async def test_invalid_rating_rejected(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Bad Rating", slug="bad-rating")
        await session.commit()
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.rate_item(item_id=item.id, organization_id=uuid.UUID(org_id),
                                 user_id=user_id, rating=6)

    async def test_create_review(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Review Test", slug="review-test")
        await session.commit()
        review = await svc.create_review(
            item_id=item.id, organization_id=uuid.UUID(org_id), user_id=user_id,
            user_name="Tester", rating=5, title="Great!", body="Loved it.")
        await session.commit()
        assert review.rating == 5
        assert review.body == "Loved it."
        assert review.status == "published"

    async def test_moderate_item(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = MarketplaceService(session)
        item = await svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Mod Test", slug="mod-test")
        await session.commit()
        approved = await svc.moderate_item(item_id=item.id, action="approve")
        assert approved.status == "published"
        featured = await svc.moderate_item(item_id=item.id, action="feature")
        assert featured.is_featured is True


# ====================================================================
# Plugin Service tests
# ====================================================================

@pytest.mark.asyncio
class TestPluginService:
    async def test_create_plugin_auto_creates_first_version(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = PluginService(session)
        plugin = await svc.create_plugin(
            organization_id=uuid.UUID(org_id), name="My Plugin", slug="my-plugin",
            description="Test plugin", category="utility", tags=["test"],
            author_id=user_id, author_name="Tester",
            permissions=[{"name": "read:knowledge", "required": True, "risk_level": "low"}])
        await session.commit()
        assert plugin.current_version == "1.0.0"
        versions = await svc.list_versions(plugin_id=plugin.id)
        assert len(versions) == 1
        assert versions[0].version == "1.0.0"
        assert versions[0].is_active is True

    async def test_list_plugins_with_search(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = PluginService(session)
        await svc.create_plugin(organization_id=uuid.UUID(org_id), name="GitHub Sync",
                                slug="github-sync", description="Sync with GitHub")
        await svc.create_plugin(organization_id=uuid.UUID(org_id), name="Slack Notifier",
                                slug="slack-notifier", description="Send Slack alerts")
        await session.commit()
        plugins, total = await svc.list_plugins(organization_id=uuid.UUID(org_id),
                                                 is_published=None, search="github")
        assert total == 1
        assert plugins[0].name == "GitHub Sync"

    async def test_publish_plugin(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = PluginService(session)
        plugin = await svc.create_plugin(organization_id=uuid.UUID(org_id),
                                          name="Publish Test", slug="publish-test")
        await session.commit()
        published = await svc.publish_plugin(plugin_id=plugin.id)
        assert published.is_published is True

    async def test_install_plugin(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = PluginService(session)
        plugin = await svc.create_plugin(organization_id=uuid.UUID(org_id),
                                          name="Install Test", slug="install-test")
        await session.commit()
        installation = await svc.install_plugin(
            plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
            installed_by=user_id, config={"foo": "bar"})
        await session.commit()
        assert installation.status == "active"
        assert installation.is_sandboxed is True
        assert installation.health_status == "healthy"
        # install_count should increment
        refreshed = await svc.get_plugin(plugin_id=plugin.id)
        assert refreshed.install_count == 1

    async def test_cannot_install_twice(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = PluginService(session)
        plugin = await svc.create_plugin(organization_id=uuid.UUID(org_id),
                                          name="Double Install", slug="double-install")
        await session.commit()
        await svc.install_plugin(plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
                                  installed_by=user_id)
        await session.commit()
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.install_plugin(plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
                                      installed_by=user_id)

    async def test_uninstall_plugin(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = PluginService(session)
        plugin = await svc.create_plugin(organization_id=uuid.UUID(org_id),
                                          name="Uninstall Test", slug="uninstall-test")
        await session.commit()
        inst = await svc.install_plugin(plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
                                         installed_by=user_id)
        await session.commit()
        result = await svc.uninstall_plugin(installation_id=inst.id)
        assert result is True
        # Verify status changed
        refreshed = await session.get(EcosystemPluginInstallation, inst.id)
        assert refreshed.status == "disabled"

    async def test_health_check(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = PluginService(session)
        plugin = await svc.create_plugin(organization_id=uuid.UUID(org_id),
                                          name="Health Test", slug="health-test")
        await session.commit()
        inst = await svc.install_plugin(plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
                                         installed_by=user_id)
        await session.commit()
        result = await svc.health_check(installation_id=inst.id, status="degraded",
                                         error="High memory usage")
        await session.commit()
        assert result.health_status == "degraded"
        assert result.status == "error"
        assert "memory" in (result.error_message or "")

    async def test_list_installations(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = PluginService(session)
        plugin = await svc.create_plugin(organization_id=uuid.UUID(org_id),
                                          name="List Installs", slug="list-installs")
        await session.commit()
        await svc.install_plugin(plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
                                  installed_by=user_id)
        await session.commit()
        installations, total = await svc.list_installations(organization_id=uuid.UUID(org_id))
        assert total == 1
        assert installations[0].plugin_id == plugin.id

    async def test_yank_version(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = PluginService(session)
        plugin = await svc.create_plugin(organization_id=uuid.UUID(org_id),
                                          name="Yank Test", slug="yank-test")
        await session.commit()
        # Yank the only version
        yanked = await svc.yank_version(plugin_id=plugin.id, version="1.0.0")
        assert yanked.is_yanked is True
        assert yanked.is_active is False

    async def test_create_plugin_review_updates_rating(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = PluginService(session)
        plugin = await svc.create_plugin(organization_id=uuid.UUID(org_id),
                                          name="Review Plugin", slug="review-plugin")
        await session.commit()
        await svc.create_review(plugin_id=plugin.id, organization_id=uuid.UUID(org_id),
                                 user_id=user_id, user_name="Tester",
                                 rating=4, title="Good", body="Works well")
        await session.commit()
        refreshed = await svc.get_plugin(plugin_id=plugin.id)
        assert refreshed.rating_avg == 4.0
        assert refreshed.rating_count == 1


# ====================================================================
# Connector Service tests
# ====================================================================

@pytest.mark.asyncio
class TestConnectorService:
    async def test_create_connector(self, ecosystem_setup):
        session, _, _ = ecosystem_setup
        svc = ConnectorService(session)
        connector = await svc.create_connector(
            name="Slack", slug="slack", category="communication", provider="slack",
            auth_type="oauth2", capabilities=["read", "write", "webhook"],
            webhook_supported=True)
        await session.commit()
        assert connector.slug == "slack"
        assert connector.category == "communication"
        assert connector.is_active is True

    async def test_list_connectors_by_category(self, ecosystem_setup):
        session, _, _ = ecosystem_setup
        svc = ConnectorService(session)
        await svc.create_connector(name="Salesforce", slug="salesforce", category="crm",
                                    provider="salesforce", auth_type="oauth2")
        await svc.create_connector(name="Slack", slug="slack", category="communication",
                                    provider="slack", auth_type="oauth2")
        await session.commit()
        crms, total = await svc.list_connectors(category="crm")
        assert total == 1
        assert crms[0].name == "Salesforce"

    async def test_known_connectors_catalog(self):
        assert len(ConnectorService.KNOWN_CONNECTORS) >= 30
        slugs = {c["slug"] for c in ConnectorService.KNOWN_CONNECTORS}
        assert "salesforce" in slugs
        assert "slack" in slugs
        assert "github" in slugs
        assert "stripe" in slugs
        assert "postgresql" in slugs

    async def test_create_instance_encrypts_credentials(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = ConnectorService(session)
        connector = await svc.create_connector(
            name="Stripe", slug="stripe", category="payment", provider="stripe",
            auth_type="api_key")
        await session.commit()
        instance = await svc.create_instance(
            connector_id=connector.id, organization_id=uuid.UUID(org_id),
            name="Production Stripe", auth_type="api_key",
            credentials={"api_key": "sk_test_12345"}, installed_by=user_id)
        await session.commit()
        # Stored credentials must not be plaintext
        assert instance.credentials_encrypted is not None
        assert "sk_test_12345" not in instance.credentials_encrypted
        assert instance.health_status == "healthy"

    async def test_get_credentials_decrypts(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = ConnectorService(session)
        connector = await svc.create_connector(
            name="GitHub", slug="gh-test", category="development", provider="github",
            auth_type="api_key")
        await session.commit()
        instance = await svc.create_instance(
            connector_id=connector.id, organization_id=uuid.UUID(org_id),
            name="GitHub Instance", auth_type="api_key",
            credentials={"token": "ghp_abc123"})
        await session.commit()
        creds = await svc.get_credentials(instance_id=instance.id, organization_id=uuid.UUID(org_id))
        assert creds == {"token": "ghp_abc123"}

    async def test_cannot_create_duplicate_instance_name(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = ConnectorService(session)
        connector = await svc.create_connector(
            name="Jira", slug="jira-test", category="development", provider="atlassian",
            auth_type="oauth2")
        await session.commit()
        await svc.create_instance(connector_id=connector.id, organization_id=uuid.UUID(org_id),
                                   name="Prod Jira", auth_type="oauth2", credentials={})
        await session.commit()
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.create_instance(connector_id=connector.id, organization_id=uuid.UUID(org_id),
                                       name="Prod Jira", auth_type="oauth2", credentials={})

    async def test_delete_instance_wipes_credentials(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = ConnectorService(session)
        connector = await svc.create_connector(
            name="Box", slug="box-test", category="storage", provider="box",
            auth_type="oauth2")
        await session.commit()
        instance = await svc.create_instance(
            connector_id=connector.id, organization_id=uuid.UUID(org_id),
            name="Box Test", auth_type="oauth2", credentials={"token": "secret"})
        await session.commit()
        assert instance.credentials_encrypted is not None
        await svc.delete_instance(instance_id=instance.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        refreshed = await session.get(type(instance), instance.id)
        assert refreshed.status == "disabled"
        assert refreshed.credentials_encrypted is None

    async def test_record_call_increments_counter(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = ConnectorService(session)
        connector = await svc.create_connector(
            name="MongoDB", slug="mongo-test", category="database", provider="mongodb",
            auth_type="basic")
        await session.commit()
        instance = await svc.create_instance(
            connector_id=connector.id, organization_id=uuid.UUID(org_id),
            name="MongoDB Test", auth_type="basic", credentials={"user": "admin"})
        await session.commit()
        initial_calls = instance.total_calls
        await svc.record_call(instance_id=instance.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert instance.total_calls == initial_calls + 1


# ====================================================================
# MCP Service tests
# ====================================================================

@pytest.mark.asyncio
class TestMcpService:
    async def test_register_server(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = McpService(session)
        server = await svc.register_server(
            organization_id=uuid.UUID(org_id), name="Filesystem MCP",
            slug="filesystem-mcp", transport="stdio",
            endpoint="/usr/local/bin/mcp-filesystem",
            description="Filesystem MCP server",
            version="1.0.0", vendor="Anthropic")
        await session.commit()
        assert server.transport == "stdio"
        assert server.is_enabled is True
        assert server.health_status == "unknown"

    async def test_register_tool_increments_count(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = McpService(session)
        server = await svc.register_server(
            organization_id=uuid.UUID(org_id), name="Tools Server", slug="tools-srv",
            transport="http", endpoint="http://localhost:3000")
        await session.commit()
        await svc.register_tool(
            server_id=server.id, organization_id=uuid.UUID(org_id),
            name="read_file", description="Read a file",
            input_schema={"path": "string"},
            is_destructive=False, requires_confirmation=False)
        await session.commit()
        refreshed = await svc.get_server(server_id=server.id)
        assert refreshed.tool_count == 1

    async def test_register_resource(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = McpService(session)
        server = await svc.register_server(
            organization_id=uuid.UUID(org_id), name="Resources Server", slug="res-srv",
            transport="http", endpoint="http://localhost:3001")
        await session.commit()
        resource = await svc.register_resource(
            server_id=server.id, organization_id=uuid.UUID(org_id),
            uri="file:///etc/config.json", name="config.json",
            mime_type="application/json", size_bytes=1024)
        await session.commit()
        assert resource.uri == "file:///etc/config.json"
        refreshed = await svc.get_server(server_id=server.id)
        assert refreshed.resource_count == 1

    async def test_invoke_tool_updates_stats(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = McpService(session)
        server = await svc.register_server(
            organization_id=uuid.UUID(org_id), name="Invoke Srv", slug="invoke-srv",
            transport="http", endpoint="http://localhost:3002")
        await session.commit()
        tool = await svc.register_tool(
            server_id=server.id, organization_id=uuid.UUID(org_id),
            name="search", description="Search tool")
        await session.commit()
        await svc.invoke_tool(tool_id=tool.id, latency_ms=150, success=True)
        await svc.invoke_tool(tool_id=tool.id, latency_ms=200, success=True)
        await session.commit()
        assert tool.invoke_count == 2
        assert tool.avg_latency_ms is not None
        assert tool.last_invoked_at is not None

    async def test_health_check_updates_status(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = McpService(session)
        server = await svc.register_server(
            organization_id=uuid.UUID(org_id), name="Health Srv", slug="health-srv",
            transport="http", endpoint="http://localhost:3003")
        await session.commit()
        result = await svc.health_check(server_id=server.id, status="healthy")
        assert result.health_status == "healthy"
        assert result.last_health_check is not None

    async def test_discover_tools_creates_and_updates(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = McpService(session)
        server = await svc.register_server(
            organization_id=uuid.UUID(org_id), name="Discover Srv", slug="discover-srv",
            transport="http", endpoint="http://localhost:3004")
        await session.commit()
        discovered = [
            {"name": "tool_a", "description": "First tool", "input_schema": {"x": "int"}},
            {"name": "tool_b", "description": "Second tool", "input_schema": {"y": "string"}},
        ]
        result = await svc.discover_tools(server_id=server.id, discovered=discovered)
        await session.commit()
        assert result["new_tools"] == 2
        assert result["updated_tools"] == 0
        # Re-discover with updated description for tool_a
        rediscovered = [
            {"name": "tool_a", "description": "Updated description", "input_schema": {"x": "int"}},
            {"name": "tool_c", "description": "New tool", "input_schema": {}},
        ]
        result2 = await svc.discover_tools(server_id=server.id, discovered=rediscovered)
        await session.commit()
        assert result2["new_tools"] == 1  # tool_c
        assert result2["updated_tools"] == 1  # tool_a


# ====================================================================
# Webhook Platform Service tests
# ====================================================================

@pytest.mark.asyncio
class TestWebhookPlatformService:
    async def test_create_subscription_returns_secret(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = WebhookPlatformService(session)
        sub, secret = await svc.create_subscription(
            organization_id=uuid.UUID(org_id), name="Slack Notify",
            target_url="https://hooks.slack.com/services/abc",
            event_types=["agent.created", "workflow.completed"])
        await session.commit()
        assert sub.target_url.startswith("https://hooks.slack.com")
        assert secret.startswith("djwh_")
        # Stored secret must be encrypted (not plaintext)
        assert secret not in (sub.secret_encrypted or "")

    async def test_receive_incoming_is_idempotent(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = WebhookPlatformService(session)
        first = await svc.receive_incoming(
            organization_id=uuid.UUID(org_id), event_type="order.created",
            event_id="evt_001", payload={"order_id": "ord_123"})
        await session.commit()
        second = await svc.receive_incoming(
            organization_id=uuid.UUID(org_id), event_type="order.created",
            event_id="evt_001", payload={"order_id": "ord_123"})
        await session.commit()
        assert first.id == second.id  # Same record returned

    async def test_receive_incoming_fans_out_to_subscriptions(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = WebhookPlatformService(session)
        # Create two subscriptions listening to the same event
        await svc.create_subscription(organization_id=uuid.UUID(org_id), name="Sub1",
                                       target_url="https://example.com/h1",
                                       event_types=["order.created"])
        await svc.create_subscription(organization_id=uuid.UUID(org_id), name="Sub2",
                                       target_url="https://example.com/h2",
                                       event_types=["order.created"])
        await session.commit()
        await svc.receive_incoming(organization_id=uuid.UUID(org_id),
                                    event_type="order.created", event_id="evt_fanout_1",
                                    payload={"hi": "there"})
        await session.commit()
        # Verify two outgoing events were created
        from sqlalchemy import select
        outgoing_q = await session.execute(
            select(WebhookEventLog).where(
                WebhookEventLog.organization_id == org_id,
                WebhookEventLog.direction == "outgoing"))
        outgoing = outgoing_q.scalars().all()
        assert len(outgoing) == 2

    async def test_deliver_pending_marks_delivered(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = WebhookPlatformService(session)
        await svc.create_subscription(organization_id=uuid.UUID(org_id), name="Sub",
                                       target_url="https://example.com/h1",
                                       event_types=["test.event"])
        await session.commit()
        await svc.receive_incoming(organization_id=uuid.UUID(org_id),
                                    event_type="test.event", event_id="evt_deliver_1",
                                    payload={"x": 1})
        await session.commit()
        result = await svc.deliver_pending(organization_id=uuid.UUID(org_id))
        await session.commit()
        assert result["delivered"] >= 1

    async def test_replay_event(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = WebhookPlatformService(session)
        event = await svc.receive_incoming(
            organization_id=uuid.UUID(org_id), event_type="test.event",
            event_id="evt_replay_1", payload={"a": 1})
        await session.commit()
        # Force it to delivered, then replay
        event.status = "delivered"
        await session.flush()
        replayed = await svc.replay_event(event_id=event.id)
        await session.commit()
        assert replayed.status == "pending"
        assert replayed.attempt_count == 0

    async def test_sign_and_verify_payload(self):
        secret = "djwh_test_secret"
        payload = b'{"event": "test", "data": "hello"}'
        signature = WebhookPlatformService.sign_payload(payload, secret)
        assert WebhookPlatformService.verify_signature(payload, signature, secret) is True
        # Tampered payload should fail
        assert WebhookPlatformService.verify_signature(b"tampered", signature, secret) is False
        # Wrong secret should fail
        assert WebhookPlatformService.verify_signature(payload, signature, "wrong") is False

    async def test_schedule_retry_marks_dead_letter_after_max(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = WebhookPlatformService(session)
        event = await svc.receive_incoming(
            organization_id=uuid.UUID(org_id), event_type="test.event",
            event_id="evt_retry_1", payload={"x": 1})
        await session.commit()
        # Simulate 5 failed attempts
        for i in range(5):
            event.attempt_count = i + 1
            await session.flush()
            await svc.schedule_retry(event_id=event.id, error=f"Attempt {i+1} failed")
            await session.commit()
        assert event.status == "dead_letter"

    async def test_list_events(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = WebhookPlatformService(session)
        await svc.receive_incoming(organization_id=uuid.UUID(org_id),
                                    event_type="evt.a", event_id="evt_list_1", payload={})
        await svc.receive_incoming(organization_id=uuid.UUID(org_id),
                                    event_type="evt.b", event_id="evt_list_2", payload={})
        await session.commit()
        events, total = await svc.list_events(organization_id=uuid.UUID(org_id))
        assert total == 2
        events_a, total_a = await svc.list_events(organization_id=uuid.UUID(org_id), event_type="evt.a")
        assert total_a == 1


# ====================================================================
# Event Bus Service tests
# ====================================================================

@pytest.mark.asyncio
class TestEventBusService:
    async def test_create_topic(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = EventBusService(session)
        topic = await svc.create_topic(
            organization_id=uuid.UUID(org_id), name="agent.created",
            description="Fires when a new agent is created",
            retention_hours=72)
        await session.commit()
        assert topic.name == "agent.created"
        assert topic.is_active is True
        assert topic.retention_hours == 72

    async def test_system_topics_constant(self):
        topics = EventBusService.SYSTEM_TOPICS
        assert "agent.created" in topics
        assert "workflow.completed" in topics
        assert "knowledge.document.uploaded" in topics
        assert "ai.guardrail.violated" in topics
        assert len(topics) >= 30

    async def test_create_subscription(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = EventBusService(session)
        topic = await svc.create_topic(organization_id=uuid.UUID(org_id), name="test.topic")
        await session.commit()
        sub = await svc.create_subscription(
            organization_id=uuid.UUID(org_id), topic_id=topic.id,
            subscriber_type="webhook", name="Test Sub",
            max_retries=5)
        await session.commit()
        assert sub.subscriber_type == "webhook"
        assert sub.is_active is True

    async def test_publish_fans_out_to_subscribers(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = EventBusService(session)
        topic = await svc.create_topic(organization_id=uuid.UUID(org_id), name="publish.test")
        await session.commit()
        await svc.create_subscription(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                       subscriber_type="webhook", name="Sub A")
        await svc.create_subscription(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                       subscriber_type="queue", name="Sub B")
        await session.commit()
        result = await svc.publish(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                    event_id="evt_pub_1", payload={"hello": "world"})
        await session.commit()
        assert result["subscribers_notified"] == 2
        assert len(result["message_ids"]) == 2

    async def test_publish_to_inactive_topic_rejected(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = EventBusService(session)
        topic = await svc.create_topic(organization_id=uuid.UUID(org_id), name="inactive.topic")
        topic.is_active = False
        await session.commit()
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.publish(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                               event_id="evt_x", payload={})

    async def test_process_pending_delivers(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = EventBusService(session)
        topic = await svc.create_topic(organization_id=uuid.UUID(org_id), name="process.test")
        await session.commit()
        await svc.create_subscription(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                       subscriber_type="queue", name="Sub")
        await session.commit()
        await svc.publish(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                           event_id="evt_proc_1", payload={"x": 1})
        await session.commit()
        result = await svc.process_pending(organization_id=uuid.UUID(org_id))
        await session.commit()
        assert result["delivered"] == 1

    async def test_schedule_retry_dead_letter(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = EventBusService(session)
        topic = await svc.create_topic(organization_id=uuid.UUID(org_id), name="retry.test")
        await session.commit()
        sub = await svc.create_subscription(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                             subscriber_type="queue", name="Sub", max_retries=2)
        await session.commit()
        pub_result = await svc.publish(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                        event_id="evt_retry_1", payload={})
        await session.commit()
        msg_id = uuid.UUID(pub_result["message_ids"][0])
        msg = await session.get(EventBusMessage, msg_id)
        # Fail max+1 times
        msg.attempt_count = 2
        await session.flush()
        await svc.schedule_retry(message_id=msg_id, error="Network error")
        await session.commit()
        assert msg.status == "dead_letter"

    async def test_replay_message(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = EventBusService(session)
        topic = await svc.create_topic(organization_id=uuid.UUID(org_id), name="replay.test")
        await session.commit()
        await svc.create_subscription(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                       subscriber_type="queue", name="Sub")
        await session.commit()
        pub_result = await svc.publish(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                        event_id="evt_replay_1", payload={})
        await session.commit()
        msg_id = uuid.UUID(pub_result["message_ids"][0])
        msg = await session.get(EventBusMessage, msg_id)
        msg.status = "delivered"
        await session.flush()
        replayed = await svc.replay_message(message_id=msg_id)
        await session.commit()
        assert replayed.status == "pending"
        assert replayed.attempt_count == 0

    async def test_get_dlq_stats(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = EventBusService(session)
        topic = await svc.create_topic(organization_id=uuid.UUID(org_id), name="dlq.test")
        await session.commit()
        await svc.create_subscription(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                       subscriber_type="queue", name="Sub")
        await session.commit()
        pub_result = await svc.publish(organization_id=uuid.UUID(org_id), topic_id=topic.id,
                                        event_id="evt_dlq_1", payload={})
        await session.commit()
        msg_id = uuid.UUID(pub_result["message_ids"][0])
        msg = await session.get(EventBusMessage, msg_id)
        msg.status = "dead_letter"
        await session.commit()
        stats = await svc.get_dlq_stats(organization_id=uuid.UUID(org_id))
        assert stats["total_dead_letter"] == 1


# ====================================================================
# Developer Portal Service tests
# ====================================================================

@pytest.mark.asyncio
class TestDeveloperPortalService:
    async def test_create_app_returns_secret(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = DeveloperPortalService(db=session)
        app, secret = await svc.create_app(
            organization_id=uuid.UUID(org_id), name="TestApp",
            description="Test app", app_type="server",
            scopes=["read:agents", "write:workflows"], created_by=user_id)
        await session.commit()
        assert app.client_id.startswith("djapp_")
        assert secret.startswith("djsec_")
        # Hash should be stored, not plaintext
        assert secret not in app.client_secret_hash
        assert app.client_secret_hash != secret

    async def test_validate_app_with_correct_credentials(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = DeveloperPortalService(db=session)
        app, secret = await svc.create_app(
            organization_id=uuid.UUID(org_id), name="ValidateApp")
        await session.commit()
        validated = await svc.validate_app(client_id=app.client_id, client_secret=secret)
        assert validated is not None
        assert validated.id == app.id

    async def test_validate_app_with_wrong_secret_returns_none(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = DeveloperPortalService(db=session)
        app, _ = await svc.create_app(organization_id=uuid.UUID(org_id), name="WrongSec")
        await session.commit()
        validated = await svc.validate_app(client_id=app.client_id, client_secret="wrong_secret")
        assert validated is None

    async def test_rotate_secret(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = DeveloperPortalService(db=session)
        app, old_secret = await svc.create_app(organization_id=uuid.UUID(org_id), name="Rotate")
        await session.commit()
        app_refreshed, new_secret = await svc.rotate_secret(app_id=app.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert new_secret != old_secret
        # Old secret should no longer validate
        assert await svc.validate_app(client_id=app.client_id, client_secret=old_secret) is None
        # New secret should validate
        assert await svc.validate_app(client_id=app.client_id, client_secret=new_secret) is not None

    async def test_record_request_increments(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = DeveloperPortalService(db=session)
        app, _ = await svc.create_app(organization_id=uuid.UUID(org_id), name="ReqCounter")
        await session.commit()
        await svc.record_request(app_id=app.id)
        await svc.record_request(app_id=app.id)
        await svc.record_request(app_id=app.id)
        await session.commit()
        assert app.total_requests == 3
        assert app.last_request_at is not None

    async def test_create_api_entry_counts_endpoints(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = DeveloperPortalService(db=session)
        entry = await svc.create_api_entry(
            organization_id=uuid.UUID(org_id), name="My API", slug="my-api",
            api_type="rest", base_url="https://api.example.com",
            openapi_spec={
                "openapi": "3.0.0",
                "paths": {
                    "/users": {"get": {}, "post": {}},
                    "/users/{id}": {"get": {}, "put": {}, "delete": {}},
                },
            })
        await session.commit()
        assert entry.endpoints_count == 5

    async def test_create_sdk_release(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = DeveloperPortalService(db=session)
        release = await svc.create_sdk_release(
            language="python", version="1.0.0", name="dayjoy-python",
            package_url="https://pypi.org/project/dayjoy",
            is_stable=True, published_by=user_id)
        await session.commit()
        assert release.language == "python"
        assert release.is_stable is True
        assert release.published_at is not None

    async def test_list_sdk_releases_by_language(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = DeveloperPortalService(db=session)
        await svc.create_sdk_release(language="python", version="1.0.0", name="py-sdk")
        await svc.create_sdk_release(language="typescript", version="1.0.0", name="ts-sdk")
        await session.commit()
        py_releases, total = await svc.list_sdk_releases(language="python")
        assert total == 1
        assert py_releases[0].language == "python"

    async def test_record_sdk_download(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = DeveloperPortalService(db=session)
        release = await svc.create_sdk_release(
            language="go", version="0.1.0", name="dayjoy-go")
        await session.commit()
        initial = release.download_count
        await svc.record_sdk_download(release_id=release.id)
        await session.commit()
        assert release.download_count == initial + 1


# ====================================================================
# AI Gateway Service tests
# ====================================================================

@pytest.mark.asyncio
class TestAiGatewayService:
    async def test_create_route(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = AiGatewayService(db=session)
        route = await svc.create_route(
            organization_id=uuid.UUID(org_id), name="Default Route",
            route_type="primary", strategy="cheapest",
            providers=[{"provider": "openai", "model": "gpt-4o-mini"}],
            fallback_chain=["anthropic", "gemini"])
        await session.commit()
        assert route.route_type == "primary"
        assert route.is_active is True
        assert route.priority == 100

    async def test_list_routes(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = AiGatewayService(db=session)
        await svc.create_route(organization_id=uuid.UUID(org_id), name="R1", priority=10)
        await svc.create_route(organization_id=uuid.UUID(org_id), name="R2", priority=20)
        await session.commit()
        routes, total = await svc.list_routes(organization_id=uuid.UUID(org_id))
        assert total == 2
        # Should be ordered by priority ascending
        assert routes[0].priority <= routes[1].priority

    async def test_select_provider_cheapest(self, ecosystem_setup):
        session, _, _ = ecosystem_setup
        svc = AiGatewayService(db=session)
        result = await svc.select_provider(strategy="cheapest")
        # Local model has cost 0.0, so it's the cheapest in the catalog
        assert result["strategy"] == "cheapest"
        assert result["provider"] in {"local", "deepseek", "openai"}  # any of the cheapest providers
        assert result["cost_per_1k_input"] is not None
        assert result["cost_per_1k_input"] == 0.0  # local wins with 0.0

    async def test_select_provider_fastest(self, ecosystem_setup):
        session, _, _ = ecosystem_setup
        svc = AiGatewayService(db=session)
        result = await svc.select_provider(strategy="fastest")
        # Groq is fastest at 150ms
        assert result["provider"] == "groq"
        assert result["avg_latency_ms"] == 150

    async def test_select_provider_with_capability_filter(self, ecosystem_setup):
        session, _, _ = ecosystem_setup
        svc = AiGatewayService(db=session)
        result = await svc.select_provider(strategy="highest_quality",
                                            required_capability="vision")
        # All providers in result must support vision
        assert "vision" in result["capabilities"]

    async def test_select_provider_with_max_cost_constraint(self, ecosystem_setup):
        session, _, _ = ecosystem_setup
        svc = AiGatewayService(db=session)
        result = await svc.select_provider(strategy="cheapest", max_cost_per_1k=0.001)
        assert result["cost_per_1k_input"] <= 0.001

    async def test_select_provider_no_match_raises(self, ecosystem_setup):
        session, _, _ = ecosystem_setup
        svc = AiGatewayService(db=session)
        from app.core.exceptions import ValidationError
        # Require a capability no provider supports
        with pytest.raises(ValidationError):
            await svc.select_provider(strategy="cheapest",
                                       required_capability="quantum_computing")

    async def test_record_request_increments(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = AiGatewayService(db=session)
        route = await svc.create_route(organization_id=uuid.UUID(org_id), name="RecRoute")
        await session.commit()
        await svc.record_request(route_id=route.id, used_fallback=True)
        await svc.record_request(route_id=route.id, used_fallback=False)
        await session.commit()
        assert route.total_requests == 2
        assert route.total_fallbacks == 1

    def test_known_providers_list(self):
        providers = AiGatewayService.KNOWN_PROVIDERS
        assert "openai" in providers
        assert "anthropic" in providers
        assert "gemini" in providers
        assert "groq" in providers
        assert "deepseek" in providers
        assert "mistral" in providers
        assert "local" in providers


# ====================================================================
# Global Search Service tests
# ====================================================================

@pytest.mark.asyncio
class TestGlobalSearchService:
    async def test_search_returns_empty_for_short_query(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        svc = GlobalSearchService(db=session)
        result = await svc.search(organization_id=uuid.UUID(org_id), query="a")
        assert result["total"] == 0

    async def test_search_finds_marketplace_items(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        mkt_svc = MarketplaceService(session)
        # Create + publish an item
        item = await mkt_svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="GitHub Super Sync",
            slug="github-super-sync", summary="Sync GitHub repos", tags=["dev"])
        item.status = "published"
        await session.commit()
        search_svc = GlobalSearchService(db=session)
        result = await search_svc.search(organization_id=uuid.UUID(org_id), query="GitHub")
        assert result["total"] >= 1

    async def test_search_finds_connectors(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        conn_svc = ConnectorService(session)
        await conn_svc.create_connector(name="Slack", slug="slack",
                                         category="communication", provider="slack",
                                         auth_type="oauth2")
        await session.commit()
        search_svc = GlobalSearchService(db=session)
        result = await search_svc.search(organization_id=uuid.UUID(org_id), query="slack")
        assert "connector" in result["results"]
        assert len(result["results"]["connector"]) == 1

    async def test_search_finds_mcp_servers(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        mcp_svc = McpService(session)
        await mcp_svc.register_server(
            organization_id=uuid.UUID(org_id), name="GitHub MCP",
            slug="github-mcp", transport="http", endpoint="http://localhost")
        await session.commit()
        search_svc = GlobalSearchService(db=session)
        result = await search_svc.search(organization_id=uuid.UUID(org_id), query="github")
        assert "mcp" in result["results"]

    async def test_search_filtered_by_type(self, ecosystem_setup):
        session, org_id, _ = ecosystem_setup
        mkt_svc = MarketplaceService(session)
        item = await mkt_svc.create_item(
            organization_id=uuid.UUID(org_id), item_type="plugin",
            entity_id=str(uuid.uuid4()), name="Filter Test", slug="filter-test")
        item.status = "published"
        await session.commit()
        search_svc = GlobalSearchService(db=session)
        result = await search_svc.search(organization_id=uuid.UUID(org_id), query="Filter",
                                          item_types=["agent"])
        assert "plugin" not in result["results"]  # filtered out


# ====================================================================
# Governance Service tests
# ====================================================================

@pytest.mark.asyncio
class TestGovernanceService:
    async def test_create_approval_low_risk_install_auto_approves(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = GovernanceService(db=session)
        approval = await svc.create_approval(
            organization_id=uuid.UUID(org_id), entity_type="plugin",
            entity_id=str(uuid.uuid4()), name="Install Sales Plugin",
            action="install", requested_by=user_id, risk_level="low")
        await session.commit()
        assert approval.status == "approved"
        assert approval.auto_approved is True
        assert approval.reviewed_at is not None

    async def test_create_approval_high_risk_requires_review(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = GovernanceService(db=session)
        approval = await svc.create_approval(
            organization_id=uuid.UUID(org_id), entity_type="plugin",
            entity_id=str(uuid.uuid4()), name="Publish Plugin",
            action="publish", requested_by=user_id, risk_level="high")
        await session.commit()
        assert approval.status == "pending"
        assert approval.auto_approved is False

    async def test_review_approval_approve(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = GovernanceService(db=session)
        approval = await svc.create_approval(
            organization_id=uuid.UUID(org_id), entity_type="connector",
            entity_id=str(uuid.uuid4()), name="Connect Salesforce",
            action="install", requested_by=user_id, risk_level="medium")
        await session.commit()
        reviewer_id = str(uuid.uuid4())
        reviewed = await svc.review_approval(approval_id=approval.id, organization_id=uuid.UUID(org_id),
                                              reviewer_id=reviewer_id, decision="approved",
                                              notes="Approved by IT")
        await session.commit()
        assert reviewed.status == "approved"
        assert reviewed.reviewer_id == reviewer_id
        assert "Approved by IT" in (reviewed.reviewer_notes or "")

    async def test_review_approval_reject(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = GovernanceService(db=session)
        approval = await svc.create_approval(
            organization_id=uuid.UUID(org_id), entity_type="plugin",
            entity_id=str(uuid.uuid4()), name="Risky Plugin",
            action="publish", requested_by=user_id, risk_level="critical")
        await session.commit()
        reviewer_id = str(uuid.uuid4())
        reviewed = await svc.review_approval(approval_id=approval.id, organization_id=uuid.UUID(org_id),
                                              reviewer_id=reviewer_id, decision="rejected",
                                              notes="Too risky")
        await session.commit()
        assert reviewed.status == "rejected"

    async def test_cannot_review_already_reviewed(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = GovernanceService(db=session)
        approval = await svc.create_approval(
            organization_id=uuid.UUID(org_id), entity_type="plugin",
            entity_id=str(uuid.uuid4()), name="Already Reviewed",
            action="publish", requested_by=user_id, risk_level="high")
        await session.commit()
        await svc.review_approval(approval_id=approval.id, organization_id=uuid.UUID(org_id),
                                   reviewer_id=str(uuid.uuid4()), decision="approved")
        await session.commit()
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.review_approval(approval_id=approval.id, organization_id=uuid.UUID(org_id),
                                       reviewer_id=str(uuid.uuid4()), decision="rejected")

    async def test_withdraw_approval(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = GovernanceService(db=session)
        approval = await svc.create_approval(
            organization_id=uuid.UUID(org_id), entity_type="plugin",
            entity_id=str(uuid.uuid4()), name="Withdraw Me",
            action="publish", requested_by=user_id, risk_level="high")
        await session.commit()
        withdrawn = await svc.withdraw_approval(approval_id=approval.id,
                                                 organization_id=uuid.UUID(org_id),
                                                 user_id=user_id)
        await session.commit()
        assert withdrawn.status == "withdrawn"

    async def test_list_approvals_filter_by_status(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = GovernanceService(db=session)
        await svc.create_approval(organization_id=uuid.UUID(org_id), entity_type="plugin",
                                   entity_id=str(uuid.uuid4()), name="P1",
                                   action="install", requested_by=user_id, risk_level="low")  # auto-approved
        await svc.create_approval(organization_id=uuid.UUID(org_id), entity_type="plugin",
                                   entity_id=str(uuid.uuid4()), name="P2",
                                   action="publish", requested_by=user_id, risk_level="high")  # pending
        await session.commit()
        pending, total_pending = await svc.list_approvals(organization_id=uuid.UUID(org_id), status="pending")
        approved, total_approved = await svc.list_approvals(organization_id=uuid.UUID(org_id), status="approved")
        assert total_pending == 1
        assert total_approved == 1
        assert pending[0].name == "P2"
        assert approved[0].name == "P1"

    async def test_invalid_decision_rejected(self, ecosystem_setup):
        session, org_id, user_id = ecosystem_setup
        svc = GovernanceService(db=session)
        approval = await svc.create_approval(
            organization_id=uuid.UUID(org_id), entity_type="plugin",
            entity_id=str(uuid.uuid4()), name="Invalid Decision",
            action="publish", requested_by=user_id, risk_level="high")
        await session.commit()
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            await svc.review_approval(approval_id=approval.id, organization_id=uuid.UUID(org_id),
                                       reviewer_id=user_id, decision="maybe")

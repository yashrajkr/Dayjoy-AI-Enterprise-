"""Enterprise AI Ecosystem models — marketplace, plugins, connectors, MCP, webhooks, event bus, developer portal.

Tables defined in this module (all multi-tenant via organization_id):
  - Marketplace: MarketplaceCategory, MarketplaceItem, MarketplaceDownload, MarketplaceRating, MarketplaceReview
  - Plugins: EcosystemPlugin, EcosystemPluginVersion, EcosystemPluginPermission, EcosystemPluginInstallation, EcosystemPluginReview
  - Connectors: EcosystemConnector, EcosystemConnectorInstance
  - MCP: McpServer, McpTool, McpResource
  - Webhook Platform: WebhookSubscription, WebhookEventLog
  - Event Bus: EventBusTopic, EventBusSubscription, EventBusMessage
  - Developer Portal: DeveloperApp, ApiCatalogEntry, SdkRelease
  - AI Gateway: AiGatewayRoute
  - Governance: GovernanceApproval
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


# ====================================================================
# MARKETPLACE
# ====================================================================

class MarketplaceCategory(UUIDMixin, TimestampMixin, Base):
    """Hierarchical category tree for the marketplace."""
    __tablename__ = "marketplace_categories"
    __table_args__ = (Index("uq_marketplace_categories_slug_type", "slug", "item_type", unique=True),)

    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("marketplace_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class MarketplaceItem(UUIDMixin, TimestampMixin, Base):
    """A top-level marketplace listing — polymorphic ref to underlying entity (plugin/agent/etc.)."""
    __tablename__ = "marketplace_items"
    __table_args__ = (
        Index("uq_marketplace_items_type_slug", "item_type", "slug", unique=True),
        Index("ix_marketplace_items_status_visibility", "status", "visibility"),
        Index("ix_marketplace_items_category", "category_id"),
    )

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    item_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("marketplace_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    screenshots: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    documentation_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    repository_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    homepage_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    license: Mapped[str | None] = mapped_column(String(50), nullable=True)
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_free: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    download_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    install_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_sum: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_avg: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    publisher_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    publisher_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)


class MarketplaceDownload(UUIDMixin, Base):
    """Tracks every install/download/update/uninstall action."""
    __tablename__ = "marketplace_downloads"
    __table_args__ = (Index("ix_marketplace_downloads_org_created", "organization_id", "created_at"),)

    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="success", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MarketplaceRating(UUIDMixin, Base):
    """A 1-5 rating by a user on a marketplace item."""
    __tablename__ = "marketplace_ratings"
    __table_args__ = (Index("uq_marketplace_ratings_item_user", "item_id", "user_id", unique=True),)

    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MarketplaceReview(UUIDMixin, TimestampMixin, Base):
    """A long-form review on a marketplace item."""
    __tablename__ = "marketplace_reviews"
    __table_args__ = (Index("ix_marketplace_reviews_item_status", "item_id", "status"),)

    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_verified_purchase: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    helpful_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    flag_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="published", nullable=False)


# ====================================================================
# PLUGINS
# ====================================================================

class EcosystemPlugin(UUIDMixin, TimestampMixin, Base):
    """A plugin in the ecosystem plugin catalog."""
    __tablename__ = "ecosystem_plugins"
    __table_args__ = (
        Index("uq_ecosystem_plugins_org_slug", "organization_id", "slug", unique=True),
        Index("ix_ecosystem_plugins_status_published", "status", "is_published"),
    )

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    author_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    author_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    homepage_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    repository_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    documentation_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    current_version: Mapped[str] = mapped_column(String(50), default="1.0.0", nullable=False)
    min_platform_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    runtime: Mapped[str] = mapped_column(String(30), default="python", nullable=False)
    entrypoint: Mapped[str] = mapped_column(String(500), nullable=False)
    permissions: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    config_schema: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    default_config: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_free: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    install_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_avg: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    license: Mapped[str | None] = mapped_column(String(50), nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    artifact_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class EcosystemPluginVersion(UUIDMixin, Base):
    """A versioned release of a plugin."""
    __tablename__ = "ecosystem_plugin_versions"
    __table_args__ = (Index("uq_ecosystem_plugin_versions_plugin_version", "plugin_id", "version", unique=True),)

    plugin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ecosystem_plugins.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    release_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    entrypoint: Mapped[str] = mapped_column(String(500), nullable=False)
    permissions: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    config_schema: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    min_platform_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    artifact_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_yanked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EcosystemPluginPermission(UUIDMixin, Base):
    """A permission declared by a plugin (with risk level)."""
    __tablename__ = "ecosystem_plugin_permissions"
    __table_args__ = (Index("uq_ecosystem_plugin_permissions_plugin_perm", "plugin_id", "permission", unique=True),)

    plugin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ecosystem_plugins.id", ondelete="CASCADE"), nullable=False, index=True)
    permission: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), default="low", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EcosystemPluginInstallation(UUIDMixin, TimestampMixin, Base):
    """An installed plugin instance in an organization."""
    __tablename__ = "ecosystem_plugin_installations"
    __table_args__ = (Index("uq_ecosystem_plugin_installations_org_plugin", "organization_id", "plugin_id", unique=True),)

    plugin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ecosystem_plugins.id", ondelete="RESTRICT"), nullable=False, index=True)
    version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ecosystem_plugin_versions.id", ondelete="SET NULL"), nullable=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    installed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    granted_permissions: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    is_sandboxed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_health_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    health_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EcosystemPluginReview(UUIDMixin, TimestampMixin, Base):
    """A review on a plugin."""
    __tablename__ = "ecosystem_plugin_reviews"
    __table_args__ = (Index("uq_ecosystem_plugin_reviews_plugin_user", "plugin_id", "user_id", unique=True),)

    plugin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ecosystem_plugins.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="published", nullable=False)


# ====================================================================
# CONNECTORS
# ====================================================================

class EcosystemConnector(UUIDMixin, TimestampMixin, Base):
    """A connector in the catalog (Salesforce, Slack, GitHub, etc.)."""
    __tablename__ = "ecosystem_connectors"
    __table_args__ = (
        Index("uq_ecosystem_connectors_slug", "slug", unique=True),
        Index("ix_ecosystem_connectors_category", "category"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # indexed via __table_args__
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    auth_type: Mapped[str] = mapped_column(String(30), nullable=False)
    auth_config: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    config_schema: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    capabilities: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    supported_operations: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    webhook_supported: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rate_limit_per_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    documentation_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    install_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_avg: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class EcosystemConnectorInstance(UUIDMixin, TimestampMixin, Base):
    """An installed connector instance in an organization (with encrypted credentials)."""
    __tablename__ = "ecosystem_connector_instances"
    __table_args__ = (Index("uq_ecosystem_connector_instances_org_name", "organization_id", "name", unique=True),)

    connector_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ecosystem_connectors.id", ondelete="RESTRICT"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    auth_type: Mapped[str] = mapped_column(String(30), nullable=False)
    credentials_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_health_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    health_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_calls: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    installed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


# ====================================================================
# MODEL CONTEXT PROTOCOL (MCP)
# ====================================================================

class McpServer(UUIDMixin, TimestampMixin, Base):
    """A registered MCP server (stdio/sse/websocket/http transport)."""
    __tablename__ = "mcp_servers"
    __table_args__ = (Index("uq_mcp_servers_org_slug", "organization_id", "slug", unique=True),)

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    transport: Mapped[str] = mapped_column(String(20), nullable=False)
    endpoint: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transport_config: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    auth_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    auth_config_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    vendor: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vendor_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_discover_tools: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_health_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    health_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_discovered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tool_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    resource_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)


class McpTool(UUIDMixin, TimestampMixin, Base):
    """A tool exposed by an MCP server."""
    __tablename__ = "mcp_tools"
    __table_args__ = (Index("uq_mcp_tools_server_name", "server_id", "name", unique=True),)

    server_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_schema: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    output_schema: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    annotations: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_destructive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_confirmation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    last_invoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invoke_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    avg_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class McpResource(UUIDMixin, TimestampMixin, Base):
    """A resource exposed by an MCP server."""
    __tablename__ = "mcp_resources"
    __table_args__ = (Index("uq_mcp_resources_server_uri", "server_id", "uri", unique=True),)

    server_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    uri: Mapped[str] = mapped_column(String(500), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    access_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)


# ====================================================================
# WEBHOOK PLATFORM
# ====================================================================

class WebhookSubscription(UUIDMixin, TimestampMixin, Base):
    """An outgoing webhook subscription (target_url + event_types + HMAC secret)."""
    __tablename__ = "webhook_subscriptions"
    __table_args__ = (Index("ix_webhook_subscriptions_org_active", "organization_id", "is_active"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    developer_app_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    target_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    event_types: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    headers: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    retry_policy: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    max_retries: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    last_invoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    failure_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class WebhookEventLog(UUIDMixin, Base):
    """Log of every webhook event — incoming or outgoing — with retry tracking."""
    __tablename__ = "webhook_events_log"
    __table_args__ = (
        Index("ix_webhook_events_org_created", "organization_id", "created_at"),
        Index("ix_webhook_events_status_retry", "status", "next_retry_at"),
        Index("uq_webhook_events_event_id", "organization_id", "event_id", unique=True),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("webhook_subscriptions.id", ondelete="SET NULL"), nullable=True, index=True)
    developer_app_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    event_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    headers: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    signature: Mapped[str | None] = mapped_column(String(500), nullable=True)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ====================================================================
# EVENT BUS
# ====================================================================

class EventBusTopic(UUIDMixin, TimestampMixin, Base):
    """A registered event topic (e.g. 'agent.created', 'workflow.completed')."""
    __tablename__ = "event_bus_topics"
    __table_args__ = (Index("uq_event_bus_topics_org_name", "organization_id", "name", unique=True),)

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    schema_: Mapped[dict | None] = mapped_column("schema", JSONBType, nullable=True)
    retention_hours: Mapped[int] = mapped_column(Integer, default=168, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    published_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)


class EventBusSubscription(UUIDMixin, TimestampMixin, Base):
    """A subscription to an event bus topic (webhook/queue/plugin/MCP/agent/workflow)."""
    __tablename__ = "event_bus_subscriptions"
    __table_args__ = (Index("ix_event_bus_subscriptions_topic_active", "topic_id", "is_active"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    topic_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("event_bus_topics.id", ondelete="CASCADE"), nullable=False, index=True)
    subscriber_type: Mapped[str] = mapped_column(String(30), nullable=False)
    subscriber_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    filter_expression: Mapped[str | None] = mapped_column(Text, nullable=True)
    transform_config: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)


class EventBusMessage(UUIDMixin, Base):
    """A queued event bus message — with retry, DLQ support, and priority."""
    __tablename__ = "event_bus_messages"
    __table_args__ = (
        Index("ix_event_bus_messages_status_retry", "status", "next_retry_at"),
        Index("ix_event_bus_messages_org_created", "organization_id", "created_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    topic_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("event_bus_topics.id", ondelete="CASCADE"), nullable=False, index=True)
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("event_bus_subscriptions.id", ondelete="CASCADE"), nullable=True, index=True)
    event_id: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    headers: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ====================================================================
# DEVELOPER PORTAL
# ====================================================================

class DeveloperApp(UUIDMixin, TimestampMixin, Base):
    """A registered developer application (OAuth2 client)."""
    __tablename__ = "developer_apps"
    __table_args__ = (Index("uq_developer_apps_org_slug", "organization_id", "slug", unique=True),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    client_secret_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    app_type: Mapped[str] = mapped_column(String(30), default="server", nullable=False)
    redirect_uris: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    scopes: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    rate_limit_per_day: Mapped[int] = mapped_column(Integer, default=10000, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    homepage_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    webhook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    total_requests: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    last_request_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class ApiCatalogEntry(UUIDMixin, TimestampMixin, Base):
    """A published API entry in the API catalog (REST/GraphQL/Webhook)."""
    __tablename__ = "api_catalog_entries"
    __table_args__ = (Index("uq_api_catalog_entries_org_slug", "organization_id", "slug", unique=True),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_type: Mapped[str] = mapped_column(String(20), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    openapi_spec: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    graphql_schema: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[str] = mapped_column(String(50), default="1.0.0", nullable=False)
    auth_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    documentation_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    endpoints_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class SdkRelease(UUIDMixin, Base):
    """A published SDK release (per language: Python/TS/JS/Go/Java/C#/Rust)."""
    __tablename__ = "sdk_releases"
    __table_args__ = (Index("uq_sdk_releases_lang_version", "language", "version", unique=True),)

    language: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    package_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    repository_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    documentation_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    download_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    min_runtime_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    release_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_stable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    download_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ====================================================================
# AI GATEWAY (multi-provider routing + fallback)
# ====================================================================

class AiGatewayRoute(UUIDMixin, TimestampMixin, Base):
    """A routing rule for the AI gateway (primary/fallback/load_balance/conditional)."""
    __tablename__ = "ai_gateway_routes"
    __table_args__ = (Index("ix_ai_gateway_routes_org_priority", "organization_id", "priority"),)

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    route_type: Mapped[str] = mapped_column(String(30), nullable=False)
    providers: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    fallback_chain: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    conditions: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    strategy: Mapped[str] = mapped_column(String(30), default="cheapest", nullable=False)
    max_cost_per_1k: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    required_capability: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    total_requests: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    total_fallbacks: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)


# ====================================================================
# GOVERNANCE
# ====================================================================

class GovernanceApproval(UUIDMixin, TimestampMixin, Base):
    """An approval workflow record for governance over marketplace items, plugins, connectors."""
    __tablename__ = "governance_approvals"
    __table_args__ = (
        Index("ix_governance_approvals_org_status", "organization_id", "status"),
        Index("ix_governance_approvals_entity", "entity_type", "entity_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    requested_by: Mapped[str] = mapped_column(String(36), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    reviewer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(20), default="low", nullable=False)
    risk_assessment: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    auto_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)

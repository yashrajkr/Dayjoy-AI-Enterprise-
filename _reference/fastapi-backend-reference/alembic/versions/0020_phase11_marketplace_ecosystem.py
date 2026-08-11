"""Phase 11: Enterprise AI Ecosystem — marketplace, plugins, connectors, MCP, webhooks, event bus, developer portal.

Adds 25 new tables to power the Enterprise AI Ecosystem layer:
  - Marketplace: items, categories, downloads, ratings, reviews, listings (agents/workflows/prompts/knowledge)
  - Plugins: catalog, versions, reviews, permissions, installations, sandboxes
  - Connectors: catalog, instances, credentials
  - MCP: servers, tools, resources
  - Webhook Platform: events log, subscriptions, retries
  - Event Bus: topics, subscriptions, messages (with DLQ)
  - API Catalog: catalog entries (REST/GraphQL/Webhook), SDK releases
  - Developer Portal: developer apps, API keys (extension), governance approvals
  - AI Gateway: provider routing rules + fallback chains
  - Global search index

Revision ID: 0020
Revises: 0019
"""

from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ====================================================================
    # MARKETPLACE
    # ====================================================================

    # 1. marketplace_categories — hierarchical category tree
    op.create_table(
        "marketplace_categories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("marketplace_categories.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("item_type", sa.String(30), nullable=False, index=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_marketplace_categories_slug_type", "marketplace_categories", ["slug", "item_type"], unique=True)

    # 2. marketplace_items — top-level marketplace listings (polymorphic ref to underlying entity)
    op.create_table(
        "marketplace_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=True, index=True),  # NULL = global/public
        sa.Column("item_type", sa.String(30), nullable=False, index=True),  # plugin/agent/workflow/prompt/knowledge/template/connector/model/mcp/api
        sa.Column("entity_id", sa.String(36), nullable=False, index=True),  # polymorphic ref
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("summary", sa.String(500), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category_id", UUID(as_uuid=True), sa.ForeignKey("marketplace_categories.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("screenshots", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("documentation_url", sa.String(500), nullable=True),
        sa.Column("repository_url", sa.String(500), nullable=True),
        sa.Column("homepage_url", sa.String(500), nullable=True),
        sa.Column("license", sa.String(50), nullable=True),
        sa.Column("version", sa.String(50), nullable=True),
        sa.Column("visibility", sa.String(20), nullable=False, server_default=sa.text("'public'")),  # public/private/organization
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'draft'")),  # draft/pending/published/rejected/archived
        sa.Column("is_featured", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_free", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("price_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("currency", sa.String(3), nullable=False, server_default=sa.text("'USD'")),
        sa.Column("download_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("install_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("view_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("rating_sum", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("rating_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("rating_avg", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("publisher_id", sa.String(36), nullable=True),
        sa.Column("publisher_name", sa.String(200), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_marketplace_items_type_slug", "marketplace_items", ["item_type", "slug"], unique=True)
    op.create_index("ix_marketplace_items_status_visibility", "marketplace_items", ["status", "visibility"])
    op.create_index("ix_marketplace_items_category", "marketplace_items", ["category_id"])

    # 3. marketplace_downloads — track every install/download
    op.create_table(
        "marketplace_downloads",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("item_id", UUID(as_uuid=True), sa.ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("version", sa.String(50), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),  # install/update/uninstall/view
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'success'")),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_marketplace_downloads_org_created", "marketplace_downloads", ["organization_id", "created_at"])

    # 4. marketplace_ratings — quick aggregate ratings
    op.create_table(
        "marketplace_ratings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("item_id", UUID(as_uuid=True), sa.ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("rating", sa.Integer, nullable=False),  # 1-5
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_marketplace_ratings_item_user", "marketplace_ratings", ["item_id", "user_id"], unique=True)

    # 5. marketplace_reviews — long-form reviews
    op.create_table(
        "marketplace_reviews",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("item_id", UUID(as_uuid=True), sa.ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("user_name", sa.String(200), nullable=True),
        sa.Column("rating", sa.Integer, nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("is_verified_purchase", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("helpful_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("is_flagged", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("flag_reason", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'published'")),  # published/hidden/deleted
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_marketplace_reviews_item_status", "marketplace_reviews", ["item_id", "status"])

    # ====================================================================
    # PLUGINS
    # ====================================================================

    # 6. ecosystem_plugins — plugin catalog
    op.create_table(
        "ecosystem_plugins",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=True, index=True),  # NULL = global/system
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=True, index=True),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("author_id", sa.String(36), nullable=True),
        sa.Column("author_name", sa.String(200), nullable=True),
        sa.Column("homepage_url", sa.String(500), nullable=True),
        sa.Column("repository_url", sa.String(500), nullable=True),
        sa.Column("documentation_url", sa.String(500), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("current_version", sa.String(50), nullable=False, server_default=sa.text("'1.0.0'")),
        sa.Column("min_platform_version", sa.String(50), nullable=True),
        sa.Column("runtime", sa.String(30), nullable=False, server_default=sa.text("'python'")),  # python/nodejs/wasm
        sa.Column("entrypoint", sa.String(500), nullable=False),
        sa.Column("permissions", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("config_schema", sa.JSON, nullable=True),
        sa.Column("default_config", sa.JSON, nullable=True),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_featured", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_free", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("price_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("visibility", sa.String(20), nullable=False, server_default=sa.text("'public'")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'active'")),  # active/deprecated/removed
        sa.Column("install_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("rating_avg", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("rating_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("license", sa.String(50), nullable=True),
        sa.Column("checksum", sa.String(128), nullable=True),  # sha256 of artifact
        sa.Column("artifact_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ecosystem_plugins_org_slug", "ecosystem_plugins", ["organization_id", "slug"], unique=True)
    op.create_index("ix_ecosystem_plugins_status_published", "ecosystem_plugins", ["status", "is_published"])

    # 7. ecosystem_plugin_versions — versioned plugin releases
    op.create_table(
        "ecosystem_plugin_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plugin_id", UUID(as_uuid=True), sa.ForeignKey("ecosystem_plugins.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("release_notes", sa.Text, nullable=True),
        sa.Column("entrypoint", sa.String(500), nullable=False),
        sa.Column("permissions", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("config_schema", sa.JSON, nullable=True),
        sa.Column("min_platform_version", sa.String(50), nullable=True),
        sa.Column("checksum", sa.String(128), nullable=True),
        sa.Column("artifact_url", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_yanked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("published_by", sa.String(36), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ecosystem_plugin_versions_plugin_version", "ecosystem_plugin_versions", ["plugin_id", "version"], unique=True)

    # 8. ecosystem_plugin_permissions — fine-grained permission catalog
    op.create_table(
        "ecosystem_plugin_permissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plugin_id", UUID(as_uuid=True), sa.ForeignKey("ecosystem_plugins.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("permission", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("is_required", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("risk_level", sa.String(20), nullable=False, server_default=sa.text("'low'")),  # low/medium/high/critical
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ecosystem_plugin_permissions_plugin_perm", "ecosystem_plugin_permissions", ["plugin_id", "permission"], unique=True)

    # 9. ecosystem_plugin_installations — installed plugin instances per org
    op.create_table(
        "ecosystem_plugin_installations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plugin_id", UUID(as_uuid=True), sa.ForeignKey("ecosystem_plugins.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("version_id", UUID(as_uuid=True), sa.ForeignKey("ecosystem_plugin_versions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("installed_by", sa.String(36), nullable=True),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("config", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("granted_permissions", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'active'")),  # active/paused/disabled/error
        sa.Column("is_sandboxed", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_health_check", sa.DateTime(timezone=True), nullable=True),
        sa.Column("health_status", sa.String(20), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("installed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ecosystem_plugin_installations_org_plugin", "ecosystem_plugin_installations", ["organization_id", "plugin_id"], unique=True)

    # 10. ecosystem_plugin_reviews — same shape as marketplace_reviews but plugin-scoped
    op.create_table(
        "ecosystem_plugin_reviews",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plugin_id", UUID(as_uuid=True), sa.ForeignKey("ecosystem_plugins.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("user_name", sa.String(200), nullable=True),
        sa.Column("rating", sa.Integer, nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("body", sa.Text, nullable=True),
        sa.Column("version", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'published'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ecosystem_plugin_reviews_plugin_user", "ecosystem_plugin_reviews", ["plugin_id", "user_id"], unique=True)

    # ====================================================================
    # CONNECTORS (catalog — distinct from workflow.connectors which are flow integrations)
    # ====================================================================

    # 11. ecosystem_connectors — connector catalog (Salesforce, Slack, GitHub, etc.)
    op.create_table(
        "ecosystem_connectors",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=False, index=True),  # crm/communication/storage/development/database/analytics/cloud/payment
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("auth_type", sa.String(30), nullable=False),  # oauth2/api_key/basic/bearer/webhook
        sa.Column("auth_config", sa.JSON, nullable=True),  # OAuth scopes, endpoints, etc.
        sa.Column("config_schema", sa.JSON, nullable=True),
        sa.Column("capabilities", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # [read, write, search, webhook, batch]
        sa.Column("supported_operations", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("webhook_supported", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("rate_limit_per_minute", sa.Integer, nullable=True),
        sa.Column("documentation_url", sa.String(500), nullable=True),
        sa.Column("is_official", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("install_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("rating_avg", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ecosystem_connectors_slug", "ecosystem_connectors", ["slug"], unique=True)
    op.create_index("ix_ecosystem_connectors_category", "ecosystem_connectors", ["category"])

    # 12. ecosystem_connector_instances — installed connector instances per org
    op.create_table(
        "ecosystem_connector_instances",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("connector_id", UUID(as_uuid=True), sa.ForeignKey("ecosystem_connectors.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("auth_type", sa.String(30), nullable=False),
        sa.Column("credentials_encrypted", sa.Text, nullable=True),  # Fernet-encrypted credentials
        sa.Column("config", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'active'")),  # active/error/disabled/pending
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_health_check", sa.DateTime(timezone=True), nullable=True),
        sa.Column("health_status", sa.String(20), nullable=True),  # healthy/degraded/down
        sa.Column("error_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_calls", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("installed_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_ecosystem_connector_instances_org_name", "ecosystem_connector_instances", ["organization_id", "name"], unique=True)

    # ====================================================================
    # MODEL CONTEXT PROTOCOL (MCP)
    # ====================================================================

    # 13. mcp_servers — registered MCP servers
    op.create_table(
        "mcp_servers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=True, index=True),  # NULL = global registry
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("transport", sa.String(20), nullable=False),  # stdio/sse/websocket/http
        sa.Column("endpoint", sa.String(500), nullable=True),  # URL or command
        sa.Column("transport_config", sa.JSON, nullable=True),
        sa.Column("auth_type", sa.String(30), nullable=True),  # none/bearer/api_key/oauth2
        sa.Column("auth_config_encrypted", sa.Text, nullable=True),
        sa.Column("version", sa.String(50), nullable=True),  # MCP protocol version
        sa.Column("vendor", sa.String(100), nullable=True),
        sa.Column("vendor_url", sa.String(500), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("is_official", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("auto_discover_tools", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_health_check", sa.DateTime(timezone=True), nullable=True),
        sa.Column("health_status", sa.String(20), nullable=True),  # healthy/degraded/down
        sa.Column("last_discovered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tool_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("resource_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_mcp_servers_org_slug", "mcp_servers", ["organization_id", "slug"], unique=True)

    # 14. mcp_tools — tools exposed by an MCP server
    op.create_table(
        "mcp_tools",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("server_id", UUID(as_uuid=True), sa.ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("input_schema", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("output_schema", sa.JSON, nullable=True),
        sa.Column("annotations", sa.JSON, nullable=True),  # MCP annotations (title, etc.)
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("is_destructive", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("requires_confirmation", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("last_invoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invoke_count", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("avg_latency_ms", sa.Integer, nullable=True),
        sa.Column("error_rate", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_mcp_tools_server_name", "mcp_tools", ["server_id", "name"], unique=True)

    # 15. mcp_resources — resources exposed by an MCP server
    op.create_table(
        "mcp_resources",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("server_id", UUID(as_uuid=True), sa.ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("uri", sa.String(500), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("size_bytes", sa.BigInteger, nullable=True),
        sa.Column("is_template", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("access_count", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_mcp_resources_server_uri", "mcp_resources", ["server_id", "uri"], unique=True)

    # ====================================================================
    # WEBHOOK PLATFORM
    # ====================================================================

    # 16. webhook_subscriptions — outgoing webhook subscriptions
    op.create_table(
        "webhook_subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("developer_app_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("target_url", sa.String(1000), nullable=False),
        sa.Column("event_types", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("secret_encrypted", sa.Text, nullable=True),  # used for HMAC signing
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("headers", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("retry_policy", sa.JSON, nullable=True),
        sa.Column("max_retries", sa.Integer, nullable=False, server_default=sa.text("5")),
        sa.Column("timeout_seconds", sa.Integer, nullable=False, server_default=sa.text("30")),
        sa.Column("last_invoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status_code", sa.Integer, nullable=True),
        sa.Column("success_count", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("failure_count", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_webhook_subscriptions_org_active", "webhook_subscriptions", ["organization_id", "is_active"])

    # 17. webhook_events_log — log of every webhook event (incoming + outgoing)
    op.create_table(
        "webhook_events_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("webhook_subscriptions.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("developer_app_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("event_type", sa.String(100), nullable=False, index=True),
        sa.Column("event_id", sa.String(100), nullable=False, index=True),  # external id from caller
        sa.Column("direction", sa.String(10), nullable=False),  # incoming/outgoing
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("headers", sa.JSON, nullable=True),
        sa.Column("signature", sa.String(500), nullable=True),
        sa.Column("response_status", sa.Integer, nullable=True),
        sa.Column("response_body", sa.Text, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("attempt_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),  # pending/delivered/failed/dead_letter/replayed
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_ip", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_webhook_events_org_created", "webhook_events_log", ["organization_id", "created_at"])
    op.create_index("ix_webhook_events_status_retry", "webhook_events_log", ["status", "next_retry_at"])
    op.create_index("uq_webhook_events_event_id", "webhook_events_log", ["organization_id", "event_id"], unique=True)

    # ====================================================================
    # EVENT BUS
    # ====================================================================

    # 18. event_bus_topics — registered event topics (e.g. "agent.created", "workflow.completed")
    op.create_table(
        "event_bus_topics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=True, index=True),  # NULL = global
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("schema_", sa.JSON, nullable=True),  # expected payload schema
        sa.Column("retention_hours", sa.Integer, nullable=False, server_default=sa.text("168")),  # default 7 days
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("published_count", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_event_bus_topics_org_name", "event_bus_topics", ["organization_id", "name"], unique=True)

    # 19. event_bus_subscriptions — subscribers to topics (webhook/queue/plugin)
    op.create_table(
        "event_bus_subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("topic_id", UUID(as_uuid=True), sa.ForeignKey("event_bus_topics.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("subscriber_type", sa.String(30), nullable=False),  # webhook/queue/plugin/mcp/agent/workflow
        sa.Column("subscriber_id", sa.String(36), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("filter_expression", sa.Text, nullable=True),  # CEL/JSONPath filter
        sa.Column("transform_config", sa.JSON, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("max_retries", sa.Integer, nullable=False, server_default=sa.text("3")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_event_bus_subscriptions_topic_active", "event_bus_subscriptions", ["topic_id", "is_active"])

    # 20. event_bus_messages — message queue with retry + DLQ
    op.create_table(
        "event_bus_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("topic_id", UUID(as_uuid=True), sa.ForeignKey("event_bus_topics.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("event_bus_subscriptions.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("event_id", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("headers", sa.JSON, nullable=True),
        sa.Column("priority", sa.Integer, nullable=False, server_default=sa.text("5")),
        sa.Column("attempt_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("max_attempts", sa.Integer, nullable=False, server_default=sa.text("3")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),  # pending/processing/delivered/failed/dead_letter
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_event_bus_messages_status_retry", "event_bus_messages", ["status", "next_retry_at"])
    op.create_index("ix_event_bus_messages_org_created", "event_bus_messages", ["organization_id", "created_at"])

    # ====================================================================
    # DEVELOPER PORTAL
    # ====================================================================

    # 21. developer_apps — registered developer applications
    op.create_table(
        "developer_apps",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("client_id", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("client_secret_hash", sa.String(128), nullable=False),
        sa.Column("app_type", sa.String(30), nullable=False, server_default=sa.text("'server'")),  # server/spa/mobile/desktop/plugin
        sa.Column("redirect_uris", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("scopes", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("rate_limit_per_minute", sa.Integer, nullable=False, server_default=sa.text("100")),
        sa.Column("rate_limit_per_day", sa.Integer, nullable=False, server_default=sa.text("10000")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("homepage_url", sa.String(500), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("contact_email", sa.String(200), nullable=True),
        sa.Column("webhook_url", sa.String(500), nullable=True),
        sa.Column("total_requests", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("last_request_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_developer_apps_org_slug", "developer_apps", ["organization_id", "slug"], unique=True)

    # 22. api_catalog_entries — catalog of APIs (REST/GraphQL/Webhook) published in marketplace
    op.create_table(
        "api_catalog_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("api_type", sa.String(20), nullable=False),  # rest/graphql/webhook
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("openapi_spec", sa.JSON, nullable=True),
        sa.Column("graphql_schema", sa.Text, nullable=True),
        sa.Column("version", sa.String(50), nullable=False, server_default=sa.text("'1.0.0'")),
        sa.Column("auth_type", sa.String(30), nullable=True),
        sa.Column("documentation_url", sa.String(500), nullable=True),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_featured", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("endpoints_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_api_catalog_entries_org_slug", "api_catalog_entries", ["organization_id", "slug"], unique=True)

    # 23. sdk_releases — published SDKs in multiple languages
    op.create_table(
        "sdk_releases",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("language", sa.String(30), nullable=False, index=True),  # python/typescript/javascript/go/java/csharp/rust
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("package_url", sa.String(500), nullable=True),  # npm/pypi/crates/maven/nuget
        sa.Column("repository_url", sa.String(500), nullable=True),
        sa.Column("documentation_url", sa.String(500), nullable=True),
        sa.Column("download_url", sa.String(500), nullable=True),
        sa.Column("checksum", sa.String(128), nullable=True),
        sa.Column("size_bytes", sa.BigInteger, nullable=True),
        sa.Column("min_runtime_version", sa.String(50), nullable=True),
        sa.Column("release_notes", sa.Text, nullable=True),
        sa.Column("is_stable", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("download_count", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_sdk_releases_lang_version", "sdk_releases", ["language", "version"], unique=True)

    # ====================================================================
    # AI GATEWAY (multi-provider routing + fallback chains)
    # ====================================================================

    # 24. ai_gateway_routes — routing rules for AI gateway
    op.create_table(
        "ai_gateway_routes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=True, index=True),  # NULL = global
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("route_type", sa.String(30), nullable=False),  # primary/fallback/load_balance/conditional
        sa.Column("providers", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # ordered list of {provider, model, weight}
        sa.Column("fallback_chain", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("conditions", sa.JSON, nullable=True),  # CEL/JSON conditions for conditional routing
        sa.Column("strategy", sa.String(30), nullable=False, server_default=sa.text("'cheapest'")),
        sa.Column("max_cost_per_1k", sa.Float, nullable=True),
        sa.Column("max_latency_ms", sa.Integer, nullable=True),
        sa.Column("required_capability", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("priority", sa.Integer, nullable=False, server_default=sa.text("100")),
        sa.Column("total_requests", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("total_fallbacks", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ai_gateway_routes_org_priority", "ai_gateway_routes", ["organization_id", "priority"])

    # ====================================================================
    # GOVERNANCE APPROVALS
    # ====================================================================

    # 25. governance_approvals — approval workflows for marketplace items, plugins, connectors
    op.create_table(
        "governance_approvals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("entity_type", sa.String(30), nullable=False, index=True),  # plugin/connector/agent/marketplace_item/api/sdk
        sa.Column("entity_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),  # install/publish/update/uninstall/promote
        sa.Column("requested_by", sa.String(36), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),  # pending/approved/rejected/withdrawn
        sa.Column("reviewer_id", sa.String(36), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewer_notes", sa.Text, nullable=True),
        sa.Column("risk_level", sa.String(20), nullable=False, server_default=sa.text("'low'")),
        sa.Column("risk_assessment", sa.JSON, nullable=True),
        sa.Column("auto_approved", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_governance_approvals_org_status", "governance_approvals", ["organization_id", "status"])
    op.create_index("ix_governance_approvals_entity", "governance_approvals", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_table("governance_approvals")
    op.drop_table("ai_gateway_routes")
    op.drop_table("sdk_releases")
    op.drop_table("api_catalog_entries")
    op.drop_table("developer_apps")
    op.drop_table("event_bus_messages")
    op.drop_table("event_bus_subscriptions")
    op.drop_table("event_bus_topics")
    op.drop_table("webhook_events_log")
    op.drop_table("webhook_subscriptions")
    op.drop_table("mcp_resources")
    op.drop_table("mcp_tools")
    op.drop_table("mcp_servers")
    op.drop_table("ecosystem_connector_instances")
    op.drop_table("ecosystem_connectors")
    op.drop_table("ecosystem_plugin_reviews")
    op.drop_table("ecosystem_plugin_installations")
    op.drop_table("ecosystem_plugin_permissions")
    op.drop_table("ecosystem_plugin_versions")
    op.drop_table("ecosystem_plugins")
    op.drop_table("marketplace_reviews")
    op.drop_table("marketplace_ratings")
    op.drop_table("marketplace_downloads")
    op.drop_index("uq_marketplace_items_type_slug", table_name="marketplace_items")
    op.drop_table("marketplace_items")
    op.drop_index("uq_marketplace_categories_slug_type", table_name="marketplace_categories")
    op.drop_table("marketplace_categories")

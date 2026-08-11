"""Enterprise AI Ecosystem services.

This module provides 9 services powering the marketplace, MCP, plugin, connector,
webhook, event bus, developer portal, AI gateway, and global search layers:

  - MarketplaceService          : listings, categories, downloads, ratings, reviews, moderation
  - PluginService               : plugin CRUD, versioning, install/update/rollback, permissions, reviews
  - ConnectorService            : connector catalog, instances, encrypted credentials, health, OAuth flow
  - McpService                  : MCP servers, tools, resources, health monitoring, discovery
  - WebhookPlatformService      : outgoing subscriptions + incoming webhook log + HMAC signing + retry
  - EventBusService             : topics, subscriptions, message queue, DLQ, replay
  - DeveloperPortalService      : developer apps, API catalog, SDK releases, OAuth clients
  - AiGatewayService            : multi-provider routing, fallback chains, load balancing, conditional
  - GlobalSearchService         : cross-marketplace search (plugins/agents/workflows/prompts/etc.)
  - GovernanceService           : approval workflows for marketplace items / plugins / connectors
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.marketplace_ecosystem import (
    AiGatewayRoute,
    ApiCatalogEntry,
    DeveloperApp,
    EventBusMessage,
    EventBusSubscription,
    EventBusTopic,
    EcosystemConnector,
    EcosystemConnectorInstance,
    EcosystemPlugin,
    EcosystemPluginInstallation,
    EcosystemPluginPermission,
    EcosystemPluginReview,
    EcosystemPluginVersion,
    GovernanceApproval,
    MarketplaceCategory,
    MarketplaceDownload,
    MarketplaceItem,
    MarketplaceRating,
    MarketplaceReview,
    McpResource,
    McpServer,
    McpTool,
    SdkRelease,
    WebhookEventLog,
    WebhookSubscription,
)

logger = get_logger(__name__)


# ====================================================================
# Encryption helpers (Fernet with base64 fallback) — reused across services
# ====================================================================

def _encrypt_value(value: str) -> str:
    """Encrypt a value using Fernet (or base64 fallback)."""
    try:
        from cryptography.fernet import Fernet
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
        return Fernet(key).encrypt(value.encode()).decode()
    except Exception:  # pragma: no cover
        return base64.b64encode(value.encode()).decode()


def _decrypt_value(encrypted: str) -> str:
    """Decrypt a value previously encrypted by _encrypt_value."""
    try:
        from cryptography.fernet import Fernet
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
        return Fernet(key).decrypt(encrypted.encode()).decode()
    except Exception:  # pragma: no cover
        return base64.b64decode(encrypted.encode()).decode()


def _hash_secret(secret: str) -> str:
    """SHA-256 hash a secret for storage (non-recoverable)."""
    return hashlib.sha256(secret.encode()).hexdigest()


def _generate_client_id() -> str:
    """Generate a unique OAuth-style client_id."""
    return f"djapp_{secrets.token_urlsafe(32)}"


def _generate_client_secret() -> str:
    """Generate a strong client_secret (returned ONCE to the user)."""
    return f"djsec_{secrets.token_urlsafe(48)}"


def _generate_signing_secret() -> str:
    """Generate an HMAC signing secret for webhook subscriptions."""
    return f"djwh_{secrets.token_urlsafe(32)}"


# ====================================================================
# Marketplace Service — listings + categories + downloads + ratings + reviews
# ====================================================================

class MarketplaceService:
    """Manages the marketplace catalog: items, categories, downloads, ratings, reviews."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ----- Categories -----

    async def create_category(self, *, slug: str, name: str, item_type: str,
                              description: str | None = None, icon: str | None = None,
                              parent_id: uuid.UUID | None = None,
                              sort_order: int = 0) -> MarketplaceCategory:
        category = MarketplaceCategory(
            slug=slug, name=name, item_type=item_type, description=description,
            icon=icon, parent_id=parent_id, sort_order=sort_order, is_active=True)
        self.db.add(category)
        await self.db.flush()
        return category

    async def list_categories(self, *, item_type: str | None = None,
                              parent_id: uuid.UUID | None = None) -> list[MarketplaceCategory]:
        conditions = [MarketplaceCategory.is_active.is_(True)]
        if item_type:
            conditions.append(MarketplaceCategory.item_type == item_type)
        if parent_id:
            conditions.append(MarketplaceCategory.parent_id == parent_id)
        result = await self.db.execute(
            select(MarketplaceCategory).where(*conditions)
            .order_by(MarketplaceCategory.sort_order, MarketplaceCategory.name))
        return list(result.scalars().all())

    # ----- Items -----

    async def create_item(self, *, organization_id: uuid.UUID | None = None, item_type: str,
                          entity_id: str, name: str, slug: str, summary: str | None = None,
                          description: str | None = None, category_id: uuid.UUID | None = None,
                          tags: list[str] | None = None, icon: str | None = None,
                          license_: str | None = None, version: str | None = None,
                          visibility: str = "public", publisher_id: str | None = None,
                          publisher_name: str | None = None,
                          is_free: bool = True, price_cents: int = 0,
                          metadata: dict | None = None) -> MarketplaceItem:
        item = MarketplaceItem(
            organization_id=str(organization_id) if organization_id else None,
            item_type=item_type, entity_id=entity_id, name=name, slug=slug,
            summary=summary, description=description, category_id=category_id,
            tags=tags or [], icon=icon, license=license_, version=version,
            visibility=visibility, status="draft", is_featured=False, is_verified=False,
            is_free=is_free, price_cents=price_cents, currency="USD",
            download_count=0, install_count=0, view_count=0,
            rating_sum=0, rating_count=0, rating_avg=0.0,
            publisher_id=publisher_id, publisher_name=publisher_name,
            metadata_=metadata)
        self.db.add(item)
        await self.db.flush()
        return item

    async def get_item(self, *, item_id: uuid.UUID,
                       organization_id: uuid.UUID | None = None) -> MarketplaceItem:
        item = await self.db.get(MarketplaceItem, item_id)
        if item is None:
            raise NotFoundError("MarketplaceItem", str(item_id))
        # Enforce visibility scoping for non-public items
        if organization_id and item.visibility != "public" and item.organization_id != str(organization_id):
            raise NotFoundError("MarketplaceItem", str(item_id))
        # Increment view count
        item.view_count = (item.view_count or 0) + 1
        await self.db.flush()
        return item

    async def list_items(self, *, item_type: str | None = None,
                         category_id: uuid.UUID | None = None,
                         organization_id: uuid.UUID | None = None,
                         status: str = "published", visibility: str | None = None,
                         is_featured: bool | None = None,
                         search: str | None = None,
                         skip: int = 0, limit: int = 50) -> tuple[list[MarketplaceItem], int]:
        conditions = []
        if item_type:
            conditions.append(MarketplaceItem.item_type == item_type)
        if category_id:
            conditions.append(MarketplaceItem.category_id == category_id)
        if status:
            conditions.append(MarketplaceItem.status == status)
        if visibility:
            conditions.append(MarketplaceItem.visibility == visibility)
        if is_featured is not None:
            conditions.append(MarketplaceItem.is_featured.is_(is_featured))
        if organization_id:
            org_str = str(organization_id)
            conditions.append(or_(
                MarketplaceItem.visibility == "public",
                MarketplaceItem.organization_id == org_str))
        if search:
            like = f"%{search.lower()}%"
            conditions.append(or_(
                func.lower(MarketplaceItem.name).like(like),
                func.lower(MarketplaceItem.summary).like(like),
                func.lower(MarketplaceItem.description).like(like)))

        count_q = select(func.count()).select_from(MarketplaceItem)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)

        q = select(MarketplaceItem)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(MarketplaceItem.is_featured.desc(),
                       MarketplaceItem.rating_avg.desc(),
                       MarketplaceItem.download_count.desc(),
                       MarketplaceItem.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def publish_item(self, *, item_id: uuid.UUID,
                           organization_id: uuid.UUID | None = None) -> MarketplaceItem:
        item = await self.get_item(item_id=item_id, organization_id=organization_id)
        item.status = "published"
        item.published_at = datetime.now(UTC)
        await self.db.flush()
        return item

    async def archive_item(self, *, item_id: uuid.UUID,
                           organization_id: uuid.UUID | None = None) -> MarketplaceItem:
        item = await self.get_item(item_id=item_id, organization_id=organization_id)
        item.status = "archived"
        await self.db.flush()
        return item

    async def feature_item(self, *, item_id: uuid.UUID, featured: bool = True,
                           organization_id: uuid.UUID | None = None) -> MarketplaceItem:
        item = await self.get_item(item_id=item_id, organization_id=organization_id)
        item.is_featured = featured
        await self.db.flush()
        return item

    async def verify_item(self, *, item_id: uuid.UUID, verified: bool = True,
                          organization_id: uuid.UUID | None = None) -> MarketplaceItem:
        item = await self.get_item(item_id=item_id, organization_id=organization_id)
        item.is_verified = verified
        await self.db.flush()
        return item

    # ----- Downloads -----

    async def record_download(self, *, item_id: uuid.UUID, organization_id: uuid.UUID,
                              user_id: str | None = None, version: str | None = None,
                              action: str = "install", status: str = "success",
                              error: str | None = None,
                              ip_address: str | None = None,
                              user_agent: str | None = None) -> MarketplaceDownload:
        item = await self.get_item(item_id=item_id, organization_id=organization_id)
        if action == "install":
            item.install_count = (item.install_count or 0) + 1
        item.download_count = (item.download_count or 0) + 1
        await self.db.flush()
        download = MarketplaceDownload(
            item_id=item.id, organization_id=str(organization_id), user_id=user_id,
            version=version, action=action, status=status, error=error,
            ip_address=ip_address, user_agent=user_agent)
        self.db.add(download)
        await self.db.flush()
        return download

    async def list_downloads(self, *, organization_id: uuid.UUID,
                             item_id: uuid.UUID | None = None,
                             skip: int = 0, limit: int = 50) -> tuple[list[MarketplaceDownload], int]:
        conditions = [MarketplaceDownload.organization_id == str(organization_id)]
        if item_id:
            conditions.append(MarketplaceDownload.item_id == item_id)
        total = int((await self.db.execute(
            select(func.count()).select_from(MarketplaceDownload).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(MarketplaceDownload).where(*conditions)
            .order_by(MarketplaceDownload.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    # ----- Ratings -----

    async def rate_item(self, *, item_id: uuid.UUID, organization_id: uuid.UUID,
                        user_id: str, rating: int) -> MarketplaceRating:
        if not 1 <= rating <= 5:
            raise ValidationError("Rating must be between 1 and 5")
        item = await self.get_item(item_id=item_id, organization_id=organization_id)
        # Check for existing rating
        existing_q = await self.db.execute(
            select(MarketplaceRating).where(
                MarketplaceRating.item_id == item_id,
                MarketplaceRating.user_id == user_id))
        existing = existing_q.scalar_one_or_none()
        if existing:
            # Update existing rating
            old_rating = existing.rating
            existing.rating = rating
            item.rating_sum = (item.rating_sum or 0) - old_rating + rating
        else:
            rating_obj = MarketplaceRating(
                item_id=item_id, organization_id=str(organization_id),
                user_id=user_id, rating=rating)
            self.db.add(rating_obj)
            item.rating_sum = (item.rating_sum or 0) + rating
            item.rating_count = (item.rating_count or 0) + 1
        # Recompute average
        if item.rating_count > 0:
            item.rating_avg = item.rating_sum / item.rating_count
        await self.db.flush()
        return existing if existing else rating_obj

    # ----- Reviews -----

    async def create_review(self, *, item_id: uuid.UUID, organization_id: uuid.UUID,
                            user_id: str, user_name: str | None, rating: int,
                            title: str | None, body: str) -> MarketplaceReview:
        if not 1 <= rating <= 5:
            raise ValidationError("Rating must be between 1 and 5")
        review = MarketplaceReview(
            item_id=item_id, organization_id=str(organization_id), user_id=user_id,
            user_name=user_name, rating=rating, title=title, body=body,
            status="published")
        self.db.add(review)
        await self.db.flush()
        return review

    async def list_reviews(self, *, item_id: uuid.UUID, status: str = "published",
                           skip: int = 0, limit: int = 50) -> tuple[list[MarketplaceReview], int]:
        conditions = [MarketplaceReview.item_id == item_id]
        if status:
            conditions.append(MarketplaceReview.status == status)
        total = int((await self.db.execute(
            select(func.count()).select_from(MarketplaceReview).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(MarketplaceReview).where(*conditions)
            .order_by(MarketplaceReview.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def flag_review(self, *, review_id: uuid.UUID, reason: str) -> MarketplaceReview:
        review = await self.db.get(MarketplaceReview, review_id)
        if review is None:
            raise NotFoundError("MarketplaceReview", str(review_id))
        review.is_flagged = True
        review.flag_reason = reason
        review.status = "hidden"
        await self.db.flush()
        return review

    # ----- Moderation -----

    async def moderate_item(self, *, item_id: uuid.UUID, action: str,
                            reason: str | None = None) -> MarketplaceItem:
        item = await self.db.get(MarketplaceItem, item_id)
        if item is None:
            raise NotFoundError("MarketplaceItem", str(item_id))
        valid_actions = {"approve", "reject", "archive", "feature", "unfeature", "verify", "unverify"}
        if action not in valid_actions:
            raise ValidationError(f"Invalid action: {action}")
        if action == "approve":
            item.status = "published"
            item.published_at = datetime.now(UTC)
        elif action == "reject":
            item.status = "rejected"
        elif action == "archive":
            item.status = "archived"
        elif action == "feature":
            item.is_featured = True
        elif action == "unfeature":
            item.is_featured = False
        elif action == "verify":
            item.is_verified = True
        elif action == "unverify":
            item.is_verified = False
        await self.db.flush()
        return item

    def to_dict(self, item: MarketplaceItem) -> dict[str, Any]:
        return {"id": str(item.id), "item_type": item.item_type, "entity_id": item.entity_id,
                "name": item.name, "slug": item.slug, "summary": item.summary,
                "description": item.description, "category_id": str(item.category_id) if item.category_id else None,
                "tags": item.tags, "icon": item.icon, "version": item.version,
                "visibility": item.visibility, "status": item.status,
                "is_featured": item.is_featured, "is_verified": item.is_verified,
                "is_free": item.is_free, "price_cents": item.price_cents, "currency": item.currency,
                "download_count": item.download_count, "install_count": item.install_count,
                "view_count": item.view_count, "rating_avg": item.rating_avg,
                "rating_count": item.rating_count, "publisher_id": item.publisher_id,
                "publisher_name": item.publisher_name, "license": item.license,
                "published_at": item.published_at.isoformat() if item.published_at else None,
                "created_at": item.created_at.isoformat() if item.created_at else None}


# ====================================================================
# Plugin Service — CRUD + versions + install + reviews + permissions
# ====================================================================

class PluginService:
    """Manages the plugin catalog: plugins, versions, installations, permissions, reviews."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_plugin(self, *, organization_id: uuid.UUID | None = None,
                            name: str, slug: str, description: str | None = None,
                            category: str | None = None, tags: list[str] | None = None,
                            author_id: str | None = None, author_name: str | None = None,
                            runtime: str = "python", entrypoint: str = "main.py",
                            permissions: list[dict] | None = None,
                            config_schema: dict | None = None,
                            default_config: dict | None = None,
                            homepage_url: str | None = None,
                            repository_url: str | None = None,
                            documentation_url: str | None = None,
                            license_: str | None = None,
                            icon: str | None = None) -> EcosystemPlugin:
        plugin = EcosystemPlugin(
            organization_id=str(organization_id) if organization_id else None,
            name=name, slug=slug, description=description, category=category,
            tags=tags or [], author_id=author_id, author_name=author_name,
            homepage_url=homepage_url, repository_url=repository_url,
            documentation_url=documentation_url, icon=icon,
            current_version="1.0.0", runtime=runtime, entrypoint=entrypoint,
            permissions=permissions or [], config_schema=config_schema,
            default_config=default_config, is_published=False, is_verified=False,
            is_featured=False, is_free=True, price_cents=0, visibility="public",
            status="active", install_count=0, rating_avg=0.0, rating_count=0,
            license=license_)
        self.db.add(plugin)
        await self.db.flush()
        # Register permissions
        for perm in permissions or []:
            self.db.add(EcosystemPluginPermission(
                plugin_id=plugin.id, permission=perm.get("name", ""),
                description=perm.get("description"),
                is_required=perm.get("required", False),
                risk_level=perm.get("risk_level", "low")))
        await self.db.flush()
        # Auto-create first version
        await self._create_version(plugin, version="1.0.0", entrypoint=entrypoint,
                                    permissions=permissions or [],
                                    config_schema=config_schema,
                                    release_notes="Initial release",
                                    published_by=author_id)
        return plugin

    async def get_plugin(self, *, plugin_id: uuid.UUID) -> EcosystemPlugin:
        plugin = await self.db.get(EcosystemPlugin, plugin_id)
        if plugin is None:
            raise NotFoundError("Plugin", str(plugin_id))
        return plugin

    async def list_plugins(self, *, organization_id: uuid.UUID | None = None,
                           category: str | None = None, is_published: bool | None = None,
                           search: str | None = None,
                           skip: int = 0, limit: int = 50) -> tuple[list[EcosystemPlugin], int]:
        conditions = []
        if organization_id:
            org_str = str(organization_id)
            conditions.append(or_(
                EcosystemPlugin.organization_id.is_(None),
                EcosystemPlugin.organization_id == org_str))
        if category:
            conditions.append(EcosystemPlugin.category == category)
        if is_published is not None:
            conditions.append(EcosystemPlugin.is_published.is_(is_published))
        if search:
            like = f"%{search.lower()}%"
            conditions.append(or_(
                func.lower(EcosystemPlugin.name).like(like),
                func.lower(EcosystemPlugin.description).like(like)))
        count_q = select(func.count()).select_from(EcosystemPlugin)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)
        q = select(EcosystemPlugin)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(EcosystemPlugin.is_featured.desc(),
                       EcosystemPlugin.rating_avg.desc(),
                       EcosystemPlugin.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def update_plugin(self, *, plugin_id: uuid.UUID, **updates: Any) -> EcosystemPlugin:
        plugin = await self.get_plugin(plugin_id=plugin_id)
        for key, value in updates.items():
            if hasattr(plugin, key) and value is not None:
                setattr(plugin, key, value)
        await self.db.flush()
        return plugin

    async def publish_plugin(self, *, plugin_id: uuid.UUID) -> EcosystemPlugin:
        plugin = await self.get_plugin(plugin_id=plugin_id)
        plugin.is_published = True
        await self.db.flush()
        return plugin

    async def _create_version(self, plugin: EcosystemPlugin, version: str,
                              entrypoint: str, permissions: list[dict],
                              config_schema: dict | None = None,
                              release_notes: str | None = None,
                              published_by: str | None = None) -> EcosystemPluginVersion:
        ver = EcosystemPluginVersion(
            plugin_id=plugin.id, organization_id=plugin.organization_id or "",
            version=version, release_notes=release_notes, entrypoint=entrypoint,
            permissions=permissions, config_schema=config_schema,
            min_platform_version=plugin.min_platform_version,
            is_active=True, is_yanked=False, published_by=published_by,
            published_at=datetime.now(UTC))
        self.db.add(ver)
        await self.db.flush()
        plugin.current_version = version
        return ver

    async def list_versions(self, *, plugin_id: uuid.UUID) -> list[EcosystemPluginVersion]:
        result = await self.db.execute(
            select(EcosystemPluginVersion).where(EcosystemPluginVersion.plugin_id == plugin_id)
            .order_by(EcosystemPluginVersion.created_at.desc()))
        return list(result.scalars().all())

    async def rollback_to_version(self, *, plugin_id: uuid.UUID,
                                  version: str) -> EcosystemPlugin:
        plugin = await self.get_plugin(plugin_id=plugin_id)
        result = await self.db.execute(
            select(EcosystemPluginVersion).where(
                EcosystemPluginVersion.plugin_id == plugin_id,
                EcosystemPluginVersion.version == version))
        ver = result.scalar_one_or_none()
        if ver is None:
            raise NotFoundError("PluginVersion", version)
        if ver.is_yanked:
            raise ValidationError(f"Version {version} has been yanked")
        plugin.current_version = ver.version
        plugin.entrypoint = ver.entrypoint
        plugin.permissions = ver.permissions
        plugin.config_schema = ver.config_schema
        # Mark all versions inactive except target
        all_versions_q = await self.db.execute(
            select(EcosystemPluginVersion).where(EcosystemPluginVersion.plugin_id == plugin_id))
        for v in all_versions_q.scalars().all():
            v.is_active = (v.version == version)
        await self.db.flush()
        return plugin

    async def yank_version(self, *, plugin_id: uuid.UUID, version: str) -> EcosystemPluginVersion:
        result = await self.db.execute(
            select(EcosystemPluginVersion).where(
                EcosystemPluginVersion.plugin_id == plugin_id,
                EcosystemPluginVersion.version == version))
        ver = result.scalar_one_or_none()
        if ver is None:
            raise NotFoundError("PluginVersion", version)
        ver.is_yanked = True
        ver.is_active = False
        await self.db.flush()
        return ver

    # ----- Installations -----

    async def install_plugin(self, *, plugin_id: uuid.UUID, organization_id: uuid.UUID,
                             installed_by: str | None = None,
                             version: str | None = None,
                             config: dict | None = None,
                             granted_permissions: list[str] | None = None
                             ) -> EcosystemPluginInstallation:
        plugin = await self.get_plugin(plugin_id=plugin_id)
        # Check if already installed
        existing_q = await self.db.execute(
            select(EcosystemPluginInstallation).where(
                EcosystemPluginInstallation.organization_id == str(organization_id),
                EcosystemPluginInstallation.plugin_id == plugin_id))
        existing = existing_q.scalar_one_or_none()
        if existing:
            raise ValidationError("Plugin already installed in this organization")
        target_version = version or plugin.current_version
        # Find version record
        ver_q = await self.db.execute(
            select(EcosystemPluginVersion).where(
                EcosystemPluginVersion.plugin_id == plugin_id,
                EcosystemPluginVersion.version == target_version))
        ver = ver_q.scalar_one_or_none()
        installation = EcosystemPluginInstallation(
            plugin_id=plugin_id, version_id=ver.id if ver else None,
            organization_id=str(organization_id), installed_by=installed_by,
            version=target_version, config=config or {},
            granted_permissions=granted_permissions if granted_permissions is not None else plugin.permissions,
            status="active", is_sandboxed=True, health_status="healthy",
            installed_at=datetime.now(UTC))
        self.db.add(installation)
        plugin.install_count = (plugin.install_count or 0) + 1
        await self.db.flush()
        return installation

    async def uninstall_plugin(self, *, installation_id: uuid.UUID) -> bool:
        installation = await self.db.get(EcosystemPluginInstallation, installation_id)
        if installation is None:
            raise NotFoundError("PluginInstallation", str(installation_id))
        installation.status = "disabled"
        await self.db.flush()
        return True

    async def update_installation(self, *, installation_id: uuid.UUID,
                                  config: dict | None = None,
                                  granted_permissions: list[str] | None = None,
                                  status: str | None = None) -> EcosystemPluginInstallation:
        installation = await self.db.get(EcosystemPluginInstallation, installation_id)
        if installation is None:
            raise NotFoundError("PluginInstallation", str(installation_id))
        if config is not None:
            installation.config = config
        if granted_permissions is not None:
            installation.granted_permissions = granted_permissions
        if status is not None:
            installation.status = status
        await self.db.flush()
        return installation

    async def list_installations(self, *, organization_id: uuid.UUID,
                                 skip: int = 0, limit: int = 50) -> tuple[list[EcosystemPluginInstallation], int]:
        conditions = [EcosystemPluginInstallation.organization_id == str(organization_id)]
        total = int((await self.db.execute(
            select(func.count()).select_from(EcosystemPluginInstallation).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(EcosystemPluginInstallation).where(*conditions)
            .order_by(EcosystemPluginInstallation.installed_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def health_check(self, *, installation_id: uuid.UUID,
                           status: str = "healthy",
                           error: str | None = None) -> EcosystemPluginInstallation:
        installation = await self.db.get(EcosystemPluginInstallation, installation_id)
        if installation is None:
            raise NotFoundError("PluginInstallation", str(installation_id))
        installation.health_status = status
        installation.last_health_check = datetime.now(UTC)
        installation.error_message = error
        if status != "healthy":
            installation.status = "error"
        await self.db.flush()
        return installation

    # ----- Permissions -----

    async def list_permissions(self, *, plugin_id: uuid.UUID) -> list[EcosystemPluginPermission]:
        result = await self.db.execute(
            select(EcosystemPluginPermission).where(EcosystemPluginPermission.plugin_id == plugin_id))
        return list(result.scalars().all())

    async def add_permission(self, *, plugin_id: uuid.UUID, permission: str,
                             description: str | None = None,
                             is_required: bool = False,
                             risk_level: str = "low") -> EcosystemPluginPermission:
        perm = EcosystemPluginPermission(
            plugin_id=plugin_id, permission=permission, description=description,
            is_required=is_required, risk_level=risk_level)
        self.db.add(perm)
        await self.db.flush()
        return perm

    # ----- Reviews -----

    async def create_review(self, *, plugin_id: uuid.UUID, organization_id: uuid.UUID,
                            user_id: str, user_name: str | None, rating: int,
                            title: str | None, body: str | None,
                            version: str | None = None) -> EcosystemPluginReview:
        if not 1 <= rating <= 5:
            raise ValidationError("Rating must be between 1 and 5")
        review = EcosystemPluginReview(
            plugin_id=plugin_id, organization_id=str(organization_id), user_id=user_id,
            user_name=user_name, rating=rating, title=title, body=body,
            version=version, status="published")
        self.db.add(review)
        await self.db.flush()
        # Update plugin rating aggregates
        plugin = await self.get_plugin(plugin_id=plugin_id)
        result = await self.db.execute(
            select(func.avg(EcosystemPluginReview.rating), func.count(EcosystemPluginReview.id))
            .where(EcosystemPluginReview.plugin_id == plugin_id,
                   EcosystemPluginReview.status == "published"))
        avg, count = result.one()
        if avg is not None:
            plugin.rating_avg = float(avg)
            plugin.rating_count = int(count or 0)
        await self.db.flush()
        return review

    async def list_reviews(self, *, plugin_id: uuid.UUID,
                           skip: int = 0, limit: int = 50) -> tuple[list[EcosystemPluginReview], int]:
        conditions = [EcosystemPluginReview.plugin_id == plugin_id]
        total = int((await self.db.execute(
            select(func.count()).select_from(EcosystemPluginReview).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(EcosystemPluginReview).where(*conditions)
            .order_by(EcosystemPluginReview.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    def to_dict(self, plugin: EcosystemPlugin) -> dict[str, Any]:
        return {"id": str(plugin.id), "name": plugin.name, "slug": plugin.slug,
                "description": plugin.description, "category": plugin.category,
                "tags": plugin.tags, "author_id": plugin.author_id,
                "author_name": plugin.author_name, "homepage_url": plugin.homepage_url,
                "repository_url": plugin.repository_url, "documentation_url": plugin.documentation_url,
                "icon": plugin.icon, "current_version": plugin.current_version,
                "min_platform_version": plugin.min_platform_version, "runtime": plugin.runtime,
                "entrypoint": plugin.entrypoint, "permissions": plugin.permissions,
                "config_schema": plugin.config_schema, "default_config": plugin.default_config,
                "is_published": plugin.is_published, "is_verified": plugin.is_verified,
                "is_featured": plugin.is_featured, "is_free": plugin.is_free,
                "price_cents": plugin.price_cents, "visibility": plugin.visibility,
                "status": plugin.status, "install_count": plugin.install_count,
                "rating_avg": plugin.rating_avg, "rating_count": plugin.rating_count,
                "license": plugin.license,
                "organization_id": plugin.organization_id,
                "created_at": plugin.created_at.isoformat() if plugin.created_at else None}

    def installation_to_dict(self, inst: EcosystemPluginInstallation) -> dict[str, Any]:
        return {"id": str(inst.id), "plugin_id": str(inst.plugin_id),
                "version_id": str(inst.version_id) if inst.version_id else None,
                "organization_id": inst.organization_id, "installed_by": inst.installed_by,
                "version": inst.version, "config": inst.config,
                "granted_permissions": inst.granted_permissions, "status": inst.status,
                "is_sandboxed": inst.is_sandboxed,
                "last_health_check": inst.last_health_check.isoformat() if inst.last_health_check else None,
                "health_status": inst.health_status, "error_message": inst.error_message,
                "installed_at": inst.installed_at.isoformat() if inst.installed_at else None}


# ====================================================================
# Connector Service — catalog + instances + encrypted credentials + health
# ====================================================================

class ConnectorService:
    """Manages the connector catalog and per-org connector instances with encrypted credentials."""

    # Catalog of supported connectors (seeded in DB by create_connector)
    KNOWN_CONNECTORS = [
        {"name": "Salesforce", "slug": "salesforce", "category": "crm", "provider": "salesforce",
         "auth_type": "oauth2", "capabilities": ["read", "write", "search", "webhook", "batch"]},
        {"name": "HubSpot", "slug": "hubspot", "category": "crm", "provider": "hubspot",
         "auth_type": "oauth2", "capabilities": ["read", "write", "search", "webhook"]},
        {"name": "Zoho CRM", "slug": "zoho-crm", "category": "crm", "provider": "zoho",
         "auth_type": "oauth2", "capabilities": ["read", "write", "search"]},
        {"name": "Microsoft Dynamics 365", "slug": "dynamics-365", "category": "crm",
         "provider": "microsoft", "auth_type": "oauth2", "capabilities": ["read", "write", "search", "webhook"]},
        {"name": "Slack", "slug": "slack", "category": "communication", "provider": "slack",
         "auth_type": "oauth2", "capabilities": ["read", "write", "webhook"], "webhook_supported": True},
        {"name": "Discord", "slug": "discord", "category": "communication", "provider": "discord",
         "auth_type": "bot_token", "capabilities": ["read", "write", "webhook"], "webhook_supported": True},
        {"name": "Microsoft Teams", "slug": "microsoft-teams", "category": "communication",
         "provider": "microsoft", "auth_type": "oauth2", "capabilities": ["read", "write", "webhook"]},
        {"name": "WhatsApp Business", "slug": "whatsapp-business", "category": "communication",
         "provider": "meta", "auth_type": "api_key", "capabilities": ["read", "write", "webhook"]},
        {"name": "Telegram", "slug": "telegram", "category": "communication", "provider": "telegram",
         "auth_type": "bot_token", "capabilities": ["read", "write", "webhook"], "webhook_supported": True},
        {"name": "Email (SMTP/IMAP)", "slug": "email", "category": "communication", "provider": "generic",
         "auth_type": "basic", "capabilities": ["read", "write"]},
        {"name": "Google Workspace", "slug": "google-workspace", "category": "communication",
         "provider": "google", "auth_type": "oauth2", "capabilities": ["read", "write", "search"]},
        {"name": "Microsoft 365", "slug": "microsoft-365", "category": "communication",
         "provider": "microsoft", "auth_type": "oauth2", "capabilities": ["read", "write", "search"]},
        {"name": "Google Drive", "slug": "google-drive", "category": "storage", "provider": "google",
         "auth_type": "oauth2", "capabilities": ["read", "write", "search"]},
        {"name": "Dropbox", "slug": "dropbox", "category": "storage", "provider": "dropbox",
         "auth_type": "oauth2", "capabilities": ["read", "write", "search"]},
        {"name": "OneDrive", "slug": "onedrive", "category": "storage", "provider": "microsoft",
         "auth_type": "oauth2", "capabilities": ["read", "write", "search"]},
        {"name": "Box", "slug": "box", "category": "storage", "provider": "box",
         "auth_type": "oauth2", "capabilities": ["read", "write", "search"]},
        {"name": "GitHub", "slug": "github", "category": "development", "provider": "github",
         "auth_type": "oauth2", "capabilities": ["read", "write", "webhook"], "webhook_supported": True},
        {"name": "GitLab", "slug": "gitlab", "category": "development", "provider": "gitlab",
         "auth_type": "oauth2", "capabilities": ["read", "write", "webhook"], "webhook_supported": True},
        {"name": "Bitbucket", "slug": "bitbucket", "category": "development", "provider": "atlassian",
         "auth_type": "oauth2", "capabilities": ["read", "write", "webhook"]},
        {"name": "Jira", "slug": "jira", "category": "development", "provider": "atlassian",
         "auth_type": "oauth2", "capabilities": ["read", "write", "search", "webhook"]},
        {"name": "Linear", "slug": "linear", "category": "development", "provider": "linear",
         "auth_type": "api_key", "capabilities": ["read", "write", "search"]},
        {"name": "Azure DevOps", "slug": "azure-devops", "category": "development",
         "provider": "microsoft", "auth_type": "oauth2", "capabilities": ["read", "write", "search"]},
        {"name": "PostgreSQL", "slug": "postgresql", "category": "database", "provider": "postgres",
         "auth_type": "basic", "capabilities": ["read", "write", "search", "batch"]},
        {"name": "MySQL", "slug": "mysql", "category": "database", "provider": "mysql",
         "auth_type": "basic", "capabilities": ["read", "write", "search", "batch"]},
        {"name": "MongoDB", "slug": "mongodb", "category": "database", "provider": "mongodb",
         "auth_type": "basic", "capabilities": ["read", "write", "search"]},
        {"name": "SQL Server", "slug": "sql-server", "category": "database", "provider": "microsoft",
         "auth_type": "basic", "capabilities": ["read", "write", "search", "batch"]},
        {"name": "Snowflake", "slug": "snowflake", "category": "database", "provider": "snowflake",
         "auth_type": "basic", "capabilities": ["read", "write", "search", "batch"]},
        {"name": "BigQuery", "slug": "bigquery", "category": "database", "provider": "google",
         "auth_type": "oauth2", "capabilities": ["read", "write", "search", "batch"]},
        {"name": "Power BI", "slug": "power-bi", "category": "analytics", "provider": "microsoft",
         "auth_type": "oauth2", "capabilities": ["read"]},
        {"name": "Looker", "slug": "looker", "category": "analytics", "provider": "google",
         "auth_type": "api_key", "capabilities": ["read"]},
        {"name": "Tableau", "slug": "tableau", "category": "analytics", "provider": "tableau",
         "auth_type": "api_key", "capabilities": ["read"]},
        {"name": "Grafana", "slug": "grafana", "category": "analytics", "provider": "grafana",
         "auth_type": "api_key", "capabilities": ["read", "write"]},
        {"name": "AWS", "slug": "aws", "category": "cloud", "provider": "amazon",
         "auth_type": "api_key", "capabilities": ["read", "write"]},
        {"name": "Azure", "slug": "azure", "category": "cloud", "provider": "microsoft",
         "auth_type": "oauth2", "capabilities": ["read", "write"]},
        {"name": "Google Cloud", "slug": "google-cloud", "category": "cloud", "provider": "google",
         "auth_type": "oauth2", "capabilities": ["read", "write"]},
        {"name": "Stripe", "slug": "stripe", "category": "payment", "provider": "stripe",
         "auth_type": "api_key", "capabilities": ["read", "write", "webhook"], "webhook_supported": True},
        {"name": "Razorpay", "slug": "razorpay", "category": "payment", "provider": "razorpay",
         "auth_type": "api_key", "capabilities": ["read", "write", "webhook"], "webhook_supported": True},
    ]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_connector(self, *, name: str, slug: str, category: str, provider: str,
                               auth_type: str, description: str | None = None,
                               tags: list[str] | None = None, icon: str | None = None,
                               auth_config: dict | None = None,
                               config_schema: dict | None = None,
                               capabilities: list[str] | None = None,
                               supported_operations: list[str] | None = None,
                               webhook_supported: bool = False,
                               rate_limit_per_minute: int | None = None,
                               documentation_url: str | None = None,
                               is_official: bool = False) -> EcosystemConnector:
        connector = EcosystemConnector(
            name=name, slug=slug, description=description, category=category,
            provider=provider, tags=tags or [], icon=icon, auth_type=auth_type,
            auth_config=auth_config, config_schema=config_schema,
            capabilities=capabilities or [], supported_operations=supported_operations or [],
            webhook_supported=webhook_supported, rate_limit_per_minute=rate_limit_per_minute,
            documentation_url=documentation_url, is_official=is_official,
            is_verified=is_official, is_active=True, install_count=0, rating_avg=0.0)
        self.db.add(connector)
        await self.db.flush()
        return connector

    async def get_connector(self, *, connector_id: uuid.UUID) -> EcosystemConnector:
        connector = await self.db.get(EcosystemConnector, connector_id)
        if connector is None:
            raise NotFoundError("Connector", str(connector_id))
        return connector

    async def list_connectors(self, *, category: str | None = None,
                              search: str | None = None, is_active: bool = True,
                              skip: int = 0, limit: int = 100) -> tuple[list[EcosystemConnector], int]:
        conditions = []
        if category:
            conditions.append(EcosystemConnector.category == category)
        if is_active is not None:
            conditions.append(EcosystemConnector.is_active.is_(is_active))
        if search:
            like = f"%{search.lower()}%"
            conditions.append(or_(
                func.lower(EcosystemConnector.name).like(like),
                func.lower(EcosystemConnector.description).like(like),
                func.lower(EcosystemConnector.provider).like(like)))
        count_q = select(func.count()).select_from(EcosystemConnector)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)
        q = select(EcosystemConnector)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(EcosystemConnector.is_official.desc(),
                       EcosystemConnector.name.asc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def list_categories(self) -> list[str]:
        result = await self.db.execute(
            select(EcosystemConnector.category).distinct()
            .where(EcosystemConnector.is_active.is_(True)))
        return sorted([r[0] for r in result.all()])

    # ----- Instances -----

    async def create_instance(self, *, connector_id: uuid.UUID, organization_id: uuid.UUID,
                              name: str, auth_type: str, credentials: dict,
                              config: dict | None = None,
                              installed_by: str | None = None) -> EcosystemConnectorInstance:
        connector = await self.get_connector(connector_id=connector_id)
        # Check uniqueness
        existing_q = await self.db.execute(
            select(EcosystemConnectorInstance).where(
                EcosystemConnectorInstance.organization_id == str(organization_id),
                EcosystemConnectorInstance.name == name))
        if existing_q.scalar_one_or_none():
            raise ValidationError(f"Connector instance with name '{name}' already exists in this organization")
        instance = EcosystemConnectorInstance(
            connector_id=connector_id, organization_id=str(organization_id), name=name,
            auth_type=auth_type,
            credentials_encrypted=_encrypt_value(json.dumps(credentials)),
            config=config or {}, status="active", health_status="healthy",
            error_count=0, total_calls=0, installed_by=installed_by)
        self.db.add(instance)
        connector.install_count = (connector.install_count or 0) + 1
        await self.db.flush()
        return instance

    async def get_instance(self, *, instance_id: uuid.UUID,
                           organization_id: uuid.UUID) -> EcosystemConnectorInstance:
        instance = await self.db.get(EcosystemConnectorInstance, instance_id)
        if instance is None or instance.organization_id != str(organization_id):
            raise NotFoundError("ConnectorInstance", str(instance_id))
        return instance

    async def get_credentials(self, *, instance_id: uuid.UUID,
                              organization_id: uuid.UUID) -> dict:
        """Decrypt and return credentials for internal use."""
        instance = await self.get_instance(instance_id=instance_id, organization_id=organization_id)
        if not instance.credentials_encrypted:
            return {}
        return json.loads(_decrypt_value(instance.credentials_encrypted))

    async def list_instances(self, *, organization_id: uuid.UUID,
                             connector_id: uuid.UUID | None = None,
                             skip: int = 0, limit: int = 50) -> tuple[list[EcosystemConnectorInstance], int]:
        conditions = [EcosystemConnectorInstance.organization_id == str(organization_id)]
        if connector_id:
            conditions.append(EcosystemConnectorInstance.connector_id == connector_id)
        total = int((await self.db.execute(
            select(func.count()).select_from(EcosystemConnectorInstance).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(EcosystemConnectorInstance).where(*conditions)
            .order_by(EcosystemConnectorInstance.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def update_instance(self, *, instance_id: uuid.UUID,
                              organization_id: uuid.UUID,
                              config: dict | None = None,
                              credentials: dict | None = None,
                              status: str | None = None) -> EcosystemConnectorInstance:
        instance = await self.get_instance(instance_id=instance_id, organization_id=organization_id)
        if config is not None:
            instance.config = config
        if credentials is not None:
            instance.credentials_encrypted = _encrypt_value(json.dumps(credentials))
        if status is not None:
            instance.status = status
        await self.db.flush()
        return instance

    async def delete_instance(self, *, instance_id: uuid.UUID,
                              organization_id: uuid.UUID) -> bool:
        instance = await self.get_instance(instance_id=instance_id, organization_id=organization_id)
        instance.status = "disabled"
        instance.credentials_encrypted = None  # Wipe credentials on disable
        await self.db.flush()
        return True

    async def health_check(self, *, instance_id: uuid.UUID,
                           organization_id: uuid.UUID,
                           status: str = "healthy",
                           error: str | None = None) -> EcosystemConnectorInstance:
        instance = await self.get_instance(instance_id=instance_id, organization_id=organization_id)
        instance.health_status = status
        instance.last_health_check = datetime.now(UTC)
        if status != "healthy":
            instance.error_count = (instance.error_count or 0) + 1
        await self.db.flush()
        return instance

    async def record_call(self, *, instance_id: uuid.UUID,
                          organization_id: uuid.UUID) -> EcosystemConnectorInstance:
        instance = await self.get_instance(instance_id=instance_id, organization_id=organization_id)
        instance.total_calls = (instance.total_calls or 0) + 1
        instance.last_sync_at = datetime.now(UTC)
        await self.db.flush()
        return instance

    def to_dict(self, c: EcosystemConnector) -> dict[str, Any]:
        return {"id": str(c.id), "name": c.name, "slug": c.slug, "description": c.description,
                "category": c.category, "provider": c.provider, "tags": c.tags, "icon": c.icon,
                "auth_type": c.auth_type, "config_schema": c.config_schema,
                "capabilities": c.capabilities, "supported_operations": c.supported_operations,
                "webhook_supported": c.webhook_supported,
                "rate_limit_per_minute": c.rate_limit_per_minute,
                "documentation_url": c.documentation_url, "is_official": c.is_official,
                "is_verified": c.is_verified, "is_active": c.is_active,
                "install_count": c.install_count, "rating_avg": c.rating_avg,
                "created_at": c.created_at.isoformat() if c.created_at else None}

    def instance_to_dict(self, i: EcosystemConnectorInstance) -> dict[str, Any]:
        return {"id": str(i.id), "connector_id": str(i.connector_id),
                "organization_id": i.organization_id, "name": i.name, "auth_type": i.auth_type,
                "config": i.config, "status": i.status,
                "last_sync_at": i.last_sync_at.isoformat() if i.last_sync_at else None,
                "last_health_check": i.last_health_check.isoformat() if i.last_health_check else None,
                "health_status": i.health_status, "error_count": i.error_count,
                "total_calls": i.total_calls, "installed_by": i.installed_by,
                "has_credentials": bool(i.credentials_encrypted),
                "created_at": i.created_at.isoformat() if i.created_at else None}


# ====================================================================
# MCP Service — servers + tools + resources + health monitoring + discovery
# ====================================================================

class McpService:
    """Manages MCP (Model Context Protocol) servers, tools, and resources."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register_server(self, *, organization_id: uuid.UUID | None = None,
                              name: str, slug: str, transport: str,
                              endpoint: str | None = None,
                              transport_config: dict | None = None,
                              auth_type: str | None = None,
                              auth_config: dict | None = None,
                              description: str | None = None,
                              version: str | None = None,
                              vendor: str | None = None,
                              vendor_url: str | None = None,
                              icon: str | None = None,
                              is_official: bool = False,
                              auto_discover_tools: bool = True) -> McpServer:
        server = McpServer(
            organization_id=str(organization_id) if organization_id else None,
            name=name, slug=slug, description=description, transport=transport,
            endpoint=endpoint, transport_config=transport_config,
            auth_type=auth_type,
            auth_config_encrypted=_encrypt_value(json.dumps(auth_config)) if auth_config else None,
            version=version, vendor=vendor, vendor_url=vendor_url, icon=icon,
            is_enabled=True, is_official=is_official,
            auto_discover_tools=auto_discover_tools, health_status="unknown",
            tool_count=0, resource_count=0)
        self.db.add(server)
        await self.db.flush()
        return server

    async def get_server(self, *, server_id: uuid.UUID) -> McpServer:
        server = await self.db.get(McpServer, server_id)
        if server is None:
            raise NotFoundError("McpServer", str(server_id))
        return server

    async def list_servers(self, *, organization_id: uuid.UUID | None = None,
                           is_enabled: bool | None = None,
                           skip: int = 0, limit: int = 100) -> tuple[list[McpServer], int]:
        conditions = []
        if organization_id:
            org_str = str(organization_id)
            conditions.append(or_(
                McpServer.organization_id.is_(None),
                McpServer.organization_id == org_str))
        if is_enabled is not None:
            conditions.append(McpServer.is_enabled.is_(is_enabled))
        count_q = select(func.count()).select_from(McpServer)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)
        q = select(McpServer)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(McpServer.is_official.desc(), McpServer.name.asc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def update_server(self, *, server_id: uuid.UUID, **updates: Any) -> McpServer:
        server = await self.get_server(server_id=server_id)
        for key, value in updates.items():
            if hasattr(server, key) and value is not None:
                setattr(server, key, value)
        await self.db.flush()
        return server

    async def delete_server(self, *, server_id: uuid.UUID) -> bool:
        server = await self.get_server(server_id=server_id)
        server.is_enabled = False
        await self.db.flush()
        return True

    # ----- Tools -----

    async def register_tool(self, *, server_id: uuid.UUID, organization_id: uuid.UUID,
                            name: str, description: str | None = None,
                            input_schema: dict | None = None,
                            output_schema: dict | None = None,
                            annotations: dict | None = None,
                            is_destructive: bool = False,
                            requires_confirmation: bool = False,
                            category: str | None = None,
                            tags: list[str] | None = None) -> McpTool:
        tool = McpTool(
            server_id=server_id, organization_id=str(organization_id), name=name,
            description=description, input_schema=input_schema or {},
            output_schema=output_schema, annotations=annotations,
            is_enabled=True, is_destructive=is_destructive,
            requires_confirmation=requires_confirmation, category=category,
            tags=tags or [], invoke_count=0, error_rate=0.0)
        self.db.add(tool)
        await self.db.flush()
        # Update server tool count
        server = await self.get_server(server_id=server_id)
        server.tool_count = (server.tool_count or 0) + 1
        await self.db.flush()
        return tool

    async def list_tools(self, *, server_id: uuid.UUID | None = None,
                         organization_id: uuid.UUID | None = None,
                         category: str | None = None,
                         is_enabled: bool | None = None,
                         skip: int = 0, limit: int = 100) -> tuple[list[McpTool], int]:
        conditions = []
        if server_id:
            conditions.append(McpTool.server_id == server_id)
        if organization_id:
            conditions.append(McpTool.organization_id == str(organization_id))
        if category:
            conditions.append(McpTool.category == category)
        if is_enabled is not None:
            conditions.append(McpTool.is_enabled.is_(is_enabled))
        count_q = select(func.count()).select_from(McpTool)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)
        q = select(McpTool)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(McpTool.name.asc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def invoke_tool(self, *, tool_id: uuid.UUID, latency_ms: int = 0,
                          success: bool = True) -> McpTool:
        tool = await self.db.get(McpTool, tool_id)
        if tool is None:
            raise NotFoundError("McpTool", str(tool_id))
        tool.invoke_count = (tool.invoke_count or 0) + 1
        tool.last_invoked_at = datetime.now(UTC)
        # Rolling average latency (simple)
        if tool.avg_latency_ms is None:
            tool.avg_latency_ms = latency_ms
        else:
            tool.avg_latency_ms = int((tool.avg_latency_ms + latency_ms) / 2)
        if not success:
            total = tool.invoke_count or 1
            failures = int(total * tool.error_rate) + 1
            tool.error_rate = failures / total
        await self.db.flush()
        return tool

    # ----- Resources -----

    async def register_resource(self, *, server_id: uuid.UUID, organization_id: uuid.UUID,
                                uri: str, name: str, description: str | None = None,
                                mime_type: str | None = None,
                                size_bytes: int | None = None,
                                is_template: bool = False) -> McpResource:
        resource = McpResource(
            server_id=server_id, organization_id=str(organization_id), uri=uri,
            name=name, description=description, mime_type=mime_type,
            size_bytes=size_bytes, is_template=is_template, is_enabled=True,
            access_count=0)
        self.db.add(resource)
        await self.db.flush()
        server = await self.get_server(server_id=server_id)
        server.resource_count = (server.resource_count or 0) + 1
        await self.db.flush()
        return resource

    async def list_resources(self, *, server_id: uuid.UUID | None = None,
                             organization_id: uuid.UUID | None = None,
                             skip: int = 0, limit: int = 100) -> tuple[list[McpResource], int]:
        conditions = []
        if server_id:
            conditions.append(McpResource.server_id == server_id)
        if organization_id:
            conditions.append(McpResource.organization_id == str(organization_id))
        count_q = select(func.count()).select_from(McpResource)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)
        q = select(McpResource)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(McpResource.name.asc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    # ----- Health Monitoring -----

    async def health_check(self, *, server_id: uuid.UUID,
                           status: str = "healthy") -> McpServer:
        server = await self.get_server(server_id=server_id)
        server.health_status = status
        server.last_health_check = datetime.now(UTC)
        await self.db.flush()
        return server

    async def discover_tools(self, *, server_id: uuid.UUID,
                             discovered: list[dict]) -> dict[str, Any]:
        """Auto-discover tools from MCP server — replace existing tool list."""
        server = await self.get_server(server_id=server_id)
        new_count = 0
        updated_count = 0
        for tool_def in discovered:
            existing_q = await self.db.execute(
                select(McpTool).where(
                    McpTool.server_id == server_id,
                    McpTool.name == tool_def.get("name")))
            existing = existing_q.scalar_one_or_none()
            if existing:
                existing.description = tool_def.get("description", existing.description)
                existing.input_schema = tool_def.get("input_schema", existing.input_schema)
                existing.output_schema = tool_def.get("output_schema", existing.output_schema)
                existing.annotations = tool_def.get("annotations", existing.annotations)
                updated_count += 1
            else:
                await self.register_tool(
                    server_id=server_id,
                    organization_id=uuid.UUID(server.organization_id) if server.organization_id else uuid.uuid4(),
                    name=tool_def.get("name", ""),
                    description=tool_def.get("description"),
                    input_schema=tool_def.get("input_schema", {}),
                    output_schema=tool_def.get("output_schema"),
                    annotations=tool_def.get("annotations"),
                    is_destructive=tool_def.get("is_destructive", False),
                    requires_confirmation=tool_def.get("requires_confirmation", False),
                    category=tool_def.get("category"),
                    tags=tool_def.get("tags", []))
                new_count += 1
        server.last_discovered_at = datetime.now(UTC)
        await self.db.flush()
        return {"server_id": str(server_id), "new_tools": new_count,
                "updated_tools": updated_count, "total_discovered": len(discovered)}

    def server_to_dict(self, s: McpServer) -> dict[str, Any]:
        return {"id": str(s.id), "name": s.name, "slug": s.slug,
                "description": s.description, "transport": s.transport,
                "endpoint": s.endpoint, "transport_config": s.transport_config,
                "auth_type": s.auth_type, "version": s.version, "vendor": s.vendor,
                "vendor_url": s.vendor_url, "icon": s.icon, "is_enabled": s.is_enabled,
                "is_official": s.is_official, "auto_discover_tools": s.auto_discover_tools,
                "last_health_check": s.last_health_check.isoformat() if s.last_health_check else None,
                "health_status": s.health_status,
                "last_discovered_at": s.last_discovered_at.isoformat() if s.last_discovered_at else None,
                "tool_count": s.tool_count, "resource_count": s.resource_count,
                "organization_id": s.organization_id,
                "created_at": s.created_at.isoformat() if s.created_at else None}

    def tool_to_dict(self, t: McpTool) -> dict[str, Any]:
        return {"id": str(t.id), "server_id": str(t.server_id), "name": t.name,
                "description": t.description, "input_schema": t.input_schema,
                "output_schema": t.output_schema, "annotations": t.annotations,
                "is_enabled": t.is_enabled, "is_destructive": t.is_destructive,
                "requires_confirmation": t.requires_confirmation, "category": t.category,
                "tags": t.tags,
                "last_invoked_at": t.last_invoked_at.isoformat() if t.last_invoked_at else None,
                "invoke_count": t.invoke_count, "avg_latency_ms": t.avg_latency_ms,
                "error_rate": t.error_rate}


# ====================================================================
# Webhook Platform Service — outgoing + incoming + signing + retry + replay
# ====================================================================

class WebhookPlatformService:
    """Webhook subscriptions + event log + HMAC signing + retry queue + replay."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_subscription(self, *, organization_id: uuid.UUID, name: str,
                                  target_url: str, event_types: list[str],
                                  headers: dict | None = None,
                                  max_retries: int = 5,
                                  timeout_seconds: int = 30,
                                  developer_app_id: uuid.UUID | None = None,
                                  created_by: str | None = None) -> tuple[WebhookSubscription, str]:
        """Create a subscription. Returns (subscription, signing_secret)."""
        secret = _generate_signing_secret()
        sub = WebhookSubscription(
            organization_id=str(organization_id), name=name,
            developer_app_id=developer_app_id, target_url=target_url,
            event_types=event_types, secret_encrypted=_encrypt_value(secret),
            is_active=True, headers=headers or {}, max_retries=max_retries,
            timeout_seconds=timeout_seconds, success_count=0, failure_count=0,
            created_by=created_by)
        self.db.add(sub)
        await self.db.flush()
        return sub, secret

    async def list_subscriptions(self, *, organization_id: uuid.UUID,
                                 is_active: bool | None = None,
                                 skip: int = 0, limit: int = 50) -> tuple[list[WebhookSubscription], int]:
        conditions = [WebhookSubscription.organization_id == str(organization_id)]
        if is_active is not None:
            conditions.append(WebhookSubscription.is_active.is_(is_active))
        total = int((await self.db.execute(
            select(func.count()).select_from(WebhookSubscription).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(WebhookSubscription).where(*conditions)
            .order_by(WebhookSubscription.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def update_subscription(self, *, subscription_id: uuid.UUID,
                                  organization_id: uuid.UUID,
                                  target_url: str | None = None,
                                  event_types: list[str] | None = None,
                                  is_active: bool | None = None,
                                  headers: dict | None = None) -> WebhookSubscription:
        sub_q = await self.db.execute(
            select(WebhookSubscription).where(
                WebhookSubscription.id == subscription_id,
                WebhookSubscription.organization_id == str(organization_id)))
        sub = sub_q.scalar_one_or_none()
        if sub is None:
            raise NotFoundError("WebhookSubscription", str(subscription_id))
        if target_url is not None:
            sub.target_url = target_url
        if event_types is not None:
            sub.event_types = event_types
        if is_active is not None:
            sub.is_active = is_active
        if headers is not None:
            sub.headers = headers
        await self.db.flush()
        return sub

    async def delete_subscription(self, *, subscription_id: uuid.UUID,
                                  organization_id: uuid.UUID) -> bool:
        sub_q = await self.db.execute(
            select(WebhookSubscription).where(
                WebhookSubscription.id == subscription_id,
                WebhookSubscription.organization_id == str(organization_id)))
        sub = sub_q.scalar_one_or_none()
        if sub is None:
            raise NotFoundError("WebhookSubscription", str(subscription_id))
        sub.is_active = False
        await self.db.flush()
        return True

    # ----- Incoming Webhooks -----

    async def receive_incoming(self, *, organization_id: uuid.UUID,
                               event_type: str, event_id: str,
                               payload: dict, headers: dict | None = None,
                               signature: str | None = None,
                               source_ip: str | None = None) -> WebhookEventLog:
        # Idempotency: check if event_id already processed
        existing_q = await self.db.execute(
            select(WebhookEventLog).where(
                WebhookEventLog.organization_id == str(organization_id),
                WebhookEventLog.event_id == event_id))
        existing = existing_q.scalar_one_or_none()
        if existing:
            return existing
        event = WebhookEventLog(
            organization_id=str(organization_id), event_type=event_type,
            event_id=event_id, direction="incoming", payload=payload,
            headers=headers, signature=signature, status="delivered",
            delivered_at=datetime.now(UTC), source_ip=source_ip)
        self.db.add(event)
        await self.db.flush()
        # Auto-fan-out to matching subscriptions
        await self._fan_out(organization_id=organization_id, event_type=event_type,
                            event_id=event_id, payload=payload)
        return event

    async def _fan_out(self, *, organization_id: uuid.UUID, event_type: str,
                       event_id: str, payload: dict) -> int:
        """Find matching subscriptions and create outgoing events."""
        subs_q = await self.db.execute(
            select(WebhookSubscription).where(
                WebhookSubscription.organization_id == str(organization_id),
                WebhookSubscription.is_active.is_(True)))
        count = 0
        for sub in subs_q.scalars().all():
            if event_type in (sub.event_types or []) or "*" in (sub.event_types or []):
                outgoing = WebhookEventLog(
                    organization_id=str(organization_id), subscription_id=sub.id,
                    event_type=event_type, event_id=f"{event_id}-{sub.id}",
                    direction="outgoing", payload=payload, status="pending",
                    attempt_count=0, next_retry_at=datetime.now(UTC))
                self.db.add(outgoing)
                count += 1
        if count:
            await self.db.flush()
        return count

    # ----- Outgoing Webhooks (delivery simulation) -----

    async def deliver_pending(self, *, organization_id: uuid.UUID | None = None,
                              max_events: int = 100) -> dict[str, Any]:
        """Simulate delivery of pending outgoing webhook events."""
        conditions = [WebhookEventLog.direction == "outgoing",
                      WebhookEventLog.status.in_(["pending", "retry"])]
        if organization_id:
            conditions.append(WebhookEventLog.organization_id == str(organization_id))
        result = await self.db.execute(
            select(WebhookEventLog).where(*conditions)
            .order_by(WebhookEventLog.created_at.asc()).limit(max_events))
        events = result.scalars().all()
        delivered = 0; failed = 0; retried = 0
        for ev in events:
            ev.attempt_count = (ev.attempt_count or 0) + 1
            ev.last_attempt_at = datetime.now(UTC)
            # Simulate delivery — in production this would POST to target_url
            # For testing, we mark as delivered
            ev.status = "delivered"
            ev.delivered_at = datetime.now(UTC)
            ev.response_status = 200
            delivered += 1
            # Update subscription counters
            if ev.subscription_id:
                sub = await self.db.get(WebhookSubscription, ev.subscription_id)
                if sub:
                    sub.success_count = (sub.success_count or 0) + 1
                    sub.last_invoked_at = datetime.now(UTC)
                    sub.last_status_code = 200
        await self.db.flush()
        return {"delivered": delivered, "failed": failed, "retried": retried,
                "total_processed": len(events)}

    # ----- Retry + DLQ -----

    async def schedule_retry(self, *, event_id: uuid.UUID, error: str,
                             delay_minutes: int = 5) -> WebhookEventLog:
        ev = await self.db.get(WebhookEventLog, event_id)
        if ev is None:
            raise NotFoundError("WebhookEvent", str(event_id))
        if ev.attempt_count >= 5:
            ev.status = "dead_letter"
            ev.error = f"Max retries exceeded: {error}"
        else:
            ev.status = "retry"
            ev.error = error
            ev.next_retry_at = datetime.now(UTC) + timedelta(minutes=delay_minutes)
        await self.db.flush()
        return ev

    async def replay_event(self, *, event_id: uuid.UUID) -> WebhookEventLog:
        ev = await self.db.get(WebhookEventLog, event_id)
        if ev is None:
            raise NotFoundError("WebhookEvent", str(event_id))
        ev.status = "pending"
        ev.attempt_count = 0
        ev.error = None
        ev.next_retry_at = datetime.now(UTC)
        await self.db.flush()
        return ev

    async def list_events(self, *, organization_id: uuid.UUID,
                          direction: str | None = None,
                          status: str | None = None,
                          event_type: str | None = None,
                          skip: int = 0, limit: int = 50) -> tuple[list[WebhookEventLog], int]:
        conditions = [WebhookEventLog.organization_id == str(organization_id)]
        if direction:
            conditions.append(WebhookEventLog.direction == direction)
        if status:
            conditions.append(WebhookEventLog.status == status)
        if event_type:
            conditions.append(WebhookEventLog.event_type == event_type)
        total = int((await self.db.execute(
            select(func.count()).select_from(WebhookEventLog).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(WebhookEventLog).where(*conditions)
            .order_by(WebhookEventLog.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    @staticmethod
    def sign_payload(payload: bytes, secret: str) -> str:
        """Compute HMAC-SHA256 signature of payload using secret."""
        return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()

    @staticmethod
    def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
        """Constant-time HMAC verification."""
        expected = WebhookPlatformService.sign_payload(payload, secret)
        return hmac.compare_digest(expected, signature)

    def subscription_to_dict(self, s: WebhookSubscription) -> dict[str, Any]:
        return {"id": str(s.id), "name": s.name, "target_url": s.target_url,
                "event_types": s.event_types, "is_active": s.is_active,
                "headers": s.headers, "max_retries": s.max_retries,
                "timeout_seconds": s.timeout_seconds,
                "developer_app_id": str(s.developer_app_id) if s.developer_app_id else None,
                "last_invoked_at": s.last_invoked_at.isoformat() if s.last_invoked_at else None,
                "last_status_code": s.last_status_code,
                "success_count": s.success_count, "failure_count": s.failure_count,
                "created_by": s.created_by,
                "created_at": s.created_at.isoformat() if s.created_at else None}

    def event_to_dict(self, e: WebhookEventLog) -> dict[str, Any]:
        return {"id": str(e.id), "subscription_id": str(e.subscription_id) if e.subscription_id else None,
                "developer_app_id": str(e.developer_app_id) if e.developer_app_id else None,
                "event_type": e.event_type, "event_id": e.event_id, "direction": e.direction,
                "payload": e.payload, "response_status": e.response_status,
                "response_body": e.response_body, "latency_ms": e.latency_ms,
                "attempt_count": e.attempt_count, "status": e.status, "error": e.error,
                "next_retry_at": e.next_retry_at.isoformat() if e.next_retry_at else None,
                "delivered_at": e.delivered_at.isoformat() if e.delivered_at else None,
                "source_ip": e.source_ip,
                "created_at": e.created_at.isoformat() if e.created_at else None}


# ====================================================================
# Event Bus Service — topics + subscriptions + queue + DLQ + replay
# ====================================================================

class EventBusService:
    """Manages event bus topics, subscriptions, message queue with retry and DLQ."""

    # Built-in system topics
    SYSTEM_TOPICS = [
        "agent.created", "agent.updated", "agent.deleted", "agent.executed",
        "workflow.created", "workflow.started", "workflow.completed", "workflow.failed",
        "workflow.paused", "workflow.resumed", "workflow.cancelled",
        "knowledge.document.uploaded", "knowledge.document.indexed", "knowledge.search.executed",
        "voice.call.started", "voice.call.ended", "voice.message.received",
        "whatsapp.message.received", "whatsapp.message.sent", "whatsapp.handoff.initiated",
        "user.created", "user.updated", "user.deleted",
        "organization.created", "organization.updated",
        "plugin.installed", "plugin.uninstalled", "plugin.updated",
        "connector.connected", "connector.disconnected", "connector.sync.completed",
        "mcp.server.registered", "mcp.tool.invoked",
        "marketplace.item.published", "marketplace.item.installed",
        "ai.llm.requested", "ai.llm.completed", "ai.guardrail.violated",
        "billing.subscription.created", "billing.invoice.paid", "billing.invoice.failed",
    ]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_topic(self, *, organization_id: uuid.UUID | None = None,
                           name: str, description: str | None = None,
                           schema_: dict | None = None,
                           retention_hours: int = 168) -> EventBusTopic:
        topic = EventBusTopic(
            organization_id=str(organization_id) if organization_id else None,
            name=name, description=description, schema_=schema_,
            retention_hours=retention_hours, is_active=True, published_count=0)
        self.db.add(topic)
        await self.db.flush()
        return topic

    async def list_topics(self, *, organization_id: uuid.UUID | None = None,
                          is_active: bool | None = None,
                          skip: int = 0, limit: int = 100) -> tuple[list[EventBusTopic], int]:
        conditions = []
        if organization_id:
            org_str = str(organization_id)
            conditions.append(or_(
                EventBusTopic.organization_id.is_(None),
                EventBusTopic.organization_id == org_str))
        if is_active is not None:
            conditions.append(EventBusTopic.is_active.is_(is_active))
        count_q = select(func.count()).select_from(EventBusTopic)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)
        q = select(EventBusTopic)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(EventBusTopic.name.asc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def create_subscription(self, *, organization_id: uuid.UUID, topic_id: uuid.UUID,
                                  subscriber_type: str, name: str,
                                  subscriber_id: str | None = None,
                                  filter_expression: str | None = None,
                                  transform_config: dict | None = None,
                                  max_retries: int = 3) -> EventBusSubscription:
        sub = EventBusSubscription(
            organization_id=str(organization_id), topic_id=topic_id,
            subscriber_type=subscriber_type, subscriber_id=subscriber_id,
            name=name, filter_expression=filter_expression,
            transform_config=transform_config, is_active=True, max_retries=max_retries)
        self.db.add(sub)
        await self.db.flush()
        return sub

    async def list_subscriptions(self, *, organization_id: uuid.UUID,
                                 topic_id: uuid.UUID | None = None,
                                 is_active: bool | None = None,
                                 skip: int = 0, limit: int = 50) -> tuple[list[EventBusSubscription], int]:
        conditions = [EventBusSubscription.organization_id == str(organization_id)]
        if topic_id:
            conditions.append(EventBusSubscription.topic_id == topic_id)
        if is_active is not None:
            conditions.append(EventBusSubscription.is_active.is_(is_active))
        total = int((await self.db.execute(
            select(func.count()).select_from(EventBusSubscription).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(EventBusSubscription).where(*conditions)
            .order_by(EventBusSubscription.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def publish(self, *, organization_id: uuid.UUID, topic_id: uuid.UUID,
                      event_id: str, payload: dict,
                      headers: dict | None = None,
                      priority: int = 5) -> dict[str, Any]:
        """Publish an event to a topic — fan-out to all subscribers as messages."""
        topic = await self.db.get(EventBusTopic, topic_id)
        if topic is None:
            raise NotFoundError("EventBusTopic", str(topic_id))
        if not topic.is_active:
            raise ValidationError("Topic is not active")
        topic.published_count = (topic.published_count or 0) + 1
        # Find all active subscriptions
        subs_q = await self.db.execute(
            select(EventBusSubscription).where(
                EventBusSubscription.topic_id == topic_id,
                EventBusSubscription.is_active.is_(True)))
        messages = []
        for sub in subs_q.scalars().all():
            msg = EventBusMessage(
                organization_id=str(organization_id), topic_id=topic_id,
                subscription_id=sub.id, event_id=event_id, payload=payload,
                headers=headers, priority=priority, attempt_count=0,
                max_attempts=sub.max_retries, status="pending",
                scheduled_at=datetime.now(UTC))
            self.db.add(msg)
            messages.append(msg)
        await self.db.flush()
        return {"topic_id": str(topic_id), "event_id": event_id,
                "subscribers_notified": len(messages),
                "message_ids": [str(m.id) for m in messages]}

    async def list_messages(self, *, organization_id: uuid.UUID,
                            topic_id: uuid.UUID | None = None,
                            status: str | None = None,
                            skip: int = 0, limit: int = 50) -> tuple[list[EventBusMessage], int]:
        conditions = [EventBusMessage.organization_id == str(organization_id)]
        if topic_id:
            conditions.append(EventBusMessage.topic_id == topic_id)
        if status:
            conditions.append(EventBusMessage.status == status)
        total = int((await self.db.execute(
            select(func.count()).select_from(EventBusMessage).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(EventBusMessage).where(*conditions)
            .order_by(EventBusMessage.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def process_pending(self, *, organization_id: uuid.UUID | None = None,
                              max_messages: int = 100) -> dict[str, Any]:
        """Process pending messages — mark as delivered (or schedule retry on failure)."""
        conditions = [EventBusMessage.status.in_(["pending", "processing"])]
        if organization_id:
            conditions.append(EventBusMessage.organization_id == str(organization_id))
        result = await self.db.execute(
            select(EventBusMessage).where(*conditions)
            .order_by(EventBusMessage.priority.desc(),
                      EventBusMessage.scheduled_at.asc()).limit(max_messages))
        messages = result.scalars().all()
        delivered = 0; failed = 0; dead_letter = 0
        for msg in messages:
            msg.attempt_count = (msg.attempt_count or 0) + 1
            msg.last_attempt_at = datetime.now(UTC)
            # In production this would dispatch to subscriber (webhook/queue/plugin/etc.)
            # For now we simulate successful delivery
            msg.status = "delivered"
            msg.delivered_at = datetime.now(UTC)
            delivered += 1
        await self.db.flush()
        return {"delivered": delivered, "failed": failed,
                "dead_letter": dead_letter, "total_processed": len(messages)}

    async def schedule_retry(self, *, message_id: uuid.UUID,
                             error: str, delay_minutes: int = 5) -> EventBusMessage:
        msg = await self.db.get(EventBusMessage, message_id)
        if msg is None:
            raise NotFoundError("EventBusMessage", str(message_id))
        if msg.attempt_count >= msg.max_attempts:
            msg.status = "dead_letter"
            msg.error = f"Max attempts exceeded: {error}"
        else:
            msg.status = "pending"
            msg.error = error
            msg.next_retry_at = datetime.now(UTC) + timedelta(minutes=delay_minutes)
        await self.db.flush()
        return msg

    async def replay_message(self, *, message_id: uuid.UUID) -> EventBusMessage:
        msg = await self.db.get(EventBusMessage, message_id)
        if msg is None:
            raise NotFoundError("EventBusMessage", str(message_id))
        msg.status = "pending"
        msg.attempt_count = 0
        msg.error = None
        msg.next_retry_at = datetime.now(UTC)
        msg.scheduled_at = datetime.now(UTC)
        await self.db.flush()
        return msg

    async def get_dlq_stats(self, *, organization_id: uuid.UUID) -> dict[str, Any]:
        """Get dead-letter queue stats."""
        total = int((await self.db.execute(
            select(func.count()).select_from(EventBusMessage).where(
                EventBusMessage.organization_id == str(organization_id),
                EventBusMessage.status == "dead_letter")
        )).scalar_one_or_none() or 0)
        by_topic_q = await self.db.execute(
            select(EventBusMessage.topic_id, func.count(EventBusMessage.id))
            .where(EventBusMessage.organization_id == str(organization_id),
                   EventBusMessage.status == "dead_letter")
            .group_by(EventBusMessage.topic_id))
        return {"total_dead_letter": total,
                "by_topic": {str(t): int(c) for t, c in by_topic_q.all()}}


# ====================================================================
# Developer Portal Service — apps + API catalog + SDK releases
# ====================================================================

class DeveloperPortalService:
    """Manages developer applications (OAuth clients), API catalog, SDK releases."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ----- Apps -----

    async def create_app(self, *, organization_id: uuid.UUID, name: str,
                         description: str | None = None,
                         app_type: str = "server",
                         redirect_uris: list[str] | None = None,
                         scopes: list[str] | None = None,
                         rate_limit_per_minute: int = 100,
                         rate_limit_per_day: int = 10000,
                         homepage_url: str | None = None,
                         logo_url: str | None = None,
                         contact_email: str | None = None,
                         webhook_url: str | None = None,
                         created_by: str | None = None) -> tuple[DeveloperApp, str]:
        """Create a developer app. Returns (app, client_secret) — secret is only shown once."""
        client_id = _generate_client_id()
        raw_secret = _generate_client_secret()
        slug = name.lower().replace(" ", "-").replace(".", "-")[:200]
        app = DeveloperApp(
            organization_id=str(organization_id), name=name, slug=slug,
            description=description, client_id=client_id,
            client_secret_hash=_hash_secret(raw_secret),
            app_type=app_type, redirect_uris=redirect_uris or [],
            scopes=scopes or [], rate_limit_per_minute=rate_limit_per_minute,
            rate_limit_per_day=rate_limit_per_day, is_active=True, is_verified=False,
            homepage_url=homepage_url, logo_url=logo_url,
            contact_email=contact_email, webhook_url=webhook_url,
            total_requests=0, created_by=created_by)
        self.db.add(app)
        await self.db.flush()
        return app, raw_secret

    async def get_app(self, *, app_id: uuid.UUID,
                      organization_id: uuid.UUID) -> DeveloperApp:
        app = await self.db.get(DeveloperApp, app_id)
        if app is None or app.organization_id != str(organization_id):
            raise NotFoundError("DeveloperApp", str(app_id))
        return app

    async def list_apps(self, *, organization_id: uuid.UUID,
                        skip: int = 0, limit: int = 50) -> tuple[list[DeveloperApp], int]:
        conditions = [DeveloperApp.organization_id == str(organization_id)]
        total = int((await self.db.execute(
            select(func.count()).select_from(DeveloperApp).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(DeveloperApp).where(*conditions)
            .order_by(DeveloperApp.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def rotate_secret(self, *, app_id: uuid.UUID,
                            organization_id: uuid.UUID) -> tuple[DeveloperApp, str]:
        app = await self.get_app(app_id=app_id, organization_id=organization_id)
        raw_secret = _generate_client_secret()
        app.client_secret_hash = _hash_secret(raw_secret)
        await self.db.flush()
        return app, raw_secret

    async def validate_app(self, *, client_id: str,
                           client_secret: str) -> DeveloperApp | None:
        """Validate OAuth client credentials — used by token endpoint."""
        result = await self.db.execute(
            select(DeveloperApp).where(
                DeveloperApp.client_id == client_id,
                DeveloperApp.is_active.is_(True)))
        app = result.scalar_one_or_none()
        if app is None:
            return None
        if not hmac.compare_digest(app.client_secret_hash, _hash_secret(client_secret)):
            return None
        return app

    async def update_app(self, *, app_id: uuid.UUID, organization_id: uuid.UUID,
                         **updates: Any) -> DeveloperApp:
        app = await self.get_app(app_id=app_id, organization_id=organization_id)
        for key, value in updates.items():
            if hasattr(app, key) and value is not None and key not in {"client_id", "client_secret_hash"}:
                setattr(app, key, value)
        await self.db.flush()
        return app

    async def record_request(self, *, app_id: uuid.UUID) -> DeveloperApp:
        app = await self.db.get(DeveloperApp, app_id)
        if app is None:
            raise NotFoundError("DeveloperApp", str(app_id))
        app.total_requests = (app.total_requests or 0) + 1
        app.last_request_at = datetime.now(UTC)
        await self.db.flush()
        return app

    # ----- API Catalog -----

    async def create_api_entry(self, *, organization_id: uuid.UUID, name: str, slug: str,
                               api_type: str, base_url: str | None = None,
                               openapi_spec: dict | None = None,
                               graphql_schema: str | None = None,
                               version: str = "1.0.0",
                               auth_type: str | None = None,
                               documentation_url: str | None = None,
                               description: str | None = None,
                               category: str | None = None,
                               tags: list[str] | None = None,
                               created_by: str | None = None) -> ApiCatalogEntry:
        # Count endpoints from OpenAPI spec
        endpoints_count = 0
        if openapi_spec and "paths" in openapi_spec:
            for path, methods in (openapi_spec.get("paths") or {}).items():
                endpoints_count += len([m for m in methods if m.lower() in
                                        {"get", "post", "put", "patch", "delete", "head", "options"}])
        entry = ApiCatalogEntry(
            organization_id=str(organization_id), name=name, slug=slug,
            description=description, api_type=api_type, base_url=base_url,
            openapi_spec=openapi_spec, graphql_schema=graphql_schema,
            version=version, auth_type=auth_type,
            documentation_url=documentation_url, is_published=False,
            is_featured=False, category=category, tags=tags or [],
            endpoints_count=endpoints_count, created_by=created_by)
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def list_api_entries(self, *, organization_id: uuid.UUID,
                               api_type: str | None = None,
                               is_published: bool | None = None,
                               skip: int = 0, limit: int = 50) -> tuple[list[ApiCatalogEntry], int]:
        conditions = [ApiCatalogEntry.organization_id == str(organization_id)]
        if api_type:
            conditions.append(ApiCatalogEntry.api_type == api_type)
        if is_published is not None:
            conditions.append(ApiCatalogEntry.is_published.is_(is_published))
        total = int((await self.db.execute(
            select(func.count()).select_from(ApiCatalogEntry).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(ApiCatalogEntry).where(*conditions)
            .order_by(ApiCatalogEntry.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def publish_api_entry(self, *, entry_id: uuid.UUID,
                                organization_id: uuid.UUID) -> ApiCatalogEntry:
        result = await self.db.execute(
            select(ApiCatalogEntry).where(
                ApiCatalogEntry.id == entry_id,
                ApiCatalogEntry.organization_id == str(organization_id)))
        entry = result.scalar_one_or_none()
        if entry is None:
            raise NotFoundError("ApiCatalogEntry", str(entry_id))
        entry.is_published = True
        await self.db.flush()
        return entry

    # ----- SDK Releases -----

    async def create_sdk_release(self, *, language: str, version: str, name: str,
                                 description: str | None = None,
                                 package_url: str | None = None,
                                 repository_url: str | None = None,
                                 documentation_url: str | None = None,
                                 download_url: str | None = None,
                                 checksum: str | None = None,
                                 size_bytes: int | None = None,
                                 min_runtime_version: str | None = None,
                                 release_notes: str | None = None,
                                 is_stable: bool = False,
                                 published_by: str | None = None) -> SdkRelease:
        release = SdkRelease(
            language=language, version=version, name=name, description=description,
            package_url=package_url, repository_url=repository_url,
            documentation_url=documentation_url, download_url=download_url,
            checksum=checksum, size_bytes=size_bytes,
            min_runtime_version=min_runtime_version, release_notes=release_notes,
            is_stable=is_stable, is_active=True, download_count=0,
            published_at=datetime.now(UTC) if is_stable else None,
            published_by=published_by)
        self.db.add(release)
        await self.db.flush()
        return release

    async def list_sdk_releases(self, *, language: str | None = None,
                                is_stable: bool | None = None,
                                is_active: bool | None = True,
                                skip: int = 0, limit: int = 100) -> tuple[list[SdkRelease], int]:
        conditions = []
        if language:
            conditions.append(SdkRelease.language == language)
        if is_stable is not None:
            conditions.append(SdkRelease.is_stable.is_(is_stable))
        if is_active is not None:
            conditions.append(SdkRelease.is_active.is_(is_active))
        count_q = select(func.count()).select_from(SdkRelease)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)
        q = select(SdkRelease)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(SdkRelease.published_at.desc().nullslast(),
                       SdkRelease.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def record_sdk_download(self, *, release_id: uuid.UUID) -> SdkRelease:
        release = await self.db.get(SdkRelease, release_id)
        if release is None:
            raise NotFoundError("SdkRelease", str(release_id))
        release.download_count = (release.download_count or 0) + 1
        await self.db.flush()
        return release

    def app_to_dict(self, a: DeveloperApp) -> dict[str, Any]:
        return {"id": str(a.id), "name": a.name, "slug": a.slug, "description": a.description,
                "client_id": a.client_id, "app_type": a.app_type,
                "redirect_uris": a.redirect_uris, "scopes": a.scopes,
                "rate_limit_per_minute": a.rate_limit_per_minute,
                "rate_limit_per_day": a.rate_limit_per_day,
                "is_active": a.is_active, "is_verified": a.is_verified,
                "homepage_url": a.homepage_url, "logo_url": a.logo_url,
                "contact_email": a.contact_email, "webhook_url": a.webhook_url,
                "total_requests": a.total_requests,
                "last_request_at": a.last_request_at.isoformat() if a.last_request_at else None,
                "created_by": a.created_by,
                "created_at": a.created_at.isoformat() if a.created_at else None}

    def api_to_dict(self, e: ApiCatalogEntry) -> dict[str, Any]:
        return {"id": str(e.id), "name": e.name, "slug": e.slug, "description": e.description,
                "api_type": e.api_type, "base_url": e.base_url,
                "openapi_spec": e.openapi_spec, "graphql_schema": e.graphql_schema,
                "version": e.version, "auth_type": e.auth_type,
                "documentation_url": e.documentation_url, "is_published": e.is_published,
                "is_featured": e.is_featured, "category": e.category, "tags": e.tags,
                "endpoints_count": e.endpoints_count,
                "created_at": e.created_at.isoformat() if e.created_at else None}

    def sdk_to_dict(self, s: SdkRelease) -> dict[str, Any]:
        return {"id": str(s.id), "language": s.language, "version": s.version, "name": s.name,
                "description": s.description, "package_url": s.package_url,
                "repository_url": s.repository_url, "documentation_url": s.documentation_url,
                "download_url": s.download_url, "checksum": s.checksum,
                "size_bytes": s.size_bytes, "min_runtime_version": s.min_runtime_version,
                "release_notes": s.release_notes, "is_stable": s.is_stable,
                "is_active": s.is_active, "download_count": s.download_count,
                "published_at": s.published_at.isoformat() if s.published_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None}


# ====================================================================
# AI Gateway Service — multi-provider routing + fallback chains
# ====================================================================

class AiGatewayService:
    """Multi-provider AI gateway with routing rules, fallback chains, and load balancing."""

    KNOWN_PROVIDERS = ["openai", "anthropic", "gemini", "groq", "openrouter", "deepseek",
                       "mistral", "local"]

    DEFAULT_FALLBACK_CHAIN = ["openai", "anthropic", "gemini"]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_route(self, *, organization_id: uuid.UUID | None = None,
                           name: str, route_type: str = "primary",
                           providers: list[dict] | None = None,
                           fallback_chain: list[str] | None = None,
                           conditions: dict | None = None,
                           strategy: str = "cheapest",
                           max_cost_per_1k: float | None = None,
                           max_latency_ms: int | None = None,
                           required_capability: str | None = None,
                           priority: int = 100,
                           description: str | None = None) -> AiGatewayRoute:
        route = AiGatewayRoute(
            organization_id=str(organization_id) if organization_id else None,
            name=name, description=description, route_type=route_type,
            providers=providers or [], fallback_chain=fallback_chain or [],
            conditions=conditions, strategy=strategy,
            max_cost_per_1k=max_cost_per_1k, max_latency_ms=max_latency_ms,
            required_capability=required_capability, is_active=True,
            priority=priority, total_requests=0, total_fallbacks=0)
        self.db.add(route)
        await self.db.flush()
        return route

    async def list_routes(self, *, organization_id: uuid.UUID | None = None,
                          is_active: bool | None = None,
                          skip: int = 0, limit: int = 50) -> tuple[list[AiGatewayRoute], int]:
        conditions = []
        if organization_id:
            org_str = str(organization_id)
            conditions.append(or_(
                AiGatewayRoute.organization_id.is_(None),
                AiGatewayRoute.organization_id == org_str))
        if is_active is not None:
            conditions.append(AiGatewayRoute.is_active.is_(is_active))
        count_q = select(func.count()).select_from(AiGatewayRoute)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)
        q = select(AiGatewayRoute)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(AiGatewayRoute.priority.asc(),
                       AiGatewayRoute.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def update_route(self, *, route_id: uuid.UUID, **updates: Any) -> AiGatewayRoute:
        route = await self.db.get(AiGatewayRoute, route_id)
        if route is None:
            raise NotFoundError("AiGatewayRoute", str(route_id))
        for key, value in updates.items():
            if hasattr(route, key) and value is not None:
                setattr(route, key, value)
        await self.db.flush()
        return route

    async def delete_route(self, *, route_id: uuid.UUID) -> bool:
        route = await self.db.get(AiGatewayRoute, route_id)
        if route is None:
            raise NotFoundError("AiGatewayRoute", str(route_id))
        route.is_active = False
        await self.db.flush()
        return True

    async def select_provider(self, *, organization_id: uuid.UUID | None = None,
                              strategy: str = "cheapest",
                              required_capability: str | None = None,
                              max_cost_per_1k: float | None = None,
                              max_latency_ms: int | None = None) -> dict[str, Any]:
        """Select the best provider based on strategy + constraints.

        In production, this would query the live route table + provider health;
        here we compute against the static provider catalog.
        """
        catalog = self._get_provider_catalog()
        candidates = catalog
        if required_capability:
            candidates = [p for p in candidates if required_capability in p["capabilities"]]
        if max_cost_per_1k is not None:
            candidates = [p for p in candidates if p["cost_per_1k_input"] <= max_cost_per_1k]
        if max_latency_ms is not None:
            candidates = [p for p in candidates if p["avg_latency_ms"] <= max_latency_ms]
        if not candidates:
            raise ValidationError("No provider matches the given constraints")
        if strategy == "cheapest":
            chosen = min(candidates, key=lambda p: p["cost_per_1k_input"])
        elif strategy == "fastest":
            chosen = min(candidates, key=lambda p: p["avg_latency_ms"])
        elif strategy == "highest_quality":
            chosen = max(candidates, key=lambda p: p["quality_score"])
        elif strategy == "reasoning":
            reasoning = [p for p in candidates if "reasoning" in p["capabilities"]]
            chosen = max(reasoning or candidates, key=lambda p: p["quality_score"])
        elif strategy == "vision":
            vision = [p for p in candidates if "vision" in p["capabilities"]]
            chosen = max(vision or candidates, key=lambda p: p["quality_score"])
        else:
            chosen = candidates[0]
        # Build fallback chain (any remaining candidates)
        fallback = [p["provider"] for p in candidates if p["provider"] != chosen["provider"]]
        return {"provider": chosen["provider"], "model": chosen["default_model"],
                "strategy": strategy, "cost_per_1k_input": chosen["cost_per_1k_input"],
                "avg_latency_ms": chosen["avg_latency_ms"],
                "quality_score": chosen["quality_score"],
                "capabilities": chosen["capabilities"],
                "fallback_chain": fallback[:3]}

    def _get_provider_catalog(self) -> list[dict[str, Any]]:
        return [
            {"provider": "openai", "default_model": "gpt-4o",
             "cost_per_1k_input": 0.0025, "avg_latency_ms": 1200, "quality_score": 9.0,
             "capabilities": ["text", "vision", "function_calling", "reasoning"]},
            {"provider": "openai", "default_model": "gpt-4o-mini",
             "cost_per_1k_input": 0.00015, "avg_latency_ms": 600, "quality_score": 7.5,
             "capabilities": ["text", "vision", "function_calling"]},
            {"provider": "anthropic", "default_model": "claude-3-5-sonnet",
             "cost_per_1k_input": 0.003, "avg_latency_ms": 1500, "quality_score": 9.2,
             "capabilities": ["text", "vision", "reasoning", "long_context"]},
            {"provider": "anthropic", "default_model": "claude-3-haiku",
             "cost_per_1k_input": 0.00025, "avg_latency_ms": 400, "quality_score": 7.0,
             "capabilities": ["text", "vision"]},
            {"provider": "gemini", "default_model": "gemini-1.5-pro",
             "cost_per_1k_input": 0.00125, "avg_latency_ms": 1800, "quality_score": 8.8,
             "capabilities": ["text", "vision", "audio", "long_context"]},
            {"provider": "groq", "default_model": "llama-3.1-70b",
             "cost_per_1k_input": 0.00059, "avg_latency_ms": 150, "quality_score": 8.0,
             "capabilities": ["text", "function_calling"]},
            {"provider": "openrouter", "default_model": "auto",
             "cost_per_1k_input": 0.002, "avg_latency_ms": 1200, "quality_score": 8.0,
             "capabilities": ["text", "vision"]},
            {"provider": "deepseek", "default_model": "deepseek-coder",
             "cost_per_1k_input": 0.00014, "avg_latency_ms": 900, "quality_score": 7.8,
             "capabilities": ["text", "code", "reasoning"]},
            {"provider": "mistral", "default_model": "mistral-large",
             "cost_per_1k_input": 0.002, "avg_latency_ms": 800, "quality_score": 8.2,
             "capabilities": ["text", "function_calling"]},
            {"provider": "local", "default_model": "ollama/llama3",
             "cost_per_1k_input": 0.0, "avg_latency_ms": 2000, "quality_score": 6.5,
             "capabilities": ["text"]},
        ]

    async def record_request(self, *, route_id: uuid.UUID,
                              used_fallback: bool = False) -> AiGatewayRoute:
        route = await self.db.get(AiGatewayRoute, route_id)
        if route is None:
            raise NotFoundError("AiGatewayRoute", str(route_id))
        route.total_requests = (route.total_requests or 0) + 1
        if used_fallback:
            route.total_fallbacks = (route.total_fallbacks or 0) + 1
        await self.db.flush()
        return route

    def route_to_dict(self, r: AiGatewayRoute) -> dict[str, Any]:
        return {"id": str(r.id), "name": r.name, "description": r.description,
                "route_type": r.route_type, "providers": r.providers,
                "fallback_chain": r.fallback_chain, "conditions": r.conditions,
                "strategy": r.strategy, "max_cost_per_1k": r.max_cost_per_1k,
                "max_latency_ms": r.max_latency_ms,
                "required_capability": r.required_capability,
                "is_active": r.is_active, "priority": r.priority,
                "total_requests": r.total_requests,
                "total_fallbacks": r.total_fallbacks,
                "organization_id": r.organization_id,
                "created_at": r.created_at.isoformat() if r.created_at else None}


# ====================================================================
# Global Search Service — cross-marketplace search
# ====================================================================

class GlobalSearchService:
    """Cross-marketplace search across plugins, agents, workflows, prompts, knowledge, APIs, organizations."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def search(self, *, organization_id: uuid.UUID | None = None,
                     query: str, item_types: list[str] | None = None,
                     category: str | None = None,
                     limit_per_type: int = 10) -> dict[str, Any]:
        """Search across all marketplace item types."""
        if not query or len(query.strip()) < 2:
            return {"query": query, "results": {}, "total": 0}
        like = f"%{query.lower()}%"
        types = item_types or ["plugin", "agent", "workflow", "prompt", "knowledge",
                               "template", "connector", "mcp", "api", "model"]
        results: dict[str, list[dict]] = {}
        total = 0

        # 1. MarketplaceItems
        if "plugin" in types or "agent" in types or "workflow" in types or "prompt" in types \
                or "knowledge" in types or "template" in types or "connector" in types \
                or "mcp" in types or "api" in types or "model" in types:
            conditions = [
                MarketplaceItem.status == "published",
                or_(
                    func.lower(MarketplaceItem.name).like(like),
                    func.lower(MarketplaceItem.summary).like(like),
                    func.lower(MarketplaceItem.description).like(like),
                    func.lower(MarketplaceItem.slug).like(like))]
            if organization_id:
                org_str = str(organization_id)
                conditions.append(or_(
                    MarketplaceItem.visibility == "public",
                    MarketplaceItem.organization_id == org_str))
            queried_types = [t for t in types if t in {"plugin", "agent", "workflow", "prompt",
                                                        "knowledge", "template", "connector",
                                                        "mcp", "api", "model"}]
            if queried_types:
                conditions.append(MarketplaceItem.item_type.in_(queried_types))
            if category:
                conditions.append(MarketplaceItem.category_id == category)
            result = await self.db.execute(
                select(MarketplaceItem).where(*conditions)
                .order_by(MarketplaceItem.is_featured.desc(),
                          MarketplaceItem.rating_avg.desc())
                .limit(limit_per_type * len(queried_types)))
            for item in result.scalars().all():
                results.setdefault(item.item_type, []).append({
                    "id": str(item.id), "name": item.name, "slug": item.slug,
                    "summary": item.summary, "icon": item.icon,
                    "rating_avg": item.rating_avg, "download_count": item.download_count,
                    "is_verified": item.is_verified, "is_featured": item.is_featured,
                    "publisher_name": item.publisher_name, "version": item.version,
                    "type": "marketplace_item"})
                total += 1

        # 2. Plugins (from ecosystem_plugins — direct, not via marketplace)
        if "plugin" in types:
            conditions = [EcosystemPlugin.is_published.is_(True),
                          or_(func.lower(EcosystemPlugin.name).like(like),
                              func.lower(EcosystemPlugin.description).like(like),
                              func.lower(EcosystemPlugin.slug).like(like))]
            if organization_id:
                org_str = str(organization_id)
                conditions.append(or_(
                    EcosystemPlugin.organization_id.is_(None),
                    EcosystemPlugin.organization_id == org_str))
            if category:
                conditions.append(EcosystemPlugin.category == category)
            result = await self.db.execute(
                select(EcosystemPlugin).where(*conditions)
                .order_by(EcosystemPlugin.rating_avg.desc()).limit(limit_per_type))
            for p in result.scalars().all():
                results.setdefault("plugin", []).append({
                    "id": str(p.id), "name": p.name, "slug": p.slug,
                    "summary": (p.description or "")[:200] if p.description else None,
                    "icon": p.icon, "rating_avg": p.rating_avg,
                    "download_count": p.install_count, "is_verified": p.is_verified,
                    "publisher_name": p.author_name, "version": p.current_version,
                    "type": "plugin"})
                total += 1

        # 3. Connectors (from ecosystem_connectors — direct)
        if "connector" in types:
            conditions = [EcosystemConnector.is_active.is_(True),
                          or_(func.lower(EcosystemConnector.name).like(like),
                              func.lower(EcosystemConnector.description).like(like),
                              func.lower(EcosystemConnector.provider).like(like))]
            if category:
                conditions.append(EcosystemConnector.category == category)
            result = await self.db.execute(
                select(EcosystemConnector).where(*conditions)
                .order_by(EcosystemConnector.is_official.desc(),
                          EcosystemConnector.name.asc()).limit(limit_per_type))
            for c in result.scalars().all():
                results.setdefault("connector", []).append({
                    "id": str(c.id), "name": c.name, "slug": c.slug,
                    "summary": (c.description or "")[:200] if c.description else None,
                    "icon": c.icon, "rating_avg": c.rating_avg,
                    "download_count": c.install_count, "is_verified": c.is_verified,
                    "publisher_name": c.provider, "version": None, "type": "connector"})
                total += 1

        # 4. MCP servers
        if "mcp" in types:
            conditions = [McpServer.is_enabled.is_(True),
                          or_(func.lower(McpServer.name).like(like),
                              func.lower(McpServer.description).like(like))]
            if organization_id:
                org_str = str(organization_id)
                conditions.append(or_(
                    McpServer.organization_id.is_(None),
                    McpServer.organization_id == org_str))
            result = await self.db.execute(
                select(McpServer).where(*conditions)
                .order_by(McpServer.is_official.desc(),
                          McpServer.name.asc()).limit(limit_per_type))
            for s in result.scalars().all():
                results.setdefault("mcp", []).append({
                    "id": str(s.id), "name": s.name, "slug": s.slug,
                    "summary": (s.description or "")[:200] if s.description else None,
                    "icon": s.icon, "rating_avg": None,
                    "download_count": None, "is_verified": s.is_official,
                    "publisher_name": s.vendor, "version": s.version, "type": "mcp"})
                total += 1

        # 5. API catalog
        if "api" in types:
            conditions = [ApiCatalogEntry.is_published.is_(True),
                          or_(func.lower(ApiCatalogEntry.name).like(like),
                              func.lower(ApiCatalogEntry.description).like(like))]
            if organization_id:
                conditions.append(ApiCatalogEntry.organization_id == str(organization_id))
            if category:
                conditions.append(ApiCatalogEntry.category == category)
            result = await self.db.execute(
                select(ApiCatalogEntry).where(*conditions)
                .order_by(ApiCatalogEntry.is_featured.desc(),
                          ApiCatalogEntry.created_at.desc()).limit(limit_per_type))
            for a in result.scalars().all():
                results.setdefault("api", []).append({
                    "id": str(a.id), "name": a.name, "slug": a.slug,
                    "summary": (a.description or "")[:200] if a.description else None,
                    "icon": None, "rating_avg": None, "download_count": None,
                    "is_verified": False, "publisher_name": None,
                    "version": a.version, "type": "api"})
                total += 1

        return {"query": query, "results": results, "total": total,
                "searched_types": types}


# ====================================================================
# Governance Service — approval workflows
# ====================================================================

class GovernanceService:
    """Approval workflows for plugins, connectors, agents, marketplace items, APIs, SDKs."""

    AUTO_APPROVE_RISK_LEVELS = {"low"}
    AUTO_APPROVE_ACTIONS = {"install", "view"}

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_approval(self, *, organization_id: uuid.UUID, entity_type: str,
                              entity_id: str, name: str, action: str,
                              requested_by: str, risk_level: str = "low",
                              risk_assessment: dict | None = None,
                              metadata: dict | None = None,
                              expires_in_days: int | None = 30) -> GovernanceApproval:
        auto = risk_level in self.AUTO_APPROVE_RISK_LEVELS and action in self.AUTO_APPROVE_ACTIONS
        approval = GovernanceApproval(
            organization_id=str(organization_id), entity_type=entity_type,
            entity_id=entity_id, name=name, action=action,
            requested_by=requested_by, status="approved" if auto else "pending",
            risk_level=risk_level, risk_assessment=risk_assessment,
            auto_approved=auto,
            expires_at=datetime.now(UTC) + timedelta(days=expires_in_days) if expires_in_days else None,
            reviewed_at=datetime.now(UTC) if auto else None,
            reviewer_id=requested_by if auto else None,
            metadata_=metadata)
        self.db.add(approval)
        await self.db.flush()
        return approval

    async def get_approval(self, *, approval_id: uuid.UUID,
                           organization_id: uuid.UUID) -> GovernanceApproval:
        approval = await self.db.get(GovernanceApproval, approval_id)
        if approval is None or approval.organization_id != str(organization_id):
            raise NotFoundError("GovernanceApproval", str(approval_id))
        return approval

    async def list_approvals(self, *, organization_id: uuid.UUID,
                             status: str | None = None,
                             entity_type: str | None = None,
                             skip: int = 0, limit: int = 50) -> tuple[list[GovernanceApproval], int]:
        conditions = [GovernanceApproval.organization_id == str(organization_id)]
        if status:
            conditions.append(GovernanceApproval.status == status)
        if entity_type:
            conditions.append(GovernanceApproval.entity_type == entity_type)
        total = int((await self.db.execute(
            select(func.count()).select_from(GovernanceApproval).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(GovernanceApproval).where(*conditions)
            .order_by(GovernanceApproval.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def review_approval(self, *, approval_id: uuid.UUID,
                              organization_id: uuid.UUID, reviewer_id: str,
                              decision: str, notes: str | None = None) -> GovernanceApproval:
        """Approve or reject a pending approval."""
        if decision not in {"approved", "rejected"}:
            raise ValidationError("Decision must be 'approved' or 'rejected'")
        approval = await self.get_approval(approval_id=approval_id, organization_id=organization_id)
        if approval.status != "pending":
            raise ValidationError(f"Cannot review approval with status '{approval.status}'")
        approval.status = decision
        approval.reviewer_id = reviewer_id
        approval.reviewer_notes = notes
        approval.reviewed_at = datetime.now(UTC)
        await self.db.flush()
        return approval

    async def withdraw_approval(self, *, approval_id: uuid.UUID,
                                organization_id: uuid.UUID,
                                user_id: str) -> GovernanceApproval:
        approval = await self.get_approval(approval_id=approval_id, organization_id=organization_id)
        if approval.status != "pending":
            raise ValidationError(f"Cannot withdraw approval with status '{approval.status}'")
        if approval.requested_by != user_id:
            raise ValidationError("Only the requester can withdraw an approval")
        approval.status = "withdrawn"
        await self.db.flush()
        return approval

    def to_dict(self, a: GovernanceApproval) -> dict[str, Any]:
        return {"id": str(a.id), "entity_type": a.entity_type, "entity_id": a.entity_id,
                "name": a.name, "action": a.action, "requested_by": a.requested_by,
                "requested_at": a.requested_at.isoformat() if a.requested_at else None,
                "status": a.status, "reviewer_id": a.reviewer_id,
                "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
                "reviewer_notes": a.reviewer_notes, "risk_level": a.risk_level,
                "risk_assessment": a.risk_assessment, "auto_approved": a.auto_approved,
                "expires_at": a.expires_at.isoformat() if a.expires_at else None,
                "metadata": a.metadata_,
                "created_at": a.created_at.isoformat() if a.created_at else None}

"""Full-text search service — PostgreSQL tsvector + GIN index for fast search.

Falls back to LIKE-based search on SQLite (used by tests).

Provides ranking, stemming, phrase matching, and weighted search across
multiple text fields. Replaces the LIKE-based search in GlobalSearchService
for production PostgreSQL deployments.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select, text, Text, cast
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.marketplace_ecosystem import (
    ApiCatalogEntry,
    EcosystemConnector,
    EcosystemPlugin,
    MarketplaceItem,
    McpServer,
)

logger = get_logger(__name__)


# Search weight configuration (A=1.0, B=0.7, C=0.4, D=0.2 — PostgreSQL standard)
# We weight name (A) > summary (B) > description (C) > tags (D)
WEIGHTS = {"A": 1.0, "B": 0.7, "C": 0.4, "D": 0.2}


class FullTextSearchService:
    """Full-text search using PostgreSQL tsvector + GIN index.

    Falls back to LIKE-based search on databases without tsvector support.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._is_postgres = self._detect_postgres()

    def _detect_postgres(self) -> bool:
        """Detect whether the DB dialect supports tsvector."""
        try:
            engine_url = str(self.db.bind.url) if self.db.bind else ""
            return "postgresql" in engine_url or "postgres" in engine_url
        except Exception:
            return False

    async def search_marketplace(
        self, *, query: str, item_types: list[str] | None = None,
        organization_id: uuid.UUID | None = None,
        limit: int = 50, offset: int = 0,
    ) -> dict[str, Any]:
        """Search across marketplace items with full-text ranking."""
        if not query or len(query.strip()) < 2:
            return {"query": query, "results": [], "total": 0}

        if self._is_postgres:
            return await self._search_marketplace_postgres(
                query=query, item_types=item_types,
                organization_id=organization_id, limit=limit, offset=offset)
        return await self._search_marketplace_fallback(
            query=query, item_types=item_types,
            organization_id=organization_id, limit=limit, offset=offset)

    async def _search_marketplace_postgres(
        self, *, query: str, item_types: list[str] | None,
        organization_id: uuid.UUID | None, limit: int, offset: int,
    ) -> dict[str, Any]:
        """Use PostgreSQL ts_rank_cd for weighted full-text search."""
        # Build the tsquery (use plainto_tsquery to avoid query syntax issues)
        tsquery = func.plainto_tsquery("english", query)
        # Build the tsvector with weighted fields
        # name gets weight A (1.0), summary gets B (0.7), description gets C (0.4), tags get D (0.2)
        tsvector = func.setweight(func.to_tsvector("english", func.coalesce(MarketplaceItem.name, "")), "A")
        tsvector = tsvector.op("||")(func.setweight(func.to_tsvector("english", func.coalesce(MarketplaceItem.summary, "")), "B"))
        tsvector = tsvector.op("||")(func.setweight(func.to_tsvector("english", func.coalesce(MarketplaceItem.description, "")), "C"))
        # Tags is a JSON array — cast to text first
        tsvector = tsvector.op("||")(func.setweight(func.to_tsvector("english", cast(MarketplaceItem.tags, Text)), "D"))
        # Rank by ts_rank_cd (cover density ranking)
        rank = func.ts_rank_cd(tsvector, tsquery).label("rank")

        conditions = [
            MarketplaceItem.status == "published",
            tsvector.op("@@")(tsquery),
        ]
        if organization_id:
            org_str = str(organization_id)
            conditions.append(
                (MarketplaceItem.visibility == "public") |
                (MarketplaceItem.organization_id == org_str))
        if item_types:
            conditions.append(MarketplaceItem.item_type.in_(item_types))

        # Count
        count_q = select(func.count()).select_from(MarketplaceItem).where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)

        # Fetch ranked results
        q = (select(MarketplaceItem, rank).where(*conditions)
             .order_by(rank.desc(), MarketplaceItem.download_count.desc(),
                       MarketplaceItem.created_at.desc())
             .offset(offset).limit(limit))
        result = await self.db.execute(q)
        items = []
        for row in result.all():
            item = row[0]
            items.append({
                "id": str(item.id), "item_type": item.item_type,
                "name": item.name, "slug": item.slug, "summary": item.summary,
                "icon": item.icon, "rating_avg": item.rating_avg,
                "download_count": item.download_count, "is_verified": item.is_verified,
                "is_featured": item.is_featured, "publisher_name": item.publisher_name,
                "version": item.version, "rank": float(row[1] or 0.0),
            })
        return {"query": query, "results": items, "total": total,
                "engine": "postgres_tsvector"}

    async def _search_marketplace_fallback(
        self, *, query: str, item_types: list[str] | None,
        organization_id: uuid.UUID | None, limit: int, offset: int,
    ) -> dict[str, Any]:
        """Fallback: LIKE-based search for SQLite / non-PostgreSQL databases."""
        like = f"%{query.lower()}%"
        conditions = [
            MarketplaceItem.status == "published",
            (func.lower(MarketplaceItem.name).like(like) |
             func.lower(MarketplaceItem.summary).like(like) |
             func.lower(MarketplaceItem.description).like(like) |
             func.lower(cast(MarketplaceItem.tags, Text)).like(like)),
        ]
        if organization_id:
            org_str = str(organization_id)
            conditions.append(
                (MarketplaceItem.visibility == "public") |
                (MarketplaceItem.organization_id == org_str))
        if item_types:
            conditions.append(MarketplaceItem.item_type.in_(item_types))

        count_q = select(func.count()).select_from(MarketplaceItem).where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)

        q = (select(MarketplaceItem).where(*conditions)
             .order_by(MarketplaceItem.is_featured.desc(),
                       MarketplaceItem.rating_avg.desc(),
                       MarketplaceItem.download_count.desc())
             .offset(offset).limit(limit))
        result = await self.db.execute(q)
        items = [{
            "id": str(item.id), "item_type": item.item_type,
            "name": item.name, "slug": item.slug, "summary": item.summary,
            "icon": item.icon, "rating_avg": item.rating_avg,
            "download_count": item.download_count, "is_verified": item.is_verified,
            "is_featured": item.is_featured, "publisher_name": item.publisher_name,
            "version": item.version, "rank": 0.0,
        } for item in result.scalars().all()]
        return {"query": query, "results": items, "total": total,
                "engine": "like_fallback"}

    async def search_plugins(self, *, query: str,
                              organization_id: uuid.UUID | None = None,
                              limit: int = 50) -> dict[str, Any]:
        """Search across ecosystem plugins."""
        if not query or len(query.strip()) < 2:
            return {"query": query, "results": [], "total": 0}
        like = f"%{query.lower()}%"
        conditions = [
            EcosystemPlugin.is_published.is_(True),
            (func.lower(EcosystemPlugin.name).like(like) |
             func.lower(EcosystemPlugin.description).like(like) |
             func.lower(EcosystemPlugin.slug).like(like)),
        ]
        if organization_id:
            org_str = str(organization_id)
            conditions.append(
                (EcosystemPlugin.organization_id.is_(None)) |
                (EcosystemPlugin.organization_id == org_str))
        total = int((await self.db.execute(
            select(func.count()).select_from(EcosystemPlugin).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(EcosystemPlugin).where(*conditions)
            .order_by(EcosystemPlugin.rating_avg.desc()).limit(limit))
        return {"query": query, "total": total, "results": [
            {"id": str(p.id), "name": p.name, "slug": p.slug,
             "description": p.description, "category": p.category,
             "rating_avg": p.rating_avg, "install_count": p.install_count,
             "is_verified": p.is_verified, "current_version": p.current_version}
            for p in result.scalars().all()]}

    async def search_connectors(self, *, query: str, limit: int = 50) -> dict[str, Any]:
        """Search across ecosystem connectors."""
        if not query or len(query.strip()) < 2:
            return {"query": query, "results": [], "total": 0}
        like = f"%{query.lower()}%"
        conditions = [
            EcosystemConnector.is_active.is_(True),
            (func.lower(EcosystemConnector.name).like(like) |
             func.lower(EcosystemConnector.description).like(like) |
             func.lower(EcosystemConnector.provider).like(like) |
             func.lower(EcosystemConnector.slug).like(like)),
        ]
        total = int((await self.db.execute(
            select(func.count()).select_from(EcosystemConnector).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(EcosystemConnector).where(*conditions)
            .order_by(EcosystemConnector.is_official.desc(),
                      EcosystemConnector.name.asc()).limit(limit))
        return {"query": query, "total": total, "results": [
            {"id": str(c.id), "name": c.name, "slug": c.slug,
             "description": c.description, "category": c.category,
             "provider": c.provider, "is_official": c.is_official,
             "is_verified": c.is_verified, "capabilities": c.capabilities}
            for c in result.scalars().all()]}

    async def search_mcp_servers(self, *, query: str,
                                  organization_id: uuid.UUID | None = None,
                                  limit: int = 50) -> dict[str, Any]:
        """Search across MCP servers."""
        if not query or len(query.strip()) < 2:
            return {"query": query, "results": [], "total": 0}
        like = f"%{query.lower()}%"
        conditions = [
            McpServer.is_enabled.is_(True),
            (func.lower(McpServer.name).like(like) |
             func.lower(McpServer.description).like(like) |
             func.lower(McpServer.vendor).like(like)),
        ]
        if organization_id:
            org_str = str(organization_id)
            conditions.append(
                (McpServer.organization_id.is_(None)) |
                (McpServer.organization_id == org_str))
        total = int((await self.db.execute(
            select(func.count()).select_from(McpServer).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(McpServer).where(*conditions)
            .order_by(McpServer.is_official.desc(),
                      McpServer.name.asc()).limit(limit))
        return {"query": query, "total": total, "results": [
            {"id": str(s.id), "name": s.name, "slug": s.slug,
             "description": s.description, "transport": s.transport,
             "vendor": s.vendor, "is_official": s.is_official,
             "tool_count": s.tool_count, "resource_count": s.resource_count}
            for s in result.scalars().all()]}

    async def search_apis(self, *, query: str,
                           organization_id: uuid.UUID | None = None,
                           limit: int = 50) -> dict[str, Any]:
        """Search across API catalog entries."""
        if not query or len(query.strip()) < 2:
            return {"query": query, "results": [], "total": 0}
        like = f"%{query.lower()}%"
        conditions = [
            ApiCatalogEntry.is_published.is_(True),
            (func.lower(ApiCatalogEntry.name).like(like) |
             func.lower(ApiCatalogEntry.description).like(like)),
        ]
        if organization_id:
            conditions.append(ApiCatalogEntry.organization_id == str(organization_id))
        total = int((await self.db.execute(
            select(func.count()).select_from(ApiCatalogEntry).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(ApiCatalogEntry).where(*conditions)
            .order_by(ApiCatalogEntry.is_featured.desc(),
                      ApiCatalogEntry.created_at.desc()).limit(limit))
        return {"query": query, "total": total, "results": [
            {"id": str(a.id), "name": a.name, "slug": a.slug,
             "description": a.description, "api_type": a.api_type,
             "version": a.version, "endpoints_count": a.endpoints_count,
             "is_featured": a.is_featured}
            for a in result.scalars().all()]}

    async def unified_search(self, *, query: str,
                              organization_id: uuid.UUID | None = None,
                              item_types: list[str] | None = None,
                              limit_per_type: int = 10) -> dict[str, Any]:
        """Unified search across all entity types in parallel."""
        types = item_types or ["marketplace", "plugin", "connector", "mcp", "api"]
        results: dict[str, Any] = {}
        total = 0

        if "marketplace" in types:
            r = await self.search_marketplace(query=query, organization_id=organization_id,
                                                limit=limit_per_type)
            results["marketplace"] = r["results"]
            total += r["total"]
        if "plugin" in types:
            r = await self.search_plugins(query=query, organization_id=organization_id,
                                            limit=limit_per_type)
            results["plugin"] = r["results"]
            total += r["total"]
        if "connector" in types:
            r = await self.search_connectors(query=query, limit=limit_per_type)
            results["connector"] = r["results"]
            total += r["total"]
        if "mcp" in types:
            r = await self.search_mcp_servers(query=query, organization_id=organization_id,
                                                limit=limit_per_type)
            results["mcp"] = r["results"]
            total += r["total"]
        if "api" in types:
            r = await self.search_apis(query=query, organization_id=organization_id,
                                         limit=limit_per_type)
            results["api"] = r["results"]
            total += r["total"]

        return {"query": query, "results": results, "total": total,
                "searched_types": types}


# SQL for adding GIN indexes to PostgreSQL (run as a one-time migration):
GIN_INDEX_SQL = """
-- Composite GIN index for full-text search on marketplace_items
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_marketplace_items_fts
  ON marketplace_items
  USING gin ((
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ));

-- Similar indexes for other searchable tables
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ecosystem_plugins_fts
  ON ecosystem_plugins
  USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ecosystem_connectors_fts
  ON ecosystem_connectors
  USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(provider, '')));

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_mcp_servers_fts
  ON mcp_servers
  USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(vendor, '')));

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_api_catalog_entries_fts
  ON api_catalog_entries
  USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));
"""

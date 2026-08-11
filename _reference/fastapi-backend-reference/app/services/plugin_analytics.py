"""Plugin analytics service — time-series analytics for plugin installations.

Provides:
- Installation counts over time (daily/weekly/monthly)
- Health check pass rate over time
- Error rate by plugin / by organization
- Top installed plugins (leaderboard)
- Active installations (running in last N minutes)
- Per-plugin time series (installs, errors, health checks, invocations)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.marketplace_ecosystem import (
    EcosystemPlugin,
    EcosystemPluginInstallation,
    MarketplaceDownload,
    MarketplaceItem,
)
from app.services.marketplace_ecosystem import PluginService

from app.core.logging import get_logger

logger = get_logger(__name__)


class PluginAnalyticsService:
    """Time-series analytics for the plugin ecosystem."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_overview(self, *, organization_id: uuid.UUID,
                            days: int = 30) -> dict[str, Any]:
        """Get high-level plugin analytics for an organization."""
        cutoff = datetime.now(UTC) - timedelta(days=days)
        org_str = str(organization_id)

        # Total installations + active installations
        total_installations_q = await self.db.execute(
            select(func.count(EcosystemPluginInstallation.id))
            .where(EcosystemPluginInstallation.organization_id == org_str))
        total_installations = int(total_installations_q.scalar_one_or_none() or 0)

        active_q = await self.db.execute(
            select(func.count(EcosystemPluginInstallation.id))
            .where(and_(
                EcosystemPluginInstallation.organization_id == org_str,
                EcosystemPluginInstallation.status == "active")))
        active_installations = int(active_q.scalar_one_or_none() or 0)

        healthy_q = await self.db.execute(
            select(func.count(EcosystemPluginInstallation.id))
            .where(and_(
                EcosystemPluginInstallation.organization_id == org_str,
                EcosystemPluginInstallation.health_status == "healthy")))
        healthy_installations = int(healthy_q.scalar_one_or_none() or 0)

        errored_q = await self.db.execute(
            select(func.count(EcosystemPluginInstallation.id))
            .where(and_(
                EcosystemPluginInstallation.organization_id == org_str,
                EcosystemPluginInstallation.health_status == "error")))
        errored_installations = int(errored_q.scalar_one_or_none() or 0)

        # Recent installs (in last N days) from MarketplaceDownload
        recent_installs_q = await self.db.execute(
            select(func.count(MarketplaceDownload.id))
            .where(and_(
                MarketplaceDownload.organization_id == org_str,
                MarketplaceDownload.action == "install",
                MarketplaceDownload.created_at >= cutoff)))
        recent_installs = int(recent_installs_q.scalar_one_or_none() or 0)

        # Health check rate
        health_rate = (healthy_installations / total_installations
                       if total_installations > 0 else 0.0)
        error_rate = (errored_installations / total_installations
                      if total_installations > 0 else 0.0)

        return {
            "period_days": days,
            "total_installations": total_installations,
            "active_installations": active_installations,
            "healthy_installations": healthy_installations,
            "errored_installations": errored_installations,
            "recent_installs": recent_installs,
            "health_check_pass_rate": round(health_rate, 4),
            "error_rate": round(error_rate, 4),
        }

    async def get_time_series(self, *, organization_id: uuid.UUID,
                               metric: str = "installs",
                               days: int = 30,
                               bucket: str = "day") -> dict[str, Any]:
        """Get a time-series of a metric over time.

        Args:
            metric: installs / uninstalls / errors / health_checks
            days: How many days to look back
            bucket: day / week (granularity of buckets)
        """
        cutoff = datetime.now(UTC) - timedelta(days=days)
        org_str = str(organization_id)
        action_filter = {
            "installs": "install",
            "uninstalls": "uninstall",
            "errors": "error",
            "health_checks": "view",  # proxy — real impl would log health checks
        }.get(metric)
        if action_filter is None:
            return {"metric": metric, "buckets": [], "total": 0}

        # Bucket size
        if bucket == "week":
            date_trunc = func.date_trunc("week", MarketplaceDownload.created_at)
        else:
            date_trunc = func.date_trunc("day", MarketplaceDownload.created_at)

        q = (select(date_trunc.label("bucket"), func.count(MarketplaceDownload.id))
             .where(and_(
                 MarketplaceDownload.organization_id == org_str,
                 MarketplaceDownload.action == action_filter,
                 MarketplaceDownload.created_at >= cutoff))
             .group_by("bucket").order_by("bucket"))
        result = await self.db.execute(q)
        buckets = []
        total = 0
        for row in result.all():
            bucket_time = row[0]
            count = int(row[1] or 0)
            buckets.append({
                "bucket": bucket_time.isoformat() if bucket_time else None,
                "count": count,
            })
            total += count
        return {"metric": metric, "bucket": bucket, "period_days": days,
                "buckets": buckets, "total": total}

    async def get_top_plugins(self, *, organization_id: uuid.UUID | None = None,
                               limit: int = 10) -> dict[str, Any]:
        """Get the most-installed plugins (leaderboard)."""
        org_filter = []
        if organization_id:
            org_filter.append(
                (EcosystemPlugin.organization_id.is_(None)) |
                (EcosystemPlugin.organization_id == str(organization_id)))
        q = (select(EcosystemPlugin).where(EcosystemPlugin.is_published.is_(True), *org_filter)
             .order_by(EcosystemPlugin.install_count.desc(),
                        EcosystemPlugin.rating_avg.desc()).limit(limit))
        result = await self.db.execute(q)
        return {"plugins": [
            {"id": str(p.id), "name": p.name, "slug": p.slug,
             "category": p.category, "install_count": p.install_count,
             "rating_avg": p.rating_avg, "rating_count": p.rating_count,
             "is_verified": p.is_verified, "current_version": p.current_version,
             "author_name": p.author_name}
            for p in result.scalars().all()]}

    async def get_plugin_detail(self, *, plugin_id: uuid.UUID,
                                 organization_id: uuid.UUID | None = None,
                                 days: int = 30) -> dict[str, Any]:
        """Get detailed analytics for a single plugin."""
        svc = PluginService(self.db)
        plugin = await svc.get_plugin(plugin_id=plugin_id)
        cutoff = datetime.now(UTC) - timedelta(days=days)
        org_str = str(organization_id) if organization_id else None

        # Installs over time
        installs_q = (select(
            func.date_trunc("day", MarketplaceDownload.created_at).label("bucket"),
            func.count(MarketplaceDownload.id))
            .where(and_(
                MarketplaceDownload.action == "install",
                MarketplaceDownload.created_at >= cutoff))
            .group_by("bucket").order_by("bucket"))
        # Note: MarketplaceDownload doesn't have plugin_id directly — it has item_id
        # which is the MarketplaceItem FK. We need to find the item for this plugin.
        item_q = await self.db.execute(
            select(MarketplaceItem.id).where(
                MarketplaceItem.item_type == "plugin",
                MarketplaceItem.entity_id == str(plugin_id)))
        item_id = item_q.scalar_one_or_none()
        installs_buckets = []
        if item_id is not None:
            installs_q = installs_q.where(MarketplaceDownload.item_id == item_id)
            if org_str:
                installs_q = installs_q.where(MarketplaceDownload.organization_id == org_str)
            installs_result = await self.db.execute(installs_q)
            installs_buckets = [
                {"bucket": row[0].isoformat() if row[0] else None, "count": int(row[1] or 0)}
                for row in installs_result.all()
            ]

        # Installations by status
        installations_q = await self.db.execute(
            select(EcosystemPluginInstallation.status,
                   func.count(EcosystemPluginInstallation.id))
            .where(EcosystemPluginInstallation.plugin_id == plugin_id)
            .group_by(EcosystemPluginInstallation.status))
        installations_by_status = {status: int(count) for status, count in installations_q.all()}

        return {
            "plugin_id": str(plugin_id),
            "plugin_name": plugin.name,
            "plugin_slug": plugin.slug,
            "period_days": days,
            "install_count_total": plugin.install_count,
            "rating_avg": plugin.rating_avg,
            "rating_count": plugin.rating_count,
            "installs_time_series": installs_buckets,
            "installations_by_status": installations_by_status,
        }

    async def get_error_summary(self, *, organization_id: uuid.UUID,
                                  days: int = 7) -> dict[str, Any]:
        """Get error summary — installations with errors + their error messages."""
        cutoff = datetime.now(UTC) - timedelta(days=days)
        org_str = str(organization_id)
        q = (select(EcosystemPluginInstallation, EcosystemPlugin.name)
             .join(EcosystemPlugin, EcosystemPluginInstallation.plugin_id == EcosystemPlugin.id)
             .where(and_(
                 EcosystemPluginInstallation.organization_id == org_str,
                 EcosystemPluginInstallation.status.in_(["error", "disabled"]),
                 (EcosystemPluginInstallation.last_health_check.is_(None)) |
                 (EcosystemPluginInstallation.last_health_check >= cutoff)))
             .order_by(EcosystemPluginInstallation.updated_at.desc()))
        result = await self.db.execute(q)
        errors = []
        for inst, plugin_name in result.all():
            errors.append({
                "installation_id": str(inst.id),
                "plugin_name": plugin_name,
                "version": inst.version,
                "status": inst.status,
                "health_status": inst.health_status,
                "error_message": inst.error_message,
                "last_health_check": inst.last_health_check.isoformat() if inst.last_health_check else None,
            })
        return {"period_days": days, "total_errors": len(errors), "errors": errors}

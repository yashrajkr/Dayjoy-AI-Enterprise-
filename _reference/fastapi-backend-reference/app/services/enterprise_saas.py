"""Enterprise SaaS Control Plane — API keys, usage tracking, quotas, billing, secrets, admin."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.enterprise_saas import (
    ApiKey, ApiUsage, BillingEvent, DeploymentLog,
    EncryptedSecret, Payment, TenantSettings, UsageQuota,
)
from app.models.saas import SubscriptionPlan, Subscription, Invoice, UsageRecord
from app.models.user import User
from app.models.organization import Organization, UserOrganization

logger = get_logger(__name__)


# ====================================================================
# API Key Service — CRUD + validation + rate limiting
# ====================================================================

class ApiKeyService:
    """Manages per-organization API keys for programmatic access."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_key(self, *, organization_id: uuid.UUID, user_id: uuid.UUID,
                         name: str, scopes: list[str] | None = None,
                         rate_limit_per_minute: int = 60,
                         expires_in_days: int | None = 365) -> tuple[dict, str]:
        """Create a new API key. Returns (metadata, raw_key) — raw_key shown only once."""
        raw_key = f"djkey_{secrets.token_urlsafe(40)}"
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key_prefix = raw_key[:12] + "…"
        expires_at = datetime.now(UTC) + timedelta(days=expires_in_days) if expires_in_days else None

        api_key = ApiKey(
            organization_id=str(organization_id), user_id=str(user_id),
            name=name, key_prefix=key_prefix, key_hash=key_hash,
            scopes=scopes or [], rate_limit_per_minute=rate_limit_per_minute,
            expires_at=expires_at, is_active=True)
        self.db.add(api_key)
        await self.db.flush()
        return ({"id": str(api_key.id), "name": name, "key_prefix": key_prefix,
                 "expires_at": expires_at.isoformat() if expires_at else None}, raw_key)

    async def list_keys(self, *, organization_id: uuid.UUID) -> list[dict]:
        result = await self.db.execute(
            select(ApiKey).where(ApiKey.organization_id == str(organization_id))
            .order_by(ApiKey.created_at.desc()))
        return [{"id": str(k.id), "name": k.name, "key_prefix": k.key_prefix,
                 "scopes": k.scopes, "is_active": k.is_active,
                 "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
                 "expires_at": k.expires_at.isoformat() if k.expires_at else None,
                 "created_at": k.created_at.isoformat() if k.created_at else None}
                for k in result.scalars().all()]

    async def revoke_key(self, *, organization_id: uuid.UUID, key_id: uuid.UUID) -> None:
        key = await self.db.get(ApiKey, key_id)
        if key is None or key.organization_id != str(organization_id):
            raise NotFoundError("ApiKey", str(key_id))
        key.is_active = False
        await self.db.flush()

    async def validate_key(self, raw_key: str) -> dict[str, Any] | None:
        """Validate an API key. Returns org_id + user_id if valid, None otherwise."""
        if not raw_key.startswith("djkey_"):
            return None
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        result = await self.db.execute(
            select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True))  # noqa: E712
        key = result.scalar_one_or_none()
        if key is None:
            return None
        if key.expires_at:
            exp = key.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=UTC)
            if exp < datetime.now(UTC):
                return None
        key.last_used_at = datetime.now(UTC)
        await self.db.flush()
        return {"organization_id": key.organization_id, "user_id": key.user_id,
                "api_key_id": str(key.id), "scopes": key.scopes}


# ====================================================================
# Usage Tracking Service — track every API call, agent run, tokens
# ====================================================================

class UsageTrackingService:
    """Tracks usage for billing + analytics."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def log_api_call(self, *, organization_id: uuid.UUID, endpoint: str,
                           method: str, status_code: int, latency_ms: int = 0,
                           user_id: uuid.UUID | None = None,
                           api_key_id: uuid.UUID | None = None,
                           tokens_used: int = 0, cost_cents: int = 0,
                           ip_address: str | None = None) -> ApiUsage:
        """Log a single API call."""
        usage = ApiUsage(
            organization_id=str(organization_id),
            user_id=str(user_id) if user_id else None,
            api_key_id=api_key_id, endpoint=endpoint, method=method,
            status_code=status_code, latency_ms=latency_ms,
            tokens_used=tokens_used, cost_cents=cost_cents,
            ip_address=ip_address)
        self.db.add(usage)
        await self.db.flush()
        return usage

    async def get_usage_summary(self, *, organization_id: uuid.UUID,
                                days: int = 30) -> dict[str, Any]:
        """Get aggregate usage for the last N days."""
        cutoff = datetime.now(UTC) - timedelta(days=days)
        result = await self.db.execute(
            select(func.count(ApiUsage.id), func.sum(ApiUsage.tokens_used),
                   func.sum(ApiUsage.cost_cents), func.avg(ApiUsage.latency_ms))
            .where(ApiUsage.organization_id == str(organization_id),
                   ApiUsage.created_at >= cutoff))
        row = result.one()
        return {"period_days": days, "total_calls": int(row[0] or 0),
                "total_tokens": int(row[1] or 0), "total_cost_cents": int(row[2] or 0),
                "avg_latency_ms": int(row[3]) if row[3] else 0}

    async def get_usage_by_endpoint(self, *, organization_id: uuid.UUID,
                                    days: int = 7) -> list[dict]:
        """Get usage breakdown by endpoint."""
        cutoff = datetime.now(UTC) - timedelta(days=days)
        result = await self.db.execute(
            select(ApiUsage.endpoint, func.count(ApiUsage.id), func.sum(ApiUsage.tokens_used))
            .where(ApiUsage.organization_id == str(organization_id),
                   ApiUsage.created_at >= cutoff)
            .group_by(ApiUsage.endpoint).order_by(func.count(ApiUsage.id).desc()))
        return [{"endpoint": row[0], "calls": int(row[1]), "tokens": int(row[2] or 0)}
                for row in result.all()]


# ====================================================================
# Quota Service — enforce limits before every operation
# ====================================================================

class QuotaService:
    """Enforces per-organization resource limits."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create_quota(self, *, organization_id: uuid.UUID) -> UsageQuota:
        """Get or create the quota for an organization."""
        result = await self.db.execute(
            select(UsageQuota).where(UsageQuota.organization_id == str(organization_id)))
        quota = result.scalar_one_or_none()
        if quota is None:
            quota = UsageQuota(organization_id=str(organization_id))
            self.db.add(quota)
            await self.db.flush()
        return quota

    async def check_quota(self, *, organization_id: uuid.UUID,
                          resource: str, current_count: int) -> dict[str, Any]:
        """Check if an organization can use more of a resource.

        Returns: {"allowed": bool, "limit": int, "current": int, "remaining": int}
        """
        quota = await self.get_or_create_quota(organization_id=organization_id)
        limit = getattr(quota, f"max_{resource}", 0)
        if limit == -1:  # unlimited
            return {"allowed": True, "limit": -1, "current": current_count, "remaining": -1}
        remaining = max(0, limit - current_count)
        return {"allowed": current_count < limit, "limit": limit,
                "current": current_count, "remaining": remaining}

    async def update_quota(self, *, organization_id: uuid.UUID, **updates: Any) -> UsageQuota:
        """Update quota limits for an organization."""
        quota = await self.get_or_create_quota(organization_id=organization_id)
        for key, value in updates.items():
            if hasattr(quota, key):
                setattr(quota, key, value)
        await self.db.flush()
        return quota

    async def get_quota(self, *, organization_id: uuid.UUID) -> dict[str, Any]:
        """Get quota for an organization."""
        quota = await self.get_or_create_quota(organization_id=organization_id)
        return {k: v for k, v in quota.__dict__.items()
                if k.startswith("max_") or k in ("organization_id", "id")}


# ====================================================================
# Billing Service — plans, subscriptions, invoices, payments
# ====================================================================

class BillingService:
    """Manages subscription plans, billing, and payments."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_plans(self) -> list[dict]:
        """List all active subscription plans."""
        result = await self.db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.is_active == True)  # noqa: E712
            .order_by(SubscriptionPlan.tier))
        return [{"id": str(p.id), "name": p.name, "description": p.description,
                 "price_monthly": getattr(p, "price_monthly_cents", getattr(p, "price_monthly", 0)),
                 "price_yearly": getattr(p, "price_yearly_cents", getattr(p, "price_yearly", 0)),
                 "currency": p.currency, "trial_days": p.trial_days,
                 "features": getattr(p, "features", {}), "limits": getattr(p, "limits", {})}
                for p in result.scalars().all()]

    async def get_subscription(self, *, organization_id: uuid.UUID) -> dict | None:
        """Get the current subscription for an organization."""
        result = await self.db.execute(
            select(Subscription).where(
                Subscription.organization_id == str(organization_id),
                Subscription.status.in_(["active", "trialing"]))
            .order_by(Subscription.created_at.desc()).limit(1))
        sub = result.scalar_one_or_none()
        if sub is None:
            return None
        return {"id": str(sub.id), "plan_id": str(sub.plan_id), "status": sub.status,
                "billing_cycle": sub.billing_cycle, "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
                "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None}

    async def list_invoices(self, *, organization_id: uuid.UUID) -> list[dict]:
        """List invoices for an organization."""
        result = await self.db.execute(
            select(Invoice).where(Invoice.organization_id == str(organization_id))
            .order_by(Invoice.created_at.desc()))
        return [{"id": str(i.id), "invoice_number": i.invoice_number,
                 "amount_cents": i.total_cents, "currency": i.currency,
                 "status": i.status, "issue_date": i.issue_date.isoformat() if i.issue_date else None,
                 "paid_at": i.paid_at.isoformat() if i.paid_at else None}
                for i in result.scalars().all()]

    async def list_payments(self, *, organization_id: uuid.UUID) -> list[dict]:
        """List payments for an organization."""
        result = await self.db.execute(
            select(Payment).where(Payment.organization_id == str(organization_id))
            .order_by(Payment.created_at.desc()))
        return [{"id": str(p.id), "amount_cents": p.amount_cents, "currency": p.currency,
                 "provider": p.provider, "status": p.status,
                 "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                 "created_at": p.created_at.isoformat() if p.created_at else None}
                for p in result.scalars().all()]

    async def create_billing_event(self, *, organization_id: uuid.UUID,
                                   event_type: str, amount_cents: int,
                                   description: str | None = None,
                                   provider: str | None = None) -> BillingEvent:
        """Create a billing event (charge, refund, credit)."""
        event = BillingEvent(
            organization_id=str(organization_id), event_type=event_type,
            amount_cents=amount_cents, description=description, provider=provider,
            status="pending")
        self.db.add(event)
        await self.db.flush()
        return event


# ====================================================================
# Secrets Manager — encrypted storage for provider API keys
# ====================================================================

class SecretsManager:
    """Manages encrypted secrets (API keys, database credentials, etc.).

    Uses Fernet symmetric encryption (from the cryptography library) with
    a master key derived from settings.SECRET_KEY.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _encrypt(self, value: str) -> str:
        """Encrypt a value using Fernet."""
        try:
            from cryptography.fernet import Fernet
            import base64
            import hashlib
            # Derive a Fernet key from SECRET_KEY
            key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
            f = Fernet(key)
            return f.encrypt(value.encode()).decode()
        except ImportError:
            # Fallback: base64 (NOT secure — only for dev)
            import base64
            return base64.b64encode(value.encode()).decode()

    def _decrypt(self, encrypted: str) -> str:
        """Decrypt a value."""
        try:
            from cryptography.fernet import Fernet
            import base64
            import hashlib
            key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
            f = Fernet(key)
            return f.decrypt(encrypted.encode()).decode()
        except ImportError:
            import base64
            return base64.b64decode(encrypted.encode()).decode()

    async def store_secret(self, *, organization_id: uuid.UUID, name: str,
                           secret_type: str, value: str,
                           created_by: uuid.UUID | None = None,
                           metadata: dict | None = None) -> EncryptedSecret:
        """Store an encrypted secret."""
        encrypted = self._encrypt(value)
        secret = EncryptedSecret(
            organization_id=str(organization_id), name=name,
            secret_type=secret_type, encrypted_value=encrypted,
            metadata_=metadata, created_by=str(created_by) if created_by else None,
            is_active=True)
        self.db.add(secret)
        await self.db.flush()
        return secret

    async def get_secret(self, *, organization_id: uuid.UUID, name: str) -> str | None:
        """Get and decrypt a secret."""
        result = await self.db.execute(
            select(EncryptedSecret).where(
                EncryptedSecret.organization_id == str(organization_id),
                EncryptedSecret.name == name,
                EncryptedSecret.is_active == True))  # noqa: E712
        secret = result.scalar_one_or_none()
        if secret is None:
            return None
        return self._decrypt(secret.encrypted_value)

    async def list_secrets(self, *, organization_id: uuid.UUID) -> list[dict]:
        """List all secrets (without values)."""
        result = await self.db.execute(
            select(EncryptedSecret).where(
                EncryptedSecret.organization_id == str(organization_id),
                EncryptedSecret.is_active == True))  # noqa: E712
        return [{"id": str(s.id), "name": s.name, "secret_type": s.secret_type,
                 "last_rotated_at": s.last_rotated_at.isoformat() if s.last_rotated_at else None,
                 "created_at": s.created_at.isoformat() if s.created_at else None}
                for s in result.scalars().all()]

    async def delete_secret(self, *, organization_id: uuid.UUID, secret_id: uuid.UUID) -> None:
        """Delete (deactivate) a secret."""
        secret = await self.db.get(EncryptedSecret, secret_id)
        if secret is None or secret.organization_id != str(organization_id):
            raise NotFoundError("Secret", str(secret_id))
        secret.is_active = False
        await self.db.flush()


# ====================================================================
# Admin Console Service — org management, user management, system health
# ====================================================================

class AdminConsoleService:
    """Admin console for platform administrators."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_platform_stats(self) -> dict[str, Any]:
        """Get platform-wide statistics (super admin only)."""
        # Total orgs
        total_orgs = int((await self.db.execute(
            select(func.count(Organization.id)))).scalar_one_or_none() or 0)
        # Total users
        total_users = int((await self.db.execute(
            select(func.count(User.id)))).scalar_one_or_none() or 0)
        # Active subscriptions
        active_subs = int((await self.db.execute(
            select(func.count(Subscription.id)).where(
                Subscription.status.in_(["active", "trialing"]))
            )).scalar_one_or_none() or 0)
        # Total API calls (last 24h)
        cutoff = datetime.now(UTC) - timedelta(hours=24)
        api_calls_24h = int((await self.db.execute(
            select(func.count(ApiUsage.id)).where(ApiUsage.created_at >= cutoff)
            )).scalar_one_or_none() or 0)
        # Total cost (last 24h)
        total_cost_24h = int((await self.db.execute(
            select(func.coalesce(func.sum(ApiUsage.cost_cents), 0))
            .where(ApiUsage.created_at >= cutoff)
            )).scalar_one_or_none() or 0)
        return {
            "total_organizations": total_orgs, "total_users": total_users,
            "active_subscriptions": active_subs, "api_calls_24h": api_calls_24h,
            "total_cost_24h_cents": total_cost_24h,
        }

    async def list_organizations(self, *, skip: int = 0, limit: int = 50) -> tuple[list[dict], int]:
        """List all organizations (super admin only)."""
        count = int((await self.db.execute(
            select(func.count(Organization.id)))).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(Organization).order_by(Organization.created_at.desc()).offset(skip).limit(limit))
        orgs = []
        for org in result.scalars().all():
            member_count = int((await self.db.execute(
                select(func.count(UserOrganization.id)).where(
                    UserOrganization.organization_id == str(org.id),
                    UserOrganization.is_active == True)  # noqa: E712
                )).scalar_one_or_none() or 0)
            orgs.append({"id": str(org.id), "name": org.name, "slug": org.slug,
                         "plan": org.plan, "is_active": org.is_active,
                         "member_count": member_count,
                         "created_at": org.created_at.isoformat() if org.created_at else None})
        return orgs, count

    async def get_tenant_settings(self, *, organization_id: uuid.UUID) -> dict[str, Any]:
        """Get tenant settings for an organization."""
        result = await self.db.execute(
            select(TenantSettings).where(TenantSettings.organization_id == str(organization_id)))
        ts = result.scalar_one_or_none()
        if ts is None:
            return {"organization_id": str(organization_id), "timezone": "UTC", "locale": "en",
                    "features": {}, "security_settings": {}, "notification_settings": {}}
        return {"id": str(ts.id), "organization_id": ts.organization_id,
                "custom_domain": ts.custom_domain, "logo_url": ts.logo_url,
                "primary_color": ts.primary_color, "timezone": ts.timezone,
                "locale": ts.locale, "default_ai_provider": ts.default_ai_provider,
                "default_ai_model": ts.default_ai_model, "features": ts.features,
                "security_settings": ts.security_settings,
                "notification_settings": ts.notification_settings}

    async def update_tenant_settings(self, *, organization_id: uuid.UUID,
                                     **updates: Any) -> TenantSettings:
        """Update tenant settings."""
        result = await self.db.execute(
            select(TenantSettings).where(TenantSettings.organization_id == str(organization_id)))
        ts = result.scalar_one_or_none()
        if ts is None:
            ts = TenantSettings(organization_id=str(organization_id))
            self.db.add(ts)
        for key, value in updates.items():
            if hasattr(ts, key) and value is not None:
                setattr(ts, key, value)
        await self.db.flush()
        return ts

    async def get_ai_cost_breakdown(self, *, organization_id: uuid.UUID,
                                    days: int = 30) -> dict[str, Any]:
        """Get AI cost breakdown by model, agent, and workflow."""
        cutoff = datetime.now(UTC) - timedelta(days=days)
        # By endpoint (proxy for model)
        by_endpoint = await self.db.execute(
            select(ApiUsage.endpoint, func.sum(ApiUsage.cost_cents), func.sum(ApiUsage.tokens_used))
            .where(ApiUsage.organization_id == str(organization_id),
                   ApiUsage.created_at >= cutoff)
            .group_by(ApiUsage.endpoint).order_by(func.sum(ApiUsage.cost_cents).desc()))
        return {"period_days": days,
                "by_endpoint": [{"endpoint": row[0], "cost_cents": int(row[1] or 0),
                                 "tokens": int(row[2] or 0)} for row in by_endpoint.all()],
                "total_cost_cents": sum(int(row[1] or 0) for row in by_endpoint.all())}

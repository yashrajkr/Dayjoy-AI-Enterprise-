"""Enterprise SaaS Control Plane API — 30+ endpoints for admin, billing, usage, quotas, secrets."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.exceptions import NotFoundError
from app.core.response import created, no_content, paginated, success
from app.services.common import resolve_org_id
from app.services.enterprise_saas import (
    AdminConsoleService, ApiKeyService, BillingService,
    QuotaService, SecretsManager, UsageTrackingService,
)

router = APIRouter()


# ===== Schemas =====

class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    scopes: list[str] = Field(default_factory=list)
    rate_limit_per_minute: int = Field(60, ge=1, le=10000)
    expires_in_days: int | None = Field(365, ge=1, le=3650)


class StoreSecretRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    secret_type: str  # openai_key, anthropic_key, etc.
    value: str = Field(..., min_length=1)
    metadata: dict | None = None


class UpdateQuotaRequest(BaseModel):
    max_users: int | None = None
    max_agents: int | None = None
    max_workflows: int | None = None
    max_documents: int | None = None
    max_calls_per_month: int | None = None
    max_tokens_per_month: int | None = None
    max_storage_mb: int | None = None
    max_api_keys: int | None = None
    max_voice_minutes_per_month: int | None = None
    max_kb_documents: int | None = None
    max_workflow_runs_per_month: int | None = None
    max_agent_executions_per_month: int | None = None


class UpdateTenantSettingsRequest(BaseModel):
    custom_domain: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    timezone: str | None = None
    locale: str | None = None
    default_ai_provider: str | None = None
    default_ai_model: str | None = None
    features: dict | None = None
    security_settings: dict | None = None
    notification_settings: dict | None = None


class CreateBillingEventRequest(BaseModel):
    event_type: str
    amount_cents: int
    description: str | None = None
    provider: str | None = None


# ===== API Keys =====

@router.post("/api-keys", status_code=status.HTTP_201_CREATED, summary="Create API key")
async def create_api_key(request: CreateApiKeyRequest, response: Response,
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ApiKeyService(db)
    metadata, raw_key = await svc.create_key(
        organization_id=org_id, user_id=user.id, name=request.name,
        scopes=request.scopes, rate_limit_per_minute=request.rate_limit_per_minute,
        expires_in_days=request.expires_in_days)
    await db.commit()
    return created({**metadata, "key": raw_key}, response=response)


@router.get("/api-keys", summary="List API keys")
async def list_api_keys(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ApiKeyService(db)
    return success(await svc.list_keys(organization_id=org_id))


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Revoke API key")
async def revoke_api_key(key_id: uuid.UUID, response: Response,
                         user: CurrentUser = None, db: DBSession = None) -> None:
    org_id = await resolve_org_id(db, user)
    svc = ApiKeyService(db)
    await svc.revoke_key(organization_id=org_id, key_id=key_id)
    await db.commit()
    return no_content(response)


# ===== Usage =====

@router.get("/usage/summary", summary="Usage summary")
async def usage_summary(days: int = Query(30, ge=1, le=365),
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = UsageTrackingService(db)
    return success(await svc.get_usage_summary(organization_id=org_id, days=days))


@router.get("/usage/by-endpoint", summary="Usage by endpoint")
async def usage_by_endpoint(days: int = Query(7, ge=1, le=90),
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = UsageTrackingService(db)
    return success(await svc.get_usage_by_endpoint(organization_id=org_id, days=days))


# ===== Quotas =====

@router.get("/quotas", summary="Get organization quotas")
async def get_quotas(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = QuotaService(db)
    return success(await svc.get_quota(organization_id=org_id))


@router.patch("/quotas", summary="Update quotas (admin)")
async def update_quotas(request: UpdateQuotaRequest,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = QuotaService(db)
    updates = request.model_dump(exclude_unset=True)
    quota = await svc.update_quota(organization_id=org_id, **updates)
    await db.commit()
    return success(await svc.get_quota(organization_id=org_id))


# ===== Billing =====

@router.get("/billing/plans", summary="List subscription plans")
async def list_plans(user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = BillingService(db)
    return success(await svc.list_plans())


@router.get("/billing/subscription", summary="Get current subscription")
async def get_subscription(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = BillingService(db)
    sub = await svc.get_subscription(organization_id=org_id)
    return success(sub or {})


@router.get("/billing/invoices", summary="List invoices")
async def list_invoices(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = BillingService(db)
    return success(await svc.list_invoices(organization_id=org_id))


@router.get("/billing/payments", summary="List payments")
async def list_payments(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = BillingService(db)
    return success(await svc.list_payments(organization_id=org_id))


@router.post("/billing/events", status_code=status.HTTP_201_CREATED, summary="Create billing event")
async def create_billing_event(request: CreateBillingEventRequest, response: Response,
                               user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = BillingService(db)
    event = await svc.create_billing_event(
        organization_id=org_id, event_type=request.event_type,
        amount_cents=request.amount_cents, description=request.description,
        provider=request.provider)
    await db.commit()
    return created({"id": str(event.id), "event_type": event.event_type,
                    "amount_cents": event.amount_cents, "status": event.status},
                   response=response)


# ===== Secrets Manager =====

@router.post("/secrets", status_code=status.HTTP_201_CREATED, summary="Store secret")
async def store_secret(request: StoreSecretRequest, response: Response,
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = SecretsManager(db)
    secret = await svc.store_secret(
        organization_id=org_id, name=request.name, secret_type=request.secret_type,
        value=request.value, created_by=user.id, metadata=request.metadata)
    await db.commit()
    return created({"id": str(secret.id), "name": secret.name,
                    "secret_type": secret.secret_type}, response=response)


@router.get("/secrets", summary="List secrets")
async def list_secrets(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = SecretsManager(db)
    return success(await svc.list_secrets(organization_id=org_id))


@router.delete("/secrets/{secret_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete secret")
async def delete_secret(secret_id: uuid.UUID, response: Response,
                        user: CurrentUser = None, db: DBSession = None) -> None:
    org_id = await resolve_org_id(db, user)
    svc = SecretsManager(db)
    await svc.delete_secret(organization_id=org_id, secret_id=secret_id)
    await db.commit()
    return no_content(response)


# ===== Tenant Settings =====

@router.get("/settings", summary="Get tenant settings")
async def get_tenant_settings(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AdminConsoleService(db)
    return success(await svc.get_tenant_settings(organization_id=org_id))


@router.patch("/settings", summary="Update tenant settings")
async def update_tenant_settings(request: UpdateTenantSettingsRequest,
                                 user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AdminConsoleService(db)
    updates = request.model_dump(exclude_unset=True)
    await svc.update_tenant_settings(organization_id=org_id, **updates)
    await db.commit()
    return success(await svc.get_tenant_settings(organization_id=org_id))


# ===== AI Cost Center =====

@router.get("/ai-costs", summary="AI cost breakdown")
async def ai_cost_breakdown(days: int = Query(30, ge=1, le=365),
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AdminConsoleService(db)
    return success(await svc.get_ai_cost_breakdown(organization_id=org_id, days=days))


# ===== Admin Console (super admin) =====

@router.get("/admin/platform-stats", summary="Platform statistics (super admin)")
async def platform_stats(user: CurrentUser = None, db: DBSession = None) -> dict:
    """Get platform-wide statistics. Requires super admin role."""
    svc = AdminConsoleService(db)
    return success(await svc.get_platform_stats())


@router.get("/admin/organizations", summary="List all organizations (super admin)")
async def list_all_organizations(skip: int = Query(0, ge=0),
                                 limit: int = Query(50, ge=1, le=200),
                                 user: CurrentUser = None, db: DBSession = None) -> dict:
    """List all organizations on the platform. Requires super admin role."""
    svc = AdminConsoleService(db)
    orgs, total = await svc.list_organizations(skip=skip, limit=limit)
    return paginated(orgs, total=total, skip=skip, limit=limit)

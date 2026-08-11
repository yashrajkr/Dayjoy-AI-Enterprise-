"""SaaS Platform REST API endpoints (Stage 2 Step 10).

Endpoints:
- POST   /saas/register              — Register new company
- GET    /saas/plans                  — List subscription plans
- GET    /saas/subscription           — Get org's subscription
- POST   /saas/subscription/upgrade   — Upgrade/downgrade plan
- POST   /saas/subscription/cancel    — Cancel subscription
- GET    /saas/invoices               — List invoices
- GET    /saas/invoices/{id}          — Get invoice
- GET    /saas/usage                  — Usage summary (current month)
- POST   /saas/usage/record           — Record usage (internal)
- GET    /saas/onboarding             — Onboarding progress
- POST   /saas/onboarding/{step}/complete — Complete onboarding step
- POST   /saas/tickets                — Create support ticket
- GET    /saas/tickets                — List tickets
- POST   /saas/tickets/{id}/resolve   — Resolve ticket
- POST   /saas/feature-requests       — Create feature request
- GET    /saas/feature-requests       — List feature requests
- POST   /saas/feature-requests/{id}/vote — Vote for feature request
- GET    /saas/system-status          — Platform status page
- GET    /saas/admin/dashboard        — Admin dashboard (super_admin only)
- GET    /saas/admin/organizations     — List all orgs (super_admin only)
- GET    /saas/config                 — Public config
"""

import uuid
from typing import Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.logging import get_logger
from app.repositories.organization import UserOrganizationRepository
from app.services.saas_service import SaaSService

logger = get_logger(__name__)
router = APIRouter()


async def _get_org_id(user: Any, db: AsyncSession) -> uuid.UUID:
    repo = UserOrganizationRepository(db)
    orgs = await repo.get_user_organizations(user.id)
    if not orgs:
        from app.core.exceptions import ValidationError
        raise ValidationError("User is not a member of any organization")
    return uuid.UUID(orgs[0].organization_id)


# ===== Schemas =====


class RegisterCompanyRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=100)
    admin_email: str = Field(..., min_length=3)
    admin_password: str = Field(..., min_length=8)
    admin_full_name: str = Field(..., min_length=1)
    plan_name: str = "professional"
    description: str | None = None


class UpgradePlanRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"


class CancelRequest(BaseModel):
    reason: str | None = None


class RecordUsageRequest(BaseModel):
    metric: str
    value: int = 1
    cost_cents: int = 0


class CompleteStepRequest(BaseModel):
    step_data: dict[str, Any] | None = None


class CreateTicketRequest(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    category: str = "technical"
    priority: str = "medium"


class CreateFeatureRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    category: str = "other"


# ===== Company Registration =====


@router.post("/register", status_code=status.HTTP_201_CREATED, summary="Register new company")
async def register_company(
    request: RegisterCompanyRequest,
    db: DBSession,
) -> dict[str, Any]:
    """Register a new company + admin user + trial subscription.

    This is the SaaS sign-up endpoint. No auth required.
    """
    svc = SaaSService(db)
    result = await svc.register_company(
        company_name=request.company_name,
        slug=request.slug,
        admin_email=request.admin_email,
        admin_password=request.admin_password,
        admin_full_name=request.admin_full_name,
        plan_name=request.plan_name,
        description=request.description,
    )
    return result


# ===== Plans =====


@router.get("/plans", summary="List subscription plans")
async def list_plans(
    db: DBSession,
) -> list[dict[str, Any]]:
    svc = SaaSService(db)
    plans = await svc.list_plans(public_only=True)
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "display_name": p.display_name,
            "description": p.description,
            "tier": p.tier,
            "price_monthly_cents": p.price_monthly_cents,
            "price_yearly_cents": p.price_yearly_cents,
            "currency": p.currency,
            "trial_days": p.trial_days,
            "limits": {
                "ai_requests": p.limit_ai_requests_per_month,
                "voice_minutes": p.limit_voice_minutes_per_month,
                "whatsapp_messages": p.limit_whatsapp_messages_per_month,
                "knowledge_storage_mb": p.limit_knowledge_storage_mb,
                "users": p.limit_users,
                "phone_numbers": p.limit_phone_numbers,
                "api_calls_per_day": p.limit_api_calls_per_day,
                "rag_documents": p.limit_rag_documents,
                "notification_emails": p.limit_notification_emails_per_month,
                "notification_sms": p.limit_notification_sms_per_month,
            },
            "features": dict(p.features or {}),
            "is_public": p.is_public,
        }
        for p in plans
    ]


# ===== Subscription =====


@router.get("/subscription", summary="Get organization's subscription")
async def get_subscription(
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    sub = await svc.get_subscription(organization_id=org_id)
    plan = await svc.get_plan(uuid.UUID(sub.plan_id))
    return {
        "id": str(sub.id),
        "organization_id": sub.organization_id,
        "plan_id": sub.plan_id,
        "plan_name": plan.name,
        "plan_display_name": plan.display_name,
        "status": sub.status,
        "billing_cycle": sub.billing_cycle,
        "trial_started_at": sub.trial_started_at.isoformat() if sub.trial_started_at else None,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "auto_renew": sub.auto_renew,
        "seats": sub.seats,
        "canceled_at": sub.canceled_at.isoformat() if sub.canceled_at else None,
    }


@router.post("/subscription/upgrade", summary="Upgrade/downgrade plan")
async def upgrade_subscription(
    request: UpgradePlanRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    sub = await svc.upgrade_subscription(
        organization_id=org_id,
        new_plan_id=uuid.UUID(request.plan_id),
        billing_cycle=request.billing_cycle,
    )
    return {"id": str(sub.id), "status": sub.status, "plan_id": sub.plan_id}


@router.post("/subscription/cancel", summary="Cancel subscription")
async def cancel_subscription(
    request: CancelRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    sub = await svc.cancel_subscription(organization_id=org_id, reason=request.reason)
    return {"id": str(sub.id), "status": sub.status}


# ===== Invoices =====


@router.get("/invoices", summary="List invoices")
async def list_invoices(
    user: CurrentUser,
    db: DBSession,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    invoices, total = await svc.list_invoices(organization_id=org_id, limit=limit, offset=offset)
    return {
        "invoices": [
            {
                "id": str(inv.id),
                "invoice_number": inv.invoice_number,
                "period_start": inv.period_start.isoformat() if inv.period_start else "",
                "period_end": inv.period_end.isoformat() if inv.period_end else "",
                "total_cents": inv.total_cents,
                "currency": inv.currency,
                "status": inv.status,
                "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
                "line_items": list(inv.line_items or []),
            }
            for inv in invoices
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/invoices/{invoice_id}", summary="Get invoice")
async def get_invoice(
    invoice_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    inv = await svc.get_invoice(organization_id=org_id, invoice_id=invoice_id)
    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "period_start": inv.period_start.isoformat() if inv.period_start else "",
        "period_end": inv.period_end.isoformat() if inv.period_end else "",
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "subtotal_cents": inv.subtotal_cents,
        "discount_cents": inv.discount_cents,
        "tax_cents": inv.tax_cents,
        "total_cents": inv.total_cents,
        "currency": inv.currency,
        "status": inv.status,
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        "line_items": list(inv.line_items or []),
        "billing_name": inv.billing_name,
        "billing_email": inv.billing_email,
    }


# ===== Usage =====


@router.get("/usage", summary="Usage summary")
async def get_usage(
    user: CurrentUser,
    db: DBSession,
    month: str | None = None,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    return await svc.get_usage_summary(organization_id=org_id, month=month)


@router.post("/usage/record", summary="Record usage (internal)")
async def record_usage(
    request: RecordUsageRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    record = await svc.record_usage(
        organization_id=org_id,
        metric=request.metric,
        value=request.value,
        cost_cents=request.cost_cents,
    )
    return {"id": str(record.id), "date": record.date.isoformat() if record.date else ""}


# ===== Onboarding =====


@router.get("/onboarding", summary="Onboarding progress")
async def get_onboarding(
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    steps = await svc.get_onboarding_progress(organization_id=org_id)
    total = len(steps)
    completed = sum(1 for s in steps if s.status == "completed")
    return {
        "total_steps": total,
        "completed_steps": completed,
        "progress_percent": (completed / total * 100) if total > 0 else 0,
        "steps": [
            {
                "step_key": s.step_key,
                "step_order": s.step_order,
                "step_title": s.step_title,
                "step_description": s.step_description,
                "status": s.status,
                "is_required": s.is_required,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in steps
        ],
    }


@router.post("/onboarding/{step_key}/complete", summary="Complete onboarding step")
async def complete_onboarding_step(
    step_key: str,
    request: CompleteStepRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    step = await svc.complete_onboarding_step(
        organization_id=org_id,
        step_key=step_key,
        completed_by=user.id,
        step_data=request.step_data,
    )
    return {"step_key": step.step_key, "status": step.status}


# ===== Support Tickets =====


@router.post("/tickets", status_code=status.HTTP_201_CREATED, summary="Create support ticket")
async def create_ticket(
    request: CreateTicketRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    ticket = await svc.create_ticket(
        organization_id=org_id,
        created_by=user.id,
        subject=request.subject,
        description=request.description,
        category=request.category,
        priority=request.priority,
    )
    return {"id": str(ticket.id), "ticket_number": ticket.ticket_number, "status": ticket.status}


@router.get("/tickets", summary="List support tickets")
async def list_tickets(
    user: CurrentUser,
    db: DBSession,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    tickets, total = await svc.list_tickets(
        organization_id=org_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return {
        "tickets": [
            {
                "id": str(t.id),
                "ticket_number": t.ticket_number,
                "subject": t.subject,
                "category": t.category,
                "priority": t.priority,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else "",
                "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
            }
            for t in tickets
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/tickets/{ticket_id}/resolve", summary="Resolve ticket (admin)")
async def resolve_ticket(
    ticket_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    resolution_notes: str | None = None,
) -> dict[str, Any]:
    svc = SaaSService(db)
    ticket = await svc.resolve_ticket(
        ticket_id=ticket_id,
        resolved_by=user.id,
        resolution_notes=resolution_notes,
    )
    return {"id": str(ticket.id), "status": ticket.status}


# ===== Feature Requests =====


@router.post("/feature-requests", status_code=status.HTTP_201_CREATED, summary="Create feature request")
async def create_feature_request(
    request: CreateFeatureRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = SaaSService(db)
    fr = await svc.create_feature_request(
        organization_id=org_id,
        requested_by=user.id,
        title=request.title,
        description=request.description,
        category=request.category,
    )
    return {"id": str(fr.id), "title": fr.title, "votes": fr.votes, "status": fr.status}


@router.get("/feature-requests", summary="List feature requests")
async def list_feature_requests(
    user: CurrentUser,
    db: DBSession,
    status_filter: str | None = Query(None, alias="status"),
) -> list[dict[str, Any]]:
    svc = SaaSService(db)
    frs = await svc.list_feature_requests(status=status_filter)
    return [
        {
            "id": str(f.id),
            "title": f.title,
            "description": f.description[:200],
            "category": f.category,
            "status": f.status,
            "votes": f.votes,
            "has_voted": str(user.id) in (f.voted_by or []),
            "created_at": f.created_at.isoformat() if f.created_at else "",
        }
        for f in frs
    ]


@router.post("/feature-requests/{fr_id}/vote", summary="Vote for feature request")
async def vote_feature_request(
    fr_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    svc = SaaSService(db)
    fr = await svc.vote_feature_request(feature_request_id=fr_id, user_id=user.id)
    return {"id": str(fr.id), "votes": fr.votes}


# ===== System Status =====


@router.get("/system-status", summary="Platform status page")
async def get_system_status(
    db: DBSession,
) -> list[dict[str, Any]]:
    svc = SaaSService(db)
    statuses = await svc.list_system_status(public_only=True)
    return [
        {
            "id": str(s.id),
            "type": s.type,
            "title": s.title,
            "description": s.description,
            "severity": s.severity,
            "status": s.status,
            "affected_services": list(s.affected_services or []),
            "started_at": s.started_at.isoformat() if s.started_at else "",
            "resolved_at": s.resolved_at.isoformat() if s.resolved_at else None,
        }
        for s in statuses
    ]


# ===== Admin Dashboard =====


@router.get("/admin/dashboard", summary="Admin dashboard (super_admin)")
async def get_admin_dashboard(
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    """Platform-wide admin dashboard (requires super_admin role)."""
    if not user.is_superuser:
        from app.core.exceptions import AuthorizationError
        raise AuthorizationError("Super admin access required")
    svc = SaaSService(db)
    return await svc.get_admin_dashboard()


@router.get("/admin/organizations", summary="List all organizations (super_admin)")
async def list_organizations(
    user: CurrentUser,
    db: DBSession,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    if not user.is_superuser:
        from app.core.exceptions import AuthorizationError
        raise AuthorizationError("Super admin access required")
    svc = SaaSService(db)
    orgs, total = await svc.list_organizations(limit=limit, offset=offset)
    return {
        "organizations": [
            {
                "id": str(o.id),
                "name": o.name,
                "slug": o.slug,
                "plan": o.plan,
                "is_active": o.is_active,
                "trial_ends_at": o.trial_ends_at.isoformat() if o.trial_ends_at else None,
                "created_at": o.created_at.isoformat() if o.created_at else "",
            }
            for o in orgs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ===== Config =====


@router.get("/config", summary="SaaS configuration (public)")
async def get_config() -> dict[str, Any]:
    from app.core.config import settings
    return {
        "app_name": settings.APP_NAME,
        "app_version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "default_plan": "professional",
        "trial_days": 14,
        "currency": "USD",
        "payment_gateway_ready": True,
    }

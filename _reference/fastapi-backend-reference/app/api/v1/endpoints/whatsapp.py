"""WhatsApp REST API endpoints (Stage 2 Step 5).

Endpoints:
- Accounts:
    POST   /whatsapp/accounts            — Connect account
    GET    /whatsapp/accounts            — List accounts
    GET    /whatsapp/accounts/{id}       — Get account
    PATCH  /whatsapp/accounts/{id}       — Update account
    DELETE /whatsapp/accounts/{id}       — Delete account

- Numbers:
    POST   /whatsapp/numbers             — Register number
    GET    /whatsapp/numbers             — List numbers

- Sessions:
    GET    /whatsapp/sessions            — List sessions
    GET    /whatsapp/sessions/{id}       — Get session
    POST   /whatsapp/sessions/{id}/end   — End session
    GET    /whatsapp/sessions/{id}/messages — Get messages

- Messages:
    POST   /whatsapp/messages            — Send message

- Templates:
    POST   /whatsapp/templates           — Create template
    GET    /whatsapp/templates           — List templates
    DELETE /whatsapp/templates/{id}      — Delete template

- Handoffs:
    GET    /whatsapp/handoffs            — List handoffs
    POST   /whatsapp/handoffs            — Initiate handoff
    POST   /whatsapp/handoffs/{id}/assign  — Assign handoff
    POST   /whatsapp/handoffs/{id}/resolve — Resolve handoff

- Analytics:
    GET    /whatsapp/analytics/summary   — Aggregate analytics
"""

import uuid
from typing import Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.logging import get_logger
from app.repositories.organization import UserOrganizationRepository
from app.whatsapp import WhatsAppService

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


class AccountConnectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    business_account_id: str = Field(..., min_length=1)
    access_token: str = Field(..., min_length=1)
    verify_token: str = Field(..., min_length=1)
    app_id: str | None = None
    app_secret: str | None = None
    system_prompt: str | None = None
    greeting_message: str | None = None
    fallback_message: str | None = None
    enable_rag: bool = True
    enable_human_handoff: bool = True
    auto_reply_enabled: bool = True
    timezone: str = "UTC"


class AccountUpdateRequest(BaseModel):
    name: str | None = None
    access_token: str | None = None
    app_secret: str | None = None
    system_prompt: str | None = None
    greeting_message: str | None = None
    fallback_message: str | None = None
    enable_rag: bool | None = None
    enable_human_handoff: bool | None = None
    auto_reply_enabled: bool | None = None
    timezone: str | None = None
    escalation_phone: str | None = None
    escalation_threshold: float | None = None
    is_active: bool | None = None


class NumberRegisterRequest(BaseModel):
    account_id: str
    phone_number_id: str = Field(..., min_length=1)
    display_phone_number: str = Field(..., min_length=1)
    display_name: str = "WhatsApp Line"
    verify_with_meta: bool = False


class SendMessageRequest(BaseModel):
    account_id: str
    number_id: str
    to_number: str = Field(..., min_length=4, max_length=20)
    message_type: str = "text"
    text: str | None = None
    media_id: str | None = None
    template_name: str | None = None
    template_language: str = "en"
    template_components: list | None = None
    session_id: str | None = None


class TemplateCreateRequest(BaseModel):
    account_id: str
    name: str = Field(..., min_length=1, max_length=100)
    category: str = "MARKETING"
    body_text: str = Field(..., min_length=1)
    language: str = "en"
    header_type: str | None = None
    header_text: str | None = None
    footer_text: str | None = None
    buttons: list | None = None
    submit_to_meta: bool = False


class HandoffInitiateRequest(BaseModel):
    session_id: str
    reason: str = "manual"
    reason_details: str | None = None
    priority: str = "medium"


class HandoffAssignRequest(BaseModel):
    agent_user_id: str


class HandoffResolveRequest(BaseModel):
    resolution_notes: str | None = None
    satisfaction_score: int | None = Field(None, ge=1, le=5)


# ===== Serialization helpers =====


def _serialize_account(a: Any) -> dict[str, Any]:
    return {
        "id": str(a.id),
        "organization_id": a.organization_id,
        "name": a.name,
        "description": a.description,
        "business_account_id": a.business_account_id,
        "app_id": a.app_id,
        "is_active": a.is_active,
        "is_verified": a.is_verified,
        "business_name": a.business_name,
        "business_category": a.business_category,
        "ai_provider": a.ai_provider,
        "ai_model": a.ai_model,
        "system_prompt": a.system_prompt,
        "greeting_message": a.greeting_message,
        "fallback_message": a.fallback_message,
        "enable_rag": a.enable_rag,
        "enable_human_handoff": a.enable_human_handoff,
        "auto_reply_enabled": a.auto_reply_enabled,
        "timezone": a.timezone,
        "escalation_phone": a.escalation_phone,
        "escalation_threshold": a.escalation_threshold,
        "enable_typing_indicator": a.enable_typing_indicator,
        "last_verified_at": a.last_verified_at.isoformat() if a.last_verified_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else "",
        "updated_at": a.updated_at.isoformat() if a.updated_at else "",
        "metadata": dict(a.metadata_ or {}),
        # NOTE: access_token + app_secret are intentionally NOT serialized
    }


def _serialize_number(n: Any) -> dict[str, Any]:
    return {
        "id": str(n.id),
        "organization_id": n.organization_id,
        "account_id": n.account_id,
        "phone_number_id": n.phone_number_id,
        "display_phone_number": n.display_phone_number,
        "display_name": n.display_name,
        "quality_rating": n.quality_rating,
        "messaging_limit_tier": n.messaging_limit_tier,
        "is_active": n.is_active,
        "is_verified": n.is_verified,
        "created_at": n.created_at.isoformat() if n.created_at else "",
    }


def _serialize_session(s: Any) -> dict[str, Any]:
    return {
        "id": str(s.id),
        "organization_id": s.organization_id,
        "account_id": s.account_id,
        "number_id": s.number_id,
        "customer_phone": s.customer_phone,
        "customer_name": s.customer_name,
        "ai_conversation_id": s.ai_conversation_id,
        "status": s.status,
        "started_by": s.started_by,
        "language": s.language,
        "inbound_count": s.inbound_count,
        "outbound_count": s.outbound_count,
        "ai_response_count": s.ai_response_count,
        "human_response_count": s.human_response_count,
        "avg_ai_latency_ms": s.avg_ai_latency_ms,
        "ai_confidence_avg": s.ai_confidence_avg,
        "is_escalated": s.is_escalated,
        "escalated_at": s.escalated_at.isoformat() if s.escalated_at else None,
        "escalation_reason": s.escalation_reason,
        "summary": s.summary,
        "outcome": s.outcome,
        "sentiment": s.sentiment,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "last_message_at": s.last_message_at.isoformat() if s.last_message_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "duration_seconds": s.duration_seconds,
        "rag_used": s.rag_used,
        "rag_citations_count": s.rag_citations_count,
    }


def _serialize_message(m: Any) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "session_id": m.session_id,
        "wa_message_id": m.wa_message_id,
        "direction": m.direction,
        "from_number": m.from_number,
        "to_number": m.to_number,
        "message_type": m.message_type,
        "text": m.text,
        "media_id": m.media_id,
        "latitude": m.latitude,
        "longitude": m.longitude,
        "location_name": m.location_name,
        "interactive_type": m.interactive_type,
        "template_name": m.template_name,
        "is_ai_response": m.is_ai_response,
        "ai_confidence": m.ai_confidence,
        "ai_latency_ms": m.ai_latency_ms,
        "ai_model": m.ai_model,
        "ai_citations": list(m.ai_citations or []),
        "ai_rag_used": m.ai_rag_used,
        "ai_was_fallback": m.ai_was_fallback,
        "delivery_status": m.delivery_status,
        "delivered_at": m.delivered_at.isoformat() if m.delivered_at else None,
        "read_at": m.read_at.isoformat() if m.read_at else None,
        "created_at": m.created_at.isoformat() if m.created_at else "",
    }


def _serialize_template(t: Any) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "organization_id": t.organization_id,
        "account_id": t.account_id,
        "name": t.name,
        "language": t.language,
        "wa_template_id": t.wa_template_id,
        "category": t.category,
        "body_text": t.body_text,
        "header_type": t.header_type,
        "header_text": t.header_text,
        "footer_text": t.footer_text,
        "buttons": list(t.buttons or []),
        "status": t.status,
        "status_reason": t.status_reason,
        "quality_rating": t.quality_rating,
        "last_synced_at": t.last_synced_at.isoformat() if t.last_synced_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else "",
    }


def _serialize_handoff(h: Any) -> dict[str, Any]:
    return {
        "id": str(h.id),
        "organization_id": h.organization_id,
        "account_id": h.account_id,
        "session_id": h.session_id,
        "reason": h.reason,
        "reason_details": h.reason_details,
        "priority": h.priority,
        "assigned_to": h.assigned_to,
        "assigned_at": h.assigned_at.isoformat() if h.assigned_at else None,
        "status": h.status,
        "ai_summary": h.ai_summary,
        "ai_confidence": h.ai_confidence,
        "resolved_at": h.resolved_at.isoformat() if h.resolved_at else None,
        "resolved_by": h.resolved_by,
        "resolution_notes": h.resolution_notes,
        "satisfaction_score": h.satisfaction_score,
        "response_time_ms": h.response_time_ms,
        "created_at": h.created_at.isoformat() if h.created_at else "",
    }


# ===== Account endpoints =====


@router.post(
    "/accounts",
    status_code=status.HTTP_201_CREATED,
    summary="Connect WhatsApp Business Account",
)
async def connect_account(
    request: AccountConnectRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    account = await svc.connect_account(
        organization_id=org_id,
        created_by=user.id,
        **request.model_dump(),
    )
    return _serialize_account(account)


@router.get("/accounts", summary="List WhatsApp accounts")
async def list_accounts(
    user: CurrentUser,
    db: DBSession,
) -> list[dict[str, Any]]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    accounts = await svc.list_accounts(organization_id=org_id)
    return [_serialize_account(a) for a in accounts]


@router.get("/accounts/{account_id}", summary="Get WhatsApp account")
async def get_account(
    account_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    account = await svc.get_account(organization_id=org_id, account_id=account_id)
    return _serialize_account(account)


@router.patch("/accounts/{account_id}", summary="Update WhatsApp account")
async def update_account(
    account_id: uuid.UUID,
    request: AccountUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    account = await svc.update_account(
        organization_id=org_id,
        account_id=account_id,
        **request.model_dump(exclude_none=True),
    )
    return _serialize_account(account)


@router.delete("/accounts/{account_id}", summary="Delete WhatsApp account")
async def delete_account(
    account_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    await svc.delete_account(organization_id=org_id, account_id=account_id)
    return {"account_id": str(account_id), "deleted": True}


# ===== Number endpoints =====


@router.post(
    "/numbers",
    status_code=status.HTTP_201_CREATED,
    summary="Register WhatsApp phone number",
)
async def register_number(
    request: NumberRegisterRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    number = await svc.register_number(
        organization_id=org_id,
        account_id=uuid.UUID(request.account_id),
        phone_number_id=request.phone_number_id,
        display_phone_number=request.display_phone_number,
        display_name=request.display_name,
        verify_with_meta=request.verify_with_meta,
    )
    return _serialize_number(number)


@router.get("/numbers", summary="List WhatsApp numbers")
async def list_numbers(
    user: CurrentUser,
    db: DBSession,
    account_id: str | None = None,
) -> list[dict[str, Any]]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    numbers = await svc.list_numbers(
        organization_id=org_id,
        account_id=uuid.UUID(account_id) if account_id else None,
    )
    return [_serialize_number(n) for n in numbers]


# ===== Session endpoints =====


@router.get("/sessions", summary="List WhatsApp sessions")
async def list_sessions(
    user: CurrentUser,
    db: DBSession,
    status_filter: str | None = Query(None, alias="status"),
    account_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    sessions, total = await svc.list_sessions(
        organization_id=org_id,
        status=status_filter,
        account_id=uuid.UUID(account_id) if account_id else None,
        limit=limit,
        offset=offset,
    )
    return {
        "sessions": [_serialize_session(s) for s in sessions],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/sessions/{session_id}", summary="Get WhatsApp session")
async def get_session(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    session = await svc.get_session(organization_id=org_id, session_id=session_id)
    return _serialize_session(session)


@router.post("/sessions/{session_id}/end", summary="End WhatsApp session")
async def end_session(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    outcome: str = "completed",
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    session = await svc.end_session(
        organization_id=org_id, session_id=session_id, outcome=outcome
    )
    return _serialize_session(session)


@router.get("/sessions/{session_id}/messages", summary="Get session messages")
async def get_messages(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    messages, total = await svc.get_messages(
        organization_id=org_id,
        session_id=session_id,
        limit=limit,
        offset=offset,
    )
    return {
        "messages": [_serialize_message(m) for m in messages],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ===== Message endpoints =====


@router.post("/messages", summary="Send WhatsApp message")
async def send_message(
    request: SendMessageRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    msg = await svc.send_message(
        organization_id=org_id,
        account_id=uuid.UUID(request.account_id),
        number_id=uuid.UUID(request.number_id),
        to_number=request.to_number,
        message_type=request.message_type,
        text=request.text,
        media_id=request.media_id,
        template_name=request.template_name,
        template_language=request.template_language,
        template_components=request.template_components,
        session_id=uuid.UUID(request.session_id) if request.session_id else None,
    )
    return _serialize_message(msg)


# ===== Template endpoints =====


@router.post(
    "/templates",
    status_code=status.HTTP_201_CREATED,
    summary="Create WhatsApp template",
)
async def create_template(
    request: TemplateCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    template = await svc.create_template(
        organization_id=org_id,
        account_id=uuid.UUID(request.account_id),
        created_by=user.id,
        name=request.name,
        category=request.category,
        body_text=request.body_text,
        language=request.language,
        header_type=request.header_type,
        header_text=request.header_text,
        footer_text=request.footer_text,
        buttons=request.buttons,
        submit_to_meta=request.submit_to_meta,
    )
    return _serialize_template(template)


@router.get("/templates", summary="List WhatsApp templates")
async def list_templates(
    user: CurrentUser,
    db: DBSession,
    status_filter: str | None = Query(None, alias="status"),
) -> list[dict[str, Any]]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    templates = await svc.list_templates(
        organization_id=org_id, status=status_filter
    )
    return [_serialize_template(t) for t in templates]


@router.delete("/templates/{template_id}", summary="Delete WhatsApp template")
async def delete_template(
    template_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    delete_from_meta: bool = Query(False),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    await svc.delete_template(
        organization_id=org_id,
        template_id=template_id,
        delete_from_meta=delete_from_meta,
    )
    return {"template_id": str(template_id), "deleted": True}


# ===== Handoff endpoints =====


@router.get("/handoffs", summary="List handoffs")
async def list_handoffs(
    user: CurrentUser,
    db: DBSession,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    handoffs, total = await svc.list_handoffs(
        organization_id=org_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return {
        "handoffs": [_serialize_handoff(h) for h in handoffs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/handoffs", status_code=status.HTTP_201_CREATED, summary="Initiate handoff")
async def initiate_handoff(
    request: HandoffInitiateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    handoff = await svc.initiate_handoff(
        organization_id=org_id,
        session_id=uuid.UUID(request.session_id),
        reason=request.reason,
        reason_details=request.reason_details,
        priority=request.priority,
    )
    return _serialize_handoff(handoff)


@router.post("/handoffs/{handoff_id}/assign", summary="Assign handoff")
async def assign_handoff(
    handoff_id: uuid.UUID,
    request: HandoffAssignRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    handoff = await svc.assign_handoff(
        organization_id=org_id,
        handoff_id=handoff_id,
        agent_user_id=uuid.UUID(request.agent_user_id),
    )
    return _serialize_handoff(handoff)


@router.post("/handoffs/{handoff_id}/resolve", summary="Resolve handoff")
async def resolve_handoff(
    handoff_id: uuid.UUID,
    request: HandoffResolveRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    handoff = await svc.resolve_handoff(
        organization_id=org_id,
        handoff_id=handoff_id,
        resolved_by=user.id,
        resolution_notes=request.resolution_notes,
        satisfaction_score=request.satisfaction_score,
    )
    return _serialize_handoff(handoff)


# ===== Analytics =====


@router.get("/analytics/summary", summary="Get WhatsApp analytics")
async def get_analytics(
    user: CurrentUser,
    db: DBSession,
    days: int = Query(30, ge=1, le=365),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = WhatsAppService(db)
    return await svc.get_analytics_summary(organization_id=org_id, days=days)


# ===== Config (public) =====


@router.get("/config", summary="Get WhatsApp configuration (public)")
async def get_config() -> dict[str, Any]:
    from app.core.config import settings

    return {
        "whatsapp_provider": settings.WHATSAPP_PROVIDER,
        "api_version": settings.WHATSAPP_API_VERSION,
        "enable_media_upload": settings.ENABLE_MEDIA_UPLOAD,
        "enable_template_messages": settings.ENABLE_TEMPLATE_MESSAGES,
        "enable_typing_indicator": settings.WHATSAPP_ENABLE_TYPING_INDICATOR,
        "session_timeout_minutes": settings.WHATSAPP_SESSION_TIMEOUT_MINUTES,
        "max_message_length": settings.WHATSAPP_MAX_MESSAGE_LENGTH,
        "media_max_size_mb": settings.WHATSAPP_MEDIA_MAX_SIZE_MB,
        "meta_configured": bool(settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID),
    }

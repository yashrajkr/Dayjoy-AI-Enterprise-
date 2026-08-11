"""Notification Platform REST API endpoints (Stage 2 Step 6).

Endpoints:
- Send:
    POST /notifications/email           — Send email
    POST /notifications/sms             — Send SMS
    POST /notifications/push            — Send push notification
    POST /notifications/in-app          — Send in-app notification
    POST /notifications/bulk            — Bulk send

- Templates:
    POST /notifications/templates       — Create template
    GET  /notifications/templates       — List templates
    DELETE /notifications/templates/{id} — Delete template

- Branding:
    GET  /notifications/branding        — Get branding
    PATCH /notifications/branding       — Update branding

- Preferences:
    GET  /notifications/preferences     — Get user preferences
    PATCH /notifications/preferences    — Update preference

- History + Analytics:
    GET  /notifications/history         — Notification history
    GET  /notifications/{id}/logs       — Delivery logs
    GET  /notifications/analytics/summary — Analytics
"""

import uuid
from typing import Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.logging import get_logger
from app.repositories.organization import UserOrganizationRepository
from app.notifications import NotificationService

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


class SendEmailRequest(BaseModel):
    to: str = Field(..., min_length=3)
    subject: str | None = None
    html: str | None = None
    text: str | None = None
    template_name: str | None = None
    variables: dict[str, Any] | None = None
    from_email: str | None = None
    from_name: str | None = None
    reply_to: str | None = None
    priority: str = "normal"
    recipient_user_id: str | None = None
    recipient_name: str | None = None


class SendSMSRequest(BaseModel):
    to: str = Field(..., min_length=4)
    body: str | None = None
    template_name: str | None = None
    variables: dict[str, Any] | None = None
    from_number: str | None = None
    sender_id: str | None = None
    priority: str = "normal"
    recipient_user_id: str | None = None
    recipient_name: str | None = None


class SendPushRequest(BaseModel):
    token: str = Field(..., min_length=10)
    title: str | None = None
    body: str | None = None
    template_name: str | None = None
    variables: dict[str, Any] | None = None
    data: dict[str, Any] | None = None
    icon: str | None = None
    click_action: str | None = None
    priority: str = "normal"
    recipient_user_id: str | None = None


class SendInAppRequest(BaseModel):
    user_id: str
    title: str = Field(..., min_length=1)
    body: str = Field(..., min_length=1)
    notification_type: str = "info"
    category: str | None = None
    link: str | None = None
    data: dict[str, Any] | None = None
    priority: str = "normal"


class BulkSendRequest(BaseModel):
    channel: str = Field(..., pattern="^(email|sms|push)$")
    recipients: list[dict[str, Any]] = Field(..., min_length=1, max_length=1000)
    template_name: str
    common_variables: dict[str, Any] | None = None
    priority: str = "normal"


class TemplateCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    channel: str = Field(..., pattern="^(email|sms|push|in_app)$")
    subject: str | None = None
    body_html: str | None = None
    body_text: str | None = None
    template_type: str = "transactional"
    language: str = "en"
    variables: dict[str, Any] | None = None
    apply_branding: bool = True
    description: str | None = None


class BrandingUpdateRequest(BaseModel):
    company_name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    background_color: str | None = None
    text_color: str | None = None
    email_wrapper_html: str | None = None
    footer_text: str | None = None
    sms_sender_id: str | None = None
    sms_opt_out_text: str | None = None
    push_icon_url: str | None = None
    push_color: str | None = None


class PreferenceUpdateRequest(BaseModel):
    channel: str
    template_type: str = "all"
    is_subscribed: bool = True
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    quiet_hours_timezone: str = "UTC"
    daily_cap: int | None = None


# ===== Serialization =====


def _serialize_notification(n: Any) -> dict[str, Any]:
    return {
        "id": str(n.id),
        "organization_id": n.organization_id,
        "template_name": n.template_name,
        "channel": n.channel,
        "provider": n.provider,
        "recipient": n.recipient,
        "recipient_user_id": n.recipient_user_id,
        "recipient_name": n.recipient_name,
        "subject": n.subject,
        "body_text": n.body_text,
        "priority": n.priority,
        "status": n.status,
        "provider_message_id": n.provider_message_id,
        "sent_at": n.sent_at.isoformat() if hasattr(n, "sent_at") and n.sent_at else None,
        "delivered_at": n.delivered_at.isoformat() if hasattr(n, "delivered_at") and n.delivered_at else None,
        "retry_count": n.retry_count,
        "error_message": n.error_message,
        "created_at": n.created_at.isoformat() if n.created_at else "",
    }


def _serialize_template(t: Any) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "channel": t.channel,
        "template_type": t.template_type,
        "language": t.language,
        "subject": t.subject,
        "body_html": t.body_html,
        "body_text": t.body_text,
        "variables": dict(t.variables or {}),
        "apply_branding": t.apply_branding,
        "version": t.version,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat() if t.created_at else "",
    }


def _serialize_branding(b: Any) -> dict[str, Any]:
    return {
        "id": str(b.id),
        "organization_id": b.organization_id,
        "company_name": b.company_name,
        "logo_url": b.logo_url,
        "primary_color": b.primary_color,
        "secondary_color": b.secondary_color,
        "background_color": b.background_color,
        "text_color": b.text_color,
        "footer_text": b.footer_text,
        "sms_sender_id": b.sms_sender_id,
        "sms_opt_out_text": b.sms_opt_out_text,
        "push_icon_url": b.push_icon_url,
        "push_color": b.push_color,
        "is_active": b.is_active,
    }


def _serialize_preference(p: Any) -> dict[str, Any]:
    return {
        "id": str(p.id),
        "channel": p.channel,
        "template_type": p.template_type,
        "is_subscribed": p.is_subscribed,
        "quiet_hours_start": p.quiet_hours_start,
        "quiet_hours_end": p.quiet_hours_end,
        "quiet_hours_timezone": p.quiet_hours_timezone,
        "daily_cap": p.daily_cap,
    }


# ===== Send endpoints =====


@router.post("/email", summary="Send email notification")
async def send_email(
    request: SendEmailRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    notification = await svc.send_email(
        organization_id=org_id,
        created_by=user.id,
        **request.model_dump(),
    )
    return _serialize_notification(notification)


@router.post("/sms", summary="Send SMS notification")
async def send_sms(
    request: SendSMSRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    notification = await svc.send_sms(
        organization_id=org_id,
        created_by=user.id,
        **request.model_dump(),
    )
    return _serialize_notification(notification)


@router.post("/push", summary="Send push notification")
async def send_push(
    request: SendPushRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    notification = await svc.send_push(
        organization_id=org_id,
        created_by=user.id,
        **request.model_dump(),
    )
    return _serialize_notification(notification)


@router.post("/in-app", summary="Send in-app notification")
async def send_in_app(
    request: SendInAppRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    notification = await svc.send_in_app(
        organization_id=org_id,
        created_by=user.id,
        user_id=uuid.UUID(request.user_id),
        title=request.title,
        body=request.body,
        notification_type=request.notification_type,
        category=request.category,
        link=request.link,
        data=request.data,
        priority=request.priority,
    )
    return _serialize_notification(notification)


@router.post("/bulk", summary="Bulk send notifications")
async def send_bulk(
    request: BulkSendRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    result = await svc.send_bulk(
        organization_id=org_id,
        created_by=user.id,
        channel=request.channel,
        recipients=request.recipients,
        template_name=request.template_name,
        common_variables=request.common_variables,
        priority=request.priority,
    )
    return result


# ===== Template endpoints =====


@router.post("/templates", status_code=status.HTTP_201_CREATED, summary="Create notification template")
async def create_template(
    request: TemplateCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    template = await svc.create_template(
        organization_id=org_id,
        created_by=user.id,
        **request.model_dump(),
    )
    return _serialize_template(template)


@router.get("/templates", summary="List notification templates")
async def list_templates(
    user: CurrentUser,
    db: DBSession,
    channel: str | None = None,
    template_type: str | None = None,
) -> list[dict[str, Any]]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    templates = await svc.list_templates(
        organization_id=org_id,
        channel=channel,
        template_type=template_type,
    )
    return [_serialize_template(t) for t in templates]


@router.delete("/templates/{template_id}", summary="Delete notification template")
async def delete_template(
    template_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    await svc.delete_template(organization_id=org_id, template_id=template_id)
    return {"template_id": str(template_id), "deleted": True}


# ===== Branding endpoints =====


@router.get("/branding", summary="Get notification branding")
async def get_branding(
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    branding = await svc.get_branding(organization_id=org_id)
    return _serialize_branding(branding)


@router.patch("/branding", summary="Update notification branding")
async def update_branding(
    request: BrandingUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    branding = await svc.update_branding(
        organization_id=org_id,
        **request.model_dump(exclude_none=True),
    )
    return _serialize_branding(branding)


# ===== Preference endpoints =====


@router.get("/preferences", summary="Get notification preferences")
async def get_preferences(
    user: CurrentUser,
    db: DBSession,
) -> list[dict[str, Any]]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    prefs = await svc.get_preferences(organization_id=org_id, user_id=user.id)
    return [_serialize_preference(p) for p in prefs]


@router.patch("/preferences", summary="Update notification preference")
async def update_preference(
    request: PreferenceUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    pref = await svc.update_preference(
        organization_id=org_id,
        user_id=user.id,
        channel=request.channel,
        template_type=request.template_type,
        is_subscribed=request.is_subscribed,
        quiet_hours_start=request.quiet_hours_start,
        quiet_hours_end=request.quiet_hours_end,
        quiet_hours_timezone=request.quiet_hours_timezone,
        daily_cap=request.daily_cap,
    )
    return _serialize_preference(pref)


# ===== History + Analytics =====


@router.get("/history", summary="Notification history")
async def list_notifications(
    user: CurrentUser,
    db: DBSession,
    channel: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    recipient: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    notifications, total = await svc.list_notifications(
        organization_id=org_id,
        channel=channel,
        status=status_filter,
        recipient=recipient,
        limit=limit,
        offset=offset,
    )
    return {
        "notifications": [_serialize_notification(n) for n in notifications],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{notification_id}/logs", summary="Get delivery logs")
async def get_notification_logs(
    notification_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> list[dict[str, Any]]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    logs = await svc.get_notification_logs(
        organization_id=org_id,
        notification_id=notification_id,
    )
    return [
        {
            "id": str(l.id),
            "attempt": l.attempt,
            "status": l.status,
            "provider": l.provider,
            "provider_message_id": l.provider_message_id,
            "error_message": l.error_message,
            "latency_ms": l.latency_ms,
            "created_at": l.created_at.isoformat() if l.created_at else "",
        }
        for l in logs
    ]


@router.get("/analytics/summary", summary="Notification analytics")
async def get_analytics(
    user: CurrentUser,
    db: DBSession,
    days: int = Query(30, ge=1, le=365),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = NotificationService(db)
    return await svc.get_analytics_summary(organization_id=org_id, days=days)


@router.get("/config", summary="Get notification config (public)")
async def get_config() -> dict[str, Any]:
    from app.core.config import settings
    return {
        "email_provider": settings.EMAIL_PROVIDER,
        "sms_provider": settings.SMS_PROVIDER,
        "enable_email": settings.ENABLE_EMAIL,
        "enable_sms": settings.ENABLE_SMS,
        "enable_push": settings.ENABLE_PUSH_NOTIFICATIONS,
        "default_from_email": settings.DEFAULT_FROM_EMAIL,
        "default_from_name": settings.DEFAULT_FROM_NAME,
        "resend_configured": bool(settings.RESEND_API_KEY),
        "sendgrid_configured": bool(settings.SENDGRID_API_KEY),
        "twilio_configured": bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN),
        "fcm_configured": bool(settings.FCM_SERVER_KEY or settings.FCM_PROJECT_ID),
    }

"""Telephony REST API endpoints (Stage 2 Step 4).

Endpoints:
- Phone numbers:
    POST   /telephony/phone-numbers           — Register phone number
    GET    /telephony/phone-numbers           — List phone numbers
    GET    /telephony/phone-numbers/{id}      — Get phone number
    PATCH  /telephony/phone-numbers/{id}      — Update phone number
    DELETE /telephony/phone-numbers/{id}      — Delete phone number

- Calls:
    GET    /telephony/calls/active            — List active calls
    GET    /telephony/calls/history           — List call history
    GET    /telephony/calls/{id}              — Get call session
    POST   /telephony/calls/{id}/end          — End call
    POST   /telephony/calls/{id}/transfer     — Transfer call
    POST   /telephony/calls/{id}/hold         — Hold call
    POST   /telephony/calls/{id}/resume       — Resume call

- Recordings:
    GET    /telephony/recordings              — List recordings
    GET    /telephony/recordings/{id}         — Get recording

- Routing rules:
    POST   /telephony/routing-rules           — Create routing rule
    GET    /telephony/routing-rules           — List routing rules
    DELETE /telephony/routing-rules/{id}      — Delete routing rule

- Business hours:
    POST   /telephony/business-hours          — Create schedule
    GET    /telephony/business-hours          — List schedules

- Settings + analytics + providers:
    GET    /telephony/settings                — Get settings
    PATCH  /telephony/settings                — Update settings
    GET    /telephony/analytics/summary       — Aggregate analytics
    GET    /telephony/providers               — List registered providers
    GET    /telephony/config                  — Public config
"""

import uuid
from typing import Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.organization import UserOrganizationRepository
from app.telephony import TelephonyService

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


class PhoneNumberCreateRequest(BaseModel):
    number: str = Field(..., min_length=5, max_length=20)
    display_name: str = "Main Line"
    description: str | None = None
    provider_type: str | None = None
    provider_number_sid: str | None = None
    country_code: str = "US"
    number_type: str = "local"
    routing_strategy: str = "ai"
    voice_assistant_id: str | None = None
    forward_to_number: str | None = None
    business_hours_id: str | None = None
    recording_enabled: bool = True
    recording_announcement: str | None = None
    verify_with_provider: bool = False
    metadata: dict[str, Any] | None = None


class PhoneNumberUpdateRequest(BaseModel):
    display_name: str | None = None
    description: str | None = None
    routing_strategy: str | None = None
    voice_assistant_id: str | None = None
    forward_to_number: str | None = None
    business_hours_id: str | None = None
    recording_enabled: bool | None = None
    recording_announcement: str | None = None
    is_active: bool | None = None


class PhoneNumberResponse(BaseModel):
    id: str
    organization_id: str
    number: str
    display_name: str
    description: str | None
    provider_type: str
    provider_number_sid: str | None
    country_code: str
    number_type: str
    voice_enabled: bool
    sms_enabled: bool
    routing_strategy: str
    voice_assistant_id: str | None
    forward_to_number: str | None
    business_hours_id: str | None
    recording_enabled: bool
    recording_announcement: str | None
    is_active: bool
    is_verified: bool
    created_at: str
    updated_at: str
    metadata: dict[str, Any]


class CallSessionResponse(BaseModel):
    id: str
    organization_id: str
    provider: str
    call_sid: str
    phone_number_id: str | None
    voice_session_id: str | None
    voice_assistant_id: str | None
    direction: str
    from_number: str
    to_number: str
    caller_name: str | None
    customer_id: str | None
    status: str
    routing_decision: str | None
    routing_reason: str | None
    started_at: str | None
    answered_at: str | None
    ended_at: str | None
    duration_seconds: int
    wait_time_seconds: int
    ai_talk_time_seconds: int
    customer_talk_time_seconds: int
    transferred_to: str | None
    transfer_reason: str | None
    hold_count: int
    total_hold_seconds: int
    recording_enabled: bool
    recording_id: str | None
    outcome: str | None
    sentiment: str | None
    is_voicemail: bool
    error_message: str | None
    hangup_cause: str | None
    hangup_by: str | None
    metadata: dict[str, Any]


class CallLogResponse(BaseModel):
    id: str
    call_sid: str
    provider: str
    direction: str
    from_number: str
    to_number: str
    caller_name: str | None
    customer_id: str | None
    phone_number_id: str | None
    voice_session_id: str | None
    status: str
    outcome: str | None
    routing_decision: str | None
    started_at: str | None
    answered_at: str | None
    ended_at: str | None
    duration_seconds: int
    wait_time_seconds: int
    has_recording: bool
    recording_id: str | None
    transferred_to: str | None
    ai_handled: bool
    ai_resolution: bool
    ai_latency_ms: int | None
    ai_turns: int
    cost_cents: int
    sentiment: str | None
    error_message: str | None
    hangup_cause: str | None


class TransferCallRequest(BaseModel):
    to_number: str = Field(..., min_length=5, max_length=20)
    reason: str = "manual"


class RoutingRuleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    action: str = Field(..., pattern="^(ai|forward|voicemail|reject|queue)$")
    conditions: dict[str, Any] | None = None
    action_config: dict[str, Any] | None = None
    priority: int = 100
    phone_number_id: str | None = None
    description: str | None = None


class RoutingRuleResponse(BaseModel):
    id: str
    name: str
    description: str | None
    priority: int
    conditions: dict[str, Any]
    action: str
    action_config: dict[str, Any]
    phone_number_id: str | None
    is_active: bool
    created_at: str


class BusinessHoursCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    timezone: str = "UTC"
    weekly_schedule: dict[str, Any] | None = None
    holidays: list | None = None
    after_hours_strategy: str = "voicemail"
    after_hours_forward_to: str | None = None
    after_hours_message: str | None = None
    description: str | None = None
    is_default: bool = False


class BusinessHoursResponse(BaseModel):
    id: str
    name: str
    description: str | None
    timezone: str
    weekly_schedule: dict[str, Any]
    holidays: list
    after_hours_strategy: str
    after_hours_forward_to: str | None
    after_hours_message: str | None
    is_active: bool
    is_default: bool
    created_at: str


class SettingsUpdateRequest(BaseModel):
    provider: str | None = None
    default_routing_strategy: str | None = None
    default_voice_assistant_id: str | None = None
    enable_recording: bool | None = None
    recording_format: str | None = None
    recording_channels: str | None = None
    enable_voicemail: bool | None = None
    voicemail_max_duration: int | None = None
    webhook_base_url: str | None = None
    webhook_secret: str | None = None
    max_call_duration: int | None = None
    enable_media_stream: bool | None = None


# ===== Serialization =====


def _serialize_phone(p: Any) -> PhoneNumberResponse:
    return PhoneNumberResponse(
        id=str(p.id),
        organization_id=p.organization_id,
        number=p.number,
        display_name=p.display_name,
        description=p.description,
        provider_type=p.provider_type,
        provider_number_sid=p.provider_number_sid,
        country_code=p.country_code,
        number_type=p.number_type,
        voice_enabled=p.voice_enabled,
        sms_enabled=p.sms_enabled,
        routing_strategy=p.routing_strategy,
        voice_assistant_id=p.voice_assistant_id,
        forward_to_number=p.forward_to_number,
        business_hours_id=p.business_hours_id,
        recording_enabled=p.recording_enabled,
        recording_announcement=p.recording_announcement,
        is_active=p.is_active,
        is_verified=p.is_verified,
        created_at=p.created_at.isoformat() if p.created_at else "",
        updated_at=p.updated_at.isoformat() if p.updated_at else "",
        metadata=dict(p.metadata_ or {}),
    )


def _serialize_session(s: Any) -> CallSessionResponse:
    return CallSessionResponse(
        id=str(s.id),
        organization_id=s.organization_id,
        provider=s.provider,
        call_sid=s.call_sid,
        phone_number_id=str(s.phone_number_id) if s.phone_number_id else None,
        voice_session_id=str(s.voice_session_id) if s.voice_session_id else None,
        voice_assistant_id=str(s.voice_assistant_id) if s.voice_assistant_id else None,
        direction=s.direction,
        from_number=s.from_number,
        to_number=s.to_number,
        caller_name=s.caller_name,
        customer_id=str(s.customer_id) if s.customer_id else None,
        status=s.status,
        routing_decision=s.routing_decision,
        routing_reason=s.routing_reason,
        started_at=s.started_at.isoformat() if s.started_at else None,
        answered_at=s.answered_at.isoformat() if s.answered_at else None,
        ended_at=s.ended_at.isoformat() if s.ended_at else None,
        duration_seconds=s.duration_seconds,
        wait_time_seconds=s.wait_time_seconds,
        ai_talk_time_seconds=s.ai_talk_time_seconds,
        customer_talk_time_seconds=s.customer_talk_time_seconds,
        transferred_to=s.transferred_to,
        transfer_reason=s.transfer_reason,
        hold_count=s.hold_count,
        total_hold_seconds=s.total_hold_seconds,
        recording_enabled=s.recording_enabled,
        recording_id=str(s.recording_id) if s.recording_id else None,
        outcome=s.outcome,
        sentiment=s.sentiment,
        is_voicemail=s.is_voicemail,
        error_message=s.error_message,
        hangup_cause=s.hangup_cause,
        hangup_by=s.hangup_by,
        metadata=dict(s.metadata_ or {}),
    )


def _serialize_log(l: Any) -> CallLogResponse:
    return CallLogResponse(
        id=str(l.id),
        call_sid=l.call_sid,
        provider=l.provider,
        direction=l.direction,
        from_number=l.from_number,
        to_number=l.to_number,
        caller_name=l.caller_name,
        customer_id=str(l.customer_id) if l.customer_id else None,
        phone_number_id=str(l.phone_number_id) if l.phone_number_id else None,
        voice_session_id=l.voice_session_id,
        status=l.status,
        outcome=l.outcome,
        routing_decision=l.routing_decision,
        started_at=l.started_at.isoformat() if l.started_at else None,
        answered_at=l.answered_at.isoformat() if l.answered_at else None,
        ended_at=l.ended_at.isoformat() if l.ended_at else None,
        duration_seconds=l.duration_seconds,
        wait_time_seconds=l.wait_time_seconds,
        has_recording=l.has_recording,
        recording_id=str(l.recording_id) if l.recording_id else None,
        transferred_to=l.transferred_to,
        ai_handled=l.ai_handled,
        ai_resolution=l.ai_resolution,
        ai_latency_ms=l.ai_latency_ms,
        ai_turns=l.ai_turns,
        cost_cents=l.cost_cents,
        sentiment=l.sentiment,
        error_message=l.error_message,
        hangup_cause=l.hangup_cause,
    )


def _serialize_rule(r: Any) -> RoutingRuleResponse:
    return RoutingRuleResponse(
        id=str(r.id),
        name=r.name,
        description=r.description,
        priority=r.priority,
        conditions=dict(r.conditions or {}),
        action=r.action,
        action_config=dict(r.action_config or {}),
        phone_number_id=str(r.phone_number_id) if r.phone_number_id else None,
        is_active=r.is_active,
        created_at=r.created_at.isoformat() if r.created_at else "",
    )


def _serialize_business_hours(b: Any) -> BusinessHoursResponse:
    return BusinessHoursResponse(
        id=str(b.id),
        name=b.name,
        description=b.description,
        timezone=b.timezone,
        weekly_schedule=dict(b.weekly_schedule or {}),
        holidays=list(b.holidays or []),
        after_hours_strategy=b.after_hours_strategy,
        after_hours_forward_to=b.after_hours_forward_to,
        after_hours_message=b.after_hours_message,
        is_active=b.is_active,
        is_default=b.is_default,
        created_at=b.created_at.isoformat() if b.created_at else "",
    )


# ===== Phone number endpoints =====


@router.post(
    "/phone-numbers",
    response_model=PhoneNumberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a phone number",
)
async def register_phone_number(
    request: PhoneNumberCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> PhoneNumberResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    phone = await svc.register_phone_number(
        organization_id=org_id,
        number=request.number,
        display_name=request.display_name,
        description=request.description,
        provider_type=request.provider_type,
        provider_number_sid=request.provider_number_sid,
        country_code=request.country_code,
        number_type=request.number_type,
        routing_strategy=request.routing_strategy,
        voice_assistant_id=uuid.UUID(request.voice_assistant_id) if request.voice_assistant_id else None,
        forward_to_number=request.forward_to_number,
        business_hours_id=uuid.UUID(request.business_hours_id) if request.business_hours_id else None,
        recording_enabled=request.recording_enabled,
        recording_announcement=request.recording_announcement,
        verify_with_provider=request.verify_with_provider,
        metadata=request.metadata,
    )
    return _serialize_phone(phone)


@router.get("/phone-numbers", response_model=list[PhoneNumberResponse], summary="List phone numbers")
async def list_phone_numbers(
    user: CurrentUser,
    db: DBSession,
) -> list[PhoneNumberResponse]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    phones = await svc.list_phone_numbers(organization_id=org_id)
    return [_serialize_phone(p) for p in phones]


@router.get("/phone-numbers/{phone_id}", response_model=PhoneNumberResponse)
async def get_phone_number(
    phone_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> PhoneNumberResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    phone = await svc.get_phone_number(
        organization_id=org_id, phone_number_id=phone_id
    )
    return _serialize_phone(phone)


@router.patch("/phone-numbers/{phone_id}", response_model=PhoneNumberResponse)
async def update_phone_number(
    phone_id: uuid.UUID,
    request: PhoneNumberUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> PhoneNumberResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    update_data = request.model_dump(exclude_none=True)
    if "voice_assistant_id" in update_data and update_data["voice_assistant_id"]:
        update_data["voice_assistant_id"] = str(update_data["voice_assistant_id"])
    if "business_hours_id" in update_data and update_data["business_hours_id"]:
        update_data["business_hours_id"] = str(update_data["business_hours_id"])
    phone = await svc.update_phone_number(
        organization_id=org_id,
        phone_number_id=phone_id,
        **update_data,
    )
    return _serialize_phone(phone)


@router.delete("/phone-numbers/{phone_id}", summary="Delete phone number")
async def delete_phone_number(
    phone_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    release: bool = Query(False, description="Release from provider"),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    await svc.delete_phone_number(
        organization_id=org_id,
        phone_number_id=phone_id,
        release_from_provider=release,
    )
    return {"phone_number_id": str(phone_id), "deleted": True}


# ===== Call endpoints =====


@router.get("/calls/active", response_model=list[CallSessionResponse], summary="List active calls")
async def list_active_calls(
    user: CurrentUser,
    db: DBSession,
) -> list[CallSessionResponse]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    sessions = await svc.list_active_calls(organization_id=org_id)
    return [_serialize_session(s) for s in sessions]


@router.get("/calls/history", summary="List call history")
async def list_call_history(
    user: CurrentUser,
    db: DBSession,
    phone_number_id: str | None = None,
    direction: str | None = None,
    outcome: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    logs, total = await svc.list_call_history(
        organization_id=org_id,
        phone_number_id=uuid.UUID(phone_number_id) if phone_number_id else None,
        direction=direction,
        outcome=outcome,
        limit=limit,
        offset=offset,
    )
    return {
        "calls": [_serialize_log(l) for l in logs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/calls/{session_id}", response_model=CallSessionResponse)
async def get_call(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> CallSessionResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    session = await svc.get_session(
        organization_id=org_id, session_id=session_id
    )
    return _serialize_session(session)


@router.post("/calls/{session_id}/end", response_model=CallSessionResponse)
async def end_call(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    outcome: str = "caller_ended",
) -> CallSessionResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    session = await svc.end_call(
        organization_id=org_id, session_id=session_id, outcome=outcome
    )
    return _serialize_session(session)


@router.post("/calls/{session_id}/transfer", response_model=CallSessionResponse)
async def transfer_call(
    session_id: uuid.UUID,
    request: TransferCallRequest,
    user: CurrentUser,
    db: DBSession,
) -> CallSessionResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    session = await svc.transfer_call(
        organization_id=org_id,
        session_id=session_id,
        to_number=request.to_number,
        reason=request.reason,
    )
    return _serialize_session(session)


@router.post("/calls/{session_id}/hold", response_model=CallSessionResponse)
async def hold_call(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> CallSessionResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    session = await svc.hold_call(
        organization_id=org_id, session_id=session_id
    )
    return _serialize_session(session)


@router.post("/calls/{session_id}/resume", response_model=CallSessionResponse)
async def resume_call(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> CallSessionResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    session = await svc.resume_call(
        organization_id=org_id, session_id=session_id
    )
    return _serialize_session(session)


# ===== Recording endpoints =====


@router.get("/recordings", summary="List recordings")
async def list_recordings(
    user: CurrentUser,
    db: DBSession,
    session_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    recordings, total = await svc.list_recordings(
        organization_id=org_id,
        session_id=uuid.UUID(session_id) if session_id else None,
        limit=limit,
        offset=offset,
    )
    return {
        "recordings": [
            {
                "id": str(r.id),
                "session_id": str(r.session_id),
                "call_sid": r.call_sid,
                "recording_sid": r.recording_sid,
                "url": r.url,
                "stored_url": r.stored_url,
                "duration_seconds": r.duration_seconds,
                "format": r.format,
                "channels": r.channels,
                "status": r.status,
                "size_bytes": r.size_bytes,
                "access_level": r.access_level,
                "consent_obtained": r.consent_obtained,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in recordings
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/recordings/{recording_id}", summary="Get recording")
async def get_recording(
    recording_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    r = await svc.get_recording(
        organization_id=org_id, recording_id=recording_id
    )
    return {
        "id": str(r.id),
        "session_id": str(r.session_id),
        "call_sid": r.call_sid,
        "recording_sid": r.recording_sid,
        "url": r.url,
        "stored_url": r.stored_url,
        "duration_seconds": r.duration_seconds,
        "format": r.format,
        "channels": r.channels,
        "status": r.status,
        "size_bytes": r.size_bytes,
        "access_level": r.access_level,
        "consent_obtained": r.consent_obtained,
        "consent_method": r.consent_method,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# ===== Routing rules =====


@router.post(
    "/routing-rules",
    response_model=RoutingRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create routing rule",
)
async def create_routing_rule(
    request: RoutingRuleCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> RoutingRuleResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    rule = await svc.create_routing_rule(
        organization_id=org_id,
        created_by=user.id,
        name=request.name,
        action=request.action,
        conditions=request.conditions,
        action_config=request.action_config,
        priority=request.priority,
        phone_number_id=uuid.UUID(request.phone_number_id) if request.phone_number_id else None,
        description=request.description,
    )
    return _serialize_rule(rule)


@router.get("/routing-rules", response_model=list[RoutingRuleResponse], summary="List routing rules")
async def list_routing_rules(
    user: CurrentUser,
    db: DBSession,
    phone_number_id: str | None = None,
) -> list[RoutingRuleResponse]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    rules = await svc.list_routing_rules(
        organization_id=org_id,
        phone_number_id=uuid.UUID(phone_number_id) if phone_number_id else None,
    )
    return [_serialize_rule(r) for r in rules]


@router.delete("/routing-rules/{rule_id}", summary="Delete routing rule")
async def delete_routing_rule(
    rule_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    await svc.delete_routing_rule(
        organization_id=org_id, rule_id=rule_id
    )
    return {"rule_id": str(rule_id), "deleted": True}


# ===== Business hours =====


@router.post(
    "/business-hours",
    response_model=BusinessHoursResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create business hours schedule",
)
async def create_business_hours(
    request: BusinessHoursCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> BusinessHoursResponse:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    schedule = await svc.create_business_hours(
        organization_id=org_id,
        name=request.name,
        timezone=request.timezone,
        weekly_schedule=request.weekly_schedule,
        holidays=request.holidays,
        after_hours_strategy=request.after_hours_strategy,
        after_hours_forward_to=request.after_hours_forward_to,
        after_hours_message=request.after_hours_message,
        description=request.description,
        is_default=request.is_default,
    )
    return _serialize_business_hours(schedule)


@router.get("/business-hours", response_model=list[BusinessHoursResponse], summary="List business hours")
async def list_business_hours(
    user: CurrentUser,
    db: DBSession,
) -> list[BusinessHoursResponse]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    schedules = await svc.list_business_hours(organization_id=org_id)
    return [_serialize_business_hours(s) for s in schedules]


# ===== Settings + analytics + providers =====


@router.get("/settings", summary="Get telephony settings")
async def get_settings(
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    s = await svc.get_settings(organization_id=org_id)
    return {
        "id": str(s.id),
        "organization_id": s.organization_id,
        "provider": s.provider,
        "default_provider_id": str(s.default_provider_id) if s.default_provider_id else None,
        "default_phone_number_id": str(s.default_phone_number_id) if s.default_phone_number_id else None,
        "default_business_hours_id": str(s.default_business_hours_id) if s.default_business_hours_id else None,
        "default_routing_strategy": s.default_routing_strategy,
        "default_voice_assistant_id": s.default_voice_assistant_id,
        "enable_recording": s.enable_recording,
        "recording_format": s.recording_format,
        "recording_channels": s.recording_channels,
        "enable_voicemail": s.enable_voicemail,
        "voicemail_max_duration": s.voicemail_max_duration,
        "webhook_base_url": s.webhook_base_url,
        "max_call_duration": s.max_call_duration,
        "enable_media_stream": s.enable_media_stream,
        "is_active": s.is_active,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.patch("/settings", summary="Update telephony settings")
async def update_settings(
    request: SettingsUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    update_data = request.model_dump(exclude_none=True)
    s = await svc.update_settings(organization_id=org_id, **update_data)
    return {
        "id": str(s.id),
        "provider": s.provider,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.get("/analytics/summary", summary="Get telephony analytics")
async def get_analytics_summary(
    user: CurrentUser,
    db: DBSession,
    days: int = Query(30, ge=1, le=365),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = TelephonyService(db)
    return await svc.get_analytics_summary(organization_id=org_id, days=days)


@router.get("/providers", summary="List registered telephony providers")
async def list_providers() -> list[dict[str, Any]]:
    from app.telephony.providers import TELEPHONY_PROVIDER_REGISTRY

    return [
        {
            "name": name,
            "class": cls.__name__,
            "implemented": name == "twilio",
        }
        for name, cls in TELEPHONY_PROVIDER_REGISTRY.items()
    ]


@router.get("/config", summary="Get telephony configuration (public)")
async def get_config() -> dict[str, Any]:
    return {
        "telephony_provider": settings.TELEPHONY_PROVIDER,
        "twilio_configured": bool(
            settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN
        ),
        "default_country_code": settings.DEFAULT_COUNTRY_CODE,
        "enable_call_recording": settings.ENABLE_CALL_RECORDING,
        "recording_format": settings.RECORDING_FORMAT,
        "recording_channels": settings.RECORDING_CHANNELS,
        "max_call_duration": settings.MAX_CALL_DURATION,
        "enable_voicemail": settings.ENABLE_VOICEMAIL,
        "voicemail_max_duration": settings.VOICEMAIL_MAX_DURATION,
        "default_routing_strategy": settings.DEFAULT_ROUTING_STRATEGY,
        "enable_media_stream": settings.ENABLE_MEDIA_STREAM,
        "media_stream_sample_rate": settings.MEDIA_STREAM_SAMPLE_RATE,
        "call_retry_max_attempts": settings.CALL_RETRY_MAX_ATTEMPTS,
    }

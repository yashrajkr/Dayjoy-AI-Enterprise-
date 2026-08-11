"""Voice AI REST API endpoints (Stage 2 Step 3).

Endpoints:
- Assistants:
    POST   /voice/assistants            — Create assistant
    GET    /voice/assistants             — List assistants
    GET    /voice/assistants/{id}        — Get assistant
    PATCH  /voice/assistants/{id}        — Update assistant
    DELETE /voice/assistants/{id}        — Delete assistant
    POST   /voice/assistants/{id}/sync   — Sync to provider

- Settings:
    GET    /voice/settings               — Get tenant voice settings
    PATCH  /voice/settings               — Update settings

- Sessions:
    GET    /voice/sessions               — List sessions
    GET    /voice/sessions/{id}          — Get session
    POST   /voice/sessions/{id}/end      — End session
    GET    /voice/sessions/{id}/messages — Get transcript
    GET    /voice/sessions/{id}/events   — Get call events
    POST   /voice/sessions/{id}/stream-token — Mint WS token

- Testing:
    POST   /voice/test-call              — Start test outbound call

- Analytics:
    GET    /voice/analytics/summary      — Aggregate analytics
    GET    /voice/analytics/sessions/{id} — Per-session analytics

- Webhook logs:
    GET    /voice/webhooks/logs          — List webhook logs

- Provider info:
    GET    /voice/providers              — List registered providers
    GET    /voice/config                 — Public config (no secrets)
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
from app.voice import VoiceService
from app.voice.streaming import router as streaming_router

logger = get_logger(__name__)

router = APIRouter()
# Include the streaming WebSocket routes (stream-token + /stream/{id})
router.include_router(streaming_router)


# ===== Helpers =====


async def _get_org_id(user: Any, db: AsyncSession) -> uuid.UUID:
    repo = UserOrganizationRepository(db)
    orgs = await repo.get_user_organizations(user.id)
    if not orgs:
        from app.core.exceptions import ValidationError

        raise ValidationError("User is not a member of any organization")
    return uuid.UUID(orgs[0].organization_id)


# ===== Schemas =====


class AssistantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    system_prompt: str = Field(..., min_length=1)
    assistant_type: str = "support"
    greeting: str | None = None
    description: str | None = None
    voice: str | None = None
    voice_provider: str | None = None
    language: str | None = None
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(None, ge=50, le=4000)
    stt_provider: str | None = None
    tts_provider: str | None = None
    ai_provider: str | None = None
    ai_model: str | None = None
    enable_rag: bool = True
    rag_categories: list[str] | None = None
    enable_barge_in: bool = True
    enable_vad: bool = True
    silence_timeout_seconds: int | None = None
    max_call_duration: int | None = None
    max_turns: int | None = None
    escalation_phone: str | None = None
    escalation_threshold: float | None = None
    business_hours: dict[str, Any] | None = None
    fallback_message: str | None = None
    end_of_call_message: str | None = None
    metadata: dict[str, Any] | None = None
    sync_to_provider: bool = True


class AssistantUpdateRequest(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    assistant_type: str | None = None
    greeting: str | None = None
    description: str | None = None
    voice: str | None = None
    voice_provider: str | None = None
    language: str | None = None
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(None, ge=50, le=4000)
    stt_provider: str | None = None
    tts_provider: str | None = None
    ai_provider: str | None = None
    ai_model: str | None = None
    enable_rag: bool | None = None
    rag_categories: list[str] | None = None
    enable_barge_in: bool | None = None
    enable_vad: bool | None = None
    silence_timeout_seconds: int | None = None
    max_call_duration: int | None = None
    max_turns: int | None = None
    escalation_phone: str | None = None
    escalation_threshold: float | None = None
    business_hours: dict[str, Any] | None = None
    fallback_message: str | None = None
    end_of_call_message: str | None = None
    metadata: dict[str, Any] | None = None
    is_active: bool | None = None
    is_default: bool | None = None
    sync_to_provider: bool = True


class AssistantResponse(BaseModel):
    id: str
    name: str
    description: str | None
    assistant_type: str
    greeting: str
    fallback_message: str
    end_of_call_message: str
    system_prompt: str
    voice: str
    voice_provider: str
    language: str
    temperature: float
    max_tokens: int
    stt_provider: str
    tts_provider: str
    ai_provider: str | None
    ai_model: str | None
    enable_rag: bool
    rag_categories: list[str]
    enable_barge_in: bool
    enable_vad: bool
    silence_timeout_seconds: int
    max_call_duration: int
    max_turns: int
    escalation_phone: str | None
    escalation_threshold: float
    business_hours: dict[str, Any]
    provider: str
    provider_assistant_id: str | None
    is_active: bool
    is_default: bool
    created_at: str
    updated_at: str
    metadata: dict[str, Any]


class SettingsUpdateRequest(BaseModel):
    provider: str | None = None
    default_assistant_id: str | None = None
    default_voice: str | None = None
    default_language: str | None = None
    default_stt_provider: str | None = None
    default_tts_provider: str | None = None
    webhook_url: str | None = None
    webhook_secret: str | None = None
    enable_recording: bool | None = None
    enable_transcription: bool | None = None
    enable_sentiment_analysis: bool | None = None
    enable_barge_in: bool | None = None
    max_call_duration: int | None = None
    outbound_phone_number: str | None = None
    inbound_phone_numbers: list[str] | None = None
    provider_config: dict[str, Any] | None = None


class SettingsResponse(BaseModel):
    id: str
    organization_id: str
    provider: str
    default_assistant_id: str | None
    default_voice: str
    default_language: str
    default_stt_provider: str
    default_tts_provider: str
    webhook_url: str | None
    enable_recording: bool
    enable_transcription: bool
    enable_sentiment_analysis: bool
    enable_barge_in: bool
    max_call_duration: int
    outbound_phone_number: str | None
    inbound_phone_numbers: list[str]
    is_active: bool
    updated_at: str


class SessionResponse(BaseModel):
    id: str
    organization_id: str
    assistant_id: str | None
    ai_conversation_id: str | None
    provider: str
    call_sid: str
    provider_assistant_id: str | None
    direction: str
    caller_phone: str | None
    callee_phone: str | None
    caller_name: str | None
    customer_id: str | None
    status: str
    language: str
    started_at: str | None
    answered_at: str | None
    ended_at: str | None
    duration_seconds: int
    turn_count: int
    interruption_count: int
    barge_in_count: int
    recording_url: str | None
    transcript_url: str | None
    summary: str | None
    outcome: str | None
    sentiment: str | None
    transferred_to: str | None
    transfer_reason: str | None
    error_message: str | None
    hangup_cause: str | None
    hangup_by: str | None
    metadata: dict[str, Any]


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    total: int
    limit: int
    offset: int


class MessageResponse(BaseModel):
    id: str
    sequence: int
    speaker: str
    text: str
    is_partial: bool
    is_final: bool
    interrupted: bool
    interrupted_by: str | None
    start_time: float
    end_time: float
    latency_ms: int
    stt_confidence: float | None
    ai_confidence: float | None
    language: str | None
    model: str | None
    tokens_in: int
    tokens_out: int
    citations: list
    tool_calls: list
    created_at: str


class TestCallRequest(BaseModel):
    assistant_id: str
    to_number: str = Field(..., min_length=4, max_length=20)
    from_number: str | None = None
    metadata: dict[str, Any] | None = None


class TestCallResponse(BaseModel):
    session_id: str
    call_sid: str
    status: str
    assistant_id: str
    assistant_name: str


class EndSessionRequest(BaseModel):
    outcome: str | None = "caller_ended"


# ===== Serialization =====


def _serialize_assistant(a: Any) -> AssistantResponse:
    return AssistantResponse(
        id=str(a.id),
        name=a.name,
        description=a.description,
        assistant_type=a.assistant_type,
        greeting=a.greeting,
        fallback_message=a.fallback_message,
        end_of_call_message=a.end_of_call_message,
        system_prompt=a.system_prompt,
        voice=a.voice,
        voice_provider=a.voice_provider,
        language=a.language,
        temperature=a.temperature,
        max_tokens=a.max_tokens,
        stt_provider=a.stt_provider,
        tts_provider=a.tts_provider,
        ai_provider=a.ai_provider,
        ai_model=a.ai_model,
        enable_rag=a.enable_rag,
        rag_categories=list(a.rag_categories or []),
        enable_barge_in=a.enable_barge_in,
        enable_vad=a.enable_vad,
        silence_timeout_seconds=a.silence_timeout_seconds,
        max_call_duration=a.max_call_duration,
        max_turns=a.max_turns,
        escalation_phone=a.escalation_phone,
        escalation_threshold=a.escalation_threshold,
        business_hours=dict(a.business_hours or {}),
        provider=a.provider,
        provider_assistant_id=a.provider_assistant_id,
        is_active=a.is_active,
        is_default=a.is_default,
        created_at=a.created_at.isoformat() if a.created_at else "",
        updated_at=a.updated_at.isoformat() if a.updated_at else "",
        metadata=dict(a.metadata_ or {}),
    )


def _serialize_settings(s: Any) -> SettingsResponse:
    return SettingsResponse(
        id=str(s.id),
        organization_id=s.organization_id,
        provider=s.provider,
        default_assistant_id=str(s.default_assistant_id) if s.default_assistant_id else None,
        default_voice=s.default_voice,
        default_language=s.default_language,
        default_stt_provider=s.default_stt_provider,
        default_tts_provider=s.default_tts_provider,
        webhook_url=s.webhook_url,
        enable_recording=s.enable_recording,
        enable_transcription=s.enable_transcription,
        enable_sentiment_analysis=s.enable_sentiment_analysis,
        enable_barge_in=s.enable_barge_in,
        max_call_duration=s.max_call_duration,
        outbound_phone_number=s.outbound_phone_number,
        inbound_phone_numbers=list(s.inbound_phone_numbers or []),
        is_active=s.is_active,
        updated_at=s.updated_at.isoformat() if s.updated_at else "",
    )


def _serialize_session(s: Any) -> SessionResponse:
    return SessionResponse(
        id=str(s.id),
        organization_id=s.organization_id,
        assistant_id=str(s.assistant_id) if s.assistant_id else None,
        ai_conversation_id=str(s.ai_conversation_id) if s.ai_conversation_id else None,
        provider=s.provider,
        call_sid=s.call_sid,
        provider_assistant_id=s.provider_assistant_id,
        direction=s.direction,
        caller_phone=s.caller_phone,
        callee_phone=s.callee_phone,
        caller_name=s.caller_name,
        customer_id=str(s.customer_id) if s.customer_id else None,
        status=s.status,
        language=s.language,
        started_at=s.started_at.isoformat() if s.started_at else None,
        answered_at=s.answered_at.isoformat() if s.answered_at else None,
        ended_at=s.ended_at.isoformat() if s.ended_at else None,
        duration_seconds=s.duration_seconds,
        turn_count=s.turn_count,
        interruption_count=s.interruption_count,
        barge_in_count=s.barge_in_count,
        recording_url=s.recording_url,
        transcript_url=s.transcript_url,
        summary=s.summary,
        outcome=s.outcome,
        sentiment=s.sentiment,
        transferred_to=s.transferred_to,
        transfer_reason=s.transfer_reason,
        error_message=s.error_message,
        hangup_cause=s.hangup_cause,
        hangup_by=s.hangup_by,
        metadata=dict(s.metadata_ or {}),
    )


def _serialize_message(m: Any) -> MessageResponse:
    return MessageResponse(
        id=str(m.id),
        sequence=m.sequence,
        speaker=m.speaker,
        text=m.text,
        is_partial=m.is_partial,
        is_final=m.is_final,
        interrupted=m.interrupted,
        interrupted_by=m.interrupted_by,
        start_time=m.start_time,
        end_time=m.end_time,
        latency_ms=m.latency_ms,
        stt_confidence=m.stt_confidence,
        ai_confidence=m.ai_confidence,
        language=m.language,
        model=m.model,
        tokens_in=m.tokens_in,
        tokens_out=m.tokens_out,
        citations=list(m.citations or []),
        tool_calls=list(m.tool_calls or []),
        created_at=m.created_at.isoformat() if m.created_at else "",
    )


# ===== Assistant endpoints =====


@router.post(
    "/assistants",
    response_model=AssistantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a voice assistant",
)
async def create_assistant(
    request: AssistantCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> AssistantResponse:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    assistant = await svc.create_assistant(
        organization_id=org_id,
        created_by=user.id,
        **request.model_dump(exclude_none=False),
    )
    return _serialize_assistant(assistant)


@router.get("/assistants", response_model=list[AssistantResponse], summary="List assistants")
async def list_assistants(
    user: CurrentUser,
    db: DBSession,
    assistant_type: str | None = None,
) -> list[AssistantResponse]:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    assistants = await svc.list_assistants(
        organization_id=org_id, assistant_type=assistant_type
    )
    return [_serialize_assistant(a) for a in assistants]


@router.get("/assistants/{assistant_id}", response_model=AssistantResponse)
async def get_assistant(
    assistant_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> AssistantResponse:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    assistant = await svc.get_assistant(
        organization_id=org_id, assistant_id=assistant_id
    )
    return _serialize_assistant(assistant)


@router.patch("/assistants/{assistant_id}", response_model=AssistantResponse)
async def update_assistant(
    assistant_id: uuid.UUID,
    request: AssistantUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> AssistantResponse:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    update_data = request.model_dump(exclude_none=True)
    sync_to_provider = update_data.pop("sync_to_provider", True)
    assistant = await svc.update_assistant(
        organization_id=org_id,
        assistant_id=assistant_id,
        sync_to_provider=sync_to_provider,
        **update_data,
    )
    return _serialize_assistant(assistant)


@router.delete("/assistants/{assistant_id}", summary="Delete an assistant")
async def delete_assistant(
    assistant_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    await svc.delete_assistant(organization_id=org_id, assistant_id=assistant_id)
    return {"assistant_id": str(assistant_id), "deleted": True}


@router.post("/assistants/{assistant_id}/sync", summary="Sync assistant to provider")
async def sync_assistant(
    assistant_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    """Re-sync an assistant to the provider (creates or updates)."""
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    assistant = await svc.get_assistant(
        organization_id=org_id, assistant_id=assistant_id
    )
    # Trigger re-sync by calling update_assistant with no changes
    await svc.update_assistant(
        organization_id=org_id,
        assistant_id=assistant_id,
        name=assistant.name,
        system_prompt=assistant.system_prompt,
        sync_to_provider=True,
    )
    return {"assistant_id": str(assistant_id), "synced": True}


# ===== Settings endpoints =====


@router.get("/settings", response_model=SettingsResponse, summary="Get voice settings")
async def get_settings(
    user: CurrentUser,
    db: DBSession,
) -> SettingsResponse:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    s = await svc.get_settings(organization_id=org_id)
    return _serialize_settings(s)


@router.patch("/settings", response_model=SettingsResponse, summary="Update voice settings")
async def update_settings(
    request: SettingsUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> SettingsResponse:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    update_data = request.model_dump(exclude_none=True)
    s = await svc.update_settings(organization_id=org_id, **update_data)
    return _serialize_settings(s)


# ===== Session endpoints =====


@router.get("/sessions", response_model=SessionListResponse, summary="List sessions")
async def list_sessions(
    user: CurrentUser,
    db: DBSession,
    status_filter: str | None = Query(None, alias="status"),
    assistant_id: str | None = None,
    direction: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> SessionListResponse:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    sessions, total = await svc.list_sessions(
        organization_id=org_id,
        status=status_filter,
        assistant_id=uuid.UUID(assistant_id) if assistant_id else None,
        direction=direction,
        limit=limit,
        offset=offset,
    )
    return SessionListResponse(
        sessions=[_serialize_session(s) for s in sessions],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> SessionResponse:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    session = await svc.get_session(
        organization_id=org_id, session_id=session_id
    )
    return _serialize_session(session)


@router.post("/sessions/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: uuid.UUID,
    request: EndSessionRequest,
    user: CurrentUser,
    db: DBSession,
) -> SessionResponse:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    session = await svc.end_session(
        organization_id=org_id,
        session_id=session_id,
        outcome=request.outcome,
    )
    return _serialize_session(session)


@router.get(
    "/sessions/{session_id}/messages",
    response_model=list[MessageResponse],
    summary="Get session transcript",
)
async def get_session_messages(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> list[MessageResponse]:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    messages = await svc.get_session_messages(
        organization_id=org_id, session_id=session_id
    )
    return [_serialize_message(m) for m in messages]


@router.get(
    "/sessions/{session_id}/events",
    summary="Get session events",
)
async def get_session_events(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> list[dict[str, Any]]:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    events = await svc.get_session_events(
        organization_id=org_id, session_id=session_id
    )
    return [
        {
            "id": str(e.id),
            "sequence": e.sequence,
            "event_type": e.event_type,
            "source": e.source,
            "severity": e.severity,
            "timestamp_offset": e.timestamp_offset,
            "payload": e.payload,
            "error_message": e.error_message,
            "error_code": e.error_code,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


# ===== Testing =====


@router.post(
    "/test-call",
    response_model=TestCallResponse,
    summary="Start a test outbound call",
)
async def start_test_call(
    request: TestCallRequest,
    user: CurrentUser,
    db: DBSession,
) -> TestCallResponse:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    result = await svc.start_test_call(
        organization_id=org_id,
        assistant_id=uuid.UUID(request.assistant_id),
        to_number=request.to_number,
        from_number=request.from_number,
        metadata=request.metadata,
    )
    return TestCallResponse(**result)


# ===== Analytics =====


@router.get("/analytics/summary", summary="Get aggregate voice analytics")
async def get_analytics_summary(
    user: CurrentUser,
    db: DBSession,
    days: int = Query(30, ge=1, le=365),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    return await svc.get_analytics_summary(organization_id=org_id, days=days)


@router.get("/analytics/sessions/{session_id}", summary="Get per-session analytics")
async def get_session_analytics(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    analytics = await svc.get_session_analytics(
        organization_id=org_id, session_id=session_id
    )
    return {
        "id": str(analytics.id),
        "session_id": str(analytics.session_id),
        "assistant_id": str(analytics.assistant_id) if analytics.assistant_id else None,
        "started_at": analytics.started_at.isoformat() if analytics.started_at else None,
        "ended_at": analytics.ended_at.isoformat() if analytics.ended_at else None,
        "duration_seconds": analytics.duration_seconds,
        "avg_stt_latency_ms": analytics.avg_stt_latency_ms,
        "avg_ai_latency_ms": analytics.avg_ai_latency_ms,
        "avg_tts_latency_ms": analytics.avg_tts_latency_ms,
        "avg_total_latency_ms": analytics.avg_total_latency_ms,
        "max_ai_latency_ms": analytics.max_ai_latency_ms,
        "ai_talk_time_seconds": analytics.ai_talk_time_seconds,
        "customer_talk_time_seconds": analytics.customer_talk_time_seconds,
        "silence_seconds": analytics.silence_seconds,
        "overlap_seconds": analytics.overlap_seconds,
        "talk_ratio": analytics.talk_ratio,
        "turn_count": analytics.turn_count,
        "interruption_count": analytics.interruption_count,
        "barge_in_count": analytics.barge_in_count,
        "avg_stt_confidence": analytics.avg_stt_confidence,
        "avg_ai_confidence": analytics.avg_ai_confidence,
        "low_confidence_turns": analytics.low_confidence_turns,
        "outcome": analytics.outcome,
        "was_escalated": analytics.was_escalated,
        "was_transferred": analytics.was_transferred,
        "was_resolved": analytics.was_resolved,
        "satisfaction_score": analytics.satisfaction_score,
        "rag_used": analytics.rag_used,
        "rag_citations_count": analytics.rag_citations_count,
        "rag_fallback_count": analytics.rag_fallback_count,
        "cost_cents": analytics.cost_cents,
        "ai_tokens_in": analytics.ai_tokens_in,
        "ai_tokens_out": analytics.ai_tokens_out,
        "provider": analytics.provider,
        "stt_provider": analytics.stt_provider,
        "tts_provider": analytics.tts_provider,
    }


# ===== Webhook logs =====


@router.get("/webhooks/logs", summary="List webhook logs")
async def list_webhook_logs(
    user: CurrentUser,
    db: DBSession,
    provider: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = VoiceService(db)
    logs, total = await svc.list_webhook_logs(
        organization_id=org_id,
        provider=provider,
        limit=limit,
        offset=offset,
    )
    return {
        "logs": [
            {
                "id": str(l.id),
                "provider": l.provider,
                "event_type": l.event_type,
                "call_sid": l.call_sid,
                "session_id": l.session_id,
                "signature_valid": l.signature_valid,
                "processed": l.processed,
                "processing_error": l.processing_error,
                "source_ip": l.source_ip,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ===== Provider info (public, no secrets) =====


@router.get("/providers", summary="List registered voice providers")
async def list_providers() -> list[dict[str, Any]]:
    from app.voice.providers import VOICE_PROVIDER_REGISTRY

    return [
        {
            "name": name,
            "class": cls.__name__,
            "implemented": name == "vapi",  # only vapi is fully implemented
        }
        for name, cls in VOICE_PROVIDER_REGISTRY.items()
    ]


@router.get("/config", summary="Get voice AI configuration (public)")
async def get_config() -> dict[str, Any]:
    return {
        "voice_provider": settings.VOICE_PROVIDER,
        "default_voice": settings.DEFAULT_VOICE,
        "default_voice_provider": settings.DEFAULT_VOICE_PROVIDER,
        "default_language": settings.DEFAULT_LANGUAGE,
        "default_stt_provider": settings.DEFAULT_VOICE_STT_PROVIDER,
        "default_tts_provider": settings.DEFAULT_VOICE_TTS_PROVIDER,
        "max_call_duration": settings.MAX_CALL_DURATION,
        "enable_barge_in": settings.ENABLE_BARGE_IN,
        "enable_vad": settings.ENABLE_VAD,
        "silence_timeout_seconds": settings.SILENCE_TIMEOUT_SECONDS,
        "max_turns_per_call": settings.MAX_TURNS_PER_CALL,
        "enable_recording": settings.ENABLE_RECORDING,
        "enable_transcription": settings.ENABLE_TRANSCRIPTION,
        "enable_sentiment_analysis": settings.ENABLE_SENTIMENT_ANALYSIS,
        "vapi_configured": bool(settings.VAPI_API_KEY),
        "ws_token_ttl_seconds": settings.VOICE_WS_TOKEN_TTL_SECONDS,
    }

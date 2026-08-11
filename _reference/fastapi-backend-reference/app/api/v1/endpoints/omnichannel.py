"""Omnichannel API endpoints.

Endpoints:
- Voice: GET /omnichannel/calls, GET /omnichannel/calls/{id}, POST /omnichannel/calls/{sid}/transfer
- WhatsApp: GET /omnichannel/whatsapp/messages, POST /omnichannel/whatsapp/send
- Chat: POST /omnichannel/chat (web chat widget endpoint)
- Email: GET /omnichannel/emails, POST /omnichannel/emails/{id}/draft
- Conversations: GET /omnichannel/conversations, GET /omnichannel/conversations/{id}
- Handoff: POST /omnichannel/handoffs, GET /omnichannel/handoffs, POST /omnichannel/handoffs/{id}/assign, POST /omnichannel/handoffs/{id}/complete
- Dashboard: GET /omnichannel/dashboard
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.omnichannel import (
    CallTranscript,
    EmailThread,
)
from app.omnichannel.service import OmnichannelService

router = APIRouter()


# ===== Schemas =====


class ChatRequest(BaseModel):
    """Web chat request (from chat widget)."""

    message: str = Field(..., min_length=1, max_length=10000)
    conversation_id: uuid.UUID | None = None
    visitor_name: str | None = None
    visitor_phone: str | None = None


class WhatsAppSendRequest(BaseModel):
    """WhatsApp outbound message request."""

    to_number: str
    text: str | None = None
    template_name: str | None = None
    template_language: str = "en"


class CallTransferRequest(BaseModel):
    """Call transfer request."""

    transfer_to: str
    reason: str = "customer_request"


class HandoffRequestModel(BaseModel):
    """Handoff request creation."""

    channel_conversation_id: uuid.UUID
    channel: str
    reason: str
    priority: str = "medium"
    ai_summary: str | None = None
    ai_agent_type: str | None = None
    ai_confidence: float | None = None


class HandoffAssignModel(BaseModel):
    """Handoff assignment."""

    agent_user_id: uuid.UUID


class HandoffCompleteModel(BaseModel):
    """Handoff completion."""

    resolution: str | None = None
    agent_notes: str | None = None
    satisfaction_score: int | None = None


# ===== Conversations =====


@router.get("/conversations", summary="List conversations")
async def list_conversations(
    channel: str | None = None,
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List all conversations (optionally filtered by channel/status)."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    svc = OmnichannelService(db)
    convs = await svc.list_conversations(
        uuid.UUID(org_id), channel=channel, status=status, skip=skip, limit=limit
    )
    return [
        {
            "id": str(c.id),
            "channel": c.channel,
            "status": c.status,
            "caller_name": c.caller_name,
            "caller_phone": c.caller_phone,
            "agent_type": c.agent_type,
            "intent": c.intent,
            "outcome": c.outcome,
            "is_escalated": c.is_escalated,
            "satisfaction_score": c.satisfaction_score,
            "started_at": c.started_at.isoformat() if c.started_at else None,
            "ended_at": c.ended_at.isoformat() if c.ended_at else None,
        }
        for c in convs
    ]


@router.get("/conversations/{conversation_id}", summary="Get conversation")
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Get a conversation by ID."""
    svc = OmnichannelService(db)
    conv = await svc.get_conversation(conversation_id)
    if conv is None:
        raise NotFoundError("Conversation", str(conversation_id))
    return {
        "id": str(conv.id),
        "channel": conv.channel,
        "status": conv.status,
        "caller_name": conv.caller_name,
        "caller_phone": conv.caller_phone,
        "caller_email": conv.caller_email,
        "agent_type": conv.agent_type,
        "intent": conv.intent,
        "outcome": conv.outcome,
        "resolution_notes": conv.resolution_notes,
        "satisfaction_score": conv.satisfaction_score,
        "is_escalated": conv.is_escalated,
        "escalation_reason": conv.escalation_reason,
        "language": conv.language,
        "metadata": conv.metadata_,
        "started_at": conv.started_at.isoformat() if conv.started_at else None,
        "ended_at": conv.ended_at.isoformat() if conv.ended_at else None,
    }


# ===== Voice =====


@router.get("/calls", summary="List call logs")
async def list_calls(
    status: str | None = None,
    direction: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List call logs."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    svc = OmnichannelService(db)
    calls = await svc.list_calls(
        uuid.UUID(org_id), status=status, direction=direction, skip=skip, limit=limit
    )
    return [
        {
            "id": str(c.id),
            "call_sid": c.call_sid,
            "direction": c.direction,
            "from_number": c.from_number,
            "to_number": c.to_number,
            "status": c.status,
            "duration_seconds": c.duration_seconds,
            "language_detected": c.language_detected,
            "recording_url": c.recording_url,
            "transcript_url": c.transcript_url,
            "sentiment": c.sentiment,
            "transferred_to": c.transferred_to,
            "cost_cents": c.cost_cents,
            "started_at": c.started_at.isoformat() if c.started_at else None,
            "ended_at": c.ended_at.isoformat() if c.ended_at else None,
        }
        for c in calls
    ]


@router.get("/calls/{call_id}/transcript", summary="Get call transcript")
async def get_call_transcript(
    call_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """Get transcript segments for a call."""
    result = await db.execute(
        select(CallTranscript)
        .where(CallTranscript.call_log_id == str(call_id))
        .order_by(CallTranscript.segment_index)
    )
    segments = result.scalars().all()
    return [
        {
            "segment_index": s.segment_index,
            "speaker": s.speaker,
            "text": s.text,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "confidence": s.confidence,
            "language": s.language,
        }
        for s in segments
    ]


@router.post("/calls/{call_sid}/transfer", summary="Transfer a call")
async def transfer_call(
    call_sid: str,
    request: CallTransferRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Transfer a call to a human agent."""
    svc = OmnichannelService(db)
    call = await svc.update_call(
        call_sid,
        status="transferred",
        transferred_to=request.transfer_to,
        transferred_at=datetime.now(UTC),
        transfer_reason=request.reason,
    )
    if call is None:
        raise NotFoundError("Call", call_sid)
    return {"call_sid": call_sid, "status": "transferred", "transferred_to": request.transfer_to}


# ===== WhatsApp =====


@router.get("/whatsapp/messages", summary="List WhatsApp messages")
async def list_whatsapp_messages(
    from_number: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List WhatsApp messages."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    svc = OmnichannelService(db)
    msgs = await svc.list_whatsapp_messages(
        uuid.UUID(org_id), from_number=from_number, skip=skip, limit=limit
    )
    return [
        {
            "id": str(m.id),
            "wa_message_id": m.wa_message_id,
            "direction": m.direction,
            "from_number": m.from_number,
            "to_number": m.to_number,
            "message_type": m.message_type,
            "text": m.text,
            "media_url": m.media_url,
            "status": m.status,
            "is_ai_response": m.is_ai_response,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


@router.post("/whatsapp/send", summary="Send WhatsApp message")
async def send_whatsapp_message(
    request: WhatsAppSendRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Send a WhatsApp message (outbound).

    NOTE: In production, this would call the WhatsApp Business API.
    For now, it logs the message and returns a mock message ID.
    """
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    import secrets

    wa_message_id = f"wamid.{secrets.token_hex(16)}"

    svc = OmnichannelService(db)
    msg = await svc.log_whatsapp_message(
        organization_id=uuid.UUID(org_id),
        wa_message_id=wa_message_id,
        direction="outbound",
        from_number="system",
        to_number=request.to_number,
        text=request.text,
        message_type="template" if request.template_name else "text",
    )

    return {
        "id": str(msg.id),
        "wa_message_id": wa_message_id,
        "status": "sent",
        "to_number": request.to_number,
    }


# ===== Web Chat =====


@router.post("/chat", summary="Web chat (AI response)")
async def web_chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Send a message via web chat and get an AI response.

    This is the endpoint called by the website chat widget.
    It goes through the AI Gateway (Phase 4) for processing.
    """
    from app.ai.gateway import AIGateway
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    if org_id is None:
        return {
            "response": "You are not associated with an organization.",
            "conversation_id": None,
        }

    # Route through the AI Gateway
    gateway = AIGateway(db)
    result = await gateway.chat(
        message=request.message,
        organization_id=uuid.UUID(org_id),
        user_id=user.id,
        conversation_id=request.conversation_id,
        channel="web_chat",
        context={
            "visitor_name": request.visitor_name,
            "visitor_phone": request.visitor_phone,
        },
    )

    return result


# ===== Email =====


@router.get("/emails", summary="List email threads")
async def list_emails(
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List email threads."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    stmt = select(EmailThread).where(EmailThread.organization_id == org_id)
    if status:
        stmt = stmt.where(EmailThread.status == status)
    stmt = stmt.order_by(EmailThread.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    threads = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "subject": t.subject,
            "from_email": t.from_email,
            "from_name": t.from_name,
            "category": t.category,
            "priority": t.priority,
            "sentiment": t.sentiment,
            "ai_summary": t.ai_summary,
            "ai_draft_reply": t.ai_draft_reply,
            "ai_processed": t.ai_processed,
            "status": t.status,
            "message_count": t.message_count,
            "created_at": t.created_at.isoformat(),
        }
        for t in threads
    ]


@router.post("/emails/{thread_id}/draft", summary="Generate AI draft reply")
async def generate_email_draft(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Generate an AI draft reply for an email thread.

    NOTE: In production, this would call the AI Gateway with the email context.
    """
    thread = await db.get(EmailThread, thread_id)
    if thread is None:
        raise NotFoundError("EmailThread", str(thread_id))

    # Mock AI draft (production would call AI Gateway)
    draft = f"Dear {thread.from_name or 'Customer'},\n\nThank you for your email regarding '{thread.subject}'. We have received your message and will get back to you shortly.\n\nBest regards,\nSupport Team"

    thread.ai_draft_reply = draft
    thread.ai_processed = True
    await db.commit()

    return {"thread_id": str(thread_id), "draft": draft}


# ===== Handoff =====


@router.post("/handoffs", status_code=status.HTTP_201_CREATED, summary="Request handoff")
async def request_handoff(
    request: HandoffRequestModel,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Request a handoff from AI to a human agent."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    svc = OmnichannelService(db)
    handoff = await svc.request_handoff(
        organization_id=uuid.UUID(org_id),
        channel_conversation_id=request.channel_conversation_id,
        channel=request.channel,
        reason=request.reason,
        priority=request.priority,
        ai_summary=request.ai_summary,
        ai_agent_type=request.ai_agent_type,
        ai_confidence=request.ai_confidence,
    )
    return {
        "id": str(handoff.id),
        "status": handoff.status,
        "queue_position": handoff.queue_position,
        "channel": handoff.channel,
        "reason": handoff.reason,
    }


@router.get("/handoffs", summary="List handoff requests")
async def list_handoffs(
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List handoff requests."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    svc = OmnichannelService(db)
    handoffs = await svc.list_handoffs(uuid.UUID(org_id), status=status, skip=skip, limit=limit)
    return [
        {
            "id": str(h.id),
            "channel": h.channel,
            "reason": h.reason,
            "priority": h.priority,
            "status": h.status,
            "ai_summary": h.ai_summary,
            "ai_confidence": h.ai_confidence,
            "customer_name": h.customer_name,
            "customer_phone": h.customer_phone,
            "assigned_to": h.assigned_to,
            "queue_position": h.queue_position,
            "wait_time_seconds": h.wait_time_seconds,
            "requested_at": h.requested_at.isoformat() if h.requested_at else None,
            "accepted_at": h.accepted_at.isoformat() if h.accepted_at else None,
        }
        for h in handoffs
    ]


@router.post("/handoffs/{handoff_id}/assign", summary="Assign handoff to agent")
async def assign_handoff(
    handoff_id: uuid.UUID,
    request: HandoffAssignModel,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Assign a handoff request to a human agent."""
    svc = OmnichannelService(db)
    handoff = await svc.assign_handoff(handoff_id, request.agent_user_id)
    if handoff is None:
        raise NotFoundError("HandoffRequest", str(handoff_id))
    return {"id": str(handoff.id), "status": "active", "assigned_to": str(request.agent_user_id)}


@router.post("/handoffs/{handoff_id}/complete", summary="Complete handoff")
async def complete_handoff(
    handoff_id: uuid.UUID,
    request: HandoffCompleteModel,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Complete a handoff (human agent finished)."""
    svc = OmnichannelService(db)
    handoff = await svc.complete_handoff(
        handoff_id,
        resolution=request.resolution,
        agent_notes=request.agent_notes,
        satisfaction_score=request.satisfaction_score,
    )
    if handoff is None:
        raise NotFoundError("HandoffRequest", str(handoff_id))
    return {"id": str(handoff.id), "status": "completed"}


# ===== Dashboard =====


@router.get("/dashboard", summary="Omnichannel dashboard")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Get omnichannel dashboard summary (live data from DB)."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return {"active_conversations": 0, "channels": {}, "total_conversations": 0}
    org_id = user_orgs[0].organization_id

    svc = OmnichannelService(db)
    return await svc.get_dashboard_summary(uuid.UUID(org_id))

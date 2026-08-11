"""Omnichannel Service — unified conversation management across all channels.

All channels (voice, WhatsApp, web chat, email) go through this service.
It:
1. Creates/retrieves channel conversations
2. Routes messages to the AI Gateway (Phase 4)
3. Stores conversation history
4. Manages handoff to human agents
5. Tracks analytics
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.omnichannel import (
    CallLog,
    ChannelConversation,
    HandoffRequest,
    WhatsAppMessage,
)

logger = get_logger(__name__)


class OmnichannelService:
    """Unified conversation management across all channels."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ===== Conversation Management =====

    async def create_conversation(
        self,
        *,
        organization_id: uuid.UUID,
        channel: str,
        channel_conversation_id: str | None = None,
        user_id: uuid.UUID | None = None,
        customer_id: uuid.UUID | None = None,
        caller_phone: str | None = None,
        caller_email: str | None = None,
        caller_name: str | None = None,
        language: str = "en",
        metadata: dict | None = None,
    ) -> ChannelConversation:
        """Create a new channel conversation."""
        conv = ChannelConversation(
            organization_id=str(organization_id),
            channel=channel,
            channel_conversation_id=channel_conversation_id,
            user_id=str(user_id) if user_id else None,
            customer_id=str(customer_id) if customer_id else None,
            caller_phone=caller_phone,
            caller_email=caller_email,
            caller_name=caller_name,
            language=language,
            status="active",
            started_at=datetime.now(UTC),
            metadata_=metadata or {},
        )
        self.db.add(conv)
        await self.db.flush()
        return conv

    async def get_conversation(self, conversation_id: uuid.UUID) -> ChannelConversation | None:
        """Get a conversation by ID."""
        return await self.db.get(ChannelConversation, conversation_id)

    async def list_conversations(
        self,
        organization_id: uuid.UUID,
        *,
        channel: str | None = None,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[ChannelConversation]:
        """List conversations with optional filters."""
        stmt = select(ChannelConversation).where(
            ChannelConversation.organization_id == str(organization_id)
        )
        if channel:
            stmt = stmt.where(ChannelConversation.channel == channel)
        if status:
            stmt = stmt.where(ChannelConversation.status == status)
        stmt = stmt.order_by(ChannelConversation.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_conversation(
        self,
        conversation_id: uuid.UUID,
        **kwargs: Any,
    ) -> ChannelConversation | None:
        """Update a conversation."""
        conv = await self.get_conversation(conversation_id)
        if conv is None:
            return None
        for key, value in kwargs.items():
            if hasattr(conv, key):
                setattr(conv, key, value)
        await self.db.flush()
        return conv

    async def end_conversation(
        self,
        conversation_id: uuid.UUID,
        outcome: str = "resolved",
        resolution_notes: str | None = None,
        satisfaction_score: int | None = None,
    ) -> ChannelConversation | None:
        """End a conversation with outcome and satisfaction."""
        return await self.update_conversation(
            conversation_id,
            status="completed",
            outcome=outcome,
            resolution_notes=resolution_notes,
            satisfaction_score=satisfaction_score,
            ended_at=datetime.now(UTC),
        )

    # ===== Voice AI =====

    async def log_call(
        self,
        *,
        organization_id: uuid.UUID,
        call_sid: str,
        call_provider: str = "twilio",
        direction: str = "inbound",
        from_number: str,
        to_number: str,
        channel_conversation_id: uuid.UUID | None = None,
    ) -> CallLog:
        """Create a call log entry."""
        call = CallLog(
            organization_id=str(organization_id),
            call_sid=call_sid,
            call_provider=call_provider,
            direction=direction,
            from_number=from_number,
            to_number=to_number,
            status="ringing",
            started_at=datetime.now(UTC),
            channel_conversation_id=str(channel_conversation_id)
            if channel_conversation_id
            else None,
        )
        self.db.add(call)
        await self.db.flush()
        return call

    async def update_call(
        self,
        call_sid: str,
        **kwargs: Any,
    ) -> CallLog | None:
        """Update a call log."""
        result = await self.db.execute(select(CallLog).where(CallLog.call_sid == call_sid))
        call = result.scalar_one_or_none()
        if call is None:
            return None
        for key, value in kwargs.items():
            if hasattr(call, key):
                setattr(call, key, value)
        await self.db.flush()
        return call

    async def list_calls(
        self,
        organization_id: uuid.UUID,
        *,
        status: str | None = None,
        direction: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[CallLog]:
        """List call logs."""
        stmt = select(CallLog).where(CallLog.organization_id == str(organization_id))
        if status:
            stmt = stmt.where(CallLog.status == status)
        if direction:
            stmt = stmt.where(CallLog.direction == direction)
        stmt = stmt.order_by(CallLog.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ===== WhatsApp =====

    async def log_whatsapp_message(
        self,
        *,
        organization_id: uuid.UUID,
        wa_message_id: str,
        direction: str,
        from_number: str,
        to_number: str,
        message_type: str = "text",
        text: str | None = None,
        media_url: str | None = None,
        channel_conversation_id: uuid.UUID | None = None,
        is_ai_response: bool = False,
    ) -> WhatsAppMessage:
        """Log a WhatsApp message."""
        msg = WhatsAppMessage(
            organization_id=str(organization_id),
            wa_message_id=wa_message_id,
            direction=direction,
            from_number=from_number,
            to_number=to_number,
            message_type=message_type,
            text=text,
            media_url=media_url,
            channel_conversation_id=str(channel_conversation_id)
            if channel_conversation_id
            else None,
            is_ai_response=is_ai_response,
        )
        self.db.add(msg)
        await self.db.flush()
        return msg

    async def list_whatsapp_messages(
        self,
        organization_id: uuid.UUID,
        *,
        from_number: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[WhatsAppMessage]:
        """List WhatsApp messages."""
        stmt = select(WhatsAppMessage).where(
            WhatsAppMessage.organization_id == str(organization_id)
        )
        if from_number:
            stmt = stmt.where(WhatsAppMessage.from_number == from_number)
        stmt = stmt.order_by(WhatsAppMessage.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ===== Live Agent Handoff =====

    async def request_handoff(
        self,
        *,
        organization_id: uuid.UUID,
        channel_conversation_id: uuid.UUID,
        channel: str,
        reason: str,
        priority: str = "medium",
        ai_summary: str | None = None,
        ai_agent_type: str | None = None,
        ai_confidence: float | None = None,
        customer_name: str | None = None,
        customer_phone: str | None = None,
        customer_email: str | None = None,
    ) -> HandoffRequest:
        """Request a handoff from AI to human agent."""
        # Count pending requests for queue position
        result = await self.db.execute(
            select(func.count())
            .select_from(HandoffRequest)
            .where(
                HandoffRequest.organization_id == str(organization_id),
                HandoffRequest.status == "pending",
            )
        )
        queue_position = (result.scalar_one_or_none() or 0) + 1

        handoff = HandoffRequest(
            organization_id=str(organization_id),
            channel_conversation_id=str(channel_conversation_id),
            channel=channel,
            reason=reason,
            priority=priority,
            ai_summary=ai_summary,
            ai_agent_type=ai_agent_type,
            ai_confidence=ai_confidence,
            customer_name=customer_name,
            customer_phone=customer_phone,
            customer_email=customer_email,
            status="pending",
            queue_position=queue_position,
            requested_at=datetime.now(UTC),
        )
        self.db.add(handoff)

        # Update conversation status
        await self.update_conversation(
            channel_conversation_id,
            is_escalated=True,
            escalated_at=datetime.now(UTC),
            escalation_reason=reason,
            status="escalated",
        )

        await self.db.flush()
        return handoff

    async def assign_handoff(
        self,
        handoff_id: uuid.UUID,
        agent_user_id: uuid.UUID,
    ) -> HandoffRequest | None:
        """Assign a handoff request to a human agent."""
        handoff = await self.db.get(HandoffRequest, handoff_id)
        if handoff is None:
            return None

        handoff.assigned_to = str(agent_user_id)
        handoff.assigned_at = datetime.now(UTC)
        handoff.accepted_at = datetime.now(UTC)
        handoff.status = "active"

        await self.db.flush()
        return handoff

    async def complete_handoff(
        self,
        handoff_id: uuid.UUID,
        *,
        resolution: str | None = None,
        agent_notes: str | None = None,
        satisfaction_score: int | None = None,
    ) -> HandoffRequest | None:
        """Complete a handoff (human agent finished)."""
        handoff = await self.db.get(HandoffRequest, handoff_id)
        if handoff is None:
            return None

        handoff.status = "completed"
        handoff.resolution = resolution
        handoff.agent_notes = agent_notes
        handoff.satisfaction_score = satisfaction_score
        handoff.completed_at = datetime.now(UTC)

        await self.db.flush()
        return handoff

    async def list_handoffs(
        self,
        organization_id: uuid.UUID,
        *,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[HandoffRequest]:
        """List handoff requests."""
        stmt = select(HandoffRequest).where(HandoffRequest.organization_id == str(organization_id))
        if status:
            stmt = stmt.where(HandoffRequest.status == status)
        stmt = stmt.order_by(HandoffRequest.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ===== Analytics =====

    async def get_dashboard_summary(self, organization_id: uuid.UUID) -> dict[str, Any]:
        """Get omnichannel dashboard summary (live data)."""
        org_id = str(organization_id)

        # Total conversations by channel
        result = await self.db.execute(
            select(
                ChannelConversation.channel,
                func.count().label("count"),
            )
            .where(ChannelConversation.organization_id == org_id)
            .group_by(ChannelConversation.channel)
        )
        channel_counts = {row.channel: row.count for row in result}

        # AI resolved vs escalated
        result = await self.db.execute(
            select(
                func.count().label("total"),
                func.sum(func.cast(ChannelConversation.outcome == "resolved", Integer)).label(
                    "resolved"
                ),
                func.sum(func.cast(ChannelConversation.is_escalated, Boolean)).label("escalated"),
            )
            .select_from(ChannelConversation)
            .where(ChannelConversation.organization_id == org_id)
        )
        totals = result.one()

        # Active conversations
        result = await self.db.execute(
            select(func.count())
            .select_from(ChannelConversation)
            .where(
                ChannelConversation.organization_id == org_id,
                ChannelConversation.status == "active",
            )
        )
        active_count = result.scalar_one_or_none() or 0

        # Calls today
        result = await self.db.execute(
            select(func.count()).select_from(CallLog).where(CallLog.organization_id == org_id)
        )
        total_calls = result.scalar_one_or_none() or 0

        # Avg satisfaction
        result = await self.db.execute(
            select(func.avg(ChannelConversation.satisfaction_score)).where(
                ChannelConversation.organization_id == org_id,
                ChannelConversation.satisfaction_score.isnot(None),
            )
        )
        avg_satisfaction = result.scalar_one_or_none() or 0.0

        return {
            "active_conversations": active_count,
            "channels": {
                "voice": channel_counts.get("voice", 0),
                "whatsapp": channel_counts.get("whatsapp", 0),
                "web_chat": channel_counts.get("web_chat", 0),
                "email": channel_counts.get("email", 0),
            },
            "total_conversations": sum(channel_counts.values()),
            "ai_resolved": int(totals.resolved or 0),
            "human_escalated": int(totals.escalated or 0),
            "total_calls": total_calls,
            "avg_satisfaction": round(float(avg_satisfaction), 2),
            "ai_resolution_rate": (
                round(int(totals.resolved or 0) / max(sum(channel_counts.values()), 1) * 100, 1)
            ),
            "escalation_rate": (
                round(int(totals.escalated or 0) / max(sum(channel_counts.values()), 1) * 100, 1)
            ),
        }

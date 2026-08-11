"""Voice session manager — creates / updates / ends voice sessions.

The session manager is the single authority on VoiceSession rows. It:
- Creates a session when a call starts (inbound webhook or outbound dial)
- Updates session status as the call progresses
- Persists caller context (phone → customer resolution)
- Binds the session to an AI conversation for memory
- Computes analytics on call end
- Enforces tenant isolation (every method takes organization_id)

The session manager does NOT directly handle STT/TTS/AI — that's the
VoiceConversationService's job. It just manages the session row + lifecycle.
"""

import uuid
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.voice import (
    CallEvent,
    VoiceAnalytics,
    VoiceAssistant,
    VoiceMessage,
    VoiceSession,
    VoiceSettings,
)
from app.voice.providers import (
    CallStatus,
    ProviderEvent,
    ProviderEventType,
    VoiceProvider,
    get_voice_provider,
)

logger = get_logger(__name__)


class VoiceSessionManager:
    """Manages voice session lifecycle (CRUD + state transitions)."""

    def __init__(
        self,
        db: AsyncSession,
        provider: VoiceProvider | None = None,
    ) -> None:
        self.db = db
        self._provider = provider

    @property
    def provider(self) -> VoiceProvider:
        if self._provider is None:
            self._provider = get_voice_provider()
        return self._provider

    @property
    def provider_name(self) -> str:
        """Get the provider name as a string (safe for DB writes)."""
        if self._provider is not None:
            name = getattr(self._provider, "name", None)
            if isinstance(name, str):
                return name
        from app.core.config import settings
        return settings.VOICE_PROVIDER

    # ====================================================================
    # Session creation
    # ====================================================================

    async def create_session(
        self,
        *,
        organization_id: uuid.UUID,
        assistant_id: uuid.UUID | None = None,
        call_sid: str,
        provider: str | None = None,
        direction: str = "inbound",
        caller_phone: str | None = None,
        callee_phone: str | None = None,
        caller_name: str | None = None,
        customer_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        language: str = "en",
        provider_assistant_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> VoiceSession:
        """Create a new voice session.

        Args:
            organization_id: Tenant ID (REQUIRED).
            assistant_id: VoiceAssistant ID (optional — defaults later).
            call_sid: Provider call ID (unique across all providers).
            provider: Provider name (defaults to settings.VOICE_PROVIDER).
            direction: inbound, outbound, web, transfer, callback.
            caller_phone: Caller's phone number.
            callee_phone: Recipient's phone number.
            caller_name: Caller's display name.
            customer_id: Resolved customer ID (from caller_phone lookup).
            user_id: Authenticated user ID (for outbound / web calls).
            language: ISO 639-1 language code.
            provider_assistant_id: Provider-side assistant ID.
            metadata: Custom metadata.

        Returns:
            The created VoiceSession row (status='ringing').
        """
        if not call_sid:
            raise ValidationError("call_sid is required")

        # Resolve assistant if not provided (use tenant's default)
        if assistant_id is None:
            assistant = await self._resolve_default_assistant(organization_id)
            if assistant is not None:
                assistant_id = assistant.id
                if provider_assistant_id is None:
                    provider_assistant_id = assistant.provider_assistant_id
                if language == "en":
                    language = assistant.language
        else:
            # Verify the assistant belongs to this tenant
            assistant = await self._get_assistant(organization_id, assistant_id)
            if provider_assistant_id is None:
                provider_assistant_id = assistant.provider_assistant_id
            if language == "en":
                language = assistant.language

        session = VoiceSession(
            organization_id=str(organization_id),
            assistant_id=str(assistant_id) if assistant_id else None,
            provider=provider or self.provider_name,
            call_sid=call_sid,
            provider_assistant_id=provider_assistant_id,
            direction=direction,
            caller_phone=caller_phone,
            callee_phone=callee_phone,
            caller_name=caller_name,
            customer_id=str(customer_id) if customer_id else None,
            user_id=str(user_id) if user_id else None,
            status=CallStatus.RINGING.value,
            language=language,
            started_at=datetime.now(UTC),
            metadata_=metadata or {},
        )
        self.db.add(session)
        await self.db.flush()

        # Emit call.started event
        await self._emit_event(
            session=session,
            event_type="call.started",
            source="system",
            payload={"direction": direction, "caller_phone": caller_phone},
        )

        logger.info(
            "voice_session_created",
            session_id=str(session.id),
            organization_id=str(organization_id),
            call_sid=call_sid,
            direction=direction,
        )
        return session

    async def get_session_by_call_sid(
        self,
        *,
        organization_id: uuid.UUID | None = None,
        call_sid: str,
    ) -> VoiceSession | None:
        """Look up a session by provider call SID.

        If organization_id is provided, enforces tenant isolation.
        """
        stmt = select(VoiceSession).where(VoiceSession.call_sid == call_sid)
        if organization_id is not None:
            stmt = stmt.where(VoiceSession.organization_id == str(organization_id))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_session(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> VoiceSession:
        """Get a session by ID (tenant-isolated)."""
        result = await self.db.execute(
            select(VoiceSession).where(
                VoiceSession.id == session_id,
                VoiceSession.organization_id == str(organization_id),
            )
        )
        session = result.scalar_one_or_none()
        if session is None:
            raise NotFoundError(f"Voice session {session_id} not found")
        return session

    # ====================================================================
    # State transitions
    # ====================================================================

    async def mark_answered(
        self,
        session: VoiceSession,
    ) -> VoiceSession:
        """Mark the call as answered (caller picked up)."""
        session.status = CallStatus.ANSWERED.value
        session.answered_at = datetime.now(UTC)
        await self.db.flush()
        await self._emit_event(
            session=session,
            event_type="call.answered",
            source="system",
            payload={},
        )
        return session

    async def mark_in_progress(
        self,
        session: VoiceSession,
    ) -> VoiceSession:
        """Mark the call as in-progress (conversation active)."""
        session.status = CallStatus.IN_PROGRESS.value
        await self.db.flush()
        return session

    async def mark_transferring(
        self,
        session: VoiceSession,
        *,
        transfer_to: str,
        reason: str | None = None,
    ) -> VoiceSession:
        """Mark the call as transferring to a human."""
        session.status = CallStatus.TRANSFERRING.value
        session.transferred_to = transfer_to
        session.transferred_at = datetime.now(UTC)
        session.transfer_reason = reason
        await self.db.flush()
        await self._emit_event(
            session=session,
            event_type="call.transferring",
            source="system",
            payload={"transfer_to": transfer_to, "reason": reason},
        )
        return session

    async def end_session(
        self,
        session: VoiceSession,
        *,
        outcome: str | None = None,
        hangup_cause: str | None = None,
        hangup_by: str | None = None,
        sentiment: str | None = None,
        summary: str | None = None,
        recording_url: str | None = None,
        transcript_url: str | None = None,
    ) -> VoiceSession:
        """End a voice session and compute analytics.

        Args:
            outcome: resolved, unresolved, escalated, callback_scheduled, abandoned, failed
            hangup_cause: Provider-specific hangup reason.
            hangup_by: caller, assistant, system, provider
            sentiment: positive, neutral, negative
            summary: AI-generated conversation summary.
            recording_url: URL to the call recording (if enabled).
            transcript_url: URL to the full transcript (if enabled).
        """
        now = datetime.now(UTC)
        session.status = CallStatus.COMPLETED.value
        session.ended_at = now
        session.hangup_cause = hangup_cause
        session.hangup_by = hangup_by
        session.outcome = outcome
        session.sentiment = sentiment
        session.summary = summary
        session.recording_url = recording_url
        session.transcript_url = transcript_url
        if session.started_at is not None:
            # Compute duration
            duration = (now - session.started_at).total_seconds()
            session.duration_seconds = int(duration)
        if summary:
            session.summary_generated_at = now
        await self.db.flush()

        # Compute analytics
        await self._compute_analytics(session)

        await self._emit_event(
            session=session,
            event_type="call.ended",
            source="system",
            payload={
                "outcome": outcome,
                "hangup_cause": hangup_cause,
                "duration_seconds": session.duration_seconds,
            },
        )
        logger.info(
            "voice_session_ended",
            session_id=str(session.id),
            duration_seconds=session.duration_seconds,
            outcome=outcome,
        )
        return session

    async def fail_session(
        self,
        session: VoiceSession,
        *,
        error_message: str,
        hangup_cause: str | None = None,
    ) -> VoiceSession:
        """Mark a session as failed."""
        session.status = CallStatus.FAILED.value
        session.ended_at = datetime.now(UTC)
        session.error_message = error_message
        session.hangup_cause = hangup_cause
        await self.db.flush()
        await self._emit_event(
            session=session,
            event_type="call.failed",
            source="system",
            payload={"error": error_message, "hangup_cause": hangup_cause},
            severity="error",
        )
        return session

    # ====================================================================
    # Transcript messages
    # ====================================================================

    async def add_message(
        self,
        session: VoiceSession,
        *,
        speaker: str,
        text: str,
        is_partial: bool = False,
        is_final: bool = True,
        interrupted: bool = False,
        interrupted_by: str | None = None,
        start_time: float = 0.0,
        end_time: float = 0.0,
        latency_ms: int = 0,
        stt_confidence: float | None = None,
        ai_confidence: float | None = None,
        language: str | None = None,
        model: str | None = None,
        tokens_in: int = 0,
        tokens_out: int = 0,
        citations: list | None = None,
        retrieved_chunks: list | None = None,
        tool_calls: list | None = None,
        audio_url: str | None = None,
        audio_duration_seconds: float | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> VoiceMessage:
        """Add a transcript message to the session."""
        # Compute next sequence number
        seq = session.turn_count * 2  # rough estimate; we'll recompute if needed
        # Better: query max sequence for this session
        existing_seq = await self._get_next_sequence(session.id)
        msg = VoiceMessage(
            organization_id=session.organization_id,
            session_id=str(session.id),
            sequence=existing_seq,
            speaker=speaker,
            text=text,
            is_partial=is_partial,
            is_final=is_final,
            interrupted=interrupted,
            interrupted_by=interrupted_by,
            start_time=start_time,
            end_time=end_time,
            latency_ms=latency_ms,
            stt_confidence=stt_confidence,
            ai_confidence=ai_confidence,
            language=language or session.language,
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            citations=citations or [],
            retrieved_chunks=retrieved_chunks or [],
            tool_calls=tool_calls or [],
            audio_url=audio_url,
            audio_duration_seconds=audio_duration_seconds,
            metadata_=metadata or {},
        )
        self.db.add(msg)
        await self.db.flush()

        # Update session counters
        if is_final and speaker == "caller":
            session.turn_count += 1
        if interrupted:
            session.interruption_count += 1
            session.barge_in_count += 1
        await self.db.flush()

        # Emit event
        event_type = (
            "stt.partial"
            if is_partial
            else ("stt.final" if speaker == "caller" else "assistant.response")
        )
        await self._emit_event(
            session=session,
            event_type=event_type,
            source=speaker,
            payload={"text": text, "sequence": existing_seq},
            timestamp_offset=start_time,
        )
        return msg

    async def record_barge_in(
        self,
        session: VoiceSession,
        *,
        interrupted_message_id: uuid.UUID | None = None,
    ) -> None:
        """Record that the caller interrupted the assistant (barge-in)."""
        session.barge_in_count += 1
        session.interruption_count += 1
        await self.db.flush()
        await self._emit_event(
            session=session,
            event_type="barge_in",
            source="caller",
            payload={"interrupted_message_id": str(interrupted_message_id) if interrupted_message_id else None},
        )

    # ====================================================================
    # Webhook event processing
    # ====================================================================

    async def process_provider_event(
        self,
        event: ProviderEvent,
    ) -> VoiceSession | None:
        """Process an inbound provider event (from webhook).

        Resolves the session by call_sid, applies state transitions,
        and persists transcript segments.

        Returns:
            The updated VoiceSession (or None if session not found).
        """
        if not event.call_sid:
            logger.warning("provider_event_no_call_sid", event_type=event.event_type.value)
            return None

        session = await self.get_session_by_call_sid(call_sid=event.call_sid)
        if session is None:
            logger.warning(
                "provider_event_unknown_call_sid",
                call_sid=event.call_sid,
                event_type=event.event_type.value,
            )
            return None

        # Dispatch based on event type
        if event.event_type == ProviderEventType.CALL_STARTED:
            # Already created on our side (we initiated or webhook arrived)
            pass
        elif event.event_type == ProviderEventType.CALL_ANSWERED:
            await self.mark_answered(session)
        elif event.event_type == ProviderEventType.CALL_ENDED:
            await self.end_session(
                session,
                outcome=event.payload.get("outcome"),
                hangup_cause=event.payload.get("ended_reason"),
                hangup_by=event.payload.get("hangup_by"),
            )
        elif event.event_type == ProviderEventType.CALL_TRANSFERRED:
            await self.mark_transferring(
                session,
                transfer_to=event.payload.get("transfer_destination", ""),
                reason="provider_transfer",
            )
        elif event.event_type in (
            ProviderEventType.STT_PARTIAL,
            ProviderEventType.STT_FINAL,
        ):
            seg = event.transcript_segment
            if seg and seg.text:
                await self.add_message(
                    session,
                    speaker=seg.speaker,
                    text=seg.text,
                    is_partial=seg.is_partial,
                    is_final=not seg.is_partial,
                    start_time=seg.start_time,
                    end_time=seg.end_time,
                    stt_confidence=seg.confidence,
                    language=seg.language,
                )
        elif event.event_type == ProviderEventType.ASSISTANT_RESPONSE:
            seg = event.transcript_segment
            if seg and seg.text:
                await self.add_message(
                    session,
                    speaker="assistant",
                    text=seg.text,
                    start_time=seg.start_time,
                    end_time=seg.end_time,
                    ai_confidence=seg.confidence,
                    language=seg.language,
                )
        elif event.event_type == ProviderEventType.BARGE_IN:
            await self.record_barge_in(session)
        elif event.event_type == ProviderEventType.ERROR:
            await self._emit_event(
                session=session,
                event_type="error",
                source="provider",
                payload=event.payload,
                severity="error",
            )
        elif event.event_type == ProviderEventType.SILENCE_DETECTED:
            session.silence_seconds += event.payload.get("duration_seconds", 0)
            await self.db.flush()

        return session

    # ====================================================================
    # Query helpers
    # ====================================================================

    async def list_sessions(
        self,
        *,
        organization_id: uuid.UUID,
        status: str | None = None,
        assistant_id: uuid.UUID | None = None,
        direction: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[VoiceSession], int]:
        """List sessions for a tenant (with optional filters)."""
        from sqlalchemy import func

        conditions = [
            VoiceSession.organization_id == str(organization_id),
        ]
        if status is not None:
            conditions.append(VoiceSession.status == status)
        if assistant_id is not None:
            conditions.append(VoiceSession.assistant_id == str(assistant_id))
        if direction is not None:
            conditions.append(VoiceSession.direction == direction)

        count_stmt = select(func.count()).select_from(VoiceSession).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(VoiceSession)
            .where(*conditions)
            .order_by(VoiceSession.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_messages(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> list[VoiceMessage]:
        """Get all messages for a session (tenant-isolated)."""
        # Verify session access
        await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        result = await self.db.execute(
            select(VoiceMessage)
            .where(
                VoiceMessage.session_id == str(session_id),
                VoiceMessage.organization_id == str(organization_id),
            )
            .order_by(VoiceMessage.sequence)
        )
        return list(result.scalars().all())

    async def get_events(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> list[CallEvent]:
        """Get all events for a session (tenant-isolated)."""
        await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        result = await self.db.execute(
            select(CallEvent)
            .where(
                CallEvent.session_id == str(session_id),
                CallEvent.organization_id == str(organization_id),
            )
            .order_by(CallEvent.sequence)
        )
        return list(result.scalars().all())

    # ====================================================================
    # Internal helpers
    # ====================================================================

    async def _resolve_default_assistant(
        self,
        organization_id: uuid.UUID,
    ) -> VoiceAssistant | None:
        """Find the tenant's default assistant (or first active assistant)."""
        # Try default first
        result = await self.db.execute(
            select(VoiceAssistant).where(
                VoiceAssistant.organization_id == str(organization_id),
                VoiceAssistant.is_active == True,  # noqa: E712
                VoiceAssistant.is_default == True,  # noqa: E712
            )
        )
        assistant = result.scalar_one_or_none()
        if assistant is not None:
            return assistant
        # Fall back to first active
        result = await self.db.execute(
            select(VoiceAssistant)
            .where(
                VoiceAssistant.organization_id == str(organization_id),
                VoiceAssistant.is_active == True,  # noqa: E712
            )
            .order_by(VoiceAssistant.created_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_assistant(
        self,
        organization_id: uuid.UUID,
        assistant_id: uuid.UUID,
    ) -> VoiceAssistant:
        result = await self.db.execute(
            select(VoiceAssistant).where(
                VoiceAssistant.id == assistant_id,
                VoiceAssistant.organization_id == str(organization_id),
                VoiceAssistant.is_active == True,  # noqa: E712
            )
        )
        assistant = result.scalar_one_or_none()
        if assistant is None:
            raise NotFoundError(
                f"Voice assistant {assistant_id} not found in organization {organization_id}"
            )
        return assistant

    async def _get_next_sequence(self, session_id: uuid.UUID) -> int:
        """Get the next sequence number for messages in a session."""
        from sqlalchemy import func

        result = await self.db.execute(
            select(func.max(VoiceMessage.sequence)).where(
                VoiceMessage.session_id == str(session_id)
            )
        )
        max_seq = result.scalar_one()
        return (max_seq or -1) + 1

    async def _emit_event(
        self,
        *,
        session: VoiceSession,
        event_type: str,
        source: str | None = None,
        payload: dict[str, Any] | None = None,
        timestamp_offset: float = 0.0,
        severity: str = "info",
    ) -> None:
        """Persist a CallEvent row."""
        # Get next event sequence
        from sqlalchemy import func

        result = await self.db.execute(
            select(func.max(CallEvent.sequence)).where(
                CallEvent.session_id == str(session.id)
            )
        )
        max_seq = result.scalar_one()
        seq = (max_seq or -1) + 1

        event = CallEvent(
            organization_id=session.organization_id,
            session_id=str(session.id),
            sequence=seq,
            event_type=event_type,
            payload=payload or {},
            timestamp_offset=timestamp_offset,
            source=source,
            severity=severity,
        )
        self.db.add(event)
        await self.db.flush()

    async def _compute_analytics(self, session: VoiceSession) -> VoiceAnalytics:
        """Compute per-call analytics after the session ends."""
        # Load all messages
        result = await self.db.execute(
            select(VoiceMessage).where(
                VoiceMessage.session_id == str(session.id),
                VoiceMessage.is_final == True,  # noqa: E712
            )
        )
        messages = list(result.scalars().all())

        # Compute latencies
        ai_latencies = [m.latency_ms for m in messages if m.speaker == "assistant" and m.latency_ms > 0]
        stt_confidences = [m.stt_confidence for m in messages if m.speaker == "caller" and m.stt_confidence is not None]
        ai_confidences = [m.ai_confidence for m in messages if m.speaker == "assistant" and m.ai_confidence is not None]

        # Aggregate
        avg_ai_latency = sum(ai_latencies) // len(ai_latencies) if ai_latencies else None
        max_ai_latency = max(ai_latencies) if ai_latencies else None
        avg_stt_conf = sum(stt_confidences) / len(stt_confidences) if stt_confidences else None
        avg_ai_conf = sum(ai_confidences) / len(ai_confidences) if ai_confidences else None

        # Talk time (rough — based on message durations)
        ai_talk_time = int(sum(
            (m.end_time - m.start_time) for m in messages if m.speaker == "assistant"
        ))
        customer_talk_time = int(sum(
            (m.end_time - m.start_time) for m in messages if m.speaker == "caller"
        ))
        total_talk = ai_talk_time + customer_talk_time
        talk_ratio = ai_talk_time / total_talk if total_talk > 0 else None

        # RAG stats
        rag_used = any(m.citations for m in messages if m.speaker == "assistant")
        rag_citations = sum(len(m.citations or []) for m in messages if m.speaker == "assistant")
        rag_fallbacks = sum(
            1 for m in messages if m.speaker == "assistant" and m.ai_confidence is not None and m.ai_confidence < 0.55
        )

        # Tokens
        tokens_in = sum(m.tokens_in for m in messages)
        tokens_out = sum(m.tokens_out for m in messages)

        # Outcome
        was_escalated = session.outcome == "escalated" or session.status == CallStatus.ESCALATED.value
        was_transferred = session.transferred_to is not None
        was_resolved = session.outcome == "resolved"

        # Load assistant for provider info
        stt_provider = None
        tts_provider = None
        if session.assistant_id:
            assistant = await self.db.execute(
                select(VoiceAssistant).where(VoiceAssistant.id == session.assistant_id)
            )
            a = assistant.scalar_one_or_none()
            if a is not None:
                stt_provider = a.stt_provider
                tts_provider = a.tts_provider

        # Find existing analytics row (or create)
        existing = await self.db.execute(
            select(VoiceAnalytics).where(VoiceAnalytics.session_id == str(session.id))
        )
        analytics = existing.scalar_one_or_none()
        if analytics is None:
            analytics = VoiceAnalytics(
                organization_id=session.organization_id,
                session_id=str(session.id),
                assistant_id=session.assistant_id,
            )
            self.db.add(analytics)

        analytics.started_at = session.started_at
        analytics.ended_at = session.ended_at
        analytics.duration_seconds = session.duration_seconds
        analytics.avg_ai_latency_ms = avg_ai_latency
        analytics.max_ai_latency_ms = max_ai_latency
        analytics.ai_talk_time_seconds = ai_talk_time
        analytics.customer_talk_time_seconds = customer_talk_time
        analytics.silence_seconds = session.silence_seconds
        analytics.overlap_seconds = session.overlap_seconds
        analytics.talk_ratio = talk_ratio
        analytics.turn_count = session.turn_count
        analytics.interruption_count = session.interruption_count
        analytics.barge_in_count = session.barge_in_count
        analytics.avg_stt_confidence = avg_stt_conf
        analytics.avg_ai_confidence = avg_ai_conf
        analytics.low_confidence_turns = rag_fallbacks
        analytics.outcome = session.outcome
        analytics.was_escalated = was_escalated
        analytics.was_transferred = was_transferred
        analytics.was_resolved = was_resolved
        analytics.satisfaction_score = session.satisfaction_score
        analytics.rag_used = rag_used
        analytics.rag_citations_count = rag_citations
        analytics.rag_fallback_count = rag_fallbacks
        analytics.cost_cents = session.cost_cents
        analytics.ai_tokens_in = tokens_in
        analytics.ai_tokens_out = tokens_out
        analytics.provider = session.provider
        analytics.stt_provider = stt_provider
        analytics.tts_provider = tts_provider

        await self.db.flush()
        return analytics

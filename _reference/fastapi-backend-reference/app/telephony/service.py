"""Telephony service — public API for the telephony platform.

Wraps:
- TelephonyProvider (Twilio fully implemented)
- CallRouter (rule-based routing)
- Voice AI integration (delegates to app.voice.VoiceService)

Provides the public methods used by the REST API + webhook layer:
- Phone number CRUD (register, list, update, delete, verify)
- Call session management (list active, list history, get, end, transfer)
- Recording management (list, get, download)
- Routing rules CRUD
- Business hours CRUD
- Telephony settings
- Webhook processing (inbound call, status callback, recording callback)
- Analytics aggregation
- Provider info

The telephony layer is the LAYER BELOW voice AI. It does NOT duplicate
AI logic — when a call is routed to AI, it delegates to the existing
Voice AI platform (app.voice.*) which handles STT/TTS/LLM/RAG.
"""

import uuid
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.telephony import (
    BusinessHoursSchedule,
    CallRecording,
    PhoneNumber,
    RoutingRule,
    TelephonyCallEvent,
    TelephonyCallLog,
    TelephonyCallSession,
    TelephonyProvider,
    TelephonySettings,
)
from app.telephony.call_router import CallRouter
from app.telephony.providers import (
    CallDirection,
    CallTransferRequest,
    ProviderCallStatus,
    TelephonyProvider as ProviderInterface,
    TelephonyProviderError,
    get_telephony_provider,
)
from app.telephony.providers.models import (
    TelephonyCallRequest,
    TelephonyEvent,
    TelephonyEventType,
)

logger = get_logger(__name__)


class TelephonyService:
    """Public telephony service (multi-tenant)."""

    def __init__(
        self,
        db: AsyncSession,
        provider: ProviderInterface | None = None,
    ) -> None:
        self.db = db
        self._provider = provider
        self.router = CallRouter(db)

    @property
    def provider(self) -> ProviderInterface:
        if self._provider is None:
            self._provider = get_telephony_provider()
        return self._provider

    @property
    def provider_name(self) -> str:
        if self._provider is not None:
            name = getattr(self._provider, "name", None)
            if isinstance(name, str):
                return name
        return settings.TELEPHONY_PROVIDER

    # ====================================================================
    # Phone number management
    # ====================================================================

    async def register_phone_number(
        self,
        *,
        organization_id: uuid.UUID,
        number: str,
        display_name: str = "Main Line",
        description: str | None = None,
        provider_type: str | None = None,
        provider_number_sid: str | None = None,
        country_code: str = "US",
        number_type: str = "local",
        routing_strategy: str = "ai",
        voice_assistant_id: uuid.UUID | None = None,
        forward_to_number: str | None = None,
        business_hours_id: uuid.UUID | None = None,
        recording_enabled: bool = True,
        recording_announcement: str | None = None,
        verify_with_provider: bool = False,
        metadata: dict[str, Any] | None = None,
    ) -> PhoneNumber:
        """Register a phone number for a tenant.

        Args:
            verify_with_provider: If True, query the provider to confirm
                the number is owned by this account.
        """
        # Validate E.164 format (basic)
        if not number or not number.startswith("+"):
            raise ValidationError(
                f"Phone number must be in E.164 format (start with '+'): got {number!r}"
            )

        # Check for duplicate
        existing = await self._find_phone_number_by_number(number)
        if existing is not None:
            raise ValidationError(
                f"Phone number {number} is already registered"
            )

        # Optionally verify with provider
        is_verified = False
        if verify_with_provider:
            try:
                provider_numbers = await self.provider.list_phone_numbers()
                for pn in provider_numbers:
                    if pn.get("phone_number") == number or pn.get("phoneNumber") == number:
                        is_verified = True
                        if not provider_number_sid:
                            provider_number_sid = pn.get("sid") or pn.get("id")
                        break
            except TelephonyProviderError as e:
                logger.warning(
                    "phone_number_provider_verify_failed",
                    number=number,
                    error=str(e),
                )

        phone = PhoneNumber(
            organization_id=str(organization_id),
            number=number,
            display_name=display_name,
            description=description,
            provider_type=provider_type or self.provider_name,
            provider_number_sid=provider_number_sid,
            country_code=country_code,
            number_type=number_type,
            voice_enabled=True,
            routing_strategy=routing_strategy,
            voice_assistant_id=str(voice_assistant_id) if voice_assistant_id else None,
            forward_to_number=forward_to_number,
            business_hours_id=str(business_hours_id) if business_hours_id else None,
            recording_enabled=recording_enabled,
            recording_announcement=recording_announcement,
            is_active=True,
            is_verified=is_verified,
            metadata_=metadata or {},
        )
        self.db.add(phone)
        await self.db.flush()

        logger.info(
            "phone_number_registered",
            organization_id=str(organization_id),
            number=number,
            phone_id=str(phone.id),
        )
        return phone

    async def list_phone_numbers(
        self,
        *,
        organization_id: uuid.UUID,
        is_active: bool = True,
    ) -> list[PhoneNumber]:
        result = await self.db.execute(
            select(PhoneNumber)
            .where(
                PhoneNumber.organization_id == str(organization_id),
                PhoneNumber.is_active == is_active,
            )
            .order_by(PhoneNumber.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_phone_number(
        self,
        *,
        organization_id: uuid.UUID,
        phone_number_id: uuid.UUID,
    ) -> PhoneNumber:
        result = await self.db.execute(
            select(PhoneNumber).where(
                PhoneNumber.id == phone_number_id,
                PhoneNumber.organization_id == str(organization_id),
            )
        )
        phone = result.scalar_one_or_none()
        if phone is None:
            raise NotFoundError(f"Phone number {phone_number_id} not found")
        return phone

    async def get_phone_number_by_number(
        self,
        *,
        number: str,
    ) -> PhoneNumber | None:
        """Look up a phone number by E.164 (NOT tenant-scoped — used by webhooks)."""
        return await self._find_phone_number_by_number(number)

    async def _find_phone_number_by_number(self, number: str) -> PhoneNumber | None:
        result = await self.db.execute(
            select(PhoneNumber).where(PhoneNumber.number == number)
        )
        return result.scalar_one_or_none()

    async def update_phone_number(
        self,
        *,
        organization_id: uuid.UUID,
        phone_number_id: uuid.UUID,
        **kwargs: Any,
    ) -> PhoneNumber:
        phone = await self.get_phone_number(
            organization_id=organization_id, phone_number_id=phone_number_id
        )
        for key, value in kwargs.items():
            if hasattr(phone, key) and value is not None:
                setattr(phone, key, value)
        await self.db.flush()
        return phone

    async def delete_phone_number(
        self,
        *,
        organization_id: uuid.UUID,
        phone_number_id: uuid.UUID,
        release_from_provider: bool = False,
    ) -> bool:
        phone = await self.get_phone_number(
            organization_id=organization_id, phone_number_id=phone_number_id
        )
        if release_from_provider and phone.provider_number_sid:
            try:
                await self.provider.release_phone_number(phone.provider_number_sid)
            except TelephonyProviderError as e:
                logger.warning(
                    "phone_number_release_failed",
                    phone_number_id=str(phone_number_id),
                    error=str(e),
                )
        phone.is_active = False
        await self.db.flush()
        return True

    # ====================================================================
    # Call sessions
    # ====================================================================

    async def list_active_calls(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> list[TelephonyCallSession]:
        """List all currently-active calls for a tenant."""
        result = await self.db.execute(
            select(TelephonyCallSession)
            .where(
                TelephonyCallSession.organization_id == str(organization_id),
                TelephonyCallSession.status.in_(
                    ["ringing", "answered", "in_progress", "on_hold", "transferring"]
                ),
            )
            .order_by(TelephonyCallSession.started_at.desc())
        )
        return list(result.scalars().all())

    async def list_call_history(
        self,
        *,
        organization_id: uuid.UUID,
        phone_number_id: uuid.UUID | None = None,
        direction: str | None = None,
        outcome: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[TelephonyCallLog], int]:
        """List call history (completed calls) for a tenant."""
        conditions = [
            TelephonyCallLog.organization_id == str(organization_id),
        ]
        if phone_number_id is not None:
            conditions.append(TelephonyCallLog.phone_number_id == str(phone_number_id))
        if direction is not None:
            conditions.append(TelephonyCallLog.direction == direction)
        if outcome is not None:
            conditions.append(TelephonyCallLog.outcome == outcome)

        count_stmt = select(func.count()).select_from(TelephonyCallLog).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(TelephonyCallLog)
            .where(*conditions)
            .order_by(TelephonyCallLog.started_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_session(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> TelephonyCallSession:
        result = await self.db.execute(
            select(TelephonyCallSession).where(
                TelephonyCallSession.id == session_id,
                TelephonyCallSession.organization_id == str(organization_id),
            )
        )
        session = result.scalar_one_or_none()
        if session is None:
            raise NotFoundError(f"Call session {session_id} not found")
        return session

    async def get_session_by_call_sid(
        self,
        call_sid: str,
    ) -> TelephonyCallSession | None:
        """Look up a session by provider call SID (NOT tenant-scoped — used by webhooks)."""
        result = await self.db.execute(
            select(TelephonyCallSession).where(TelephonyCallSession.call_sid == call_sid)
        )
        return result.scalar_one_or_none()

    async def end_call(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
        outcome: str = "caller_ended",
    ) -> TelephonyCallSession:
        """End a call (hangs up at provider + updates session)."""
        session = await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        # End at provider
        try:
            await self.provider.end_call(session.call_sid)
        except TelephonyProviderError as e:
            logger.warning(
                "telephony_end_call_provider_failed",
                session_id=str(session_id),
                error=str(e),
            )
        # Update session
        now = datetime.now(UTC)
        session.status = "completed"
        session.ended_at = now
        session.hangup_by = "system"
        session.outcome = outcome
        if session.started_at:
            session.duration_seconds = int((now - session.started_at).total_seconds())
        await self.db.flush()

        # Emit event
        await self._emit_event(
            session=session,
            event_type="call.ended",
            source="system",
            payload={"outcome": outcome},
        )
        return session

    async def transfer_call(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
        to_number: str,
        reason: str = "manual",
    ) -> TelephonyCallSession:
        """Transfer a call to another number."""
        session = await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        # Transfer at provider
        try:
            await self.provider.transfer_call(
                CallTransferRequest(
                    call_sid=session.call_sid,
                    to_number=to_number,
                )
            )
        except TelephonyProviderError as e:
            raise ValidationError(f"Transfer failed: {e}") from e

        session.status = "transferring"
        session.transferred_to = to_number
        session.transferred_at = datetime.now(UTC)
        session.transfer_reason = reason
        await self.db.flush()

        await self._emit_event(
            session=session,
            event_type="call.transfer_initiated",
            source="system",
            payload={"to_number": to_number, "reason": reason},
        )
        return session

    async def hold_call(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> TelephonyCallSession:
        """Put a call on hold."""
        session = await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        try:
            await self.provider.hold_call(session.call_sid)
        except TelephonyProviderError as e:
            raise ValidationError(f"Hold failed: {e}") from e
        session.status = "on_hold"
        session.hold_count += 1
        await self.db.flush()
        await self._emit_event(
            session=session,
            event_type="call.hold",
            source="system",
            payload={},
        )
        return session

    async def resume_call(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> TelephonyCallSession:
        """Resume a held call."""
        session = await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        try:
            await self.provider.resume_call(session.call_sid)
        except TelephonyProviderError as e:
            raise ValidationError(f"Resume failed: {e}") from e
        session.status = "in_progress"
        await self.db.flush()
        await self._emit_event(
            session=session,
            event_type="call.resume",
            source="system",
            payload={},
        )
        return session

    # ====================================================================
    # Recordings
    # ====================================================================

    async def list_recordings(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CallRecording], int]:
        conditions = [
            CallRecording.organization_id == str(organization_id),
        ]
        if session_id is not None:
            conditions.append(CallRecording.session_id == str(session_id))

        count_stmt = select(func.count()).select_from(CallRecording).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(CallRecording)
            .where(*conditions)
            .order_by(CallRecording.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_recording(
        self,
        *,
        organization_id: uuid.UUID,
        recording_id: uuid.UUID,
    ) -> CallRecording:
        result = await self.db.execute(
            select(CallRecording).where(
                CallRecording.id == recording_id,
                CallRecording.organization_id == str(organization_id),
            )
        )
        recording = result.scalar_one_or_none()
        if recording is None:
            raise NotFoundError(f"Recording {recording_id} not found")
        return recording

    async def store_recording(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
        recording_sid: str,
        url: str,
        duration_seconds: int,
        format: str = "mp3",
        channels: int = 2,
        status: str = "completed",
        size_bytes: int | None = None,
    ) -> CallRecording:
        """Store a recording (called when recording webhook arrives)."""
        recording = CallRecording(
            organization_id=str(organization_id),
            session_id=str(session_id),
            call_sid="",  # filled by caller
            provider=self.provider_name,
            recording_sid=recording_sid,
            url=url,
            duration_seconds=duration_seconds,
            format=format,
            channels="dual" if channels == 2 else "mono",
            size_bytes=size_bytes,
            status=status,
            consent_obtained=True,
            consent_method="announcement",
        )
        self.db.add(recording)
        await self.db.flush()

        # Update session with recording link
        session = await self.db.execute(
            select(TelephonyCallSession).where(
                TelephonyCallSession.id == session_id
            )
        )
        s = session.scalar_one_or_none()
        if s is not None:
            s.recording_id = str(recording.id)
            await self.db.flush()

        return recording

    # ====================================================================
    # Routing rules
    # ====================================================================

    async def create_routing_rule(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        action: str,
        conditions: dict[str, Any] | None = None,
        action_config: dict[str, Any] | None = None,
        priority: int = 100,
        phone_number_id: uuid.UUID | None = None,
        description: str | None = None,
        created_by: uuid.UUID | None = None,
    ) -> RoutingRule:
        if action not in ("ai", "forward", "voicemail", "reject", "queue"):
            raise ValidationError(
                f"Invalid action {action!r}. Must be one of: ai, forward, voicemail, reject, queue"
            )
        rule = RoutingRule(
            organization_id=str(organization_id),
            phone_number_id=str(phone_number_id) if phone_number_id else None,
            name=name,
            description=description,
            priority=priority,
            conditions=conditions or {},
            action=action,
            action_config=action_config or {},
            is_active=True,
            created_by=str(created_by) if created_by else None,
        )
        self.db.add(rule)
        await self.db.flush()
        return rule

    async def list_routing_rules(
        self,
        *,
        organization_id: uuid.UUID,
        phone_number_id: uuid.UUID | None = None,
    ) -> list[RoutingRule]:
        conditions = [
            RoutingRule.organization_id == str(organization_id),
            RoutingRule.is_active == True,  # noqa: E712
        ]
        if phone_number_id is not None:
            conditions.append(RoutingRule.phone_number_id == str(phone_number_id))
        result = await self.db.execute(
            select(RoutingRule)
            .where(*conditions)
            .order_by(RoutingRule.priority.asc())
        )
        return list(result.scalars().all())

    async def delete_routing_rule(
        self,
        *,
        organization_id: uuid.UUID,
        rule_id: uuid.UUID,
    ) -> bool:
        result = await self.db.execute(
            select(RoutingRule).where(
                RoutingRule.id == rule_id,
                RoutingRule.organization_id == str(organization_id),
            )
        )
        rule = result.scalar_one_or_none()
        if rule is None:
            raise NotFoundError(f"Routing rule {rule_id} not found")
        rule.is_active = False
        await self.db.flush()
        return True

    # ====================================================================
    # Business hours
    # ====================================================================

    async def create_business_hours(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        timezone: str = "UTC",
        weekly_schedule: dict[str, Any] | None = None,
        holidays: list | None = None,
        after_hours_strategy: str = "voicemail",
        after_hours_forward_to: str | None = None,
        after_hours_message: str | None = None,
        description: str | None = None,
        is_default: bool = False,
    ) -> BusinessHoursSchedule:
        # If this is the first schedule, mark as default
        existing_count = await self._count_business_hours(organization_id)
        if existing_count == 0:
            is_default = True

        schedule = BusinessHoursSchedule(
            organization_id=str(organization_id),
            name=name,
            description=description,
            timezone=timezone,
            weekly_schedule=weekly_schedule or self._default_weekly_schedule(),
            holidays=holidays or [],
            after_hours_strategy=after_hours_strategy,
            after_hours_forward_to=after_hours_forward_to,
            after_hours_message=after_hours_message,
            is_active=True,
            is_default=is_default,
        )
        self.db.add(schedule)
        await self.db.flush()
        return schedule

    async def list_business_hours(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> list[BusinessHoursSchedule]:
        result = await self.db.execute(
            select(BusinessHoursSchedule)
            .where(
                BusinessHoursSchedule.organization_id == str(organization_id),
                BusinessHoursSchedule.is_active == True,  # noqa: E712
            )
            .order_by(BusinessHoursSchedule.created_at.desc())
        )
        return list(result.scalars().all())

    async def _count_business_hours(
        self,
        organization_id: uuid.UUID,
    ) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(BusinessHoursSchedule)
            .where(
                BusinessHoursSchedule.organization_id == str(organization_id),
                BusinessHoursSchedule.is_active == True,  # noqa: E712
            )
        )
        return int(result.scalar_one())

    @staticmethod
    def _default_weekly_schedule() -> dict[str, Any]:
        """Default Mon-Fri 9-5 schedule."""
        return {
            "monday":    {"enabled": True,  "start": "09:00", "end": "18:00"},
            "tuesday":   {"enabled": True,  "start": "09:00", "end": "18:00"},
            "wednesday": {"enabled": True,  "start": "09:00", "end": "18:00"},
            "thursday":  {"enabled": True,  "start": "09:00", "end": "18:00"},
            "friday":    {"enabled": True,  "start": "09:00", "end": "18:00"},
            "saturday":  {"enabled": False, "start": "00:00", "end": "00:00"},
            "sunday":    {"enabled": False, "start": "00:00", "end": "00:00"},
        }

    # ====================================================================
    # Settings
    # ====================================================================

    async def get_settings(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> TelephonySettings:
        result = await self.db.execute(
            select(TelephonySettings).where(
                TelephonySettings.organization_id == str(organization_id)
            )
        )
        s = result.scalar_one_or_none()
        if s is None:
            s = TelephonySettings(
                organization_id=str(organization_id),
                provider=settings.TELEPHONY_PROVIDER,
                default_routing_strategy=settings.DEFAULT_ROUTING_STRATEGY,
                enable_recording=settings.ENABLE_CALL_RECORDING,
                recording_format=settings.RECORDING_FORMAT,
                recording_channels=settings.RECORDING_CHANNELS,
                enable_voicemail=settings.ENABLE_VOICEMAIL,
                voicemail_max_duration=settings.VOICEMAIL_MAX_DURATION,
                max_call_duration=settings.MAX_CALL_DURATION,
                enable_media_stream=settings.ENABLE_MEDIA_STREAM,
                is_active=True,
            )
            self.db.add(s)
            await self.db.flush()
        return s

    async def update_settings(
        self,
        *,
        organization_id: uuid.UUID,
        **kwargs: Any,
    ) -> TelephonySettings:
        s = await self.get_settings(organization_id=organization_id)
        for key, value in kwargs.items():
            if hasattr(s, key) and value is not None:
                setattr(s, key, value)
        await self.db.flush()
        return s

    # ====================================================================
    # Webhook processing
    # ====================================================================

    async def process_inbound_call(
        self,
        *,
        body: bytes,
        headers: dict[str, str],
        webhook_url: str,
    ) -> dict[str, Any]:
        """Process an inbound call webhook from the telephony provider.

        Returns:
            Dict with: session_id, twiml (the TwiML response to return to the provider).
        """
        # Verify signature
        if not self.provider.verify_webhook_signature(body, headers, url=webhook_url):
            logger.warning(
                "telephony_inbound_invalid_signature",
                provider=self.provider_name,
            )
            return {"status": "error", "error": "Invalid signature"}

        # Parse the inbound call
        try:
            inbound = self.provider.parse_inbound_call(body, headers)
        except TelephonyProviderError as e:
            return {"status": "error", "error": str(e)}

        # Look up the phone number that received the call
        phone = await self.get_phone_number_by_number(number=inbound.to_number)
        if phone is None:
            logger.warning(
                "telephony_inbound_unknown_number",
                to_number=inbound.to_number,
            )
            # Return hangup TwiML
            return {
                "status": "error",
                "error": "Phone number not registered",
                "twiml": self.provider.generate_hangup_twiml(),
            }

        organization_id = uuid.UUID(phone.organization_id)

        # Route the call
        decision = await self.router.route_call(
            organization_id=organization_id,
            phone_number=phone,
            caller_phone=inbound.from_number,
            caller_name=inbound.caller_name,
        )

        # Create a telephony call session
        session = TelephonyCallSession(
            organization_id=str(organization_id),
            provider=self.provider_name,
            call_sid=inbound.call_sid,
            phone_number_id=str(phone.id),
            direction=inbound.direction.value,
            from_number=inbound.from_number,
            to_number=inbound.to_number,
            caller_name=inbound.caller_name,
            status="ringing",
            routing_rule_id=decision.rule_id,
            routing_decision=decision.action,
            routing_reason=decision.reason,
            recording_enabled=phone.recording_enabled and settings.ENABLE_CALL_RECORDING,
            started_at=datetime.now(UTC),
            metadata_=inbound.metadata,
        )
        self.db.add(session)
        await self.db.flush()

        # Emit call.initiated event
        await self._emit_event(
            session=session,
            event_type="call.initiated",
            source="provider",
            payload={
                "from": inbound.from_number,
                "to": inbound.to_number,
                "caller_name": inbound.caller_name,
            },
        )

        # Generate TwiML based on the routing decision
        twiml = await self._generate_twiml_for_decision(
            decision=decision,
            session=session,
            phone=phone,
        )

        logger.info(
            "telephony_inbound_processed",
            session_id=str(session.id),
            call_sid=inbound.call_sid,
            routing=decision.action,
            reason=decision.reason,
        )

        return {
            "status": "ok",
            "session_id": str(session.id),
            "call_sid": inbound.call_sid,
            "routing_decision": decision.action,
            "twiml": twiml,
        }

    async def process_status_callback(
        self,
        *,
        body: bytes,
        headers: dict[str, str],
        webhook_url: str,
    ) -> dict[str, Any]:
        """Process a status callback webhook."""
        if not self.provider.verify_webhook_signature(body, headers, url=webhook_url):
            return {"status": "error", "error": "Invalid signature"}

        try:
            event = self.provider.parse_status_callback(body, headers)
        except TelephonyProviderError as e:
            return {"status": "error", "error": str(e)}

        if not event.call_sid:
            return {"status": "error", "error": "No CallSid"}

        # Look up the session
        session = await self.get_session_by_call_sid(event.call_sid)
        if session is None:
            logger.warning(
                "telephony_status_unknown_call_sid",
                call_sid=event.call_sid,
            )
            return {"status": "ok", "event_type": event.event_type.value}

        # Apply state transitions
        await self._apply_status_update(session, event)

        # Emit event
        await self._emit_event(
            session=session,
            event_type=f"call.{event.event_type.value.split('.')[-1]}",
            source="provider",
            payload=event.payload,
            timestamp_offset=event.timestamp_offset,
        )

        return {
            "status": "ok",
            "event_type": event.event_type.value,
            "call_sid": event.call_sid,
        }

    async def process_recording_callback(
        self,
        *,
        body: bytes,
        headers: dict[str, str],
        webhook_url: str,
    ) -> dict[str, Any]:
        """Process a recording status callback webhook."""
        if not self.provider.verify_webhook_signature(body, headers, url=webhook_url):
            return {"status": "error", "error": "Invalid signature"}

        try:
            event = self.provider.parse_recording_callback(body, headers)
        except TelephonyProviderError as e:
            return {"status": "error", "error": str(e)}

        if not event.call_sid:
            return {"status": "error", "error": "No CallSid"}

        session = await self.get_session_by_call_sid(event.call_sid)
        if session is None:
            return {"status": "error", "error": "Session not found"}

        recording = event.recording
        if recording is None:
            return {"status": "ok"}

        # Store the recording
        rec = await self.store_recording(
            organization_id=uuid.UUID(session.organization_id) if isinstance(session.organization_id, str) else session.organization_id,
            session_id=session.id if hasattr(session.id, 'hex') else uuid.UUID(str(session.id)),
            recording_sid=recording.recording_sid,
            url=recording.url,
            duration_seconds=recording.duration_seconds,
            format=recording.format,
            channels=recording.channels,
            status=recording.status,
            size_bytes=recording.size_bytes,
        )
        # Update recording.call_sid (store_recording leaves it empty)
        rec.call_sid = session.call_sid
        await self.db.flush()

        await self._emit_event(
            session=session,
            event_type=f"recording.{event.event_type.value.split('.')[-1]}",
            source="provider",
            payload={"recording_id": str(rec.id), "url": recording.url},
        )

        return {
            "status": "ok",
            "recording_id": str(rec.id),
            "url": recording.url,
        }

    async def _apply_status_update(
        self,
        session: TelephonyCallSession,
        event: TelephonyEvent,
    ) -> None:
        """Apply a status update to the session."""
        update = event.call_update
        if update is None:
            return

        status_map = {
            ProviderCallStatus.RINGING: "ringing",
            ProviderCallStatus.ANSWERED: "answered",
            ProviderCallStatus.IN_PROGRESS: "in_progress",
            ProviderCallStatus.COMPLETED: "completed",
            ProviderCallStatus.FAILED: "failed",
            ProviderCallStatus.BUSY: "busy",
            ProviderCallStatus.NO_ANSWER: "no_answer",
            ProviderCallStatus.CANCELED: "completed",
        }
        new_status = status_map.get(update.status)
        if new_status:
            session.status = new_status

        if update.status == ProviderCallStatus.ANSWERED:
            session.answered_at = datetime.now(UTC)
        elif update.status in (
            ProviderCallStatus.COMPLETED,
            ProviderCallStatus.FAILED,
            ProviderCallStatus.BUSY,
            ProviderCallStatus.NO_ANSWER,
        ):
            session.ended_at = datetime.now(UTC)
            session.hangup_cause = update.hangup_cause
            if session.started_at:
                session.duration_seconds = int(
                    (session.ended_at - session.started_at).total_seconds()
                )
            # Set outcome
            if update.status == ProviderCallStatus.COMPLETED:
                session.outcome = session.outcome or "completed"
            elif update.status == ProviderCallStatus.BUSY:
                session.outcome = "busy"
            elif update.status == ProviderCallStatus.NO_ANSWER:
                session.outcome = "missed"
            elif update.status == ProviderCallStatus.FAILED:
                session.outcome = "failed"

            # Create call log
            await self._create_call_log(session)

        await self.db.flush()

    async def _create_call_log(self, session: TelephonyCallSession) -> None:
        """Create a TelephonyCallLog row when a call ends."""
        # Check if log already exists
        existing = await self.db.execute(
            select(TelephonyCallLog).where(
                TelephonyCallLog.session_id == str(session.id)
            )
        )
        if existing.scalar_one_or_none() is not None:
            return

        log = TelephonyCallLog(
            organization_id=session.organization_id,
            session_id=str(session.id),
            call_sid=session.call_sid,
            provider=session.provider,
            direction=session.direction,
            from_number=session.from_number,
            to_number=session.to_number,
            caller_name=session.caller_name,
            customer_id=session.customer_id,
            phone_number_id=session.phone_number_id,
            voice_session_id=session.voice_session_id,
            voice_assistant_id=session.voice_assistant_id,
            status=session.status,
            outcome=session.outcome,
            routing_decision=session.routing_decision,
            routing_reason=session.routing_reason,
            started_at=session.started_at,
            answered_at=session.answered_at,
            ended_at=session.ended_at,
            duration_seconds=session.duration_seconds,
            wait_time_seconds=session.wait_time_seconds,
            has_recording=session.recording_id is not None,
            recording_id=session.recording_id,
            transferred_to=session.transferred_to,
            transfer_reason=session.transfer_reason,
            ai_handled=bool(session.voice_session_id),
            ai_resolution=session.outcome == "resolved" and bool(session.voice_session_id),
            cost_cents=session.cost_cents,
            sentiment=session.sentiment,
            error_message=session.error_message,
            hangup_cause=session.hangup_cause,
            hangup_by=session.hangup_by,
        )
        self.db.add(log)
        await self.db.flush()

    async def _generate_twiml_for_decision(
        self,
        *,
        decision: Any,
        session: TelephonyCallSession,
        phone: PhoneNumber,
    ) -> str:
        """Generate TwiML based on the routing decision."""
        if decision.action == "ai":
            # Connect to AI media stream
            ai_ws_url = settings.VOICE_WS_TOKEN_TTL_SECONDS and "" or ""
            # In production, this would be: wss://your-domain.com/api/v1/voice/stream/{session_id}
            # For now, generate a placeholder URL the caller can override
            ws_url = f"wss://your-domain.com/api/v1/telephony/media-stream/{session.id}"
            return self.provider.generate_connect_twiml(
                ai_websocket_url=ws_url,
                greeting_text=phone.recording_announcement,
                recording_enabled=phone.recording_enabled,
                recording_status_callback=f"https://your-domain.com/api/v1/telephony/webhook/{self.provider_name}/recording",
                session_id=str(session.id),
                organization_id=session.organization_id,
                assistant_id=phone.voice_assistant_id,
            )
        elif decision.action == "forward":
            forward_to = decision.action_config.get("forward_to") or phone.forward_to_number or ""
            if not forward_to:
                return self.provider.generate_hangup_twiml()
            return self.provider.generate_dial_twiml(
                forward_to,
                timeout=decision.action_config.get("timeout", 30),
                record=phone.recording_enabled,
                caller_id=phone.number,
            )
        elif decision.action == "voicemail":
            # Generate voicemail TwiML
            from app.telephony.twiml import voicemail as vm_twiml
            return vm_twiml(
                action_url=f"https://your-domain.com/api/v1/telephony/webhook/{self.provider_name}/voicemail",
                max_duration=decision.action_config.get("max_duration", settings.VOICEMAIL_MAX_DURATION),
                greeting="Please leave a message after the tone.",
                transcribe=True,
            )
        elif decision.action == "reject":
            from app.telephony.twiml import reject_busy
            return reject_busy()
        else:
            return self.provider.generate_hangup_twiml()

    async def _emit_event(
        self,
        *,
        session: TelephonyCallSession,
        event_type: str,
        source: str | None = None,
        payload: dict[str, Any] | None = None,
        timestamp_offset: float = 0.0,
        severity: str = "info",
    ) -> None:
        """Persist a TelephonyCallEvent row."""
        result = await self.db.execute(
            select(func.max(TelephonyCallEvent.sequence)).where(
                TelephonyCallEvent.session_id == str(session.id)
            )
        )
        max_seq = result.scalar_one()
        seq = (max_seq or -1) + 1

        event = TelephonyCallEvent(
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

    # ====================================================================
    # Analytics
    # ====================================================================

    async def get_analytics_summary(
        self,
        *,
        organization_id: uuid.UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get aggregate telephony analytics for a tenant."""
        from datetime import timedelta

        cutoff = datetime.now(UTC) - timedelta(days=days)

        # Total calls
        total_stmt = (
            select(func.count())
            .select_from(TelephonyCallLog)
            .where(
                TelephonyCallLog.organization_id == str(organization_id),
                TelephonyCallLog.started_at >= cutoff,
            )
        )
        total_calls = (await self.db.execute(total_stmt)).scalar_one()

        # Answer rate
        answered_stmt = (
            select(func.count())
            .select_from(TelephonyCallLog)
            .where(
                TelephonyCallLog.organization_id == str(organization_id),
                TelephonyCallLog.started_at >= cutoff,
                TelephonyCallLog.duration_seconds > 0,
            )
        )
        answered = (await self.db.execute(answered_stmt)).scalar_one()

        # Missed calls
        missed_stmt = (
            select(func.count())
            .select_from(TelephonyCallLog)
            .where(
                TelephonyCallLog.organization_id == str(organization_id),
                TelephonyCallLog.started_at >= cutoff,
                TelephonyCallLog.outcome == "missed",
            )
        )
        missed = (await self.db.execute(missed_stmt)).scalar_one()

        # Avg duration
        avg_dur_stmt = (
            select(func.avg(TelephonyCallLog.duration_seconds))
            .where(
                TelephonyCallLog.organization_id == str(organization_id),
                TelephonyCallLog.started_at >= cutoff,
                TelephonyCallLog.duration_seconds > 0,
            )
        )
        avg_duration = (await self.db.execute(avg_dur_stmt)).scalar_one()

        # AI resolution rate
        ai_handled_stmt = (
            select(func.count())
            .select_from(TelephonyCallLog)
            .where(
                TelephonyCallLog.organization_id == str(organization_id),
                TelephonyCallLog.started_at >= cutoff,
                TelephonyCallLog.ai_handled == True,  # noqa: E712
            )
        )
        ai_handled = (await self.db.execute(ai_handled_stmt)).scalar_one()

        ai_resolved_stmt = (
            select(func.count())
            .select_from(TelephonyCallLog)
            .where(
                TelephonyCallLog.organization_id == str(organization_id),
                TelephonyCallLog.started_at >= cutoff,
                TelephonyCallLog.ai_resolution == True,  # noqa: E712
            )
        )
        ai_resolved = (await self.db.execute(ai_resolved_stmt)).scalar_one()

        # Human transfer rate
        transferred_stmt = (
            select(func.count())
            .select_from(TelephonyCallLog)
            .where(
                TelephonyCallLog.organization_id == str(organization_id),
                TelephonyCallLog.started_at >= cutoff,
                TelephonyCallLog.transferred_to.isnot(None),
            )
        )
        transferred = (await self.db.execute(transferred_stmt)).scalar_one()

        # Recording availability
        recorded_stmt = (
            select(func.count())
            .select_from(TelephonyCallLog)
            .where(
                TelephonyCallLog.organization_id == str(organization_id),
                TelephonyCallLog.started_at >= cutoff,
                TelephonyCallLog.has_recording == True,  # noqa: E712
            )
        )
        recorded = (await self.db.execute(recorded_stmt)).scalar_one()

        # Outcomes breakdown
        outcome_stmt = (
            select(TelephonyCallLog.outcome, func.count())
            .where(
                TelephonyCallLog.organization_id == str(organization_id),
                TelephonyCallLog.started_at >= cutoff,
            )
            .group_by(TelephonyCallLog.outcome)
        )
        outcomes = {
            str(o) if o is not None else "unknown": c
            for o, c in (await self.db.execute(outcome_stmt)).all()
        }

        return {
            "period_days": days,
            "total_calls": total_calls,
            "answer_rate": (answered / total_calls) if total_calls > 0 else 0.0,
            "missed_calls": missed,
            "avg_duration_seconds": float(avg_duration or 0),
            "ai_handled": ai_handled,
            "ai_resolution_rate": (
                (ai_resolved / ai_handled) if ai_handled > 0 else 0.0
            ),
            "human_transfer_rate": (
                (transferred / total_calls) if total_calls > 0 else 0.0
            ),
            "recording_availability": (
                (recorded / total_calls) if total_calls > 0 else 0.0
            ),
            "outcomes": outcomes,
        }

    # ====================================================================
    # Provider info
    # ====================================================================

    async def list_providers(self) -> list[dict[str, Any]]:
        from app.telephony.providers import TELEPHONY_PROVIDER_REGISTRY

        return [
            {
                "name": name,
                "class": cls.__name__,
                "implemented": name == "twilio",
            }
            for name, cls in TELEPHONY_PROVIDER_REGISTRY.items()
        ]

"""Voice service — public API for the Voice AI platform.

Wraps:
- VoiceSessionManager (session lifecycle)
- VoiceConversationService (STT → AI → TTS orchestration)
- VoiceProvider (assistant CRUD + call management)

Provides the public methods used by the REST API + WebSocket layer:
- Assistant CRUD (create, update, delete, list, get)
- Provider assistant sync (push local assistant → provider)
- Voice settings management (per-tenant)
- Session management (list, get, end)
- Transcript retrieval
- Analytics aggregation
- Voice testing (start test call)
"""

import uuid
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.voice import (
    CallEvent,
    VoiceAnalytics,
    VoiceAssistant,
    VoiceMessage,
    VoiceProvider,
    VoiceSession,
    VoiceSettings,
    VoiceWebhookLog,
)
from app.voice.conversation import VoiceConversationService
from app.voice.providers import (
    AssistantConfig,
    ProviderCallRequest,
    VoiceProvider,
    VoiceProviderError,
    get_voice_provider,
)
from app.voice.providers.models import ProviderEvent
from app.voice.session_manager import VoiceSessionManager

logger = get_logger(__name__)


class VoiceService:
    """Public Voice AI service (multi-tenant)."""

    def __init__(
        self,
        db: AsyncSession,
        provider: VoiceProvider | None = None,
    ) -> None:
        self.db = db
        self._provider = provider
        self.session_manager = VoiceSessionManager(db, provider=provider)
        self.conversation = VoiceConversationService(db)

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
        return settings.VOICE_PROVIDER

    # ====================================================================
    # Assistant CRUD
    # ====================================================================

    async def create_assistant(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        system_prompt: str,
        assistant_type: str = "support",
        greeting: str | None = None,
        description: str | None = None,
        voice: str | None = None,
        voice_provider: str | None = None,
        language: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        stt_provider: str | None = None,
        tts_provider: str | None = None,
        ai_provider: str | None = None,
        ai_model: str | None = None,
        enable_rag: bool = True,
        rag_categories: list[str] | None = None,
        enable_barge_in: bool = True,
        enable_vad: bool = True,
        silence_timeout_seconds: int | None = None,
        max_call_duration: int | None = None,
        max_turns: int | None = None,
        escalation_phone: str | None = None,
        escalation_threshold: float | None = None,
        business_hours: dict[str, Any] | None = None,
        fallback_message: str | None = None,
        end_of_call_message: str | None = None,
        metadata: dict[str, Any] | None = None,
        sync_to_provider: bool = True,
        created_by: uuid.UUID | None = None,
    ) -> VoiceAssistant:
        """Create a new voice assistant.

        Args:
            sync_to_provider: If True, also creates the assistant on the
                provider side (e.g. Vapi) and stores the provider_assistant_id.
                Set to False for testing without provider credentials.
        """
        # If this is the first assistant for the org, mark as default
        existing_count = await self._count_assistants(organization_id)
        is_default = existing_count == 0

        assistant = VoiceAssistant(
            organization_id=str(organization_id),
            name=name,
            description=description,
            assistant_type=assistant_type,
            greeting=greeting or settings.DEFAULT_VOICE_GREETING if hasattr(settings, "DEFAULT_VOICE_GREETING") else "Hello, thank you for calling. How can I help you today?",
            fallback_message=fallback_message or settings.VOICE_FALLBACK_MESSAGE,
            end_of_call_message=end_of_call_message or "Thank you for calling. Have a great day!",
            system_prompt=system_prompt,
            voice=voice or settings.DEFAULT_VOICE,
            voice_provider=voice_provider or settings.DEFAULT_VOICE_PROVIDER,
            language=language or settings.DEFAULT_LANGUAGE,
            temperature=temperature if temperature is not None else settings.DEFAULT_VOICE_TEMPERATURE,
            max_tokens=max_tokens or settings.DEFAULT_VOICE_MAX_TOKENS,
            stt_provider=stt_provider or settings.DEFAULT_VOICE_STT_PROVIDER,
            tts_provider=tts_provider or settings.DEFAULT_VOICE_TTS_PROVIDER,
            ai_provider=ai_provider,
            ai_model=ai_model,
            enable_rag=enable_rag,
            rag_categories=rag_categories or [],
            enable_barge_in=enable_barge_in,
            enable_vad=enable_vad,
            silence_timeout_seconds=silence_timeout_seconds or settings.SILENCE_TIMEOUT_SECONDS,
            max_call_duration=max_call_duration or settings.MAX_CALL_DURATION,
            max_turns=max_turns or settings.MAX_TURNS_PER_CALL,
            escalation_phone=escalation_phone,
            escalation_threshold=escalation_threshold if escalation_threshold is not None else 0.4,
            business_hours=business_hours or {},
            provider=self.provider_name,
            is_active=True,
            is_default=is_default,
            metadata_=metadata or {},
            created_by=str(created_by) if created_by else None,
        )
        self.db.add(assistant)
        await self.db.flush()

        # Sync to provider
        if sync_to_provider:
            try:
                provider_config = AssistantConfig(
                    name=name,
                    system_prompt=system_prompt,
                    greeting=assistant.greeting,
                    fallback_message=assistant.fallback_message,
                    end_of_call_message=assistant.end_of_call_message,
                    voice=assistant.voice,
                    voice_provider=assistant.voice_provider,
                    language=assistant.language,
                    temperature=assistant.temperature,
                    max_tokens=assistant.max_tokens,
                    stt_provider=assistant.stt_provider,
                    tts_provider=assistant.tts_provider,
                    enable_barge_in=assistant.enable_barge_in,
                    enable_vad=assistant.enable_vad,
                    silence_timeout_seconds=assistant.silence_timeout_seconds,
                    max_call_duration=assistant.max_call_duration,
                    provider_config={
                        "model": {
                            "provider": assistant.ai_provider or settings.DEFAULT_AI_PROVIDER,
                            "model": assistant.ai_model or "",
                        },
                    },
                )
                provider_resp = await self.provider.create_assistant(provider_config)
                assistant.provider_assistant_id = provider_resp.get("id")
                await self.db.flush()
                logger.info(
                    "voice_assistant_synced",
                    assistant_id=str(assistant.id),
                    provider_assistant_id=assistant.provider_assistant_id,
                )
            except VoiceProviderError as e:
                # Don't fail the whole creation — assistant exists locally;
                # caller can re-sync later.
                logger.warning(
                    "voice_assistant_provider_sync_failed",
                    assistant_id=str(assistant.id),
                    error=str(e),
                )
                assistant.metadata_ = {
                    **(assistant.metadata_ or {}),
                    "provider_sync_error": str(e),
                    "provider_sync_pending": True,
                }
                await self.db.flush()

        return assistant

    async def update_assistant(
        self,
        *,
        organization_id: uuid.UUID,
        assistant_id: uuid.UUID,
        **kwargs: Any,
    ) -> VoiceAssistant:
        """Update an assistant. Only provided fields are updated."""
        assistant = await self._get_assistant(organization_id, assistant_id)

        # Track if provider sync is needed
        provider_sync_fields = {
            "name", "system_prompt", "greeting", "fallback_message",
            "end_of_call_message", "voice", "voice_provider", "language",
            "temperature", "max_tokens", "stt_provider", "tts_provider",
            "enable_barge_in", "enable_vad", "silence_timeout_seconds",
            "max_call_duration",
        }
        needs_provider_sync = False

        for key, value in kwargs.items():
            if hasattr(assistant, key) and value is not None:
                setattr(assistant, key, value)
                if key in provider_sync_fields:
                    needs_provider_sync = True

        await self.db.flush()

        # Sync to provider if needed
        if needs_provider_sync and assistant.provider_assistant_id:
            try:
                provider_config = AssistantConfig(
                    name=assistant.name,
                    system_prompt=assistant.system_prompt,
                    greeting=assistant.greeting,
                    fallback_message=assistant.fallback_message,
                    end_of_call_message=assistant.end_of_call_message,
                    voice=assistant.voice,
                    voice_provider=assistant.voice_provider,
                    language=assistant.language,
                    temperature=assistant.temperature,
                    max_tokens=assistant.max_tokens,
                    stt_provider=assistant.stt_provider,
                    tts_provider=assistant.tts_provider,
                    enable_barge_in=assistant.enable_barge_in,
                    enable_vad=assistant.enable_vad,
                    silence_timeout_seconds=assistant.silence_timeout_seconds,
                    max_call_duration=assistant.max_call_duration,
                )
                await self.provider.update_assistant(
                    assistant.provider_assistant_id, provider_config
                )
            except VoiceProviderError as e:
                logger.warning(
                    "voice_assistant_provider_update_failed",
                    assistant_id=str(assistant.id),
                    error=str(e),
                )

        return assistant

    async def delete_assistant(
        self,
        *,
        organization_id: uuid.UUID,
        assistant_id: uuid.UUID,
        delete_from_provider: bool = True,
    ) -> bool:
        """Delete an assistant (soft delete — sets is_active=False)."""
        assistant = await self._get_assistant(organization_id, assistant_id)
        assistant.is_active = False
        assistant.is_default = False
        await self.db.flush()

        if delete_from_provider and assistant.provider_assistant_id:
            try:
                await self.provider.delete_assistant(assistant.provider_assistant_id)
            except VoiceProviderError as e:
                logger.warning(
                    "voice_assistant_provider_delete_failed",
                    assistant_id=str(assistant.id),
                    error=str(e),
                )

        return True

    async def get_assistant(
        self,
        *,
        organization_id: uuid.UUID,
        assistant_id: uuid.UUID,
    ) -> VoiceAssistant:
        return await self._get_assistant(organization_id, assistant_id)

    async def list_assistants(
        self,
        *,
        organization_id: uuid.UUID,
        assistant_type: str | None = None,
        is_active: bool = True,
    ) -> list[VoiceAssistant]:
        conditions = [
            VoiceAssistant.organization_id == str(organization_id),
            VoiceAssistant.is_active == is_active,
        ]
        if assistant_type is not None:
            conditions.append(VoiceAssistant.assistant_type == assistant_type)
        result = await self.db.execute(
            select(VoiceAssistant)
            .where(*conditions)
            .order_by(VoiceAssistant.created_at.desc())
        )
        return list(result.scalars().all())

    async def _get_assistant(
        self,
        organization_id: uuid.UUID,
        assistant_id: uuid.UUID,
    ) -> VoiceAssistant:
        result = await self.db.execute(
            select(VoiceAssistant).where(
                VoiceAssistant.id == assistant_id,
                VoiceAssistant.organization_id == str(organization_id),
            )
        )
        assistant = result.scalar_one_or_none()
        if assistant is None:
            raise NotFoundError(
                f"Voice assistant {assistant_id} not found in organization {organization_id}"
            )
        return assistant

    async def _count_assistants(
        self,
        organization_id: uuid.UUID,
    ) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(VoiceAssistant)
            .where(
                VoiceAssistant.organization_id == str(organization_id),
                VoiceAssistant.is_active == True,  # noqa: E712
            )
        )
        return int(result.scalar_one())

    # ====================================================================
    # Voice Settings
    # ====================================================================

    async def get_settings(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> VoiceSettings:
        """Get or create voice settings for a tenant."""
        result = await self.db.execute(
            select(VoiceSettings).where(
                VoiceSettings.organization_id == str(organization_id)
            )
        )
        settings_row = result.scalar_one_or_none()
        if settings_row is None:
            # Create with defaults
            settings_row = VoiceSettings(
                organization_id=str(organization_id),
                provider=settings.VOICE_PROVIDER,
                default_voice=settings.DEFAULT_VOICE,
                default_language=settings.DEFAULT_LANGUAGE,
                default_stt_provider=settings.DEFAULT_VOICE_STT_PROVIDER,
                default_tts_provider=settings.DEFAULT_VOICE_TTS_PROVIDER,
                enable_recording=settings.ENABLE_RECORDING,
                enable_transcription=settings.ENABLE_TRANSCRIPTION,
                enable_sentiment_analysis=settings.ENABLE_SENTIMENT_ANALYSIS,
                enable_barge_in=settings.ENABLE_BARGE_IN,
                max_call_duration=settings.MAX_CALL_DURATION,
                is_active=True,
            )
            self.db.add(settings_row)
            await self.db.flush()
        return settings_row

    async def update_settings(
        self,
        *,
        organization_id: uuid.UUID,
        **kwargs: Any,
    ) -> VoiceSettings:
        """Update voice settings for a tenant."""
        settings_row = await self.get_settings(organization_id=organization_id)
        for key, value in kwargs.items():
            if hasattr(settings_row, key) and value is not None:
                setattr(settings_row, key, value)
        await self.db.flush()
        return settings_row

    # ====================================================================
    # Sessions
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
        return await self.session_manager.list_sessions(
            organization_id=organization_id,
            status=status,
            assistant_id=assistant_id,
            direction=direction,
            limit=limit,
            offset=offset,
        )

    async def get_session(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> VoiceSession:
        return await self.session_manager.get_session(
            organization_id=organization_id, session_id=session_id
        )

    async def end_session(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
        outcome: str | None = None,
    ) -> VoiceSession:
        session = await self.session_manager.get_session(
            organization_id=organization_id, session_id=session_id
        )
        # End call on provider side
        try:
            await self.provider.end_call(session.call_sid)
        except VoiceProviderError as e:
            logger.warning(
                "voice_provider_end_call_failed",
                session_id=str(session.id),
                error=str(e),
            )
        return await self.session_manager.end_session(session, outcome=outcome)

    async def get_session_messages(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> list[VoiceMessage]:
        return await self.session_manager.get_messages(
            organization_id=organization_id, session_id=session_id
        )

    async def get_session_events(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> list[CallEvent]:
        return await self.session_manager.get_events(
            organization_id=organization_id, session_id=session_id
        )

    # ====================================================================
    # Webhook processing
    # ====================================================================

    async def process_webhook(
        self,
        *,
        organization_id: uuid.UUID | None,
        provider_name: str,
        body: bytes,
        headers: dict[str, str],
        source_ip: str | None = None,
    ) -> dict[str, Any]:
        """Process an inbound webhook from a voice provider.

        Steps:
        1. Log the raw webhook (audit trail)
        2. Verify signature
        3. Parse the event
        4. Resolve the session by call_sid
        5. Apply state transitions + persist transcript
        6. Return response (status: ok / error)
        """
        # Use the appropriate provider
        # Prefer the injected provider if its name matches; otherwise look up by name.
        provider: VoiceProvider | None = None
        if self._provider is not None:
            injected_name = getattr(self._provider, "name", None)
            if isinstance(injected_name, str) and injected_name == provider_name:
                provider = self._provider
        if provider is None:
            try:
                provider = get_voice_provider(provider_name)
            except VoiceProviderError as e:
                logger.warning("voice_webhook_unknown_provider", provider=provider_name, error=str(e))
                return {"status": "error", "error": str(e)}

        # Log the webhook
        webhook_log = VoiceWebhookLog(
            organization_id=str(organization_id) if organization_id else "",
            provider=provider_name,
            event_type="unknown",  # updated after parsing
            headers=headers,
            body={},
            raw_body=body.decode("utf-8", errors="replace") if body else None,
            source_ip=source_ip,
            signature_header=headers.get("X-Vapi-Signature") or headers.get("x-vapi-signature"),
        )
        self.db.add(webhook_log)
        await self.db.flush()

        # Verify signature
        try:
            signature_valid = provider.verify_webhook_signature(body, headers)
        except Exception as e:
            signature_valid = False
            webhook_log.verification_error = str(e)
        webhook_log.signature_valid = signature_valid

        if not signature_valid:
            webhook_log.processed = True
            webhook_log.processed_at = datetime.now(UTC)
            webhook_log.processing_error = "invalid_signature"
            webhook_log.response_status = 401
            webhook_log.response_body = {"error": "Invalid signature"}
            await self.db.flush()
            logger.warning(
                "voice_webhook_invalid_signature",
                provider=provider_name,
                source_ip=source_ip,
            )
            return {"status": "error", "error": "Invalid signature"}

        # Parse the event
        try:
            event = provider.parse_webhook_event(body, headers)
        except Exception as e:
            webhook_log.processed = True
            webhook_log.processed_at = datetime.now(UTC)
            webhook_log.processing_error = f"parse_error: {e}"
            webhook_log.response_status = 400
            webhook_log.response_body = {"error": "Cannot parse event"}
            await self.db.flush()
            return {"status": "error", "error": f"Cannot parse event: {e}"}

        # Update webhook log with parsed event info
        webhook_log.event_type = event.event_type.value
        webhook_log.call_sid = event.call_sid
        await self.db.flush()

        # Resolve organization_id if not provided (from session lookup)
        if organization_id is None and event.call_sid:
            session = await self.session_manager.get_session_by_call_sid(call_sid=event.call_sid)
            if session is not None:
                organization_id = uuid.UUID(session.organization_id)
                webhook_log.organization_id = str(organization_id)
                webhook_log.session_id = str(session.id)
                await self.db.flush()

        # Process the event
        if organization_id is not None:
            updated_session = await self.session_manager.process_provider_event(event)
            if updated_session is not None:
                webhook_log.session_id = str(updated_session.id)
                await self.db.flush()
        else:
            logger.warning(
                "voice_webhook_no_org_resolution",
                call_sid=event.call_sid,
                event_type=event.event_type.value,
            )

        webhook_log.processed = True
        webhook_log.processed_at = datetime.now(UTC)
        webhook_log.response_status = 200
        webhook_log.response_body = {"status": "ok"}
        await self.db.flush()

        return {
            "status": "ok",
            "event_type": event.event_type.value,
            "call_sid": event.call_sid,
        }

    # ====================================================================
    # Voice testing
    # ====================================================================

    async def start_test_call(
        self,
        *,
        organization_id: uuid.UUID,
        assistant_id: uuid.UUID,
        to_number: str,
        from_number: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Start a test outbound call via the configured provider."""
        assistant = await self._get_assistant(organization_id, assistant_id)
        if not assistant.provider_assistant_id:
            raise ValidationError(
                "Assistant has no provider_assistant_id — sync to provider first"
            )

        # Start the call
        try:
            call_response = await self.provider.start_call(
                ProviderCallRequest(
                    assistant_id=assistant.provider_assistant_id,
                    to_number=to_number,
                    from_number=from_number,
                    metadata={
                        "test_call": True,
                        "organization_id": str(organization_id),
                        "assistant_id": str(assistant_id),
                        **(metadata or {}),
                    },
                )
            )
        except VoiceProviderError as e:
            raise ValidationError(f"Provider failed to start call: {e}") from e

        # Create session
        session = await self.session_manager.create_session(
            organization_id=organization_id,
            assistant_id=assistant_id,
            call_sid=call_response.call_sid,
            provider=call_response.metadata.get("provider", self.provider_name)
            if isinstance(call_response.metadata, dict)
            else self.provider_name,
            direction="outbound",
            caller_phone=from_number,
            callee_phone=to_number,
            provider_assistant_id=assistant.provider_assistant_id,
            language=assistant.language,
            metadata=metadata or {},
        )

        return {
            "session_id": str(session.id),
            "call_sid": call_response.call_sid,
            "status": call_response.status.value,
            "assistant_id": str(assistant_id),
            "assistant_name": assistant.name,
        }

    # ====================================================================
    # Analytics
    # ====================================================================

    async def get_session_analytics(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> VoiceAnalytics:
        # Verify session access
        await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        result = await self.db.execute(
            select(VoiceAnalytics).where(
                VoiceAnalytics.session_id == str(session_id),
                VoiceAnalytics.organization_id == str(organization_id),
            )
        )
        analytics = result.scalar_one_or_none()
        if analytics is None:
            raise NotFoundError(f"Analytics for session {session_id} not found")
        return analytics

    async def get_analytics_summary(
        self,
        *,
        organization_id: uuid.UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get aggregate voice analytics for a tenant (last N days)."""
        from datetime import timedelta

        cutoff = datetime.now(UTC) - timedelta(days=days)

        # Total calls
        total_calls_stmt = (
            select(func.count())
            .select_from(VoiceSession)
            .where(
                VoiceSession.organization_id == str(organization_id),
                VoiceSession.created_at >= cutoff,
            )
        )
        total_calls = (await self.db.execute(total_calls_stmt)).scalar_one()

        # Avg duration
        avg_duration_stmt = (
            select(func.avg(VoiceSession.duration_seconds))
            .where(
                VoiceSession.organization_id == str(organization_id),
                VoiceSession.created_at >= cutoff,
                VoiceSession.duration_seconds > 0,
            )
        )
        avg_duration = (await self.db.execute(avg_duration_stmt)).scalar_one()

        # Outcomes
        outcome_stmt = (
            select(VoiceSession.outcome, func.count())
            .where(
                VoiceSession.organization_id == str(organization_id),
                VoiceSession.created_at >= cutoff,
            )
            .group_by(VoiceSession.outcome)
        )
        outcomes = {
            str(o) if o is not None else "unknown": c
            for o, c in (await self.db.execute(outcome_stmt)).all()
        }

        # Escalations + transfers
        escalations_stmt = (
            select(func.count())
            .select_from(VoiceSession)
            .where(
                VoiceSession.organization_id == str(organization_id),
                VoiceSession.created_at >= cutoff,
                VoiceSession.transferred_to.isnot(None),
            )
        )
        escalations = (await self.db.execute(escalations_stmt)).scalar_one()

        # Avg AI latency (from analytics)
        avg_latency_stmt = (
            select(func.avg(VoiceAnalytics.avg_ai_latency_ms))
            .where(
                VoiceAnalytics.organization_id == str(organization_id),
                VoiceAnalytics.created_at >= cutoff,
                VoiceAnalytics.avg_ai_latency_ms.isnot(None),
            )
        )
        avg_latency = (await self.db.execute(avg_latency_stmt)).scalar_one()

        # Barge-ins
        barge_stmt = (
            select(func.sum(VoiceSession.barge_in_count))
            .where(
                VoiceSession.organization_id == str(organization_id),
                VoiceSession.created_at >= cutoff,
            )
        )
        barge_ins = (await self.db.execute(barge_stmt)).scalar_one()

        # Completion rate
        completed = outcomes.get("resolved", 0) + outcomes.get("unresolved", 0)
        completion_rate = completed / total_calls if total_calls > 0 else 0.0

        return {
            "period_days": days,
            "total_calls": total_calls,
            "avg_duration_seconds": float(avg_duration or 0),
            "completion_rate": completion_rate,
            "outcomes": outcomes,
            "escalations": int(escalations or 0),
            "transfers": int(escalations or 0),
            "barge_ins": int(barge_ins or 0),
            "avg_ai_latency_ms": float(avg_latency or 0),
        }

    # ====================================================================
    # Webhook logs
    # ====================================================================

    async def list_webhook_logs(
        self,
        *,
        organization_id: uuid.UUID,
        provider: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[VoiceWebhookLog], int]:
        conditions = [
            VoiceWebhookLog.organization_id == str(organization_id),
        ]
        if provider is not None:
            conditions.append(VoiceWebhookLog.provider == provider)

        count_stmt = (
            select(func.count())
            .select_from(VoiceWebhookLog)
            .where(*conditions)
        )
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(VoiceWebhookLog)
            .where(*conditions)
            .order_by(VoiceWebhookLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

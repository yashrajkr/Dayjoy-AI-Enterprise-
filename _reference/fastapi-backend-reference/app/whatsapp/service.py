"""WhatsApp service — public API for the WhatsApp AI platform.

Wraps:
- MetaWhatsAppClient (Meta Cloud API)
- Conversation manager (integrates AI Gateway + RAG)
- Session manager (24h conversation windows)
- Media processor (upload/download)
- Template manager
- Webhook processor
- Human handoff manager

Provides the public methods used by the REST API + webhook layer:
- Account CRUD (connect, list, update, delete)
- Number management (register, list, verify)
- Session management (list, get, end)
- Message sending (text, media, template, interactive)
- Conversation history
- Analytics
- Human handoff
- Webhook processing (verification + inbound messages)
"""

import hashlib
import uuid
from datetime import datetime, UTC, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gateway import AIGateway
from app.ai.rag_pipeline import KnowledgeRAGService
from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.whatsapp import (
    WhatsAppAccount,
    WhatsAppAnalytics,
    WhatsAppHandoff,
    WhatsAppMedia,
    WhatsAppMessage,
    WhatsAppNumber,
    WhatsAppSession,
    WhatsAppTemplate,
    WhatsAppWebhook,
)

logger = get_logger(__name__)


class WhatsAppService:
    """Public WhatsApp AI service (multi-tenant)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._ai_gateway: AIGateway | None = None
        self._rag: KnowledgeRAGService | None = None
        self._clients: dict[str, Any] = {}  # account_id → MetaWhatsAppClient

    @property
    def ai_gateway(self) -> AIGateway:
        if self._ai_gateway is None:
            self._ai_gateway = AIGateway(self.db)
        return self._ai_gateway

    @property
    def rag(self) -> KnowledgeRAGService:
        if self._rag is None:
            self._rag = KnowledgeRAGService(self.db)
        return self._rag

    def _get_client(self, account: WhatsAppAccount) -> Any:
        """Get or create a MetaWhatsAppClient for an account."""
        cache_key = str(account.id)
        if cache_key not in self._clients:
            from app.whatsapp.meta_client import MetaWhatsAppClient

            self._clients[cache_key] = MetaWhatsAppClient(
                access_token=account.access_token,
                phone_number_id=settings.WHATSAPP_PHONE_NUMBER_ID,  # default; overridden per number
                app_secret=account.app_secret or settings.META_APP_SECRET,
                api_version=settings.WHATSAPP_API_VERSION,
                timeout=settings.WHATSAPP_TIMEOUT,
                max_retries=settings.WHATSAPP_MAX_RETRIES,
            )
        return self._clients[cache_key]

    def _get_client_for_number(
        self, account: WhatsAppAccount, number: WhatsAppNumber
    ) -> Any:
        """Get a client configured for a specific phone number."""
        from app.whatsapp.meta_client import MetaWhatsAppClient

        return MetaWhatsAppClient(
            access_token=account.access_token,
            phone_number_id=number.phone_number_id,
            app_secret=account.app_secret or settings.META_APP_SECRET,
            api_version=settings.WHATSAPP_API_VERSION,
            timeout=settings.WHATSAPP_TIMEOUT,
            max_retries=settings.WHATSAPP_MAX_RETRIES,
        )

    # ====================================================================
    # Account management
    # ====================================================================

    async def connect_account(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        business_account_id: str,
        access_token: str,
        verify_token: str,
        app_id: str | None = None,
        app_secret: str | None = None,
        system_prompt: str | None = None,
        greeting_message: str | None = None,
        fallback_message: str | None = None,
        enable_rag: bool = True,
        enable_human_handoff: bool = True,
        auto_reply_enabled: bool = True,
        timezone: str = "UTC",
        created_by: uuid.UUID | None = None,
    ) -> WhatsAppAccount:
        """Connect a WhatsApp Business Account."""
        if not business_account_id or not access_token or not verify_token:
            raise ValidationError("business_account_id, access_token, and verify_token are required")

        account = WhatsAppAccount(
            organization_id=str(organization_id),
            name=name,
            business_account_id=business_account_id,
            app_id=app_id,
            app_secret=app_secret,
            access_token=access_token,
            verify_token=verify_token,
            system_prompt=system_prompt or "You are a helpful WhatsApp assistant. Be concise and friendly.",
            greeting_message=greeting_message or settings.WHATSAPP_GREETING_MESSAGE,
            fallback_message=fallback_message or settings.WHATSAPP_AI_FALLBACK_MESSAGE,
            enable_rag=enable_rag,
            enable_human_handoff=enable_human_handoff,
            auto_reply_enabled=auto_reply_enabled,
            timezone=timezone,
            is_active=True,
            created_by=str(created_by) if created_by else None,
        )
        self.db.add(account)
        await self.db.flush()
        logger.info(
            "whatsapp_account_connected",
            organization_id=str(organization_id),
            account_id=str(account.id),
            name=name,
        )
        return account

    async def list_accounts(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> list[WhatsAppAccount]:
        result = await self.db.execute(
            select(WhatsAppAccount)
            .where(
                WhatsAppAccount.organization_id == str(organization_id),
                WhatsAppAccount.is_active == True,  # noqa: E712
            )
            .order_by(WhatsAppAccount.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_account(
        self,
        *,
        organization_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> WhatsAppAccount:
        result = await self.db.execute(
            select(WhatsAppAccount).where(
                WhatsAppAccount.id == account_id,
                WhatsAppAccount.organization_id == str(organization_id),
            )
        )
        account = result.scalar_one_or_none()
        if account is None:
            raise NotFoundError(f"WhatsApp account {account_id} not found")
        return account

    async def update_account(
        self,
        *,
        organization_id: uuid.UUID,
        account_id: uuid.UUID,
        **kwargs: Any,
    ) -> WhatsAppAccount:
        account = await self.get_account(
            organization_id=organization_id, account_id=account_id
        )
        for key, value in kwargs.items():
            if hasattr(account, key) and value is not None:
                setattr(account, key, value)
        await self.db.flush()
        # Invalidate cached client
        self._clients.pop(str(account.id), None)
        return account

    async def delete_account(
        self,
        *,
        organization_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> bool:
        account = await self.get_account(
            organization_id=organization_id, account_id=account_id
        )
        account.is_active = False
        await self.db.flush()
        return True

    # ====================================================================
    # Phone number management
    # ====================================================================

    async def register_number(
        self,
        *,
        organization_id: uuid.UUID,
        account_id: uuid.UUID,
        phone_number_id: str,
        display_phone_number: str,
        display_name: str = "WhatsApp Line",
        verify_with_meta: bool = False,
    ) -> WhatsAppNumber:
        """Register a WhatsApp phone number."""
        # Verify account access
        await self.get_account(
            organization_id=organization_id, account_id=account_id
        )

        # Check for duplicate
        existing = await self.db.execute(
            select(WhatsAppNumber).where(
                WhatsAppNumber.phone_number_id == phone_number_id
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise ValidationError(f"Phone number ID {phone_number_id} is already registered")

        is_verified = False
        quality_rating = None
        if verify_with_meta:
            try:
                account = await self.get_account(
                    organization_id=organization_id, account_id=account_id
                )
                client = self._get_client(account)
                # Override phone_number_id for this check
                client.phone_number_id = phone_number_id
                details = await client.get_phone_number()
                is_verified = True
                quality_rating = details.get("quality_rating")
            except Exception as e:
                logger.warning("whatsapp_number_verify_failed", error=str(e))

        number = WhatsAppNumber(
            organization_id=str(organization_id),
            account_id=str(account_id),
            phone_number_id=phone_number_id,
            display_phone_number=display_phone_number,
            display_name=display_name,
            quality_rating=quality_rating,
            is_verified=is_verified,
            is_active=True,
        )
        self.db.add(number)
        await self.db.flush()
        return number

    async def list_numbers(
        self,
        *,
        organization_id: uuid.UUID,
        account_id: uuid.UUID | None = None,
    ) -> list[WhatsAppNumber]:
        conditions = [
            WhatsAppNumber.organization_id == str(organization_id),
            WhatsAppNumber.is_active == True,  # noqa: E712
        ]
        if account_id is not None:
            conditions.append(WhatsAppNumber.account_id == str(account_id))
        result = await self.db.execute(
            select(WhatsAppNumber)
            .where(*conditions)
            .order_by(WhatsAppNumber.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_number_by_phone(
        self,
        display_phone_number: str,
    ) -> WhatsAppNumber | None:
        """Look up a number by display phone number (NOT tenant-scoped — used by webhooks)."""
        result = await self.db.execute(
            select(WhatsAppNumber).where(
                WhatsAppNumber.display_phone_number == display_phone_number,
                WhatsAppNumber.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_number_by_meta_id(
        self,
        phone_number_id: str,
    ) -> WhatsAppNumber | None:
        """Look up a number by Meta's phone_number_id (used by webhooks)."""
        result = await self.db.execute(
            select(WhatsAppNumber).where(
                WhatsAppNumber.phone_number_id == phone_number_id,
                WhatsAppNumber.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    # ====================================================================
    # Sessions
    # ====================================================================

    async def get_or_create_session(
        self,
        *,
        organization_id: uuid.UUID,
        account: WhatsAppAccount,
        number: WhatsAppNumber,
        customer_phone: str,
        customer_name: str | None = None,
    ) -> WhatsAppSession:
        """Get the active session for a customer, or create a new one.

        Sessions are per-customer per-24h-window. If the last message from
        this customer was > WHATSAPP_SESSION_TIMEOUT_MINUTES ago, a new
        session is created.
        """
        cutoff = datetime.now(UTC) - timedelta(minutes=settings.WHATSAPP_SESSION_TIMEOUT_MINUTES)

        # Find recent session
        result = await self.db.execute(
            select(WhatsAppSession).where(
                WhatsAppSession.organization_id == str(organization_id),
                WhatsAppSession.account_id == str(account.id),
                WhatsAppSession.customer_phone == customer_phone,
                WhatsAppSession.status.in_(["active", "waiting_ai", "waiting_human"]),
                WhatsAppSession.last_message_at >= cutoff,
            ).order_by(WhatsAppSession.started_at.desc()).limit(1)
        )
        session = result.scalar_one_or_none()

        if session is not None:
            # Update customer name if provided
            if customer_name and not session.customer_name:
                session.customer_name = customer_name
            return session

        # Create new session
        session = WhatsAppSession(
            organization_id=str(organization_id),
            account_id=str(account.id),
            number_id=str(number.id) if number else None,
            customer_phone=customer_phone,
            customer_name=customer_name,
            status="active",
            started_by="customer",
            language=account.timezone and "en",  # default; could detect from message
            started_at=datetime.now(UTC),
            last_message_at=datetime.now(UTC),
        )
        self.db.add(session)
        await self.db.flush()

        # Send greeting message (first interaction)
        if account.auto_reply_enabled:
            try:
                client = self._get_client_for_number(account, number)
                await client.send_text(customer_phone, account.greeting_message)
                # Record the greeting as an outbound message
                await self._record_message(
                    session=session,
                    account=account,
                    number=number,
                    direction="outbound",
                    message_type="text",
                    text=account.greeting_message,
                    to_number=customer_phone,
                    from_number=number.display_phone_number,
                )
            except Exception as e:
                logger.warning("whatsapp_greeting_failed", error=str(e))

        return session

    async def list_sessions(
        self,
        *,
        organization_id: uuid.UUID,
        status: str | None = None,
        account_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[WhatsAppSession], int]:
        conditions = [
            WhatsAppSession.organization_id == str(organization_id),
        ]
        if status is not None:
            conditions.append(WhatsAppSession.status == status)
        if account_id is not None:
            conditions.append(WhatsAppSession.account_id == str(account_id))

        count_stmt = select(func.count()).select_from(WhatsAppSession).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(WhatsAppSession)
            .where(*conditions)
            .order_by(WhatsAppSession.last_message_at.desc())
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
    ) -> WhatsAppSession:
        result = await self.db.execute(
            select(WhatsAppSession).where(
                WhatsAppSession.id == session_id,
                WhatsAppSession.organization_id == str(organization_id),
            )
        )
        session = result.scalar_one_or_none()
        if session is None:
            raise NotFoundError(f"WhatsApp session {session_id} not found")
        return session

    async def end_session(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
        outcome: str = "completed",
    ) -> WhatsAppSession:
        session = await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        session.status = "completed"
        session.outcome = outcome
        session.ended_at = datetime.now(UTC)
        if session.started_at:
            session.duration_seconds = int(
                (session.ended_at - session.started_at).total_seconds()
            )
        await self.db.flush()
        return session

    # ====================================================================
    # Messages
    # ====================================================================

    async def send_message(
        self,
        *,
        organization_id: uuid.UUID,
        account_id: uuid.UUID,
        number_id: uuid.UUID,
        to_number: str,
        message_type: str = "text",
        text: str | None = None,
        media_id: str | None = None,
        template_name: str | None = None,
        template_language: str = "en",
        template_components: list | None = None,
        session_id: uuid.UUID | None = None,
    ) -> WhatsAppMessage:
        """Send a message via WhatsApp."""
        account = await self.get_account(
            organization_id=organization_id, account_id=account_id
        )
        # Get the number
        result = await self.db.execute(
            select(WhatsAppNumber).where(
                WhatsAppNumber.id == number_id,
                WhatsAppNumber.organization_id == str(organization_id),
            )
        )
        number = result.scalar_one_or_none()
        if number is None:
            raise NotFoundError(f"WhatsApp number {number_id} not found")

        client = self._get_client_for_number(account, number)

        # Strip + from recipient
        to_clean = to_number.lstrip("+")

        # Send based on type
        wa_message_id = None
        if message_type == "text":
            if not text:
                raise ValidationError("text is required for text messages")
            response = await client.send_text(to_clean, text)
        elif message_type in ("image", "video", "audio", "document"):
            if not media_id:
                raise ValidationError("media_id is required for media messages")
            response = await client.send_media(to_clean, message_type, media_id, caption=text)
        elif message_type == "template":
            if not template_name:
                raise ValidationError("template_name is required for template messages")
            response = await client.send_template(
                to_clean, template_name, template_language, template_components
            )
        elif message_type == "location":
            raise ValidationError("Use send_location method for location messages")
        else:
            raise ValidationError(f"Unsupported message type: {message_type}")

        # Extract WA message ID
        messages = response.get("messages", [])
        if messages:
            wa_message_id = messages[0].get("id")

        # Get or create session
        session = None
        if session_id:
            session = await self.get_session(
                organization_id=organization_id, session_id=session_id
            )
        else:
            session = await self.get_or_create_session(
                organization_id=organization_id,
                account=account,
                number=number,
                customer_phone=to_number,
            )

        # Record message
        msg = await self._record_message(
            session=session,
            account=account,
            number=number,
            direction="outbound",
            message_type=message_type,
            text=text,
            to_number=to_number,
            from_number=number.display_phone_number,
            wa_message_id=wa_message_id,
            template_name=template_name,
            template_language=template_language,
            template_components=template_components,
        )

        # Update session counts
        session.outbound_count += 1
        session.last_message_at = datetime.now(UTC)
        await self.db.flush()

        return msg

    async def get_messages(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[WhatsAppMessage], int]:
        """Get all messages in a session."""
        # Verify session access
        await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        conditions = [
            WhatsAppMessage.organization_id == str(organization_id),
            WhatsAppMessage.session_id == str(session_id),
        ]
        count_stmt = select(func.count()).select_from(WhatsAppMessage).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(WhatsAppMessage)
            .where(*conditions)
            .order_by(WhatsAppMessage.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def _record_message(
        self,
        *,
        session: WhatsAppSession,
        account: WhatsAppAccount,
        number: WhatsAppNumber | None,
        direction: str,
        message_type: str,
        text: str | None = None,
        to_number: str = "",
        from_number: str = "",
        wa_message_id: str | None = None,
        media_id: str | None = None,
        template_name: str | None = None,
        template_language: str | None = None,
        template_components: list | None = None,
        is_ai_response: bool = False,
        ai_confidence: float | None = None,
        ai_latency_ms: int | None = None,
        ai_model: str | None = None,
        ai_citations: list | None = None,
        ai_rag_used: bool = False,
        ai_was_fallback: bool = False,
        delivery_status: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        location_name: str | None = None,
        location_address: str | None = None,
        interactive_type: str | None = None,
        interactive_payload: dict | None = None,
        customer_name: str | None = None,
        reply_to_message_id: str | None = None,
        metadata: dict | None = None,
    ) -> WhatsAppMessage:
        """Record a message in the database."""
        msg = WhatsAppMessage(
            organization_id=session.organization_id,
            account_id=str(account.id),
            number_id=str(number.id) if number else None,
            session_id=str(session.id),
            wa_message_id=wa_message_id,
            direction=direction,
            from_number=from_number,
            to_number=to_number,
            message_type=message_type,
            text=text,
            media_id=media_id,
            latitude=latitude,
            longitude=longitude,
            location_name=location_name,
            location_address=location_address,
            interactive_type=interactive_type,
            interactive_payload=interactive_payload,
            template_name=template_name,
            template_language=template_language,
            template_components=template_components,
            is_ai_response=is_ai_response,
            ai_confidence=ai_confidence,
            ai_latency_ms=ai_latency_ms,
            ai_model=ai_model,
            ai_citations=ai_citations or [],
            ai_rag_used=ai_rag_used,
            ai_was_fallback=ai_was_fallback,
            delivery_status=delivery_status,
            reply_to_message_id=reply_to_message_id,
            metadata_=metadata or {},
        )
        self.db.add(msg)
        await self.db.flush()

        # Update session counts
        if direction == "inbound":
            session.inbound_count += 1
        else:
            session.outbound_count += 1
            if is_ai_response:
                session.ai_response_count += 1
        session.last_message_at = datetime.now(UTC)
        if customer_name and not session.customer_name:
            session.customer_name = customer_name
        await self.db.flush()

        return msg

    # ====================================================================
    # Conversation (AI processing)
    # ====================================================================

    async def process_inbound_message(
        self,
        *,
        event: dict[str, Any],
    ) -> dict[str, Any]:
        """Process an inbound WhatsApp message event.

        This is the main entry point for inbound messages from webhooks.
        Steps:
        1. Look up the number + account + organization
        2. Get or create a session
        3. Record the inbound message
        4. Process via AI Gateway (with RAG)
        5. Send the AI response back
        6. Update session analytics
        """
        from app.whatsapp.meta_client import MetaWhatsAppClient

        phone_number_id = event.get("phone_number_id")
        display_phone_number = event.get("display_phone_number")
        from_number = event.get("from_number", "")
        customer_name = event.get("customer_name")
        message_type = event.get("message_type", "text")
        text = event.get("text", "")
        wa_message_id = event.get("wa_message_id", "")

        # Look up the number
        number = None
        if phone_number_id:
            number = await self.get_number_by_meta_id(phone_number_id)
        if number is None and display_phone_number:
            number = await self.get_number_by_phone(display_phone_number)
        if number is None:
            logger.warning(
                "whatsapp_inbound_unknown_number",
                phone_number_id=phone_number_id,
                display_phone_number=display_phone_number,
            )
            return {"status": "error", "error": "Number not registered"}

        # Look up the account
        result = await self.db.execute(
            select(WhatsAppAccount).where(
                WhatsAppAccount.id == uuid.UUID(str(number.account_id)),
                WhatsAppAccount.is_active == True,  # noqa: E712
            )
        )
        account = result.scalar_one_or_none()
        if account is None:
            logger.warning("whatsapp_inbound_no_account", number_id=str(number.id))
            return {"status": "error", "error": "Account not found"}

        organization_id = uuid.UUID(account.organization_id)

        # Get or create session
        session = await self.get_or_create_session(
            organization_id=organization_id,
            account=account,
            number=number,
            customer_phone=from_number,
            customer_name=customer_name,
        )

        # Record inbound message
        inbound_msg = await self._record_message(
            session=session,
            account=account,
            number=number,
            direction="inbound",
            message_type=message_type,
            text=text,
            from_number=from_number,
            to_number=display_phone_number or number.display_phone_number,
            wa_message_id=wa_message_id,
            customer_name=customer_name,
            latitude=event.get("latitude"),
            longitude=event.get("longitude"),
            location_name=event.get("location_name"),
            location_address=event.get("location_address"),
            interactive_type=event.get("interactive_type"),
            interactive_payload=event.get("interactive_payload"),
            reply_to_message_id=event.get("reply_to_message_id"),
        )

        # Mark message as read (if enabled)
        if account.enable_typing_indicator and wa_message_id:
            try:
                client = self._get_client_for_number(account, number)
                await client.mark_message_read(wa_message_id)
            except Exception as e:
                logger.warning("whatsapp_mark_read_failed", error=str(e))

        # Process via AI (only for text messages; media requires different handling)
        if message_type == "text" and text:
            ai_result = await self._process_with_ai(
                session=session,
                account=account,
                number=number,
                user_text=text,
                from_number=from_number,
            )
            return {
                "status": "ok",
                "session_id": str(session.id),
                "message_id": str(inbound_msg.id),
                "ai_response": ai_result.get("response"),
                "ai_confidence": ai_result.get("confidence"),
                "was_fallback": ai_result.get("was_fallback"),
            }
        elif message_type in ("image", "video", "audio", "document"):
            # For media messages, acknowledge and offer to process
            ack_text = (
                f"Thanks for the {message_type}! I've received it. "
                "A human agent will review it if needed."
            )
            await self._send_and_record(
                session=session,
                account=account,
                number=number,
                text=ack_text,
                to_number=from_number,
                is_ai_response=True,
            )
            return {
                "status": "ok",
                "session_id": str(session.id),
                "message_id": str(inbound_msg.id),
                "ai_response": ack_text,
            }
        elif message_type == "location":
            ack_text = "Thanks for sharing your location! How can I help you with that?"
            await self._send_and_record(
                session=session,
                account=account,
                number=number,
                text=ack_text,
                to_number=from_number,
                is_ai_response=True,
            )
            return {
                "status": "ok",
                "session_id": str(session.id),
                "message_id": str(inbound_msg.id),
                "ai_response": ack_text,
            }
        else:
            # Unsupported message type
            ack_text = account.fallback_message
            await self._send_and_record(
                session=session,
                account=account,
                number=number,
                text=ack_text,
                to_number=from_number,
                is_ai_response=True,
                ai_was_fallback=True,
            )
            return {
                "status": "ok",
                "session_id": str(session.id),
                "message_id": str(inbound_msg.id),
                "ai_response": ack_text,
                "was_fallback": True,
            }

    async def _process_with_ai(
        self,
        *,
        session: WhatsAppSession,
        account: WhatsAppAccount,
        number: WhatsAppNumber,
        user_text: str,
        from_number: str,
    ) -> dict[str, Any]:
        """Process user text through the AI Gateway + RAG."""
        import time

        start = time.perf_counter()
        organization_id = uuid.UUID(session.organization_id)

        # 1. RAG search (if enabled)
        rag_context = ""
        citations: list = []
        confidence = 1.0
        rag_used = False
        was_fallback = False

        if account.enable_rag and user_text.strip():
            try:
                rag_result = await self.rag.search(
                    query=user_text,
                    organization_id=organization_id,
                    categories=list(account.rag_categories or []) or None,
                    conversation_id=uuid.UUID(session.ai_conversation_id)
                    if session.ai_conversation_id
                    else None,
                )
                rag_context = rag_result.get("context", "")
                citations = rag_result.get("citations", [])
                confidence = rag_result.get("confidence", 1.0)
                rag_used = True
                session.rag_used = True
                session.rag_citations_count += len(citations)
                if rag_result.get("was_fallback"):
                    was_fallback = True
                    session.rag_fallback_count += 1
            except Exception as e:
                logger.warning("whatsapp_rag_failed", error=str(e))

        # 2. AI Gateway
        try:
            result = await self.ai_gateway.chat(
                message=user_text,
                organization_id=organization_id,
                channel="whatsapp",
                context={
                    "session_id": str(session.id),
                    "customer_phone": session.customer_phone,
                    "customer_name": session.customer_name,
                    "language": session.language,
                    "rag_context": rag_context,
                    "channel": "whatsapp",
                    "whatsapp_account": account.name,
                },
            )
        except Exception as e:
            logger.error("whatsapp_ai_gateway_failed", error=str(e))
            # Send fallback message
            await self._send_and_record(
                session=session,
                account=account,
                number=number,
                text=account.fallback_message,
                to_number=from_number,
                is_ai_response=True,
                ai_was_fallback=True,
                ai_confidence=0.0,
                ai_latency_ms=int((time.perf_counter() - start) * 1000),
            )
            return {"response": account.fallback_message, "confidence": 0.0, "was_fallback": True}

        # Bind AI conversation ID
        if session.ai_conversation_id is None and result.get("conversation_id"):
            session.ai_conversation_id = result["conversation_id"]

        latency_ms = int((time.perf_counter() - start) * 1000)
        ai_response = result["response"]
        ai_confidence = result.get("confidence", confidence)

        # 3. Check escalation
        if ai_confidence < account.escalation_threshold:
            session.low_confidence_turns += 1
            if (
                session.low_confidence_turns >= 3
                and account.enable_human_handoff
            ):
                await self._initiate_handoff(
                    session=session,
                    account=account,
                    reason="low_confidence",
                    ai_summary=f"Last user message: {user_text[:200]}",
                    ai_confidence=ai_confidence,
                )
                # Send handoff message
                await self._send_and_record(
                    session=session,
                    account=account,
                    number=number,
                    text=settings.WHATSAPP_HUMAN_HANDOFF_MESSAGE,
                    to_number=from_number,
                    is_ai_response=True,
                    ai_confidence=ai_confidence,
                    ai_latency_ms=latency_ms,
                    ai_model=result.get("model"),
                    ai_citations=citations,
                    ai_rag_used=rag_used,
                )
                return {
                    "response": settings.WHATSAPP_HUMAN_HANDOFF_MESSAGE,
                    "confidence": ai_confidence,
                    "was_fallback": False,
                    "escalated": True,
                }

        # 4. Send AI response
        await self._send_and_record(
            session=session,
            account=account,
            number=number,
            text=ai_response,
            to_number=from_number,
            is_ai_response=True,
            ai_confidence=ai_confidence,
            ai_latency_ms=latency_ms,
            ai_model=result.get("model"),
            ai_citations=citations,
            ai_rag_used=rag_used,
        )

        # 5. Update session analytics
        session.ai_response_count += 1
        # Update rolling avg latency
        if session.avg_ai_latency_ms is None:
            session.avg_ai_latency_ms = latency_ms
        else:
            session.avg_ai_latency_ms = (
                (session.avg_ai_latency_ms * (session.ai_response_count - 1) + latency_ms)
                // session.ai_response_count
            )
        # Update rolling avg confidence
        if session.ai_confidence_avg is None:
            session.ai_confidence_avg = ai_confidence
        else:
            session.ai_confidence_avg = (
                session.ai_confidence_avg * (session.ai_response_count - 1) + ai_confidence
            ) / session.ai_response_count
        await self.db.flush()

        return {
            "response": ai_response,
            "confidence": ai_confidence,
            "was_fallback": was_fallback,
            "citations": citations,
        }

    async def _send_and_record(
        self,
        *,
        session: WhatsAppSession,
        account: WhatsAppAccount,
        number: WhatsAppNumber,
        text: str,
        to_number: str,
        is_ai_response: bool = False,
        ai_confidence: float | None = None,
        ai_latency_ms: int | None = None,
        ai_model: str | None = None,
        ai_citations: list | None = None,
        ai_rag_used: bool = False,
        ai_was_fallback: bool = False,
    ) -> WhatsAppMessage | None:
        """Send a text message via Meta API and record it."""
        # Truncate if needed
        if len(text) > settings.WHATSAPP_MAX_MESSAGE_LENGTH:
            text = text[: settings.WHATSAPP_MAX_MESSAGE_LENGTH - 3] + "..."

        client = self._get_client_for_number(account, number)
        to_clean = to_number.lstrip("+")

        try:
            response = await client.send_text(to_clean, text)
            wa_message_id = None
            messages = response.get("messages", [])
            if messages:
                wa_message_id = messages[0].get("id")
        except Exception as e:
            logger.error("whatsapp_send_failed", error=str(e), to=to_clean)
            wa_message_id = None

        msg = await self._record_message(
            session=session,
            account=account,
            number=number,
            direction="outbound",
            message_type="text",
            text=text,
            from_number=number.display_phone_number,
            to_number=to_number,
            wa_message_id=wa_message_id,
            is_ai_response=is_ai_response,
            ai_confidence=ai_confidence,
            ai_latency_ms=ai_latency_ms,
            ai_model=ai_model,
            ai_citations=ai_citations,
            ai_rag_used=ai_rag_used,
            ai_was_fallback=ai_was_fallback,
            delivery_status="sent" if wa_message_id else "failed",
        )
        return msg

    # ====================================================================
    # Human handoff
    # ====================================================================

    async def initiate_handoff(
        self,
        *,
        organization_id: uuid.UUID,
        session_id: uuid.UUID,
        reason: str = "manual",
        reason_details: str | None = None,
        priority: str = "medium",
    ) -> WhatsAppHandoff:
        """Initiate a human handoff for a session."""
        session = await self.get_session(
            organization_id=organization_id, session_id=session_id
        )
        return await self._initiate_handoff(
            session=session,
            account=await self.get_account(
                organization_id=organization_id,
                account_id=uuid.UUID(session.account_id),
            ),
            reason=reason,
            reason_details=reason_details,
            priority=priority,
        )

    async def _initiate_handoff(
        self,
        *,
        session: WhatsAppSession,
        account: WhatsAppAccount,
        reason: str,
        reason_details: str | None = None,
        priority: str = "medium",
        ai_summary: str | None = None,
        ai_confidence: float | None = None,
    ) -> WhatsAppHandoff:
        """Internal: create a handoff record."""
        handoff = WhatsAppHandoff(
            organization_id=session.organization_id,
            account_id=str(account.id),
            session_id=str(session.id),
            reason=reason,
            reason_details=reason_details,
            priority=priority,
            status="pending",
            ai_summary=ai_summary,
            ai_confidence=ai_confidence,
        )
        self.db.add(handoff)
        await self.db.flush()

        session.is_escalated = True
        session.escalated_at = datetime.now(UTC)
        session.escalation_reason = reason
        session.status = "waiting_human"
        await self.db.flush()

        return handoff

    async def list_handoffs(
        self,
        *,
        organization_id: uuid.UUID,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[WhatsAppHandoff], int]:
        conditions = [
            WhatsAppHandoff.organization_id == str(organization_id),
        ]
        if status is not None:
            conditions.append(WhatsAppHandoff.status == status)
        count_stmt = select(func.count()).select_from(WhatsAppHandoff).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()
        stmt = (
            select(WhatsAppHandoff)
            .where(*conditions)
            .order_by(WhatsAppHandoff.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def assign_handoff(
        self,
        *,
        organization_id: uuid.UUID,
        handoff_id: uuid.UUID,
        agent_user_id: uuid.UUID,
    ) -> WhatsAppHandoff:
        result = await self.db.execute(
            select(WhatsAppHandoff).where(
                WhatsAppHandoff.id == handoff_id,
                WhatsAppHandoff.organization_id == str(organization_id),
            )
        )
        handoff = result.scalar_one_or_none()
        if handoff is None:
            raise NotFoundError(f"Handoff {handoff_id} not found")
        handoff.assigned_to = str(agent_user_id)
        handoff.assigned_at = datetime.now(UTC)
        handoff.status = "assigned"
        if handoff.response_time_ms is None and handoff.created_at:
            # Handle potential tz mismatch (SQLite returns naive datetimes)
            created = handoff.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            handoff.response_time_ms = int(
                (handoff.assigned_at - created).total_seconds() * 1000
            )
        await self.db.flush()
        return handoff

    async def resolve_handoff(
        self,
        *,
        organization_id: uuid.UUID,
        handoff_id: uuid.UUID,
        resolved_by: uuid.UUID,
        resolution_notes: str | None = None,
        satisfaction_score: int | None = None,
    ) -> WhatsAppHandoff:
        result = await self.db.execute(
            select(WhatsAppHandoff).where(
                WhatsAppHandoff.id == handoff_id,
                WhatsAppHandoff.organization_id == str(organization_id),
            )
        )
        handoff = result.scalar_one_or_none()
        if handoff is None:
            raise NotFoundError(f"Handoff {handoff_id} not found")
        handoff.status = "resolved"
        handoff.resolved_at = datetime.now(UTC)
        handoff.resolved_by = str(resolved_by)
        handoff.resolution_notes = resolution_notes
        handoff.satisfaction_score = satisfaction_score
        await self.db.flush()

        # Update session
        session_result = await self.db.execute(
            select(WhatsAppSession).where(
                WhatsAppSession.id == uuid.UUID(str(handoff.session_id))
            )
        )
        session = session_result.scalar_one_or_none()
        if session is not None:
            session.status = "completed"
            session.outcome = "resolved"
            session.ended_at = datetime.now(UTC)
            if session.started_at:
                started = session.started_at
                if started.tzinfo is None:
                    started = started.replace(tzinfo=UTC)
                session.duration_seconds = int(
                    (session.ended_at - started).total_seconds()
                )
            await self.db.flush()

        return handoff

    # ====================================================================
    # Templates
    # ====================================================================

    async def create_template(
        self,
        *,
        organization_id: uuid.UUID,
        account_id: uuid.UUID,
        name: str,
        category: str,
        body_text: str,
        language: str = "en",
        header_type: str | None = None,
        header_text: str | None = None,
        footer_text: str | None = None,
        buttons: list | None = None,
        submit_to_meta: bool = False,
        created_by: uuid.UUID | None = None,
    ) -> WhatsAppTemplate:
        """Create a message template."""
        # Verify name format (lowercase + underscores)
        if not name.replace("_", "").isalnum() or not name.islower():
            raise ValidationError("Template name must be lowercase with underscores only")

        account = await self.get_account(
            organization_id=organization_id, account_id=account_id
        )

        template = WhatsAppTemplate(
            organization_id=str(organization_id),
            account_id=str(account_id),
            name=name,
            language=language,
            category=category.upper(),
            body_text=body_text,
            header_type=header_type,
            header_text=header_text,
            footer_text=footer_text,
            buttons=buttons or [],
            status="pending" if submit_to_meta else "draft",
            created_by=str(created_by) if created_by else None,
        )
        self.db.add(template)
        await self.db.flush()

        if submit_to_meta:
            try:
                client = self._get_client(account)
                template_data = {
                    "name": name,
                    "language": language,
                    "category": category.upper(),
                    "components": [],
                }
                # Body component
                body_component = {
                    "type": "BODY",
                    "text": body_text,
                }
                template_data["components"].append(body_component)
                if footer_text:
                    template_data["components"].append({
                        "type": "FOOTER",
                        "text": footer_text,
                    })
                if header_type and header_text:
                    template_data["components"].append({
                        "type": "HEADER",
                        "format": header_type.upper(),
                        "text": header_text,
                    })
                if buttons:
                    template_data["components"].append({
                        "type": "BUTTONS",
                        "buttons": buttons,
                    })

                response = await client.create_template(template_data)
                template.wa_template_id = response.get("id")
                template.status = "pending"  # Meta review pending
                template.last_synced_at = datetime.now(UTC)
                await self.db.flush()
            except Exception as e:
                logger.warning("whatsapp_template_submit_failed", error=str(e))
                template.status_reason = str(e)
                await self.db.flush()

        return template

    async def list_templates(
        self,
        *,
        organization_id: uuid.UUID,
        status: str | None = None,
    ) -> list[WhatsAppTemplate]:
        conditions = [
            WhatsAppTemplate.organization_id == str(organization_id),
        ]
        if status is not None:
            conditions.append(WhatsAppTemplate.status == status)
        result = await self.db.execute(
            select(WhatsAppTemplate)
            .where(*conditions)
            .order_by(WhatsAppTemplate.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_template(
        self,
        *,
        organization_id: uuid.UUID,
        template_id: uuid.UUID,
        delete_from_meta: bool = False,
    ) -> bool:
        result = await self.db.execute(
            select(WhatsAppTemplate).where(
                WhatsAppTemplate.id == template_id,
                WhatsAppTemplate.organization_id == str(organization_id),
            )
        )
        template = result.scalar_one_or_none()
        if template is None:
            raise NotFoundError(f"Template {template_id} not found")

        if delete_from_meta and template.wa_template_id:
            try:
                account = await self.get_account(
                    organization_id=organization_id,
                    account_id=uuid.UUID(template.account_id),
                )
                client = self._get_client(account)
                await client.delete_template(template.name)
            except Exception as e:
                logger.warning("whatsapp_template_meta_delete_failed", error=str(e))

        await self.db.delete(template)
        await self.db.flush()
        return True

    # ====================================================================
    # Webhook processing
    # ====================================================================

    async def process_webhook(
        self,
        *,
        body: bytes,
        headers: dict[str, str],
        query_params: dict[str, str],
        source_ip: str | None = None,
    ) -> dict[str, Any]:
        """Process an inbound Meta webhook.

        Handles both:
        - GET (webhook verification challenge)
        - POST (inbound messages + status updates)
        """
        # Handle verification challenge (GET)
        if query_params.get("hub.mode"):
            from app.whatsapp.meta_client import MetaWhatsAppClient

            mode = query_params.get("hub.mode", "")
            token = query_params.get("hub.verify_token", "")
            challenge = query_params.get("hub.challenge", "")

            # Look up account by verify_token
            result = await self.db.execute(
                select(WhatsAppAccount).where(
                    WhatsAppAccount.verify_token == token,
                    WhatsAppAccount.is_active == True,  # noqa: E712
                )
            )
            account = result.scalar_one_or_none()
            if account is None:
                return {"status": "error", "error": "Invalid verify token", "code": 403}

            challenge_response = MetaWhatsAppClient.verify_webhook_challenge(
                mode, token, account.verify_token, challenge
            )
            if challenge_response is not None:
                account.is_verified = True
                account.last_verified_at = datetime.now(UTC)
                await self.db.flush()
                return {"status": "ok", "challenge": challenge_response}
            return {"status": "error", "error": "Verification failed", "code": 403}

        # Handle POST (inbound events)
        try:
            body_json: dict[str, Any] = __import__("json").loads(body.decode("utf-8"))
        except Exception as e:
            return {"status": "error", "error": f"Invalid JSON: {e}"}

        # Parse events
        from app.whatsapp.meta_client import MetaWhatsAppClient

        events = MetaWhatsAppClient.parse_webhook(body_json)

        if not events:
            return {"status": "ok", "events": 0}

        # Log the webhook
        first_event = events[0]
        phone_number_id = first_event.get("phone_number_id")

        # Look up the number to find the org
        number = None
        if phone_number_id:
            number = await self.get_number_by_meta_id(phone_number_id)

        org_id = str(number.organization_id) if number else ""

        webhook_log = WhatsAppWebhook(
            organization_id=org_id,
            account_id=str(number.account_id) if number else None,
            event_type=first_event.get("event_type", "unknown"),
            headers=headers,
            body=body_json,
            raw_body=body.decode("utf-8", errors="replace"),
            source_ip=source_ip,
            signature_header=headers.get("X-Hub-Signature-256") or headers.get("x-hub-signature-256"),
        )
        self.db.add(webhook_log)
        await self.db.flush()

        # Verify signature (if we have an account with app_secret)
        if number:
            result = await self.db.execute(
                select(WhatsAppAccount).where(
                    WhatsAppAccount.id == uuid.UUID(str(number.account_id))
                )
            )
            account = result.scalar_one_or_none()
            if account and account.app_secret:
                sig_header = headers.get("X-Hub-Signature-256") or headers.get("x-hub-signature-256") or ""
                client = self._get_client(account)
                webhook_log.signature_valid = client.verify_webhook_signature(body, sig_header)
                if not webhook_log.signature_valid:
                    webhook_log.verification_error = "Invalid signature"
                    webhook_log.processed = True
                    webhook_log.processed_at = datetime.now(UTC)
                    webhook_log.processing_error = "invalid_signature"
                    await self.db.flush()
                    return {"status": "error", "error": "Invalid signature", "code": 403}

        # Process each event
        processed_count = 0
        for event in events:
            try:
                if event["event_type"] == "message.received":
                    result = await self.process_inbound_message(event=event)
                    processed_count += 1
                elif event["event_type"] in ("message.delivered", "message.read", "message.failed", "message.sent"):
                    await self._update_delivery_status(event)
                    processed_count += 1
            except Exception as e:
                logger.error("whatsapp_event_processing_failed", event_type=event["event_type"], error=str(e))

        webhook_log.processed = True
        webhook_log.processed_at = datetime.now(UTC)
        webhook_log.processing_result = {"events": len(events), "processed": processed_count}
        await self.db.flush()

        return {"status": "ok", "events": len(events), "processed": processed_count}

    async def _update_delivery_status(self, event: dict[str, Any]) -> None:
        """Update delivery status for an outbound message."""
        wa_message_id = event.get("wa_message_id")
        if not wa_message_id:
            return

        result = await self.db.execute(
            select(WhatsAppMessage).where(WhatsAppMessage.wa_message_id == wa_message_id)
        )
        msg = result.scalar_one_or_none()
        if msg is None:
            return

        status = event.get("status")
        if status == "delivered":
            msg.delivery_status = "delivered"
            msg.delivered_at = datetime.now(UTC)
        elif status == "read":
            msg.delivery_status = "read"
            msg.read_at = datetime.now(UTC)
        elif status == "failed":
            msg.delivery_status = "failed"
            msg.delivery_error_code = str(event.get("error_code", ""))
            msg.delivery_error_message = event.get("error_message")
        elif status == "sent":
            msg.delivery_status = "sent"
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
        """Get aggregate WhatsApp analytics for a tenant."""
        cutoff = datetime.now(UTC) - timedelta(days=days)

        # Sessions
        total_sessions_stmt = (
            select(func.count())
            .select_from(WhatsAppSession)
            .where(
                WhatsAppSession.organization_id == str(organization_id),
                WhatsAppSession.started_at >= cutoff,
            )
        )
        total_sessions = (await self.db.execute(total_sessions_stmt)).scalar_one()

        resolved_stmt = (
            select(func.count())
            .select_from(WhatsAppSession)
            .where(
                WhatsAppSession.organization_id == str(organization_id),
                WhatsAppSession.started_at >= cutoff,
                WhatsAppSession.outcome == "resolved",
            )
        )
        resolved = (await self.db.execute(resolved_stmt)).scalar_one()

        escalated_stmt = (
            select(func.count())
            .select_from(WhatsAppSession)
            .where(
                WhatsAppSession.organization_id == str(organization_id),
                WhatsAppSession.started_at >= cutoff,
                WhatsAppSession.is_escalated == True,  # noqa: E712
            )
        )
        escalated = (await self.db.execute(escalated_stmt)).scalar_one()

        # Messages
        inbound_stmt = (
            select(func.count())
            .select_from(WhatsAppMessage)
            .where(
                WhatsAppMessage.organization_id == str(organization_id),
                WhatsAppMessage.created_at >= cutoff,
                WhatsAppMessage.direction == "inbound",
            )
        )
        inbound = (await self.db.execute(inbound_stmt)).scalar_one()

        outbound_stmt = (
            select(func.count())
            .select_from(WhatsAppMessage)
            .where(
                WhatsAppMessage.organization_id == str(organization_id),
                WhatsAppMessage.created_at >= cutoff,
                WhatsAppMessage.direction == "outbound",
            )
        )
        outbound = (await self.db.execute(outbound_stmt)).scalar_one()

        ai_stmt = (
            select(func.count())
            .select_from(WhatsAppMessage)
            .where(
                WhatsAppMessage.organization_id == str(organization_id),
                WhatsAppMessage.created_at >= cutoff,
                WhatsAppMessage.is_ai_response == True,  # noqa: E712
            )
        )
        ai_messages = (await self.db.execute(ai_stmt)).scalar_one()

        delivered_stmt = (
            select(func.count())
            .select_from(WhatsAppMessage)
            .where(
                WhatsAppMessage.organization_id == str(organization_id),
                WhatsAppMessage.created_at >= cutoff,
                WhatsAppMessage.delivery_status.in_(["delivered", "read"]),
            )
        )
        delivered = (await self.db.execute(delivered_stmt)).scalar_one()

        read_stmt = (
            select(func.count())
            .select_from(WhatsAppMessage)
            .where(
                WhatsAppMessage.organization_id == str(organization_id),
                WhatsAppMessage.created_at >= cutoff,
                WhatsAppMessage.delivery_status == "read",
            )
        )
        read_count = (await self.db.execute(read_stmt)).scalar_one()

        failed_stmt = (
            select(func.count())
            .select_from(WhatsAppMessage)
            .where(
                WhatsAppMessage.organization_id == str(organization_id),
                WhatsAppMessage.created_at >= cutoff,
                WhatsAppMessage.delivery_status == "failed",
            )
        )
        failed = (await self.db.execute(failed_stmt)).scalar_one()

        # AI metrics
        avg_conf_stmt = (
            select(func.avg(WhatsAppMessage.ai_confidence))
            .where(
                WhatsAppMessage.organization_id == str(organization_id),
                WhatsAppMessage.created_at >= cutoff,
                WhatsAppMessage.is_ai_response == True,  # noqa: E712
                WhatsAppMessage.ai_confidence.isnot(None),
            )
        )
        avg_confidence = (await self.db.execute(avg_conf_stmt)).scalar_one()

        avg_lat_stmt = (
            select(func.avg(WhatsAppMessage.ai_latency_ms))
            .where(
                WhatsAppMessage.organization_id == str(organization_id),
                WhatsAppMessage.created_at >= cutoff,
                WhatsAppMessage.is_ai_response == True,  # noqa: E712
                WhatsAppMessage.ai_latency_ms.isnot(None),
            )
        )
        avg_latency = (await self.db.execute(avg_lat_stmt)).scalar_one()

        fallback_stmt = (
            select(func.count())
            .select_from(WhatsAppMessage)
            .where(
                WhatsAppMessage.organization_id == str(organization_id),
                WhatsAppMessage.created_at >= cutoff,
                WhatsAppMessage.ai_was_fallback == True,  # noqa: E712
            )
        )
        fallback_count = (await self.db.execute(fallback_stmt)).scalar_one()

        # Handoffs
        handoff_stmt = (
            select(func.count())
            .select_from(WhatsAppHandoff)
            .where(
                WhatsAppHandoff.organization_id == str(organization_id),
                WhatsAppHandoff.created_at >= cutoff,
            )
        )
        handoffs = (await self.db.execute(handoff_stmt)).scalar_one()

        return {
            "period_days": days,
            "total_conversations": total_sessions,
            "resolved_conversations": resolved,
            "escalated_conversations": escalated,
            "inbound_messages": inbound,
            "outbound_messages": outbound,
            "ai_messages": ai_messages,
            "delivered_count": delivered,
            "read_count": read_count,
            "failed_count": failed,
            "ai_resolution_rate": (resolved / total_sessions) if total_sessions > 0 else 0.0,
            "ai_avg_confidence": float(avg_confidence or 0),
            "ai_avg_latency_ms": float(avg_latency or 0),
            "ai_fallback_count": fallback_count,
            "human_handoff_count": handoffs,
            "human_handoff_rate": (handoffs / total_sessions) if total_sessions > 0 else 0.0,
            "delivery_success_rate": (delivered / outbound) if outbound > 0 else 0.0,
            "read_rate": (read_count / outbound) if outbound > 0 else 0.0,
        }

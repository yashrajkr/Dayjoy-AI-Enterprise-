"""Comprehensive tests for the Enterprise WhatsApp AI platform.

Stage 2 Step 5 — tests cover:
- Meta WhatsApp client (webhook signature verification, event parsing, message construction)
- WhatsApp service (account CRUD, number registration, session management, messaging)
- Conversation manager (AI integration, RAG, escalation)
- Webhook processing (verification challenge, inbound messages, status updates)
- Tenant isolation (cross-tenant access blocked)
- Analytics (aggregate metrics)
- Human handoff (initiate, assign, resolve)
- Templates (CRUD)
"""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, UTC
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base
from app.core.security import hash_password

# Import ALL models so tables get created
from app.models import *  # noqa: F401, F403
from app.models.organization import Organization, UserOrganization
from app.models.user import User
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


# ===== Shared fixtures =====


@pytest_asyncio.fixture
async def test_db():
    """In-memory SQLite DB with all tables created."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        org = Organization(name="Test Org", slug="test-org", is_active=True)
        session.add(org)
        await session.flush()
        org2 = Organization(name="Other Org", slug="other-org", is_active=True)
        session.add(org2)
        await session.flush()

        user = User(
            email="admin@test.com",
            full_name="Admin",
            hashed_password=hash_password("pass123!"),
            is_active=True,
            is_email_verified=True,
        )
        session.add(user)
        await session.flush()
        user2 = User(
            email="admin2@test.com",
            full_name="Admin2",
            hashed_password=hash_password("pass123!"),
            is_active=True,
            is_email_verified=True,
        )
        session.add(user2)
        await session.flush()

        session.add(UserOrganization(
            user_id=str(user.id), organization_id=str(org.id),
            role="org_owner", is_active=True,
        ))
        session.add(UserOrganization(
            user_id=str(user2.id), organization_id=str(org2.id),
            role="org_owner", is_active=True,
        ))
        await session.commit()
        yield session, org, org2, user, user2

    await engine.dispose()


# ====================================================================
# 1. META WHATSAPP CLIENT TESTS
# ====================================================================


@pytest.mark.unit
class TestMetaWhatsAppClient:
    """Tests for the Meta WhatsApp Cloud API client."""

    def test_verify_webhook_signature_valid(self):
        """Valid HMAC-SHA256 signature should pass verification."""
        from app.whatsapp.meta_client import MetaWhatsAppClient

        app_secret = "test_app_secret"
        client = MetaWhatsAppClient(
            access_token="test",
            phone_number_id="123",
            app_secret=app_secret,
        )
        body = b'{"object":"whatsapp_business_account","entry":[]}'
        expected_sig = hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
        signature_header = f"sha256={expected_sig}"

        assert client.verify_webhook_signature(body, signature_header) is True

    def test_verify_webhook_signature_invalid(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        client = MetaWhatsAppClient(
            access_token="test",
            phone_number_id="123",
            app_secret="test_secret",
        )
        body = b'{"test": true}'
        assert client.verify_webhook_signature(body, "sha256=wrong_signature") is False

    def test_verify_webhook_signature_missing_header(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        client = MetaWhatsAppClient(
            access_token="test",
            phone_number_id="123",
            app_secret="test_secret",
        )
        assert client.verify_webhook_signature(b"body", "") is False

    def test_verify_webhook_signature_no_app_secret(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        client = MetaWhatsAppClient(
            access_token="test",
            phone_number_id="123",
            app_secret="",
        )
        assert client.verify_webhook_signature(b"body", "sha256=abc") is False

    def test_verify_webhook_challenge_valid(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        challenge = MetaWhatsAppClient.verify_webhook_challenge(
            mode="subscribe",
            token="my_verify_token",
            verify_token="my_verify_token",
            challenge="challenge_12345",
        )
        assert challenge == "challenge_12345"

    def test_verify_webhook_challenge_invalid_token(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        challenge = MetaWhatsAppClient.verify_webhook_challenge(
            mode="subscribe",
            token="wrong_token",
            verify_token="correct_token",
            challenge="challenge_12345",
        )
        assert challenge is None

    def test_verify_webhook_challenge_wrong_mode(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        challenge = MetaWhatsAppClient.verify_webhook_challenge(
            mode="not_subscribe",
            token="my_token",
            verify_token="my_token",
            challenge="challenge_12345",
        )
        assert challenge is None

    def test_parse_webhook_text_message(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        body = {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA_123",
                "changes": [{
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {
                            "phone_number_id": "PN_123",
                            "display_phone_number": "+1234567890",
                        },
                        "contacts": [{
                            "profile": {"name": "John Doe"},
                            "wa_id": "9876543210",
                        }],
                        "messages": [{
                            "from": "9876543210",
                            "id": "wamid.HBgL...",
                            "timestamp": "1700000000",
                            "type": "text",
                            "text": {"body": "Hello, I need help"},
                        }],
                    },
                }],
            }],
        }

        events = MetaWhatsAppClient.parse_webhook(body)
        assert len(events) == 1
        event = events[0]
        assert event["event_type"] == "message.received"
        assert event["from_number"] == "9876543210"
        assert event["customer_name"] == "John Doe"
        assert event["message_type"] == "text"
        assert event["text"] == "Hello, I need help"
        assert event["phone_number_id"] == "PN_123"
        assert event["display_phone_number"] == "+1234567890"

    def test_parse_webhook_image_message(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        body = {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA_123",
                "changes": [{
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {"phone_number_id": "PN_123", "display_phone_number": "+1234567890"},
                        "contacts": [{"profile": {"name": "Jane"}, "wa_id": "9876543210"}],
                        "messages": [{
                            "from": "9876543210",
                            "id": "wamid.img",
                            "timestamp": "1700000000",
                            "type": "image",
                            "image": {
                                "id": "MEDIA_123",
                                "mime_type": "image/jpeg",
                                "sha256": "abc123",
                                "caption": "Look at this",
                            },
                        }],
                    },
                }],
            }],
        }

        events = MetaWhatsAppClient.parse_webhook(body)
        assert len(events) == 1
        assert events[0]["message_type"] == "image"
        assert events[0]["media_id"] == "MEDIA_123"
        assert events[0]["mime_type"] == "image/jpeg"
        assert events[0]["caption"] == "Look at this"

    def test_parse_webhook_location_message(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        body = {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA_123",
                "changes": [{
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {"phone_number_id": "PN_123", "display_phone_number": "+1234567890"},
                        "contacts": [{"profile": {"name": "John"}, "wa_id": "9876543210"}],
                        "messages": [{
                            "from": "9876543210",
                            "id": "wamid.loc",
                            "timestamp": "1700000000",
                            "type": "location",
                            "location": {
                                "latitude": 37.7749,
                                "longitude": -122.4194,
                                "name": "Office",
                                "address": "123 Main St",
                            },
                        }],
                    },
                }],
            }],
        }

        events = MetaWhatsAppClient.parse_webhook(body)
        assert events[0]["message_type"] == "location"
        assert events[0]["latitude"] == 37.7749
        assert events[0]["longitude"] == -122.4194
        assert events[0]["location_name"] == "Office"

    def test_parse_webhook_status_delivered(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        body = {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA_123",
                "changes": [{
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {"phone_number_id": "PN_123", "display_phone_number": "+1234567890"},
                        "statuses": [{
                            "id": "wamid.outbound.123",
                            "recipient_id": "9876543210",
                            "status": "delivered",
                            "timestamp": "1700000001",
                        }],
                    },
                }],
            }],
        }

        events = MetaWhatsAppClient.parse_webhook(body)
        assert len(events) == 1
        assert events[0]["event_type"] == "message.delivered"
        assert events[0]["status"] == "delivered"
        assert events[0]["wa_message_id"] == "wamid.outbound.123"

    def test_parse_webhook_status_failed(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        body = {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA_123",
                "changes": [{
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {"phone_number_id": "PN_123", "display_phone_number": "+1234567890"},
                        "statuses": [{
                            "id": "wamid.outbound.456",
                            "recipient_id": "9876543210",
                            "status": "failed",
                            "timestamp": "1700000002",
                            "errors": [{"code": 131047, "title": "Recipient not allowed"}],
                        }],
                    },
                }],
            }],
        }

        events = MetaWhatsAppClient.parse_webhook(body)
        assert events[0]["event_type"] == "message.failed"
        assert events[0]["error_code"] == 131047
        assert "Recipient not allowed" in events[0]["error_message"]

    def test_parse_webhook_empty(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        events = MetaWhatsAppClient.parse_webhook({})
        assert events == []

    def test_parse_webhook_wrong_object(self):
        from app.whatsapp.meta_client import MetaWhatsAppClient

        events = MetaWhatsAppClient.parse_webhook({"object": "instagram", "entry": []})
        assert events == []


# ====================================================================
# 2. WHATSAPP SERVICE TESTS
# ====================================================================


@pytest.mark.integration
class TestWhatsAppService:
    """Tests for the WhatsAppService (account CRUD, numbers, sessions)."""

    @pytest.mark.asyncio
    async def test_connect_account(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            created_by=user.id,
            name="Test Account",
            business_account_id="WABA_123",
            access_token="EAAB_test_token",
            verify_token="my_verify_token",
        )
        await session.commit()
        assert account.id is not None
        assert account.organization_id == str(org.id)
        assert account.is_active is True

    @pytest.mark.asyncio
    async def test_connect_account_missing_fields(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import ValidationError
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        with pytest.raises(ValidationError):
            await svc.connect_account(
                organization_id=org.id,
                name="Test",
                business_account_id="",
                access_token="token",
                verify_token="verify",
            )

    @pytest.mark.asyncio
    async def test_list_accounts_tenant_isolated(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        await svc.connect_account(
            organization_id=org.id,
            name="Org1 Account",
            business_account_id="WABA_1",
            access_token="token1",
            verify_token="verify1",
        )
        await svc.connect_account(
            organization_id=org2.id,
            name="Org2 Account",
            business_account_id="WABA_2",
            access_token="token2",
            verify_token="verify2",
        )
        await session.commit()

        org1_accounts = await svc.list_accounts(organization_id=org.id)
        org2_accounts = await svc.list_accounts(organization_id=org2.id)
        assert len(org1_accounts) == 1
        assert len(org2_accounts) == 1
        assert org1_accounts[0].name == "Org1 Account"
        assert org2_accounts[0].name == "Org2 Account"

    @pytest.mark.asyncio
    async def test_register_number(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_123",
            access_token="token",
            verify_token="verify",
        )
        await session.flush()

        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123456",
            display_phone_number="+1234567890",
            display_name="Sales Line",
        )
        await session.commit()
        assert number.id is not None
        assert number.phone_number_id == "PN_123456"
        assert number.display_phone_number == "+1234567890"

    @pytest.mark.asyncio
    async def test_register_number_duplicate(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import ValidationError
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_123",
            access_token="token",
            verify_token="verify",
        )
        await session.flush()
        await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_dup",
            display_phone_number="+1111111111",
        )
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.register_number(
                organization_id=org.id,
                account_id=account.id,
                phone_number_id="PN_dup",
                display_phone_number="+2222222222",
            )

    @pytest.mark.asyncio
    async def test_get_or_create_session(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_123",
            access_token="token",
            verify_token="verify",
            auto_reply_enabled=False,  # disable to skip greeting send
        )
        await session.flush()
        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123",
            display_phone_number="+1234567890",
        )
        await session.flush()

        # Create session
        session1 = await svc.get_or_create_session(
            organization_id=org.id,
            account=account,
            number=number,
            customer_phone="+9876543210",
            customer_name="John",
        )
        await session.flush()
        assert session1.id is not None
        assert session1.customer_phone == "+9876543210"

        # Get same session (within 24h)
        session2 = await svc.get_or_create_session(
            organization_id=org.id,
            account=account,
            number=number,
            customer_phone="+9876543210",
        )
        assert session2.id == session1.id

    @pytest.mark.asyncio
    async def test_end_session(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_123",
            access_token="token",
            verify_token="verify",
            auto_reply_enabled=False,
        )
        await session.flush()
        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123",
            display_phone_number="+1234567890",
        )
        await session.flush()
        wa_session = await svc.get_or_create_session(
            organization_id=org.id,
            account=account,
            number=number,
            customer_phone="+9876543210",
        )
        await session.flush()

        ended = await svc.end_session(
            organization_id=org.id,
            session_id=wa_session.id,
            outcome="resolved",
        )
        await session.commit()
        assert ended.status == "completed"
        assert ended.outcome == "resolved"
        assert ended.ended_at is not None


# ====================================================================
# 3. WEBHOOK PROCESSING TESTS
# ====================================================================


@pytest.mark.integration
class TestWhatsAppWebhook:
    """Tests for webhook processing."""

    @pytest.mark.asyncio
    async def test_webhook_verification_challenge(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_123",
            access_token="token",
            verify_token="my_verify_token",
        )
        await session.commit()

        # Simulate Meta's verification request
        result = await svc.process_webhook(
            body=b"",
            headers={},
            query_params={
                "hub.mode": "subscribe",
                "hub.verify_token": "my_verify_token",
                "hub.challenge": "challenge_12345",
            },
        )
        await session.commit()
        assert result["status"] == "ok"
        assert result["challenge"] == "challenge_12345"

        # Verify account was marked as verified
        await session.refresh(account)
        assert account.is_verified is True

    @pytest.mark.asyncio
    async def test_webhook_verification_invalid_token(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_123",
            access_token="token",
            verify_token="correct_token",
        )
        await session.commit()

        result = await svc.process_webhook(
            body=b"",
            headers={},
            query_params={
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong_token",
                "hub.challenge": "challenge",
            },
        )
        assert result["status"] == "error"
        assert "Invalid verify token" in result["error"]

    @pytest.mark.asyncio
    async def test_webhook_inbound_message(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_123",
            access_token="token",
            verify_token="verify",
            auto_reply_enabled=False,
        )
        await session.flush()
        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123",
            display_phone_number="+1234567890",
        )
        await session.commit()

        # Simulate Meta's inbound message webhook
        webhook_body = {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA_123",
                "changes": [{
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {
                            "phone_number_id": "PN_123",
                            "display_phone_number": "+1234567890",
                        },
                        "contacts": [{"profile": {"name": "John"}, "wa_id": "9876543210"}],
                        "messages": [{
                            "from": "9876543210",
                            "id": "wamid.test.123",
                            "timestamp": "1700000000",
                            "type": "text",
                            "text": {"body": "Hello, I need help"},
                        }],
                    },
                }],
            }],
        }
        body_bytes = json.dumps(webhook_body).encode()

        # Mock the AI gateway to avoid actual LLM calls
        with patch.object(svc, "_process_with_ai", new_callable=AsyncMock) as mock_ai:
            mock_ai.return_value = {
                "response": "Hi! How can I help?",
                "confidence": 0.95,
                "was_fallback": False,
            }
            with patch.object(svc, "_send_and_record", new_callable=AsyncMock):
                result = await svc.process_webhook(
                    body=body_bytes,
                    headers={},
                    query_params={},
                )
        await session.commit()

        assert result["status"] == "ok"
        assert result["events"] == 1
        assert result["processed"] == 1

        # Verify session + message were created
        msg_result = await session.execute(
            select(WhatsAppMessage).where(WhatsAppMessage.wa_message_id == "wamid.test.123")
        )
        msg = msg_result.scalar_one_or_none()
        assert msg is not None
        assert msg.direction == "inbound"
        assert msg.text == "Hello, I need help"
        assert msg.from_number == "9876543210"

    @pytest.mark.asyncio
    async def test_webhook_status_update(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_123",
            access_token="token",
            verify_token="verify",
        )
        await session.flush()
        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123",
            display_phone_number="+1234567890",
        )
        await session.flush()

        # Create an outbound message with a known WA message ID
        wa_session = WhatsAppSession(
            organization_id=str(org.id),
            account_id=str(account.id),
            number_id=str(number.id),
            customer_phone="9876543210",
            status="active",
            started_at=datetime.now(UTC),
            last_message_at=datetime.now(UTC),
        )
        session.add(wa_session)
        await session.flush()

        msg = WhatsAppMessage(
            organization_id=str(org.id),
            account_id=str(account.id),
            number_id=str(number.id),
            session_id=str(wa_session.id),
            wa_message_id="wamid.outbound.123",
            direction="outbound",
            from_number="+1234567890",
            to_number="9876543210",
            message_type="text",
            text="Test outbound",
            delivery_status="sent",
        )
        session.add(msg)
        await session.commit()

        # Simulate Meta's delivered status webhook
        webhook_body = {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA_123",
                "changes": [{
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {"phone_number_id": "PN_123", "display_phone_number": "+1234567890"},
                        "statuses": [{
                            "id": "wamid.outbound.123",
                            "recipient_id": "9876543210",
                            "status": "delivered",
                            "timestamp": "1700000001",
                        }],
                    },
                }],
            }],
        }
        body_bytes = json.dumps(webhook_body).encode()

        result = await svc.process_webhook(
            body=body_bytes,
            headers={},
            query_params={},
        )
        await session.commit()

        assert result["status"] == "ok"
        # Verify message delivery status was updated
        await session.refresh(msg)
        assert msg.delivery_status == "delivered"
        assert msg.delivered_at is not None


# ====================================================================
# 4. TENANT ISOLATION TESTS
# ====================================================================


@pytest.mark.integration
class TestWhatsAppTenantIsolation:
    """Cross-tenant access must be blocked at every layer."""

    @pytest.mark.asyncio
    async def test_get_account_cross_tenant_blocked(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import NotFoundError
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Org1 Account",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
        )
        await session.commit()

        with pytest.raises(NotFoundError):
            await svc.get_account(organization_id=org2.id, account_id=account.id)

    @pytest.mark.asyncio
    async def test_get_session_cross_tenant_blocked(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import NotFoundError
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
            auto_reply_enabled=False,
        )
        await session.flush()
        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123",
            display_phone_number="+1234567890",
        )
        await session.flush()
        wa_session = await svc.get_or_create_session(
            organization_id=org.id,
            account=account,
            number=number,
            customer_phone="+9876543210",
        )
        await session.commit()

        with pytest.raises(NotFoundError):
            await svc.get_session(organization_id=org2.id, session_id=wa_session.id)


# ====================================================================
# 5. HUMAN HANDOFF TESTS
# ====================================================================


@pytest.mark.integration
class TestWhatsAppHandoff:
    """Tests for human handoff."""

    @pytest.mark.asyncio
    async def test_initiate_handoff(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
            auto_reply_enabled=False,
        )
        await session.flush()
        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123",
            display_phone_number="+1234567890",
        )
        await session.flush()
        wa_session = await svc.get_or_create_session(
            organization_id=org.id,
            account=account,
            number=number,
            customer_phone="+9876543210",
        )
        await session.flush()

        handoff = await svc.initiate_handoff(
            organization_id=org.id,
            session_id=wa_session.id,
            reason="customer_request",
            reason_details="Customer asked to speak to a human",
            priority="high",
        )
        await session.commit()
        assert handoff.id is not None
        assert handoff.status == "pending"
        assert handoff.reason == "customer_request"

        # Verify session was marked as escalated
        await session.refresh(wa_session)
        assert wa_session.is_escalated is True
        assert wa_session.status == "waiting_human"

    @pytest.mark.asyncio
    async def test_assign_handoff(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
            auto_reply_enabled=False,
        )
        await session.flush()
        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123",
            display_phone_number="+1234567890",
        )
        await session.flush()
        wa_session = await svc.get_or_create_session(
            organization_id=org.id,
            account=account,
            number=number,
            customer_phone="+9876543210",
        )
        await session.flush()
        handoff = await svc.initiate_handoff(
            organization_id=org.id,
            session_id=wa_session.id,
            reason="manual",
        )
        await session.flush()

        assigned = await svc.assign_handoff(
            organization_id=org.id,
            handoff_id=handoff.id,
            agent_user_id=user.id,
        )
        await session.commit()
        assert assigned.status == "assigned"
        assert assigned.assigned_to == str(user.id)

    @pytest.mark.asyncio
    async def test_resolve_handoff(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
            auto_reply_enabled=False,
        )
        await session.flush()
        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123",
            display_phone_number="+1234567890",
        )
        await session.flush()
        wa_session = await svc.get_or_create_session(
            organization_id=org.id,
            account=account,
            number=number,
            customer_phone="+9876543210",
        )
        await session.flush()
        handoff = await svc.initiate_handoff(
            organization_id=org.id,
            session_id=wa_session.id,
            reason="manual",
        )
        await svc.assign_handoff(
            organization_id=org.id,
            handoff_id=handoff.id,
            agent_user_id=user.id,
        )
        await session.flush()

        resolved = await svc.resolve_handoff(
            organization_id=org.id,
            handoff_id=handoff.id,
            resolved_by=user.id,
            resolution_notes="Issue resolved",
            satisfaction_score=5,
        )
        await session.commit()
        assert resolved.status == "resolved"
        assert resolved.resolution_notes == "Issue resolved"
        assert resolved.satisfaction_score == 5

        # Verify session was completed
        await session.refresh(wa_session)
        assert wa_session.status == "completed"
        assert wa_session.outcome == "resolved"


# ====================================================================
# 6. TEMPLATE TESTS
# ====================================================================


@pytest.mark.integration
class TestWhatsAppTemplates:
    """Tests for template management."""

    @pytest.mark.asyncio
    async def test_create_template(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
        )
        await session.flush()

        template = await svc.create_template(
            organization_id=org.id,
            account_id=account.id,
            created_by=user.id,
            name="order_confirmation",
            category="UTILITY",
            body_text="Hello {{1}}, your order {{2}} has been confirmed.",
            language="en",
            footer_text="Reply STOP to opt out",
        )
        await session.commit()
        assert template.id is not None
        assert template.name == "order_confirmation"
        assert template.status == "draft"  # not submitted to Meta

    @pytest.mark.asyncio
    async def test_create_template_invalid_name(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import ValidationError
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
        )
        await session.flush()

        with pytest.raises(ValidationError):
            await svc.create_template(
                organization_id=org.id,
                account_id=account.id,
                name="OrderConfirmation",  # uppercase not allowed
                category="UTILITY",
                body_text="Hello",
            )

    @pytest.mark.asyncio
    async def test_list_templates(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
        )
        await session.flush()
        await svc.create_template(
            organization_id=org.id,
            account_id=account.id,
            name="template_one",
            category="MARKETING",
            body_text="Test 1",
        )
        await svc.create_template(
            organization_id=org.id,
            account_id=account.id,
            name="template_two",
            category="UTILITY",
            body_text="Test 2",
        )
        await session.commit()

        templates = await svc.list_templates(organization_id=org.id)
        assert len(templates) == 2

    @pytest.mark.asyncio
    async def test_delete_template(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
        )
        await session.flush()
        template = await svc.create_template(
            organization_id=org.id,
            account_id=account.id,
            name="to_delete",
            category="MARKETING",
            body_text="Test",
        )
        await session.flush()

        result = await svc.delete_template(
            organization_id=org.id,
            template_id=template.id,
        )
        await session.commit()
        assert result is True


# ====================================================================
# 7. ANALYTICS TESTS
# ====================================================================


@pytest.mark.integration
class TestWhatsAppAnalytics:
    """Tests for analytics."""

    @pytest.mark.asyncio
    async def test_get_analytics_summary(self, test_db):
        session, org, org2, user, user2 = test_db
        from app.whatsapp.service import WhatsAppService

        svc = WhatsAppService(session)
        account = await svc.connect_account(
            organization_id=org.id,
            name="Test",
            business_account_id="WABA_1",
            access_token="token",
            verify_token="verify",
            auto_reply_enabled=False,
        )
        await session.flush()
        number = await svc.register_number(
            organization_id=org.id,
            account_id=account.id,
            phone_number_id="PN_123",
            display_phone_number="+1234567890",
        )
        await session.flush()

        # Create sessions + messages
        now = datetime.now(UTC)
        for i in range(3):
            wa_session = WhatsAppSession(
                organization_id=str(org.id),
                account_id=str(account.id),
                number_id=str(number.id),
                customer_phone=f"+98765432{i:02d}",
                status="completed",
                outcome="resolved" if i < 2 else "unresolved",
                started_at=now,
                last_message_at=now,
                inbound_count=2,
                outbound_count=2,
                ai_response_count=2,
            )
            session.add(wa_session)
            await session.flush()
            # Add messages
            for j in range(2):
                session.add(WhatsAppMessage(
                    organization_id=str(org.id),
                    account_id=str(account.id),
                    number_id=str(number.id),
                    session_id=str(wa_session.id),
                    direction="inbound" if j == 0 else "outbound",
                    from_number="+9876543210" if j == 0 else "+1234567890",
                    to_number="+1234567890" if j == 0 else "+9876543210",
                    message_type="text",
                    text=f"Message {j}",
                    is_ai_response=(j == 1),
                    ai_confidence=0.9,
                    ai_latency_ms=500,
                    delivery_status="delivered" if j == 1 else None,
                ))
        await session.commit()

        summary = await svc.get_analytics_summary(organization_id=org.id, days=30)
        assert summary["total_conversations"] == 3
        assert summary["resolved_conversations"] == 2
        assert summary["inbound_messages"] == 3  # one inbound per session
        assert summary["outbound_messages"] == 3
        assert summary["ai_messages"] == 3
        assert summary["delivered_count"] == 3
        assert summary["ai_avg_confidence"] > 0.8
        assert summary["ai_avg_latency_ms"] > 0

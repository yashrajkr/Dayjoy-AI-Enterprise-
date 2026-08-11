"""Comprehensive tests for the Enterprise Telephony platform.

Stage 2 Step 4 — tests cover:
- Twilio provider (signature verification, webhook parsing, TwiML generation)
- Stub providers (Exotel, Plivo, Knowlarity — raise NotImplementedError)
- Telephony service (phone number CRUD, settings, sessions, recordings, routing rules)
- Call router (rule evaluation, business hours, default strategy)
- Webhook processing (inbound call, status callback, recording callback)
- Tenant isolation (cross-tenant access blocked)
- Analytics (aggregate metrics)
- TwiML generation (Say, Dial, Connect+Stream, Record, Hangup)
"""

import base64
import hashlib
import hmac
import json
import uuid
from datetime import datetime, UTC
from typing import Any
from unittest.mock import AsyncMock, MagicMock

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
from app.models.user import User


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


@pytest.fixture
def reset_telephony_singletons():
    """Reset telephony provider singletons between tests."""
    from app.telephony.providers import clear_cache

    clear_cache()
    yield
    clear_cache()


# ====================================================================
# 1. TWILIO PROVIDER TESTS
# ====================================================================


@pytest.mark.unit
class TestTwilioProvider:
    """Tests for the Twilio telephony provider."""

    def test_provider_name(self, reset_telephony_singletons):
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="test")
        assert provider.name == "twilio"

    def test_from_settings(self, reset_telephony_singletons):
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider.from_settings()
        assert provider.account_sid == settings.TWILIO_ACCOUNT_SID
        assert provider.auth_token == settings.TWILIO_AUTH_TOKEN

    def test_verify_webhook_signature_valid(self, reset_telephony_singletons):
        """Valid HMAC-SHA1 signature should pass verification."""
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        auth_token = "test_auth_token"
        provider = TwilioTelephonyProvider(
            account_sid="ACxxx", auth_token=auth_token
        )
        url = "https://example.com/api/v1/telephony/webhook/twilio/voice"
        body = b"CallSid=CA123&From=%2B1234567890&To=%2B1987654321"

        # Compute the expected signature (Twilio's algorithm)
        string_to_sign = url + "CallSidCA123" + "From+1234567890" + "To+1987654321"
        # Actually Twilio uses URL-encoded values as-is in the string
        # Let me use the form-encoded values directly
        import urllib.parse

        params = urllib.parse.parse_qs(body.decode(), keep_blank_values=True)
        flat = {k: v[0] if v else "" for k, v in params.items()}
        sorted_params = sorted(flat.items())
        param_str = "".join(f"{k}{v}" for k, v in sorted_params)
        string_to_sign = url + param_str
        expected_sig = base64.b64encode(
            hmac.new(auth_token.encode(), string_to_sign.encode(), hashlib.sha1).digest()
        ).decode()

        headers = {"X-Twilio-Signature": expected_sig}
        assert provider.verify_webhook_signature(body, headers, url=url) is True

    def test_verify_webhook_signature_invalid(self, reset_telephony_singletons):
        """Invalid signature should fail verification."""
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(
            account_sid="ACxxx", auth_token="test_token"
        )
        body = b"CallSid=CA123"
        headers = {"X-Twilio-Signature": "wrong_signature"}
        assert provider.verify_webhook_signature(body, headers, url="https://example.com") is False

    def test_verify_webhook_missing_signature(self, reset_telephony_singletons):
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(
            account_sid="ACxxx", auth_token="test_token"
        )
        assert provider.verify_webhook_signature(b"body", {}, url="https://example.com") is False

    def test_verify_webhook_no_auth_token(self, reset_telephony_singletons):
        """Without auth_token configured, verification fails."""
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="")
        result = provider.verify_webhook_signature(
            b"body", {"X-Twilio-Signature": "sig"}, url="https://example.com"
        )
        assert result is False

    def test_parse_inbound_call(self, reset_telephony_singletons):
        from app.telephony.providers.models import CallDirection
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="test")
        body = (
            b"CallSid=CA1234567890abcdef&From=%2B1234567890&To=%2B1987654321"
            b"&Direction=inbound&CallerName=John+Doe&AccountSid=ACxxx"
        )
        inbound = provider.parse_inbound_call(body, {})
        assert inbound.call_sid == "CA1234567890abcdef"
        assert inbound.from_number == "+1234567890"
        assert inbound.to_number == "+1987654321"
        assert inbound.direction == CallDirection.INBOUND
        assert inbound.caller_name == "John Doe"
        assert inbound.account_sid == "ACxxx"

    def test_parse_status_callback_completed(self, reset_telephony_singletons):
        from app.telephony.providers.models import TelephonyEventType
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="test")
        body = (
            b"CallSid=CA123&CallStatus=completed&CallDuration=120"
            b"&From=%2B1234&To=%2B5678&HangupCause=caller-busy"
        )
        event = provider.parse_status_callback(body, {})
        assert event.event_type == TelephonyEventType.CALL_COMPLETED
        assert event.call_sid == "CA123"
        assert event.payload["duration_seconds"] == 120
        assert event.payload["hangup_cause"] == "caller-busy"

    def test_parse_status_callback_ringing(self, reset_telephony_singletons):
        from app.telephony.providers.models import TelephonyEventType
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="test")
        body = b"CallSid=CA123&CallStatus=ringing&From=%2B1234&To=%2B5678"
        event = provider.parse_status_callback(body, {})
        assert event.event_type == TelephonyEventType.CALL_RINGING

    def test_parse_recording_callback(self, reset_telephony_singletons):
        from app.telephony.providers.models import TelephonyEventType
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="test")
        body = (
            b"CallSid=CA123&RecordingSid=RE123&RecordingStatus=completed"
            b"&RecordingUrl=https%3A%2F%2Fapi.twilio.com%2Frecordings%2FRE123"
            b"&RecordingDuration=120&RecordingChannels=2"
        )
        event = provider.parse_recording_callback(body, {})
        assert event.event_type == TelephonyEventType.RECORDING_COMPLETED
        assert event.call_sid == "CA123"
        recording = event.recording
        assert recording is not None
        assert recording.recording_sid == "RE123"
        assert recording.duration_seconds == 120
        assert recording.channels == 2

    def test_generate_connect_twiml(self, reset_telephony_singletons):
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="test")
        twiml = provider.generate_connect_twiml(
            ai_websocket_url="wss://example.com/stream",
            greeting_text="Hello, how can I help?",
            recording_enabled=True,
            recording_status_callback="https://example.com/recording-callback",
        )
        assert "<?xml" in twiml
        assert "<Response>" in twiml
        assert "<Say" in twiml
        assert "Hello, how can I help?" in twiml
        assert "<Connect>" in twiml
        assert "<Stream" in twiml
        assert "wss://example.com/stream" in twiml

    def test_generate_dial_twiml(self, reset_telephony_singletons):
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="test")
        twiml = provider.generate_dial_twiml("+1234567890", timeout=20)
        assert "<Dial" in twiml
        assert "+1234567890" in twiml
        assert 'timeout="20"' in twiml

    def test_generate_say_twiml(self, reset_telephony_singletons):
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="test")
        twiml = provider.generate_say_twiml("Hello world")
        assert "<Say" in twiml
        assert "Hello world" in twiml

    def test_generate_hangup_twiml(self, reset_telephony_singletons):
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="ACxxx", auth_token="test")
        twiml = provider.generate_hangup_twiml()
        assert "<Hangup" in twiml

    @pytest.mark.asyncio
    async def test_make_call_requires_credentials(self, reset_telephony_singletons):
        from app.telephony.providers.exceptions import TelephonyProviderError
        from app.telephony.providers.models import TelephonyCallRequest
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = TwilioTelephonyProvider(account_sid="", auth_token="")
        with pytest.raises(TelephonyProviderError):
            await provider.make_call(
                TelephonyCallRequest(to_number="+1234", from_number="+5678")
            )


# ====================================================================
# 2. STUB PROVIDER TESTS
# ====================================================================


@pytest.mark.unit
class TestStubProviders:
    """Tests for the stub telephony providers."""

    @pytest.mark.parametrize(
        "provider_name",
        ["exotel", "plivo", "knowlarity"],
    )
    def test_stub_provider_name(self, provider_name, reset_telephony_singletons):
        from app.telephony.providers import TELEPHONY_PROVIDER_REGISTRY

        cls = TELEPHONY_PROVIDER_REGISTRY.get(provider_name)
        assert cls is not None
        instance = cls()
        assert instance.name == provider_name

    @pytest.mark.asyncio
    async def test_exotel_make_call_raises(self, reset_telephony_singletons):
        from app.telephony.providers.exceptions import (
            TelephonyProviderNotImplementedError,
        )
        from app.telephony.providers.models import TelephonyCallRequest
        from app.telephony.providers.exotel_provider import ExotelTelephonyProvider

        provider = ExotelTelephonyProvider()
        with pytest.raises(TelephonyProviderNotImplementedError):
            await provider.make_call(
                TelephonyCallRequest(to_number="+1234", from_number="+5678")
            )

    def test_get_telephony_provider_twilio_default(self, reset_telephony_singletons):
        from app.telephony.providers import get_telephony_provider
        from app.telephony.providers.twilio_provider import TwilioTelephonyProvider

        provider = get_telephony_provider("twilio")
        assert isinstance(provider, TwilioTelephonyProvider)

    def test_get_telephony_provider_unknown_raises(self, reset_telephony_singletons):
        from app.telephony.providers import (
            TelephonyProviderError,
            get_telephony_provider,
        )

        with pytest.raises(TelephonyProviderError):
            get_telephony_provider("unknown_provider")


# ====================================================================
# 3. TWIML GENERATION TESTS
# ====================================================================


@pytest.mark.unit
class TestTwimlGeneration:
    """Tests for the TwiML helper module."""

    def test_say(self):
        from app.telephony.twiml import say

        result = say("Hello", voice="Polly.Joanna", language="en-US")
        assert "<Say" in result
        assert 'voice="Polly.Joanna"' in result
        assert 'language="en-US"' in result
        assert "Hello" in result

    def test_dial(self):
        from app.telephony.twiml import dial

        result = dial("+1234567890", timeout=30, record=True)
        assert "<Dial" in result
        assert "+1234567890" in result
        assert 'timeout="30"' in result
        assert 'record="true"' in result

    def test_hangup(self):
        from app.telephony.twiml import hangup

        assert hangup() == "<Hangup/>"

    def test_reject(self):
        from app.telephony.twiml import reject

        assert 'reason="busy"' in reject(reason="busy")

    def test_connect_stream(self):
        from app.telephony.twiml import connect_stream

        result = connect_stream(
            "wss://example.com/stream",
            name="ai_stream",
            session_id="abc123",
        )
        assert "<Connect>" in result
        assert "<Stream" in result
        assert 'url="wss://example.com/stream"' in result
        assert 'name="ai_stream"' in result
        assert '<Parameter name="session_id" value="abc123"/>' in result

    def test_response_wrapper(self):
        from app.telephony.twiml import response, say, hangup

        result = response(say("Hi"), hangup())
        assert result.startswith('<?xml version="1.0"')
        assert "<Response>" in result
        assert "<Say" in result
        assert "<Hangup" in result
        assert "</Response>" in result

    def test_connect_to_ai(self):
        from app.telephony.twiml import connect_to_ai

        twiml = connect_to_ai(
            ai_websocket_url="wss://example.com/stream",
            greeting_text="Hello!",
            recording_enabled=True,
            recording_status_callback="https://example.com/rec",
            session_id="sess123",
            organization_id="org123",
        )
        assert "<Response>" in twiml
        assert "<Say" in twiml
        assert "Hello!" in twiml
        assert "<Connect>" in twiml
        assert "<Stream" in twiml
        assert "wss://example.com/stream" in twiml

    def test_voicemail(self):
        from app.telephony.twiml import voicemail

        twiml = voicemail(
            action_url="https://example.com/voicemail",
            max_duration=60,
            greeting="Leave a message",
        )
        assert "<Record" in twiml
        assert 'action="https://example.com/voicemail"' in twiml
        assert 'maxLength="60"' in twiml
        assert "Leave a message" in twiml

    def test_reject_busy(self):
        from app.telephony.twiml import reject_busy

        twiml = reject_busy()
        assert "<Reject" in twiml
        assert 'reason="busy"' in twiml

    def test_say_and_hangup(self):
        from app.telephony.twiml import say_and_hangup

        twiml = say_and_hangup("Goodbye")
        assert "<Say" in twiml
        assert "Goodbye" in twiml
        assert "<Hangup" in twiml


# ====================================================================
# 4. CALL ROUTER TESTS
# ====================================================================


@pytest.mark.integration
class TestCallRouter:
    """Tests for the rule-based call router."""

    @pytest.mark.asyncio
    async def test_default_strategy_when_no_rules(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.call_router import CallRouter

        # Create a phone number with default routing = ai
        phone = PhoneNumber(
            organization_id=str(org.id),
            number="+1234567890",
            display_name="Main",
            routing_strategy="ai",
            is_active=True,
        )
        session.add(phone)
        await session.flush()

        router = CallRouter(session)
        decision = await router.route_call(
            organization_id=org.id,
            phone_number=phone,
            caller_phone="+1987654321",
        )
        assert decision.action == "ai"
        assert decision.reason == "default_strategy"

    @pytest.mark.asyncio
    async def test_rule_matches_caller_prefix(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.call_router import CallRouter

        phone = PhoneNumber(
            organization_id=str(org.id),
            number="+1234567890",
            display_name="Main",
            routing_strategy="ai",
            is_active=True,
        )
        session.add(phone)
        await session.flush()

        # Create a rule: VIP prefix → forward to sales
        rule = RoutingRule(
            organization_id=str(org.id),
            name="VIP Forward",
            priority=10,
            conditions={"caller_phone_prefix": "+1999"},
            action="forward",
            action_config={"forward_to": "+18889990000"},
            is_active=True,
        )
        session.add(rule)
        await session.flush()

        router = CallRouter(session)
        # Caller with VIP prefix → matches rule
        decision = await router.route_call(
            organization_id=org.id,
            phone_number=phone,
            caller_phone="+19998887777",
        )
        assert decision.action == "forward"
        assert decision.action_config["forward_to"] == "+18889990000"
        assert decision.rule_id == str(rule.id)

        # Caller without VIP prefix → falls through to default
        decision2 = await router.route_call(
            organization_id=org.id,
            phone_number=phone,
            caller_phone="+1234567890",
        )
        assert decision2.action == "ai"
        assert decision2.reason == "default_strategy"

    @pytest.mark.asyncio
    async def test_business_hours_open(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.call_router import CallRouter

        # Create a 9-5 Mon-Fri schedule
        schedule = BusinessHoursSchedule(
            organization_id=str(org.id),
            name="Business Hours",
            timezone="UTC",
            weekly_schedule={
                "monday":    {"enabled": True,  "start": "09:00", "end": "17:00"},
                "tuesday":   {"enabled": True,  "start": "09:00", "end": "17:00"},
                "wednesday": {"enabled": True,  "start": "09:00", "end": "17:00"},
                "thursday":  {"enabled": True,  "start": "09:00", "end": "17:00"},
                "friday":    {"enabled": True,  "start": "09:00", "end": "17:00"},
                "saturday":  {"enabled": False, "start": "00:00", "end": "00:00"},
                "sunday":    {"enabled": False, "start": "00:00", "end": "00:00"},
            },
            holidays=[],
            after_hours_strategy="voicemail",
            is_active=True,
            is_default=True,
        )
        session.add(schedule)
        await session.flush()

        phone = PhoneNumber(
            organization_id=str(org.id),
            number="+1234567890",
            display_name="Main",
            routing_strategy="ai",
            business_hours_id=str(schedule.id),
            is_active=True,
        )
        session.add(phone)
        await session.flush()

        # Tuesday 10:00 UTC → business hours open
        from datetime import timedelta

        tuesday_morning = datetime(2024, 1, 9, 10, 0, 0, tzinfo=UTC)  # Tuesday
        router = CallRouter(session)
        decision = await router.route_call(
            organization_id=org.id,
            phone_number=phone,
            caller_phone="+1234567890",
            now=tuesday_morning,
        )
        # No rules → default strategy (ai)
        assert decision.action == "ai"

        # Create a rule: after hours → voicemail
        rule = RoutingRule(
            organization_id=str(org.id),
            name="After Hours Voicemail",
            priority=10,
            conditions={"business_hours_open": False},
            action="voicemail",
            action_config={"max_duration": 120},
            is_active=True,
        )
        session.add(rule)
        await session.flush()

        # Tuesday 22:00 UTC → after hours → voicemail rule matches
        tuesday_night = datetime(2024, 1, 9, 22, 0, 0, tzinfo=UTC)
        decision2 = await router.route_call(
            organization_id=org.id,
            phone_number=phone,
            caller_phone="+1234567890",
            now=tuesday_night,
        )
        assert decision2.action == "voicemail"

    @pytest.mark.asyncio
    async def test_rule_priority_ordering(self, test_db, reset_telephony_singletons):
        """Lower priority value = evaluated first."""
        session, org, org2, user, user2 = test_db
        from app.telephony.call_router import CallRouter

        phone = PhoneNumber(
            organization_id=str(org.id),
            number="+1234567890",
            display_name="Main",
            routing_strategy="ai",
            is_active=True,
        )
        session.add(phone)
        await session.flush()

        # Two rules that both match; lower priority wins
        rule1 = RoutingRule(
            organization_id=str(org.id),
            name="Priority 50 - Forward",
            priority=50,
            conditions={"caller_phone_prefix": "+"},
            action="forward",
            action_config={"forward_to": "+1111"},
            is_active=True,
        )
        rule2 = RoutingRule(
            organization_id=str(org.id),
            name="Priority 10 - Voicemail",
            priority=10,
            conditions={"caller_phone_prefix": "+"},
            action="voicemail",
            action_config={"max_duration": 60},
            is_active=True,
        )
        session.add(rule1)
        session.add(rule2)
        await session.flush()

        router = CallRouter(session)
        decision = await router.route_call(
            organization_id=org.id,
            phone_number=phone,
            caller_phone="+1234567890",
        )
        # Priority 10 rule wins
        assert decision.action == "voicemail"
        assert decision.rule_id == str(rule2.id)


# ====================================================================
# 5. TELEPHONY SERVICE TESTS
# ====================================================================


@pytest.mark.integration
class TestTelephonyService:
    """Tests for the TelephonyService (phone numbers, sessions, recordings)."""

    @pytest.mark.asyncio
    async def test_register_phone_number(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.service import TelephonyService

        svc = TelephonyService(session, provider=MagicMock())
        phone = await svc.register_phone_number(
            organization_id=org.id,
            number="+1234567890",
            display_name="Sales Line",
            routing_strategy="ai",
        )
        await session.commit()
        assert phone.id is not None
        assert phone.organization_id == str(org.id)
        assert phone.is_active is True

    @pytest.mark.asyncio
    async def test_register_phone_number_invalid_format(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import ValidationError
        from app.telephony.service import TelephonyService

        svc = TelephonyService(session, provider=MagicMock())
        with pytest.raises(ValidationError):
            await svc.register_phone_number(
                organization_id=org.id,
                number="1234567890",  # missing +
            )

    @pytest.mark.asyncio
    async def test_register_phone_number_duplicate(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import ValidationError
        from app.telephony.service import TelephonyService

        svc = TelephonyService(session, provider=MagicMock())
        await svc.register_phone_number(
            organization_id=org.id, number="+1234567890"
        )
        await session.commit()
        # Same number (even different org) → duplicate
        with pytest.raises(ValidationError):
            await svc.register_phone_number(
                organization_id=org2.id, number="+1234567890"
            )

    @pytest.mark.asyncio
    async def test_list_phone_numbers_tenant_isolated(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.service import TelephonyService

        svc = TelephonyService(session, provider=MagicMock())
        await svc.register_phone_number(
            organization_id=org.id, number="+1111111111"
        )
        await svc.register_phone_number(
            organization_id=org2.id, number="+2222222222"
        )
        await session.commit()

        org1_phones = await svc.list_phone_numbers(organization_id=org.id)
        org2_phones = await svc.list_phone_numbers(organization_id=org2.id)
        assert len(org1_phones) == 1
        assert len(org2_phones) == 1
        assert org1_phones[0].number == "+1111111111"
        assert org2_phones[0].number == "+2222222222"

    @pytest.mark.asyncio
    async def test_create_routing_rule(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.service import TelephonyService

        svc = TelephonyService(session, provider=MagicMock())
        rule = await svc.create_routing_rule(
            organization_id=org.id,
            name="VIP Forward",
            action="forward",
            conditions={"caller_phone_prefix": "+1999"},
            action_config={"forward_to": "+18889990000"},
            priority=10,
        )
        await session.commit()
        assert rule.id is not None
        assert rule.action == "forward"
        assert rule.priority == 10

    @pytest.mark.asyncio
    async def test_create_routing_rule_invalid_action(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import ValidationError
        from app.telephony.service import TelephonyService

        svc = TelephonyService(session, provider=MagicMock())
        with pytest.raises(ValidationError):
            await svc.create_routing_rule(
                organization_id=org.id,
                name="Bad Rule",
                action="invalid_action",
            )

    @pytest.mark.asyncio
    async def test_create_business_hours(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.service import TelephonyService

        svc = TelephonyService(session, provider=MagicMock())
        schedule = await svc.create_business_hours(
            organization_id=org.id,
            name="Business Hours",
            timezone="America/New_York",
            weekly_schedule={
                "monday": {"enabled": True, "start": "09:00", "end": "17:00"}
            },
        )
        await session.commit()
        assert schedule.id is not None
        assert schedule.timezone == "America/New_York"
        assert schedule.is_default is True  # first schedule = default

    @pytest.mark.asyncio
    async def test_get_settings_creates_defaults(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.service import TelephonyService

        svc = TelephonyService(session, provider=MagicMock())
        s = await svc.get_settings(organization_id=org.id)
        await session.commit()
        assert s.organization_id == str(org.id)
        assert s.provider == settings.TELEPHONY_PROVIDER


# ====================================================================
# 6. WEBHOOK PROCESSING TESTS
# ====================================================================


@pytest.mark.integration
class TestTelephonyWebhook:
    """Tests for inbound webhook processing."""

    @pytest.mark.asyncio
    async def test_inbound_call_invalid_signature(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.service import TelephonyService

        mock_provider = MagicMock()
        mock_provider.name = "twilio"
        mock_provider.verify_webhook_signature.return_value = False

        svc = TelephonyService(session, provider=mock_provider)
        result = await svc.process_inbound_call(
            body=b"CallSid=CA123&From=%2B1234&To=%2B5678",
            headers={},
            webhook_url="https://example.com/webhook",
        )
        assert result["status"] == "error"
        assert "Invalid signature" in result["error"]

    @pytest.mark.asyncio
    async def test_inbound_call_unknown_number(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.providers.models import CallDirection, ProviderInboundCall
        from app.telephony.service import TelephonyService

        mock_provider = MagicMock()
        mock_provider.name = "twilio"
        mock_provider.verify_webhook_signature.return_value = True
        mock_provider.parse_inbound_call.return_value = ProviderInboundCall(
            call_sid="CA123",
            from_number="+1234567890",
            to_number="+19999999999",  # not registered
            direction=CallDirection.INBOUND,
        )
        mock_provider.generate_hangup_twiml.return_value = "<Hangup/>"

        svc = TelephonyService(session, provider=mock_provider)
        result = await svc.process_inbound_call(
            body=b"CallSid=CA123",
            headers={},
            webhook_url="https://example.com/webhook",
        )
        assert result["status"] == "error"
        assert "not registered" in result["error"]

    @pytest.mark.asyncio
    async def test_inbound_call_routes_to_ai(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.providers.models import CallDirection, ProviderInboundCall
        from app.telephony.service import TelephonyService

        # Register a phone number first
        phone = PhoneNumber(
            organization_id=str(org.id),
            number="+1987654321",
            display_name="Main",
            routing_strategy="ai",
            is_active=True,
        )
        session.add(phone)
        await session.commit()

        mock_provider = MagicMock()
        mock_provider.name = "twilio"
        mock_provider.verify_webhook_signature.return_value = True
        mock_provider.parse_inbound_call.return_value = ProviderInboundCall(
            call_sid="CA123",
            from_number="+1234567890",
            to_number="+1987654321",
            direction=CallDirection.INBOUND,
        )
        mock_provider.generate_connect_twiml.return_value = "<Response><Connect><Stream/></Connect></Response>"

        svc = TelephonyService(session, provider=mock_provider)
        result = await svc.process_inbound_call(
            body=b"CallSid=CA123",
            headers={},
            webhook_url="https://example.com/webhook",
        )
        await session.commit()
        assert result["status"] == "ok"
        assert result["routing_decision"] == "ai"
        assert "session_id" in result
        assert "twiml" in result

        # Verify session was created
        from sqlalchemy import select as sel

        sess_result = await session.execute(
            sel(TelephonyCallSession).where(
                TelephonyCallSession.call_sid == "CA123"
            )
        )
        call_session = sess_result.scalar_one()
        assert call_session.status == "ringing"
        assert call_session.from_number == "+1234567890"

    @pytest.mark.asyncio
    async def test_status_callback_completes_session(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.providers.models import (
            ProviderCallStatus,
            TelephonyEvent,
            TelephonyEventType,
        )
        from app.telephony.service import TelephonyService

        # Create a session first
        call_session = TelephonyCallSession(
            organization_id=str(org.id),
            provider="twilio",
            call_sid="CA456",
            direction="inbound",
            from_number="+1234",
            to_number="+5678",
            status="in_progress",
            started_at=datetime.now(UTC),
        )
        session.add(call_session)
        await session.commit()

        mock_provider = MagicMock()
        mock_provider.name = "twilio"
        mock_provider.verify_webhook_signature.return_value = True
        mock_provider.parse_status_callback.return_value = TelephonyEvent(
            event_type=TelephonyEventType.CALL_COMPLETED,
            call_sid="CA456",
            payload={"duration_seconds": 120, "hangup_cause": "caller-hangup"},
        )

        svc = TelephonyService(session, provider=mock_provider)
        result = await svc.process_status_callback(
            body=b"CallSid=CA456&CallStatus=completed",
            headers={},
            webhook_url="https://example.com/status",
        )
        await session.commit()
        assert result["status"] == "ok"

        # Verify session was updated
        await session.refresh(call_session)
        assert call_session.status == "completed"
        assert call_session.ended_at is not None
        assert call_session.hangup_cause == "caller-hangup"

        # Verify call log was created
        from sqlalchemy import select as sel

        log_result = await session.execute(
            sel(TelephonyCallLog).where(TelephonyCallLog.session_id == str(call_session.id))
        )
        log = log_result.scalar_one_or_none()
        assert log is not None
        assert log.duration_seconds >= 0

    @pytest.mark.asyncio
    async def test_recording_callback_stores_recording(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.providers.models import TelephonyEvent, TelephonyEventType
        from app.telephony.service import TelephonyService

        # Create a session
        call_session = TelephonyCallSession(
            organization_id=str(org.id),
            provider="twilio",
            call_sid="CA789",
            direction="inbound",
            from_number="+1234",
            to_number="+5678",
            status="in_progress",
            started_at=datetime.now(UTC),
        )
        session.add(call_session)
        await session.commit()

        mock_provider = MagicMock()
        mock_provider.name = "twilio"
        mock_provider.verify_webhook_signature.return_value = True
        mock_provider.parse_recording_callback.return_value = TelephonyEvent(
            event_type=TelephonyEventType.RECORDING_COMPLETED,
            call_sid="CA789",
            payload={
                "recording_sid": "RE123",
                "url": "https://api.twilio.com/recordings/RE123",
                "duration_seconds": 90,
                "channels": 2,
                "format": "mp3",
                "status": "completed",
            },
        )

        svc = TelephonyService(session, provider=mock_provider)
        result = await svc.process_recording_callback(
            body=b"CallSid=CA789&RecordingSid=RE123",
            headers={},
            webhook_url="https://example.com/recording",
        )
        await session.commit()
        assert result["status"] == "ok"
        assert "recording_id" in result

        # Verify recording was stored
        from sqlalchemy import select as sel

        rec_result = await session.execute(
            sel(CallRecording).where(CallRecording.recording_sid == "RE123")
        )
        recording = rec_result.scalar_one()
        assert recording.url == "https://api.twilio.com/recordings/RE123"
        assert recording.duration_seconds == 90


# ====================================================================
# 7. TENANT ISOLATION TESTS
# ====================================================================


@pytest.mark.integration
class TestTelephonyTenantIsolation:
    """Cross-tenant access must be blocked at every layer."""

    @pytest.mark.asyncio
    async def test_get_phone_number_cross_tenant_blocked(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import NotFoundError
        from app.telephony.service import TelephonyService

        svc = TelephonyService(session, provider=MagicMock())
        phone = await svc.register_phone_number(
            organization_id=org.id, number="+1111111111"
        )
        await session.commit()

        with pytest.raises(NotFoundError):
            await svc.get_phone_number(
                organization_id=org2.id, phone_number_id=phone.id
            )

    @pytest.mark.asyncio
    async def test_get_session_cross_tenant_blocked(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.core.exceptions import NotFoundError
        from app.telephony.service import TelephonyService

        call_session = TelephonyCallSession(
            organization_id=str(org.id),
            provider="twilio",
            call_sid="CA_iso",
            direction="inbound",
            from_number="+1234",
            to_number="+5678",
            status="completed",
        )
        session.add(call_session)
        await session.commit()

        svc = TelephonyService(session, provider=MagicMock())
        with pytest.raises(NotFoundError):
            await svc.get_session(
                organization_id=org2.id, session_id=call_session.id
            )


# ====================================================================
# 8. ANALYTICS TESTS
# ====================================================================


@pytest.mark.integration
class TestTelephonyAnalytics:
    """Tests for analytics aggregation."""

    @pytest.mark.asyncio
    async def test_get_analytics_summary(self, test_db, reset_telephony_singletons):
        session, org, org2, user, user2 = test_db
        from app.telephony.service import TelephonyService

        now = datetime.now(UTC)
        # Create some call logs
        for i in range(3):
            call_session = TelephonyCallSession(
                organization_id=str(org.id),
                provider="twilio",
                call_sid=f"CA_analytics_{i}",
                direction="inbound",
                from_number="+1234",
                to_number="+5678",
                status="completed",
                started_at=now,
            )
            session.add(call_session)
            await session.flush()
            log = TelephonyCallLog(
                organization_id=str(org.id),
                session_id=str(call_session.id),
                call_sid=f"CA_analytics_{i}",
                provider="twilio",
                direction="inbound",
                from_number="+1234",
                to_number="+5678",
                status="completed",
                outcome="resolved" if i < 2 else "missed",
                duration_seconds=120 if i < 2 else 0,
                ai_handled=True if i < 2 else False,
                ai_resolution=True if i == 0 else False,
                started_at=now,
            )
            session.add(log)
        await session.commit()

        svc = TelephonyService(session, provider=MagicMock())
        summary = await svc.get_analytics_summary(organization_id=org.id, days=30)
        assert summary["total_calls"] == 3
        assert summary["outcomes"]["resolved"] == 2
        assert summary["outcomes"]["missed"] == 1
        assert summary["ai_handled"] == 2

"""Tests for Phase 5 Omnichannel Platform — conversations, calls, WhatsApp, handoff."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_password

# Import all models
from app.models.ai import *  # noqa: F401, F403
from app.models.customer import Customer  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.omnichannel import *  # noqa: F401, F403
from app.models.organization import Organization, UserOrganization
from app.models.product import Product  # noqa: F401
from app.models.ticket import Ticket  # noqa: F401
from app.models.user import User


@pytest_asyncio.fixture
async def test_db():
    """Create in-memory SQLite DB for testing."""
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

        user = User(
            email="admin@test.com",
            full_name="Admin",
            hashed_password=hash_password("pass123!"),
            is_active=True,
            is_email_verified=True,
        )
        session.add(user)
        await session.flush()

        membership = UserOrganization(
            user_id=str(user.id),
            organization_id=str(org.id),
            role="org_owner",
            is_active=True,
        )
        session.add(membership)
        await session.commit()
        yield session, org, user

    await engine.dispose()


@pytest.mark.integration
class TestConversationManagement:
    """Tests for conversation management."""

    @pytest.mark.asyncio
    async def test_create_conversation(self, test_db):
        """Should create a channel conversation."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        conv = await svc.create_conversation(
            organization_id=org.id,
            channel="voice",
            caller_phone="+91-98765-43210",
            caller_name="John Doe",
            language="en",
        )
        assert conv.id is not None
        assert conv.channel == "voice"
        assert conv.status == "active"

    @pytest.mark.asyncio
    async def test_end_conversation(self, test_db):
        """Should end a conversation with outcome."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        conv = await svc.create_conversation(
            organization_id=org.id,
            channel="web_chat",
        )
        ended = await svc.end_conversation(conv.id, outcome="resolved", satisfaction_score=5)
        assert ended.status == "completed"
        assert ended.outcome == "resolved"
        assert ended.satisfaction_score == 5

    @pytest.mark.asyncio
    async def test_list_conversations_by_channel(self, test_db):
        """Should filter conversations by channel."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        await svc.create_conversation(organization_id=org.id, channel="voice")
        await svc.create_conversation(organization_id=org.id, channel="whatsapp")
        await svc.create_conversation(organization_id=org.id, channel="voice")

        voice_convs = await svc.list_conversations(org.id, channel="voice")
        assert len(voice_convs) == 2

        wa_convs = await svc.list_conversations(org.id, channel="whatsapp")
        assert len(wa_convs) == 1


@pytest.mark.integration
class TestVoiceAI:
    """Tests for voice call logging."""

    @pytest.mark.asyncio
    async def test_log_call(self, test_db):
        """Should create a call log."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        call = await svc.log_call(
            organization_id=org.id,
            call_sid="CA1234567890",
            from_number="+91-98765-43210",
            to_number="+91-11-1234-5678",
            direction="inbound",
        )
        assert call.id is not None
        assert call.call_sid == "CA1234567890"
        assert call.status == "ringing"

    @pytest.mark.asyncio
    async def test_update_call_status(self, test_db):
        """Should update call status."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        call = await svc.log_call(
            organization_id=org.id,
            call_sid="CA9876543210",
            from_number="+91-98765-43210",
            to_number="+91-11-1234-5678",
        )
        updated = await svc.update_call("CA9876543210", status="answered")
        assert updated.status == "answered"

    @pytest.mark.asyncio
    async def test_list_calls(self, test_db):
        """Should list call logs."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        await svc.log_call(
            organization_id=org.id,
            call_sid="CA111",
            from_number="+91-1",
            to_number="+91-2",
        )
        await svc.log_call(
            organization_id=org.id,
            call_sid="CA222",
            from_number="+91-3",
            to_number="+91-4",
        )
        calls = await svc.list_calls(org.id)
        assert len(calls) == 2


@pytest.mark.integration
class TestWhatsApp:
    """Tests for WhatsApp message logging."""

    @pytest.mark.asyncio
    async def test_log_whatsapp_message(self, test_db):
        """Should log a WhatsApp message."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        msg = await svc.log_whatsapp_message(
            organization_id=org.id,
            wa_message_id="wamid.12345",
            direction="inbound",
            from_number="+91-98765-43210",
            to_number="+91-11-1234",
            text="Hello, I need help",
        )
        assert msg.id is not None
        assert msg.direction == "inbound"
        assert msg.text == "Hello, I need help"


@pytest.mark.integration
class TestLiveAgentHandoff:
    """Tests for live agent handoff."""

    @pytest.mark.asyncio
    async def test_request_handoff(self, test_db):
        """Should create a handoff request."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        conv = await svc.create_conversation(organization_id=org.id, channel="voice")
        handoff = await svc.request_handoff(
            organization_id=org.id,
            channel_conversation_id=conv.id,
            channel="voice",
            reason="low_confidence",
            ai_summary="Customer asked about complex return policy",
            ai_confidence=0.35,
        )
        assert handoff.id is not None
        assert handoff.status == "pending"
        assert handoff.queue_position == 1

    @pytest.mark.asyncio
    async def test_assign_handoff(self, test_db):
        """Should assign a handoff to an agent."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        conv = await svc.create_conversation(organization_id=org.id, channel="whatsapp")
        handoff = await svc.request_handoff(
            organization_id=org.id,
            channel_conversation_id=conv.id,
            channel="whatsapp",
            reason="explicit_request",
        )
        assigned = await svc.assign_handoff(handoff.id, user.id)
        assert assigned.status == "active"
        assert assigned.assigned_to == str(user.id)

    @pytest.mark.asyncio
    async def test_complete_handoff(self, test_db):
        """Should complete a handoff."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        conv = await svc.create_conversation(organization_id=org.id, channel="web_chat")
        handoff = await svc.request_handoff(
            organization_id=org.id,
            channel_conversation_id=conv.id,
            channel="web_chat",
            reason="complaint",
        )
        await svc.assign_handoff(handoff.id, user.id)
        completed = await svc.complete_handoff(
            handoff.id,
            resolution="Issue resolved by issuing refund",
            satisfaction_score=4,
        )
        assert completed.status == "completed"
        assert completed.satisfaction_score == 4

    @pytest.mark.asyncio
    async def test_queue_position_increments(self, test_db):
        """Should increment queue position for each pending request."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        conv1 = await svc.create_conversation(organization_id=org.id, channel="voice")
        conv2 = await svc.create_conversation(organization_id=org.id, channel="voice")

        h1 = await svc.request_handoff(
            organization_id=org.id,
            channel_conversation_id=conv1.id,
            channel="voice",
            reason="test",
        )
        h2 = await svc.request_handoff(
            organization_id=org.id,
            channel_conversation_id=conv2.id,
            channel="voice",
            reason="test",
        )
        assert h1.queue_position == 1
        assert h2.queue_position == 2


@pytest.mark.integration
class TestOmnichannelDashboard:
    """Tests for omnichannel dashboard analytics."""

    @pytest.mark.asyncio
    async def test_dashboard_summary(self, test_db):
        """Should return dashboard summary with live data."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)

        # Create conversations across channels
        await svc.create_conversation(organization_id=org.id, channel="voice")
        await svc.create_conversation(organization_id=org.id, channel="whatsapp")
        await svc.create_conversation(organization_id=org.id, channel="web_chat")
        await svc.create_conversation(organization_id=org.id, channel="email")

        # Log a call
        await svc.log_call(
            organization_id=org.id,
            call_sid="CA-DASH-001",
            from_number="+91-1",
            to_number="+91-2",
        )

        summary = await svc.get_dashboard_summary(org.id)

        assert summary["total_conversations"] == 4
        assert summary["channels"]["voice"] == 1
        assert summary["channels"]["whatsapp"] == 1
        assert summary["channels"]["web_chat"] == 1
        assert summary["channels"]["email"] == 1
        assert summary["total_calls"] == 1
        assert summary["active_conversations"] == 4

    @pytest.mark.asyncio
    async def test_dashboard_with_empty_org(self, test_db):
        """Should return zeros for empty organization."""
        session, org, user = test_db
        from app.omnichannel.service import OmnichannelService

        svc = OmnichannelService(session)
        summary = await svc.get_dashboard_summary(org.id)

        assert summary["total_conversations"] == 0
        assert summary["active_conversations"] == 0
        assert summary["ai_resolution_rate"] == 0.0

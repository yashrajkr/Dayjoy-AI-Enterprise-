"""Tests for the Enterprise Notification Platform.

Stage 2 Step 6 — tests cover:
- Email providers (Resend mock, SendGrid mock, Log provider)
- SMS providers (Twilio mock, Log provider)
- Push providers (FCM mock, Log provider)
- Template engine (Jinja2 rendering, variable substitution, branding wrapper)
- Notification service (email, SMS, push, in-app, bulk, templates, branding, preferences, analytics)
- Tenant isolation
"""

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
from app.models import *  # noqa: F401, F403
from app.models.notification import (
    Notification,
    NotificationBranding,
    NotificationLog,
    NotificationPreference,
    NotificationTemplate,
)
from app.models.organization import Organization, UserOrganization
from app.models.user import User


# ===== Fixtures =====


@pytest_asyncio.fixture
async def test_db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
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

        session.add(UserOrganization(
            user_id=str(user.id), organization_id=str(org.id),
            role="org_owner", is_active=True,
        ))
        await session.commit()
        yield session, org, org2, user

    await engine.dispose()


# ====================================================================
# 1. PROVIDER TESTS
# ====================================================================


@pytest.mark.unit
class TestEmailProviders:
    def test_resend_provider_name(self):
        from app.notifications.providers.email_providers import ResendProvider
        assert ResendProvider().name == "resend"

    def test_resend_provider_not_available_without_key(self):
        from app.notifications.providers.email_providers import ResendProvider
        p = ResendProvider(api_key="")
        assert p.is_available() is False

    def test_sendgrid_provider_name(self):
        from app.notifications.providers.email_providers import SendGridProvider
        assert SendGridProvider().name == "sendgrid"

    def test_log_email_provider_always_available(self):
        from app.notifications.providers.email_providers import LogEmailProvider
        p = LogEmailProvider()
        assert p.is_available() is True

    @pytest.mark.asyncio
    async def test_log_email_provider_send(self):
        from app.notifications.providers.email_providers import LogEmailProvider
        p = LogEmailProvider()
        result = await p.send(to="test@example.com", subject="Test", html="<p>Hi</p>")
        assert result.success is True
        assert result.provider == "log"

    def test_get_email_provider_log(self):
        from app.notifications.providers.email_providers import get_email_provider, LogEmailProvider
        p = get_email_provider("log")
        assert isinstance(p, LogEmailProvider)


@pytest.mark.unit
class TestSMSProviders:
    def test_twilio_provider_name(self):
        from app.notifications.providers.sms_providers import TwilioSMSProvider
        assert TwilioSMSProvider().name == "twilio"

    def test_twilio_not_available_without_credentials(self):
        from app.notifications.providers.sms_providers import TwilioSMSProvider
        p = TwilioSMSProvider(account_sid="", auth_token="")
        assert p.is_available() is False

    @pytest.mark.asyncio
    async def test_log_sms_provider_send(self):
        from app.notifications.providers.sms_providers import LogSMSProvider
        p = LogSMSProvider()
        result = await p.send(to="+1234567890", body="Test SMS")
        assert result.success is True

    def test_get_sms_provider_log(self):
        from app.notifications.providers.sms_providers import get_sms_provider, LogSMSProvider
        p = get_sms_provider("log")
        assert isinstance(p, LogSMSProvider)


@pytest.mark.unit
class TestPushProviders:
    def test_fcm_provider_name(self):
        from app.notifications.providers.push_providers import FCMProvider
        assert FCMProvider().name == "fcm"

    def test_fcm_not_available_without_config(self):
        from app.notifications.providers.push_providers import FCMProvider
        p = FCMProvider(server_key="", project_id="")
        assert p.is_available() is False

    @pytest.mark.asyncio
    async def test_log_push_provider_send(self):
        from app.notifications.providers.push_providers import LogPushProvider
        p = LogPushProvider()
        result = await p.send(token="device_token_123", title="Test", body="Push body")
        assert result.success is True


# ====================================================================
# 2. TEMPLATE ENGINE TESTS
# ====================================================================


@pytest.mark.unit
class TestTemplateEngine:
    def test_render_basic(self):
        from app.notifications.template_engine import TemplateEngine
        engine = TemplateEngine()
        result = engine.render("Hello {{ name }}!", {"name": "John"})
        assert result == "Hello John!"

    def test_render_no_variables(self):
        from app.notifications.template_engine import TemplateEngine
        engine = TemplateEngine()
        result = engine.render("Hello World!", {})
        assert result == "Hello World!"

    def test_render_multiple_variables(self):
        from app.notifications.template_engine import TemplateEngine
        engine = TemplateEngine()
        result = engine.render(
            "Hello {{ name }}, your order {{ order_id }} is ready.",
            {"name": "John", "order_id": "12345"},
        )
        assert "Hello John" in result
        assert "12345" in result

    def test_render_email(self):
        from app.notifications.template_engine import TemplateEngine
        engine = TemplateEngine()
        result = engine.render_email(
            subject_template="Welcome {{ name }}!",
            html_template="<h1>Welcome {{ name }}</h1><p>Your account is ready.</p>",
            text_template="Welcome {{ name }}! Your account is ready.",
            variables={"name": "Alice"},
        )
        assert result["subject"] == "Welcome Alice!"
        assert "Welcome Alice" in result["html"]
        assert "Welcome Alice" in result["text"]

    def test_render_email_with_branding(self):
        from app.notifications.template_engine import TemplateEngine
        engine = TemplateEngine()
        branding_html = "<div class='wrapper'>{{ content }}</div>"
        result = engine.render_email(
            html_template="<p>Body</p>",
            variables={},
            branding_html=branding_html,
            apply_branding=True,
        )
        assert "wrapper" in result["html"]
        assert "<p>Body</p>" in result["html"]

    def test_render_sms(self):
        from app.notifications.template_engine import TemplateEngine
        engine = TemplateEngine()
        result = engine.render_sms(
            "Your OTP is {{ otp }}. Valid for 5 minutes.",
            {"otp": "123456"},
        )
        assert "123456" in result

    def test_render_push(self):
        from app.notifications.template_engine import TemplateEngine
        engine = TemplateEngine()
        result = engine.render_push(
            title_template="New message from {{ sender }}",
            body_template="You have a new message: {{ preview }}",
            variables={"sender": "John", "preview": "Hello!"},
        )
        assert result["title"] == "New message from John"
        assert "Hello!" in result["body"]

    def test_extract_variables(self):
        from app.notifications.template_engine import TemplateEngine
        vars = TemplateEngine.extract_variables("Hello {{ name }}, order {{ id }}")
        assert "name" in vars
        assert "id" in vars

    def test_sanitize_html_removes_scripts(self):
        from app.notifications.template_engine import TemplateEngine
        html = "<p>Hello</p><script>alert('xss')</script>"
        sanitized = TemplateEngine.sanitize_html(html)
        assert "<script>" not in sanitized
        assert "<p>Hello</p>" in sanitized

    def test_default_email_wrapper(self):
        from app.notifications.template_engine import TemplateEngine
        wrapper = TemplateEngine.default_email_wrapper(company_name="Acme Corp")
        assert "Acme Corp" in wrapper
        assert "{{ content }}" in wrapper


# ====================================================================
# 3. NOTIFICATION SERVICE TESTS
# ====================================================================


@pytest.mark.integration
class TestNotificationService:
    @pytest.mark.asyncio
    async def test_send_email_with_log_provider(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        # Use log provider (no API key needed)
        svc._email_provider = MagicMock()
        svc._email_provider.name = "log"
        svc._email_provider.send = AsyncMock(return_value=MagicMock(
            success=True, message_id="log_123", provider="log", error=None,
            latency_ms=10, raw_response={},
        ))

        notification = await svc.send_email(
            organization_id=org.id,
            to="test@example.com",
            subject="Test Subject",
            html="<p>Hello</p>",
            text="Hello",
            created_by=user.id,
        )
        await session.commit()
        assert notification.id is not None
        assert notification.channel == "email"
        assert notification.status == "sent"
        assert notification.recipient == "test@example.com"

    @pytest.mark.asyncio
    async def test_send_email_invalid_address(self, test_db):
        session, org, org2, user = test_db
        from app.core.exceptions import ValidationError
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        svc._email_provider = MagicMock()
        svc._email_provider.name = "log"

        with pytest.raises(ValidationError):
            await svc.send_email(
                organization_id=org.id,
                to="not-an-email",
                subject="Test",
            )

    @pytest.mark.asyncio
    async def test_send_sms_with_log_provider(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        svc._sms_provider = MagicMock()
        svc._sms_provider.name = "log"
        svc._sms_provider.send = AsyncMock(return_value=MagicMock(
            success=True, message_id="log_sms_123", provider="log", error=None,
            latency_ms=5, raw_response={},
        ))

        notification = await svc.send_sms(
            organization_id=org.id,
            to="+1234567890",
            body="Your OTP is 123456",
            created_by=user.id,
        )
        await session.commit()
        assert notification.channel == "sms"
        assert notification.status == "sent"
        assert "123456" in notification.body_text

    @pytest.mark.asyncio
    async def test_send_push(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        svc._push_provider = MagicMock()
        svc._push_provider.name = "log"
        svc._push_provider.send = AsyncMock(return_value=MagicMock(
            success=True, message_id="log_push_123", provider="log", error=None,
            latency_ms=3, raw_response={},
        ))

        with patch.object(settings, "ENABLE_PUSH_NOTIFICATIONS", True):
            notification = await svc.send_push(
                organization_id=org.id,
                token="device_token_abc",
                title="New Alert",
                body="You have a new message",
                created_by=user.id,
            )
        await session.commit()
        assert notification.channel == "push"
        assert notification.status == "sent"

    @pytest.mark.asyncio
    async def test_send_in_app(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        notification = await svc.send_in_app(
            organization_id=org.id,
            user_id=user.id,
            title="Welcome!",
            body="Your account has been created.",
            notification_type="success",
        )
        await session.commit()
        assert notification.channel == "in_app"
        assert notification.status == "delivered"
        assert notification.recipient == str(user.id)

    @pytest.mark.asyncio
    async def test_create_template(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        template = await svc.create_template(
            organization_id=org.id,
            name="welcome_email",
            channel="email",
            subject="Welcome {{ name }}!",
            body_html="<h1>Welcome {{ name }}</h1>",
            body_text="Welcome {{ name }}",
            created_by=user.id,
        )
        await session.commit()
        assert template.id is not None
        assert template.name == "welcome_email"
        assert template.channel == "email"

    @pytest.mark.asyncio
    async def test_send_email_with_template(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        # Create template first
        await svc.create_template(
            organization_id=org.id,
            name="welcome_email",
            channel="email",
            subject="Welcome {{ name }}!",
            body_html="<h1>Welcome {{ name }}</h1>",
            body_text="Welcome {{ name }}",
        )
        await session.flush()

        # Mock email provider
        svc._email_provider = MagicMock()
        svc._email_provider.name = "log"
        svc._email_provider.send = AsyncMock(return_value=MagicMock(
            success=True, message_id="log_456", provider="log", error=None,
            latency_ms=10, raw_response={},
        ))

        # Send using template
        notification = await svc.send_email(
            organization_id=org.id,
            to="test@example.com",
            template_name="welcome_email",
            variables={"name": "Alice"},
        )
        await session.commit()
        assert notification.status == "sent"
        assert notification.subject == "Welcome Alice!"
        assert "Welcome Alice" in notification.body_html

    @pytest.mark.asyncio
    async def test_get_branding_creates_default(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        branding = await svc.get_branding(organization_id=org.id)
        await session.commit()
        assert branding.id is not None
        assert branding.organization_id == str(org.id)
        assert branding.company_name == "Dayjoy AI"

    @pytest.mark.asyncio
    async def test_update_branding(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        branding = await svc.update_branding(
            organization_id=org.id,
            company_name="Acme Corp",
            primary_color="#ff0000",
            logo_url="https://example.com/logo.png",
        )
        await session.commit()
        assert branding.company_name == "Acme Corp"
        assert branding.primary_color == "#ff0000"
        assert branding.logo_url == "https://example.com/logo.png"

    @pytest.mark.asyncio
    async def test_update_preference(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        pref = await svc.update_preference(
            organization_id=org.id,
            user_id=user.id,
            channel="email",
            template_type="marketing",
            is_subscribed=False,
        )
        await session.commit()
        assert pref.is_subscribed is False
        assert pref.channel == "email"
        assert pref.template_type == "marketing"

    @pytest.mark.asyncio
    async def test_check_preference_default_subscribed(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        # No preference set → default True
        result = await svc.check_preference(
            organization_id=org.id,
            user_id=user.id,
            channel="email",
            template_type="transactional",
        )
        assert result is True

    @pytest.mark.asyncio
    async def test_check_preference_unsubscribed(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        await svc.update_preference(
            organization_id=org.id,
            user_id=user.id,
            channel="email",
            template_type="marketing",
            is_subscribed=False,
        )
        await session.flush()

        result = await svc.check_preference(
            organization_id=org.id,
            user_id=user.id,
            channel="email",
            template_type="marketing",
        )
        assert result is False

    @pytest.mark.asyncio
    async def test_get_analytics_summary(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        svc._email_provider = MagicMock()
        svc._email_provider.name = "log"
        svc._email_provider.send = AsyncMock(return_value=MagicMock(
            success=True, message_id="log_1", provider="log", error=None,
            latency_ms=10, raw_response={},
        ))

        # Send some notifications
        for i in range(5):
            await svc.send_email(
                organization_id=org.id,
                to=f"user{i}@example.com",
                subject=f"Test {i}",
                html=f"<p>Test {i}</p>",
            )
        await session.commit()

        summary = await svc.get_analytics_summary(organization_id=org.id, days=30)
        assert summary["total_notifications"] >= 5
        assert "email" in summary["by_channel"]
        assert summary["by_channel"]["email"] >= 5
        assert summary["by_status"].get("sent", 0) >= 5


# ====================================================================
# 4. TENANT ISOLATION TESTS
# ====================================================================


@pytest.mark.integration
class TestNotificationTenantIsolation:
    @pytest.mark.asyncio
    async def test_templates_tenant_isolated(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        await svc.create_template(
            organization_id=org.id,
            name="org1_template",
            channel="email",
            subject="Org1",
            body_text="Test",
        )
        await svc.create_template(
            organization_id=org2.id,
            name="org2_template",
            channel="email",
            subject="Org2",
            body_text="Test",
        )
        await session.commit()

        org1_templates = await svc.list_templates(organization_id=org.id)
        org2_templates = await svc.list_templates(organization_id=org2.id)
        assert len(org1_templates) == 1
        assert len(org2_templates) == 1
        assert org1_templates[0].name == "org1_template"
        assert org2_templates[0].name == "org2_template"

    @pytest.mark.asyncio
    async def test_branding_tenant_isolated(self, test_db):
        session, org, org2, user = test_db
        from app.notifications.service import NotificationService

        svc = NotificationService(session)
        b1 = await svc.get_branding(organization_id=org.id)
        b2 = await svc.get_branding(organization_id=org2.id)
        await session.commit()
        assert b1.organization_id == str(org.id)
        assert b2.organization_id == str(org2.id)
        assert b1.id != b2.id

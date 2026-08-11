"""Notification Service — centralized notification platform.

Every module sends notifications through this service. Never send emails
or SMS directly from business modules.

Usage:
    from app.notifications import NotificationService

    svc = NotificationService(db)
    await svc.send_email(
        organization_id=org_id,
        to="user@example.com",
        template_name="welcome_email",
        variables={"user_name": "John"},
    )
    await svc.send_sms(
        organization_id=org_id,
        to="+1234567890",
        template_name="otp_sms",
        variables={"otp": "123456"},
    )
"""

import asyncio
import uuid
from datetime import datetime, UTC, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.notification import (
    FileUpload,
    Notification,
    NotificationBranding,
    NotificationChannel,
    NotificationLog,
    NotificationPreference,
    NotificationTemplate,
)
from app.notifications.providers import (
    EmailProvider,
    EmailResult,
    PushProvider,
    PushResult,
    SMSProvider,
    SMSResult,
    get_email_provider,
    get_push_provider,
    get_sms_provider,
)
from app.notifications.template_engine import TemplateEngine

logger = get_logger(__name__)


class NotificationService:
    """Centralized notification service (multi-tenant)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.template_engine = TemplateEngine()
        self._email_provider: EmailProvider | None = None
        self._sms_provider: SMSProvider | None = None
        self._push_provider: PushProvider | None = None

    @property
    def email_provider(self) -> EmailProvider:
        if self._email_provider is None:
            self._email_provider = get_email_provider()
        return self._email_provider

    @property
    def sms_provider(self) -> SMSProvider:
        if self._sms_provider is None:
            self._sms_provider = get_sms_provider()
        return self._sms_provider

    @property
    def push_provider(self) -> PushProvider:
        if self._push_provider is None:
            self._push_provider = get_push_provider()
        return self._push_provider

    # ====================================================================
    # Email
    # ====================================================================

    async def send_email(
        self,
        *,
        organization_id: uuid.UUID,
        to: str,
        subject: str | None = None,
        html: str | None = None,
        text: str | None = None,
        template_name: str | None = None,
        variables: dict[str, Any] | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        reply_to: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
        priority: str = "normal",
        recipient_user_id: uuid.UUID | None = None,
        recipient_name: str | None = None,
        created_by: uuid.UUID | None = None,
    ) -> Notification:
        """Send an email notification.

        Either provide `template_name` (to load from DB) or `subject`/`html`/`text`
        directly. When using a template, `variables` are substituted via Jinja2.
        """
        if not settings.ENABLE_EMAIL:
            logger.warning("email_disabled")
            return await self._create_notification_record(
                organization_id=str(organization_id),
                channel="email",
                recipient=to,
                recipient_user_id=str(recipient_user_id) if recipient_user_id else None,
                recipient_name=recipient_name,
                status="cancelled",
                error_message="Email disabled in config",
            )

        # Load template if specified
        template = None
        if template_name:
            template = await self._get_template(organization_id, template_name, "email")
            variables = variables or {}

        # Render content
        if template:
            branding = await self._get_branding(organization_id)
            branding_html = None
            if template.apply_branding and branding:
                branding_html = branding.email_wrapper_html or self.template_engine.default_email_wrapper(
                    company_name=branding.company_name,
                    logo_url=branding.logo_url,
                    primary_color=branding.primary_color,
                    background_color=branding.background_color,
                    text_color=branding.text_color,
                    footer_text=branding.footer_text,
                )
            rendered = self.template_engine.render_email(
                subject_template=subject or template.subject,
                html_template=html or template.body_html,
                text_template=text or template.body_text,
                variables=variables,
                branding_html=branding_html,
                apply_branding=template.apply_branding,
            )
            subject = rendered["subject"]
            html = rendered["html"]
            text = rendered["text"]
        else:
            # Direct send — optionally apply branding
            branding = await self._get_branding(organization_id)
            if branding and branding.email_wrapper_html:
                try:
                    from jinja2 import Environment, BaseLoader
                    env = Environment(loader=BaseLoader(), autoescape=True)
                    tmpl = env.from_string(branding.email_wrapper_html)
                    html = tmpl.render(content=html or "", **(variables or {}))
                except Exception:
                    pass

        # Validate recipient
        if not to or "@" not in to:
            raise ValidationError(f"Invalid email address: {to!r}")

        # Create notification record
        notification = await self._create_notification_record(
            organization_id=str(organization_id),
            channel="email",
            recipient=to,
            recipient_user_id=str(recipient_user_id) if recipient_user_id else None,
            recipient_name=recipient_name,
            subject=subject,
            body_html=html,
            body_text=text,
            variables=variables or {},
            attachments=attachments or [],
            priority=priority,
            status="sending",
            template_id=str(template.id) if template else None,
            template_name=template_name,
            provider=self.email_provider.name,
            created_by=str(created_by) if created_by else None,
        )

        # Send via provider
        result = await self.email_provider.send(
            to=to,
            subject=subject or "",
            html=html,
            text=text,
            from_email=from_email or settings.DEFAULT_FROM_EMAIL,
            from_name=from_name or settings.DEFAULT_FROM_NAME,
            reply_to=reply_to,
            attachments=attachments,
        )

        # Update notification
        await self._update_notification_after_send(notification, result)

        # Log the attempt
        await self._create_log(notification, result)

        return notification

    # ====================================================================
    # SMS
    # ====================================================================

    async def send_sms(
        self,
        *,
        organization_id: uuid.UUID,
        to: str,
        body: str | None = None,
        template_name: str | None = None,
        variables: dict[str, Any] | None = None,
        from_number: str | None = None,
        sender_id: str | None = None,
        priority: str = "normal",
        recipient_user_id: uuid.UUID | None = None,
        recipient_name: str | None = None,
        created_by: uuid.UUID | None = None,
    ) -> Notification:
        """Send an SMS notification."""
        if not settings.ENABLE_SMS:
            logger.warning("sms_disabled")
            return await self._create_notification_record(
                organization_id=str(organization_id),
                channel="sms",
                recipient=to,
                recipient_user_id=str(recipient_user_id) if recipient_user_id else None,
                recipient_name=recipient_name,
                status="cancelled",
                error_message="SMS disabled in config",
            )

        # Load template if specified
        template = None
        if template_name:
            template = await self._get_template(organization_id, template_name, "sms")
            variables = variables or {}

        # Render content
        if template:
            body = self.template_engine.render_sms(
                template.body_text or "", variables
            )
            # Append opt-out text
            branding = await self._get_branding(organization_id)
            if branding and branding.sms_opt_out_text:
                body = f"{body}\n\n{branding.sms_opt_out_text}"
        elif body:
            body = self.template_engine.render_sms(body, variables or {})

        if not body:
            raise ValidationError("SMS body is required (provide body or template_name)")

        # Validate recipient
        if not to or len(to) < 4:
            raise ValidationError(f"Invalid phone number: {to!r}")

        # Create notification record
        notification = await self._create_notification_record(
            organization_id=str(organization_id),
            channel="sms",
            recipient=to,
            recipient_user_id=str(recipient_user_id) if recipient_user_id else None,
            recipient_name=recipient_name,
            body_text=body,
            variables=variables or {},
            priority=priority,
            status="sending",
            template_id=str(template.id) if template else None,
            template_name=template_name,
            provider=self.sms_provider.name,
            created_by=str(created_by) if created_by else None,
        )

        # Send via provider
        result = await self.sms_provider.send(
            to=to,
            body=body,
            from_number=from_number or "",
            sender_id=sender_id or settings.DEFAULT_SMS_SENDER_ID,
        )

        # Update notification
        await self._update_notification_after_send(notification, result)

        # Log the attempt
        await self._create_log(notification, result)

        return notification

    # ====================================================================
    # Push
    # ====================================================================

    async def send_push(
        self,
        *,
        organization_id: uuid.UUID,
        token: str,
        title: str | None = None,
        body: str | None = None,
        template_name: str | None = None,
        variables: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        icon: str | None = None,
        click_action: str | None = None,
        priority: str = "normal",
        recipient_user_id: uuid.UUID | None = None,
        created_by: uuid.UUID | None = None,
    ) -> Notification:
        """Send a push notification."""
        if not settings.ENABLE_PUSH_NOTIFICATIONS:
            logger.warning("push_disabled")
            return await self._create_notification_record(
                organization_id=str(organization_id),
                channel="push",
                recipient=token,
                recipient_user_id=str(recipient_user_id) if recipient_user_id else None,
                status="cancelled",
                error_message="Push disabled in config",
            )

        # Load template if specified
        template = None
        if template_name:
            template = await self._get_template(organization_id, template_name, "push")
            variables = variables or {}

        # Render content
        if template:
            rendered = self.template_engine.render_push(
                title_template=title or template.subject or "",
                body_template=body or template.body_text or "",
                variables=variables,
            )
            title = rendered["title"]
            body = rendered["body"]
        else:
            title = title or ""
            body = body or ""

        # Create notification record
        notification = await self._create_notification_record(
            organization_id=str(organization_id),
            channel="push",
            recipient=token,
            recipient_user_id=str(recipient_user_id) if recipient_user_id else None,
            subject=title,
            body_text=body,
            variables=variables or {},
            priority=priority,
            status="sending",
            template_id=str(template.id) if template else None,
            template_name=template_name,
            provider=self.push_provider.name,
            created_by=str(created_by) if created_by else None,
        )

        # Send via provider
        result = await self.push_provider.send(
            token=token,
            title=title,
            body=body,
            data=data,
            icon=icon,
            click_action=click_action,
        )

        # Update notification
        await self._update_notification_after_send(notification, result)

        # Log the attempt
        await self._create_log(notification, result)

        return notification

    # ====================================================================
    # In-App
    # ====================================================================

    async def send_in_app(
        self,
        *,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        title: str,
        body: str,
        notification_type: str = "info",
        category: str | None = None,
        link: str | None = None,
        data: dict[str, Any] | None = None,
        priority: str = "normal",
        created_by: uuid.UUID | None = None,
    ) -> Notification:
        """Send an in-app notification (stored in DB, shown in notification center)."""
        notification = await self._create_notification_record(
            organization_id=str(organization_id),
            channel="in_app",
            recipient=str(user_id),
            recipient_user_id=str(user_id),
            subject=title,
            body_text=body,
            variables=data or {},
            priority=priority,
            status="delivered",  # In-app is immediately "delivered"
            created_by=str(created_by) if created_by else None,
        )
        # Store extra in-app metadata
        notification.metadata_ = {
            "notification_type": notification_type,
            "category": category,
            "link": link,
            "data": data or {},
        }
        await self.db.flush()
        return notification

    # ====================================================================
    # Bulk send
    # ====================================================================

    async def send_bulk(
        self,
        *,
        organization_id: uuid.UUID,
        channel: str,
        recipients: list[dict[str, Any]],
        template_name: str,
        common_variables: dict[str, Any] | None = None,
        priority: str = "normal",
        created_by: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Send a notification to multiple recipients.

        Args:
            recipients: List of {"to": "email/phone/token", "variables": {...}, "user_id": "..."}
        """
        if len(recipients) > settings.NOTIFICATION_BULK_MAX_RECIPIENTS:
            raise ValidationError(
                f"Bulk send limit is {settings.NOTIFICATION_BULK_MAX_RECIPIENTS} recipients"
            )

        bulk_id = str(uuid.uuid4())
        sent = 0
        failed = 0

        for r in recipients:
            try:
                recipient_vars = {**(common_variables or {}), **(r.get("variables") or {})}
                if channel == "email":
                    await self.send_email(
                        organization_id=organization_id,
                        to=r["to"],
                        template_name=template_name,
                        variables=recipient_vars,
                        priority=priority,
                        recipient_user_id=uuid.UUID(r["user_id"]) if r.get("user_id") else None,
                        recipient_name=r.get("name"),
                        created_by=created_by,
                    )
                elif channel == "sms":
                    await self.send_sms(
                        organization_id=organization_id,
                        to=r["to"],
                        template_name=template_name,
                        variables=recipient_vars,
                        priority=priority,
                        recipient_user_id=uuid.UUID(r["user_id"]) if r.get("user_id") else None,
                        recipient_name=r.get("name"),
                        created_by=created_by,
                    )
                elif channel == "push":
                    await self.send_push(
                        organization_id=organization_id,
                        token=r["to"],
                        template_name=template_name,
                        variables=recipient_vars,
                        priority=priority,
                        recipient_user_id=uuid.UUID(r["user_id"]) if r.get("user_id") else None,
                        created_by=created_by,
                    )
                sent += 1
            except Exception as e:
                logger.warning("bulk_send_recipient_failed", error=str(e), to=r.get("to"))
                failed += 1

        return {"bulk_id": bulk_id, "total": len(recipients), "sent": sent, "failed": failed}

    # ====================================================================
    # Templates CRUD
    # ====================================================================

    async def create_template(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        channel: str,
        subject: str | None = None,
        body_html: str | None = None,
        body_text: str | None = None,
        template_type: str = "transactional",
        language: str = "en",
        variables: dict[str, Any] | None = None,
        apply_branding: bool = True,
        description: str | None = None,
        created_by: uuid.UUID | None = None,
    ) -> NotificationTemplate:
        """Create a notification template."""
        if channel not in ("email", "sms", "push", "in_app"):
            raise ValidationError(f"Invalid channel: {channel}")

        template = NotificationTemplate(
            organization_id=str(organization_id),
            name=name,
            description=description,
            channel=channel,
            template_type=template_type,
            language=language,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            variables=variables or {},
            apply_branding=apply_branding,
            is_active=True,
            created_by=str(created_by) if created_by else None,
        )
        self.db.add(template)
        await self.db.flush()
        return template

    async def list_templates(
        self,
        *,
        organization_id: uuid.UUID,
        channel: str | None = None,
        template_type: str | None = None,
    ) -> list[NotificationTemplate]:
        conditions = [
            NotificationTemplate.organization_id == str(organization_id),
            NotificationTemplate.is_active == True,  # noqa: E712
        ]
        if channel is not None:
            conditions.append(NotificationTemplate.channel == channel)
        if template_type is not None:
            conditions.append(NotificationTemplate.template_type == template_type)
        result = await self.db.execute(
            select(NotificationTemplate)
            .where(*conditions)
            .order_by(NotificationTemplate.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_template(
        self,
        *,
        organization_id: uuid.UUID,
        template_id: uuid.UUID,
    ) -> bool:
        result = await self.db.execute(
            select(NotificationTemplate).where(
                NotificationTemplate.id == template_id,
                NotificationTemplate.organization_id == str(organization_id),
            )
        )
        template = result.scalar_one_or_none()
        if template is None:
            raise NotFoundError(f"Template {template_id} not found")
        template.is_active = False
        await self.db.flush()
        return True

    async def _get_template(
        self,
        organization_id: uuid.UUID,
        name: str,
        channel: str,
    ) -> NotificationTemplate:
        result = await self.db.execute(
            select(NotificationTemplate).where(
                NotificationTemplate.organization_id == str(organization_id),
                NotificationTemplate.name == name,
                NotificationTemplate.channel == channel,
                NotificationTemplate.is_active == True,  # noqa: E712
            )
        )
        template = result.scalar_one_or_none()
        if template is None:
            raise NotFoundError(f"Template {name!r} (channel={channel}) not found")
        return template

    # ====================================================================
    # Branding
    # ====================================================================

    async def get_branding(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> NotificationBranding:
        return await self._get_branding(organization_id)

    async def update_branding(
        self,
        *,
        organization_id: uuid.UUID,
        **kwargs: Any,
    ) -> NotificationBranding:
        branding = await self._get_branding(organization_id)
        for key, value in kwargs.items():
            if hasattr(branding, key) and value is not None:
                setattr(branding, key, value)
        await self.db.flush()
        return branding

    async def _get_branding(
        self,
        organization_id: uuid.UUID,
    ) -> NotificationBranding:
        result = await self.db.execute(
            select(NotificationBranding).where(
                NotificationBranding.organization_id == str(organization_id),
                NotificationBranding.is_active == True,  # noqa: E712
            )
        )
        branding = result.scalar_one_or_none()
        if branding is None:
            # Create default branding
            branding = NotificationBranding(
                organization_id=str(organization_id),
                company_name="Dayjoy AI",
            )
            self.db.add(branding)
            await self.db.flush()
        return branding

    # ====================================================================
    # Preferences
    # ====================================================================

    async def get_preferences(
        self,
        *,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> list[NotificationPreference]:
        result = await self.db.execute(
            select(NotificationPreference).where(
                NotificationPreference.organization_id == str(organization_id),
                NotificationPreference.user_id == str(user_id),
            )
        )
        return list(result.scalars().all())

    async def update_preference(
        self,
        *,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        channel: str,
        template_type: str = "all",
        is_subscribed: bool = True,
        quiet_hours_start: str | None = None,
        quiet_hours_end: str | None = None,
        quiet_hours_timezone: str = "UTC",
        daily_cap: int | None = None,
    ) -> NotificationPreference:
        # Find existing
        result = await self.db.execute(
            select(NotificationPreference).where(
                NotificationPreference.organization_id == str(organization_id),
                NotificationPreference.user_id == str(user_id),
                NotificationPreference.channel == channel,
                NotificationPreference.template_type == template_type,
            )
        )
        pref = result.scalar_one_or_none()
        if pref is None:
            pref = NotificationPreference(
                organization_id=str(organization_id),
                user_id=str(user_id),
                channel=channel,
                template_type=template_type,
                is_subscribed=is_subscribed,
                quiet_hours_timezone=quiet_hours_timezone,
            )
            self.db.add(pref)
        pref.is_subscribed = is_subscribed
        if quiet_hours_start is not None:
            pref.quiet_hours_start = quiet_hours_start
        if quiet_hours_end is not None:
            pref.quiet_hours_end = quiet_hours_end
        pref.quiet_hours_timezone = quiet_hours_timezone
        if daily_cap is not None:
            pref.daily_cap = daily_cap
        await self.db.flush()
        return pref

    async def check_preference(
        self,
        *,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        channel: str,
        template_type: str = "transactional",
    ) -> bool:
        """Check if user is subscribed to this channel+type. Returns True if subscribed."""
        result = await self.db.execute(
            select(NotificationPreference).where(
                NotificationPreference.organization_id == str(organization_id),
                NotificationPreference.user_id == str(user_id),
                NotificationPreference.channel == channel,
                NotificationPreference.template_type.in_([template_type, "all"]),
            )
        )
        prefs = list(result.scalars().all())
        if not prefs:
            return True  # Default: subscribed
        # If any preference says unsubscribed, return False
        return all(p.is_subscribed for p in prefs)

    # ====================================================================
    # History + Analytics
    # ====================================================================

    async def list_notifications(
        self,
        *,
        organization_id: uuid.UUID,
        channel: str | None = None,
        status: str | None = None,
        recipient: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Notification], int]:
        conditions = [
            Notification.organization_id == str(organization_id),
        ]
        if channel is not None:
            conditions.append(Notification.channel == channel)
        if status is not None:
            conditions.append(Notification.status == status)
        if recipient is not None:
            conditions.append(Notification.recipient == recipient)

        count_stmt = select(func.count()).select_from(Notification).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(Notification)
            .where(*conditions)
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_notification_logs(
        self,
        *,
        organization_id: uuid.UUID,
        notification_id: uuid.UUID,
    ) -> list[NotificationLog]:
        result = await self.db.execute(
            select(NotificationLog)
            .where(
                NotificationLog.organization_id == str(organization_id),
                NotificationLog.notification_id == str(notification_id),
            )
            .order_by(NotificationLog.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_analytics_summary(
        self,
        *,
        organization_id: uuid.UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get aggregate notification analytics."""
        cutoff = datetime.now(UTC) - timedelta(days=days)

        # Total per channel
        channel_stmt = (
            select(Notification.channel, func.count())
            .where(
                Notification.organization_id == str(organization_id),
                Notification.created_at >= cutoff,
            )
            .group_by(Notification.channel)
        )
        channel_counts = {
            str(ch): count
            for ch, count in (await self.db.execute(channel_stmt)).all()
        }

        # Status breakdown
        status_stmt = (
            select(Notification.status, func.count())
            .where(
                Notification.organization_id == str(organization_id),
                Notification.created_at >= cutoff,
            )
            .group_by(Notification.status)
        )
        status_counts = {
            str(s) if s else "unknown": count
            for s, count in (await self.db.execute(status_stmt)).all()
        }

        # Retry stats
        retry_stmt = (
            select(func.sum(Notification.retry_count))
            .where(
                Notification.organization_id == str(organization_id),
                Notification.created_at >= cutoff,
            )
        )
        total_retries = (await self.db.execute(retry_stmt)).scalar_one() or 0

        # Failed count
        failed_stmt = (
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.organization_id == str(organization_id),
                Notification.created_at >= cutoff,
                Notification.status == "failed",
            )
        )
        failed = (await self.db.execute(failed_stmt)).scalar_one()

        total = sum(channel_counts.values())

        return {
            "period_days": days,
            "total_notifications": total,
            "by_channel": channel_counts,
            "by_status": status_counts,
            "total_retries": int(total_retries),
            "failed_count": int(failed),
            "failure_rate": (failed / total) if total > 0 else 0.0,
        }

    # ====================================================================
    # Internal helpers
    # ====================================================================

    async def _create_notification_record(
        self,
        **kwargs: Any,
    ) -> Notification:
        """Create a notification record in the DB."""
        # Handle both new columns and legacy columns
        notification = Notification(**kwargs)
        self.db.add(notification)
        await self.db.flush()
        return notification

    async def _update_notification_after_send(
        self,
        notification: Notification,
        result: Any,
    ) -> None:
        """Update notification status after a send attempt."""
        if result.success:
            notification.status = "sent"
            notification.sent_at = datetime.now(UTC)
            notification.provider_message_id = result.message_id
        else:
            notification.status = "failed"
            notification.error_message = result.error
            notification.error_code = result.provider
            notification.retry_count += 1
            if notification.retry_count < notification.max_retries:
                # Schedule retry
                notification.next_retry_at = datetime.now(UTC) + timedelta(
                    seconds=min(
                        settings.NOTIFICATION_RETRY_INITIAL_BACKOFF * (2 ** notification.retry_count),
                        settings.NOTIFICATION_RETRY_MAX_BACKOFF,
                    )
                )
                notification.status = "queued"  # Will be retried
        await self.db.flush()

    async def _create_log(
        self,
        notification: Notification,
        result: Any,
    ) -> None:
        """Create a delivery log entry."""
        log = NotificationLog(
            organization_id=notification.organization_id,
            notification_id=str(notification.id),
            attempt=notification.retry_count + 1,
            status=notification.status,
            provider=result.provider,
            provider_message_id=result.message_id,
            provider_response=result.raw_response,
            error_message=result.error,
            latency_ms=result.latency_ms,
        )
        self.db.add(log)
        await self.db.flush()

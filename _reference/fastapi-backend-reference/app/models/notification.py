"""Enterprise Notification Platform models — Stage 2 Step 6.

Multi-tenant notification platform with:
- notification_templates: reusable templates (email, SMS, push, in-app)
- notification_channels: registered provider channels per tenant
- notifications: the main notification record (one per send)
- notification_logs: delivery logs (per attempt)
- notification_preferences: per-user notification opt-in/opt-out
- notification_queue: scheduled + queued notifications
- notification_branding: per-tenant email/SMS branding

Tenant isolation:
Every table has `organization_id` (REQUIRED) and every query MUST filter by it.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


# ====================================================================
# Notification Templates (reusable, multi-channel, multi-language)
# ====================================================================


class NotificationTemplate(UUIDMixin, TimestampMixin, Base):
    """A reusable notification template.

    Templates support:
    - Multiple channels: email, sms, push, in_app
    - Multiple languages (en, hi, es, etc.)
    - Dynamic variables (Jinja2): {{ user_name }}, {{ ticket_id }}, etc.
    - Versioning (current_version field)
    - HTML + plain text (for email)
    - Per-tenant customization
    """

    __tablename__ = "notification_templates"
    __table_args__ = (
        Index("ix_notif_templates_org_name", "organization_id", "name"),
        Index("ix_notif_templates_org_channel", "organization_id", "channel"),
        Index("ix_notif_templates_org_type", "organization_id", "template_type"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Identity
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Unique per org (e.g. "welcome_email", "password_reset", "otp_sms")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Channel: email, sms, push, in_app
    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Template type (business category)
    template_type: Mapped[str] = mapped_column(String(50), default="transactional", nullable=False)
    # transactional, marketing, otp, system, alert

    # Language
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    # Subject (for email/push)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Jinja2 template string

    # Body content
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    # HTML body (for email) — Jinja2 template
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Plain text body (for SMS, email fallback, in-app) — Jinja2 template

    # Variables definition (for documentation + validation)
    # Format: {"user_name": {"description": "User's full name", "required": true}}
    variables: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Branding
    apply_branding: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # If True, wrap in tenant's branded template (logo, colors, footer)

    # Versioning
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    # Audit
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<NotificationTemplate {self.name!r} channel={self.channel}>"


# ====================================================================
# Notification Channels (registered provider configs per tenant)
# ====================================================================


class NotificationChannel(UUIDMixin, TimestampMixin, Base):
    """A registered notification provider channel for a tenant.

    Each tenant can have multiple channels (Resend for email, Twilio for SMS,
    FCM for push). Credentials are stored as references (vault URIs) —
    never inline in production.
    """

    __tablename__ = "notification_channels"
    __table_args__ = (
        Index("ix_notif_channels_org_type", "organization_id", "channel_type"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Channel: email, sms, push, in_app
    channel_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Provider: resend, sendgrid, ses, twilio, exotel, fcm, etc.
    provider: Mapped[str] = mapped_column(String(50), nullable=False)

    # Display name
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Credentials (references — never inline secrets)
    # Format: {"api_key_ref": "vault://resend/api_key", "from_email": "..."}
    credentials: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Sender config
    from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reply_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sender_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # SMS sender ID

    # Provider-specific config
    config: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Health
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_health_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_health_check_status: Mapped[str | None] = mapped_column(String(20), nullable=True)

    def __repr__(self) -> str:
        return f"<NotificationChannel {self.channel_type}/{self.provider}>"


# ====================================================================
# Notifications (the main notification record — one per send)
# ====================================================================


class Notification(UUIDMixin, TimestampMixin, Base):
    """A notification record (one per send attempt).

    Tracks the full lifecycle: queued → sent → delivered → read (or failed).
    Links to the template used, the channel that delivered it, and all
    delivery log entries.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_org_status", "organization_id", "status"),
        Index("ix_notifications_org_channel", "organization_id", "channel"),
        Index("ix_notifications_org_created", "organization_id", "created_at"),
        Index("ix_notifications_recipient", "recipient"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Template link
    template_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("notification_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    template_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Channel link
    channel_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("notification_channels.id", ondelete="SET NULL"),
        nullable=True,
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # email, sms, push, in_app
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # resend, twilio, fcm, etc.

    # Recipient
    recipient: Mapped[str] = mapped_column(String(500), nullable=False)
    # Email address, phone number, FCM token, or user ID
    recipient_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    recipient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Content (rendered — not the template)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Variables used for rendering
    variables: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Attachments (for email)
    # Format: [{"filename": "doc.pdf", "content_type": "application/pdf", "url": "..."}]
    attachments: Mapped[list] = mapped_column(JSONBType, default=list)

    # Priority: low, normal, high, urgent
    priority: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)

    # Status: queued, sending, sent, delivered, read, failed, bounced, cancelled
    status: Mapped[str] = mapped_column(
        String(20), default="queued", nullable=False, index=True
    )

    # Provider-side ID (for delivery tracking)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # Scheduling
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Retry
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Error
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Bulk notification link (if part of a bulk send)
    bulk_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    # Audit
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<Notification {self.channel} → {self.recipient} status={self.status}>"


# ====================================================================
# Notification Logs (per-attempt delivery log)
# ====================================================================


class NotificationLog(UUIDMixin, TimestampMixin, Base):
    """A delivery log entry for a notification (one per attempt).

    Each send attempt (including retries) creates a log entry. This enables
    full delivery audit + debugging.
    """

    __tablename__ = "notification_logs"
    __table_args__ = (
        Index("ix_notif_logs_notif", "notification_id"),
        Index("ix_notif_logs_org_created", "organization_id", "created_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    notification_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Attempt info
    attempt: Mapped[int] = mapped_column(Integer, nullable=False)
    # 1 = first attempt, 2 = first retry, etc.

    # Status at this attempt
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    # sent, delivered, failed, bounced, etc.

    # Provider response
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_response: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    # Full provider response for debugging

    # Error
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Timing
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Time from send API call to provider response

    # Webhook data (for delivery receipts)
    webhook_received: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    webhook_data: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    webhook_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<NotificationLog notif={self.notification_id} attempt={self.attempt} status={self.status}>"


# ====================================================================
# Notification Preferences (per-user opt-in/opt-out)
# ====================================================================


class NotificationPreference(UUIDMixin, TimestampMixin, Base):
    """Per-user notification preferences (opt-in/opt-out per channel/type).

    One row per (user_id, channel, template_type). If no preference exists,
    the default is "subscribed".
    """

    __tablename__ = "notification_preferences"
    __table_args__ = (
        Index("ix_notif_prefs_org_user", "organization_id", "user_id"),
        Index("ix_notif_prefs_user_channel", "user_id", "channel", "template_type"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Channel + type
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    # email, sms, push, in_app
    template_type: Mapped[str] = mapped_column(String(50), default="all", nullable=False)
    # transactional, marketing, otp, system, alert, all

    # Preference
    is_subscribed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # If False, user has opted out of this channel+type

    # Quiet hours (don't send during these hours)
    quiet_hours_start: Mapped[str | None] = mapped_column(String(5), nullable=True)
    # "22:00" — don't send between quiet_hours_start and quiet_hours_end
    quiet_hours_end: Mapped[str | None] = mapped_column(String(5), nullable=True)
    quiet_hours_timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)

    # Frequency cap (max notifications per day for this channel+type)
    daily_cap: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<NotificationPreference user={self.user_id} {self.channel}/{self.template_type} sub={self.is_subscribed}>"


# ====================================================================
# Notification Branding (per-tenant email/SMS branding)
# ====================================================================


class NotificationBranding(UUIDMixin, TimestampMixin, Base):
    """Per-tenant notification branding (email template wrapper, SMS sender, etc.).

    One row per organization. Holds the tenant's logo URL, brand colors,
    sender name/email, and the HTML wrapper template for emails.
    """

    __tablename__ = "notification_branding"
    __table_args__ = (
        Index("ix_notif_branding_org", "organization_id", unique=True),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Email branding
    company_name: Mapped[str] = mapped_column(String(255), default="Dayjoy AI", nullable=False)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_color: Mapped[str] = mapped_column(String(7), default="#2563eb", nullable=False)
    # Hex color: #RRGGBB
    secondary_color: Mapped[str] = mapped_column(String(7), default="#64748b", nullable=False)
    background_color: Mapped[str] = mapped_column(String(7), default="#f8fafc", nullable=False)
    text_color: Mapped[str] = mapped_column(String(7), default="#1e293b", nullable=False)

    # Email wrapper template (Jinja2)
    # Must contain {{ content }} where the body is inserted
    email_wrapper_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    # If None, a default wrapper is used

    # Footer
    footer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    footer_links: Mapped[list] = mapped_column(JSONBType, default=list)
    # [{"text": "Unsubscribe", "url": "..."}, {"text": "Privacy", "url": "..."}]

    # Social links
    social_links: Mapped[dict[str, str]] = mapped_column(JSONBType, default=dict)
    # {"twitter": "https://...", "linkedin": "https://..."}

    # SMS branding
    sms_sender_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sms_opt_out_text: Mapped[str] = mapped_column(
        Text, default="Reply STOP to unsubscribe", nullable=False
    )

    # Push branding
    push_icon_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    push_color: Mapped[str] = mapped_column(String(7), default="#2563eb", nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<NotificationBranding org={self.organization_id} company={self.company_name!r}>"


# ====================================================================
# File Uploads (preserved from original notification.py)
# ====================================================================


class FileUpload(UUIDMixin, TimestampMixin, Base):
    """A file uploaded to the platform (documents, images, attachments).

    Storage abstraction: files can be stored locally (dev) or in S3 (prod).
    The storage_key is the path/key in the storage backend.
    """

    __tablename__ = "file_uploads"

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    uploaded_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # ===== File info =====
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_backend: Mapped[str] = mapped_column(
        String(20), default="local", nullable=False
    )

    # ===== Metadata =====
    file_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_extension: Mapped[str] = mapped_column(String(10), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    # ===== Access =====
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    access_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ===== Image-specific =====
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ===== Association =====
    resource_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<FileUpload {self.original_filename}>"

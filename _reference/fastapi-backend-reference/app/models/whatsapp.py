"""Enterprise WhatsApp AI models — Stage 2 Step 5.

Multi-tenant WhatsApp Business platform with:
- whatsapp_accounts: Meta WhatsApp Business Account credentials (per-tenant)
- whatsapp_numbers: WhatsApp Business phone numbers (multiple per account)
- whatsapp_sessions: Conversation sessions (one per customer per 24h window)
- whatsapp_messages: All messages (inbound + outbound, all types)
- whatsapp_media: Uploaded/downloaded media metadata
- whatsapp_templates: Message templates (approved by Meta)
- whatsapp_analytics: Per-session aggregate metrics
- whatsapp_webhooks: Inbound webhook audit trail
- whatsapp_handoffs: Human handoff requests + status

Tenant isolation:
Every table has `organization_id` (REQUIRED) and every query MUST filter by it.
Webhook handlers resolve tenant from the recipient phone number → number → account → org.
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
# WhatsApp Accounts (Meta Business Account credentials)
# ====================================================================


class WhatsAppAccount(UUIDMixin, TimestampMixin, Base):
    """A Meta WhatsApp Business Account linked to a tenant.

    One account can have multiple phone numbers (WhatsAppNumber).
    Credentials (access token) are stored as references to a vault —
    never inline in production. For dev/test, the token is stored directly.
    """

    __tablename__ = "whatsapp_accounts"
    __table_args__ = (
        Index("ix_whatsapp_accounts_org_active", "organization_id", "is_active"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Meta Business Account identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Meta credentials
    business_account_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # e.g. "123456789012345" (WhatsApp Business Account ID)
    app_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    app_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Access token (System User token — permanent)
    # In production, store as vault reference; in dev, store directly.
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    access_token_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Vault URI (e.g. "vault://whatsapp/org_xxx/token")

    # Webhook verification
    verify_token: Mapped[str] = mapped_column(String(255), nullable=False)
    # Random string chosen by the user; must match Meta dashboard config

    # Webhook URL (where Meta sends events)
    webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Verified = webhook challenge passed + at least one number connected

    # Business info
    business_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    business_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    business_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI configuration
    ai_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    system_prompt: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="You are a helpful WhatsApp assistant. Be concise and friendly.",
    )
    greeting_message: Mapped[str] = mapped_column(Text, nullable=False)
    fallback_message: Mapped[str] = mapped_column(Text, nullable=False)

    # RAG
    enable_rag: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rag_categories: Mapped[list] = mapped_column(JSONBType, default=list)

    # Behavior
    enable_typing_indicator: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_human_handoff: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    auto_reply_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Business hours (JSON schedule — same format as telephony)
    business_hours: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)

    # Escalation
    escalation_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    escalation_threshold: Mapped[float] = mapped_column(Float, default=0.4, nullable=False)
    # After N consecutive low-confidence turns, escalate

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    # Audit
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<WhatsAppAccount {self.name!r} org={self.organization_id}>"


# ====================================================================
# WhatsApp Numbers (phone numbers linked to an account)
# ====================================================================


class WhatsAppNumber(UUIDMixin, TimestampMixin, Base):
    """A WhatsApp Business phone number.

    One number = one WhatsApp identity that customers message.
    Each number belongs to exactly one WhatsAppAccount.
    """

    __tablename__ = "whatsapp_numbers"
    __table_args__ = (
        Index("ix_whatsapp_numbers_org_active", "organization_id", "is_active"),
        Index("ix_whatsapp_numbers_account", "account_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Meta phone number identity
    phone_number_id: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True
    )
    # e.g. "123456789012345" (Meta's PN ID)
    display_phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    # e.g. "+1234567890" (E.164 the customer sees)
    display_name: Mapped[str] = mapped_column(String(255), default="WhatsApp Line", nullable=False)

    # Quality rating (Meta reports this)
    # GREEN, YELLOW, RED
    quality_rating: Mapped[str | None] = mapped_column(String(20), nullable=True)
    quality_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Messaging limits (Meta enforces tier-based limits)
    messaging_limit_tier: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # 1K, 10K, 100K, 1M (messages per 24h)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<WhatsAppNumber {self.display_phone_number!r} id={self.phone_number_id}>"


# ====================================================================
# WhatsApp Sessions (conversations)
# ====================================================================


class WhatsAppSession(UUIDMixin, TimestampMixin, Base):
    """A WhatsApp conversation session (one per customer per 24h window).

    Sessions group messages from the same customer within a 24-hour window.
    After 24h of inactivity, a new session is created.
    """

    __tablename__ = "whatsapp_sessions"
    __table_args__ = (
        Index("ix_whatsapp_sessions_org_status", "organization_id", "status"),
        Index("ix_whatsapp_sessions_org_customer", "organization_id", "customer_phone"),
        Index("ix_whatsapp_sessions_org_started", "organization_id", "started_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    number_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("whatsapp_numbers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Customer identity
    customer_phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # WhatsApp profile name

    # AI conversation link (for memory)
    ai_conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Status: active, waiting_ai, waiting_human, completed, expired, escalated
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False, index=True
    )

    # Direction context
    started_by: Mapped[str] = mapped_column(String(20), default="customer", nullable=False)
    # customer, agent, broadcast

    # Language
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    # Message counts
    inbound_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    outbound_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_response_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    human_response_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # AI metrics
    avg_ai_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_confidence_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    low_confidence_turns: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Human handoff
    is_escalated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    escalated_to: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # human agent user ID
    escalation_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Summary
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Outcome
    outcome: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # resolved, unresolved, escalated, abandoned, expired
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Timing
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # RAG stats
    rag_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rag_citations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rag_fallback_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<WhatsAppSession customer={self.customer_phone} status={self.status}>"


# ====================================================================
# WhatsApp Messages (all message types)
# ====================================================================


class WhatsAppMessage(UUIDMixin, TimestampMixin, Base):
    """A WhatsApp message (inbound or outbound, any type).

    Supports: text, image, video, audio, document, location, contacts,
    interactive (buttons, lists), template, sticker, reaction.
    """

    __tablename__ = "wa_messages"
    __table_args__ = (
        Index("ix_wa_messages_session", "session_id"),
        Index("ix_wa_messages_org_created", "organization_id", "created_at"),
        Index("ix_wa_messages_wa_id", "wa_message_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    number_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Meta message identity
    wa_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    # e.g. "wamid.HBgL..." — Meta's message ID

    # Direction: inbound, outbound
    direction: Mapped[str] = mapped_column(String(10), nullable=False, index=True)

    # Sender / recipient
    from_number: Mapped[str] = mapped_column(String(20), nullable=False)
    to_number: Mapped[str] = mapped_column(String(20), nullable=False)

    # Message type
    message_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # text, image, video, audio, document, location, contacts, interactive,
    # template, sticker, reaction, system, unknown

    # Content (varies by type)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # For text messages: the message body
    # For other types: caption (if present)

    # Media reference
    media_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    # FK to WhatsAppMedia (for media messages)

    # Location (for location messages)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_address: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Interactive (buttons, lists)
    interactive_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # button, list, button_reply, list_reply
    interactive_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)

    # Template (for outbound template messages)
    template_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    template_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    template_components: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)

    # Contacts (for contact messages)
    contacts: Mapped[list | None] = mapped_column(JSONBType, nullable=True)

    # Reaction (for reaction messages)
    reaction_emoji: Mapped[str | None] = mapped_column(String(20), nullable=True)
    reaction_target_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # AI details (for outbound AI responses)
    is_ai_response: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ai_citations: Mapped[list] = mapped_column(JSONBType, default=list)
    ai_rag_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_was_fallback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Delivery status (for outbound messages)
    # sent, delivered, read, failed, pending
    delivery_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    delivery_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Reply tracking
    reply_to_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # WA message ID of the message this replies to

    # Timestamp from Meta
    wa_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<WhatsAppMessage {self.direction} {self.message_type} wa_id={self.wa_message_id}>"


# ====================================================================
# WhatsApp Media (uploaded/downloaded files)
# ====================================================================


class WhatsAppMedia(UUIDMixin, TimestampMixin, Base):
    """Media metadata for WhatsApp messages (images, videos, audio, documents).

    Media is uploaded to Meta's servers (returns a media ID) or downloaded
    from Meta's servers (when a customer sends media). The actual file can
    optionally be stored locally for compliance.
    """

    __tablename__ = "whatsapp_media"
    __table_args__ = (
        Index("ix_whatsapp_media_org_created", "organization_id", "created_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Meta media identity
    wa_media_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # e.g. "123456789012345" — Meta's media ID

    # Media details
    media_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # image, video, audio, document, sticker
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # e.g. image/jpeg, application/pdf
    file_extension: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # jpg, png, mp4, pdf, etc.
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # URLs (Meta provides temporary URLs that expire)
    meta_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Temporary download URL from Meta (expires in ~5 min after retrieval)
    meta_url_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Local storage (if we download + store the file)
    stored_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Local path or S3 URL after we download from Meta
    storage_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # local, s3, gcs, azure_blob
    stored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Caption (for media messages with text)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)

    # SHA256 hash (for dedup)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Direction: uploaded (we sent), downloaded (customer sent)
    direction: Mapped[str] = mapped_column(String(20), default="downloaded", nullable=False)

    # Status: pending, uploaded, downloaded, failed, expired
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )

    # Associated message
    message_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<WhatsAppMedia wa_id={self.wa_media_id} type={self.media_type}>"


# ====================================================================
# WhatsApp Templates (pre-approved message templates)
# ====================================================================


class WhatsAppTemplate(UUIDMixin, TimestampMixin, Base):
    """A WhatsApp message template (must be approved by Meta).

    Templates are required for outbound proactive messages outside the
    24-hour customer service window. They must be submitted to Meta for
    approval before use.
    """

    __tablename__ = "whatsapp_templates"
    __table_args__ = (
        Index("ix_whatsapp_templates_org_name", "organization_id", "name"),
        Index("ix_whatsapp_templates_org_status", "organization_id", "status"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Template identity
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Must be lowercase + underscores (Meta requirement)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    # ISO 639-1 language code

    # Meta template ID (after submission)
    wa_template_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Template content
    category: Mapped[str] = mapped_column(String(50), default="MARKETING", nullable=False)
    # MARKETING, UTILITY, AUTHENTICATION
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Body with placeholders: "Hello {{1}}, your order {{2}} is ready."
    body_params: Mapped[list] = mapped_column(JSONBType, default=list)
    # Variable definitions

    # Header (optional)
    header_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # text, image, video, document
    header_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    header_media_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Footer (optional)
    footer_text: Mapped[str | None] = mapped_column(String(60), nullable=True)

    # Buttons (optional, max 3)
    buttons: Mapped[list] = mapped_column(JSONBType, default=list)
    # [{"type": "QUICK_REPLY", "text": "Yes"}, ...]

    # Status: pending, approved, rejected, paused
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )
    # Meta's approval status
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Reason if rejected

    # Quality (Meta reports this)
    quality_rating: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    # Audit
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<WhatsAppTemplate {self.name!r} lang={self.language} status={self.status}>"


# ====================================================================
# WhatsApp Analytics (aggregate per session or per day)
# ====================================================================


class WhatsAppAnalytics(UUIDMixin, TimestampMixin, Base):
    """Daily analytics aggregate for a tenant's WhatsApp account.

    One row per (organization_id, account_id, date).
    """

    __tablename__ = "whatsapp_analytics"
    __table_args__ = (
        Index("ix_whatsapp_analytics_org_date", "organization_id", "date"),
        Index("ix_whatsapp_analytics_org_account", "organization_id", "account_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    # The day this aggregate covers (truncated to midnight)

    # Conversation stats
    total_conversations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_conversations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    resolved_conversations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    escalated_conversations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Message stats
    inbound_messages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    outbound_messages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_messages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    human_messages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Delivery stats
    delivered_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    read_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # AI metrics
    ai_resolution_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_avg_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_avg_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_fallback_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Human handoff
    human_handoff_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    human_handoff_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_handoff_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # RAG
    rag_used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rag_citations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rag_success_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Customer satisfaction
    satisfaction_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    satisfaction_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Cost
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<WhatsAppAnalytics date={self.date} conv={self.total_conversations}>"


# ====================================================================
# WhatsApp Webhooks (inbound webhook audit trail)
# ====================================================================


class WhatsAppWebhook(UUIDMixin, TimestampMixin, Base):
    """Audit log for inbound Meta webhooks.

    Every webhook from Meta is logged for debugging + audit.
    """

    __tablename__ = "whatsapp_webhooks"
    __table_args__ = (
        Index("ix_whatsapp_webhooks_org_created", "organization_id", "created_at"),
        Index("ix_whatsapp_webhooks_type", "event_type"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Webhook identity
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # message.received, message.delivered, message.read, message.failed,
    # template.status_update, account.review, phone.quality_update

    # Raw payload
    headers: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    body: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    raw_body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Verification
    signature_valid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    signature_header: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Processing
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_result: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)

    # Related entities
    message_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Source IP
    source_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    def __repr__(self) -> str:
        return f"<WhatsAppWebhook type={self.event_type} processed={self.processed}>"


# ====================================================================
# WhatsApp Handoffs (human handoff requests)
# ====================================================================


class WhatsAppHandoff(UUIDMixin, TimestampMixin, Base):
    """A human handoff request from AI to a human agent.

    Created when:
    - Customer asks for a human
    - AI confidence is consistently low
    - Business rule triggers escalation
    - Manual handoff by an agent
    """

    __tablename__ = "whatsapp_handoffs"
    __table_args__ = (
        Index("ix_whatsapp_handoffs_org_status", "organization_id", "status"),
        Index("ix_whatsapp_handoffs_session", "session_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Handoff details
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
    # customer_request, low_confidence, business_rule, manual, complex_query
    reason_details: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Priority: low, medium, high, urgent
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)

    # Assignment
    assigned_to: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    # Human agent user ID
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status: pending, assigned, in_progress, resolved, cancelled
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )

    # AI context (summary of what AI was discussing)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_last_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Resolution
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Customer satisfaction (after resolution)
    satisfaction_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Timing
    response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Time from handoff creation to agent assignment

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<WhatsAppHandoff session={self.session_id} status={self.status}>"

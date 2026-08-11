"""Enterprise Telephony models — Stage 2 Step 4.

Multi-tenant telephony platform with:
- phone_numbers: tenant-owned business phone numbers (E.164 + provider SID)
- telephony_providers: registered telephony provider configs (Twilio, Exotel, etc.)
- telephony_call_sessions: live + historical telephony call sessions (call SID, status)
- telephony_call_logs: per-call metadata (timing, talk time, cost, outcome)
- telephony_call_recordings: recording metadata (URL, duration, format)
- telephony_call_events: granular event log (status changes, errors, transfers)
- routing_rules: per-tenant call routing rules (time-based, source-based, AI vs human)
- business_hours_schedule: per-tenant business hours + holiday schedules

Tenant isolation:
Every table has `organization_id` (REQUIRED) and every query MUST filter by it.
Webhook handlers verify the originating tenant by call SID → session lookup.

These tables are distinct from the omnichannel.CallLog and voice.VoiceSession
tables — telephony is the LAYER BELOW voice AI:
  PSTN → Telephony (Twilio) → Voice AI (Vapi) → AI Provider (LLM) → RAG

The telephony layer is responsible for: phone number management, call routing,
recording, transfer, hold/resume, retry. It delegates AI logic to the
existing Voice AI platform (app.voice.*) — it does NOT duplicate it.
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
# Telephony Providers (registered provider configurations)
# ====================================================================


class TelephonyProvider(UUIDMixin, TimestampMixin, Base):
    """A registered telephony provider configuration (per-tenant).

    Each tenant can register multiple providers (Twilio, Exotel, etc.) and
    switch between them via TelephonySettings.provider. Credentials are stored
    as references (vault URIs) — never inline.
    """

    __tablename__ = "telephony_providers"
    __table_args__ = (
        Index("ix_telephony_providers_org_name", "organization_id", "name"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Identity
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # e.g. "Twilio Production", "Exotel India"
    provider_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    # twilio, exotel, plivo, knowlarity

    # Credentials (references — never inline secrets)
    # Format: {"account_sid_ref": "vault://twilio/sid", "auth_token_ref": "..."}
    credentials: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Provider-specific config
    config: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    # e.g. {"base_url": "https://api.twilio.com", "api_version": "2010-04-01"}

    # Webhook configuration
    webhook_base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Public URL where the tenant's webhooks are exposed (e.g. https://acme.example.com)
    webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Health check
    last_health_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_health_check_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    # healthy, degraded, down

    def __repr__(self) -> str:
        return f"<TelephonyProvider {self.name!r} type={self.provider_type}>"


# ====================================================================
# Phone Numbers
# ====================================================================


class PhoneNumber(UUIDMixin, TimestampMixin, Base):
    """A business phone number owned by a tenant.

    Phone numbers are the entry point for inbound calls. Each number can
    be assigned a routing strategy (AI, voicemail, forward to human) and
    bound to a specific voice assistant.

    One phone number = one tenant (strict isolation enforced at lookup time).
    """

    __tablename__ = "phone_numbers"
    __table_args__ = (
        Index("ix_phone_numbers_org_active", "organization_id", "is_active"),
        Index("ix_phone_numbers_org_number", "organization_id", "number"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # The phone number (E.164 format: +1234567890)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)

    # Display name (e.g. "Sales Line", "Support Hotline")
    display_name: Mapped[str] = mapped_column(String(255), default="Main Line", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Provider link
    provider_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("telephony_providers.id", ondelete="SET NULL"),
        nullable=True,
    )
    provider_type: Mapped[str] = mapped_column(
        String(50), default="twilio", nullable=False
    )
    # Provider-side identifier (Twilio PNxxx, Exotel SID, etc.)
    provider_number_sid: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Country (ISO 3166-1 alpha-2)
    country_code: Mapped[str] = mapped_column(String(2), default="US", nullable=False)
    # Type: local, toll_free, mobile, national
    number_type: Mapped[str] = mapped_column(String(20), default="local", nullable=False)

    # Capabilities (provider-reported)
    voice_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sms_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mms_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fax_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Routing — which assistant / strategy handles calls to this number
    # Strategy: ai, voicemail, reject, forward
    routing_strategy: Mapped[str] = mapped_column(
        String(20), default="ai", nullable=False
    )
    # When strategy=ai, this assistant handles the call
    voice_assistant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # When strategy=forward, calls go to this number
    forward_to_number: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Business hours binding
    business_hours_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("business_hours_schedules.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Recording
    recording_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    recording_announcement: Mapped[str | None] = mapped_column(Text, nullable=True)
    # If set, played at the start of the call ("This call may be recorded...")

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Verified = provider confirms the number is provisioned + webhook configured

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<PhoneNumber {self.number!r} org={self.organization_id}>"


# ====================================================================
# Business Hours
# ====================================================================


class BusinessHoursSchedule(UUIDMixin, TimestampMixin, Base):
    """Per-tenant business hours + holiday schedule.

    Used by the call router to decide whether to route to AI (during business
    hours) or to voicemail / after-hours forward (outside business hours).
    """

    __tablename__ = "business_hours_schedules"
    __table_args__ = (
        Index("ix_business_hours_org_name", "organization_id", "name"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # e.g. "Default Hours", "Sales Hours", "Support Hours"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timezone (IANA: America/New_York, Asia/Kolkata, etc.)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)

    # Weekly schedule
    # Format: {
    #   "monday":    {"enabled": true,  "start": "09:00", "end": "18:00"},
    #   "tuesday":   {"enabled": true,  "start": "09:00", "end": "18:00"},
    #   ...
    #   "sunday":    {"enabled": false, "start": "00:00", "end": "00:00"}
    # }
    weekly_schedule: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Holidays (specific dates when closed)
    # Format: [
    #   {"date": "2024-12-25", "name": "Christmas", "all_day": true},
    #   {"date": "2024-01-01", "name": "New Year", "all_day": true},
    #   ...
    # ]
    holidays: Mapped[list] = mapped_column(JSONBType, default=list)

    # After-hours behavior
    # Strategy when closed: voicemail, forward, ai (let AI handle 24/7), reject
    after_hours_strategy: Mapped[str] = mapped_column(
        String(20), default="voicemail", nullable=False
    )
    after_hours_forward_to: Mapped[str | None] = mapped_column(String(20), nullable=True)
    after_hours_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # e.g. "We're currently closed. Please call back during business hours."

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<BusinessHoursSchedule {self.name!r} tz={self.timezone}>"


# ====================================================================
# Routing Rules
# ====================================================================


class RoutingRule(UUIDMixin, TimestampMixin, Base):
    """A call routing rule for a tenant.

    Rules are evaluated in priority order (lower priority = evaluated first).
    First match wins. If no rules match, the phone number's default
    routing_strategy is used.

    Example rules:
    - VIP customers (caller in customer.tier='vip') → forward to sales line
    - After-hours calls → voicemail
    - Calls from specific area code → Spanish-speaking assistant
    - Caller ID blocked → reject
    """

    __tablename__ = "routing_rules"
    __table_args__ = (
        Index("ix_routing_rules_org_priority", "organization_id", "priority"),
        Index("ix_routing_rules_org_number", "organization_id", "phone_number_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Scope (optional — if null, applies to all tenant numbers)
    phone_number_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("phone_numbers.id", ondelete="CASCADE"),
        nullable=True,
    )

    # Identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Priority (lower = higher priority)
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)

    # Conditions (all must match — AND logic)
    # Format: {
    #   "caller_phone_in": ["+1234...", "+5678..."],
    #   "caller_phone_prefix": "+1",
    #   "time_of_day": {"start": "09:00", "end": "17:00"},
    #   "day_of_week": ["monday", "tuesday"],
    #   "business_hours_open": true,
    #   "caller_customer_tier": "vip",
    #   "caller_id_blocked": false
    # }
    conditions: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Action when conditions match
    # Action types: ai, forward, voicemail, reject, queue
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    action_config: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    # For action=ai: {"voice_assistant_id": "..."}
    # For action=forward: {"forward_to": "+1234...", "timeout": 30}
    # For action=voicemail: {"voicemail_box": "...", "max_duration": 120}
    # For action=reject: {"reason": "blocked", "message": "..."}

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Audit
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<RoutingRule {self.name!r} priority={self.priority} action={self.action}>"


# ====================================================================
# Telephony Call Sessions (live + historical)
# ====================================================================


class TelephonyCallSession(UUIDMixin, TimestampMixin, Base):
    """A telephony call session (one per call SID from the provider).

    This is the LAYER BELOW voice.VoiceSession — it tracks the telephony
    lifecycle (ringing, answered, in-progress, transferred, completed)
    independent of the AI conversation.

    For AI-handled calls, this links to a voice.VoiceSession via
    voice_session_id. For human-forwarded calls, voice_session_id is null.
    """

    __tablename__ = "telephony_call_sessions"
    __table_args__ = (
        Index("ix_telephony_sessions_org_status", "organization_id", "status"),
        Index("ix_telephony_sessions_org_started", "organization_id", "started_at"),
        Index("ix_telephony_sessions_call_sid", "call_sid"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Provider identity
    provider: Mapped[str] = mapped_column(String(50), default="twilio", nullable=False)
    call_sid: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    # e.g. Twilio CAxxx. Unique across all providers.

    # Phone number that received the call
    phone_number_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("phone_numbers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Voice AI session link (for AI-handled calls)
    voice_session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    voice_assistant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Direction
    direction: Mapped[str] = mapped_column(
        String(20), default="inbound", nullable=False
    )
    # inbound, outbound, transfer

    # Caller / recipient (E.164)
    from_number: Mapped[str] = mapped_column(String(20), nullable=False)
    to_number: Mapped[str] = mapped_column(String(20), nullable=False)
    caller_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Caller name (from caller ID or Twilio lookup)

    # Customer resolution (from caller_phone lookup)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Status: ringing, answered, in_progress, on_hold, transferring,
    # completed, failed, missed, busy, no_answer, voicemail
    status: Mapped[str] = mapped_column(
        String(20), default="ringing", nullable=False, index=True
    )

    # Routing decision (which rule matched, or "default")
    routing_rule_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("routing_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    routing_decision: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # ai, forward, voicemail, reject, default
    routing_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    answered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wait_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Wait = ringing + queue time

    # Talk time
    ai_talk_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    customer_talk_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    silence_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Transfer
    transferred_to: Mapped[str | None] = mapped_column(String(20), nullable=True)
    transferred_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    transfer_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # caller_request, ai_escalation, business_rule, manual

    # Hold
    hold_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_hold_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Recording
    recording_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    recording_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Outcome
    outcome: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # resolved, unresolved, escalated, voicemail, missed, failed, transferred
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Voicemail
    is_voicemail: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    voicemail_transcription: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Error
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hangup_cause: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hangup_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # caller, assistant, system, provider

    # Retry
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    parent_call_sid: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Cost
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Metadata (provider-specific payload)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<TelephonyCallSession sid={self.call_sid} status={self.status}>"


# ====================================================================
# Telephony Call Logs (per-call summary)
# ====================================================================


class TelephonyCallLog(UUIDMixin, TimestampMixin, Base):
    """Per-call summary log (one row per completed call).

    Distinct from TelephonyCallSession — this is the post-call summary
    used for analytics dashboards. One row per call SID.
    """

    __tablename__ = "telephony_call_logs"
    __table_args__ = (
        Index("ix_telephony_logs_org_started", "organization_id", "started_at"),
        Index("ix_telephony_logs_org_outcome", "organization_id", "outcome"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("telephony_call_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Identity (denormalized for fast queries)
    call_sid: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    from_number: Mapped[str] = mapped_column(String(20), nullable=False)
    to_number: Mapped[str] = mapped_column(String(20), nullable=False)
    caller_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Phone number context
    phone_number_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    phone_number_display: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Voice AI link
    voice_session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    voice_assistant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Status + outcome
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    outcome: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Routing
    routing_decision: Mapped[str | None] = mapped_column(String(50), nullable=True)
    routing_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wait_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Recording
    has_recording: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recording_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    recording_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Transfer
    transferred_to: Mapped[str | None] = mapped_column(String(20), nullable=True)
    transfer_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # AI metrics (denormalized from voice analytics)
    ai_handled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_resolution: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # ai_resolution = True if outcome=resolved AND ai_handled=True
    ai_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_turns: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Cost
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Sentiment
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Error
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    hangup_cause: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hangup_by: Mapped[str | None] = mapped_column(String(20), nullable=True)

    def __repr__(self) -> str:
        return f"<TelephonyCallLog sid={self.call_sid} outcome={self.outcome}>"


# ====================================================================
# Call Recordings
# ====================================================================


class CallRecording(UUIDMixin, TimestampMixin, Base):
    """A call recording (one per call, when recording is enabled).

    Tracks the recording URL, format, duration, and access controls.
    Recording URLs from Twilio expire after 6 months — this row is the
    permanent audit record.
    """

    __tablename__ = "call_recordings"
    __table_args__ = (
        Index("ix_call_recordings_org_created", "organization_id", "created_at"),
        Index("ix_call_recordings_session", "session_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("telephony_call_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    call_sid: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # Provider-side identity
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    recording_sid: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    # e.g. Twilio RExxx

    # Recording details
    url: Mapped[str] = mapped_column(Text, nullable=False)
    # Direct media URL (may be time-limited)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    format: Mapped[str] = mapped_column(String(10), default="mp3", nullable=False)
    # mp3, wav
    channels: Mapped[str] = mapped_column(String(10), default="dual", nullable=False)
    # mono, dual
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Status: processing, completed, failed, deleted, expired
    status: Mapped[str] = mapped_column(
        String(20), default="processing", nullable=False, index=True
    )

    # Storage
    # If we download + store the recording (recommended for compliance), this is set:
    stored_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # e.g. S3 URL after we download from Twilio
    storage_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # s3, gcs, azure_blob, local

    # Access control
    # Who can access this recording? (compliance / PII control)
    access_level: Mapped[str] = mapped_column(
        String(20), default="org_admin", nullable=False
    )
    # public, org_admin, compliance_only
    consent_obtained: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consent_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # announcement, verbal, written

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<CallRecording sid={self.recording_sid} duration={self.duration_seconds}s>"


# ====================================================================
# Telephony Call Events (granular event log)
# ====================================================================


class TelephonyCallEvent(UUIDMixin, TimestampMixin, Base):
    """A granular event during a telephony call.

    Examples:
    - call.initiated
    - call.ringing
    - call.answered
    - call.recording_started
    - call.hold
    - call.resume
    - call.transfer_initiated
    - call.transfer_completed
    - call.recording_completed
    - call.ended
    - error
    """

    __tablename__ = "telephony_call_events"
    __table_args__ = (
        Index("ix_telephony_events_session_seq", "session_id", "sequence"),
        Index("ix_telephony_events_org_type", "organization_id", "event_type"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("telephony_call_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Sequence within the session
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    # Event type (dotted notation)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # Event payload
    payload: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Timing
    timestamp_offset: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Source: provider, system, ai, caller, agent
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Severity: info, warning, error, critical
    severity: Mapped[str] = mapped_column(String(20), default="info", nullable=False)

    # Error details
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<TelephonyCallEvent type={self.event_type} seq={self.sequence}>"


# ====================================================================
# Telephony Settings (per-tenant global config)
# ====================================================================


class TelephonySettings(UUIDMixin, TimestampMixin, Base):
    """Per-tenant global telephony configuration.

    One row per organization. Holds the tenant's default provider, default
    business hours, default routing, recording defaults, and webhook secrets.
    """

    __tablename__ = "telephony_settings"
    __table_args__ = (
        Index("ix_telephony_settings_org", "organization_id", unique=True),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Active provider
    provider: Mapped[str] = mapped_column(String(50), default="twilio", nullable=False)
    default_provider_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("telephony_providers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Defaults
    default_phone_number_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("phone_numbers.id", ondelete="SET NULL"),
        nullable=True,
    )
    default_business_hours_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("business_hours_schedules.id", ondelete="SET NULL"),
        nullable=True,
    )
    default_routing_strategy: Mapped[str] = mapped_column(
        String(20), default="ai", nullable=False
    )
    default_voice_assistant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Recording defaults
    enable_recording: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    recording_format: Mapped[str] = mapped_column(String(10), default="mp3", nullable=False)
    recording_channels: Mapped[str] = mapped_column(String(10), default="dual", nullable=False)
    recording_announcement: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Voicemail
    enable_voicemail: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    voicemail_max_duration: Mapped[int] = mapped_column(Integer, default=120, nullable=False)

    # Webhook
    webhook_base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Behavior
    max_call_duration: Mapped[int] = mapped_column(Integer, default=1800, nullable=False)
    enable_media_stream: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<TelephonySettings org={self.organization_id} provider={self.provider}>"

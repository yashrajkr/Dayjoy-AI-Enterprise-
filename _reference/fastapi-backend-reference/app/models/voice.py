"""Enterprise Voice AI models — Stage 2 Step 3.

Multi-tenant Voice AI platform with:
- voice_assistants: per-tenant assistant configs (greeting, voice, prompts, escalation)
- voice_settings: per-tenant voice configuration (provider, STT/TTS, language, business hours)
- voice_sessions: live + historical call sessions (call SID, status, timing)
- voice_messages: streaming transcript segments (caller / assistant, real-time)
- voice_analytics: per-call aggregate metrics (latency, interruptions, talk time)
- voice_providers: registered voice provider configs (Vapi, Retell, etc.)
- call_events: granular event log (status changes, errors, transfers)
- voice_webhook_logs: inbound webhook audit trail

Tenant isolation:
Every table has `organization_id` (REQUIRED) and every query MUST filter by it.
Webhook handlers verify the originating tenant by call SID → session lookup.

These tables supplement (do not replace) the existing omnichannel.CallLog /
CallTranscript tables, which are retained for backward compatibility with
Phase 5. The new tables introduce a richer schema designed for the
Stage 2 Step 3 streaming voice pipeline.
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
# Voice Assistants
# ====================================================================


class VoiceAssistant(UUIDMixin, TimestampMixin, Base):
    """A per-tenant voice assistant configuration.

    One assistant = one AI persona for voice calls. A tenant may have multiple
    assistants (e.g. "Sales", "Support", "Welcome IVR"). Each assistant has:
    - A greeting message
    - A system prompt (rendered with Jinja2 + tenant context)
    - Voice + language settings
    - Escalation policy
    - RAG knowledge base binding
    - Provider-specific config (Vapi assistant ID, etc.)
    """

    __tablename__ = "voice_assistants"
    __table_args__ = (
        Index("ix_voice_assistants_org_active", "organization_id", "is_active"),
        Index("ix_voice_assistants_org_type", "organization_id", "assistant_type"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Identity
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assistant_type: Mapped[str] = mapped_column(
        String(50), default="support", nullable=False, index=True
    )
    # Types: support, sales, welcome_ivr, callback, outbound, survey

    # Greeting
    greeting: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Hello, thank you for calling. How can I help you today?",
    )
    fallback_message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="I'm sorry, I didn't catch that. Could you please repeat?",
    )
    end_of_call_message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Thank you for calling. Have a great day!",
    )

    # System prompt (Jinja2 template, rendered with conversation context)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    # Variables available: organization_name, customer_name, language, business_hours, etc.

    # Voice settings
    voice: Mapped[str] = mapped_column(String(100), default="aria", nullable=False)
    voice_provider: Mapped[str] = mapped_column(
        String(50), default="11labs", nullable=False
    )
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.7, nullable=False)
    max_tokens: Mapped[int] = mapped_column(Integer, default=500, nullable=False)

    # STT / TTS
    stt_provider: Mapped[str] = mapped_column(
        String(50), default="deepgram", nullable=False
    )
    tts_provider: Mapped[str] = mapped_column(
        String(50), default="11labs", nullable=False
    )

    # AI model
    ai_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # If None, uses DEFAULT_AI_PROVIDER. Otherwise: openai, anthropic, groq, gemini.
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # RAG
    enable_rag: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rag_categories: Mapped[list] = mapped_column(JSONBType, default=list)
    # If empty, searches all tenant documents. Otherwise restricts to these categories.

    # Behavior
    enable_barge_in: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_vad: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    silence_timeout_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    max_call_duration: Mapped[int] = mapped_column(Integer, default=1800, nullable=False)
    max_turns: Mapped[int] = mapped_column(Integer, default=100, nullable=False)

    # Escalation
    escalation_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    escalation_threshold: Mapped[float] = mapped_column(
        Float, default=0.4, nullable=False
    )
    # If confidence < escalation_threshold for N consecutive turns, escalate.

    # Business hours (JSON: {weekday: {start: "09:00", end: "18:00"}, ...})
    # Empty = always available
    business_hours: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Provider binding
    provider: Mapped[str] = mapped_column(String(50), default="vapi", nullable=False)
    provider_assistant_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    # e.g. Vapi assistant ID. When None, we create one on first use.

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Metadata (custom fields, tags, etc.)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    # Audit
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<VoiceAssistant {self.name!r} type={self.assistant_type}>"


# ====================================================================
# Voice Settings (per-tenant global voice config)
# ====================================================================


class VoiceSettings(UUIDMixin, TimestampMixin, Base):
    """Per-tenant global voice AI configuration.

    One row per organization (enforced by unique organization_id). Holds the
    tenant's default voice provider, default assistant, phone numbers, and
    webhook secrets.
    """

    __tablename__ = "voice_settings"
    __table_args__ = (
        Index("ix_voice_settings_org", "organization_id", unique=True),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Active provider
    provider: Mapped[str] = mapped_column(String(50), default="vapi", nullable=False)

    # Default assistant (used when no assistant_id is specified)
    default_assistant_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("voice_assistants.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Provider credentials (stored as JSON; secrets are referenced, not embedded)
    # Format: {"vapi": {"api_key_ref": "vault://vapi/...", "assistant_id": "..."}, ...}
    provider_config: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Phone numbers (org's inbound numbers, configured at the provider)
    inbound_phone_numbers: Mapped[list] = mapped_column(JSONBType, default=list)
    outbound_phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Defaults (overridable per assistant)
    default_voice: Mapped[str] = mapped_column(String(100), default="aria", nullable=False)
    default_language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    default_stt_provider: Mapped[str] = mapped_column(
        String(50), default="deepgram", nullable=False
    )
    default_tts_provider: Mapped[str] = mapped_column(
        String(50), default="11labs", nullable=False
    )

    # Webhook
    webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Global behavior
    enable_recording: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_transcription: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    enable_sentiment_analysis: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    enable_barge_in: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_call_duration: Mapped[int] = mapped_column(Integer, default=1800, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<VoiceSettings org={self.organization_id} provider={self.provider}>"


# ====================================================================
# Voice Sessions (live + historical calls)
# ====================================================================


class VoiceSession(UUIDMixin, TimestampMixin, Base):
    """A voice call session (inbound, outbound, or web/VoIP).

    One row per call. Tracks the full lifecycle: ringing → answered →
    in_progress → ended. Links to the assistant, AI conversation, and
    all streaming messages.
    """

    __tablename__ = "voice_sessions"
    __table_args__ = (
        Index("ix_voice_sessions_org_status", "organization_id", "status"),
        Index("ix_voice_sessions_org_started", "organization_id", "started_at"),
        Index("ix_voice_sessions_call_sid", "call_sid"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Assistant used
    assistant_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("voice_assistants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # AI conversation link (for memory + context)
    ai_conversation_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )

    # Provider identity
    provider: Mapped[str] = mapped_column(String(50), default="vapi", nullable=False)
    call_sid: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    # e.g. Vapi call ID. Unique across all providers.
    provider_assistant_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Direction
    direction: Mapped[str] = mapped_column(
        String(20), default="inbound", nullable=False
    )
    # inbound, outbound, web, transfer, callback

    # Caller / recipient
    caller_phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    callee_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    caller_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Customer / user context (resolved from caller_phone)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Status: ringing, answered, in_progress, on_hold, transferring,
    # completed, failed, missed, busy, no_answer, escalated
    status: Mapped[str] = mapped_column(
        String(20), default="ringing", nullable=False, index=True
    )

    # Language (detected or configured)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

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

    # Talk time
    ai_talk_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    customer_talk_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    silence_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overlap_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Conversation metrics
    turn_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    interruption_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    barge_in_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Recording
    recording_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    recording_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consent_obtained: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Transcript
    transcript_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Outcome
    outcome: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # resolved, unresolved, escalated, callback_scheduled, abandoned, failed
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # positive, neutral, negative
    satisfaction_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Escalation / transfer
    transferred_to: Mapped[str | None] = mapped_column(String(20), nullable=True)
    transferred_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    transfer_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Cost
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Error
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    hangup_cause: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hangup_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # caller, assistant, system, provider

    # Metadata (provider-specific payload, custom fields)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<VoiceSession sid={self.call_sid} status={self.status} "
            f"duration={self.duration_seconds}s>"
        )


# ====================================================================
# Voice Messages (streaming transcript segments)
# ====================================================================


class VoiceMessage(UUIDMixin, TimestampMixin, Base):
    """A single streaming transcript message during a voice call.

    One row per utterance (caller or assistant). For real-time streaming,
    rows are created as soon as the STT finalizes a segment. The assistant
    response is split into multiple messages if it streams in chunks.

    Supports:
    - Partial vs final transcripts (is_final flag)
    - Barge-in tracking (interrupted_by flag)
    - Confidence scoring (STT confidence + AI confidence)
    - Citation tracking (RAG citations per assistant message)
    """

    __tablename__ = "voice_messages"
    __table_args__ = (
        Index("ix_voice_messages_session_seq", "session_id", "sequence"),
        Index("ix_voice_messages_session_speaker", "session_id", "speaker"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("voice_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Sequence number (0-based, monotonically increasing within session)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    # Speaker: caller, assistant, system, human
    speaker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Content
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # For partial STT: the latest partial text. For final: the finalized text.

    # Streaming flags
    is_partial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_final: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Barge-in: was this message interrupted?
    interrupted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    interrupted_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # e.g. "caller" if the assistant was interrupted by the caller

    # Timing (relative to session start, in seconds)
    start_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # For assistant messages: time from caller end → assistant start (AI latency)

    # Confidence
    stt_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Language (per-message, for code-switching)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # AI details (for assistant messages)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Citations (for assistant messages that used RAG)
    citations: Mapped[list] = mapped_column(JSONBType, default=list)
    retrieved_chunks: Mapped[list] = mapped_column(JSONBType, default=list)

    # Tool calls (if the assistant called a tool during this message)
    tool_calls: Mapped[list] = mapped_column(JSONBType, default=list)

    # Audio (if recorded)
    audio_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<VoiceMessage session={self.session_id} seq={self.sequence} "
            f"speaker={self.speaker}>"
        )


# ====================================================================
# Voice Analytics (per-call aggregate)
# ====================================================================


class VoiceAnalytics(UUIDMixin, TimestampMixin, Base):
    """Per-call aggregate analytics for the voice platform.

    One row per VoiceSession (1:1). Computed when the call ends. Powers
    the Call Analytics dashboard and aggregate reporting.
    """

    __tablename__ = "voice_analytics"
    __table_args__ = (
        Index("ix_voice_analytics_org_started", "organization_id", "started_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("voice_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    assistant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Latency breakdown (averages, in ms)
    avg_stt_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_ai_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_tts_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_total_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_ai_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p95_ai_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Talk time
    ai_talk_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    customer_talk_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    silence_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overlap_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    talk_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    # ai_talk_time / (ai_talk_time + customer_talk_time)

    # Conversation
    turn_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    interruption_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    barge_in_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Quality
    avg_stt_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    low_confidence_turns: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Turns where AI confidence < escalation_threshold

    # Outcome
    outcome: Mapped[str | None] = mapped_column(String(50), nullable=True)
    was_escalated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    was_transferred: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    was_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    satisfaction_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # RAG
    rag_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rag_citations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rag_fallback_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Cost
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_tokens_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_tokens_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Provider
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    stt_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tts_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)

    def __repr__(self) -> str:
        return f"<VoiceAnalytics session={self.session_id} duration={self.duration_seconds}s>"


# ====================================================================
# Voice Providers (registered provider configurations)
# ====================================================================


class VoiceProvider(UUIDMixin, TimestampMixin, Base):
    """A registered voice provider configuration.

    Each tenant can register multiple providers (Vapi, Retell, etc.) and
    switch between them via VoiceSettings.provider. Credentials are stored
    as references (vault URIs) — never inline.
    """

    __tablename__ = "voice_providers"
    __table_args__ = (
        Index("ix_voice_providers_org_name", "organization_id", "name"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Identity
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # e.g. "Vapi Production", "Retell Sandbox"
    provider_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    # vapi, retell, bland, livekit, pipecat

    # Credentials (references — never inline secrets)
    # Format: {"api_key_ref": "vault://vapi/api_key", "public_key_ref": "..."}
    credentials: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Provider-specific config
    config: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    # e.g. {"base_url": "https://api.vapi.ai", "phone_number_id": "..."}

    # Default phone number for outbound calls
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    phone_number_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Webhook
    webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)
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
        return f"<VoiceProvider {self.name!r} type={self.provider_type}>"


# ====================================================================
# Call Events (granular event log)
# ====================================================================


class CallEvent(UUIDMixin, TimestampMixin, Base):
    """A granular event during a voice call.

    Used for debugging, audit, and analytics. Examples:
    - call.started
    - call.answered
    - stt.partial (partial transcript)
    - stt.final (final transcript)
    - ai.thinking (AI started generating)
    - ai.chunk (streaming AI chunk)
    - ai.final (AI finished)
    - tts.start / tts.chunk / tts.end
    - barge_in (caller interrupted assistant)
    - silence_detected
    - escalation.triggered
    - call.ended
    - error
    """

    __tablename__ = "call_events"
    __table_args__ = (
        Index("ix_call_events_session_seq", "session_id", "sequence"),
        Index("ix_call_events_org_type", "organization_id", "event_type"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("voice_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Sequence within the session
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    # Event type (dotted notation: call.started, stt.partial, ai.chunk, etc.)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # Event payload (JSON — event-specific data)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Timing (relative to session start, in seconds)
    timestamp_offset: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Source: caller, assistant, system, provider, stt, tts, ai, rag
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Severity: info, warning, error, critical
    severity: Mapped[str] = mapped_column(String(20), default="info", nullable=False)

    # Error details (if event_type=error)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<CallEvent session={self.session_id} type={self.event_type}>"


# ====================================================================
# Voice Webhook Logs (inbound webhook audit trail)
# ====================================================================


class VoiceWebhookLog(UUIDMixin, TimestampMixin, Base):
    """Audit log for inbound voice provider webhooks.

    Every webhook from Vapi (or other providers) is logged here for:
    - Debugging webhook signature verification issues
    - Replay (manual or automated)
    - Audit trail (compliance)
    """

    __tablename__ = "voice_webhook_logs"
    __table_args__ = (
        Index("ix_voice_webhook_logs_org_created", "organization_id", "created_at"),
        Index("ix_voice_webhook_logs_call_sid", "call_sid"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Provider
    provider: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Webhook identity
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    call_sid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Request
    headers: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    body: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    raw_body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Verification
    signature_valid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    signature_header: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Processing
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)

    # IP
    source_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    def __repr__(self) -> str:
        return f"<VoiceWebhookLog provider={self.provider} event={self.event_type}>"

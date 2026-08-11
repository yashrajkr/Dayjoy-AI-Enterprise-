"""Omnichannel models — Voice, WhatsApp, Email, Chat, Handoff, Analytics.

Phase 5: Connects the AI Gateway to communication channels.
All models are multi-tenant (organization_id).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin

# ====================================================================
# MODULE 5: Conversation Management (cross-channel)
# ====================================================================


class ChannelConversation(UUIDMixin, TimestampMixin, Base):
    """A conversation across any channel (voice, WhatsApp, web chat, email).

    This is the unified conversation tracker — all channels create one of these.
    Links to the AI conversation (Phase 4) for memory and context.
    """

    __tablename__ = "channel_conversations"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    ai_conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Channel: voice, whatsapp, web_chat, email
    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Channel-specific ID (call_id, whatsapp_message_id, email_thread_id, etc.)
    channel_conversation_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )

    # User context
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    distributor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Caller/contact info
    caller_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    caller_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    caller_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # AI context
    agent_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    intent: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Status: active, completed, escalated, abandoned, transferred
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)

    # Resolution
    outcome: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Values: resolved, unresolved, escalated, callback_scheduled, abandoned
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Satisfaction
    satisfaction_score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5
    satisfaction_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Language
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    # Metadata (JSON: channel-specific data)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONBType, default=dict)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_response_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Handoff
    is_escalated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    escalated_to: Mapped[str | None] = mapped_column(String(36), nullable=True)  # human agent ID
    escalation_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<ChannelConversation {self.channel} {self.status}>"


# ====================================================================
# MODULE 1: Voice AI
# ====================================================================


class CallLog(UUIDMixin, TimestampMixin, Base):
    """A voice call log — tracks all call metadata.

    Supports: inbound, outbound, transfer, callback.
    """

    __tablename__ = "call_logs"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    channel_conversation_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )

    # Call identity
    call_sid: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    call_provider: Mapped[str] = mapped_column(String(50), default="twilio", nullable=False)
    # Providers: twilio, vapi, retell, exotel, bandwidth

    # Direction: inbound, outbound, transfer, callback
    direction: Mapped[str] = mapped_column(String(20), default="inbound", nullable=False)

    # Phone numbers
    from_number: Mapped[str] = mapped_column(String(20), nullable=False)
    to_number: Mapped[str] = mapped_column(String(20), nullable=False)

    # Status: ringing, answered, in_progress, completed, failed, busy, no_answer, transferred
    status: Mapped[str] = mapped_column(String(20), default="ringing", nullable=False, index=True)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wait_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # AI vs human talk time
    ai_talk_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    customer_talk_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    silence_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    interruption_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Language
    language_detected: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Recording
    recording_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    recording_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consent_obtained: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Transcript
    transcript_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Transfer
    transferred_to: Mapped[str | None] = mapped_column(String(20), nullable=True)
    transferred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transfer_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Sentiment (AI-analyzed post-call)
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Values: positive, neutral, negative

    # Cost
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Hangup cause
    hangup_cause: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Metadata
    metadata_: Mapped[dict] = mapped_column("metadata", JSONBType, default=dict)

    def __repr__(self) -> str:
        return f"<CallLog {self.call_sid} {self.direction} {self.status}>"


class CallTranscript(UUIDMixin, TimestampMixin, Base):
    """A transcript segment from a voice call (real-time or post-call)."""

    __tablename__ = "call_transcripts"

    call_log_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # Speaker: caller, agent (AI), human, system
    speaker: Mapped[str] = mapped_column(String(20), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Timing (relative to call start, in seconds)
    start_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # STT confidence
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Language (for code-switching)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)

    def __repr__(self) -> str:
        return f"<CallTranscript call={self.call_log_id} idx={self.segment_index}>"


# ====================================================================
# MODULE 2: WhatsApp AI
# ====================================================================


class WhatsAppMessage(UUIDMixin, TimestampMixin, Base):
    """A WhatsApp message (inbound or outbound)."""

    __tablename__ = "whatsapp_messages"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    channel_conversation_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )

    # WhatsApp message ID
    wa_message_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)

    # Direction: inbound, outbound
    direction: Mapped[str] = mapped_column(String(10), nullable=False)

    # Sender/recipient
    from_number: Mapped[str] = mapped_column(String(20), nullable=False)
    to_number: Mapped[str] = mapped_column(String(20), nullable=False)

    # Message type: text, image, document, audio, video, location, template, interactive
    message_type: Mapped[str] = mapped_column(String(20), default="text", nullable=False)

    # Content
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    media_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Template (for outbound template messages)
    template_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    template_language: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Interactive (buttons, lists)
    interactive_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    interactive_payload: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)

    # Location
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Status: sent, delivered, read, failed
    status: Mapped[str] = mapped_column(String(20), default="sent", nullable=False)

    # AI-generated?
    is_ai_response: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Metadata
    metadata_: Mapped[dict] = mapped_column("metadata", JSONBType, default=dict)

    def __repr__(self) -> str:
        return f"<WhatsAppMessage {self.wa_message_id} {self.direction}>"


# ====================================================================
# MODULE 4: Email AI
# ====================================================================


class EmailThread(UUIDMixin, TimestampMixin, Base):
    """An email conversation thread (for AI-assisted email support)."""

    __tablename__ = "email_threads"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    channel_conversation_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )

    # Thread info
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    thread_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )  # email threading ID

    # Sender
    from_email: Mapped[str] = mapped_column(String(255), nullable=False)
    from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Classification (AI)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # AI processing
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_draft_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Ticket linkage
    ticket_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Status: new, processing, draft_ready, sent, escalated, closed
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False, index=True)

    # Message count
    message_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Metadata
    metadata_: Mapped[dict] = mapped_column("metadata", JSONBType, default=dict)

    def __repr__(self) -> str:
        return f"<EmailThread {self.subject[:50]} {self.status}>"


class EmailMessage(UUIDMixin, TimestampMixin, Base):
    """An individual email message within a thread."""

    __tablename__ = "email_messages"

    email_thread_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Email headers
    message_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    from_email: Mapped[str] = mapped_column(String(255), nullable=False)
    to_email: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)

    # Content
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Direction: inbound, outbound
    direction: Mapped[str] = mapped_column(String(10), default="inbound", nullable=False)

    # Attachments
    attachments: Mapped[list] = mapped_column(JSONBType, default=list)

    # AI
    is_ai_draft: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_ai_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<EmailMessage {self.subject[:50]} {self.direction}>"


# ====================================================================
# MODULE 6: Live Agent Handoff
# ====================================================================


class HandoffRequest(UUIDMixin, TimestampMixin, Base):
    """A request to transfer a conversation from AI to a human agent.

    Lifecycle: pending → assigned → active → completed (or → rejected, timeout)
    """

    __tablename__ = "handoff_requests"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    channel_conversation_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Channel: voice, whatsapp, web_chat, email
    channel: Mapped[str] = mapped_column(String(20), nullable=False)

    # Transfer details
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    # Reasons: low_confidence, explicit_request, sensitive_topic, complaint, failed_resolution, complex_query
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)

    # AI context (what was the AI doing before handoff?)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_agent_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Customer context
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Assignment
    assigned_to: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Queue
    queue_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wait_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Status: pending, assigned, active, completed, rejected, timeout
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)

    # Resolution
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    satisfaction_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Timing
    requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Metadata
    metadata_: Mapped[dict] = mapped_column("metadata", JSONBType, default=dict)

    def __repr__(self) -> str:
        return f"<HandoffRequest {self.channel} {self.status}>"


class AgentAvailability(UUIDMixin, TimestampMixin, Base):
    """Tracks human agent availability for live handoff.

    Updated in real-time as agents come online/go offline.
    """

    __tablename__ = "agent_availability"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Status: online, busy, offline, break
    status: Mapped[str] = mapped_column(String(20), default="offline", nullable=False, index=True)

    # Current load
    active_conversations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_conversations: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    # Channels the agent can handle
    channels: Mapped[list] = mapped_column(
        JSONBType, default=lambda: ["voice", "whatsapp", "web_chat"]
    )

    # Skills (for routing)
    skills: Mapped[list] = mapped_column(
        JSONBType, default=list
    )  # ["support", "sales", "complaints"]

    # Last heartbeat
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<AgentAvailability user={self.user_id} status={self.status}>"


# ====================================================================
# MODULE 7: Voice Analytics (stored as part of CallLog + separate metrics)
# ====================================================================


class ChannelMetric(UUIDMixin, TimestampMixin, Base):
    """Aggregated metrics per channel per day (for dashboards).

    Pre-computed to avoid expensive real-time queries.
    """

    __tablename__ = "channel_metrics"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD

    # Volume
    total_conversations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_resolved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    human_escalated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    abandoned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Timing
    avg_response_time_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Quality
    avg_satisfaction: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ai_resolution_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    escalation_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Cost
    total_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Channel-specific metrics (JSON)
    channel_metrics: Mapped[dict] = mapped_column(JSONBType, default=dict)

    def __repr__(self) -> str:
        return f"<ChannelMetric {self.channel} {self.date}>"

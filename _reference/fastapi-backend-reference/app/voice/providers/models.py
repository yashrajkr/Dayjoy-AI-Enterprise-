"""Provider-agnostic data models for the voice provider abstraction.

These structures are used by the voice session manager and conversation
engine. Each provider adapter translates between these structures and its
own API format.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class CallStatus(str, Enum):
    """Voice call status (provider-agnostic)."""

    RINGING = "ringing"
    ANSWERED = "answered"
    IN_PROGRESS = "in_progress"
    ON_HOLD = "on_hold"
    TRANSFERRING = "transferring"
    COMPLETED = "completed"
    FAILED = "failed"
    MISSED = "missed"
    BUSY = "busy"
    NO_ANSWER = "no_answer"
    ESCALATED = "escalated"


class ProviderEventType(str, Enum):
    """Event types emitted by the provider (via webhook or polling)."""

    CALL_STARTED = "call.started"
    CALL_ANSWERED = "call.answered"
    CALL_ENDED = "call.ended"
    CALL_TRANSFERRED = "call.transferred"
    CALL_FAILED = "call.failed"

    STT_PARTIAL = "stt.partial"
    STT_FINAL = "stt.final"
    TTS_START = "tts.start"
    TTS_END = "tts.end"

    ASSISTANT_RESPONSE = "assistant.response"
    ASSISTANT_THINKING = "assistant.thinking"

    BARGE_IN = "barge_in"
    SILENCE_DETECTED = "silence.detected"
    INTERRUPTION = "interruption"

    ERROR = "error"
    UNKNOWN = "unknown"


@dataclass
class AssistantConfig:
    """Configuration for a voice assistant (provider-agnostic).

    Used when creating / updating an assistant on the provider side.
    Each provider adapter translates this to its own format.
    """

    name: str
    system_prompt: str
    greeting: str
    fallback_message: str = "I'm sorry, I didn't catch that. Could you please repeat?"
    end_of_call_message: str = "Thank you for calling. Have a great day!"
    voice: str = "aria"
    voice_provider: str = "11labs"
    language: str = "en"
    temperature: float = 0.7
    max_tokens: int = 500
    stt_provider: str = "deepgram"
    tts_provider: str = "11labs"
    enable_barge_in: bool = True
    enable_vad: bool = True
    silence_timeout_seconds: int = 30
    max_call_duration: int = 1800
    first_message: str | None = None
    # If None, the greeting is used as the first message.
    metadata: dict[str, Any] = field(default_factory=dict)
    # Provider-specific overrides (e.g. Vapi model config)
    provider_config: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderCallRequest:
    """A request to start a call via the provider."""

    assistant_id: str  # provider-side assistant ID
    to_number: str
    from_number: str | None = None
    # If None, uses provider default
    metadata: dict[str, Any] = field(default_factory=dict)
    # Passed through to provider; also stored on the session


@dataclass
class ProviderCallResponse:
    """The response from starting a call."""

    call_sid: str  # provider call ID
    status: CallStatus
    provider_assistant_id: str | None = None
    started_at: str | None = None  # ISO 8601
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TranscriptSegment:
    """A single transcript segment from the provider."""

    speaker: str  # "caller", "assistant", "system"
    text: str
    start_time: float = 0.0  # seconds from call start
    end_time: float = 0.0
    confidence: float | None = None
    is_partial: bool = False
    language: str | None = None


@dataclass
class ProviderEvent:
    """An inbound event from the provider (via webhook)."""

    event_type: ProviderEventType
    call_sid: str | None = None
    session_id: str | None = None  # our internal session ID (if linked)
    timestamp_offset: float = 0.0  # seconds from call start
    payload: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)
    # The raw provider payload, for debugging

    @property
    def transcript_segment(self) -> TranscriptSegment | None:
        """Extract a transcript segment from the event payload, if applicable."""
        if self.event_type not in (
            ProviderEventType.STT_PARTIAL,
            ProviderEventType.STT_FINAL,
            ProviderEventType.ASSISTANT_RESPONSE,
        ):
            return None
        payload = self.payload
        return TranscriptSegment(
            speaker=payload.get("speaker", "caller"),
            text=payload.get("text", ""),
            start_time=float(payload.get("start_time", 0.0)),
            end_time=float(payload.get("end_time", 0.0)),
            confidence=payload.get("confidence"),
            is_partial=(self.event_type == ProviderEventType.STT_PARTIAL),
            language=payload.get("language"),
        )

"""Provider-agnostic data models for the telephony provider abstraction.

These structures are used by the call router, webhook manager, and recording
manager. Each provider adapter translates between these structures and its
own API format.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class CallDirection(str, Enum):
    """Telephony call direction."""

    INBOUND = "inbound"
    OUTBOUND = "outbound"
    TRANSFER = "transfer"


class ProviderCallStatus(str, Enum):
    """Telephony call status (provider-agnostic)."""

    QUEUED = "queued"
    RINGING = "ringing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELED = "canceled"
    FAILED = "failed"
    BUSY = "busy"
    NO_ANSWER = "no_answer"
    ANSWERED = "answered"
    ON_HOLD = "on_hold"
    TRANSFERRING = "transferring"


class TelephonyEventType(str, Enum):
    """Event types emitted by the telephony provider (via webhook)."""

    CALL_INITIATED = "call.initiated"
    CALL_RINGING = "call.ringing"
    CALL_ANSWERED = "call.answered"
    CALL_COMPLETED = "call.completed"
    CALL_CANCELED = "call.canceled"
    CALL_FAILED = "call.failed"
    CALL_BUSY = "call.busy"
    CALL_NO_ANSWER = "call.no_answer"

    RECORDING_STARTED = "recording.started"
    RECORDING_COMPLETED = "recording.completed"
    RECORDING_FAILED = "recording.failed"

    CALL_TRANSFER_INITIATED = "call.transfer_initiated"
    CALL_TRANSFER_COMPLETED = "call.transfer_completed"

    DTMF_RECEIVED = "dtmf.received"
    GATHER_COMPLETED = "gather.completed"

    ERROR = "error"
    UNKNOWN = "unknown"


@dataclass
class TelephonyCallRequest:
    """A request to start an outbound call via the provider."""

    to_number: str
    from_number: str
    # TwiML URL OR TwiML string OR assistant ID (provider-specific)
    # For Twilio: 'url' (TwiML URL) or 'application_sid'
    # For Vapi-integrated Twilio: 'assistant_id'
    twiml_url: str | None = None
    twiml: str | None = None
    application_sid: str | None = None
    timeout: int = 30  # seconds to ring before giving up
    record: bool = False
    recording_status_callback: str | None = None
    status_callback: str | None = None
    status_callback_event: list[str] = field(
        default_factory=lambda: ["initiated", "ringing", "answered", "completed"]
    )
    machine_detection: str | None = None
    # "enable" or "detect_message_end"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TelephonyCallResponse:
    """The response from starting a call."""

    call_sid: str
    status: ProviderCallStatus
    direction: CallDirection = CallDirection.OUTBOUND
    from_number: str | None = None
    to_number: str | None = None
    started_at: str | None = None  # ISO 8601
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderInboundCall:
    """Details of an inbound call from a provider webhook.

    Captured when the provider sends a webhook to inform us of an incoming call.
    """

    call_sid: str
    from_number: str
    to_number: str
    direction: CallDirection = CallDirection.INBOUND
    caller_name: str | None = None
    # The TwiML URL the provider expects us to return (or None if we generate TwiML)
    called_number_sid: str | None = None
    account_sid: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderCallUpdate:
    """An update to a call's status (from a status callback webhook)."""

    call_sid: str
    status: ProviderCallStatus
    duration_seconds: int | None = None
    # Total call duration (when completed)
    answered_by: str | None = None
    # "human", "machine", "unknown"
    forwarding_from: str | None = None
    hangup_cause: str | None = None
    # busy, no_answer, canceled, failed, completed
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderRecording:
    """Recording details from a recording-status webhook."""

    recording_sid: str
    call_sid: str
    url: str
    duration_seconds: int
    format: str = "mp3"  # mp3, wav
    channels: int = 1  # 1=mono, 2=dual
    status: str = "completed"  # processing, completed, failed, absent
    size_bytes: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class CallTransferRequest:
    """A request to transfer a call to another number."""

    call_sid: str
    to_number: str
    # TwiML URL that performs the transfer (Twilio <Dial>)
    # OR the raw number (provider formats the TwiML)
    twiml_url: str | None = None
    timeout: int = 30
    record: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TelephonyEvent:
    """An inbound event from the telephony provider (via webhook).

    Provider-agnostic — each provider adapter parses its webhook into this format.
    """

    event_type: TelephonyEventType
    call_sid: str | None = None
    session_id: str | None = None  # our internal session ID (if linked)
    timestamp_offset: float = 0.0  # seconds from call start
    payload: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)
    # The raw provider payload, for debugging

    @property
    def call_update(self) -> ProviderCallUpdate | None:
        """Extract a call status update from the event, if applicable."""
        if self.event_type not in (
            TelephonyEventType.CALL_RINGING,
            TelephonyEventType.CALL_ANSWERED,
            TelephonyEventType.CALL_COMPLETED,
            TelephonyEventType.CALL_FAILED,
            TelephonyEventType.CALL_BUSY,
            TelephonyEventType.CALL_NO_ANSWER,
            TelephonyEventType.CALL_CANCELED,
        ):
            return None
        status_map = {
            TelephonyEventType.CALL_RINGING: ProviderCallStatus.RINGING,
            TelephonyEventType.CALL_ANSWERED: ProviderCallStatus.ANSWERED,
            TelephonyEventType.CALL_COMPLETED: ProviderCallStatus.COMPLETED,
            TelephonyEventType.CALL_FAILED: ProviderCallStatus.FAILED,
            TelephonyEventType.CALL_BUSY: ProviderCallStatus.BUSY,
            TelephonyEventType.CALL_NO_ANSWER: ProviderCallStatus.NO_ANSWER,
            TelephonyEventType.CALL_CANCELED: ProviderCallStatus.CANCELED,
        }
        return ProviderCallUpdate(
            call_sid=self.call_sid or "",
            status=status_map.get(self.event_type, ProviderCallStatus.IN_PROGRESS),
            duration_seconds=self.payload.get("duration_seconds"),
            hangup_cause=self.payload.get("hangup_cause"),
            metadata=self.payload,
        )

    @property
    def recording(self) -> ProviderRecording | None:
        """Extract a recording from the event, if applicable."""
        if self.event_type != TelephonyEventType.RECORDING_COMPLETED:
            return None
        p = self.payload
        return ProviderRecording(
            recording_sid=p.get("recording_sid", ""),
            call_sid=self.call_sid or "",
            url=p.get("url", ""),
            duration_seconds=int(p.get("duration_seconds", 0)),
            format=p.get("format", "mp3"),
            channels=int(p.get("channels", 1)),
            status=p.get("status", "completed"),
            size_bytes=p.get("size_bytes"),
            metadata=self.raw,
        )

"""Abstract base class for all telephony providers.

Every telephony provider (Twilio, Exotel, Plivo, Knowlarity) implements
this interface. The Telephony service + webhook layer interact ONLY
through this abstraction — never with provider-specific SDKs directly.

To add a new provider:
1. Create `xxx_provider.py` implementing `TelephonyProvider`
2. Implement all abstract methods
3. Add it to TELEPHONY_PROVIDER_REGISTRY in `__init__.py`
4. Add config keys to Settings + .env.example
"""

from abc import ABC, abstractmethod
from typing import Any

from app.telephony.providers.exceptions import TelephonyProviderError
from app.telephony.providers.models import (
    CallDirection,
    CallTransferRequest,
    ProviderCallStatus,
    ProviderCallUpdate,
    ProviderInboundCall,
    ProviderRecording,
    TelephonyCallRequest,
    TelephonyCallResponse,
    TelephonyEvent,
)


class TelephonyProvider(ABC):
    """Abstract base for all telephony providers.

    Subclasses must implement:
        - make_call()                       → initiate an outbound call
        - end_call()                        → hang up a call
        - transfer_call()                   → transfer to another number
        - hold_call() / resume_call()      → hold / resume
        - start_recording() / stop_recording() → recording control
        - get_call()                        → fetch call status
        - list_phone_numbers()              → list tenant's numbers at provider
        - purchase_phone_number()           → buy a new number
        - release_phone_number()            → release a number
        - verify_webhook_signature()        → verify inbound webhook authenticity
        - parse_inbound_call()              → parse inbound call webhook
        - parse_status_callback()           → parse status callback webhook
        - parse_recording_callback()        → parse recording webhook
        - generate_tts_twiml()              → generate TwiML for TTS
        - generate_connect_twiml()          → generate TwiML to connect to AI
        - generate_dial_twiml()             → generate TwiML for transfer/forward
        - from_settings()                   → classmethod constructor
    """

    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        base_url: str = "",
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries
        self._client: Any = None

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (e.g., 'twilio', 'exotel')."""
        ...

    @classmethod
    @abstractmethod
    def from_settings(cls) -> "TelephonyProvider":
        """Construct an instance from app settings."""
        ...

    # ===== Call control =====

    @abstractmethod
    async def make_call(
        self,
        request: TelephonyCallRequest,
    ) -> TelephonyCallResponse:
        """Initiate an outbound call.

        Returns:
            TelephonyCallResponse with the provider's call SID + initial status.
        """
        ...

    @abstractmethod
    async def end_call(self, call_sid: str) -> bool:
        """End (hang up) a call. Returns True on success."""
        ...

    @abstractmethod
    async def transfer_call(
        self,
        request: CallTransferRequest,
    ) -> bool:
        """Transfer a call to another number. Returns True on success."""
        ...

    @abstractmethod
    async def hold_call(self, call_sid: str) -> bool:
        """Put a call on hold. Returns True on success."""
        ...

    @abstractmethod
    async def resume_call(self, call_sid: str) -> bool:
        """Resume a call from hold. Returns True on success."""
        ...

    @abstractmethod
    async def get_call(self, call_sid: str) -> dict[str, Any]:
        """Fetch call details from the provider."""
        ...

    # ===== Recording =====

    @abstractmethod
    async def start_recording(self, call_sid: str) -> str | None:
        """Start recording a call. Returns the recording SID (or None on failure)."""
        ...

    @abstractmethod
    async def stop_recording(self, call_sid: str, recording_sid: str) -> bool:
        """Stop recording. Returns True on success."""
        ...

    # ===== Phone number management =====

    @abstractmethod
    async def list_phone_numbers(self) -> list[dict[str, Any]]:
        """List phone numbers owned by this account at the provider."""
        ...

    @abstractmethod
    async def purchase_phone_number(
        self,
        phone_number: str,
        friendly_name: str | None = None,
    ) -> dict[str, Any]:
        """Purchase / provision a phone number. Returns provider-side details."""
        ...

    @abstractmethod
    async def release_phone_number(self, phone_number_sid: str) -> bool:
        """Release (delete) a phone number. Returns True on success."""
        ...

    # ===== Webhook handling =====

    @abstractmethod
    def verify_webhook_signature(
        self,
        body: bytes,
        headers: dict[str, str],
        url: str | None = None,
    ) -> bool:
        """Verify the authenticity of an inbound webhook request.

        Args:
            body: Raw request body bytes.
            headers: Request headers (case-insensitive keys recommended).
            url: The full URL the webhook was sent to (Twilio requires this).

        Returns:
            True if the signature is valid, False otherwise.
        """
        ...

    @abstractmethod
    def parse_inbound_call(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> ProviderInboundCall:
        """Parse an inbound call webhook (provider → us).

        Returns:
            ProviderInboundCall with the call SID + caller info.
        """
        ...

    @abstractmethod
    def parse_status_callback(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> TelephonyEvent:
        """Parse a status callback webhook.

        Returns:
            TelephonyEvent with the call status update.
        """
        ...

    @abstractmethod
    def parse_recording_callback(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> TelephonyEvent:
        """Parse a recording status callback webhook.

        Returns:
            TelephonyEvent with the recording details.
        """
        ...

    # ===== TwiML generation (XML responses) =====

    @abstractmethod
    def generate_connect_twiml(
        self,
        ai_websocket_url: str,
        *,
        greeting_text: str | None = None,
        recording_enabled: bool = True,
        recording_status_callback: str | None = None,
    ) -> str:
        """Generate TwiML to connect a call to the AI stream.

        This typically uses <Connect><Stream> for bidirectional audio streaming.
        """
        ...

    @abstractmethod
    def generate_dial_twiml(
        self,
        to_number: str,
        *,
        timeout: int = 30,
        record: bool = False,
        caller_id: str | None = None,
    ) -> str:
        """Generate TwiML to dial (transfer/forward) a call to another number."""
        ...

    @abstractmethod
    def generate_say_twiml(
        self,
        text: str,
        *,
        voice: str = "Polly.Joanna",
        language: str = "en-US",
    ) -> str:
        """Generate TwiML to speak text to the caller (TTS)."""
        ...

    @abstractmethod
    def generate_hangup_twiml(self) -> str:
        """Generate TwiML to hang up the call."""
        ...

    # ===== Shared utilities =====

    def _require_credentials(self) -> None:
        """Ensure the provider has credentials configured."""
        if not self.account_sid or not self.auth_token:
            raise TelephonyProviderError(
                f"{self.name} credentials are not configured — "
                f"set the corresponding environment variables."
            )

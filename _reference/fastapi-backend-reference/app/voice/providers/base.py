"""Abstract base class for all voice providers.

Every voice provider (Vapi, Retell, Bland, LiveKit, Pipecat) implements
this interface. The Voice AI service + WebSocket layer interact ONLY
through this abstraction — never with provider-specific SDKs directly.

To add a new provider:
1. Create `xxx_provider.py` implementing `VoiceProvider`
2. Implement all abstract methods (especially `create_assistant`,
   `start_call`, `end_call`, `verify_webhook_signature`, `parse_webhook_event`)
3. Add it to VOICE_PROVIDER_REGISTRY in `__init__.py`
4. Add config keys to Settings + .env.example
"""

from abc import ABC, abstractmethod
from typing import Any

from app.voice.providers.exceptions import VoiceProviderError
from app.voice.providers.models import (
    AssistantConfig,
    CallStatus,
    ProviderCallRequest,
    ProviderCallResponse,
    ProviderEvent,
)


class VoiceProvider(ABC):
    """Abstract base for all voice providers.

    Subclasses must implement:
        - create_assistant()    → create an assistant on the provider side
        - update_assistant()    → update an existing assistant
        - delete_assistant()    → delete an assistant
        - get_assistant()       → fetch assistant details
        - start_call()          → initiate an outbound call
        - end_call()            → hang up an in-progress call
        - get_call()            → fetch call status
        - verify_webhook_signature() → verify inbound webhook authenticity
        - parse_webhook_event() → translate provider webhook → ProviderEvent
        - from_settings()       → classmethod constructor from app settings
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "",
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries
        self._client: Any = None

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (e.g., 'vapi', 'retell')."""
        ...

    @classmethod
    @abstractmethod
    def from_settings(cls) -> "VoiceProvider":
        """Construct an instance from app settings."""
        ...

    # ===== Assistant management =====

    @abstractmethod
    async def create_assistant(
        self,
        config: AssistantConfig,
    ) -> dict[str, Any]:
        """Create an assistant on the provider side.

        Returns:
            Dict with provider_assistant_id and any provider-specific fields.
        """
        ...

    @abstractmethod
    async def update_assistant(
        self,
        provider_assistant_id: str,
        config: AssistantConfig,
    ) -> dict[str, Any]:
        """Update an existing assistant."""
        ...

    @abstractmethod
    async def delete_assistant(self, provider_assistant_id: str) -> bool:
        """Delete an assistant. Returns True on success."""
        ...

    @abstractmethod
    async def get_assistant(self, provider_assistant_id: str) -> dict[str, Any]:
        """Fetch assistant details from the provider."""
        ...

    # ===== Call management =====

    @abstractmethod
    async def start_call(
        self,
        request: ProviderCallRequest,
    ) -> ProviderCallResponse:
        """Initiate an outbound call.

        Returns:
            ProviderCallResponse with the provider's call ID + initial status.
        """
        ...

    @abstractmethod
    async def end_call(self, call_sid: str) -> bool:
        """End an in-progress call. Returns True on success."""
        ...

    @abstractmethod
    async def get_call(self, call_sid: str) -> dict[str, Any]:
        """Fetch call status + metadata from the provider."""
        ...

    # ===== Webhook handling =====

    @abstractmethod
    def verify_webhook_signature(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> bool:
        """Verify the authenticity of an inbound webhook request.

        Args:
            body: Raw request body bytes.
            headers: Request headers (case-insensitive keys recommended).

        Returns:
            True if the signature is valid, False otherwise.
        """
        ...

    @abstractmethod
    def parse_webhook_event(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> ProviderEvent:
        """Parse an inbound webhook into a provider-agnostic ProviderEvent.

        Args:
            body: Raw request body bytes.
            headers: Request headers.

        Returns:
            ProviderEvent with the event type, call SID, and payload.

        Raises:
            VoiceProviderError: If the body cannot be parsed.
        """
        ...

    # ===== Shared utilities =====

    def _require_api_key(self) -> None:
        """Ensure the provider has an API key configured."""
        if not self.api_key:
            raise VoiceProviderError(
                f"{self.name} API key is not configured — "
                f"set the corresponding environment variable."
            )

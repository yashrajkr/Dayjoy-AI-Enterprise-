"""LiveKit voice provider — stub implementation.

LiveKit (https://livekit.io) is an open-source WebRTC platform for real-time
audio/video. This stub raises NotImplementedError for all methods.
"""

from typing import Any

from app.voice.providers.base import VoiceProvider
from app.voice.providers.exceptions import VoiceProviderNotImplementedError
from app.voice.providers.models import (
    AssistantConfig,
    ProviderCallRequest,
    ProviderCallResponse,
    ProviderEvent,
)


class LiveKitVoiceProvider(VoiceProvider):
    """LiveKit voice provider (stub — not yet implemented)."""

    def __init__(self, api_key: str = "", **kwargs: Any) -> None:
        super().__init__(api_key=api_key, base_url="")

    @property
    def name(self) -> str:
        return "livekit"

    @classmethod
    def from_settings(cls) -> "LiveKitVoiceProvider":
        return cls(api_key="")

    async def create_assistant(self, config: AssistantConfig) -> dict[str, Any]:
        raise VoiceProviderNotImplementedError("livekit", "create_assistant")

    async def update_assistant(
        self, provider_assistant_id: str, config: AssistantConfig
    ) -> dict[str, Any]:
        raise VoiceProviderNotImplementedError("livekit", "update_assistant")

    async def delete_assistant(self, provider_assistant_id: str) -> bool:
        raise VoiceProviderNotImplementedError("livekit", "delete_assistant")

    async def get_assistant(self, provider_assistant_id: str) -> dict[str, Any]:
        raise VoiceProviderNotImplementedError("livekit", "get_assistant")

    async def start_call(self, request: ProviderCallRequest) -> ProviderCallResponse:
        raise VoiceProviderNotImplementedError("livekit", "start_call")

    async def end_call(self, call_sid: str) -> bool:
        raise VoiceProviderNotImplementedError("livekit", "end_call")

    async def get_call(self, call_sid: str) -> dict[str, Any]:
        raise VoiceProviderNotImplementedError("livekit", "get_call")

    def verify_webhook_signature(self, body: bytes, headers: dict[str, str]) -> bool:
        raise VoiceProviderNotImplementedError("livekit", "verify_webhook_signature")

    def parse_webhook_event(self, body: bytes, headers: dict[str, str]) -> ProviderEvent:
        raise VoiceProviderNotImplementedError("livekit", "parse_webhook_event")

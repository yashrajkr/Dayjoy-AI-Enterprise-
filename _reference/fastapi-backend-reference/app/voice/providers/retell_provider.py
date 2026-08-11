"""Retell AI voice provider — stub implementation.

Retell AI (https://retellai.com) is a voice AI platform similar to Vapi.
This stub raises NotImplementedError for all methods. To activate:
1. Implement each method following the Retell AI API docs
2. Add `retell` to VOICE_PROVIDER_REGISTRY (already done in __init__.py)
3. Set VOICE_PROVIDER=retell in your .env
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


class RetellVoiceProvider(VoiceProvider):
    """Retell AI voice provider (stub — not yet implemented)."""

    def __init__(self, api_key: str = "", **kwargs: Any) -> None:
        super().__init__(api_key=api_key, base_url="https://api.retellai.com")

    @property
    def name(self) -> str:
        return "retell"

    @classmethod
    def from_settings(cls) -> "RetellVoiceProvider":
        # RETELL_API_KEY would be added to Settings when implementing
        return cls(api_key="")

    async def create_assistant(self, config: AssistantConfig) -> dict[str, Any]:
        raise VoiceProviderNotImplementedError("retell", "create_assistant")

    async def update_assistant(
        self, provider_assistant_id: str, config: AssistantConfig
    ) -> dict[str, Any]:
        raise VoiceProviderNotImplementedError("retell", "update_assistant")

    async def delete_assistant(self, provider_assistant_id: str) -> bool:
        raise VoiceProviderNotImplementedError("retell", "delete_assistant")

    async def get_assistant(self, provider_assistant_id: str) -> dict[str, Any]:
        raise VoiceProviderNotImplementedError("retell", "get_assistant")

    async def start_call(self, request: ProviderCallRequest) -> ProviderCallResponse:
        raise VoiceProviderNotImplementedError("retell", "start_call")

    async def end_call(self, call_sid: str) -> bool:
        raise VoiceProviderNotImplementedError("retell", "end_call")

    async def get_call(self, call_sid: str) -> dict[str, Any]:
        raise VoiceProviderNotImplementedError("retell", "get_call")

    def verify_webhook_signature(self, body: bytes, headers: dict[str, str]) -> bool:
        raise VoiceProviderNotImplementedError("retell", "verify_webhook_signature")

    def parse_webhook_event(self, body: bytes, headers: dict[str, str]) -> ProviderEvent:
        raise VoiceProviderNotImplementedError("retell", "parse_webhook_event")

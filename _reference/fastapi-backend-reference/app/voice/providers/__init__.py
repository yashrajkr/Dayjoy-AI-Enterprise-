"""Voice provider package — registry and factory.

This is the ONLY entry point for creating voice provider instances.
The Voice AI service + WebSocket layer interact ONLY through this abstraction,
so switching providers requires only a config change (VOICE_PROVIDER).

Supported providers:
- vapi    — Vapi.ai (fully implemented: assistant sync, call creation, webhook)
- retell  — Retell AI (stub — raises NotImplementedError)
- bland   — Bland AI  (stub — raises NotImplementedError)
- livekit — LiveKit   (stub — raises NotImplementedError)
- pipecat — Pipecat   (stub — raises NotImplementedError)

To add a new provider:
1. Create `xxx_provider.py` implementing `VoiceProvider`
2. Add it to VOICE_PROVIDER_REGISTRY below
3. Add config keys to Settings
4. Add API key to .env.example
"""

from app.voice.providers.base import VoiceProvider, VoiceProviderError
from app.voice.providers.exceptions import (
    VoiceProviderAuthenticationError,
    VoiceProviderConnectionError,
    VoiceProviderRateLimitError,
    VoiceProviderTimeoutError,
)
from app.voice.providers.models import (
    AssistantConfig,
    CallStatus,
    ProviderCallRequest,
    ProviderCallResponse,
    ProviderEvent,
    ProviderEventType,
    TranscriptSegment,
)
from app.voice.providers.vapi_provider import VapiVoiceProvider
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ===== Provider Registry =====
VOICE_PROVIDER_REGISTRY: dict[str, type[VoiceProvider]] = {
    "vapi": VapiVoiceProvider,
}

# Conditionally register other providers (when implemented)
try:
    from app.voice.providers.retell_provider import RetellVoiceProvider

    VOICE_PROVIDER_REGISTRY["retell"] = RetellVoiceProvider
except ImportError:
    pass

try:
    from app.voice.providers.bland_provider import BlandVoiceProvider

    VOICE_PROVIDER_REGISTRY["bland"] = BlandVoiceProvider
except ImportError:
    pass

try:
    from app.voice.providers.livekit_provider import LiveKitVoiceProvider

    VOICE_PROVIDER_REGISTRY["livekit"] = LiveKitVoiceProvider
except ImportError:
    pass

try:
    from app.voice.providers.pipecat_provider import PipecatVoiceProvider

    VOICE_PROVIDER_REGISTRY["pipecat"] = PipecatVoiceProvider
except ImportError:
    pass


# ===== Singleton instances =====
_instances: dict[str, VoiceProvider] = {}


def get_voice_provider(name: str | None = None) -> VoiceProvider:
    """Get a voice provider instance by name.

    Args:
        name: Provider name (e.g., 'vapi'). If None, uses VOICE_PROVIDER from config.

    Returns:
        A VoiceProvider instance.

    Raises:
        VoiceProviderError: If the provider doesn't exist or isn't configured.
    """
    provider_name = name or settings.VOICE_PROVIDER

    if provider_name not in VOICE_PROVIDER_REGISTRY:
        available = list(VOICE_PROVIDER_REGISTRY.keys())
        raise VoiceProviderError(
            f"Unknown voice provider: {provider_name!r}. Available: {available}."
        )

    if provider_name not in _instances:
        provider_cls = VOICE_PROVIDER_REGISTRY[provider_name]
        _instances[provider_name] = provider_cls.from_settings()

    return _instances[provider_name]


def clear_cache() -> None:
    """Clear cached provider instances (for testing)."""
    _instances.clear()


__all__ = [
    "VOICE_PROVIDER_REGISTRY",
    "AssistantConfig",
    "CallStatus",
    "ProviderCallRequest",
    "ProviderCallResponse",
    "ProviderEvent",
    "ProviderEventType",
    "RetellVoiceProvider",
    "TranscriptSegment",
    "VoiceProvider",
    "VoiceProviderAuthenticationError",
    "VoiceProviderConnectionError",
    "VoiceProviderError",
    "VoiceProviderRateLimitError",
    "VoiceProviderTimeoutError",
    "clear_cache",
    "get_voice_provider",
]

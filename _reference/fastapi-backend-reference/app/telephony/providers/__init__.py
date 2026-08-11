"""Telephony provider package — registry and factory.

This is the ONLY entry point for creating telephony provider instances.
The Telephony service + webhook layer interact ONLY through this abstraction,
so switching providers requires only a config change (TELEPHONY_PROVIDER).

Supported providers:
- twilio    — Twilio (fully implemented: calls, recordings, TwiML, webhooks)
- exotel    — Exotel (stub — raises NotImplementedError)
- plivo     — Plivo (stub — raises NotImplementedError)
- knowlarity — Knowlarity (stub — raises NotImplementedError)

To add a new provider:
1. Create `xxx_provider.py` implementing `TelephonyProvider`
2. Add it to TELEPHONY_PROVIDER_REGISTRY below
3. Add config keys to Settings
4. Add API key to .env.example
"""

from app.telephony.providers.base import TelephonyProvider, TelephonyProviderError
from app.telephony.providers.exceptions import (
    TelephonyProviderAuthenticationError,
    TelephonyProviderConnectionError,
    TelephonyProviderRateLimitError,
    TelephonyProviderTimeoutError,
)
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
    TelephonyEventType,
)
from app.telephony.providers.twilio_provider import TwilioTelephonyProvider
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ===== Provider Registry =====
TELEPHONY_PROVIDER_REGISTRY: dict[str, type[TelephonyProvider]] = {
    "twilio": TwilioTelephonyProvider,
}

# Conditionally register other providers (when implemented)
try:
    from app.telephony.providers.exotel_provider import ExotelTelephonyProvider

    TELEPHONY_PROVIDER_REGISTRY["exotel"] = ExotelTelephonyProvider
except ImportError:
    pass

try:
    from app.telephony.providers.plivo_provider import PlivoTelephonyProvider

    TELEPHONY_PROVIDER_REGISTRY["plivo"] = PlivoTelephonyProvider
except ImportError:
    pass

try:
    from app.telephony.providers.knowlarity_provider import KnowlarityTelephonyProvider

    TELEPHONY_PROVIDER_REGISTRY["knowlarity"] = KnowlarityTelephonyProvider
except ImportError:
    pass


# ===== Singleton instances =====
_instances: dict[str, TelephonyProvider] = {}


def get_telephony_provider(name: str | None = None) -> TelephonyProvider:
    """Get a telephony provider instance by name.

    Args:
        name: Provider name (e.g., 'twilio'). If None, uses TELEPHONY_PROVIDER from config.

    Returns:
        A TelephonyProvider instance.

    Raises:
        TelephonyProviderError: If the provider doesn't exist or isn't configured.
    """
    provider_name = name or settings.TELEPHONY_PROVIDER

    if provider_name not in TELEPHONY_PROVIDER_REGISTRY:
        available = list(TELEPHONY_PROVIDER_REGISTRY.keys())
        raise TelephonyProviderError(
            f"Unknown telephony provider: {provider_name!r}. Available: {available}."
        )

    if provider_name not in _instances:
        provider_cls = TELEPHONY_PROVIDER_REGISTRY[provider_name]
        _instances[provider_name] = provider_cls.from_settings()

    return _instances[provider_name]


def clear_cache() -> None:
    """Clear cached provider instances (for testing)."""
    _instances.clear()


__all__ = [
    "TELEPHONY_PROVIDER_REGISTRY",
    "CallDirection",
    "CallTransferRequest",
    "ProviderCallStatus",
    "ProviderCallUpdate",
    "ProviderInboundCall",
    "ProviderRecording",
    "TelephonyCallRequest",
    "TelephonyCallResponse",
    "TelephonyEvent",
    "TelephonyEventType",
    "TelephonyProvider",
    "TelephonyProviderAuthenticationError",
    "TelephonyProviderConnectionError",
    "TelephonyProviderError",
    "TelephonyProviderRateLimitError",
    "TelephonyProviderTimeoutError",
    "clear_cache",
    "get_telephony_provider",
]

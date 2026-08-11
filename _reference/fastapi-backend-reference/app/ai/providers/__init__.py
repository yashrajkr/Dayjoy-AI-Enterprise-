"""AI Provider package — registry and factory.

This is the ONLY entry point for creating provider instances.
The rest of the application imports from here, never from individual provider files.

Usage:
    from app.ai.providers import get_provider, get_available_providers

    provider = get_provider("openai")
    response = await provider.generate(request)

To add a new provider:
1. Create `xxx_provider.py` implementing AIProvider
2. Add it to PROVIDER_REGISTRY below
3. Add config keys to Settings
4. Add API key to .env.example
"""

from app.ai.providers.anthropic_provider import AnthropicProvider
from app.ai.providers.base import AIProvider
from app.ai.providers.exceptions import (
    NoProviderAvailableError,
    ProviderAuthenticationError,
    ProviderConnectionError,
    ProviderError,
    ProviderModelNotAvailableError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)
from app.ai.providers.gemini_provider import GeminiProvider
from app.ai.providers.groq_provider import GroqProvider
from app.ai.providers.models import (
    GenerateRequest,
    GenerateResponse,
    Message,
    MessageRole,
    ProviderInfo,
    StreamChunk,
    ToolCall,
    ToolDefinition,
    UsageInfo,
)
from app.ai.providers.openai_provider import OpenAIProvider
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ===== Provider Registry =====
# Maps provider name → provider class
# To add a new provider, add an entry here
PROVIDER_REGISTRY: dict[str, type[AIProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "groq": GroqProvider,
    "gemini": GeminiProvider,
}

# Maps provider name → config key for API key
PROVIDER_API_KEY_MAP: dict[str, str] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "groq": "GROQ_API_KEY",
    "gemini": "GEMINI_API_KEY",
}

# Maps provider name → default model config key
PROVIDER_DEFAULT_MODEL_MAP: dict[str, str] = {
    "openai": "OPENAI_DEFAULT_MODEL",
    "anthropic": "ANTHROPIC_DEFAULT_MODEL",
    "groq": "GROQ_DEFAULT_MODEL",
    "gemini": "GEMINI_DEFAULT_MODEL",
}

# Default models per provider (if not overridden by config)
PROVIDER_DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-sonnet-20241022",
    "groq": "llama-3.3-70b-versatile",
    "gemini": "gemini-2.0-flash",
}


# ===== Singleton instances =====
_instances: dict[str, AIProvider] = {}


def get_provider(name: str | None = None) -> AIProvider:
    """Get a provider instance by name.

    Args:
        name: Provider name (e.g., 'openai', 'anthropic', 'groq', 'gemini').
              If None, uses DEFAULT_AI_PROVIDER from config.

    Returns:
        An AIProvider instance.

    Raises:
        NoProviderAvailableError: If the provider doesn't exist or isn't configured.
    """
    name = name or settings.DEFAULT_AI_PROVIDER

    # Return cached instance
    if name in _instances:
        return _instances[name]

    # Check if provider is registered
    if name not in PROVIDER_REGISTRY:
        raise NoProviderAvailableError(
            f"Unknown provider '{name}'. Available: {list(PROVIDER_REGISTRY.keys())}"
        )

    # Get API key from config
    config_key = PROVIDER_API_KEY_MAP.get(name, "")
    api_key = getattr(settings, config_key, "") or ""

    if not api_key:
        raise NoProviderAvailableError(
            f"Provider '{name}' is not configured. Set {config_key} in .env"
        )

    # Get default model from config or fallback
    model_config_key = PROVIDER_DEFAULT_MODEL_MAP.get(name, "")
    default_model = getattr(settings, model_config_key, None) or PROVIDER_DEFAULT_MODELS.get(
        name, ""
    )

    # Create instance
    provider_class = PROVIDER_REGISTRY[name]
    provider = provider_class(
        api_key=api_key,
        default_model=default_model,
        timeout=settings.LLM_TIMEOUT,
        max_retries=settings.LLM_MAX_RETRIES,
    )

    _instances[name] = provider
    logger.info("provider_initialized", provider=name, model=default_model)
    return provider


def get_available_providers() -> list[ProviderInfo]:
    """Get info about all registered providers (available and unavailable)."""
    result = []
    for name, provider_class in PROVIDER_REGISTRY.items():
        config_key = PROVIDER_API_KEY_MAP.get(name, "")
        api_key = getattr(settings, config_key, "") or ""
        default_model = PROVIDER_DEFAULT_MODELS.get(name, "")

        # Create a temporary instance just for info
        provider = provider_class(
            api_key=api_key,
            default_model=default_model,
        )
        result.append(provider.get_info())

    return result


def get_default_provider() -> AIProvider:
    """Get the default provider (from config)."""
    return get_provider(settings.DEFAULT_AI_PROVIDER)


def clear_cache() -> None:
    """Clear cached provider instances (for testing)."""
    _instances.clear()


__all__ = [
    "AIProvider",
    "AnthropicProvider",
    "GeminiProvider",
    "GroqProvider",
    "NoProviderAvailableError",
    "OpenAIProvider",
    "PROVIDER_DEFAULT_MODELS",
    "PROVIDER_REGISTRY",
    "ProviderAuthenticationError",
    "ProviderConnectionError",
    "ProviderError",
    "ProviderInfo",
    "ProviderModelNotAvailableError",
    "ProviderRateLimitError",
    "ProviderTimeoutError",
    "GenerateRequest",
    "GenerateResponse",
    "Message",
    "MessageRole",
    "StreamChunk",
    "ToolCall",
    "ToolDefinition",
    "UsageInfo",
    "clear_cache",
    "get_available_providers",
    "get_default_provider",
    "get_provider",
]

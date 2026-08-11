"""Abstract base class for all AI providers.

Every LLM provider (OpenAI, Anthropic, Groq, Gemini) implements this interface.
The rest of the application interacts ONLY through this abstraction —
never with provider-specific SDKs directly.

To add a new provider:
1. Create a new file in this directory (e.g. `mistral_provider.py`)
2. Subclass `AIProvider`
3. Implement all abstract methods
4. Register the provider in `__init__.py` PROVIDER_REGISTRY
5. Add the provider's API key to config and .env.example
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from app.ai.providers.exceptions import (
    ProviderAuthenticationError,
    ProviderConnectionError,
    ProviderError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)
from app.ai.providers.models import (
    GenerateRequest,
    GenerateResponse,
    ProviderInfo,
    StreamChunk,
)
from app.core.logging import get_logger

logger = get_logger(__name__)


class AIProvider(ABC):
    """Abstract base for all LLM providers.

    Subclasses must implement:
        - generate()      → non-streaming completion
        - stream()        → streaming completion (async iterator)
        - get_info()      → provider capabilities
        - is_available()  → whether the provider is configured

    Subclasses should also implement:
        - _translate_request()   → convert GenerateRequest to provider format
        - _translate_response()  → convert provider response to GenerateResponse
    """

    def __init__(
        self,
        api_key: str,
        default_model: str,
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self.api_key = api_key
        self.default_model = default_model
        self.timeout = timeout
        self.max_retries = max_retries
        self._client: Any = None

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (e.g., 'openai', 'anthropic')."""
        ...

    @abstractmethod
    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        """Generate a non-streaming completion.

        Args:
            request: The generation request (messages, model, temperature, etc.)

        Returns:
            GenerateResponse with content, usage, tool_calls, latency.

        Raises:
            ProviderAuthenticationError: If API key is invalid.
            ProviderRateLimitError: If rate-limited.
            ProviderTimeoutError: If request times out.
            ProviderError: For other provider-specific errors.
        """
        ...

    @abstractmethod
    async def stream(self, request: GenerateRequest) -> AsyncIterator[StreamChunk]:
        """Generate a streaming completion.

        Args:
            request: The generation request.

        Yields:
            StreamChunk objects as they arrive.

        Raises:
            Same as generate().
        """
        ...

    @abstractmethod
    def get_info(self) -> ProviderInfo:
        """Return provider capabilities and available models."""
        ...

    def is_available(self) -> bool:
        """Check if this provider is properly configured (has API key)."""
        return bool(self.api_key)

    # ===== Shared utility methods =====

    def _resolve_model(self, model: str | None) -> str:
        """Resolve which model to use: explicit > default."""
        return model or self.default_model

    def _handle_error(self, error: Exception) -> ProviderError:
        """Convert provider-specific exceptions to our error hierarchy.

        Subclasses can override this for provider-specific error mapping.
        """
        error_str = str(error).lower()

        if any(
            kw in error_str for kw in ("401", "unauthorized", "invalid api key", "authentication")
        ):
            return ProviderAuthenticationError(self.name, str(error))
        if any(kw in error_str for kw in ("429", "rate limit", "rate_limit", "quota")):
            return ProviderRateLimitError(self.name)
        if any(kw in error_str for kw in ("timeout", "timed out")):
            return ProviderTimeoutError(self.name, self.timeout)
        if any(kw in error_str for kw in ("connection", "network", "unreachable", "dns")):
            return ProviderConnectionError(self.name, str(error))

        return ProviderError(f"[{self.name}] {error}", provider=self.name)

    def _log_request(self, request: GenerateRequest, model: str) -> None:
        """Log a request (without sensitive content)."""
        logger.info(
            "llm_request",
            provider=self.name,
            model=model,
            message_count=len(request.messages),
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            has_tools=bool(request.tools),
            json_mode=request.json_mode,
        )

    def _log_response(self, response: GenerateResponse) -> None:
        """Log a response (usage + latency, not content)."""
        logger.info(
            "llm_response",
            provider=response.provider,
            model=response.model,
            latency_ms=response.latency_ms,
            prompt_tokens=response.usage.prompt_tokens,
            completion_tokens=response.usage.completion_tokens,
            total_tokens=response.usage.total_tokens,
            finish_reason=response.finish_reason,
            tool_calls_count=len(response.tool_calls),
        )

    def _log_error(self, error: Exception, retry: int) -> None:
        """Log an error with retry context."""
        logger.warning(
            "llm_error",
            provider=self.name,
            error=str(error),
            error_type=type(error).__name__,
            retry=retry,
            max_retries=self.max_retries,
        )

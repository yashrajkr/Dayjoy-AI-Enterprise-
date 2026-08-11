"""LLM Gateway — the single entry point for all LLM calls in the application.

This is the ONLY class that the rest of the application should use for LLM calls.
It wraps the provider abstraction with:
- Automatic provider selection (default + fallback)
- Retry with exponential backoff
- Timeout handling
- Rate-limit handling (with retry-after)
- Streaming support
- JSON output support
- Tool/function calling
- Usage tracking
- Structured logging (no sensitive content logged)

Usage:
    from app.ai.llm_gateway import llm_gateway

    # Non-streaming
    response = await llm_gateway.generate(
        messages=[Message(role=MessageRole.USER, content="Hello")],
        model="gpt-4o-mini",  # optional — uses default if not specified
        temperature=0.7,
    )
    print(response.content)

    # Streaming
    async for chunk in llm_gateway.stream(
        messages=[Message(role=MessageRole.USER, content="Tell me a story")],
    ):
        print(chunk.content, end="")

    # JSON output
    response = await llm_gateway.generate_json(
        messages=[Message(role=MessageRole.USER, content="Return a JSON object with name and age")],
    )
    data = json.loads(response.content)

The LLM Gateway NEVER imports provider-specific SDKs. It uses the provider
abstraction layer exclusively, so switching providers requires only a config change.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from app.ai.providers import (
    GenerateRequest,
    GenerateResponse,
    Message,
    MessageRole,
    NoProviderAvailableError,
    ProviderError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    StreamChunk,
    ToolDefinition,
    get_available_providers,
    get_provider,
)
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class LLMGateway:
    """The single LLM interface for the entire application.

    Features:
    - Provider switching via config (DEFAULT_AI_PROVIDER)
    - Automatic fallback to secondary provider on failure
    - Retry with exponential backoff (configurable)
    - Timeout protection
    - Rate-limit handling (respects Retry-After)
    - Streaming support
    - JSON mode support
    - Tool/function calling support
    - Usage tracking (tokens, cost)
    - Structured logging (no prompt content logged)
    """

    def __init__(self) -> None:
        self._default_provider_name: str | None = None
        self._fallback_provider_name: str | None = None

    @property
    def default_provider(self) -> str:
        """Get the default provider name from config."""
        return self._default_provider_name or settings.DEFAULT_AI_PROVIDER

    @default_provider.setter
    def default_provider(self, name: str) -> None:
        """Override the default provider at runtime (for testing or per-tenant config)."""
        self._default_provider_name = name

    @property
    def fallback_provider(self) -> str | None:
        """Get the fallback provider name from config."""
        return self._fallback_provider_name or settings.LLM_FALLBACK_PROVIDER

    @fallback_provider.setter
    def fallback_provider(self, name: str | None) -> None:
        self._fallback_provider_name = name

    # ===== Public API =====

    async def generate(
        self,
        messages: list[Message],
        *,
        model: str | None = None,
        provider: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        tools: list[ToolDefinition] | None = None,
        json_mode: bool = False,
        stop: list[str] | None = None,
        top_p: float | None = None,
    ) -> GenerateResponse:
        """Generate a non-streaming LLM completion.

        Args:
            messages: Conversation messages (system, user, assistant, tool).
            model: Model to use (e.g., 'gpt-4o-mini'). Uses provider default if None.
            provider: Provider to use (e.g., 'openai'). Uses default if None.
            temperature: Sampling temperature (0.0-2.0). Uses config default if None.
            max_tokens: Max tokens to generate. Uses config default if None.
            tools: Tool definitions for function calling.
            json_mode: If True, request JSON-formatted output.
            stop: Stop sequences.
            top_p: Nucleus sampling parameter.

        Returns:
            GenerateResponse with content, usage, tool_calls, latency.

        Raises:
            NoProviderAvailableError: If no provider is configured.
            ProviderError: If all retries fail.
        """
        request = GenerateRequest(
            messages=messages,
            model=model,
            temperature=temperature if temperature is not None else settings.LLM_TEMPERATURE,
            max_tokens=max_tokens or settings.LLM_MAX_TOKENS,
            tools=tools,
            json_mode=json_mode,
            stop=stop,
            top_p=top_p,
        )

        return await self._generate_with_retry(request, provider)

    async def stream(
        self,
        messages: list[Message],
        *,
        model: str | None = None,
        provider: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        tools: list[ToolDefinition] | None = None,
        stop: list[str] | None = None,
        top_p: float | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Generate a streaming LLM completion.

        Yields StreamChunk objects as they arrive from the provider.
        Note: Streaming does NOT retry on failure (partial output would be lost).

        Args:
            Same as generate(), except json_mode is not supported in streaming.

        Yields:
            StreamChunk objects.
        """
        request = GenerateRequest(
            messages=messages,
            model=model,
            temperature=temperature if temperature is not None else settings.LLM_TEMPERATURE,
            max_tokens=max_tokens or settings.LLM_MAX_TOKENS,
            tools=tools,
            stop=stop,
            top_p=top_p,
        )

        provider_name = provider or self.default_provider
        llm_provider = get_provider(provider_name)

        logger.info(
            "llm_stream_start",
            provider=provider_name,
            model=request.model or llm_provider.default_model,
        )

        async for chunk in llm_provider.stream(request):
            yield chunk

    async def generate_json(
        self,
        messages: list[Message],
        *,
        model: str | None = None,
        provider: str | None = None,
        temperature: float = 0.1,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Generate a JSON-formatted response.

        Args:
            messages: Conversation messages (include instruction to return JSON).
            model: Model to use.
            provider: Provider to use.
            temperature: Low temperature for consistent JSON (default 0.1).
            max_tokens: Max tokens.

        Returns:
            Parsed JSON dict.

        Raises:
            ProviderError: If the LLM call fails.
            ValueError: If the response is not valid JSON.
        """
        import json

        response = await self.generate(
            messages=messages,
            model=model,
            provider=provider,
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=True,
        )

        try:
            return json.loads(response.content)
        except json.JSONDecodeError as e:
            logger.error(
                "llm_json_parse_failed",
                provider=response.provider,
                model=response.model,
                error=str(e),
                content_preview=response.content[:200],
            )
            raise ValueError(f"LLM response is not valid JSON: {e}") from e

    async def summarize(
        self,
        text: str,
        *,
        max_length: int = 500,
        model: str | None = None,
        provider: str | None = None,
    ) -> str:
        """Summarize a text.

        Args:
            text: The text to summarize.
            max_length: Target summary length in characters.
            model: Model to use.
            provider: Provider to use.

        Returns:
            Summary string.
        """
        messages = [
            Message(
                role=MessageRole.SYSTEM,
                content=f"You are a helpful assistant. Summarize the following text in no more than {max_length} characters. Be concise and accurate.",
            ),
            Message(role=MessageRole.USER, content=text),
        ]

        response = await self.generate(
            messages=messages,
            model=model,
            provider=provider,
            temperature=0.3,
            max_tokens=max_length // 3,  # Rough char-to-token ratio
        )
        return response.content

    async def classify(
        self,
        text: str,
        categories: list[str],
        *,
        model: str | None = None,
        provider: str | None = None,
    ) -> str:
        """Classify text into one of the given categories.

        Args:
            text: The text to classify.
            categories: List of possible categories.
            model: Model to use.
            provider: Provider to use.

        Returns:
            The best-matching category string.
        """
        cats_str = ", ".join(categories)
        messages = [
            Message(
                role=MessageRole.SYSTEM,
                content=f"You are a classification system. Classify the user's text into exactly ONE of these categories: {cats_str}. Respond with only the category name, nothing else.",
            ),
            Message(role=MessageRole.USER, content=text),
        ]

        response = await self.generate(
            messages=messages,
            model=model,
            provider=provider,
            temperature=0.0,
            max_tokens=50,
        )
        return response.content.strip()

    def list_providers(self) -> list[dict[str, Any]]:
        """List all available providers and their capabilities."""
        return [
            {
                "name": p.name,
                "available": p.available,
                "default_model": p.default_model,
                "supported_models": p.supported_models,
                "supports_streaming": p.supports_streaming,
                "supports_tools": p.supports_tools,
                "supports_json_mode": p.supports_json_mode,
            }
            for p in get_available_providers()
        ]

    # ===== Internal retry logic =====

    async def _generate_with_retry(
        self,
        request: GenerateRequest,
        provider_name: str | None,
    ) -> GenerateResponse:
        """Generate with retry, fallback, and error handling.

        Strategy:
        1. Try the specified (or default) provider
        2. On failure: retry up to max_retries with exponential backoff
        3. If all retries fail: try fallback provider (if configured)
        4. If fallback also fails: raise the original error
        """
        provider_name = provider_name or self.default_provider
        last_error: Exception | None = None

        # Try primary provider
        try:
            return await self._try_generate(provider_name, request)
        except NoProviderAvailableError:
            raise
        except (ProviderRateLimitError, ProviderTimeoutError, ProviderError) as e:
            last_error = e
            logger.warning(
                "llm_primary_failed",
                provider=provider_name,
                error=str(e),
                fallback=self.fallback_provider,
            )

        # Try fallback provider
        if self.fallback_provider and self.fallback_provider != provider_name:
            try:
                logger.info(
                    "llm_fallback_attempt",
                    primary=provider_name,
                    fallback=self.fallback_provider,
                )
                return await self._try_generate(self.fallback_provider, request)
            except ProviderError as e:
                last_error = e
                logger.error(
                    "llm_fallback_failed",
                    provider=self.fallback_provider,
                    error=str(e),
                )

        # All providers failed
        raise last_error or NoProviderAvailableError()

    async def _try_generate(
        self,
        provider_name: str,
        request: GenerateRequest,
    ) -> GenerateResponse:
        """Try a single provider with retries."""
        llm_provider = get_provider(provider_name)
        max_retries = llm_provider.max_retries
        last_error: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                response = await llm_provider.generate(request)
                if attempt > 0:
                    logger.info(
                        "llm_retry_succeeded",
                        provider=provider_name,
                        attempt=attempt,
                    )
                return response

            except ProviderRateLimitError as e:
                last_error = e
                if attempt < max_retries:
                    wait = e.retry_after or (2**attempt)
                    logger.warning(
                        "llm_rate_limited",
                        provider=provider_name,
                        attempt=attempt,
                        wait_seconds=wait,
                    )
                    await asyncio.sleep(wait)
                else:
                    raise

            except ProviderTimeoutError as e:
                last_error = e
                if attempt < max_retries:
                    wait = 2**attempt
                    logger.warning(
                        "llm_timeout",
                        provider=provider_name,
                        attempt=attempt,
                        wait_seconds=wait,
                    )
                    await asyncio.sleep(wait)
                else:
                    raise

            except ProviderError as e:
                last_error = e
                if attempt < max_retries and e.status_code >= 500:
                    wait = 2**attempt
                    logger.warning(
                        "llm_server_error",
                        provider=provider_name,
                        attempt=attempt,
                        wait_seconds=wait,
                        error=str(e),
                    )
                    await asyncio.sleep(wait)
                else:
                    raise

        raise last_error  # type: ignore[misc]


# ===== Singleton instance =====
# The rest of the application uses this singleton.
# Import as: from app.ai.llm_gateway import llm_gateway

llm_gateway = LLMGateway()

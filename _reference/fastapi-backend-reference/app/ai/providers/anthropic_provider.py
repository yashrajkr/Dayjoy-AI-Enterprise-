"""Anthropic Claude provider adapter.

Supports: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku, and newer models.
Features: streaming, tool calling, system prompts.
Note: Anthropic uses a different API format (system prompt is separate from messages).
"""

import time
from collections.abc import AsyncIterator
from typing import Any

from app.ai.providers.base import AIProvider
from app.ai.providers.models import (
    GenerateRequest,
    GenerateResponse,
    MessageRole,
    ProviderInfo,
    StreamChunk,
    ToolCall,
    UsageInfo,
)

try:
    from anthropic import AsyncAnthropic
except ImportError:
    AsyncAnthropic = None  # type: ignore[assignment,misc]


class AnthropicProvider(AIProvider):
    """Anthropic Claude LLM provider."""

    def __init__(
        self,
        api_key: str,
        default_model: str = "claude-3-5-sonnet-20241022",
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        super().__init__(api_key, default_model, timeout, max_retries)
        if AsyncAnthropic and self.is_available():
            self._client = AsyncAnthropic(
                api_key=api_key,
                timeout=timeout,
                max_retries=0,
            )

    @property
    def name(self) -> str:
        return "anthropic"

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        model = self._resolve_model(request.model)
        self._log_request(request, model)
        start = time.monotonic()

        try:
            kwargs = self._build_kwargs(request, model)
            response = await self._client.messages.create(**kwargs)
            latency_ms = int((time.monotonic() - start) * 1000)

            result = self._translate_response(response, model, latency_ms)
            self._log_response(result)
            return result

        except Exception as e:
            raise self._handle_error(e) from e

    async def stream(self, request: GenerateRequest) -> AsyncIterator[StreamChunk]:
        model = self._resolve_model(request.model)
        self._log_request(request, model)

        try:
            kwargs = self._build_kwargs(request, model)
            async with self._client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield StreamChunk(content=text)

                # Get final message for finish reason
                final = await stream.get_final_message()
                yield StreamChunk(content="", finish_reason="end_turn")

        except Exception as e:
            raise self._handle_error(e) from e

    def get_info(self) -> ProviderInfo:
        return ProviderInfo(
            name=self.name,
            available=self.is_available(),
            default_model=self.default_model,
            supported_models=[
                "claude-3-5-sonnet-20241022",
                "claude-3-5-haiku-20241022",
                "claude-3-opus-20240229",
                "claude-3-sonnet-20240229",
                "claude-3-haiku-20240307",
            ],
            supports_streaming=True,
            supports_tools=True,
            supports_json_mode=False,  # Anthropic doesn't have native JSON mode
        )

    # ===== Internal translation =====

    def _build_kwargs(self, request: GenerateRequest, model: str) -> dict[str, Any]:
        """Build kwargs for Anthropic API.

        Key difference from OpenAI: system prompt is extracted from messages
        and passed as a separate parameter.
        """
        system_prompt = ""
        messages = []

        for msg in request.messages:
            if msg.role == MessageRole.SYSTEM:
                system_prompt += msg.content + "\n"
            else:
                messages.append({"role": msg.role.value, "content": msg.content})

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }

        if system_prompt:
            kwargs["system"] = system_prompt.strip()

        if request.tools:
            kwargs["tools"] = [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                }
                for t in request.tools
            ]

        if request.stop:
            kwargs["stop_sequences"] = request.stop

        if request.top_p is not None:
            kwargs["top_p"] = request.top_p

        return kwargs

    def _translate_response(self, response: Any, model: str, latency_ms: int) -> GenerateResponse:
        """Convert Anthropic response to our format."""
        # Extract text content
        content = ""
        tool_calls = []

        for block in response.content:
            if block.type == "text":
                content += block.text
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(
                        id=block.id,
                        name=block.name,
                        arguments=block.input
                        if isinstance(block.input, dict)
                        else {"raw": str(block.input)},
                    )
                )

        usage = UsageInfo()
        if response.usage:
            usage = UsageInfo(
                prompt_tokens=response.usage.input_tokens,
                completion_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            )

        return GenerateResponse(
            content=content,
            model=model,
            provider=self.name,
            usage=usage,
            tool_calls=tool_calls,
            finish_reason=response.stop_reason or "stop",
            latency_ms=latency_ms,
        )

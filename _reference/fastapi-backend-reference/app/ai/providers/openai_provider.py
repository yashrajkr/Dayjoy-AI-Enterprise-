"""OpenAI provider adapter.

Supports: GPT-4o, GPT-4o-mini, GPT-4 Turbo, GPT-3.5 Turbo, and all OpenAI models.
Features: streaming, tool calling, JSON mode, conversation history.
"""

import time
from collections.abc import AsyncIterator
from typing import Any

from app.ai.providers.base import AIProvider
from app.ai.providers.models import (
    GenerateRequest,
    GenerateResponse,
    Message,
    ProviderInfo,
    StreamChunk,
    ToolCall,
    UsageInfo,
)

# We use the openai SDK (also used by Groq since Groq is OpenAI-compatible)
try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None  # type: ignore[assignment,misc]


class OpenAIProvider(AIProvider):
    """OpenAI LLM provider."""

    def __init__(
        self,
        api_key: str,
        default_model: str = "gpt-4o-mini",
        timeout: float = 30.0,
        max_retries: int = 3,
        base_url: str | None = None,
    ) -> None:
        super().__init__(api_key, default_model, timeout, max_retries)
        self.base_url = base_url
        if AsyncOpenAI and self.is_available():
            self._client = AsyncOpenAI(
                api_key=api_key,
                timeout=timeout,
                max_retries=0,  # We handle retries ourselves
                base_url=base_url,
            )

    @property
    def name(self) -> str:
        return "openai"

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        model = self._resolve_model(request.model)
        self._log_request(request, model)
        start = time.monotonic()

        try:
            kwargs = self._build_kwargs(request, model, stream=False)
            response = await self._client.chat.completions.create(**kwargs)
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
            kwargs = self._build_kwargs(request, model, stream=True)
            response = await self._client.chat.completions.create(**kwargs)

            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta:
                    delta = chunk.choices[0].delta
                    content = delta.content or ""
                    finish = chunk.choices[0].finish_reason

                    tool_calls = None
                    if delta.tool_calls:
                        tool_calls = [
                            ToolCall(
                                id=tc.id or "",
                                name=tc.function.name if tc.function else "",
                                arguments={},
                            )
                            for tc in delta.tool_calls
                        ]

                    if content or finish or tool_calls:
                        yield StreamChunk(
                            content=content,
                            finish_reason=finish,
                            tool_calls=tool_calls,
                        )

        except Exception as e:
            raise self._handle_error(e) from e

    def get_info(self) -> ProviderInfo:
        return ProviderInfo(
            name=self.name,
            available=self.is_available(),
            default_model=self.default_model,
            supported_models=[
                "gpt-4o",
                "gpt-4o-mini",
                "gpt-4-turbo",
                "gpt-4",
                "gpt-3.5-turbo",
            ],
            supports_streaming=True,
            supports_tools=True,
            supports_json_mode=True,
        )

    # ===== Internal translation methods =====

    def _build_kwargs(self, request: GenerateRequest, model: str, stream: bool) -> dict[str, Any]:
        """Build kwargs for the OpenAI API call."""
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": [self._translate_message(m) for m in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "stream": stream,
        }

        if request.tools:
            kwargs["tools"] = [t.to_dict() for t in request.tools]

        if request.json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        if request.stop:
            kwargs["stop"] = request.stop

        if request.top_p is not None:
            kwargs["top_p"] = request.top_p

        return kwargs

    def _translate_message(self, msg: Message) -> dict[str, Any]:
        """Convert our Message to OpenAI format."""
        result: dict[str, Any] = {
            "role": msg.role.value,
            "content": msg.content,
        }
        if msg.name:
            result["name"] = msg.name
        if msg.tool_call_id:
            result["tool_call_id"] = msg.tool_call_id
        if msg.tool_calls:
            result["tool_calls"] = msg.tool_calls
        return result

    def _translate_response(self, response: Any, model: str, latency_ms: int) -> GenerateResponse:
        """Convert OpenAI response to our format."""
        choice = response.choices[0]
        message = choice.message

        tool_calls = []
        if message.tool_calls:
            import json

            for tc in message.tool_calls:
                args = {}
                if tc.function and tc.function.arguments:
                    try:
                        args = json.loads(tc.function.arguments)
                    except (json.JSONDecodeError, TypeError):
                        args = {"raw": tc.function.arguments}
                tool_calls.append(
                    ToolCall(
                        id=tc.id,
                        name=tc.function.name if tc.function else "",
                        arguments=args,
                    )
                )

        usage = UsageInfo()
        if response.usage:
            usage = UsageInfo(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
            )

        return GenerateResponse(
            content=message.content or "",
            model=model,
            provider=self.name,
            usage=usage,
            tool_calls=tool_calls,
            finish_reason=choice.finish_reason or "stop",
            latency_ms=latency_ms,
        )

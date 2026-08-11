"""Google Gemini provider adapter.

Supports: Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0 Flash, and newer models.
Features: streaming, tool calling, conversation history.

Note: Gemini uses google-generativeai SDK which has a different API format.
System prompts are handled via system_instruction parameter.
"""

import time
from collections.abc import AsyncIterator
from typing import Any

from app.ai.providers.base import AIProvider
from app.ai.providers.models import (
    GenerateRequest,
    GenerateResponse,
    Message,
    MessageRole,
    ProviderInfo,
    StreamChunk,
    ToolCall,
    UsageInfo,
)

try:
    import google.generativeai as genai
except ImportError:
    genai = None  # type: ignore[assignment]


class GeminiProvider(AIProvider):
    """Google Gemini LLM provider."""

    SUPPORTED_MODELS = [
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
    ]

    def __init__(
        self,
        api_key: str,
        default_model: str = "gemini-2.0-flash",
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        super().__init__(api_key, default_model, timeout, max_retries)
        if genai and self.is_available():
            genai.configure(api_key=api_key)
            self._client = genai

    @property
    def name(self) -> str:
        return "gemini"

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        model = self._resolve_model(request.model)
        self._log_request(request, model)
        start = time.monotonic()

        try:
            model_obj = self._client.GenerativeModel(
                model_name=model,
                generation_config=self._build_gen_config(request),
            )

            system_prompt, contents = self._translate_messages(request.messages)

            kwargs: dict[str, Any] = {"contents": contents}
            if system_prompt:
                model_obj = self._client.GenerativeModel(
                    model_name=model,
                    system_instruction=system_prompt,
                    generation_config=self._build_gen_config(request),
                )

            if request.tools:
                kwargs["tools"] = [self._translate_tools(request.tools)]

            # Gemini SDK is synchronous; run in executor
            import asyncio

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, lambda: model_obj.generate_content(**kwargs)
            )

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
            system_prompt, contents = self._translate_messages(request.messages)

            model_obj = self._client.GenerativeModel(
                model_name=model,
                system_instruction=system_prompt if system_prompt else None,
                generation_config=self._build_gen_config(request),
            )

            import asyncio

            loop = asyncio.get_event_loop()

            def _stream_sync():
                return list(model_obj.generate_content(contents=contents, stream=True))

            chunks = await loop.run_in_executor(None, _stream_sync)

            for chunk in chunks:
                text = ""
                if chunk.text:
                    text = chunk.text
                yield StreamChunk(content=text)

            yield StreamChunk(content="", finish_reason="stop")

        except Exception as e:
            raise self._handle_error(e) from e

    def get_info(self) -> ProviderInfo:
        return ProviderInfo(
            name=self.name,
            available=self.is_available(),
            default_model=self.default_model,
            supported_models=self.SUPPORTED_MODELS,
            supports_streaming=True,
            supports_tools=True,
            supports_json_mode=True,
        )

    # ===== Internal translation =====

    def _build_gen_config(self, request: GenerateRequest) -> dict[str, Any]:
        """Build generation config for Gemini."""
        config: dict[str, Any] = {
            "temperature": request.temperature,
            "max_output_tokens": request.max_tokens,
        }
        if request.top_p is not None:
            config["top_p"] = request.top_p
        if request.stop:
            config["stop_sequences"] = request.stop
        if request.json_mode:
            config["response_mime_type"] = "application/json"
        return config

    def _translate_messages(self, messages: list[Message]) -> tuple[str, list[dict[str, Any]]]:
        """Convert messages to Gemini format.

        Gemini uses 'user' and 'model' roles (not 'assistant').
        System prompts are extracted and returned separately.
        """
        system_parts = []
        contents = []

        for msg in messages:
            if msg.role == MessageRole.SYSTEM:
                system_parts.append(msg.content)
            else:
                role = "user" if msg.role == MessageRole.USER else "model"
                contents.append({"role": role, "parts": [msg.content]})

        return ("\n".join(system_parts), contents)

    def _translate_tools(self, tools: list) -> list[dict[str, Any]]:
        """Convert tool definitions to Gemini format."""
        declarations = []
        for tool in tools:
            declarations.append(
                {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                }
            )
        return declarations

    def _translate_response(self, response: Any, model: str, latency_ms: int) -> GenerateResponse:
        """Convert Gemini response to our format."""
        content = ""
        tool_calls = []

        if response.candidates:
            candidate = response.candidates[0]
            if candidate.content and candidate.content.parts:
                for part in candidate.content.parts:
                    if hasattr(part, "text") and part.text:
                        content += part.text
                    if hasattr(part, "function_call") and part.function_call:
                        fc = part.function_call
                        tool_calls.append(
                            ToolCall(
                                id=getattr(fc, "id", ""),
                                name=fc.name,
                                arguments=dict(fc.args) if fc.args else {},
                            )
                        )

        usage = UsageInfo()
        if response.usage_metadata:
            usage = UsageInfo(
                prompt_tokens=response.usage_metadata.prompt_token_count or 0,
                completion_tokens=response.usage_metadata.candidates_token_count or 0,
                total_tokens=response.usage_metadata.total_token_count or 0,
            )

        return GenerateResponse(
            content=content,
            model=model,
            provider=self.name,
            usage=usage,
            tool_calls=tool_calls,
            finish_reason="stop",
            latency_ms=latency_ms,
        )

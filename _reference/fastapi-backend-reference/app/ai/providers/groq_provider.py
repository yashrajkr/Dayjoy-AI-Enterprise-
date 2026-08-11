"""Groq provider adapter.

Groq uses an OpenAI-compatible API, so we extend OpenAIProvider
with a different base_url and default model.

Supports: Llama 3.1, Llama 3.3, Mixtral, Gemma, and other open models hosted on Groq.
Features: streaming, tool calling, JSON mode (via OpenAI-compatible API).
"""

from app.ai.providers.models import ProviderInfo
from app.ai.providers.openai_provider import OpenAIProvider


class GroqProvider(OpenAIProvider):
    """Groq LLM provider (OpenAI-compatible API).

    Groq offers ultra-fast inference for open-source models (Llama, Mixtral, etc.)
    using their LPU hardware. The API is OpenAI-compatible, so we reuse
    OpenAIProvider with a different base_url.
    """

    GROQ_BASE_URL = "https://api.groq.com/openai/v1"

    SUPPORTED_MODELS = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama-3.1-70b-versatile",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
        "gemma-7b-it",
    ]

    def __init__(
        self,
        api_key: str,
        default_model: str = "llama-3.3-70b-versatile",
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        super().__init__(
            api_key=api_key,
            default_model=default_model,
            timeout=timeout,
            max_retries=max_retries,
            base_url=self.GROQ_BASE_URL,
        )

    @property
    def name(self) -> str:
        return "groq"

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

"""OpenAI embedding provider.

Uses the OpenAI SDK (already in dependencies for the LLM gateway) to call
the OpenAI embeddings API. Supports text-embedding-3-small, text-embedding-3-large,
and text-embedding-ada-002.

Pricing (USD per 1M tokens, as of 2024-12):
- text-embedding-3-small: $0.02 / 1M tokens
- text-embedding-3-large: $0.13 / 1M tokens
- text-embedding-ada-002: $0.10 / 1M tokens

We track cost in integer cents to avoid floating-point money issues.
"""

import asyncio
import time
from typing import Any

from app.ai.embeddings.base import EmbeddingProvider
from app.ai.embeddings.exceptions import (
    EmbeddingAuthenticationError,
    EmbeddingConnectionError,
    EmbeddingModelNotAvailableError,
    EmbeddingProviderError,
    EmbeddingRateLimitError,
    EmbeddingTimeoutError,
)
from app.ai.embeddings.models import EmbeddingBatch, EmbeddingResult, EmbeddingUsageType
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Pricing per 1M tokens, in USD. Multiply by tokens / 1_000_000 * 100 for cents.
_OPENAI_EMBEDDING_PRICING: dict[str, float] = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
    "text-embedding-ada-002": 0.10,
}


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI embedding provider."""

    def __init__(
        self,
        api_key: str,
        model_id: str = "text-embedding-3-small",
        dimension: int = 1536,
        batch_size: int = 100,
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        super().__init__(
            model_id=model_id,
            dimension=dimension,
            batch_size=batch_size,
            timeout=timeout,
            max_retries=max_retries,
        )
        self.api_key = api_key
        self._client: Any = None

    @property
    def name(self) -> str:
        return "openai"

    @classmethod
    def from_settings(cls) -> "OpenAIEmbeddingProvider":
        model = settings.EMBEDDING_MODEL or "text-embedding-3-small"
        # Map model to default dimension
        default_dims = {
            "text-embedding-3-small": 1536,
            "text-embedding-3-large": 3072,
            "text-embedding-ada-002": 1536,
        }
        dim = settings.EMBEDDING_DIMENSION or default_dims.get(model, 1536)
        return cls(
            api_key=settings.OPENAI_API_KEY,
            model_id=model,
            dimension=dim,
            batch_size=settings.EMBEDDING_BATCH_SIZE,
            timeout=settings.EMBEDDING_TIMEOUT,
            max_retries=settings.EMBEDDING_MAX_RETRIES,
        )

    def _get_client(self) -> Any:
        """Lazy-init the OpenAI async client."""
        if self._client is None:
            if not self.api_key:
                raise EmbeddingAuthenticationError(
                    "OPENAI_API_KEY is not set — cannot use OpenAI embedding provider"
                )
            try:
                from openai import AsyncOpenAI
            except ImportError as e:  # pragma: no cover
                raise EmbeddingProviderError(
                    "openai SDK not installed. Run: pip install openai"
                ) from e
            self._client = AsyncOpenAI(api_key=self.api_key, timeout=self.timeout)
        return self._client

    async def embed_texts(
        self,
        texts: list[str],
        usage_type: EmbeddingUsageType = EmbeddingUsageType.DOCUMENT,
    ) -> EmbeddingBatch:
        self._validate_texts(texts)
        client = self._get_client()

        all_results: list[EmbeddingResult] = []
        for batch in self._chunk_batches(texts):
            batch_results = await self._embed_batch_with_retry(client, batch)
            all_results.extend(batch_results)
        return EmbeddingBatch(results=all_results)

    async def _embed_batch_with_retry(
        self, client: Any, texts: list[str]
    ) -> list[EmbeddingResult]:
        """Embed a single batch with retry + backoff."""
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return await self._embed_batch_once(client, texts)
            except EmbeddingRateLimitError as e:
                last_exc = e
                wait = min(2**attempt, 30)
                logger.warning(
                    "openai_embedding_rate_limited",
                    attempt=attempt,
                    wait_seconds=wait,
                )
                await asyncio.sleep(wait)
            except EmbeddingTimeoutError as e:
                last_exc = e
                wait = min(2**attempt, 10)
                logger.warning(
                    "openai_embedding_timeout",
                    attempt=attempt,
                    wait_seconds=wait,
                )
                await asyncio.sleep(wait)
            except EmbeddingConnectionError as e:
                last_exc = e
                wait = min(2**attempt, 10)
                logger.warning(
                    "openai_embedding_connection_error",
                    attempt=attempt,
                    wait_seconds=wait,
                )
                await asyncio.sleep(wait)
        # Out of retries
        raise last_exc if last_exc else EmbeddingProviderError(
            "openai_embedding_failed_after_retries"
        )

    async def _embed_batch_once(self, client: Any, texts: list[str]) -> list[EmbeddingResult]:
        """Single embedding attempt (no retry)."""
        start = time.perf_counter()
        try:
            # text-embedding-3-* models support `dimensions` param to truncate.
            kwargs: dict[str, Any] = {
                "model": self.model_id,
                "input": texts,
            }
            if self.model_id.startswith("text-embedding-3-"):
                kwargs["dimensions"] = self.dimension
            response = await client.embeddings.create(**kwargs)
        except Exception as e:
            raise self._translate_exception(e) from e

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        # OpenAI returns usage.prompt_tokens for the whole batch
        total_tokens = 0
        if hasattr(response, "usage") and response.usage:
            total_tokens = getattr(response.usage, "prompt_tokens", 0) or 0

        cost_cents = self._compute_cost_cents(total_tokens)
        per_token_cost = cost_cents / max(1, len(texts))

        # Sort by index to preserve order
        sorted_data = sorted(response.data, key=lambda x: x.index)
        per_latency = elapsed_ms // max(1, len(sorted_data))

        results: list[EmbeddingResult] = []
        for i, item in enumerate(sorted_data):
            text = texts[i] if i < len(texts) else ""
            per_tokens = total_tokens // max(1, len(sorted_data))
            results.append(
                EmbeddingResult(
                    text=text,
                    vector=list(item.embedding),
                    model=self.model_id,
                    dimension=len(item.embedding),
                    token_count=per_tokens,
                    cost_cents=int(per_token_cost),
                    latency_ms=per_latency,
                )
            )
        return results

    def _compute_cost_cents(self, tokens: int) -> int:
        """Compute cost in integer cents."""
        price_per_m = _OPENAI_EMBEDDING_PRICING.get(self.model_id, 0.0)
        if price_per_m <= 0 or tokens <= 0:
            return 0
        # cents = tokens / 1_000_000 * price_usd * 100
        return int(tokens * price_per_m * 100 / 1_000_000)

    @staticmethod
    def _translate_exception(e: Exception) -> EmbeddingProviderError:
        """Translate OpenAI SDK exceptions to our hierarchy."""
        msg = str(e)
        err_type = type(e).__name__
        # Auth
        if "auth" in msg.lower() or "api key" in msg.lower() or "401" in msg:
            return EmbeddingAuthenticationError(f"OpenAI auth error: {msg}")
        # Rate limit
        if "rate" in msg.lower() or "429" in msg or "RateLimitError" in err_type:
            return EmbeddingRateLimitError(f"OpenAI rate limit: {msg}")
        # Timeout
        if "timeout" in msg.lower() or "timed out" in msg.lower() or "APITimeoutError" in err_type:
            return EmbeddingTimeoutError(f"OpenAI timeout: {msg}")
        # Connection
        if "connect" in msg.lower() or "connection" in msg.lower() or "APIConnectionError" in err_type:
            return EmbeddingConnectionError(f"OpenAI connection error: {msg}")
        # Model not available
        if "model" in msg.lower() and ("not" in msg.lower() or "does not exist" in msg.lower()):
            return EmbeddingModelNotAvailableError(model="(unknown)", provider="openai")
        return EmbeddingProviderError(f"OpenAI embedding error ({err_type}): {msg}")

    def get_info(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "model_id": self.model_id,
            "dimension": self.dimension,
            "batch_size": self.batch_size,
            "available": self.is_available(),
            "pricing_per_m_tokens_usd": _OPENAI_EMBEDDING_PRICING.get(self.model_id, 0.0),
            "description": "OpenAI embeddings API",
        }

    def is_available(self) -> bool:
        return bool(self.api_key)

"""Embedding provider package — registry and factory.

This is the ONLY entry point for creating embedding provider instances.
The RAG pipeline imports from here, never from individual provider files.

Supported providers:
- openai    — OpenAI text-embedding-3-small / text-embedding-3-large / text-embedding-ada-002
- bge_local — BAAI/bge-small-en-v1.5 (on-prem, no API calls, sentence-transformers)
- fake      — deterministic hash-based vectors for testing

To add a new provider:
1. Create `xxx_provider.py` implementing `EmbeddingProvider`
2. Add it to EMBEDDING_PROVIDER_REGISTRY below
3. Add config keys to Settings
4. Add API key (if any) to .env.example

Usage:
    from app.ai.embeddings import get_embedding_provider

    provider = get_embedding_provider()  # uses EMBEDDING_PROVIDER from config
    vectors = await provider.embed_texts(["hello", "world"])
    query_vec = await provider.embed_query("search query")
"""

from app.ai.embeddings.base import EmbeddingProvider, EmbeddingProviderError
from app.ai.embeddings.exceptions import (
    EmbeddingConnectionError,
    EmbeddingRateLimitError,
    EmbeddingTimeoutError,
)
from app.ai.embeddings.fake_provider import FakeEmbeddingProvider
from app.ai.embeddings.models import EmbeddingBatch, EmbeddingResult
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ===== Provider Registry =====
EMBEDDING_PROVIDER_REGISTRY: dict[str, type[EmbeddingProvider]] = {
    "fake": FakeEmbeddingProvider,
}

# Conditionally register providers that require optional deps
try:
    from app.ai.embeddings.openai_provider import OpenAIEmbeddingProvider

    EMBEDDING_PROVIDER_REGISTRY["openai"] = OpenAIEmbeddingProvider
except ImportError:  # pragma: no cover — openai SDK may be absent in tests
    logger.debug("openai_embedding_provider_unavailable_sdk_missing")

try:
    from app.ai.embeddings.bge_provider import BGELocalEmbeddingProvider

    EMBEDDING_PROVIDER_REGISTRY["bge_local"] = BGELocalEmbeddingProvider
except ImportError:  # pragma: no cover — sentence-transformers may be absent
    logger.debug("bge_embedding_provider_unavailable_sentence_transformers_missing")


# ===== Singleton instances =====
_instances: dict[str, EmbeddingProvider] = {}


def get_embedding_provider(name: str | None = None) -> EmbeddingProvider:
    """Get an embedding provider instance by name.

    Args:
        name: Provider name (e.g., 'openai', 'bge_local', 'fake').
              If None, uses EMBEDDING_PROVIDER from config.

    Returns:
        An EmbeddingProvider instance.

    Raises:
        EmbeddingProviderError: If the provider doesn't exist or isn't configured.
    """
    provider_name = name or settings.EMBEDDING_PROVIDER

    if provider_name not in EMBEDDING_PROVIDER_REGISTRY:
        available = list(EMBEDDING_PROVIDER_REGISTRY.keys())
        raise EmbeddingProviderError(
            f"Unknown embedding provider: {provider_name!r}. "
            f"Available: {available}. "
            "Install optional dependencies if a provider is missing."
        )

    if provider_name not in _instances:
        provider_cls = EMBEDDING_PROVIDER_REGISTRY[provider_name]
        _instances[provider_name] = provider_cls.from_settings()

    return _instances[provider_name]


def clear_cache() -> None:
    """Clear cached provider instances (for testing)."""
    _instances.clear()


__all__ = [
    "EMBEDDING_PROVIDER_REGISTRY",
    "EmbeddingBatch",
    "EmbeddingConnectionError",
    "EmbeddingProvider",
    "EmbeddingProviderError",
    "EmbeddingRateLimitError",
    "EmbeddingResult",
    "EmbeddingTimeoutError",
    "clear_cache",
    "get_embedding_provider",
]

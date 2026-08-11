"""Abstract base class for all embedding providers.

Every embedding provider (OpenAI, BGE local, etc.) implements this interface.
The RAG pipeline interacts ONLY through this abstraction — never with
provider-specific SDKs directly.

To add a new provider:
1. Create a new file in this directory (e.g. `mistral_provider.py`)
2. Subclass `EmbeddingProvider`
3. Implement all abstract methods
4. Register the provider in `__init__.py` EMBEDDING_PROVIDER_REGISTRY
"""

from abc import ABC, abstractmethod
from typing import Any

from app.ai.embeddings.exceptions import EmbeddingProviderError
from app.ai.embeddings.models import EmbeddingBatch, EmbeddingResult, EmbeddingUsageType
from app.core.logging import get_logger

logger = get_logger(__name__)


class EmbeddingProvider(ABC):
    """Abstract base for all embedding providers.

    Subclasses must implement:
        - embed_texts()  → embed a batch of texts (for documents)
        - embed_query()  → embed a single query (for retrieval)
        - get_info()     → provider capabilities
        - is_available() → whether the provider is configured

    Subclasses should also implement:
        - from_settings()  → classmethod constructor from app settings
    """

    def __init__(
        self,
        model_id: str,
        dimension: int,
        batch_size: int = 100,
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self.model_id = model_id
        self.dimension = dimension
        self.batch_size = batch_size
        self.timeout = timeout
        self.max_retries = max_retries

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (e.g., 'openai', 'bge_local')."""
        ...

    @classmethod
    @abstractmethod
    def from_settings(cls) -> "EmbeddingProvider":
        """Construct an instance from app settings."""
        ...

    @abstractmethod
    async def embed_texts(
        self,
        texts: list[str],
        usage_type: EmbeddingUsageType = EmbeddingUsageType.DOCUMENT,
    ) -> EmbeddingBatch:
        """Embed a batch of texts.

        Args:
            texts: List of strings to embed.
            usage_type: Whether these are queries or documents (some providers
                like BGE differentiate).

        Returns:
            EmbeddingBatch with one EmbeddingResult per input text.

        Raises:
            EmbeddingProviderError: On any provider failure.
        """
        ...

    async def embed_query(self, query: str) -> EmbeddingResult:
        """Embed a single search query.

        Default implementation calls embed_texts with a single-element list
        and returns the first result. Providers may override for efficiency.

        Args:
            query: The search query string.

        Returns:
            EmbeddingResult for the query.
        """
        batch = await self.embed_texts([query], usage_type=EmbeddingUsageType.QUERY)
        if not batch.results:
            raise EmbeddingProviderError("Empty embedding result for query")
        return batch.results[0]

    @abstractmethod
    def get_info(self) -> dict[str, Any]:
        """Return provider info (name, model, dimension, max batch, etc.)."""
        ...

    @abstractmethod
    def is_available(self) -> bool:
        """Whether this provider is properly configured and ready to use."""
        ...

    # ===== Shared utilities =====

    def _validate_texts(self, texts: list[str]) -> None:
        """Validate input texts before embedding."""
        if not texts:
            raise EmbeddingProviderError("Cannot embed empty text list")
        for i, t in enumerate(texts):
            if not isinstance(t, str):  # noqa: PLR1702
                raise EmbeddingProviderError(
                    f"Text at index {i} is not a string (got {type(t).__name__})"
                )
            if not t.strip():
                logger.warning("empty_text_at_index", index=i)

    def _chunk_batches(self, texts: list[str]) -> list[list[str]]:
        """Split a list of texts into batches of size `batch_size`."""
        return [texts[i : i + self.batch_size] for i in range(0, len(texts), self.batch_size)]

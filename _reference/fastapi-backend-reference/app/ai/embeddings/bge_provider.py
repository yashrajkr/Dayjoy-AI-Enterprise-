"""BGE local embedding provider (on-prem, no API calls).

Uses the `sentence-transformers` library to load BAAI/bge-* models locally.
This provider is preferred for:
- On-prem / air-gapped deployments
- Cost-sensitive workloads (no per-token fees)
- Latency-sensitive workloads (no network round-trip)
- Privacy-sensitive data (no data leaves the server)

The first load downloads the model from HuggingFace Hub and caches it locally.
Subsequent loads are instant. Use BGE_DEVICE=cuda for GPU acceleration.

NOTE: `sentence-transformers` is an OPTIONAL dependency. Install with:
    pip install sentence-transformers
"""

import asyncio
import time
from typing import Any

from app.ai.embeddings.base import EmbeddingProvider
from app.ai.embeddings.exceptions import EmbeddingProviderError
from app.ai.embeddings.models import EmbeddingBatch, EmbeddingResult, EmbeddingUsageType
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Map BGE model name → expected dimension
_BGE_MODEL_DIMENSIONS: dict[str, int] = {
    "BAAI/bge-small-en-v1.5": 384,
    "BAAI/bge-base-en-v1.5": 768,
    "BAAI/bge-large-en-v1.5": 1024,
    "BAAI/bge-small-zh-v1.5": 512,
    "BAAI/bge-base-zh-v1.5": 768,
    "BAAI/bge-large-zh-v1.5": 1024,
    "BAAI/bge-m3": 1024,
}


class BGELocalEmbeddingProvider(EmbeddingProvider):
    """Local BGE embedding provider (sentence-transformers)."""

    def __init__(
        self,
        model_name: str = "BAAI/bge-small-en-v1.5",
        device: str = "cpu",
        normalize: bool = True,
        batch_size: int = 64,
    ) -> None:
        super().__init__(
            model_id=model_name,
            dimension=_BGE_MODEL_DIMENSIONS.get(model_name, 384),
            batch_size=batch_size,
            timeout=0.0,  # local — no network timeout
            max_retries=0,
        )
        self.model_name = model_name
        self.device = device
        self.normalize = normalize
        self._model: Any = None

    @property
    def name(self) -> str:
        return "bge_local"

    @classmethod
    def from_settings(cls) -> "BGELocalEmbeddingProvider":
        return cls(
            model_name=settings.BGE_MODEL_NAME,
            device=settings.BGE_DEVICE,
            normalize=settings.BGE_NORMALIZE,
            batch_size=settings.EMBEDDING_BATCH_SIZE,
        )

    def _get_model(self) -> Any:
        """Lazy-load the sentence-transformers model."""
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as e:  # pragma: no cover
                raise EmbeddingProviderError(
                    "sentence-transformers not installed. Run: pip install sentence-transformers"
                ) from e
            logger.info("bge_model_loading", model=self.model_name, device=self.device)
            self._model = SentenceTransformer(self.model_name, device=self.device)
            logger.info(
                "bge_model_loaded",
                model=self.model_name,
                device=self.device,
                dimension=self.dimension,
            )
        return self._model

    async def embed_texts(
        self,
        texts: list[str],
        usage_type: EmbeddingUsageType = EmbeddingUsageType.DOCUMENT,
    ) -> EmbeddingBatch:
        self._validate_texts(texts)
        model = self._get_model()

        # sentence-transformers is sync — run in executor to not block event loop
        start = time.perf_counter()
        try:
            vectors = await asyncio.to_thread(self._encode_sync, model, texts, usage_type)
        except Exception as e:
            raise EmbeddingProviderError(f"BGE embedding failed: {e}") from e
        elapsed_ms = int((time.perf_counter() - start) * 1000)

        per_latency = elapsed_ms // max(1, len(texts))
        results: list[EmbeddingResult] = []
        for text, vec in zip(texts, vectors, strict=True):
            results.append(
                EmbeddingResult(
                    text=text,
                    vector=list(vec),
                    model=self.model_id,
                    dimension=len(vec),
                    token_count=max(1, len(text) // 4),
                    cost_cents=0,  # local — free
                    latency_ms=per_latency,
                )
            )
        return EmbeddingBatch(results=results)

    def _encode_sync(
        self,
        model: Any,
        texts: list[str],
        usage_type: EmbeddingUsageType,
    ) -> Any:
        """Run sentence-transformers encoding (sync)."""
        # BGE models recommend prefixing queries with "Represent this sentence..."
        # for retrieval tasks. We honor that for QUERY usage type.
        if usage_type == EmbeddingUsageType.QUERY:
            query_texts = [
                f"Represent this sentence for searching relevant passages: {t}" for t in texts
            ]
            return model.encode(
                query_texts,
                normalize_embeddings=self.normalize,
                batch_size=self.batch_size,
                show_progress_bar=False,
            )
        return model.encode(
            texts,
            normalize_embeddings=self.normalize,
            batch_size=self.batch_size,
            show_progress_bar=False,
        )

    def get_info(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "model_id": self.model_id,
            "dimension": self.dimension,
            "batch_size": self.batch_size,
            "available": True,  # local — always available if deps installed
            "device": self.device,
            "normalize": self.normalize,
            "description": "Local BGE embeddings (no API calls, on-prem)",
        }

    def is_available(self) -> bool:
        return True  # deps validated in _get_model

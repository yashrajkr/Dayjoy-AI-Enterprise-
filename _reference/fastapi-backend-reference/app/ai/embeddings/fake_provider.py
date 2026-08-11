"""Fake embedding provider for testing (no API calls).

Generates deterministic, hash-based pseudo-embeddings so tests can run
without any external API keys or network access. The vectors are NOT
semantically meaningful, but they ARE deterministic: the same text always
produces the same vector, which is sufficient for testing retrieval
end-to-end (tenant isolation, dedup, hybrid search mechanics, citations).
"""

import hashlib
import time
from typing import Any

from app.ai.embeddings.base import EmbeddingProvider
from app.ai.embeddings.models import EmbeddingBatch, EmbeddingResult, EmbeddingUsageType
from app.core.config import settings


class FakeEmbeddingProvider(EmbeddingProvider):
    """Deterministic fake embedding provider (no network, no API key)."""

    def __init__(
        self,
        model_id: str = "fake-embedding-v1",
        dimension: int = 128,
        batch_size: int = 100,
    ) -> None:
        super().__init__(
            model_id=model_id,
            dimension=dimension,
            batch_size=batch_size,
            timeout=0.0,
            max_retries=0,
        )

    @property
    def name(self) -> str:
        return "fake"

    @classmethod
    def from_settings(cls) -> "FakeEmbeddingProvider":
        # Use a small dimension for fast tests; align with EMBEDDING_DIMENSION
        # so vector DB collections are sized correctly when used together.
        dim = settings.EMBEDDING_DIMENSION if settings.EMBEDDING_PROVIDER == "fake" else 128
        return cls(
            model_id=f"fake-{dim}d",
            dimension=dim,
            batch_size=settings.EMBEDDING_BATCH_SIZE,
        )

    async def embed_texts(
        self,
        texts: list[str],
        usage_type: EmbeddingUsageType = EmbeddingUsageType.DOCUMENT,
    ) -> EmbeddingBatch:
        self._validate_texts(texts)
        start = time.perf_counter()
        results: list[EmbeddingResult] = []
        for text in texts:
            vec = self._hash_to_vector(text, self.dimension)
            results.append(
                EmbeddingResult(
                    text=text,
                    vector=vec,
                    model=self.model_id,
                    dimension=self.dimension,
                    token_count=max(1, len(text) // 4),
                    cost_cents=0,
                    latency_ms=0,
                )
            )
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        # Distribute timing across results
        if results:
            per = elapsed_ms // max(1, len(results))
            for r in results:
                r.latency_ms = per
        return EmbeddingBatch(results=results)

    @staticmethod
    def _hash_to_vector(text: str, dimension: int) -> list[float]:
        """Hash text to a fixed-dimension vector in [-1, 1].

        Uses SHA-256 to derive enough bytes to fill `dimension` float slots.
        The mapping is deterministic but not semantically meaningful.
        """
        # Generate enough hash bytes (each float uses 4 bytes -> 32 bits)
        needed_bytes = dimension * 4
        h = hashlib.sha256(text.encode("utf-8")).digest()
        # Extend by re-hashing if not enough bytes
        while len(h) < needed_bytes:
            h = h + hashlib.sha256(h).digest()
        # Convert bytes to floats in [-1, 1]
        vec: list[float] = []
        for i in range(dimension):
            chunk = h[i * 4 : (i + 1) * 4]
            val = int.from_bytes(chunk, "big", signed=False) / 0xFFFFFFFF  # 0..1
            vec.append(val * 2.0 - 1.0)  # remap to -1..1
        # Normalize to unit length (cosine distance compatibility)
        norm = sum(v * v for v in vec) ** 0.5
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

    def get_info(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "model_id": self.model_id,
            "dimension": self.dimension,
            "batch_size": self.batch_size,
            "available": True,
            "description": "Deterministic fake embedding for tests (no API calls)",
        }

    def is_available(self) -> bool:
        return True

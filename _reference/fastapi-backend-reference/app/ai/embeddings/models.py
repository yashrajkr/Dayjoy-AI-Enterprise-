"""Data models for embedding providers (provider-agnostic)."""

from dataclasses import dataclass, field
from enum import Enum


class EmbeddingUsageType(str, Enum):
    """How an embedding will be used (some providers optimize differently)."""

    QUERY = "query"  # for search queries
    DOCUMENT = "document"  # for indexing documents


@dataclass
class EmbeddingResult:
    """A single embedding result."""

    text: str
    vector: list[float]
    model: str
    dimension: int
    token_count: int = 0
    # Cost in USD cents (1 USD = 100 cents). 0 for local / free providers.
    cost_cents: int = 0
    latency_ms: int = 0


@dataclass
class EmbeddingBatch:
    """Result of embedding a batch of texts."""

    results: list[EmbeddingResult] = field(default_factory=list)

    @property
    def vectors(self) -> list[list[float]]:
        """Just the vectors (for direct vector DB upsert)."""
        return [r.vector for r in self.results]

    @property
    def total_tokens(self) -> int:
        return sum(r.token_count for r in self.results)

    @property
    def total_cost_cents(self) -> int:
        return sum(r.cost_cents for r in self.results)

    @property
    def total_latency_ms(self) -> int:
        return sum(r.latency_ms for r in self.results)

    @property
    def dimension(self) -> int:
        if not self.results:
            return 0
        return self.results[0].dimension

    def __len__(self) -> int:
        return len(self.results)

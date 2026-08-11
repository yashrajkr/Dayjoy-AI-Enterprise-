"""Abstract VectorStore base class.

Every vector DB implementation (Qdrant, pgvector, memory, etc.) implements
this interface. The RAG pipeline interacts ONLY through this abstraction.
"""

from abc import ABC, abstractmethod
from typing import Any

from app.ai.vector_store.base import (
    VectorPoint,
    VectorSearchFilter,
    VectorSearchResult,
    VectorStoreError,
)


class VectorStore(ABC):
    """Abstract base for vector database stores.

    Subclasses must implement:
        - ensure_collection()       → create collection if missing
        - delete_collection()       → drop collection
        - collection_exists()       → check existence
        - upsert()                  → insert / update points
        - delete()                  → delete points by ID
        - delete_by_filter()        → delete all points matching a filter
        - search()                  → similarity search
        - count()                   → count points in collection
        - from_settings()           → classmethod constructor

    Tenant isolation contract:
        Every method that reads or writes points MUST scope by organization_id.
        Implementations MUST verify the filter contains organization_id before
        executing any operation. This is enforced at the RAG layer as well.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Store identifier (e.g., 'qdrant', 'memory')."""
        ...

    @classmethod
    @abstractmethod
    def from_settings(cls) -> "VectorStore":
        """Construct an instance from app settings."""
        ...

    @abstractmethod
    async def ensure_collection(
        self,
        collection: str,
        dimension: int,
        distance: str = "Cosine",
    ) -> None:
        """Create a collection if it doesn't already exist (idempotent).

        Args:
            collection: Collection name.
            dimension: Vector dimension (must match embedding model output).
            distance: Distance metric — 'Cosine', 'Euclid', or 'Dot'.
        """
        ...

    @abstractmethod
    async def delete_collection(self, collection: str) -> None:
        """Delete an entire collection (and all its points)."""
        ...

    @abstractmethod
    async def collection_exists(self, collection: str) -> bool:
        """Check whether a collection exists."""
        ...

    @abstractmethod
    async def upsert(
        self,
        collection: str,
        points: list[VectorPoint],
    ) -> int:
        """Insert or update points.

        Args:
            collection: Target collection.
            points: List of VectorPoint (each has id, vector, payload).

        Returns:
            Number of points upserted.
        """
        ...

    @abstractmethod
    async def delete(self, collection: str, point_ids: list[str]) -> int:
        """Delete points by ID.

        Returns:
            Number of points deleted.
        """
        ...

    @abstractmethod
    async def delete_by_filter(
        self,
        collection: str,
        filter_: VectorSearchFilter,
    ) -> int:
        """Delete all points matching the filter.

        Returns:
            Number of points deleted.
        """
        ...

    @abstractmethod
    async def search(
        self,
        collection: str,
        query_vector: list[float],
        filter_: VectorSearchFilter,
        top_k: int = 10,
    ) -> list[VectorSearchResult]:
        """Similarity search.

        Args:
            collection: Collection to search.
            query_vector: Query embedding.
            filter_: Filter (organization_id REQUIRED for tenant isolation).
            top_k: Max results.

        Returns:
            List of VectorSearchResult sorted by score (descending).
        """
        ...

    @abstractmethod
    async def count(
        self,
        collection: str,
        filter_: VectorSearchFilter | None = None,
    ) -> int:
        """Count points in collection (optionally filtered)."""
        ...

    @abstractmethod
    async def fetch(
        self,
        collection: str,
        point_ids: list[str],
    ) -> list[dict[str, Any]]:
        """Fetch raw points by ID (for inspection / re-indexing).

        Returns:
            List of point dicts with id, vector, payload.
        """
        ...

    @abstractmethod
    async def close(self) -> None:
        """Close any underlying connections."""
        ...

    # ===== Shared helpers =====

    @staticmethod
    def _validate_filter(filter_: VectorSearchFilter) -> None:
        """Ensure the filter has organization_id (tenant isolation)."""
        if not filter_.organization_id:
            raise VectorStoreError(
                "organization_id is REQUIRED in VectorSearchFilter — "
                "tenant isolation must be enforced."
            )

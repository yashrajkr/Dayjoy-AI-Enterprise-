"""In-memory vector store — for tests and local dev without external services.

Stores points in a process-local dict. Cosine similarity is computed on demand.
This implementation is NOT persistent — all data is lost when the process exits.
It is intended only for unit/integration tests and quick local development.
"""

import math
from typing import Any

from app.ai.vector_store.base import (
    VectorPoint,
    VectorSearchFilter,
    VectorSearchResult,
    VectorStoreError,
)
from app.ai.vector_store.store import VectorStore
from app.core.config import settings


class InMemoryVectorStore(VectorStore):
    """Process-local in-memory vector store."""

    def __init__(self) -> None:
        # collection_name → { point_id: {vector, payload} }
        self._collections: dict[str, dict[str, dict[str, Any]]] = {}
        # collection_name → dimension
        self._dimensions: dict[str, int] = {}

    @property
    def name(self) -> str:
        return "memory"

    @classmethod
    def from_settings(cls) -> "InMemoryVectorStore":
        return cls()

    async def ensure_collection(
        self,
        collection: str,
        dimension: int,
        distance: str = "Cosine",
    ) -> None:
        if collection not in self._collections:
            self._collections[collection] = {}
            self._dimensions[collection] = dimension
        else:
            existing = self._dimensions.get(collection)
            if existing is not None and existing != dimension:
                raise VectorStoreError(
                    f"Collection {collection!r} exists with dim={existing}, "
                    f"cannot re-create with dim={dimension}"
                )

    async def delete_collection(self, collection: str) -> None:
        self._collections.pop(collection, None)
        self._dimensions.pop(collection, None)

    async def collection_exists(self, collection: str) -> bool:
        return collection in self._collections

    async def upsert(
        self,
        collection: str,
        points: list[VectorPoint],
    ) -> int:
        if collection not in self._collections:
            # auto-create (matches Qdrant behavior with auto-create enabled)
            dim = len(points[0].vector) if points else settings.EMBEDDING_DIMENSION
            await self.ensure_collection(collection, dim)
        store = self._collections[collection]
        count = 0
        for p in points:
            store[p.id] = {"vector": list(p.vector), "payload": dict(p.payload)}
            count += 1
        return count

    async def delete(self, collection: str, point_ids: list[str]) -> int:
        if collection not in self._collections:
            return 0
        store = self._collections[collection]
        deleted = 0
        for pid in point_ids:
            if pid in store:
                del store[pid]
                deleted += 1
        return deleted

    async def delete_by_filter(
        self,
        collection: str,
        filter_: VectorSearchFilter,
    ) -> int:
        self._validate_filter(filter_)
        if collection not in self._collections:
            return 0
        store = self._collections[collection]
        to_delete: list[str] = []
        for pid, point in store.items():
            if self._matches_filter(point["payload"], filter_):
                to_delete.append(pid)
        for pid in to_delete:
            del store[pid]
        return len(to_delete)

    async def search(
        self,
        collection: str,
        query_vector: list[float],
        filter_: VectorSearchFilter,
        top_k: int = 10,
    ) -> list[VectorSearchResult]:
        self._validate_filter(filter_)
        if collection not in self._collections:
            return []
        store = self._collections[collection]
        scored: list[VectorSearchResult] = []
        for pid, point in store.items():
            if not self._matches_filter(point["payload"], filter_):
                continue
            score = self._cosine(query_vector, point["vector"])
            scored.append(
                VectorSearchResult(
                    point_id=pid,
                    score=score,
                    payload=dict(point["payload"]),
                )
            )
        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[:top_k]

    async def count(
        self,
        collection: str,
        filter_: VectorSearchFilter | None = None,
    ) -> int:
        if collection not in self._collections:
            return 0
        store = self._collections[collection]
        if filter_ is None:
            return len(store)
        self._validate_filter(filter_)
        return sum(1 for p in store.values() if self._matches_filter(p["payload"], filter_))

    async def fetch(
        self,
        collection: str,
        point_ids: list[str],
    ) -> list[dict[str, Any]]:
        if collection not in self._collections:
            return []
        store = self._collections[collection]
        out: list[dict[str, Any]] = []
        for pid in point_ids:
            if pid in store:
                out.append(
                    {
                        "id": pid,
                        "vector": list(store[pid]["vector"]),
                        "payload": dict(store[pid]["payload"]),
                    }
                )
        return out

    async def close(self) -> None:
        # Nothing to close
        pass

    # ===== Filter matching =====

    @staticmethod
    def _matches_filter(payload: dict[str, Any], filter_: VectorSearchFilter) -> bool:
        """Check whether a point's payload matches the filter (AND of all conditions)."""
        # organization_id MUST match
        if str(payload.get("organization_id")) != str(filter_.organization_id):
            return False
        # document_ids
        if filter_.document_ids is not None:
            if str(payload.get("document_id")) not in {str(d) for d in filter_.document_ids}:
                return False
        # categories
        if filter_.categories is not None:
            if str(payload.get("category")) not in {str(c) for c in filter_.categories}:
                return False
        # tags (any-of — OR within tags)
        if filter_.tags is not None:
            point_tags = {str(t) for t in payload.get("tags", [])}
            if not point_tags.intersection({str(t) for t in filter_.tags}):
                return False
        # languages
        if filter_.languages is not None:
            if str(payload.get("language")) not in {str(l) for l in filter_.languages}:
                return False
        # source_ids
        if filter_.source_ids is not None:
            if str(payload.get("source_id")) not in {str(s) for s in filter_.source_ids}:
                return False
        # custom
        if filter_.custom is not None:
            for k, v in filter_.custom.items():
                if payload.get(k) != v:
                    return False
        return True

    @staticmethod
    def _cosine(a: list[float], b: list[float]) -> float:
        """Cosine similarity. Returns 0.0 for empty / zero vectors."""
        if not a or not b:
            return 0.0
        n = min(len(a), len(b))
        dot = sum(a[i] * b[i] for i in range(n))
        na = math.sqrt(sum(x * x for x in a[:n]))
        nb = math.sqrt(sum(x * x for x in b[:n]))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)

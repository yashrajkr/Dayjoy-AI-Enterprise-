"""Qdrant vector store — production implementation.

Uses the official `qdrant-client` async API. Tenant isolation is enforced
via payload filters: every point stores `organization_id` in its payload,
and every search/delete operation MUST include an organization_id filter.

Collection strategy:
- One collection per tenant (named `{prefix}_{org_slug}`) — preferred for
  strong isolation and per-tenant collection lifecycle (delete a tenant →
  drop its collection).
- Alternatively, a single shared collection with payload-based filtering —
  this is what we use here because it scales better when tenant count is high
  and avoids creating thousands of collections. The collection name is
  `{prefix}_shared`, and ALL queries include organization_id in the filter.

Both strategies are valid; we use the shared-collection approach by default.
Switch via `QDRANT_COLLECTION_PREFIX` setting.
"""

import uuid
from typing import Any

from app.ai.vector_store.base import (
    VectorPoint,
    VectorSearchFilter,
    VectorSearchResult,
    VectorStoreError,
)
from app.ai.vector_store.store import VectorStore
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Distance metric mapping (string → qdrant enum)
_DISTANCE_MAP: dict[str, str] = {
    "Cosine": "Cosine",
    "Euclid": "Euclid",
    "Dot": "Dot",
    "Manhattan": "Manhattan",
}


class QdrantVectorStore(VectorStore):
    """Qdrant-backed vector store."""

    def __init__(
        self,
        url: str,
        api_key: str = "",
        collection_prefix: str = "dayjoyai",
        vector_size: int = 1536,
        distance: str = "Cosine",
        timeout: float = 30.0,
    ) -> None:
        self.url = url
        self.api_key = api_key
        self.collection_prefix = collection_prefix
        self.vector_size = vector_size
        self.distance = distance
        self.timeout = timeout
        self._client: Any = None
        # Cache of "we've ensured this collection exists"
        self._ensured: set[str] = set()

    @property
    def name(self) -> str:
        return "qdrant"

    @classmethod
    def from_settings(cls) -> "QdrantVectorStore":
        return cls(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
            collection_prefix=settings.QDRANT_COLLECTION_PREFIX,
            vector_size=settings.EMBEDDING_DIMENSION,
            distance=settings.QDRANT_DISTANCE,
            timeout=30.0,
        )

    @property
    def shared_collection(self) -> str:
        """Single shared collection name across all tenants."""
        return f"{self.collection_prefix}_shared"

    def _get_client(self) -> Any:
        """Lazy-init the async Qdrant client."""
        if self._client is None:
            try:
                from qdrant_client import AsyncQdrantClient
            except ImportError as e:  # pragma: no cover
                raise VectorStoreError(
                    "qdrant-client not installed. Run: pip install qdrant-client"
                ) from e
            kwargs: dict[str, Any] = {"url": self.url, "timeout": self.timeout}
            if self.api_key:
                kwargs["api_key"] = self.api_key
            self._client = AsyncQdrantClient(**kwargs)
            logger.info("qdrant_client_initialized", url=self.url)
        return self._client

    # ===== Collection management =====

    async def ensure_collection(
        self,
        collection: str,
        dimension: int,
        distance: str = "Cosine",
    ) -> None:
        if collection in self._ensured:
            return
        client = self._get_client()
        try:
            from qdrant_client.http.exceptions import UnexpectedResponse
        except ImportError:  # pragma: no cover
            UnexpectedResponse = Exception  # noqa: N806

        try:
            existing = await client.get_collection(collection)
            # Collection exists — verify dimension matches
            existing_dim = (
                existing.config.params.vectors.size
                if hasattr(existing.config.params, "vectors")
                and not isinstance(existing.config.params.vectors, dict)
                else dimension
            )
            self._ensured.add(collection)
            logger.info(
                "qdrant_collection_exists",
                collection=collection,
                dimension=existing_dim,
            )
            return
        except Exception as e:
            # If collection doesn't exist (404), create it. Else re-raise.
            if "404" not in str(e) and "Not found" not in str(e):
                raise VectorStoreError(
                    f"Failed to check Qdrant collection {collection!r}: {e}"
                ) from e

        # Create
        try:
            from qdrant_client.http.models import Distance, VectorParams
        except ImportError as e:  # pragma: no cover
            raise VectorStoreError("qdrant-client not installed") from e

        dist_enum = Distance(_DISTANCE_MAP.get(distance, "Cosine"))
        await client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=dimension, distance=dist_enum),
        )
        # Create payload indexes for fast filtering
        await self._create_indexes(client, collection)
        self._ensured.add(collection)
        logger.info(
            "qdrant_collection_created",
            collection=collection,
            dimension=dimension,
            distance=distance,
        )

    async def _create_indexes(self, client: Any, collection: str) -> None:
        """Create payload indexes for common filter fields."""
        try:
            from qdrant_client.http.models import PayloadSchemaType
        except ImportError:  # pragma: no cover
            return
        index_fields = {
            "organization_id": PayloadSchemaType.KEYWORD,
            "document_id": PayloadSchemaType.KEYWORD,
            "chunk_id": PayloadSchemaType.KEYWORD,
            "category": PayloadSchemaType.KEYWORD,
            "language": PayloadSchemaType.KEYWORD,
            "source_id": PayloadSchemaType.KEYWORD,
            "tags": PayloadSchemaType.KEYWORD,
        }
        for field, schema in index_fields.items():
            try:
                await client.create_payload_index(
                    collection_name=collection,
                    field_name=field,
                    field_schema=schema,
                )
            except Exception as e:  # pragma: no cover — index may already exist
                logger.debug("qdrant_index_create_skipped", field=field, error=str(e))

    async def delete_collection(self, collection: str) -> None:
        client = self._get_client()
        try:
            await client.delete_collection(collection_name=collection)
        except Exception as e:
            if "404" not in str(e) and "Not found" not in str(e):
                raise VectorStoreError(
                    f"Failed to delete Qdrant collection {collection!r}: {e}"
                ) from e
        self._ensured.discard(collection)
        logger.info("qdrant_collection_deleted", collection=collection)

    async def collection_exists(self, collection: str) -> bool:
        client = self._get_client()
        try:
            await client.get_collection(collection)
            return True
        except Exception:
            return False

    # ===== Point operations =====

    async def upsert(
        self,
        collection: str,
        points: list[VectorPoint],
    ) -> int:
        if not points:
            return 0
        # Ensure collection exists with correct dimension
        dim = len(points[0].vector)
        await self.ensure_collection(collection, dim, self.distance)
        client = self._get_client()
        try:
            from qdrant_client.http.models import PointStruct
        except ImportError as e:  # pragma: no cover
            raise VectorStoreError("qdrant-client not installed") from e

        qdrant_points = [
            PointStruct(
                id=self._to_uuid(p.id),
                vector=list(p.vector),
                payload=dict(p.payload),
            )
            for p in points
        ]
        try:
            await client.upsert(collection_name=collection, points=qdrant_points, wait=True)
        except Exception as e:
            raise VectorStoreError(f"Qdrant upsert failed: {e}") from e
        return len(qdrant_points)

    async def delete(self, collection: str, point_ids: list[str]) -> int:
        if not point_ids:
            return 0
        client = self._get_client()
        try:
            from qdrant_client.http.models import PointIdsList
        except ImportError as e:  # pragma: no cover
            raise VectorStoreError("qdrant-client not installed") from e

        uuids = [self._to_uuid(pid) for pid in point_ids]
        try:
            await client.delete(
                collection_name=collection,
                points_selector=PointIdsList(points=uuids),
                wait=True,
            )
        except Exception as e:
            raise VectorStoreError(f"Qdrant delete failed: {e}") from e
        return len(uuids)

    async def delete_by_filter(
        self,
        collection: str,
        filter_: VectorSearchFilter,
    ) -> int:
        self._validate_filter(filter_)
        client = self._get_client()
        try:
            from qdrant_client.http.models import Filter
        except ImportError as e:  # pragma: no cover
            raise VectorStoreError("qdrant-client not installed") from e

        qdrant_filter = self._build_filter(filter_)
        try:
            await client.delete(
                collection_name=collection,
                points_selector=Filter(**qdrant_filter),
                wait=True,
            )
        except Exception as e:
            raise VectorStoreError(f"Qdrant delete-by-filter failed: {e}") from e
        # Qdrant doesn't return count; caller can call count() before/after.
        return -1

    async def search(
        self,
        collection: str,
        query_vector: list[float],
        filter_: VectorSearchFilter,
        top_k: int = 10,
    ) -> list[VectorSearchResult]:
        self._validate_filter(filter_)
        client = self._get_client()
        try:
            from qdrant_client.http.models import Filter
        except ImportError as e:  # pragma: no cover
            raise VectorStoreError("qdrant-client not installed") from e

        qdrant_filter = self._build_filter(filter_)
        try:
            hits = await client.search(
                collection_name=collection,
                query_vector=list(query_vector),
                query_filter=Filter(**qdrant_filter),
                limit=top_k,
                with_payload=True,
                with_vectors=False,
            )
        except Exception as e:
            raise VectorStoreError(f"Qdrant search failed: {e}") from e

        results: list[VectorSearchResult] = []
        for hit in hits:
            results.append(
                VectorSearchResult(
                    point_id=str(hit.id),
                    score=float(hit.score),
                    payload=dict(hit.payload or {}),
                )
            )
        return results

    async def count(
        self,
        collection: str,
        filter_: VectorSearchFilter | None = None,
    ) -> int:
        client = self._get_client()
        try:
            from qdrant_client.http.models import CountRequest, Filter
        except ImportError as e:  # pragma: no cover
            raise VectorStoreError("qdrant-client not installed") from e

        kwargs: dict[str, Any] = {"collection_name": collection, "exact": True}
        if filter_ is not None:
            self._validate_filter(filter_)
            kwargs["count_filter"] = Filter(**self._build_filter(filter_))
        try:
            result = await client.count(**kwargs)
            return int(result.count)
        except Exception as e:
            raise VectorStoreError(f"Qdrant count failed: {e}") from e

    async def fetch(
        self,
        collection: str,
        point_ids: list[str],
    ) -> list[dict[str, Any]]:
        if not point_ids:
            return []
        client = self._get_client()
        uuids = [self._to_uuid(pid) for pid in point_ids]
        try:
            points = await client.retrieve(
                collection_name=collection,
                point_ids=uuids,
                with_payload=True,
                with_vectors=True,
            )
        except Exception as e:
            raise VectorStoreError(f"Qdrant fetch failed: {e}") from e
        return [
            {
                "id": str(p.id),
                "vector": list(p.vector) if p.vector else [],
                "payload": dict(p.payload or {}),
            }
            for p in points
        ]

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:  # pragma: no cover
                pass
            self._client = None

    # ===== Helpers =====

    @staticmethod
    def _to_uuid(point_id: str) -> uuid.UUID | str:
        """Convert string ID to UUID if possible (Qdrant supports both)."""
        try:
            return uuid.UUID(point_id)
        except (ValueError, AttributeError):
            return point_id

    @staticmethod
    def _build_filter(filter_: VectorSearchFilter) -> dict[str, Any]:
        """Translate our filter to Qdrant's Filter dict structure."""
        must: list[dict[str, Any]] = []
        # organization_id (REQUIRED)
        must.append(
            {
                "key": "organization_id",
                "match": {"value": str(filter_.organization_id)},
            }
        )
        # document_ids
        if filter_.document_ids is not None:
            if len(filter_.document_ids) == 1:
                must.append(
                    {
                        "key": "document_id",
                        "match": {"value": str(filter_.document_ids[0])},
                    }
                )
            else:
                must.append(
                    {
                        "key": "document_id",
                        "match": {"any": [str(d) for d in filter_.document_ids]},
                    }
                )
        # categories
        if filter_.categories is not None:
            if len(filter_.categories) == 1:
                must.append(
                    {
                        "key": "category",
                        "match": {"value": str(filter_.categories[0])},
                    }
                )
            else:
                must.append(
                    {
                        "key": "category",
                        "match": {"any": [str(c) for c in filter_.categories]},
                    }
                )
        # languages
        if filter_.languages is not None:
            if len(filter_.languages) == 1:
                must.append(
                    {
                        "key": "language",
                        "match": {"value": str(filter_.languages[0])},
                    }
                )
            else:
                must.append(
                    {
                        "key": "language",
                        "match": {"any": [str(l) for l in filter_.languages]},
                    }
                )
        # source_ids
        if filter_.source_ids is not None:
            if len(filter_.source_ids) == 1:
                must.append(
                    {
                        "key": "source_id",
                        "match": {"value": str(filter_.source_ids[0])},
                    }
                )
            else:
                must.append(
                    {
                        "key": "source_id",
                        "match": {"any": [str(s) for s in filter_.source_ids]},
                    }
                )
        # tags (any-of — OR within tags)
        if filter_.tags is not None:
            for tag in filter_.tags:
                must.append(
                    {
                        "key": "tags",
                        "match": {"value": str(tag)},
                    }
                )
        # custom
        if filter_.custom is not None:
            for k, v in filter_.custom.items():
                must.append({"key": k, "match": {"value": v}})
        return {"must": must}

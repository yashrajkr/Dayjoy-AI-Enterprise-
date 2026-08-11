"""Vector store package — abstract interface + Qdrant + in-memory implementations.

The RAG pipeline interacts ONLY through `VectorStore` (the abstract base).
This makes it trivial to swap Qdrant for another vector DB (pgvector,
Weaviate, Pinecone, Milvus, etc.) without touching the RAG code.

Supported providers (configured via VECTOR_DB_PROVIDER):
- qdrant  — production-grade, multi-tenant via payload filters
- memory  — in-process dict, for tests / local dev without external services

To add a new vector DB:
1. Create `xxx_store.py` implementing `VectorStore`
2. Add it to VECTOR_STORE_REGISTRY below
3. Add config keys to Settings (e.g., WEAVIATE_URL)

Usage:
    from app.ai.vector_store import get_vector_store

    store = get_vector_store()
    await store.ensure_collection("my_collection", dim=1536)
    await store.upsert("my_collection", points=[...])
    results = await store.search("my_collection", query_vec=[...], top_k=10)
"""

from app.ai.vector_store.base import (
    VectorPoint,
    VectorSearchFilter,
    VectorSearchResult,
    VectorStoreError,
)
from app.ai.vector_store.memory_store import InMemoryVectorStore
from app.ai.vector_store.store import VectorStore
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ===== Registry =====
VECTOR_STORE_REGISTRY: dict[str, type[VectorStore]] = {
    "memory": InMemoryVectorStore,
}

# Conditionally register Qdrant (requires `qdrant-client`)
try:
    from app.ai.vector_store.qdrant_store import QdrantVectorStore

    VECTOR_STORE_REGISTRY["qdrant"] = QdrantVectorStore
except ImportError:  # pragma: no cover — qdrant-client may be absent in tests
    logger.debug("qdrant_store_unavailable_client_missing")


# ===== Singleton instance =====
_instance: VectorStore | None = None


def get_vector_store() -> VectorStore:
    """Get the configured vector store instance (singleton)."""
    global _instance
    if _instance is None:
        provider = settings.VECTOR_DB_PROVIDER
        if provider not in VECTOR_STORE_REGISTRY:
            available = list(VECTOR_STORE_REGISTRY.keys())
            raise VectorStoreError(
                f"Unknown VECTOR_DB_PROVIDER: {provider!r}. Available: {available}."
            )
        store_cls = VECTOR_STORE_REGISTRY[provider]
        _instance = store_cls.from_settings()
        logger.info(
            "vector_store_initialized",
            provider=provider,
            store_class=store_cls.__name__,
        )
    return _instance


def reset_vector_store() -> None:
    """Reset the singleton (for testing)."""
    global _instance
    _instance = None


__all__ = [
    "VECTOR_STORE_REGISTRY",
    "InMemoryVectorStore",
    "VectorPoint",
    "VectorSearchFilter",
    "VectorSearchResult",
    "VectorStore",
    "VectorStoreError",
    "get_vector_store",
    "reset_vector_store",
]

"""Vector store exceptions + shared data models."""

from dataclasses import dataclass, field
from typing import Any

from app.core.exceptions import AppError


class VectorStoreError(AppError):
    """Base exception for all vector store errors."""

    def __init__(self, message: str = "Vector store error") -> None:
        super().__init__(message, status_code=500, error_type="vector_store_error")


class VectorStoreConnectionError(VectorStoreError):
    """Cannot connect to vector DB."""

    def __init__(self, message: str = "Cannot connect to vector DB") -> None:
        super().__init__(message)
        self.error_type = "vector_store_connection_error"


class VectorStoreCollectionError(VectorStoreError):
    """Collection operation failed (create / delete / not found)."""

    def __init__(self, message: str = "Vector collection error") -> None:
        super().__init__(message)
        self.error_type = "vector_store_collection_error"


@dataclass
class VectorPoint:
    """A single point to upsert into the vector store."""

    id: str  # unique point ID (we use chunk UUID as string)
    vector: list[float]
    payload: dict[str, Any] = field(default_factory=dict)
    # Typical payload fields:
    #   organization_id: str   (tenant isolation — REQUIRED)
    #   document_id: str
    #   chunk_id: str
    #   chunk_index: int
    #   text: str
    #   title: str
    #   category: str | None
    #   tags: list[str]
    #   language: str
    #   page: int | None
    #   heading_path: list[str]
    #   source_uri: str | None
    #   embedding_model: str
    #   created_at: str (ISO)


@dataclass
class VectorSearchFilter:
    """Filter for vector search.

    All conditions are AND-ed together. Multi-tenancy is enforced by
    ALWAYS including organization_id in the filter.
    """

    organization_id: str  # REQUIRED for tenant isolation
    document_ids: list[str] | None = None  # restrict to specific documents
    categories: list[str] | None = None
    tags: list[str] | None = None  # any-of (OR within tags)
    languages: list[str] | None = None
    source_ids: list[str] | None = None
    # Custom key=value filters
    custom: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict (for logging / debugging)."""
        return {
            "organization_id": self.organization_id,
            "document_ids": self.document_ids,
            "categories": self.categories,
            "tags": self.tags,
            "languages": self.languages,
            "source_ids": self.source_ids,
            "custom": self.custom,
        }


@dataclass
class VectorSearchResult:
    """A single search result from the vector store."""

    point_id: str
    score: float  # similarity score (higher = better)
    payload: dict[str, Any]

    @property
    def chunk_id(self) -> str | None:
        return self.payload.get("chunk_id")

    @property
    def document_id(self) -> str | None:
        return self.payload.get("document_id")

    @property
    def text(self) -> str:
        return self.payload.get("text", "")

    @property
    def title(self) -> str | None:
        return self.payload.get("title")

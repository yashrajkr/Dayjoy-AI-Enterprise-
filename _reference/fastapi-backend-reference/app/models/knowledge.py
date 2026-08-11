"""Enterprise Knowledge Management models — Stage 2 Step 2.

Multi-tenant knowledge base with:
- knowledge_documents: top-level documents (one per uploaded file / URL / FAQ entry)
- document_versions: version tracking for each document
- document_chunks: semantic chunks (unit of retrieval)
- knowledge_sources: external sources (URLs, integrations, FAQs)
- embeddings_metadata: per-chunk embedding metadata (model, dim, hash)
- ingestion_jobs: background ingestion job tracking

Tenant isolation:
Every table has `organization_id` and every query MUST filter by it.
The vector DB layer enforces the same isolation via tenant-prefixed collections
and per-point payload filters.

NOTE: This module supplements (not replaces) the existing simpler RAG tables in
`app/models/ai.py` (RAGDocument / RAGChunk / RAGEmbedding). Those tables are
retained for backward compatibility with Phase 4 tests. The new tables below
introduce a richer schema with source management, versioning, ingestion jobs,
and embeddings metadata — designed for the production Qdrant-backed pipeline.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


# ====================================================================
# Knowledge Documents
# ====================================================================


class KnowledgeDocument(UUIDMixin, TimestampMixin, Base):
    """A top-level knowledge document owned by a tenant.

    One document = one uploaded file OR one URL crawl OR one FAQ entry OR
    one manual knowledge entry. Each document has 1..N chunks stored in the
    vector database.

    Multi-tenant: organization_id is REQUIRED and indexed.
    """

    __tablename__ = "knowledge_documents"
    __table_args__ = (
        Index("ix_knowledge_documents_org_status", "organization_id", "status"),
        Index("ix_knowledge_documents_org_category", "organization_id", "category"),
        Index("ix_knowledge_documents_org_source", "organization_id", "source_id"),
    )

    # Tenant isolation
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Source link (optional — documents can be free uploads)
    source_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("knowledge_sources.id", ondelete="SET NULL"), nullable=True
    )

    # Identity
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_uri: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Content hash for deduplication
    content_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Format: pdf, docx, txt, md, csv, json, html, web, faq, manual
    format: Mapped[str] = mapped_column(String(20), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Categorization
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list)

    # Language (ISO 639-1 code: en, hi, bn, ta, etc.)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    # Versioning
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    parent_document_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_latest: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Processing status: pending, parsing, chunking, embedding, indexing,
    # ready, failed, archived, deleted
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )

    # Stats
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    char_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Processing metadata (timing, errors, retries)
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Embedding model used (e.g. "text-embedding-3-small")
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    embedding_dimension: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Vector DB pointers
    vector_collection: Mapped[str | None] = mapped_column(String(200), nullable=True)
    vector_point_ids: Mapped[list] = mapped_column(JSONBType, default=list)

    # Audit
    uploaded_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_indexed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Flexible metadata (author, custom fields, source-specific info)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    # Soft delete
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return (
            f"<KnowledgeDocument {self.title!r} v{self.version} "
            f"status={self.status} chunks={self.chunk_count}>"
        )


# ====================================================================
# Document Versions
# ====================================================================


class DocumentVersion(UUIDMixin, TimestampMixin, Base):
    """Version history for a knowledge document.

    Each upload of the same logical document (identified by source_uri or
    content_sha256) creates a new version. Only the latest version is indexed
    by default; older versions are retained for audit and rollback.
    """

    __tablename__ = "document_versions"
    __table_args__ = (
        Index("ix_document_versions_doc", "document_id", "version"),
    )

    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Snapshot of the document at this version
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    source_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    format: Mapped[str] = mapped_column(String(20), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    # Change log
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Is this the currently active version?
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<DocumentVersion doc={self.document_id} v{self.version}>"


# ====================================================================
# Document Chunks
# ====================================================================


class DocumentChunk(UUIDMixin, TimestampMixin, Base):
    """A semantic chunk of a knowledge document.

    Chunks are the unit of retrieval. Each chunk maps to one point in the
    vector DB. The vector DB stores the embedding; this table stores the
    text + metadata + vector point ID for citation rendering.
    """

    __tablename__ = "document_chunks"
    __table_args__ = (
        Index("ix_document_chunks_doc_idx", "document_id", "chunk_index"),
        Index("ix_document_chunks_org_status", "organization_id", "status"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Chunk content
    text: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # Structural metadata
    heading_path: Mapped[list[str]] = mapped_column(JSONBType, default=list)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    char_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    # Chunk hash (for dedup detection)
    content_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Vector DB pointer
    vector_point_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # Embedding info (denormalized for quick checks)
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    embedding_dimension: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Flexible metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    # Status: ready, stale, archived, failed
    status: Mapped[str] = mapped_column(
        String(20), default="ready", nullable=False, index=True
    )
    last_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<DocumentChunk doc={self.document_id} idx={self.chunk_index}>"


# ====================================================================
# Knowledge Sources
# ====================================================================


class KnowledgeSource(UUIDMixin, TimestampMixin, Base):
    """An external knowledge source (URL, integration, FAQ collection).

    A source can produce multiple documents. For example:
    - A website source crawls N pages → N documents
    - A Confluence source syncs N pages → N documents
    - A FAQ source is a curated set of Q&A pairs → 1 document
    """

    __tablename__ = "knowledge_sources"
    __table_args__ = (
        Index("ix_knowledge_sources_org_type", "organization_id", "source_type"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Source type: web, faq, confluence, notion, gdrive, s3, manual
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Source configuration (URL, API key reference, sync schedule, etc.)
    config: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict, nullable=False)

    # Connection / sync status
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False, index=True
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sync_interval_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Stats
    document_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_chunks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Owner
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Soft delete
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<KnowledgeSource {self.name!r} type={self.source_type}>"


# ====================================================================
# Embeddings Metadata
# ====================================================================


class EmbeddingsMetadata(UUIDMixin, TimestampMixin, Base):
    """Per-chunk embedding metadata (audit + reproducibility).

    Tracks which embedding model produced each chunk's vector, the dimension,
    the content hash at embedding time, and the embedding duration. Useful for:
    - Re-indexing decisions (model changed → re-embed)
    - Cost tracking (API calls, tokens)
    - Debugging retrieval quality
    """

    __tablename__ = "embeddings_metadata"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    chunk_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_chunks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Embedding model info
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # openai, bge_local
    model_id: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), default="1.0", nullable=False)
    dimension: Mapped[int] = mapped_column(Integer, nullable=False)

    # Content snapshot
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Vector DB pointer
    vector_point_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vector_collection: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Performance
    embedding_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    api_tokens_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    api_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Status: active, stale, archived
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<EmbeddingsMetadata chunk={self.chunk_id} model={self.model_id}>"


# ====================================================================
# Ingestion Jobs
# ====================================================================


class IngestionJob(UUIDMixin, TimestampMixin, Base):
    """A background ingestion job (async document processing).

    One job = one document ingestion (parse → chunk → embed → index).
    Jobs are created when a document is uploaded and executed by the
    background worker. They track progress, retries, and final status.
    """

    __tablename__ = "ingestion_jobs"
    __table_args__ = (
        Index("ix_ingestion_jobs_org_status", "organization_id", "status"),
        Index("ix_ingestion_jobs_doc", "document_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Job type: ingest, reindex, refresh, delete
    job_type: Mapped[str] = mapped_column(String(20), default="ingest", nullable=False)

    # Status: pending, running, completed, failed, cancelled, timed_out
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )

    # Progress (0-100)
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    current_step: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Steps: queued, parsing, chunking, embedding, indexing, finalizing, done

    # Steps completed
    steps_total: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    steps_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Retry tracking
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    # Results
    chunks_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    embeddings_generated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    vectors_upserted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Error
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_step: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_traceback: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Audit
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<IngestionJob doc={self.document_id} status={self.status} progress={self.progress}%>"


# ====================================================================
# RAG Search Analytics (per-query)
# ====================================================================


class RAGSearchLog(UUIDMixin, TimestampMixin, Base):
    """Per-search analytics log for the RAG pipeline.

    Tracks every search query for analytics: latency, confidence, citations,
    fallback status. Used to compute query success rate, average latency,
    citation usage, and retrieval failure rate.
    """

    __tablename__ = "rag_search_logs"
    __table_args__ = (
        Index("ix_rag_search_logs_org_created", "organization_id", "created_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Query
    query: Mapped[str] = mapped_column(Text, nullable=False)
    query_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Filters applied
    filters: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Results
    results_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    top_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Citations
    citations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    citations: Mapped[list] = mapped_column(JSONBType, default=list)

    # Performance
    retrieval_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reranking_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Outcome
    was_fallback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    was_successful: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fallback_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Embedding model used
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vector_db: Mapped[str | None] = mapped_column(String(50), nullable=True)

    def __repr__(self) -> str:
        return f"<RAGSearchLog query={self.query!r} success={self.was_successful}>"

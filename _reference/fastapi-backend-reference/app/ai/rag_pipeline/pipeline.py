"""KnowledgeRAGService — the public entry point for RAG + knowledge management.

Wraps:
- IngestionService  (parse → chunk → embed → index)
- RetrievalPipeline (query → embed → search → rerank → cite)
- Document CRUD     (upload, list, delete, update, version history)
- Analytics         (per-search logs, aggregate metrics)

The service is multi-tenant: every method requires organization_id and
enforces isolation at the DB + vector layer.

Usage:
    from app.ai.rag_pipeline import KnowledgeRAGService

    svc = KnowledgeRAGService(db)
    doc = await svc.upload_document(
        organization_id=org_id,
        uploaded_by=user_id,
        filename="guide.pdf",
        content=pdf_bytes,
        format="pdf",
        mime_type="application/pdf",
    )
    # Background worker then runs:
    await svc.run_ingestion(doc.id)

    result = await svc.search("How do I take the wellness pack?", org_id)
    print(result["answer"], result["citations"])
"""

import hashlib
import uuid
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.document_processors import ProcessorError, detect_format
from app.ai.rag_pipeline.ingestion import IngestionError, IngestionService
from app.ai.rag_pipeline.retrieval import RetrievalPipeline
from app.ai.vector_store import VectorSearchFilter, VectorStore, get_vector_store
from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.knowledge import (
    DocumentChunk,
    DocumentVersion,
    EmbeddingsMetadata,
    IngestionJob,
    KnowledgeDocument,
    KnowledgeSource,
    RAGSearchLog,
)

logger = get_logger(__name__)


class KnowledgeRAGService:
    """Public RAG + knowledge management service (multi-tenant)."""

    def __init__(
        self,
        db: AsyncSession,
        vector_store: VectorStore | None = None,
    ) -> None:
        self.db = db
        self.vector_store = vector_store or get_vector_store()
        self.ingestion = IngestionService(db, vector_store=self.vector_store)
        self.retrieval = RetrievalPipeline(db, vector_store=self.vector_store)

    # ====================================================================
    # Document CRUD
    # ====================================================================

    async def upload_document(
        self,
        *,
        organization_id: uuid.UUID,
        uploaded_by: uuid.UUID | None = None,
        filename: str,
        content: bytes | str,
        format: str | None = None,
        mime_type: str | None = None,
        category: str | None = None,
        tags: list[str] | None = None,
        title: str | None = None,
        language: str = "en",
        source_id: uuid.UUID | None = None,
        source_uri: str | None = None,
        metadata: dict[str, Any] | None = None,
        auto_ingest: bool = True,
    ) -> KnowledgeDocument:
        """Upload a new document (or a new version of an existing one).

        If a document with the same source_uri or content_sha256 already exists
        for this tenant, a new VERSION is created instead of a duplicate.

        Args:
            organization_id: Tenant ID (REQUIRED).
            uploaded_by: User ID of the uploader.
            filename: Original filename.
            content: Raw bytes (binary) or text (text formats / URL).
            format: Document format ('pdf', 'docx', 'txt', 'md', 'csv', 'json',
                    'html', 'web', 'faq'). If None, detected from filename.
            mime_type: MIME type (used for format detection + validation).
            category: Optional category for filtering.
            tags: Optional tags for filtering.
            title: Document title (defaults to filename).
            language: ISO 639-1 language code (default 'en').
            source_id: Optional KnowledgeSource ID.
            source_uri: Optional source URI (URL / file path).
            metadata: Optional metadata dict.
            auto_ingest: If True, run ingestion immediately (synchronously).
                         For background ingestion, set to False and call
                         run_ingestion() from a worker.

        Returns:
            The created KnowledgeDocument (status='ready' if auto_ingest=True
            and ingestion succeeded, else 'pending').
        """
        # Validate file size (if bytes)
        if isinstance(content, bytes):
            size_bytes = len(content)
            max_bytes = settings.MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024
            if size_bytes > max_bytes:
                raise ValidationError(
                    f"File size {size_bytes} bytes exceeds limit "
                    f"{max_bytes} bytes ({settings.MAX_UPLOAD_FILE_SIZE_MB} MB)"
                )
        else:
            size_bytes = len(content.encode("utf-8"))

        # Detect format
        if format is None:
            try:
                format = detect_format(filename, mime_type)
            except ProcessorError as e:
                raise ValidationError(str(e)) from e

        # Validate MIME type / extension
        self._validate_upload(filename, mime_type)

        # Compute content hash (for dedup)
        if isinstance(content, bytes):
            content_sha = hashlib.sha256(content).hexdigest()
        else:
            content_sha = hashlib.sha256(content.encode("utf-8")).hexdigest()

        # Check for existing document (same tenant + source_uri or content_sha)
        existing = await self._find_existing_document(
            organization_id=str(organization_id),
            source_uri=source_uri,
            content_sha=content_sha,
        )

        if existing is not None:
            # New version of existing document
            return await self._create_new_version(
                existing=existing,
                filename=filename,
                content=content,
                format=format,
                mime_type=mime_type,
                size_bytes=size_bytes,
                content_sha=content_sha,
                category=category,
                tags=tags,
                title=title,
                language=language,
                source_id=source_id,
                source_uri=source_uri,
                metadata=metadata,
                uploaded_by=uploaded_by,
                auto_ingest=auto_ingest,
            )

        # Create new document
        doc = KnowledgeDocument(
            organization_id=str(organization_id),
            source_id=str(source_id) if source_id else None,
            title=title or filename,
            filename=filename,
            source_uri=source_uri,
            content_sha256=content_sha,
            format=format,
            mime_type=mime_type,
            size_bytes=size_bytes,
            category=category,
            tags=tags or [],
            language=language,
            version=1,
            is_latest=True,
            status="pending",
            metadata=metadata or {},
            uploaded_by=str(uploaded_by) if uploaded_by else None,
        )
        self.db.add(doc)
        await self.db.flush()

        # Auto-ingest if requested
        if auto_ingest:
            try:
                await self.ingestion.ingest_document(
                    doc.id, content, worker_id="sync-upload"
                )
            except IngestionError as e:
                logger.warning(
                    "auto_ingest_failed",
                    document_id=str(doc.id),
                    error=str(e),
                )
                # Document remains in 'failed' status; caller can retry

        return doc

    async def list_documents(
        self,
        *,
        organization_id: uuid.UUID,
        status: str | None = None,
        category: str | None = None,
        format: str | None = None,
        source_id: uuid.UUID | None = None,
        is_latest: bool | None = True,
        is_deleted: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[KnowledgeDocument], int]:
        """List documents for a tenant with optional filters.

        Returns (documents, total_count).
        """
        conditions = [
            KnowledgeDocument.organization_id == str(organization_id),
            KnowledgeDocument.is_deleted == is_deleted,
        ]
        if status is not None:
            conditions.append(KnowledgeDocument.status == status)
        if category is not None:
            conditions.append(KnowledgeDocument.category == category)
        if format is not None:
            conditions.append(KnowledgeDocument.format == format)
        if source_id is not None:
            conditions.append(KnowledgeDocument.source_id == str(source_id))
        if is_latest is not None:
            conditions.append(KnowledgeDocument.is_latest == is_latest)

        # Count
        count_stmt = select(func.count()).select_from(KnowledgeDocument).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()

        # List
        stmt = (
            select(KnowledgeDocument)
            .where(*conditions)
            .order_by(KnowledgeDocument.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        docs = list(result.scalars().all())
        return docs, total

    async def get_document(
        self,
        *,
        organization_id: uuid.UUID,
        document_id: uuid.UUID,
    ) -> KnowledgeDocument:
        """Get a single document (enforces tenant isolation)."""
        result = await self.db.execute(
            select(KnowledgeDocument).where(
                KnowledgeDocument.id == document_id,
                KnowledgeDocument.organization_id == str(organization_id),
                KnowledgeDocument.is_deleted == False,  # noqa: E712
            )
        )
        doc = result.scalar_one_or_none()
        if doc is None:
            raise NotFoundError(f"Document {document_id} not found")
        return doc

    async def delete_document(
        self,
        *,
        organization_id: uuid.UUID,
        document_id: uuid.UUID,
        soft_delete: bool = True,
    ) -> int:
        """Delete a document (and all its chunks + vectors).

        Args:
            soft_delete: If True, mark as deleted but keep the row for audit.
                         If False, hard-delete the row.

        Returns:
            Number of chunks deleted.
        """
        doc = await self.get_document(
            organization_id=organization_id, document_id=document_id
        )
        # Delete chunks + vectors
        chunks_deleted = await self.ingestion._delete_existing_chunks_and_vectors(doc)
        if soft_delete:
            doc.is_deleted = True
            doc.deleted_at = datetime.now(UTC)
            doc.status = "deleted"
            doc.chunk_count = 0
            doc.vector_point_ids = []
            await self.db.flush()
        else:
            await self.db.delete(doc)
        return chunks_deleted

    async def update_document(
        self,
        *,
        organization_id: uuid.UUID,
        document_id: uuid.UUID,
        title: str | None = None,
        category: str | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> KnowledgeDocument:
        """Update document metadata (does NOT re-ingest)."""
        doc = await self.get_document(
            organization_id=organization_id, document_id=document_id
        )
        if title is not None:
            doc.title = title
        if category is not None:
            doc.category = category
        if tags is not None:
            doc.tags = tags
        if metadata is not None:
            # Merge metadata
            merged = dict(doc.metadata_ or {})
            merged.update(metadata)
            doc.metadata_ = merged
        await self.db.flush()
        return doc

    async def get_document_versions(
        self,
        *,
        organization_id: uuid.UUID,
        document_id: uuid.UUID,
    ) -> list[DocumentVersion]:
        """Get version history for a document."""
        # Verify access
        await self.get_document(
            organization_id=organization_id, document_id=document_id
        )
        result = await self.db.execute(
            select(DocumentVersion)
            .where(
                DocumentVersion.document_id == str(document_id),
                DocumentVersion.organization_id == str(organization_id),
            )
            .order_by(DocumentVersion.version.desc())
        )
        return list(result.scalars().all())

    async def get_document_chunks(
        self,
        *,
        organization_id: uuid.UUID,
        document_id: uuid.UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[DocumentChunk], int]:
        """Get chunks for a document (paginated)."""
        # Verify access
        await self.get_document(
            organization_id=organization_id, document_id=document_id
        )
        count_stmt = (
            select(func.count())
            .select_from(DocumentChunk)
            .where(
                DocumentChunk.document_id == str(document_id),
                DocumentChunk.organization_id == str(organization_id),
            )
        )
        total = (await self.db.execute(count_stmt)).scalar_one()
        stmt = (
            select(DocumentChunk)
            .where(
                DocumentChunk.document_id == str(document_id),
                DocumentChunk.organization_id == str(organization_id),
            )
            .order_by(DocumentChunk.chunk_index)
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    # ====================================================================
    # Ingestion
    # ====================================================================

    async def run_ingestion(
        self,
        document_id: uuid.UUID,
        content: bytes | str,
        *,
        job_id: uuid.UUID | None = None,
        worker_id: str | None = None,
    ) -> KnowledgeDocument:
        """Run the full ingestion pipeline (parse → chunk → embed → index).

        Typically called by a background worker, but can be called directly
        for synchronous ingestion.
        """
        return await self.ingestion.ingest_document(
            document_id, content, job_id=job_id, worker_id=worker_id
        )

    async def reindex_document(
        self,
        *,
        organization_id: uuid.UUID,
        document_id: uuid.UUID,
        content: bytes | str | None = None,
    ) -> KnowledgeDocument:
        """Re-index a document (delete old vectors, re-embed, re-index).

        If `content` is None, the document must have a source_uri that can be
        re-fetched (e.g., URL). For uploaded files, the caller is responsible
        for providing the content again.
        """
        doc = await self.get_document(
            organization_id=organization_id, document_id=document_id
        )
        # Delete existing chunks + vectors
        await self.ingestion._delete_existing_chunks_and_vectors(doc)
        # Bump version + reset status
        doc.version += 1
        doc.status = "pending"
        doc.error_message = None
        doc.retry_count = 0
        await self.db.flush()

        if content is None:
            # For URL sources, fetch via WebProcessor
            if doc.format == "web" and doc.source_uri:
                content = doc.source_uri  # WebProcessor accepts URL as text
            else:
                raise ValidationError(
                    "Cannot re-index without content — provide content or set source_uri"
                )
        # Re-ingest
        return await self.ingestion.ingest_document(doc.id, content, worker_id="reindex")

    async def refresh_embeddings(
        self,
        *,
        organization_id: uuid.UUID,
        document_id: uuid.UUID,
    ) -> KnowledgeDocument:
        """Refresh embeddings for a document (re-embed with current model).

        This is a thin wrapper around reindex_document that requires content
        to be re-fetched. For now, it requires the caller to provide content
        via reindex_document directly.
        """
        # Same as reindex — caller must provide content
        return await self.reindex_document(
            organization_id=organization_id, document_id=document_id, content=None
        )

    async def get_ingestion_status(
        self,
        *,
        organization_id: uuid.UUID,
        document_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Get the current ingestion status for a document."""
        doc = await self.get_document(
            organization_id=organization_id, document_id=document_id
        )
        # Get latest job
        result = await self.db.execute(
            select(IngestionJob)
            .where(
                IngestionJob.document_id == str(document_id),
                IngestionJob.organization_id == str(organization_id),
            )
            .order_by(IngestionJob.created_at.desc())
            .limit(1)
        )
        job = result.scalar_one_or_none()
        return {
            "document_id": str(doc.id),
            "status": doc.status,
            "progress": job.progress if job else 0.0,
            "current_step": job.current_step if job else None,
            "chunks_created": job.chunks_created if job else 0,
            "embeddings_generated": job.embeddings_generated if job else 0,
            "vectors_upserted": job.vectors_upserted if job else 0,
            "error_message": doc.error_message or (job.error_message if job else None),
            "started_at": (job.started_at.isoformat() if job and job.started_at else None),
            "completed_at": (
                job.completed_at.isoformat() if job and job.completed_at else None
            ),
            "duration_ms": job.duration_ms if job else None,
            "retry_count": doc.retry_count,
        }

    # ====================================================================
    # Search
    # ====================================================================

    async def search(
        self,
        query: str,
        *,
        organization_id: uuid.UUID,
        document_ids: list[uuid.UUID] | None = None,
        categories: list[str] | None = None,
        tags: list[str] | None = None,
        languages: list[str] | None = None,
        source_ids: list[uuid.UUID] | None = None,
        top_k: int | None = None,
        user_id: uuid.UUID | None = None,
        conversation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Search the knowledge base using RAG.

        Returns a dict with: query, results, citations, context, confidence,
        was_fallback, answer (only if fallback).
        """
        return await self.retrieval.retrieve(
            query=query,
            organization_id=organization_id,
            document_ids=[str(d) for d in document_ids] if document_ids else None,
            categories=categories,
            tags=tags,
            languages=languages,
            source_ids=[str(s) for s in source_ids] if source_ids else None,
            top_k=top_k,
            user_id=user_id,
            conversation_id=conversation_id,
        )

    async def get_citations(
        self,
        *,
        organization_id: uuid.UUID,
        chunk_ids: list[uuid.UUID],
    ) -> list[dict[str, Any]]:
        """Get full citations for a list of chunk IDs.

        Used to render citations for a previously-retrieved answer.
        """
        if not chunk_ids:
            return []
        result = await self.db.execute(
            select(DocumentChunk, KnowledgeDocument)
            .join(
                KnowledgeDocument,
                KnowledgeDocument.id == DocumentChunk.document_id,
            )
            .where(
                DocumentChunk.id.in_(chunk_ids),
                DocumentChunk.organization_id == str(organization_id),
                KnowledgeDocument.is_deleted == False,  # noqa: E712
            )
        )
        rows = result.all()
        from app.ai.rag_pipeline.citations import build_citation

        return [
            build_citation(chunk, doc, score=1.0)
            for chunk, doc in rows
        ]

    # ====================================================================
    # Knowledge Sources
    # ====================================================================

    async def create_source(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        source_type: str,
        config: dict[str, Any],
        description: str | None = None,
        sync_interval_minutes: int | None = None,
        created_by: uuid.UUID | None = None,
    ) -> KnowledgeSource:
        """Create a new knowledge source."""
        source = KnowledgeSource(
            organization_id=str(organization_id),
            name=name,
            description=description,
            source_type=source_type,
            config=config,
            status="active",
            sync_interval_minutes=sync_interval_minutes,
            created_by=str(created_by) if created_by else None,
            is_active=True,
        )
        self.db.add(source)
        await self.db.flush()
        return source

    async def list_sources(
        self,
        *,
        organization_id: uuid.UUID,
        source_type: str | None = None,
        is_active: bool = True,
    ) -> list[KnowledgeSource]:
        """List knowledge sources for a tenant."""
        conditions = [
            KnowledgeSource.organization_id == str(organization_id),
            KnowledgeSource.is_active == is_active,
        ]
        if source_type is not None:
            conditions.append(KnowledgeSource.source_type == source_type)
        result = await self.db.execute(
            select(KnowledgeSource)
            .where(*conditions)
            .order_by(KnowledgeSource.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_source(
        self,
        *,
        organization_id: uuid.UUID,
        source_id: uuid.UUID,
        delete_documents: bool = False,
    ) -> int:
        """Delete a knowledge source.

        Args:
            delete_documents: If True, also delete all documents from this source.
                              If False, just mark the source as inactive.

        Returns:
            Number of documents deleted (0 if delete_documents=False).
        """
        result = await self.db.execute(
            select(KnowledgeSource).where(
                KnowledgeSource.id == source_id,
                KnowledgeSource.organization_id == str(organization_id),
            )
        )
        source = result.scalar_one_or_none()
        if source is None:
            raise NotFoundError(f"Source {source_id} not found")
        deleted = 0
        if delete_documents:
            docs_result = await self.db.execute(
                select(KnowledgeDocument).where(
                    KnowledgeDocument.source_id == str(source_id),
                    KnowledgeDocument.organization_id == str(organization_id),
                )
            )
            for doc in docs_result.scalars().all():
                deleted += await self.delete_document(
                    organization_id=organization_id,
                    document_id=doc.id,
                    soft_delete=True,
                )
        source.is_active = False
        source.status = "deleted"
        await self.db.flush()
        return deleted

    # ====================================================================
    # Analytics
    # ====================================================================

    async def get_analytics(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Get aggregate RAG analytics for a tenant."""
        org_id = str(organization_id)
        # Document counts by status
        doc_counts_stmt = (
            select(KnowledgeDocument.status, func.count())
            .where(
                KnowledgeDocument.organization_id == org_id,
                KnowledgeDocument.is_deleted == False,  # noqa: E712
            )
            .group_by(KnowledgeDocument.status)
        )
        doc_counts = {
            str(status): count
            for status, count in (await self.db.execute(doc_counts_stmt)).all()
        }
        # Total chunks
        total_chunks_stmt = (
            select(func.count())
            .select_from(DocumentChunk)
            .where(DocumentChunk.organization_id == org_id)
        )
        total_chunks = (await self.db.execute(total_chunks_stmt)).scalar_one()
        # Search stats (last 30 days)
        from datetime import timedelta

        cutoff = datetime.now(UTC) - timedelta(days=30)
        search_stmt = (
            select(
                func.count().label("total"),
                func.avg(RAGSearchLog.total_latency_ms).label("avg_latency_ms"),
                func.avg(RAGSearchLog.confidence).label("avg_confidence"),
                func.sum(RAGSearchLog.citations_count).label("citations_used"),
            )
            .where(
                RAGSearchLog.organization_id == org_id,
                RAGSearchLog.created_at >= cutoff,
            )
        )
        row = (await self.db.execute(search_stmt)).one()
        total_searches = row.total or 0
        # Re-query successful count separately (more portable than CAST)
        successful_stmt = (
            select(func.count())
            .select_from(RAGSearchLog)
            .where(
                RAGSearchLog.organization_id == org_id,
                RAGSearchLog.created_at >= cutoff,
                RAGSearchLog.was_successful == True,  # noqa: E712
            )
        )
        successful_searches = (await self.db.execute(successful_stmt)).scalar_one()
        return {
            "documents": doc_counts,
            "total_chunks": total_chunks,
            "searches_30d": {
                "total": total_searches,
                "successful": successful_searches,
                "success_rate": (
                    successful_searches / total_searches if total_searches > 0 else 0.0
                ),
                "avg_latency_ms": float(row.avg_latency_ms or 0),
                "avg_confidence": float(row.avg_confidence or 0),
                "citations_used": int(row.citations_used or 0),
            },
        }

    # ====================================================================
    # Manual knowledge editor
    # ====================================================================

    async def create_manual_entry(
        self,
        *,
        organization_id: uuid.UUID,
        created_by: uuid.UUID | None = None,
        title: str,
        content: str,
        category: str | None = None,
        tags: list[str] | None = None,
        language: str = "en",
        metadata: dict[str, Any] | None = None,
        auto_ingest: bool = True,
    ) -> KnowledgeDocument:
        """Create a manual knowledge entry (text content typed by a user).

        The entry is stored as format='manual' and ingested like any other
        document.
        """
        return await self.upload_document(
            organization_id=organization_id,
            uploaded_by=created_by,
            filename=f"{title}.txt",
            content=content,
            format="txt",
            mime_type="text/plain",
            category=category,
            tags=tags,
            title=title,
            language=language,
            metadata={"source_type": "manual", **(metadata or {})},
            auto_ingest=auto_ingest,
        )

    # ====================================================================
    # Internal helpers
    # ====================================================================

    def _validate_upload(self, filename: str | None, mime_type: str | None) -> None:
        """Validate file extension and MIME type against allow-lists."""
        if filename:
            ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
            if ext and ext not in settings.allowed_upload_extensions_list:
                raise ValidationError(
                    f"File extension {ext!r} not allowed. "
                    f"Allowed: {settings.allowed_upload_extensions_list}"
                )
        if mime_type and mime_type not in settings.allowed_upload_mime_types_list:
            raise ValidationError(
                f"MIME type {mime_type!r} not allowed. "
                f"Allowed: {settings.allowed_upload_mime_types_list}"
            )

    async def _find_existing_document(
        self,
        *,
        organization_id: str,
        source_uri: str | None,
        content_sha: str,
    ) -> KnowledgeDocument | None:
        """Find an existing document for the same tenant with same source or hash."""
        # Try source_uri first (more specific)
        if source_uri:
            result = await self.db.execute(
                select(KnowledgeDocument).where(
                    KnowledgeDocument.organization_id == organization_id,
                    KnowledgeDocument.source_uri == source_uri,
                    KnowledgeDocument.is_deleted == False,  # noqa: E712
                )
            )
            doc = result.scalar_one_or_none()
            if doc is not None:
                return doc
        # Try content hash
        result = await self.db.execute(
            select(KnowledgeDocument).where(
                KnowledgeDocument.organization_id == organization_id,
                KnowledgeDocument.content_sha256 == content_sha,
                KnowledgeDocument.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def _create_new_version(
        self,
        *,
        existing: KnowledgeDocument,
        filename: str,
        content: bytes | str,
        format: str,
        mime_type: str | None,
        size_bytes: int,
        content_sha: str,
        category: str | None,
        tags: list[str] | None,
        title: str | None,
        language: str,
        source_id: uuid.UUID | None,
        source_uri: str | None,
        metadata: dict[str, Any] | None,
        uploaded_by: uuid.UUID | None,
        auto_ingest: bool,
    ) -> KnowledgeDocument:
        """Create a new version of an existing document."""
        # Mark old version as not latest
        existing.is_latest = False
        await self.db.flush()
        # Create new version
        new_doc = KnowledgeDocument(
            organization_id=existing.organization_id,
            source_id=str(source_id) if source_id else existing.source_id,
            title=title or existing.title,
            filename=filename,
            source_uri=source_uri or existing.source_uri,
            content_sha256=content_sha,
            format=format,
            mime_type=mime_type,
            size_bytes=size_bytes,
            category=category or existing.category,
            tags=tags if tags is not None else (existing.tags or []),
            language=language or existing.language,
            version=existing.version + 1,
            parent_document_id=str(existing.id),
            is_latest=True,
            status="pending",
            metadata=metadata or existing.metadata_ or {},
            uploaded_by=str(uploaded_by) if uploaded_by else existing.uploaded_by,
        )
        self.db.add(new_doc)
        await self.db.flush()
        if auto_ingest:
            try:
                await self.ingestion.ingest_document(
                    new_doc.id, content, worker_id="sync-version"
                )
            except IngestionError as e:
                logger.warning(
                    "auto_ingest_version_failed",
                    document_id=str(new_doc.id),
                    error=str(e),
                )
        return new_doc

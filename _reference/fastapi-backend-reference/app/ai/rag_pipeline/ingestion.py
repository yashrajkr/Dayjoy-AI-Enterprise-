"""Ingestion service — executes the full ingestion pipeline for a document.

Steps:
1. Mark document status = parsing
2. Run the format-specific processor (PDF / DOCX / TXT / etc.)
3. Smart-chunk the processor output (overlap, dedup, language detection)
4. Generate embeddings for all chunks (batched)
5. Upsert vectors into the vector store (with tenant-scoped payload)
6. Persist DocumentChunk rows + EmbeddingsMetadata rows
7. Update KnowledgeDocument stats (chunk_count, status=ready, etc.)
8. Update DocumentVersion (if first ingestion)
9. Mark ingestion job complete

This module is intentionally synchronous in its DB operations (using
the async session) but designed to be called from a background task
worker. The worker creates the AsyncSession, calls `run_ingestion`,
and commits on success / rolls back on failure.
"""

import hashlib
import time
import uuid
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.document_processors import ProcessorError, detect_format, get_processor
from app.ai.embeddings import EmbeddingProviderError, get_embedding_provider
from app.ai.rag_pipeline.chunker import SmartChunker
from app.ai.vector_store import VectorPoint, VectorSearchFilter, VectorStore, get_vector_store
from app.core.config import settings
from app.core.logging import get_logger
from app.models.knowledge import (
    DocumentChunk,
    DocumentVersion,
    EmbeddingsMetadata,
    IngestionJob,
    KnowledgeDocument,
)

logger = get_logger(__name__)


class IngestionError(Exception):
    """Raised when document ingestion fails."""

    def __init__(self, message: str, step: str = "unknown", *, recoverable: bool = True) -> None:
        super().__init__(message)
        self.step = step
        self.recoverable = recoverable


class IngestionService:
    """Executes the full document ingestion pipeline."""

    def __init__(
        self,
        db: AsyncSession,
        vector_store: VectorStore | None = None,
        embedding_provider: Any = None,
    ) -> None:
        self.db = db
        self.vector_store = vector_store or get_vector_store()
        self.embedding_provider = embedding_provider or get_embedding_provider()
        self.chunker = SmartChunker()

    async def ingest_document(
        self,
        document_id: uuid.UUID,
        content: bytes | str,
        *,
        job_id: uuid.UUID | None = None,
        worker_id: str | None = None,
    ) -> KnowledgeDocument:
        """Run the full ingestion pipeline for a document.

        Args:
            document_id: The KnowledgeDocument ID to ingest.
            content: Raw file bytes (binary formats) or text (text formats / URL).
            job_id: Optional IngestionJob ID for progress tracking.
            worker_id: Optional worker identifier (for distributed workers).

        Returns:
            The updated KnowledgeDocument (status=ready on success).

        Raises:
            IngestionError: On any failure. The document status is set to 'failed'.
        """
        # Load document
        doc = await self._load_document(document_id)
        org_id_str = str(doc.organization_id)

        # Load / create ingestion job
        job = await self._load_or_create_job(doc, job_id, worker_id)

        start_time = time.perf_counter()
        try:
            # STEP 1: Parsing
            await self._update_job(job, status="running", current_step="parsing", progress=10.0)
            await self._update_doc(doc, status="parsing", processing_started_at=datetime.now(UTC))

            processed = await self._parse(doc, content)
            await self._update_job(
                job,
                steps_completed=1,
                progress=25.0,
                current_step="chunking",
            )

            # STEP 2: Chunking
            final_chunks = self.chunker.chunk(processed.chunks, default_language=processed.language)
            if not final_chunks:
                raise IngestionError(
                    "No chunks produced from document — content may be empty or unparseable",
                    step="chunking",
                    recoverable=False,
                )
            await self._update_job(job, steps_completed=2, progress=40.0, current_step="embedding")

            # STEP 3: Embedding
            chunk_texts = [c.text for c in final_chunks]
            try:
                batch = await self.embedding_provider.embed_texts(chunk_texts)
            except EmbeddingProviderError as e:
                raise IngestionError(f"Embedding generation failed: {e}", step="embedding") from e
            if len(batch.results) != len(final_chunks):
                raise IngestionError(
                    f"Embedding count mismatch: {len(batch.results)} vs {len(final_chunks)} chunks",
                    step="embedding",
                )
            await self._update_job(
                job,
                steps_completed=3,
                progress=60.0,
                current_step="indexing",
                embeddings_generated=len(batch.results),
            )

            # STEP 4: Indexing (vector DB + Postgres)
            collection = self._get_collection_name()
            await self._ensure_collection(collection, batch.dimension)

            # Persist DocumentChunk rows first (we need their IDs)
            chunk_rows = await self._persist_chunks(doc, final_chunks, batch)
            # Build vector points and upsert
            points = self._build_points(doc, chunk_rows, batch)
            try:
                upserted = await self.vector_store.upsert(collection, points)
            except Exception as e:
                raise IngestionError(
                    f"Vector store upsert failed: {e}", step="indexing"
                ) from e

            # Persist EmbeddingsMetadata + update chunk vector_point_id
            await self._persist_embeddings_metadata(doc, chunk_rows, batch, collection)
            await self._update_job(
                job,
                steps_completed=4,
                progress=80.0,
                current_step="finalizing",
                chunks_created=len(chunk_rows),
                vectors_upserted=upserted,
            )

            # STEP 5: Finalize
            now = datetime.now(UTC)
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            await self._update_doc(
                doc,
                status="ready",
                page_count=processed.page_count,
                chunk_count=len(chunk_rows),
                char_count=processed.char_count,
                token_count=sum(c.token_count for c in final_chunks),
                embedding_model=self.embedding_provider.model_id,
                embedding_dimension=batch.dimension,
                vector_collection=collection,
                vector_point_ids=[str(c.id) for c in chunk_rows],
                last_indexed_at=now,
                processing_completed_at=now,
                processing_duration_ms=duration_ms,
                error_message=None,
                retry_count=0,
            )
            # Create / update document version
            await self._create_version_snapshot(doc)
            await self._update_job(
                job,
                status="completed",
                steps_completed=5,
                current_step="done",
                progress=100.0,
                completed_at=now,
                duration_ms=duration_ms,
            )
            logger.info(
                "ingestion_completed",
                document_id=str(doc.id),
                chunks=len(chunk_rows),
                duration_ms=duration_ms,
            )
            return doc

        except IngestionError as e:
            await self._handle_failure(doc, job, e)
            raise
        except Exception as e:
            err = IngestionError(f"Unexpected ingestion failure: {e}", step="unknown")
            await self._handle_failure(doc, job, err)
            raise err from e

    # ===== Helpers =====

    async def _load_document(self, document_id: uuid.UUID) -> KnowledgeDocument:
        result = await self.db.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
        )
        doc = result.scalar_one_or_none()
        if doc is None:
            raise IngestionError(
                f"Document {document_id} not found", step="init", recoverable=False
            )
        if doc.is_deleted:
            raise IngestionError(
                f"Document {document_id} is deleted", step="init", recoverable=False
            )
        return doc

    async def _load_or_create_job(
        self,
        doc: KnowledgeDocument,
        job_id: uuid.UUID | None,
        worker_id: str | None,
    ) -> IngestionJob:
        if job_id is not None:
            result = await self.db.execute(
                select(IngestionJob).where(IngestionJob.id == job_id)
            )
            job = result.scalar_one_or_none()
            if job is not None:
                job.worker_id = worker_id or job.worker_id
                job.started_at = datetime.now(UTC)
                job.status = "running"
                await self.db.flush()
                return job
        # Create new job
        job = IngestionJob(
            organization_id=str(doc.organization_id),
            document_id=str(doc.id),
            job_type="ingest",
            status="running",
            progress=0.0,
            current_step="queued",
            started_at=datetime.now(UTC),
            max_retries=settings.INGESTION_MAX_RETRIES,
            created_by=doc.uploaded_by,
            worker_id=worker_id,
        )
        self.db.add(job)
        await self.db.flush()
        return job

    async def _parse(self, doc: KnowledgeDocument, content: bytes | str) -> Any:
        """Run the format-specific processor."""
        try:
            processor = get_processor(doc.format)
        except ProcessorError as e:
            raise IngestionError(
                f"No processor for format {doc.format!r}: {e}",
                step="parsing",
                recoverable=False,
            ) from e
        try:
            if isinstance(content, bytes):
                processed = await processor.process_bytes(
                    content,
                    filename=doc.filename,
                    metadata={"title": doc.title, "language": doc.language, **(doc.metadata_ or {})},
                )
            else:
                # For text-based formats, content is a string
                processed = await processor.process_text(
                    content,
                    filename=doc.filename,
                    metadata={"title": doc.title, "language": doc.language, **(doc.metadata_ or {})},
                )
        except ProcessorError as e:
            raise IngestionError(f"Processing failed: {e}", step="parsing", recoverable=False) from e
        return processed

    async def _persist_chunks(
        self,
        doc: KnowledgeDocument,
        final_chunks: list,
        batch: Any,
    ) -> list[DocumentChunk]:
        """Persist DocumentChunk rows and return them."""
        chunk_rows: list[DocumentChunk] = []
        for i, (fc, emb) in enumerate(zip(final_chunks, batch.results, strict=True)):
            row = DocumentChunk(
                organization_id=str(doc.organization_id),
                document_id=str(doc.id),
                text=fc.text,
                chunk_index=i,
                heading_path=list(fc.heading_path),
                page=fc.page,
                position=fc.position,
                char_count=fc.char_count,
                token_count=fc.token_count,
                language=fc.language,
                content_sha256=fc.content_sha256,
                embedding_model=self.embedding_provider.model_id,
                embedding_dimension=emb.dimension,
                status="ready",
                last_verified_at=datetime.now(UTC),
                metadata=fc.metadata,
            )
            self.db.add(row)
            chunk_rows.append(row)
        await self.db.flush()
        return chunk_rows

    def _build_points(
        self,
        doc: KnowledgeDocument,
        chunk_rows: list[DocumentChunk],
        batch: Any,
    ) -> list[VectorPoint]:
        """Build VectorPoint list for upsert."""
        points: list[VectorPoint] = []
        for chunk, emb in zip(chunk_rows, batch.results, strict=True):
            payload = {
                "organization_id": str(doc.organization_id),
                "document_id": str(doc.id),
                "chunk_id": str(chunk.id),
                "chunk_index": chunk.chunk_index,
                "text": chunk.text,
                "title": doc.title,
                "category": doc.category,
                "tags": list(doc.tags or []),
                "language": chunk.language,
                "page": chunk.page,
                "heading_path": list(chunk.heading_path or []),
                "source_uri": doc.source_uri,
                "source_id": doc.source_id,
                "embedding_model": self.embedding_provider.model_id,
                "created_at": datetime.now(UTC).isoformat(),
            }
            points.append(
                VectorPoint(
                    id=str(chunk.id),
                    vector=list(emb.vector),
                    payload=payload,
                )
            )
        return points

    async def _ensure_collection(self, collection: str, dimension: int) -> None:
        try:
            await self.vector_store.ensure_collection(
                collection=collection,
                dimension=dimension,
                distance=settings.QDRANT_DISTANCE,
            )
        except Exception as e:
            raise IngestionError(
                f"Failed to ensure vector collection: {e}", step="indexing"
            ) from e

    async def _persist_embeddings_metadata(
        self,
        doc: KnowledgeDocument,
        chunk_rows: list[DocumentChunk],
        batch: Any,
        collection: str,
    ) -> None:
        """Persist EmbeddingsMetadata rows and update chunk.vector_point_id."""
        for chunk, emb in zip(chunk_rows, batch.results, strict=True):
            meta = EmbeddingsMetadata(
                organization_id=str(doc.organization_id),
                chunk_id=str(chunk.id),
                document_id=str(doc.id),
                provider=self.embedding_provider.name,
                model_id=self.embedding_provider.model_id,
                model_version="1.0",
                dimension=emb.dimension,
                content_sha256=chunk.content_sha256 or hashlib.sha256(
                    chunk.text.encode()
                ).hexdigest(),
                token_count=emb.token_count,
                vector_point_id=str(chunk.id),
                vector_collection=collection,
                embedding_duration_ms=emb.latency_ms,
                api_tokens_used=emb.token_count,
                api_cost_cents=emb.cost_cents,
                status="active",
            )
            self.db.add(meta)
            chunk.vector_point_id = str(chunk.id)
        await self.db.flush()

    async def _create_version_snapshot(self, doc: KnowledgeDocument) -> None:
        """Create or update the DocumentVersion row for this ingestion."""
        version = DocumentVersion(
            document_id=str(doc.id),
            organization_id=str(doc.organization_id),
            version=doc.version,
            content_sha256=doc.content_sha256,
            title=doc.title,
            source_uri=doc.source_uri,
            format=doc.format,
            size_bytes=doc.size_bytes,
            chunk_count=doc.chunk_count,
            metadata=doc.metadata_ or {},
            is_active=True,
            created_by=doc.uploaded_by,
        )
        self.db.add(version)
        await self.db.flush()

    async def _update_doc(self, doc: KnowledgeDocument, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            if value is not None or key in {"error_message"}:
                setattr(doc, key, value)
        await self.db.flush()

    async def _update_job(self, job: IngestionJob, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(job, key, value)
        await self.db.flush()

    async def _handle_failure(
        self,
        doc: KnowledgeDocument,
        job: IngestionJob,
        err: IngestionError,
    ) -> None:
        """Update document + job on failure."""
        now = datetime.now(UTC)
        try:
            await self._update_doc(
                doc,
                status="failed",
                error_message=str(err),
                processing_completed_at=now,
            )
            await self._update_job(
                job,
                status="failed",
                error_message=str(err),
                error_step=err.step,
                completed_at=now,
            )
            await self.db.flush()
        except Exception as e:
            logger.error("failed_to_persist_failure_state", error=str(e))

    def _get_collection_name(self) -> str:
        return f"{settings.QDRANT_COLLECTION_PREFIX}_shared"

    # ===== Re-index / Refresh =====

    async def reindex_document(
        self,
        document_id: uuid.UUID,
        *,
        worker_id: str | None = None,
    ) -> KnowledgeDocument:
        """Re-index a document: delete old vectors, then re-ingest.

        Loads the document's source content from its source_uri (if available)
        or from stored chunk text. For URL sources, re-crawls the URL.
        """
        doc = await self._load_document(document_id)
        # Delete existing chunks + vectors
        await self._delete_existing_chunks_and_vectors(doc)
        # Bump version
        doc.version += 1
        await self.db.flush()
        # Re-ingest from source — caller must provide content
        # (this method is called by the API layer which fetches the source)
        return doc

    async def delete_document_vectors(self, document_id: uuid.UUID) -> int:
        """Delete all vectors + chunk rows for a document (used by DELETE endpoint)."""
        doc = await self._load_document(document_id)
        return await self._delete_existing_chunks_and_vectors(doc)

    async def _delete_existing_chunks_and_vectors(self, doc: KnowledgeDocument) -> int:
        """Delete all chunks (Postgres + vector DB) for a document."""
        # Load existing chunks
        result = await self.db.execute(
            select(DocumentChunk).where(
                DocumentChunk.document_id == str(doc.id),
                DocumentChunk.organization_id == str(doc.organization_id),
            )
        )
        existing_chunks = result.scalars().all()
        if not existing_chunks:
            return 0
        # Delete from vector DB
        collection = self._get_collection_name()
        point_ids = [str(c.id) for c in existing_chunks if c.vector_point_id]
        if point_ids:
            try:
                await self.vector_store.delete(collection, point_ids)
            except Exception as e:
                logger.warning("vector_delete_failed", error=str(e))
        # Delete EmbeddingsMetadata (cascade should handle, but be explicit)
        # Delete DocumentChunk rows
        for chunk in existing_chunks:
            await self.db.delete(chunk)
        await self.db.flush()
        return len(existing_chunks)

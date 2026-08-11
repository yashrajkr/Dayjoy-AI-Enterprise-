"""Knowledge Management API endpoints (Stage 2 Step 2 — Enterprise RAG).

Endpoints:
- POST   /knowledge/documents           — Upload a document (multipart or JSON)
- GET    /knowledge/documents           — List documents
- GET    /knowledge/documents/{id}      — Get document detail
- PATCH  /knowledge/documents/{id}      — Update document metadata
- DELETE /knowledge/documents/{id}      — Delete document (soft delete by default)
- GET    /knowledge/documents/{id}/status    — Get ingestion status
- GET    /knowledge/documents/{id}/versions  — Get version history
- GET    /knowledge/documents/{id}/chunks    — Get document chunks
- POST   /knowledge/documents/{id}/reindex   — Re-index document
- POST   /knowledge/documents/{id}/refresh   — Refresh embeddings
- POST   /knowledge/search              — Search the knowledge base (RAG)
- POST   /knowledge/citations           — Get citations for chunk IDs
- GET    /knowledge/sources             — List knowledge sources
- POST   /knowledge/sources             — Create knowledge source
- DELETE /knowledge/sources/{id}        — Delete knowledge source
- POST   /knowledge/manual              — Create manual knowledge entry
- GET    /knowledge/analytics           — Get RAG analytics
"""

import uuid
from typing import Any

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.rag_pipeline import KnowledgeRAGService
from app.api.deps import CurrentUser, DBSession, require_permission
from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.knowledge import (
    DocumentChunk,
    DocumentVersion,
    KnowledgeDocument,
    KnowledgeSource,
)
from app.repositories.organization import UserOrganizationRepository

logger = get_logger(__name__)

router = APIRouter()


# ===== Helpers =====


async def _get_org_id(user: Any, db: AsyncSession) -> uuid.UUID:
    """Get the user's primary organization ID."""
    repo = UserOrganizationRepository(db)
    orgs = await repo.get_user_organizations(user.id)
    if not orgs:
        raise ValidationError("User is not a member of any organization")
    return uuid.UUID(orgs[0].organization_id)


# ===== Schemas =====


class DocumentResponse(BaseModel):
    id: str
    title: str
    filename: str | None
    source_uri: str | None
    format: str
    mime_type: str | None
    size_bytes: int
    category: str | None
    tags: list[str]
    language: str
    version: int
    is_latest: bool
    status: str
    page_count: int | None
    chunk_count: int
    char_count: int
    token_count: int
    error_message: str | None
    retry_count: int
    embedding_model: str | None
    created_at: str
    updated_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int
    limit: int
    offset: int


class DocumentUpdateRequest(BaseModel):
    title: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    metadata: dict[str, Any] | None = None


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    document_ids: list[str] | None = None
    categories: list[str] | None = None
    tags: list[str] | None = None
    languages: list[str] | None = None
    source_ids: list[str] | None = None
    top_k: int | None = Field(None, ge=1, le=50)


class SearchResult(BaseModel):
    query: str
    results: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    context: str
    confidence: float
    top_score: float
    was_fallback: bool
    fallback_reason: str | None = None
    answer: str | None = None
    latency_ms: int
    embedding_latency_ms: int
    retrieval_latency_ms: int
    reranking_latency_ms: int
    vector_db: str
    embedding_model: str
    results_count: int


class CitationRequest(BaseModel):
    chunk_ids: list[str] = Field(..., min_length=1)


class SourceCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    source_type: str = Field(..., max_length=50)
    config: dict[str, Any] = Field(default_factory=dict)
    description: str | None = None
    sync_interval_minutes: int | None = None


class SourceResponse(BaseModel):
    id: str
    name: str
    description: str | None
    source_type: str
    config: dict[str, Any]
    status: str
    document_count: int
    total_chunks: int
    last_synced_at: str | None
    next_sync_at: str | None
    is_active: bool


class ManualEntryRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    category: str | None = None
    tags: list[str] | None = None
    language: str = "en"
    metadata: dict[str, Any] | None = None


class UploadJSONRequest(BaseModel):
    """Upload a text-based document via JSON (for URL / FAQ / raw text)."""

    filename: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    format: str | None = None
    mime_type: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    title: str | None = None
    language: str = "en"
    source_uri: str | None = None
    source_id: str | None = None
    metadata: dict[str, Any] | None = None
    auto_ingest: bool = True


# ===== Serialization =====


def _serialize_document(doc: KnowledgeDocument) -> DocumentResponse:
    return DocumentResponse(
        id=str(doc.id),
        title=doc.title,
        filename=doc.filename,
        source_uri=doc.source_uri,
        format=doc.format,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        category=doc.category,
        tags=list(doc.tags or []),
        language=doc.language,
        version=doc.version,
        is_latest=doc.is_latest,
        status=doc.status,
        page_count=doc.page_count,
        chunk_count=doc.chunk_count,
        char_count=doc.char_count,
        token_count=doc.token_count,
        error_message=doc.error_message,
        retry_count=doc.retry_count,
        embedding_model=doc.embedding_model,
        created_at=doc.created_at.isoformat() if doc.created_at else "",
        updated_at=doc.updated_at.isoformat() if doc.updated_at else "",
        metadata=dict(doc.metadata_ or {}),
    )


def _serialize_source(source: KnowledgeSource) -> SourceResponse:
    return SourceResponse(
        id=str(source.id),
        name=source.name,
        description=source.description,
        source_type=source.source_type,
        config=dict(source.config or {}),
        status=source.status,
        document_count=source.document_count,
        total_chunks=source.total_chunks,
        last_synced_at=source.last_synced_at.isoformat() if source.last_synced_at else None,
        next_sync_at=source.next_sync_at.isoformat() if source.next_sync_at else None,
        is_active=source.is_active,
    )


# ===== Document endpoints =====


@router.post(
    "/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document (multipart)",
)
async def upload_document_file(
    user: CurrentUser,
    db: DBSession,
    file: UploadFile = File(...),
    category: str | None = Form(None),
    tags: str | None = Form(None),  # comma-separated
    title: str | None = Form(None),
    language: str = Form("en"),
    source_id: str | None = Form(None),
    source_uri: str | None = Form(None),
    auto_ingest: bool = Form(True),
) -> DocumentResponse:
    """Upload a document file (multipart/form-data).

    Supports PDF, DOCX, TXT, MD, CSV, JSON, HTML.
    File size limit: MAX_UPLOAD_FILE_SIZE_MB (default 50 MB).
    """
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)

    # Read file content
    content = await file.read()
    if not content:
        raise ValidationError("Empty file")

    # Parse tags
    tag_list = [t.strip() for t in tags.split(",")] if tags else None

    doc = await svc.upload_document(
        organization_id=org_id,
        uploaded_by=user.id,
        filename=file.filename or "upload",
        content=content,
        mime_type=file.content_type,
        category=category,
        tags=tag_list,
        title=title,
        language=language,
        source_id=uuid.UUID(source_id) if source_id else None,
        source_uri=source_uri,
        auto_ingest=auto_ingest,
    )
    return _serialize_document(doc)


@router.post(
    "/documents/json",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a text/URL/FAQ document (JSON body)",
)
async def upload_document_json(
    request: UploadJSONRequest,
    user: CurrentUser,
    db: DBSession,
) -> DocumentResponse:
    """Upload a text-based document via JSON body.

    Use this endpoint for:
    - URL ingestion (format='web', content=URL)
    - FAQ ingestion (format='faq', content=JSON or Q/A text)
    - Raw text ingestion (format='txt')
    """
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    doc = await svc.upload_document(
        organization_id=org_id,
        uploaded_by=user.id,
        filename=request.filename,
        content=request.content,
        format=request.format,
        mime_type=request.mime_type,
        category=request.category,
        tags=request.tags,
        title=request.title,
        language=request.language,
        source_uri=request.source_uri,
        source_id=uuid.UUID(request.source_id) if request.source_id else None,
        metadata=request.metadata,
        auto_ingest=request.auto_ingest,
    )
    return _serialize_document(doc)


@router.get("/documents", response_model=DocumentListResponse, summary="List documents")
async def list_documents(
    user: CurrentUser,
    db: DBSession,
    status_filter: str | None = Query(None, alias="status"),
    category: str | None = None,
    format: str | None = None,
    source_id: str | None = None,
    is_latest: bool | None = True,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> DocumentListResponse:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    docs, total = await svc.list_documents(
        organization_id=org_id,
        status=status_filter,
        category=category,
        format=format,
        source_id=uuid.UUID(source_id) if source_id else None,
        is_latest=is_latest,
        limit=limit,
        offset=offset,
    )
    return DocumentListResponse(
        documents=[_serialize_document(d) for d in docs],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> DocumentResponse:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    doc = await svc.get_document(organization_id=org_id, document_id=document_id)
    return _serialize_document(doc)


@router.patch("/documents/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: uuid.UUID,
    request: DocumentUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> DocumentResponse:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    doc = await svc.update_document(
        organization_id=org_id,
        document_id=document_id,
        title=request.title,
        category=request.category,
        tags=request.tags,
        metadata=request.metadata,
    )
    return _serialize_document(doc)


@router.delete("/documents/{document_id}", summary="Delete a document")
async def delete_document(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    hard: bool = Query(False, description="Hard delete (cannot be undone)"),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    chunks_deleted = await svc.delete_document(
        organization_id=org_id,
        document_id=document_id,
        soft_delete=not hard,
    )
    return {
        "document_id": str(document_id),
        "deleted": True,
        "hard_delete": hard,
        "chunks_deleted": chunks_deleted,
    }


@router.get("/documents/{document_id}/status", summary="Get ingestion status")
async def get_ingestion_status(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    return await svc.get_ingestion_status(
        organization_id=org_id, document_id=document_id
    )


@router.get("/documents/{document_id}/versions", summary="Get version history")
async def get_document_versions(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> list[dict[str, Any]]:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    versions = await svc.get_document_versions(
        organization_id=org_id, document_id=document_id
    )
    return [
        {
            "id": str(v.id),
            "version": v.version,
            "title": v.title,
            "source_uri": v.source_uri,
            "format": v.format,
            "size_bytes": v.size_bytes,
            "chunk_count": v.chunk_count,
            "content_sha256": v.content_sha256,
            "is_active": v.is_active,
            "change_summary": v.change_summary,
            "created_by": v.created_by,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        }
        for v in versions
    ]


@router.get("/documents/{document_id}/chunks", summary="Get document chunks")
async def get_document_chunks(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    chunks, total = await svc.get_document_chunks(
        organization_id=org_id,
        document_id=document_id,
        limit=limit,
        offset=offset,
    )
    return {
        "document_id": str(document_id),
        "total": total,
        "limit": limit,
        "offset": offset,
        "chunks": [
            {
                "id": str(c.id),
                "chunk_index": c.chunk_index,
                "text": c.text,
                "heading_path": list(c.heading_path or []),
                "page": c.page,
                "position": c.position,
                "char_count": c.char_count,
                "token_count": c.token_count,
                "language": c.language,
                "content_sha256": c.content_sha256,
                "vector_point_id": c.vector_point_id,
                "embedding_model": c.embedding_model,
                "status": c.status,
                "metadata": dict(c.metadata_ or {}),
            }
            for c in chunks
        ],
    }


@router.post("/documents/{document_id}/reindex", summary="Re-index document")
async def reindex_document(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    content: str | None = None,
) -> DocumentResponse:
    """Re-index a document.

    For URL sources, the URL is re-crawled automatically.
    For file uploads, you must provide `content` again (base64 or text).
    """
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    doc = await svc.reindex_document(
        organization_id=org_id,
        document_id=document_id,
        content=content,
    )
    return _serialize_document(doc)


@router.post("/documents/{document_id}/refresh", summary="Refresh embeddings")
async def refresh_embeddings(
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> DocumentResponse:
    """Refresh embeddings for a document (re-embed with current model)."""
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    doc = await svc.refresh_embeddings(
        organization_id=org_id, document_id=document_id
    )
    return _serialize_document(doc)


# ===== Search =====


@router.post("/search", response_model=SearchResult, summary="Search the knowledge base")
async def search(
    request: SearchRequest,
    user: CurrentUser,
    db: DBSession,
) -> SearchResult:
    """Run a RAG search against the tenant's knowledge base.

    Returns:
    - results: top-K retrieved chunks with scores
    - citations: structured citations for use in the UI
    - context: formatted context string (for LLM prompting)
    - confidence: 0-1 confidence score
    - was_fallback: True if confidence was too low
    - answer: fallback message (only if was_fallback=True)
    """
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    result = await svc.search(
        query=request.query,
        organization_id=org_id,
        document_ids=[uuid.UUID(d) for d in request.document_ids] if request.document_ids else None,
        categories=request.categories,
        tags=request.tags,
        languages=request.languages,
        source_ids=[uuid.UUID(s) for s in request.source_ids] if request.source_ids else None,
        top_k=request.top_k,
        user_id=user.id,
    )
    return SearchResult(**result)


@router.post("/citations", summary="Get citations for chunk IDs")
async def get_citations(
    request: CitationRequest,
    user: CurrentUser,
    db: DBSession,
) -> list[dict[str, Any]]:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    return await svc.get_citations(
        organization_id=org_id,
        chunk_ids=[uuid.UUID(c) for c in request.chunk_ids],
    )


# ===== Knowledge Sources =====


@router.get("/sources", response_model=list[SourceResponse], summary="List sources")
async def list_sources(
    user: CurrentUser,
    db: DBSession,
    source_type: str | None = None,
) -> list[SourceResponse]:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    sources = await svc.list_sources(
        organization_id=org_id, source_type=source_type
    )
    return [_serialize_source(s) for s in sources]


@router.post(
    "/sources",
    response_model=SourceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a knowledge source",
)
async def create_source(
    request: SourceCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> SourceResponse:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    source = await svc.create_source(
        organization_id=org_id,
        name=request.name,
        source_type=request.source_type,
        config=request.config,
        description=request.description,
        sync_interval_minutes=request.sync_interval_minutes,
        created_by=user.id,
    )
    return _serialize_source(source)


@router.delete("/sources/{source_id}", summary="Delete a knowledge source")
async def delete_source(
    source_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    delete_documents: bool = Query(False),
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    deleted = await svc.delete_source(
        organization_id=org_id,
        source_id=source_id,
        delete_documents=delete_documents,
    )
    return {
        "source_id": str(source_id),
        "deleted": True,
        "documents_deleted": deleted,
    }


# ===== Manual knowledge editor =====


@router.post(
    "/manual",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a manual knowledge entry",
)
async def create_manual_entry(
    request: ManualEntryRequest,
    user: CurrentUser,
    db: DBSession,
) -> DocumentResponse:
    """Create a manual knowledge entry (typed text content)."""
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    doc = await svc.create_manual_entry(
        organization_id=org_id,
        created_by=user.id,
        title=request.title,
        content=request.content,
        category=request.category,
        tags=request.tags,
        language=request.language,
        metadata=request.metadata,
    )
    return _serialize_document(doc)


# ===== Analytics =====


@router.get("/analytics", summary="Get RAG analytics")
async def get_analytics(
    user: CurrentUser,
    db: DBSession,
) -> dict[str, Any]:
    org_id = await _get_org_id(user, db)
    svc = KnowledgeRAGService(db)
    return await svc.get_analytics(organization_id=org_id)


# ===== Config (read-only info) =====


@router.get("/config", summary="Get RAG configuration (public)")
async def get_config() -> dict[str, Any]:
    """Return the current RAG configuration (no secrets)."""
    return {
        "vector_db_provider": settings.VECTOR_DB_PROVIDER,
        "embedding_provider": settings.EMBEDDING_PROVIDER,
        "embedding_model": settings.EMBEDDING_MODEL,
        "embedding_dimension": settings.EMBEDDING_DIMENSION,
        "chunking_strategy": settings.CHUNKING_STRATEGY,
        "max_chunk_size": settings.MAX_CHUNK_SIZE,
        "min_chunk_size": settings.MIN_CHUNK_SIZE,
        "chunk_overlap": settings.CHUNK_OVERLAP,
        "retrieval_top_k": settings.RETRIEVAL_TOP_K,
        "rerank_top_k": settings.RERANK_TOP_K,
        "max_context_chunks": settings.MAX_CONTEXT_CHUNKS,
        "max_context_tokens": settings.MAX_CONTEXT_TOKENS,
        "min_similarity_threshold": settings.MIN_SIMILARITY_THRESHOLD,
        "confidence_threshold": settings.CONFIDENCE_THRESHOLD,
        "hybrid_semantic_weight": settings.HYBRID_SEMANTIC_WEIGHT,
        "hybrid_keyword_weight": settings.HYBRID_KEYWORD_WEIGHT,
        "max_upload_file_size_mb": settings.MAX_UPLOAD_FILE_SIZE_MB,
        "allowed_extensions": settings.allowed_upload_extensions_list,
        "allowed_mime_types": settings.allowed_upload_mime_types_list,
    }

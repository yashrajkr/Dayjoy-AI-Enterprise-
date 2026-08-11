"""stage 2 step 2: enterprise rag & knowledge management

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-16 00:08:00.000000

Stage 2 Step 2 — Enterprise RAG & Knowledge Management System:
- knowledge_documents (top-level documents, multi-tenant)
- document_versions (version history)
- document_chunks (semantic chunks, vector DB pointers)
- knowledge_sources (external sources: web, faq, integrations)
- embeddings_metadata (per-chunk embedding audit)
- ingestion_jobs (background ingestion tracking)
- rag_search_logs (per-query analytics)

Tenant isolation: every table has organization_id + composite indexes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== Knowledge Sources (created first — documents reference it) =====
    op.create_table(
        "knowledge_sources",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(50), nullable=False, index=True),
        sa.Column(
            "config",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("status", sa.String(20), server_default="active", nullable=False, index=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_interval_minutes", sa.Integer(), nullable=True),
        sa.Column("document_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_chunks", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_knowledge_sources_org_type",
        "knowledge_sources",
        ["organization_id", "source_type"],
    )

    # ===== Knowledge Documents =====
    op.create_table(
        "knowledge_documents",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("knowledge_sources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("filename", sa.String(500), nullable=True),
        sa.Column("source_uri", sa.Text(), nullable=True),
        sa.Column("content_sha256", sa.String(64), nullable=True, index=True),
        sa.Column("format", sa.String(20), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("category", sa.String(100), nullable=True, index=True),
        sa.Column(
            "tags",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("parent_document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_latest", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            server_default="pending",
            nullable=False,
            index=True,
        ),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("chunk_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("char_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("embedding_model", sa.String(100), nullable=True),
        sa.Column("embedding_dimension", sa.Integer(), nullable=True),
        sa.Column("vector_collection", sa.String(200), nullable=True),
        sa.Column(
            "vector_point_ids",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("last_indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_knowledge_documents_org_status",
        "knowledge_documents",
        ["organization_id", "status"],
    )
    op.create_index(
        "ix_knowledge_documents_org_category",
        "knowledge_documents",
        ["organization_id", "category"],
    )
    op.create_index(
        "ix_knowledge_documents_org_source",
        "knowledge_documents",
        ["organization_id", "source_id"],
    )

    # ===== Document Versions =====
    op.create_table(
        "document_versions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=True, index=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("source_uri", sa.Text(), nullable=True),
        sa.Column("format", sa.String(20), nullable=False),
        sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("chunk_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("change_summary", sa.String(500), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_document_versions_doc",
        "document_versions",
        ["document_id", "version"],
    )

    # ===== Document Chunks =====
    op.create_table(
        "document_chunks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column(
            "heading_path",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=True),
        sa.Column("char_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=True, index=True),
        sa.Column("vector_point_id", sa.String(100), nullable=True, index=True),
        sa.Column("embedding_model", sa.String(100), nullable=True),
        sa.Column("embedding_dimension", sa.Integer(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("status", sa.String(20), server_default="ready", nullable=False, index=True),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_document_chunks_doc_idx",
        "document_chunks",
        ["document_id", "chunk_index"],
    )
    op.create_index(
        "ix_document_chunks_org_status",
        "document_chunks",
        ["organization_id", "status"],
    )

    # ===== Embeddings Metadata =====
    op.create_table(
        "embeddings_metadata",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "chunk_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document_chunks.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model_id", sa.String(100), nullable=False),
        sa.Column("model_version", sa.String(50), server_default="1.0", nullable=False),
        sa.Column("dimension", sa.Integer(), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False, index=True),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("vector_point_id", sa.String(100), nullable=True),
        sa.Column("vector_collection", sa.String(200), nullable=True),
        sa.Column("embedding_duration_ms", sa.Integer(), nullable=True),
        sa.Column("api_tokens_used", sa.Integer(), server_default="0", nullable=False),
        sa.Column("api_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(20), server_default="active", nullable=False, index=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ===== Ingestion Jobs =====
    op.create_table(
        "ingestion_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("job_type", sa.String(20), server_default="ingest", nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False, index=True),
        sa.Column("progress", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("current_step", sa.String(50), nullable=True),
        sa.Column("steps_total", sa.Integer(), server_default="5", nullable=False),
        sa.Column("steps_completed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_retries", sa.Integer(), server_default="3", nullable=False),
        sa.Column("chunks_created", sa.Integer(), server_default="0", nullable=False),
        sa.Column("embeddings_generated", sa.Integer(), server_default="0", nullable=False),
        sa.Column("vectors_upserted", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("error_step", sa.String(50), nullable=True),
        sa.Column("error_traceback", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("worker_id", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_ingestion_jobs_org_status",
        "ingestion_jobs",
        ["organization_id", "status"],
    )

    # ===== RAG Search Logs =====
    op.create_table(
        "rag_search_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("query_hash", sa.String(64), nullable=True, index=True),
        sa.Column(
            "filters",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("results_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("top_score", sa.Float(), nullable=True),
        sa.Column("avg_score", sa.Float(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("citations_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "citations",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("retrieval_latency_ms", sa.Integer(), nullable=True),
        sa.Column("reranking_latency_ms", sa.Integer(), nullable=True),
        sa.Column("total_latency_ms", sa.Integer(), nullable=True),
        sa.Column("was_fallback", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("was_successful", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("fallback_reason", sa.String(200), nullable=True),
        sa.Column("embedding_model", sa.String(100), nullable=True),
        sa.Column("vector_db", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_rag_search_logs_org_created",
        "rag_search_logs",
        ["organization_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_rag_search_logs_org_created", table_name="rag_search_logs")
    op.drop_table("rag_search_logs")

    op.drop_index("ix_ingestion_jobs_org_status", table_name="ingestion_jobs")
    op.drop_table("ingestion_jobs")

    op.drop_table("embeddings_metadata")

    op.drop_index("ix_document_chunks_org_status", table_name="document_chunks")
    op.drop_index("ix_document_chunks_doc_idx", table_name="document_chunks")
    op.drop_table("document_chunks")

    op.drop_index("ix_document_versions_doc", table_name="document_versions")
    op.drop_table("document_versions")

    op.drop_index("ix_knowledge_documents_org_source", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_org_category", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_org_status", table_name="knowledge_documents")
    op.drop_table("knowledge_documents")

    op.drop_index("ix_knowledge_sources_org_type", table_name="knowledge_sources")
    op.drop_table("knowledge_sources")

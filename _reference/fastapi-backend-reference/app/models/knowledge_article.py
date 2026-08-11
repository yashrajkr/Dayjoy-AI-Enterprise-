"""Knowledge Base models — articles, categories, versions.

NOTE: This is the Knowledge Management System only.
RAG (embeddings, vector search) comes in Phase 4.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


class KnowledgeCategory(UUIDMixin, TimestampMixin, Base):
    """Category for knowledge articles."""

    __tablename__ = "kb_categories"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<KnowledgeCategory {self.name}>"


class KnowledgeArticle(UUIDMixin, TimestampMixin, Base):
    """A knowledge base article.

    Supports Markdown rich text, versioning, and a publishing workflow:
    draft → review → published → archived.
    """

    __tablename__ = "kb_articles"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    category_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # ===== Content =====
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    summary: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)  # Markdown
    content_html: Mapped[str | None] = mapped_column(Text, nullable=True)  # Cached HTML

    # ===== Publishing workflow =====
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False, index=True
    )  # draft, review, published, archived

    # ===== Versioning =====
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # ===== Authorship =====
    author_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ===== Metadata =====
    tags: Mapped[list] = mapped_column(JSONBType, default=list)  # JSON array
    attachments: Mapped[list] = mapped_column(JSONBType, default=list)  # JSON array of file URLs
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ===== Search =====
    search_vector: Mapped[str | None] = mapped_column(Text, nullable=True)  # For basic search

    def __repr__(self) -> str:
        return f"<KnowledgeArticle {self.title} v{self.version}>"


class KnowledgeArticleVersion(UUIDMixin, TimestampMixin, Base):
    """Version history for a knowledge article."""

    __tablename__ = "kb_article_versions"

    article_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    edited_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)

    def __repr__(self) -> str:
        return f"<KnowledgeArticleVersion article={self.article_id} v{self.version}>"

"""phase 3 core business modules

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-15 00:02:00.000000

Creates tables for:
- customers (Module 2)
- distributors (Module 3)
- categories, products, product_variants (Module 4)
- kb_categories, kb_articles, kb_article_versions (Module 5)
- tickets, ticket_comments (Module 6)
- notifications, notification_preferences (Module 7)
- file_uploads (Module 10)

All tables are multi-tenant (organization_id column + index).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== Module 2: Customers =====
    op.create_table(
        "customers",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("email", sa.String(255), nullable=True, index=True),
        sa.Column("phone", sa.String(20), nullable=True, index=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("company_name", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=False, index=True),
        sa.Column("address_line1", sa.String(255), nullable=True),
        sa.Column("address_line2", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("preferred_language", sa.String(10), server_default="en", nullable=False),
        sa.Column("timezone", sa.String(50), server_default="UTC", nullable=False),
        sa.Column("crm_contact_id", sa.String(255), nullable=True),
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
    op.create_index("ix_customers_org_name", "customers", ["organization_id", "full_name"])

    # ===== Module 3: Distributors =====
    op.create_table(
        "distributors",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("distributor_code", sa.String(50), nullable=False, unique=True, index=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True, index=True),
        sa.Column("phone", sa.String(20), nullable=True, index=True),
        sa.Column("sponsor_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("upline_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("level", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(20), server_default="active", nullable=False, index=True),
        sa.Column("rank", sa.String(50), server_default="starter", nullable=False),
        sa.Column("commission_rate", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("total_pv", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("total_bv", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("joined_at", sa.String(50), nullable=True),
        sa.Column("terminated_at", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("referral_code", sa.String(50), nullable=True, unique=True, index=True),
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

    # ===== Module 4: Products =====
    op.create_table(
        "categories",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
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

    op.create_table(
        "products",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("sku", sa.String(50), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("short_description", sa.String(500), nullable=True),
        sa.Column("price", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("compare_at_price", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(3), server_default="INR", nullable=False),
        sa.Column("pv", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("bv", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("status", sa.String(20), server_default="active", nullable=False, index=True),
        sa.Column("track_inventory", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("stock_quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("images", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("nutritional_info", sa.Text(), nullable=True),
        sa.Column("faqs", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("tags", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.Column("weight_unit", sa.String(10), server_default="g", nullable=False),
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

    op.create_table(
        "product_variants",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("sku", sa.String(50), nullable=False, unique=True, index=True),
        sa.Column("price", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("pv", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("bv", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("attributes", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("stock_quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
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

    # ===== Module 5: Knowledge Base =====
    op.create_table(
        "kb_categories",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
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

    op.create_table(
        "kb_articles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False, index=True),
        sa.Column("summary", sa.String(1000), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_html", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False, index=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tags", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("attachments", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("view_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("search_vector", sa.Text(), nullable=True),
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

    op.create_table(
        "kb_article_versions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("article_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("edited_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("change_summary", sa.String(500), nullable=True),
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

    # ===== Module 6: Tickets =====
    op.create_table(
        "tickets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("ticket_number", sa.String(20), nullable=False, unique=True, index=True),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("distributor_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False, index=True),
        sa.Column("status", sa.String(20), server_default="open", nullable=False, index=True),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("channel", sa.String(20), server_default="web", nullable=False),
        sa.Column("resolution", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_escalated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tags", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("attachments", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sla_due_at", sa.DateTime(timezone=True), nullable=True),
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

    op.create_table(
        "ticket_comments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_type", sa.String(20), server_default="user", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("attachments", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
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

    # ===== Module 7: Notifications =====
    op.create_table(
        "notifications",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("notification_type", sa.String(50), server_default="info", nullable=False),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("channels", postgresql.JSON(astext_type=sa.Text()), server_default='["in_app"]'),
        sa.Column("status", sa.String(20), server_default="sent", nullable=False),
        sa.Column("is_read", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("action_url", sa.Text(), nullable=True),
        sa.Column("action_label", sa.String(100), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
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

    op.create_table(
        "notification_preferences",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("preferences", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("quiet_hours_start", sa.String(5), nullable=True),
        sa.Column("quiet_hours_end", sa.String(5), nullable=True),
        sa.Column("timezone", sa.String(50), server_default="UTC", nullable=False),
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

    # ===== Module 10: File Uploads =====
    op.create_table(
        "file_uploads",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("storage_backend", sa.String(20), server_default="local", nullable=False),
        sa.Column("file_type", sa.String(100), nullable=False),
        sa.Column("file_extension", sa.String(10), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("access_url", sa.Text(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
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


def downgrade() -> None:
    op.drop_table("file_uploads")
    op.drop_table("notification_preferences")
    op.drop_table("notifications")
    op.drop_table("ticket_comments")
    op.drop_table("tickets")
    op.drop_table("kb_article_versions")
    op.drop_table("kb_articles")
    op.drop_table("kb_categories")
    op.drop_table("product_variants")
    op.drop_table("products")
    op.drop_table("categories")
    op.drop_table("distributors")
    op.drop_table("customers")

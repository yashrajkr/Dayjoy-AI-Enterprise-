"""initial schema — users and roles

Revision ID: 0001
Revises:
Create Date: 2026-07-15 00:00:00.000000

Creates the initial schema:
- roles table (7 default roles seeded via data migration)
- users table (with SSO + local password support)
- pgvector extension (for RAG, used in Phase 5)

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== Enable pgvector extension (for Phase 5 RAG) =====
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ===== Enable uuid-ossp (for gen_random_uuid) =====
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # ===== Roles table =====
    op.create_table(
        "roles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
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
    op.create_index("ix_roles_name", "roles", ["name"], unique=True)

    # ===== Users table =====
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        # Auth
        sa.Column("sso_subject", sa.String(255), nullable=True, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        # Authorization
        sa.Column("role", sa.String(50), nullable=False, server_default="viewer"),
        # Tenant
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Status
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        # MFA
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("mfa_secret", sa.String(255), nullable=True),
        # Metadata
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
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

    # Indexes
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_sso_subject", "users", ["sso_subject"], unique=True)
    op.create_index("ix_users_role", "users", ["role"])
    op.create_index(
        "ix_users_tenant_id",
        "users",
        ["tenant_id"],
    )

    # ===== Seed default roles =====
    roles_data = [
        ("tenant_admin", "Full tenant configuration access"),
        ("knowledge_eng", "Manages knowledge base (documents, chunks, embeddings)"),
        ("agent_dev", "Builds and configures AI agents"),
        ("ops_analyst", "Monitors live conversations and operations"),
        ("security_officer", "Compliance, audit, and security"),
        ("viewer", "Read-only access"),
        ("platform_operator", "Dayjoy AI staff (cross-tenant)"),
    ]

    roles_table = sa.table(
        "roles",
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
    )
    op.bulk_insert(roles_table, [{"name": name, "description": desc} for name, desc in roles_data])


def downgrade() -> None:
    op.drop_table("users")
    op.drop_table("roles")
    # Note: we do NOT drop the pgvector extension, as it may be used by other services
    # op.execute("DROP EXTENSION IF EXISTS vector")

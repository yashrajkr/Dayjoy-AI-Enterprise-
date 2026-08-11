"""phase 2 iam schema — organizations, roles, permissions, sessions, tokens, audit

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-15 00:01:00.000000

Phase 2 — Identity & Access Management (IAM):

- Extends `users` table with auth/security/profile fields
- Drops old `roles` table (rebuilt with full RBAC schema)
- Creates: organizations, user_organizations, roles (new), permissions,
  role_permissions, user_roles, sessions, refresh_tokens, audit_logs,
  password_reset_tokens, email_verification_tokens
- Seeds: 10 default roles + 40+ default permissions + role-permission mappings

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ===== 1. Drop old roles table (from Phase 1) =====
    op.drop_table("roles")

    # ===== 2. Extend users table with Phase 2 columns =====
    op.add_column(
        "users",
        sa.Column(
            "password_history",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
    )
    op.add_column(
        "users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column(
            "is_email_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.add_column(
        "users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column("failed_login_attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("last_login_ip", sa.String(45), nullable=True))
    op.add_column(
        "users", sa.Column("preferred_language", sa.String(10), server_default="en", nullable=False)
    )
    op.add_column(
        "users", sa.Column("timezone", sa.String(50), server_default="UTC", nullable=False)
    )
    op.add_column(
        "users",
        sa.Column(
            "notification_preferences",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )

    # Remove old columns that are now redundant
    op.drop_column("users", "is_superuser")  # replaced by super_admin role
    op.drop_column("users", "is_verified")  # replaced by is_email_verified
    op.drop_column("users", "mfa_enabled")  # will re-add in Phase 5 with proper MFA
    op.drop_column("users", "mfa_secret")
    op.drop_column("users", "avatar_url")  # will re-add as profile field
    op.drop_column("users", "tenant_id")  # replaced by user_organizations
    op.drop_column("users", "role")  # replaced by user_roles

    # ===== 3. Create organizations table =====
    op.create_table(
        "organizations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(255), nullable=False, index=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("primary_color", sa.String(7), nullable=True),
        sa.Column("plan", sa.String(50), server_default="free", nullable=False),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "settings",
            postgresql.JSON(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
        ),
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

    # ===== 4. Create user_organizations (join table) =====
    op.create_table(
        "user_organizations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("role", sa.String(50), server_default="employee", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("user_id", "organization_id", name="uq_user_org"),
    )

    # ===== 5. Create roles table (new RBAC schema) =====
    op.create_table(
        "roles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(50), nullable=False, unique=True, index=True),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("scope", sa.String(20), server_default="global", nullable=False),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
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

    # ===== 6. Create permissions table =====
    op.create_table(
        "permissions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("code", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("resource", sa.String(50), nullable=False, index=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
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

    # ===== 7. Create role_permissions (join table) =====
    op.create_table(
        "role_permissions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("permission_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
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
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_perm"),
    )

    # ===== 8. Create user_roles (join table) =====
    op.create_table(
        "user_roles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
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
        sa.UniqueConstraint("user_id", "role_id", "organization_id", name="uq_user_role_org"),
    )

    # ===== 9. Create sessions table =====
    op.create_table(
        "sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("token_jti", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column("device_type", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
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

    # ===== 10. Create refresh_tokens table =====
    op.create_table(
        "refresh_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.String(100), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
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

    # ===== 11. Create audit_logs table =====
    op.create_table(
        "audit_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "event_time",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            index=True,
        ),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("actor_type", sa.String(20), server_default="user", nullable=False),
        sa.Column("actor_email", sa.String(255), nullable=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("action", sa.String(100), nullable=False, index=True),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("outcome", sa.String(20), server_default="success", nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(255), nullable=True),
        sa.Column(
            "details", postgresql.JSON(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("previous_hash", sa.String(64), nullable=True),
        sa.Column("current_hash", sa.String(64), nullable=False, index=True),
    )
    # Note: audit_logs has no updated_at (append-only)

    # ===== 12. Create password_reset_tokens table =====
    op.create_table(
        "password_reset_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("is_used", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
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

    # ===== 13. Create email_verification_tokens table =====
    op.create_table(
        "email_verification_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("is_used", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
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

    # ===== 14. Seed default roles =====
    roles_data = [
        (
            "super_admin",
            "Super Admin",
            "Full platform access (Dayjoy AI staff only)",
            True,
            "global",
            100,
        ),
        (
            "org_owner",
            "Organization Owner",
            "Full access to their organization",
            True,
            "global",
            90,
        ),
        (
            "org_admin",
            "Organization Admin",
            "Manage users, roles, and settings in their org",
            True,
            "global",
            80,
        ),
        ("manager", "Manager", "Manage teams and view reports", True, "global", 70),
        (
            "support_exec",
            "Support Executive",
            "Handle customer support conversations",
            True,
            "global",
            60,
        ),
        (
            "sales_exec",
            "Sales Executive",
            "Handle sales conversations and leads",
            True,
            "global",
            60,
        ),
        ("employee", "Employee", "Basic platform access", True, "global", 50),
        ("customer", "Customer", "End customer (external)", True, "global", 40),
        ("distributor", "Distributor", "Direct-selling distributor", True, "global", 40),
        ("read_only", "Read-Only User", "View-only access", True, "global", 10),
    ]

    roles_table = sa.table(
        "roles",
        sa.column("name", sa.String),
        sa.column("display_name", sa.String),
        sa.column("description", sa.Text),
        sa.column("is_system", sa.Boolean),
        sa.column("scope", sa.String),
        sa.column("priority", sa.Integer),
    )
    op.bulk_insert(
        roles_table,
        [
            {
                "name": name,
                "display_name": display,
                "description": desc,
                "is_system": is_system,
                "scope": scope,
                "priority": priority,
            }
            for name, display, desc, is_system, scope, priority in roles_data
        ],
    )

    # ===== 15. Seed default permissions =====
    # Format: (code, name, resource, action, is_system)
    permissions_data = [
        # Users
        ("users:read", "View Users", "users", "read", True),
        ("users:write", "Create/Update Users", "users", "write", True),
        ("users:delete", "Delete Users", "users", "delete", True),
        ("users:manage", "Manage Users (all actions)", "users", "manage", True),
        # Organizations
        ("organizations:read", "View Organizations", "organizations", "read", True),
        ("organizations:write", "Create/Update Organizations", "organizations", "write", True),
        ("organizations:delete", "Delete Organizations", "organizations", "delete", True),
        ("organizations:manage", "Manage Organizations", "organizations", "manage", True),
        # Roles
        ("roles:read", "View Roles", "roles", "read", True),
        ("roles:write", "Create/Update Roles", "roles", "write", True),
        ("roles:delete", "Delete Roles", "roles", "delete", True),
        ("roles:assign", "Assign Roles to Users", "roles", "assign", True),
        # Permissions
        ("permissions:read", "View Permissions", "permissions", "read", True),
        ("permissions:write", "Create/Update Permissions", "permissions", "write", True),
        ("permissions:delete", "Delete Permissions", "permissions", "delete", True),
        # Sessions
        ("sessions:read", "View Sessions", "sessions", "read", True),
        ("sessions:revoke", "Revoke Sessions", "sessions", "revoke", True),
        # Audit
        ("audit:read", "View Audit Logs", "audit", "read", True),
        # Knowledge Base (Phase 5)
        ("kb:read", "View Knowledge Base", "kb", "read", True),
        ("kb:write", "Manage Knowledge Base", "kb", "write", True),
        ("kb:delete", "Delete Knowledge Base", "kb", "delete", True),
        # Agents (Phase 6)
        ("agents:read", "View Agents", "agents", "read", True),
        ("agents:write", "Configure Agents", "agents", "write", True),
        ("agents:invoke", "Invoke Agents", "agents", "invoke", True),
        # Voice (Phase 7)
        ("voice:read", "View Voice Calls", "voice", "read", True),
        ("voice:manage", "Manage Voice Calls", "voice", "manage", True),
        # Analytics (Phase 9)
        ("analytics:read", "View Analytics", "analytics", "read", True),
        ("analytics:export", "Export Analytics", "analytics", "export", True),
        # Settings
        ("settings:read", "View Settings", "settings", "read", True),
        ("settings:write", "Update Settings", "settings", "write", True),
        # Profile (self)
        ("profile:read", "View Own Profile", "profile", "read", True),
        ("profile:write", "Update Own Profile", "profile", "write", True),
    ]

    perms_table = sa.table(
        "permissions",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("resource", sa.String),
        sa.column("action", sa.String),
        sa.column("is_system", sa.Boolean),
    )
    op.bulk_insert(
        perms_table,
        [
            {
                "code": code,
                "name": name,
                "description": f"Permission: {code}",
                "resource": resource,
                "action": action,
                "is_system": is_system,
            }
            for code, name, resource, action, is_system in permissions_data
        ],
    )


def downgrade() -> None:
    # Drop Phase 2 tables
    op.drop_table("email_verification_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_table("audit_logs")
    op.drop_table("refresh_tokens")
    op.drop_table("sessions")
    op.drop_table("user_roles")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_table("user_organizations")
    op.drop_table("organizations")

    # Revert users table columns
    op.add_column("users", sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column(
        "users", sa.Column("role", sa.String(50), server_default="viewer", nullable=False)
    )
    op.add_column(
        "users",
        sa.Column("is_superuser", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("is_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("users", sa.Column("mfa_secret", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))

    op.drop_column("users", "notification_preferences")
    op.drop_column("users", "timezone")
    op.drop_column("users", "preferred_language")
    op.drop_column("users", "last_login_ip")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_attempts")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "is_email_verified")
    op.drop_column("users", "password_changed_at")
    op.drop_column("users", "password_history")

    # Recreate old roles table
    op.create_table(
        "roles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(50), nullable=False, unique=True, index=True),
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

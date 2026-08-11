"""Organization model — represents a tenant (customer company).

Multi-tenancy is enforced at three layers:
1. Database: every tenant-scoped table has an `organization_id` FK + index
2. Application: every query filters by `organization_id` from the tenant context
3. Network: (future) per-tenant K8s namespace + network policies
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType as JSONB
from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    pass


class Organization(UUIDMixin, TimestampMixin, Base):
    """A tenant organization (e.g., Dayjoy Marketing Pvt. Ltd.).

    One organization = one customer company.
    Users belong to organizations via the UserOrganization join table.
    """

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Branding (Phase 4 — placeholder)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color

    # Plan
    plan: Mapped[str] = mapped_column(String(50), default="free", nullable=False)
    # Values: free, starter, pro, enterprise

    # Trial / billing
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Settings (JSONB for flexible per-org config)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Relationships (no FK-based relationship to avoid join complexity;
    # we query UserOrganization directly via its repository)
    # users: Mapped[list["UserOrganization"]] = relationship(...)

    def __repr__(self) -> str:
        return f"<Organization {self.slug}>"


class UserOrganization(UUIDMixin, TimestampMixin, Base):
    """Association table: User ↔ Organization (many-to-many).

    A user can belong to multiple organizations.
    Each membership has a role within that organization.
    """

    __tablename__ = "user_organizations"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Role within this organization (references roles.name, not FK to keep it flexible)
    role: Mapped[str] = mapped_column(String(50), default="employee", nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    invited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # No relationship back to Organization (queried via repository)

    def __repr__(self) -> str:
        return f"<UserOrganization user={self.user_id} org={self.organization_id} role={self.role}>"

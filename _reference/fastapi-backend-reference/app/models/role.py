"""Role model — represents a named set of permissions (RBAC).

Default roles are seeded via migration:
- super_admin, org_owner, org_admin, manager, support_exec, sales_exec,
  employee, customer, distributor, read_only
"""

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import UserRole


class Role(UUIDMixin, TimestampMixin, Base):
    """A named role that groups permissions.

    Users are assigned roles via the UserRole join table.
    Roles can be system-defined (is_system=True) or custom (per-organization).
    """

    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # System roles are predefined and cannot be deleted
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Scope: 'global' (applies across orgs) or 'organization' (per-org)
    scope: Mapped[str] = mapped_column(String(20), default="global", nullable=False)

    # Priority: higher number = higher privilege (for conflict resolution)
    priority: Mapped[int] = mapped_column(default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<Role {self.name}>"


class UserRole(UUIDMixin, TimestampMixin, Base):
    """Association table: User ↔ Role (many-to-many).

    A user can have multiple roles (e.g., 'manager' in org A, 'support_exec' in org B).
    """

    __tablename__ = "user_roles"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    role_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    organization_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )  # null = global role

    def __repr__(self) -> str:
        return f"<UserRole user={self.user_id} role={self.role_id}>"

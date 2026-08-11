"""Permission and RolePermission models.

Permission: granular action rights (e.g., 'users:create', 'kb:write').
RolePermission: association between Role and Permission (many-to-many).
"""

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    pass


class Permission(UUIDMixin, TimestampMixin, Base):
    """A granular permission (e.g., 'users:read', 'kb:write').

    Permissions follow the format: '{resource}:{action}'.
    Resources: users, organizations, roles, permissions, kb, agents, voice, etc.
    Actions: read, write, delete, invoke, manage.
    """

    __tablename__ = "permissions"

    # Format: '{resource}:{action}' (e.g., 'users:read', 'kb:write')
    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Resource and action (extracted from code for querying)
    resource: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)

    # Is this a system permission (cannot be deleted)?
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<Permission {self.code}>"


class RolePermission(UUIDMixin, TimestampMixin, Base):
    """Association table: Role ↔ Permission (many-to-many).

    Grants a permission to a role.
    """

    __tablename__ = "role_permissions"

    role_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    permission_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<RolePermission role={self.role_id} perm={self.permission_id}>"

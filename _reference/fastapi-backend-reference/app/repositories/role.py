"""Role repository."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role import Role, UserRole
from app.repositories.base import BaseRepository


class RoleRepository(BaseRepository[Role]):
    """Repository for Role entity."""

    model = Role

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_by_name(self, name: str) -> Role | None:
        """Fetch a role by name."""
        result = await self.db.execute(select(Role).where(Role.name == name))
        return result.scalar_one_or_none()


class UserRoleRepository(BaseRepository[UserRole]):
    """Repository for UserRole (association) entity."""

    model = UserRole

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_user_roles(
        self, user_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> list[UserRole]:
        """Get all roles for a user (optionally filtered by org)."""
        stmt = select(UserRole).where(UserRole.user_id == str(user_id))
        if organization_id is not None:
            stmt = stmt.where(
                (UserRole.organization_id == str(organization_id))
                | (UserRole.organization_id.is_(None))
            )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def assign_role(
        self,
        user_id: uuid.UUID,
        role_id: uuid.UUID,
        organization_id: uuid.UUID | None = None,
    ) -> UserRole:
        """Assign a role to a user."""
        user_role = UserRole(
            user_id=str(user_id),
            role_id=str(role_id),
            organization_id=str(organization_id) if organization_id else None,
        )
        self.db.add(user_role)
        await self.db.flush()
        await self.db.refresh(user_role)
        return user_role

    async def revoke_role(
        self, user_id: uuid.UUID, role_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> bool:
        """Revoke a role from a user."""
        stmt = select(UserRole).where(
            UserRole.user_id == str(user_id),
            UserRole.role_id == str(role_id),
        )
        if organization_id is not None:
            stmt = stmt.where(UserRole.organization_id == str(organization_id))
        result = await self.db.execute(stmt)
        user_role = result.scalar_one_or_none()
        if user_role is None:
            return False
        await self.db.delete(user_role)
        await self.db.flush()
        return True

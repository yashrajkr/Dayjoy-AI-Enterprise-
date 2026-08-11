"""Permission repository."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import Permission, RolePermission
from app.repositories.base import BaseRepository


class PermissionRepository(BaseRepository[Permission]):
    """Repository for Permission entity."""

    model = Permission

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_by_code(self, code: str) -> Permission | None:
        """Fetch a permission by its code (e.g., 'users:read')."""
        result = await self.db.execute(select(Permission).where(Permission.code == code))
        return result.scalar_one_or_none()

    async def get_by_codes(self, codes: list[str]) -> list[Permission]:
        """Fetch multiple permissions by their codes."""
        result = await self.db.execute(select(Permission).where(Permission.code.in_(codes)))
        return list(result.scalars().all())

    async def get_by_resource(self, resource: str) -> list[Permission]:
        """Fetch all permissions for a resource."""
        result = await self.db.execute(select(Permission).where(Permission.resource == resource))
        return list(result.scalars().all())


class RolePermissionRepository(BaseRepository[RolePermission]):
    """Repository for RolePermission (association) entity."""

    model = RolePermission

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_role_permissions(self, role_id: uuid.UUID) -> list[RolePermission]:
        """Get all permissions for a role."""
        result = await self.db.execute(
            select(RolePermission).where(RolePermission.role_id == str(role_id))
        )
        return list(result.scalars().all())

    async def grant_permission(
        self, role_id: uuid.UUID, permission_id: uuid.UUID
    ) -> RolePermission:
        """Grant a permission to a role."""
        rp = RolePermission(role_id=str(role_id), permission_id=str(permission_id))
        self.db.add(rp)
        await self.db.flush()
        await self.db.refresh(rp)
        return rp

    async def revoke_permission(self, role_id: uuid.UUID, permission_id: uuid.UUID) -> bool:
        """Revoke a permission from a role."""
        result = await self.db.execute(
            select(RolePermission).where(
                RolePermission.role_id == str(role_id),
                RolePermission.permission_id == str(permission_id),
            )
        )
        rp = result.scalar_one_or_none()
        if rp is None:
            return False
        await self.db.delete(rp)
        await self.db.flush()
        return True

    async def revoke_all_for_role(self, role_id: uuid.UUID) -> int:
        """Revoke all permissions from a role (used before re-assigning)."""
        result = await self.db.execute(
            select(RolePermission).where(RolePermission.role_id == str(role_id))
        )
        perms = list(result.scalars().all())
        for rp in perms:
            await self.db.delete(rp)
        await self.db.flush()
        return len(perms)

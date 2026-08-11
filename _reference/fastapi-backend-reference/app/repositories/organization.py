"""Organization repository."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization, UserOrganization
from app.repositories.base import BaseRepository


class OrganizationRepository(BaseRepository[Organization]):
    """Repository for Organization entity."""

    model = Organization

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_by_slug(self, slug: str) -> Organization | None:
        """Fetch an organization by slug."""
        result = await self.db.execute(select(Organization).where(Organization.slug == slug))
        return result.scalar_one_or_none()

    async def slug_exists(self, slug: str) -> bool:
        """Check if a slug is already taken."""
        return await self.get_by_slug(slug) is not None

    async def get_member_count(self, org_id: uuid.UUID) -> int:
        """Count active members in an organization."""
        result = await self.db.execute(
            select(func.count())
            .select_from(UserOrganization)
            .where(
                UserOrganization.organization_id == org_id,
                UserOrganization.is_active == True,  # noqa: E712
            )
        )
        return int(result.scalar_one_or_none() or 0)


class UserOrganizationRepository(BaseRepository[UserOrganization]):
    """Repository for UserOrganization (membership) entity."""

    model = UserOrganization

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_by_user_and_org(
        self, user_id: uuid.UUID, organization_id: uuid.UUID
    ) -> UserOrganization | None:
        """Get a user's membership in an organization."""
        result = await self.db.execute(
            select(UserOrganization).where(
                UserOrganization.user_id == str(user_id),
                UserOrganization.organization_id == str(organization_id),
            )
        )
        return result.scalar_one_or_none()

    async def get_user_organizations(self, user_id: uuid.UUID) -> list[UserOrganization]:
        """Get all organizations a user belongs to."""
        result = await self.db.execute(
            select(UserOrganization).where(
                UserOrganization.user_id == str(user_id),
                UserOrganization.is_active == True,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def add_user_to_org(
        self,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
        role: str = "employee",
    ) -> UserOrganization:
        """Add a user to an organization with a role."""
        membership = UserOrganization(
            user_id=str(user_id),
            organization_id=str(organization_id),
            role=role,
            is_active=True,
        )
        self.db.add(membership)
        await self.db.flush()
        await self.db.refresh(membership)
        return membership

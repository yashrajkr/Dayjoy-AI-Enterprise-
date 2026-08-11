"""Organization service."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.repositories.organization import OrganizationRepository, UserOrganizationRepository
from app.schemas.organization import OrganizationCreate, OrganizationResponse, OrganizationUpdate
from app.services.audit import AuditService


class OrganizationService:
    """Service for organization management."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.org_repo = OrganizationRepository(db)
        self.user_org_repo = UserOrganizationRepository(db)
        self.audit = AuditService(db)

    async def get_organization(self, org_id: uuid.UUID) -> OrganizationResponse:
        """Get an organization by ID."""
        org = await self.org_repo.get_by_id(org_id)
        if org is None:
            raise NotFoundError("Organization", str(org_id))
        return self._to_response(org)

    async def list_organizations(
        self, skip: int = 0, limit: int = 100
    ) -> list[OrganizationResponse]:
        """List all organizations."""
        orgs = await self.org_repo.get_all(skip=skip, limit=limit)
        return [self._to_response(org) for org in orgs]

    async def create_organization(
        self,
        request: OrganizationCreate,
        actor_id: uuid.UUID | None = None,
    ) -> OrganizationResponse:
        """Create a new organization."""
        slug = request.slug or request.name.lower().replace(" ", "-")
        if await self.org_repo.slug_exists(slug):
            raise ConflictError(f"Organization slug '{slug}' already exists")

        org = await self.org_repo.create(
            name=request.name,
            slug=slug,
            description=request.description,
            plan=request.plan,
            is_active=True,
        )

        await self.audit.log(
            action="organization.create",
            actor_id=actor_id,
            resource_type="organization",
            resource_id=org.id,
            details={"name": org.name, "slug": org.slug},
        )

        return self._to_response(org)

    async def update_organization(
        self,
        org_id: uuid.UUID,
        request: OrganizationUpdate,
        actor_id: uuid.UUID | None = None,
    ) -> OrganizationResponse:
        """Update an organization."""
        updates = request.model_dump(exclude_unset=True)
        org = await self.org_repo.update(org_id, **updates)
        if org is None:
            raise NotFoundError("Organization", str(org_id))

        await self.audit.log(
            action="organization.update",
            actor_id=actor_id,
            organization_id=org_id,
            resource_type="organization",
            resource_id=org_id,
            details=updates,
        )

        return self._to_response(org)

    async def delete_organization(
        self,
        org_id: uuid.UUID,
        actor_id: uuid.UUID | None = None,
    ) -> None:
        """Soft-delete an organization (set is_active=False)."""
        org = await self.org_repo.get_by_id(org_id)
        if org is None:
            raise NotFoundError("Organization", str(org_id))

        await self.org_repo.update(org_id, is_active=False)

        await self.audit.log(
            action="organization.delete",
            actor_id=actor_id,
            organization_id=org_id,
            resource_type="organization",
            resource_id=org_id,
        )

    def _to_response(self, org) -> OrganizationResponse:
        """Convert ORM object to response schema."""
        return OrganizationResponse(
            id=org.id,
            name=org.name,
            slug=org.slug,
            description=org.description,
            is_active=org.is_active,
            plan=org.plan,
            logo_url=org.logo_url,
            primary_color=org.primary_color,
            created_at=org.created_at,
            updated_at=org.updated_at,
            member_count=None,
        )

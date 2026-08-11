"""Organization endpoints."""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_permission
from app.core.database import get_db
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
)
from app.services.organization import OrganizationService

router = APIRouter()


@router.get(
    "",
    response_model=list[OrganizationResponse],
    summary="List organizations",
    dependencies=[Depends(require_permission("organizations:read"))],
)
async def list_organizations(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
) -> list[OrganizationResponse]:
    """List all organizations."""
    service = OrganizationService(db)
    return await service.list_organizations(skip=skip, limit=limit)


@router.get(
    "/{org_id}",
    response_model=OrganizationResponse,
    summary="Get an organization",
    dependencies=[Depends(require_permission("organizations:read"))],
)
async def get_organization(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> OrganizationResponse:
    """Get an organization by ID."""
    service = OrganizationService(db)
    return await service.get_organization(org_id)


@router.post(
    "",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an organization",
    dependencies=[Depends(require_permission("organizations:write"))],
)
async def create_organization(
    request: OrganizationCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OrganizationResponse:
    """Create a new organization."""
    service = OrganizationService(db)
    return await service.create_organization(request, actor_id=user.id)


@router.patch(
    "/{org_id}",
    response_model=OrganizationResponse,
    summary="Update an organization",
    dependencies=[Depends(require_permission("organizations:write"))],
)
async def update_organization(
    org_id: uuid.UUID,
    request: OrganizationUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OrganizationResponse:
    """Update an organization."""
    service = OrganizationService(db)
    return await service.update_organization(org_id, request, actor_id=user.id)


@router.delete(
    "/{org_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an organization (soft)",
    dependencies=[Depends(require_permission("organizations:delete"))],
)
async def delete_organization(
    org_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete an organization."""
    service = OrganizationService(db)
    await service.delete_organization(org_id, actor_id=user.id)

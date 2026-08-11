"""Role and Permission endpoints."""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_permission
from app.core.database import get_db
from app.schemas.permission import PermissionResponse
from app.schemas.role import RoleCreate, RoleResponse, RoleUpdate
from app.services.role import RoleService

router = APIRouter()


# ===== Roles =====


@router.get(
    "/roles",
    response_model=list[RoleResponse],
    summary="List roles",
    dependencies=[Depends(require_permission("roles:read"))],
)
async def list_roles(
    db: AsyncSession = Depends(get_db),
) -> list[RoleResponse]:
    """List all roles."""
    service = RoleService(db)
    return await service.list_roles()


@router.get(
    "/roles/{role_id}",
    response_model=RoleResponse,
    summary="Get a role",
    dependencies=[Depends(require_permission("roles:read"))],
)
async def get_role(
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> RoleResponse:
    """Get a role by ID."""
    service = RoleService(db)
    return await service.get_role(role_id)


@router.post(
    "/roles",
    response_model=RoleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a role",
    dependencies=[Depends(require_permission("roles:write"))],
)
async def create_role(
    request: RoleCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> RoleResponse:
    """Create a new role."""
    service = RoleService(db)
    return await service.create_role(request, actor_id=user.id)


@router.patch(
    "/roles/{role_id}",
    response_model=RoleResponse,
    summary="Update a role",
    dependencies=[Depends(require_permission("roles:write"))],
)
async def update_role(
    role_id: uuid.UUID,
    request: RoleUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> RoleResponse:
    """Update a role."""
    service = RoleService(db)
    return await service.update_role(role_id, request, actor_id=user.id)


@router.delete(
    "/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a role",
    dependencies=[Depends(require_permission("roles:delete"))],
)
async def delete_role(
    role_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a role (cannot delete system roles)."""
    service = RoleService(db)
    await service.delete_role(role_id, actor_id=user.id)


@router.post(
    "/users/{user_id}/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Assign a role to a user",
    dependencies=[Depends(require_permission("roles:assign"))],
)
async def assign_role(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    current_user: CurrentUser,
    organization_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Assign a role to a user."""
    service = RoleService(db)
    await service.assign_role_to_user(user_id, role_id, organization_id, actor_id=current_user.id)


@router.delete(
    "/users/{user_id}/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a role from a user",
    dependencies=[Depends(require_permission("roles:assign"))],
)
async def revoke_role(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    current_user: CurrentUser,
    organization_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke a role from a user."""
    service = RoleService(db)
    await service.revoke_role_from_user(user_id, role_id, organization_id, actor_id=current_user.id)


# ===== Permissions =====


@router.get(
    "/permissions",
    response_model=list[PermissionResponse],
    summary="List permissions",
    dependencies=[Depends(require_permission("permissions:read"))],
)
async def list_permissions(
    db: AsyncSession = Depends(get_db),
) -> list[PermissionResponse]:
    """List all permissions."""
    service = RoleService(db)
    return await service.list_permissions()

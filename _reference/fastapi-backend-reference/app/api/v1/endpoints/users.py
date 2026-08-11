"""User management endpoints (admin-side)."""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_permission
from app.core.database import get_db
from app.schemas.user import UserCreate, UserResponse, UserUpdate, UserUpdateProfile
from app.services.user import UserService

router = APIRouter()


@router.get(
    "",
    response_model=list[UserResponse],
    summary="List users",
    description="List all users (paginated). Requires 'users:read' permission.",
    dependencies=[Depends(require_permission("users:read"))],
)
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    """List all users."""
    service = UserService(db)
    return await service.list_users(skip=skip, limit=limit)


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get a user",
    dependencies=[Depends(require_permission("users:read"))],
)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Get a user by ID."""
    service = UserService(db)
    return await service.get_user(user_id)


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user",
    dependencies=[Depends(require_permission("users:write"))],
)
async def create_user(
    request: UserCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Create a new user (admin-side)."""
    service = UserService(db)
    return await service.create_user(request, actor_id=user.id)


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update a user",
    dependencies=[Depends(require_permission("users:write"))],
)
async def update_user(
    user_id: uuid.UUID,
    request: UserUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update a user (admin-side)."""
    service = UserService(db)
    return await service.update_user(user_id, request, actor_id=current_user.id)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user (soft)",
    dependencies=[Depends(require_permission("users:delete"))],
)
async def delete_user(
    user_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a user (set is_active=False)."""
    service = UserService(db)
    await service.delete_user(user_id, actor_id=current_user.id)


@router.patch(
    "/me/profile",
    response_model=UserResponse,
    summary="Update own profile",
)
async def update_own_profile(
    request: UserUpdateProfile,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update the current user's own profile."""
    service = UserService(db)
    return await service.update_profile(user.id, request)

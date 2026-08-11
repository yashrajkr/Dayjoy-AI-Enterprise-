"""User service — user management (admin-side)."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.repositories.organization import UserOrganizationRepository
from app.repositories.role import RoleRepository, UserRoleRepository
from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserResponse, UserUpdate, UserUpdateProfile
from app.services.audit import AuditService


class UserService:
    """Service for user management (admin operations)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.user_org_repo = UserOrganizationRepository(db)
        self.user_role_repo = UserRoleRepository(db)
        self.role_repo = RoleRepository(db)
        self.audit = AuditService(db)

    async def _get_role_names(self, user_id: uuid.UUID) -> list[str]:
        """Helper: get role names for a user."""
        user_roles = await self.user_role_repo.get_user_roles(user_id)
        role_names = []
        for ur in user_roles:
            role = await self.role_repo.get_by_id(uuid.UUID(ur.role_id))
            if role:
                role_names.append(role.name)
        return role_names

    async def get_user(self, user_id: uuid.UUID) -> UserResponse:
        """Get a user by ID."""
        user = await self.user_repo.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User", str(user_id))

        user_roles = await self.user_role_repo.get_user_roles(user.id)
        role_names = await self._get_role_names(user.id)

        return UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            is_active=user.is_active,
            is_email_verified=user.is_email_verified,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            updated_at=user.updated_at,
            roles=role_names,
        )

    async def list_users(self, skip: int = 0, limit: int = 100) -> list[UserResponse]:
        """List all users (paginated)."""
        users = await self.user_repo.get_all(skip=skip, limit=limit)
        result = []
        for user in users:
            user_roles = await self.user_role_repo.get_user_roles(user.id)
            role_names = await self._get_role_names(user.id)
            result.append(
                UserResponse(
                    id=user.id,
                    email=user.email,
                    full_name=user.full_name,
                    phone=user.phone,
                    is_active=user.is_active,
                    is_email_verified=user.is_email_verified,
                    last_login_at=user.last_login_at,
                    created_at=user.created_at,
                    updated_at=user.updated_at,
                    roles=role_names,
                )
            )
        return result

    async def create_user(
        self,
        request: UserCreate,
        actor_id: uuid.UUID | None = None,
    ) -> UserResponse:
        """Create a new user (admin-side)."""
        if await self.user_repo.email_exists(request.email):
            raise ConflictError(f"User with email '{request.email}' already exists")

        hashed_password = None
        password_history = []
        if request.password:
            hashed_password = hash_password(request.password)
            password_history = [hashed_password]

        user = await self.user_repo.create(
            email=request.email,
            full_name=request.full_name,
            phone=request.phone,
            hashed_password=hashed_password,
            password_history=password_history,
            is_active=request.is_active,
        )

        await self.audit.log(
            action="user.create",
            actor_id=actor_id,
            resource_type="user",
            resource_id=user.id,
            details={"email": user.email},
        )

        return UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            is_active=user.is_active,
            is_email_verified=user.is_email_verified,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            updated_at=user.updated_at,
            roles=[],
        )

    async def update_user(
        self,
        user_id: uuid.UUID,
        request: UserUpdate,
        actor_id: uuid.UUID | None = None,
    ) -> UserResponse:
        """Update a user (admin-side)."""
        updates = request.model_dump(exclude_unset=True)
        user = await self.user_repo.update_profile(user_id, **updates)
        if user is None:
            raise NotFoundError("User", str(user_id))

        await self.audit.log(
            action="user.update",
            actor_id=actor_id,
            resource_type="user",
            resource_id=user_id,
            details=updates,
        )

        return await self.get_user(user_id)

    async def delete_user(
        self,
        user_id: uuid.UUID,
        actor_id: uuid.UUID | None = None,
    ) -> None:
        """Delete a user (soft delete — set is_active=False)."""
        user = await self.user_repo.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User", str(user_id))

        await self.user_repo.update_profile(user_id, is_active=False)

        await self.audit.log(
            action="user.delete",
            actor_id=actor_id,
            resource_type="user",
            resource_id=user_id,
        )

    async def update_profile(
        self,
        user_id: uuid.UUID,
        request: UserUpdateProfile,
    ) -> UserResponse:
        """User updates their own profile."""
        updates = request.model_dump(exclude_unset=True, exclude_none=True)
        user = await self.user_repo.update_profile(user_id, **updates)
        if user is None:
            raise NotFoundError("User", str(user_id))

        await self.audit.log(
            action="user.profile_updated",
            actor_id=user_id,
            resource_type="user",
            resource_id=user_id,
            details=updates,
        )

        return await self.get_user(user_id)

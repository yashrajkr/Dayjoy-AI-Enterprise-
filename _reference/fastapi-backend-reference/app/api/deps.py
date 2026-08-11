"""FastAPI dependencies — injected into route functions.

Phase 2: full auth (JWT-based current user, RBAC permission checks).
"""

import uuid
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.logging import get_logger
from app.core.security import verify_token
from app.models.user import User
from app.repositories.session import SessionRepository
from app.repositories.user import UserRepository
from app.services.role import RoleService

logger = get_logger(__name__)

# ===== Database =====
DBSession = Annotated[AsyncSession, Depends(get_db)]

# ===== Settings =====
SettingsDep = Annotated[Settings, Depends(get_settings)]


# ===== Request ID =====
def get_request_id(
    x_request_id: Annotated[str | None, Header(alias="X-Request-ID")] = None,
) -> str | None:
    """Extract request ID from header (set by RequestIDMiddleware)."""
    return x_request_id


RequestIdDep = Annotated[str | None, Depends(get_request_id)]

# ===== Auth (JWT) =====

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    db: DBSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)] = None,
) -> User:
    """Get the current authenticated user from JWT.

    Raises AuthenticationError if:
    - No Authorization header
    - Invalid token
    - Token expired
    - User not found
    - User inactive
    - Session revoked
    """
    if credentials is None:
        raise AuthenticationError("Not authenticated — no Bearer token provided")

    token = credentials.credentials
    payload = verify_token(token, expected_type="access")
    if payload is None:
        raise AuthenticationError("Invalid or expired access token")

    user_id = payload.get("sub")
    jti = payload.get("jti")
    if not user_id:
        raise AuthenticationError("Malformed token — missing subject")

    # Check session is still active
    if jti:
        session_repo = SessionRepository(db)
        session = await session_repo.get_by_jti(jti)
        if session is None or not session.is_active:
            raise AuthenticationError("Session has been revoked")
        # Touch session (update last_used_at)
        await session_repo.touch(jti)

    # Get user
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(uuid.UUID(user_id))
    if user is None:
        raise AuthenticationError("User not found")

    if not user.is_active:
        raise AuthenticationError("Account is inactive")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_user_optional(
    db: DBSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)] = None,
) -> User | None:
    """Get current user if authenticated; None otherwise (for optional auth endpoints)."""
    if credentials is None:
        return None
    try:
        return await get_current_user(db, credentials)
    except AuthenticationError:
        return None


OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]


# ===== Permission Check =====


def require_permission(required_permission: str):
    """Dependency factory: require a specific permission.

    Usage:
        @router.get("/users", dependencies=[Depends(require_permission("users:read"))])
        async def list_users(...): ...
    """

    async def check_permission(
        user: CurrentUser,
        db: DBSession,
    ) -> User:
        """Check if user has the required permission."""
        role_service = RoleService(db)

        # Get organization from user's memberships (first one for now)
        from app.repositories.organization import UserOrganizationRepository

        user_org_repo = UserOrganizationRepository(db)
        user_orgs = await user_org_repo.get_user_organizations(user.id)
        org_id = uuid.UUID(user_orgs[0].organization_id) if user_orgs else None

        # Super admin has all permissions
        role_names = await role_service.get_user_role_names(user.id, org_id)
        if "super_admin" in role_names:
            return user

        user_permissions = await role_service.get_user_permissions(user.id, org_id)

        if required_permission not in user_permissions:
            raise AuthorizationError(f"Permission '{required_permission}' required")

        return user

    return check_permission


def require_role(required_role: str):
    """Dependency factory: require a specific role.

    Usage:
        @router.delete("/users/{id}", dependencies=[Depends(require_role("org_admin"))])
        async def delete_user(...): ...
    """

    async def check_role(
        user: CurrentUser,
        db: DBSession,
    ) -> User:
        """Check if user has the required role."""
        role_service = RoleService(db)
        role_names = await role_service.get_user_role_names(user.id)

        # Super admin bypasses
        if "super_admin" in role_names:
            return user

        if required_role not in role_names:
            raise AuthorizationError(f"Role '{required_role}' required")

        return user

    return check_role

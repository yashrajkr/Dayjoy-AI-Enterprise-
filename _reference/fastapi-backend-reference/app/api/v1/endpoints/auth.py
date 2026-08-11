"""Authentication endpoints."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from app.schemas.token import Token
from app.schemas.user import UserProfile, UserResponse
from app.services.auth import AuthService

router = APIRouter()


def _get_client_info(request: Request) -> tuple[str | None, str | None]:
    """Extract IP and User-Agent from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = (
        forwarded.split(",")[0].strip()
        if forwarded
        else request.client.host
        if request.client
        else None
    )
    user_agent = request.headers.get("User-Agent")
    return ip, user_agent


@router.post(
    "/register",
    response_model=tuple[UserResponse, Token],
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description="Register a new user (and optionally create an organization).",
)
async def register(
    request: RegisterRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
) -> tuple[UserResponse, Token]:
    """Register a new user."""
    ip, ua = _get_client_info(http_request)
    auth = AuthService(db)
    user, token = await auth.register(request, ip_address=ip, user_agent=ua)
    return user, token


@router.post(
    "/login",
    response_model=tuple[UserResponse, Token],
    summary="Login",
    description="Authenticate with email + password. Returns JWT access + refresh tokens.",
)
async def login(
    request: LoginRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
) -> tuple[UserResponse, Token]:
    """Login with email and password."""
    ip, ua = _get_client_info(http_request)
    auth = AuthService(db)
    user, token = await auth.login(request, ip_address=ip, user_agent=ua)
    return user, token


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout",
    description="Revoke the current session and refresh token.",
)
async def logout(
    http_request: Request,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = None,
) -> None:
    """Logout (revoke session + refresh token)."""
    auth = AuthService(db)
    # Extract access token from header
    auth_header = http_request.headers.get("Authorization", "")
    access_token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else None
    await auth.logout(access_token=access_token or "")


@router.post(
    "/refresh",
    response_model=Token,
    summary="Refresh access token",
    description="Exchange a refresh token for new access + refresh tokens (rotation).",
)
async def refresh(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """Refresh access token using a refresh token."""
    auth = AuthService(db)
    return await auth.refresh(request.refresh_token)


@router.post(
    "/forgot-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Request password reset",
    description="Send a password reset email (if the email exists).",
)
async def forgot_password(
    request: ForgotPasswordRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Request a password reset email."""
    ip, ua = _get_client_info(http_request)
    auth = AuthService(db)
    await auth.forgot_password(request, ip_address=ip, user_agent=ua)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reset password",
    description="Reset password using a token from the reset email.",
)
async def reset_password(
    request: ResetPasswordRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Reset password using a reset token."""
    ip, ua = _get_client_info(http_request)
    auth = AuthService(db)
    await auth.reset_password(request, ip_address=ip, user_agent=ua)


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change password",
    description="Change password for the authenticated user.",
)
async def change_password(
    request: ChangePasswordRequest,
    http_request: Request,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Change password (requires authentication)."""
    ip, ua = _get_client_info(http_request)
    auth = AuthService(db)
    await auth.change_password(user.id, request, ip_address=ip, user_agent=ua)


@router.post(
    "/verify-email",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Verify email",
    description="Verify email address using a token from the verification email.",
)
async def verify_email(
    request: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Verify email using a verification token."""
    auth = AuthService(db)
    await auth.verify_email(request.token)


@router.get(
    "/me",
    response_model=UserProfile,
    summary="Get current user profile",
    description="Get the authenticated user's profile information.",
)
async def get_me(user: CurrentUser) -> UserProfile:
    """Get current user's profile."""
    return UserProfile(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        is_email_verified=user.is_email_verified,
        preferred_language=user.preferred_language,
        timezone=user.timezone,
        avatar_url=getattr(user, "avatar_url", None),
        notification_preferences=user.notification_preferences or {},
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )

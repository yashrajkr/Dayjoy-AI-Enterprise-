"""Session management endpoints."""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_permission
from app.core.database import get_db
from app.repositories.session import SessionRepository
from app.schemas.session import SessionResponse

router = APIRouter()


@router.get(
    "/sessions",
    response_model=list[SessionResponse],
    summary="List active sessions",
    description="List active sessions for the current user (device management).",
)
async def list_my_sessions(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[SessionResponse]:
    """List active sessions for the current user."""
    repo = SessionRepository(db)
    sessions = await repo.get_user_sessions(user.id, active_only=True)
    return [
        SessionResponse(
            id=s.id,
            ip_address=s.ip_address,
            user_agent=s.user_agent,
            device_name=s.device_name,
            device_type=s.device_type,
            is_active=s.is_active,
            last_used_at=s.last_used_at,
            created_at=s.created_at,
            expires_at=s.expires_at,
        )
        for s in sessions
    ]


@router.get(
    "/users/{user_id}/sessions",
    response_model=list[SessionResponse],
    summary="List sessions for a user (admin)",
    dependencies=[Depends(require_permission("sessions:read"))],
)
async def list_user_sessions(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[SessionResponse]:
    """List sessions for a specific user (admin)."""
    repo = SessionRepository(db)
    sessions = await repo.get_user_sessions(user_id, active_only=True)
    return [
        SessionResponse(
            id=s.id,
            ip_address=s.ip_address,
            user_agent=s.user_agent,
            device_name=s.device_name,
            device_type=s.device_type,
            is_active=s.is_active,
            last_used_at=s.last_used_at,
            created_at=s.created_at,
            expires_at=s.expires_at,
        )
        for s in sessions
    ]


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a session",
    description="Revoke (force logout) a specific session.",
)
async def revoke_session(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke a session by ID."""
    repo = SessionRepository(db)
    await repo.revoke_session(session_id)


@router.delete(
    "/sessions",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke all my sessions",
    description="Revoke all active sessions for the current user (logout everywhere).",
)
async def revoke_all_my_sessions(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke all sessions for the current user."""
    repo = SessionRepository(db)
    await repo.revoke_all_user_sessions(user.id)

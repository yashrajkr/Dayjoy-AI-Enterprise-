"""Session repository."""

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import Session
from app.repositories.base import BaseRepository


class SessionRepository(BaseRepository[Session]):
    """Repository for Session entity."""

    model = Session

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_by_jti(self, jti: str) -> Session | None:
        """Fetch a session by its JWT ID (jti claim)."""
        result = await self.db.execute(select(Session).where(Session.token_jti == jti))
        return result.scalar_one_or_none()

    async def get_user_sessions(
        self, user_id: uuid.UUID, active_only: bool = True
    ) -> list[Session]:
        """Get all sessions for a user."""
        stmt = select(Session).where(Session.user_id == str(user_id))
        if active_only:
            stmt = stmt.where(Session.is_active == True)  # noqa: E712
        stmt = stmt.order_by(Session.created_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_session(
        self,
        user_id: uuid.UUID,
        token_jti: str,
        expires_at: datetime,
        ip_address: str | None = None,
        user_agent: str | None = None,
        organization_id: uuid.UUID | None = None,
        device_name: str | None = None,
        device_type: str | None = None,
    ) -> Session:
        """Create a new session."""
        session = Session(
            user_id=str(user_id),
            token_jti=token_jti,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
            organization_id=str(organization_id) if organization_id else None,
            device_name=device_name,
            device_type=device_type,
            is_active=True,
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def revoke_session(self, session_id: uuid.UUID) -> bool:
        """Revoke a session (mark as inactive)."""
        result = await self.db.execute(
            update(Session)
            .where(Session.id == session_id, Session.is_active == True)  # noqa: E712
            .values(is_active=False, revoked_at=datetime.utcnow())
        )
        await self.db.flush()
        return result.rowcount > 0  # type: ignore[union-attr]

    async def revoke_by_jti(self, jti: str) -> bool:
        """Revoke a session by JTI."""
        result = await self.db.execute(
            update(Session)
            .where(Session.token_jti == jti, Session.is_active == True)  # noqa: E712
            .values(is_active=False, revoked_at=datetime.utcnow())
        )
        await self.db.flush()
        return result.rowcount > 0  # type: ignore[union-attr]

    async def revoke_all_user_sessions(self, user_id: uuid.UUID) -> int:
        """Revoke all active sessions for a user."""
        result = await self.db.execute(
            update(Session)
            .where(Session.user_id == str(user_id), Session.is_active == True)  # noqa: E712
            .values(is_active=False, revoked_at=datetime.utcnow())
        )
        await self.db.flush()
        return result.rowcount or 0  # type: ignore[union-attr]

    async def touch(self, jti: str) -> None:
        """Update last_used_at for a session."""
        await self.db.execute(
            update(Session).where(Session.token_jti == jti).values(last_used_at=datetime.utcnow())
        )
        await self.db.flush()

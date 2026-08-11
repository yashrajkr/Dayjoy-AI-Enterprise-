"""Refresh token repository."""

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken
from app.repositories.base import BaseRepository


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    """Repository for RefreshToken entity."""

    model = RefreshToken

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        """Fetch a refresh token by its hash."""
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def create_token(
        self,
        user_id: uuid.UUID,
        token_hash: str,
        expires_at: datetime,
        ip_address: str | None = None,
        user_agent: str | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> RefreshToken:
        """Create a new refresh token."""
        token = RefreshToken(
            user_id=str(user_id),
            token_hash=token_hash,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
            organization_id=str(organization_id) if organization_id else None,
            is_active=True,
        )
        self.db.add(token)
        await self.db.flush()
        await self.db.refresh(token)
        return token

    async def revoke(self, token_hash: str, reason: str = "logout") -> bool:
        """Revoke a refresh token."""
        result = await self.db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.is_active == True,  # noqa: E712
            )
            .values(is_active=False, revoked_at=datetime.utcnow(), revoked_reason=reason)
        )
        await self.db.flush()
        return result.rowcount > 0  # type: ignore[union-attr]

    async def revoke_all_for_user(self, user_id: uuid.UUID, reason: str = "password_change") -> int:
        """Revoke all active refresh tokens for a user."""
        result = await self.db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == str(user_id),
                RefreshToken.is_active == True,  # noqa: E712
            )
            .values(is_active=False, revoked_at=datetime.utcnow(), revoked_reason=reason)
        )
        await self.db.flush()
        return result.rowcount or 0  # type: ignore[union-attr]

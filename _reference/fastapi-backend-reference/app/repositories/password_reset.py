"""Password reset token repository."""

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.password_reset_token import PasswordResetToken
from app.repositories.base import BaseRepository


class PasswordResetTokenRepository(BaseRepository[PasswordResetToken]):
    """Repository for PasswordResetToken entity."""

    model = PasswordResetToken

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_by_hash(self, token_hash: str) -> PasswordResetToken | None:
        """Fetch a password reset token by its hash."""
        result = await self.db.execute(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def create_token(
        self,
        user_id: uuid.UUID,
        token_hash: str,
        expires_at: datetime,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> PasswordResetToken:
        """Create a new password reset token."""
        token = PasswordResetToken(
            user_id=str(user_id),
            token_hash=token_hash,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
            is_used=False,
        )
        self.db.add(token)
        await self.db.flush()
        await self.db.refresh(token)
        return token

    async def mark_used(self, token_hash: str) -> bool:
        """Mark a token as used."""
        result = await self.db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.is_used == False,  # noqa: E712
            )
            .values(is_used=True, used_at=datetime.utcnow())
        )
        await self.db.flush()
        return result.rowcount > 0  # type: ignore[union-attr]

    async def invalidate_all_for_user(self, user_id: uuid.UUID) -> int:
        """Invalidate all unused tokens for a user."""
        result = await self.db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == str(user_id),
                PasswordResetToken.is_used == False,  # noqa: E712
            )
            .values(is_used=True, used_at=datetime.utcnow())
        )
        await self.db.flush()
        return result.rowcount or 0  # type: ignore[union-attr]

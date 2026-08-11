"""User repository — data access for User entity (Phase 2 extended)."""

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for User entity."""

    model = User

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def get_by_email(self, email: str) -> User | None:
        """Fetch a user by email address."""
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_sso_subject(self, sso_subject: str) -> User | None:
        """Fetch a user by their SSO subject identifier."""
        result = await self.db.execute(select(User).where(User.sso_subject == sso_subject))
        return result.scalar_one_or_none()

    async def email_exists(self, email: str) -> bool:
        """Check if an email is already registered."""
        return await self.get_by_email(email) is not None

    async def update_password(
        self,
        user_id: uuid.UUID,
        hashed_password: str,
        password_history: list[str],
    ) -> None:
        """Update a user's password and password history."""
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(
                hashed_password=hashed_password,
                password_history=password_history,
                password_changed_at=datetime.utcnow(),
            )
        )
        await self.db.flush()

    async def update_last_login(self, user_id: uuid.UUID, ip_address: str | None = None) -> None:
        """Update the last_login_at timestamp for a user."""
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(
                last_login_at=datetime.utcnow(),
                last_login_ip=ip_address,
                failed_login_attempts=0,
                locked_until=None,
            )
        )
        await self.db.flush()

    async def increment_failed_login(self, user_id: uuid.UUID) -> int:
        """Increment failed login attempts; return new count."""
        user = await self.get_by_id(user_id)
        if user is None:
            return 0
        user.failed_login_attempts += 1
        await self.db.flush()
        return user.failed_login_attempts

    async def lock_account(self, user_id: uuid.UUID, locked_until: datetime) -> None:
        """Lock a user account until a specified time."""
        await self.db.execute(
            update(User).where(User.id == user_id).values(locked_until=locked_until)
        )
        await self.db.flush()

    async def reset_failed_attempts(self, user_id: uuid.UUID) -> None:
        """Reset failed login attempts to 0."""
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(failed_login_attempts=0, locked_until=None)
        )
        await self.db.flush()

    async def verify_email(self, user_id: uuid.UUID) -> None:
        """Mark a user's email as verified."""
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(is_email_verified=True, email_verified_at=datetime.utcnow())
        )
        await self.db.flush()

    async def update_profile(self, user_id: uuid.UUID, **kwargs) -> User | None:
        """Update a user's profile fields."""
        user = await self.get_by_id(user_id)
        if user is None:
            return None
        for key, value in kwargs.items():
            if hasattr(user, key):
                setattr(user, key, value)
        await self.db.flush()
        await self.db.refresh(user)
        return user

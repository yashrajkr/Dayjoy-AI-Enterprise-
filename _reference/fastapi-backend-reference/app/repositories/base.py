"""Base repository with generic CRUD operations.

All entity repositories inherit from this.
Provides type-safe create, read, update, delete operations.
"""

import uuid
from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    """Generic CRUD repository.

    Usage:
        class UserRepository(BaseRepository[User]):
            model = User

        repo = UserRepository(db)
        user = await repo.get_by_id(user_id)
    """

    model: type[ModelT]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, id: uuid.UUID | str) -> ModelT | None:
        """Fetch a single record by primary key."""
        result = await self.db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def get_all(self, skip: int = 0, limit: int = 100) -> list[ModelT]:
        """Fetch multiple records with pagination."""
        result = await self.db.execute(select(self.model).offset(skip).limit(limit))
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> ModelT:
        """Create a new record."""
        obj = self.model(**kwargs)
        self.db.add(obj)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def update(self, id: uuid.UUID | str, **kwargs: Any) -> ModelT | None:
        """Update a record by ID."""
        obj = await self.get_by_id(id)
        if obj is None:
            return None
        for key, value in kwargs.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def delete(self, id: uuid.UUID | str) -> bool:
        """Delete a record by ID. Returns True if deleted, False if not found."""
        obj = await self.get_by_id(id)
        if obj is None:
            return False
        await self.db.delete(obj)
        await self.db.flush()
        return True

    async def count(self) -> int:
        """Count total records."""
        from sqlalchemy import func

        result = await self.db.execute(select(func.count()).select_from(self.model))
        return int(result.scalar_one_or_none() or 0)

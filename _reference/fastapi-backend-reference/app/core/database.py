"""Async SQLAlchemy database setup.

- Engine: async connection pool to PostgreSQL
- Session: per-request async session (via FastAPI dependency)
- Base: declarative base for all ORM models
"""

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base.

    All ORM models inherit from this class.
    Provides common metadata for Alembic migrations.
    """

    def repr(self) -> str:
        """Default repr — subclasses should override."""
        return f"<{self.__class__.__name__} id={getattr(self, 'id', '?')}>"


# ===== Engine =====
# Created once at module import; reused for all requests.
# Pool settings tuned for typical web app load.
engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,  # verify connection is alive before checkout
    echo=settings.DB_ECHO,  # log SQL queries in dev
)

# ===== Session Factory =====
# async_sessionmaker creates new AsyncSession instances.
# expire_on_commit=False so objects remain usable after commit.
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields a database session per request.

    Usage in route:
        @router.get("/users")
        async def list_users(db: AsyncSession = Depends(get_db)):
            ...

    The session is automatically closed when the request ends.
    Commits on success; rolls back on exception.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database (create tables if they don't exist).

    NOTE: In production, use Alembic migrations instead.
    This is a convenience for development/testing.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close the database engine (call on application shutdown)."""
    await engine.dispose()


# Type alias for type hints in routes
DBSession = AsyncSession


# ===== Helper for type-safe session access =====
def get_session_kwargs() -> dict[str, Any]:
    """Return kwargs for creating a new session (for testing)."""
    return {
        "class_": AsyncSession,
        "expire_on_commit": False,
    }

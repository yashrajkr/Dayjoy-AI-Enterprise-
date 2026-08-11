"""Pytest fixtures shared across all tests.

Fixtures here are automatically available in all test files.
"""

import asyncio
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app

# ===== Event loop =====


@pytest.fixture(scope="session")
def event_loop() -> Any:
    """Single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ===== Test Database =====


@pytest_asyncio.fixture(scope="function")
async def test_db_engine() -> AsyncGenerator[Any, None]:
    """Create a fresh in-memory-like test database for each test.

    Uses a test schema that is created and dropped per test.
    """
    # Use a separate test database URL (or same DB with test schema)
    test_db_url = settings.DATABASE_URL.replace("/dayjoyai", "/dayjoyai_test")

    engine = create_async_engine(test_db_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def test_db(test_db_engine: Any) -> AsyncGenerator[AsyncSession, None]:
    """Yield a test database session."""
    async_session = async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
        await session.rollback()


# ===== Override FastAPI's get_db dependency =====


@pytest_asyncio.fixture(scope="function")
async def client(test_db_engine: Any) -> AsyncGenerator[AsyncClient, None]:
    """Test client with overridden DB dependency.

    Usage:
        async def test_health(client):
            response = await client.get("/health")
            assert response.status_code == 200
    """
    async_session = async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with async_session() as session:
            yield session
            await session.rollback()

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ===== Sample data fixtures =====


@pytest.fixture
def sample_user_data() -> dict[str, Any]:
    """Sample user data for tests."""
    return {
        "email": "test@dayjoyai.com",
        "full_name": "Test User",
        "phone": "+91-98765-43210",
        "role": "viewer",
    }

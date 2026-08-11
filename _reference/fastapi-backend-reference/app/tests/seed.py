"""Seed script — populates the database with sample data for development.

Run: uv run python -m app.tests.seed
"""

import asyncio
import uuid

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, close_db, init_db
from app.core.logging import get_logger, setup_logging
from app.core.security import hash_password
from app.models.role import Role
from app.models.user import User

logger = get_logger(__name__)


# ===== Default Roles =====
DEFAULT_ROLES = [
    ("tenant_admin", "Full tenant configuration access"),
    ("knowledge_eng", "Manages knowledge base (documents, chunks, embeddings)"),
    ("agent_dev", "Builds and configures AI agents"),
    ("ops_analyst", "Monitors live conversations and operations"),
    ("security_officer", "Compliance, audit, and security"),
    ("viewer", "Read-only access"),
    ("platform_operator", "Dayjoy AI staff (cross-tenant)"),
]


# ===== Sample Users =====
SAMPLE_USERS = [
    {
        "email": "admin@dayjoyai.com",
        "full_name": "Tenant Admin",
        "role": "tenant_admin",
        "password": "admin123456",
    },
    {
        "email": "knowledge@dayjoyai.com",
        "full_name": "Knowledge Engineer",
        "role": "knowledge_eng",
        "password": "knowledge123",
    },
    {
        "email": "ops@dayjoyai.com",
        "full_name": "Ops Analyst",
        "role": "ops_analyst",
        "password": "ops1234567",
    },
]


async def seed_roles(db) -> None:
    """Seed default roles."""
    for name, description in DEFAULT_ROLES:
        existing = await db.execute(select(Role).where(Role.name == name))
        if existing.scalar_one_or_none():
            logger.info("role_exists", name=name)
            continue

        role = Role(name=name, description=description)
        db.add(role)
        logger.info("role_created", name=name)

    await db.commit()


async def seed_users(db) -> None:
    """Seed sample users."""
    for user_data in SAMPLE_USERS:
        email = user_data["email"]
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            logger.info("user_exists", email=email)
            continue

        user = User(
            email=email,
            full_name=user_data["full_name"],
            role=user_data["role"],
            hashed_password=hash_password(user_data["password"]),
            is_active=True,
            is_verified=True,
            tenant_id=uuid.uuid4(),  # placeholder until tenant module exists
        )
        db.add(user)
        logger.info("user_created", email=email)

    await db.commit()


async def main() -> None:
    """Run the seed script."""
    setup_logging()
    logger.info("seed_starting")

    # Create tables (dev only — use Alembic in prod)
    await init_db()

    async with AsyncSessionLocal() as db:
        await seed_roles(db)
        await seed_users(db)

    await close_db()
    logger.info("seed_complete")


if __name__ == "__main__":
    asyncio.run(main())

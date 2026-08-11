"""Base model classes and mixins.

All ORM models inherit from `Base` (the declarative base from app.core.database).
Mixins provide common columns (UUID PK, timestamps) without repetition.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

# Re-export Base from app.core.database so all models use the same instance
# This MUST be the same instance used by Alembic for autogenerate to work
from app.core.database import Base


class UUIDMixin:
    """Adds a UUID primary key.

    Usage:
        class User(UUIDMixin, Base):
            __tablename__ = "users"
            ...
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )


class TimestampMixin:
    """Adds created_at and updated_at columns.

    Automatically populated by PostgreSQL defaults and the onupdate trigger.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


__all__ = ["Base", "UUIDMixin", "TimestampMixin"]

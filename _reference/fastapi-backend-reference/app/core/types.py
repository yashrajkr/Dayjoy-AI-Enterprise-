"""Custom SQLAlchemy types for cross-database compatibility.

JSONB on PostgreSQL, JSON on SQLite (for testing).
"""

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import TypeDecorator


class JSONBType(TypeDecorator):
    """Portable JSON type — JSONB on Postgres, JSON on SQLite."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())

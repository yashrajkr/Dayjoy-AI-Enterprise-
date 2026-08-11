"""Utility functions for common operations."""

import re
import uuid
from datetime import UTC, datetime
from typing import Any


def generate_uuid() -> uuid.UUID:
    """Generate a new UUID4."""
    return uuid.uuid4()


def now_utc() -> datetime:
    """Return current UTC datetime."""
    return datetime.now(UTC)


def now_iso() -> str:
    """Return current UTC datetime in ISO 8601 format."""
    return now_utc().isoformat()


def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug.

    Example:
        >>> slugify("Hello World!")
        'hello-world'
    """
    # Lowercase, replace non-alphanumeric with hyphens, collapse multiple hyphens
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def mask_email(email: str) -> str:
    """Mask an email for logging (e.g., 'j***@example.com')."""
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if len(local) <= 1:
        masked = "*"
    elif len(local) <= 3:
        masked = local[0] + "*" * (len(local) - 1)
    else:
        masked = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked}@{domain}"


def mask_phone(phone: str) -> str:
    """Mask a phone number for logging (e.g., '+91-98***-43210')."""
    if len(phone) <= 4:
        return "*" * len(phone)
    return "*" * (len(phone) - 4) + phone[-4:]


def safe_dict(data: Any) -> dict[str, Any]:
    """Convert any object to a dict safely (for JSON serialization)."""
    if isinstance(data, dict):
        return data
    if hasattr(data, "__dict__"):
        return data.__dict__
    return {"value": str(data)}


def chunk_list(items: list[Any], chunk_size: int) -> list[list[Any]]:
    """Split a list into chunks of size chunk_size."""
    return [items[i : i + chunk_size] for i in range(0, len(items), chunk_size)]

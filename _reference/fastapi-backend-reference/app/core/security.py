"""Security utilities — password hashing, JWT tokens, token hashing.

PHASE 2: Full implementation.
- bcrypt for password hashing (12 rounds)
- JWT (HS256) for access + refresh tokens
- SHA-256 for token hashing (reset, email verification, refresh)
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ===== Password Hashing =====
# We use bcrypt directly (not passlib) for compatibility with bcrypt 4.x.
# Work factor: 12 rounds (good balance of security and performance as of 2026).
# bcrypt has a 72-byte limit on passwords; we truncate to avoid errors.


def hash_password(password: str) -> str:
    """Hash a password using bcrypt.

    Args:
        password: The plain-text password (max 72 bytes — bcrypt limit).

    Returns:
        The bcrypt hash as a string.

    Raises:
        ValueError: If password is empty or exceeds 72 bytes.
    """
    if not password:
        raise ValueError("Password cannot be empty")
    password_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its bcrypt hash.

    Args:
        plain_password: The plain-text password to check.
        hashed_password: The stored bcrypt hash.

    Returns:
        True if the password matches; False otherwise.
    """
    try:
        if not plain_password or not hashed_password:
            return False
        password_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hash_bytes)
    except Exception as e:
        logger.warning("password_verification_failed", error=str(e))
        return False


# ===== JWT Tokens =====


def create_access_token(
    subject: str | int,
    claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token.

    Args:
        subject: The token subject (typically user ID).
        claims: Additional claims (e.g., role, tenant_id, permissions).
        expires_delta: Custom expiration time. Defaults to settings.

    Returns:
        The encoded JWT string.
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.now(UTC) + expires_delta
    jti = secrets.token_urlsafe(16)

    to_encode: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(UTC),
        "type": "access",
        "jti": jti,
    }
    if claims:
        to_encode.update(claims)

    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    subject: str | int,
    claims: dict[str, Any] | None = None,
) -> str:
    """Create a JWT refresh token (longer-lived)."""
    expire = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    jti = secrets.token_urlsafe(32)

    to_encode: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(UTC),
        "type": "refresh",
        "jti": jti,
    }
    if claims:
        to_encode.update(claims)

    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    """Decode and verify a JWT token.

    Args:
        token: The JWT string.

    Returns:
        The decoded claims dict, or None if invalid/expired.
    """
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as e:
        logger.warning("jwt_decode_failed", error=str(e))
        return None


def verify_token(token: str, expected_type: str = "access") -> dict[str, Any] | None:
    """Verify a JWT token and check its type.

    Args:
        token: The JWT string.
        expected_type: "access" or "refresh".

    Returns:
        The decoded claims if valid; None otherwise.
    """
    payload = decode_token(token)
    if payload is None:
        return None

    if payload.get("type") != expected_type:
        logger.warning(
            "jwt_type_mismatch",
            expected=expected_type,
            actual=payload.get("type"),
        )
        return None

    return payload


# ===== Token Hashing =====
# For password reset, email verification, and refresh tokens,
# we store a SHA-256 hash (not the raw token) so a DB leak doesn't expose them.


def hash_token(token: str) -> str:
    """Hash a token (SHA-256) for secure storage.

    Used for: refresh tokens, password reset tokens, email verification tokens.

    Args:
        token: The raw token string.

    Returns:
        The SHA-256 hex digest.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_token(length: int = 32) -> str:
    """Generate a cryptographically secure random token.

    Args:
        length: Number of bytes (default 32 = 256 bits).

    Returns:
        URL-safe base64 token string.
    """
    return secrets.token_urlsafe(length)


# ===== Brute-Force Protection =====

MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15


def should_lock_account(failed_attempts: int) -> bool:
    """Check if account should be locked based on failed attempts."""
    return failed_attempts >= MAX_LOGIN_ATTEMPTS


def get_lockout_until(failed_attempts: int) -> datetime | None:
    """Get the lockout expiration time, or None if not locked."""
    if not should_lock_account(failed_attempts):
        return None
    return datetime.now(UTC) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)


def is_account_locked(locked_until: datetime | None) -> bool:
    """Check if account is currently locked.

    Handles both timezone-aware and timezone-naive datetimes
    (SQLite stores naive, Postgres stores aware).
    """
    if locked_until is None:
        return False
    now = datetime.now(UTC)
    # If locked_until is naive, make it aware
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=UTC)
    return locked_until > now

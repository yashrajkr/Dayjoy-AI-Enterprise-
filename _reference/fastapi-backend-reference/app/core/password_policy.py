"""Password policy — strength validation, history checking.

Enforces:
- Min 8, max 128 characters
- At least 1 uppercase, 1 lowercase, 1 digit
- At least 1 special character (recommended)
- Not in password history (last 5)
- Not a common/breached password (basic check — full HIBP integration in Phase 5)
"""

import re
from typing import NamedTuple

from app.core.exceptions import ValidationError


class PasswordStrength(NamedTuple):
    """Result of password strength check."""

    is_valid: bool
    score: int  # 0-4
    errors: list[str]
    suggestions: list[str]


# Common weak passwords (basic list — full HIBP integration later)
COMMON_PASSWORDS = {
    "password",
    "password123",
    "12345678",
    "qwerty123",
    "abc12345",
    "password1",
    "admin123",
    "letmein1",
    "welcome1",
    "monkey123",
}


def check_password_strength(password: str) -> PasswordStrength:
    """Check password strength and return a detailed result.

    Args:
        password: The password to check.

    Returns:
        PasswordStrength with is_valid, score (0-4), errors, and suggestions.
    """
    errors: list[str] = []
    suggestions: list[str] = []
    score = 0

    # Length check
    if len(password) < 8:
        errors.append("Password must be at least 8 characters long")
    elif len(password) >= 12:
        score += 1
    else:
        suggestions.append("Use 12+ characters for stronger security")

    # Character variety
    has_upper = bool(re.search(r"[A-Z]", password))
    has_lower = bool(re.search(r"[a-z]", password))
    has_digit = bool(re.search(r"\d", password))
    has_special = bool(re.search(r"[!@#$%^&*(),.?\":{}|<>]", password))

    if not has_upper:
        errors.append("Password must contain at least one uppercase letter")
    else:
        score += 1

    if not has_lower:
        errors.append("Password must contain at least one lowercase letter")
    else:
        score += 1

    if not has_digit:
        errors.append("Password must contain at least one digit")
    else:
        score += 1

    if not has_special:
        suggestions.append("Add a special character (!@#$%^&*) for stronger security")
    else:
        score += 1

    # Common password check
    if password.lower() in COMMON_PASSWORDS:
        errors.append("Password is too common; choose a more unique password")
        score = 0

    # Sequential characters check
    if re.search(r"(abc|123|qwerty|password)", password.lower()):
        suggestions.append("Avoid sequential characters (abc, 123, qwerty)")

    is_valid = len(errors) == 0 and score >= 3

    return PasswordStrength(
        is_valid=is_valid,
        score=min(score, 4),
        errors=errors,
        suggestions=suggestions,
    )


def validate_password(password: str) -> str:
    """Validate password and raise ValidationError if weak.

    Args:
        password: The password to validate.

    Returns:
        The password if valid.

    Raises:
        ValidationError: If password fails strength check.
    """
    result = check_password_strength(password)
    if not result.is_valid:
        raise ValidationError(
            message="Password does not meet strength requirements",
            details={"errors": result.errors, "suggestions": result.suggestions},
        )
    return password


def is_password_in_history(password: str, password_history: list[str], verify_password_fn) -> bool:
    """Check if a password matches any in the user's password history.

    Args:
        password: The new plain-text password.
        password_history: List of previous password hashes.
        verify_password_fn: Function(plain, hash) -> bool.

    Returns:
        True if password matches any in history.
    """
    for old_hash in password_history:
        if verify_password_fn(password, old_hash):
            return True
    return False

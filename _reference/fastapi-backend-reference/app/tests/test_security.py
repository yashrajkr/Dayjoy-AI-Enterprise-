"""Tests for security utilities (password hashing, JWT)."""

import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
    verify_token,
)


@pytest.mark.unit
class TestPasswordHashing:
    """Tests for password hashing functions."""

    def test_hash_password_returns_string(self) -> None:
        """hash_password should return a string."""
        h = hash_password("test123")
        assert isinstance(h, str)

    def test_hash_password_is_not_plain(self) -> None:
        """Hash should not contain the plain password."""
        h = hash_password("test123")
        assert "test123" not in h

    def test_hash_password_is_bcrypt(self) -> None:
        """Hash should be a bcrypt hash (starts with $2b$)."""
        h = hash_password("test123")
        assert h.startswith("$2b$")

    def test_verify_password_correct(self) -> None:
        """verify_password should return True for correct password."""
        h = hash_password("mysecret")
        assert verify_password("mysecret", h) is True

    def test_verify_password_incorrect(self) -> None:
        """verify_password should return False for wrong password."""
        h = hash_password("mysecret")
        assert verify_password("wrong", h) is False

    def test_verify_password_empty(self) -> None:
        """verify_password should return False for empty password."""
        h = hash_password("mysecret")
        assert verify_password("", h) is False

    def test_different_hashes_for_same_password(self) -> None:
        """Same password should produce different hashes (bcrypt salt)."""
        h1 = hash_password("test123")
        h2 = hash_password("test123")
        assert h1 != h2
        # But both should verify
        assert verify_password("test123", h1)
        assert verify_password("test123", h2)


@pytest.mark.unit
class TestJWTTokens:
    """Tests for JWT token functions."""

    def test_create_access_token_returns_string(self) -> None:
        """create_access_token should return a string."""
        token = create_access_token("user-123")
        assert isinstance(token, str)

    def test_create_access_token_has_three_parts(self) -> None:
        """JWT should have header.payload.signature format."""
        token = create_access_token("user-123")
        assert token.count(".") == 2

    def test_decode_token_returns_claims(self) -> None:
        """decode_token should return the original claims."""
        token = create_access_token("user-123", claims={"role": "admin"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"
        assert payload["role"] == "admin"
        assert payload["type"] == "access"

    def test_verify_token_access(self) -> None:
        """verify_token should validate access tokens."""
        token = create_access_token("user-123")
        payload = verify_token(token, expected_type="access")
        assert payload is not None
        assert payload["sub"] == "user-123"

    def test_verify_token_wrong_type(self) -> None:
        """verify_token should reject wrong token type."""
        access = create_access_token("user-123")
        # Verify as refresh should fail
        payload = verify_token(access, expected_type="refresh")
        assert payload is None

    def test_decode_invalid_token_returns_none(self) -> None:
        """decode_token should return None for invalid token."""
        assert decode_token("invalid.token.here") is None
        assert decode_token("") is None
        assert decode_token("not-a-jwt") is None

    def test_refresh_token_creation(self) -> None:
        """create_refresh_token should create a valid refresh token."""
        token = create_refresh_token("user-123")
        payload = verify_token(token, expected_type="refresh")
        assert payload is not None
        assert payload["sub"] == "user-123"

    def test_token_has_expiration(self) -> None:
        """Token should include expiration time."""
        token = create_access_token("user-123")
        payload = decode_token(token)
        assert payload is not None
        assert "exp" in payload
        assert isinstance(payload["exp"], int)
        assert payload["exp"] > 0

    def test_token_has_issued_at(self) -> None:
        """Token should include issued-at time."""
        token = create_access_token("user-123")
        payload = decode_token(token)
        assert payload is not None
        assert "iat" in payload
        assert isinstance(payload["iat"], int)

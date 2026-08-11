"""JWT token schemas."""

from typing import Any

from pydantic import BaseModel, Field


class Token(BaseModel):
    """JWT token response (returned by /auth/login)."""

    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Access token TTL in seconds")


class TokenData(BaseModel):
    """Decoded JWT token payload."""

    sub: str = Field(..., description="Subject (user ID)")
    exp: int = Field(..., description="Expiration timestamp")
    iat: int = Field(..., description="Issued-at timestamp")
    type: str = Field(..., description="Token type (access/refresh)")
    claims: dict[str, Any] = Field(default_factory=dict, description="Additional claims")

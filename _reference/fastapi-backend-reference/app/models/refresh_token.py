"""RefreshToken model — for JWT refresh token rotation.

Refresh tokens are stored in DB so they can be revoked (logout, password change).
Token rotation: each use issues a new refresh token and invalidates the old one.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class RefreshToken(UUIDMixin, TimestampMixin, Base):
    """A refresh token issued to a user.

    Lifecycle:
    1. On login: access_token + refresh_token issued; refresh_token stored in DB
    2. On /auth/refresh: old refresh_token invalidated, new one issued (rotation)
    3. On logout: refresh_token revoked
    4. On password change: all refresh_tokens for user revoked
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # The token hash (we store hash, not the raw token — like password)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Values: logout, rotation, password_change, admin_revoke, expired

    # Device info (matches Session)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<RefreshToken user={self.user_id} active={self.is_active}>"

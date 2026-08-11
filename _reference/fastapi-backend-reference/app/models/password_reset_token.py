"""PasswordResetToken model — for forgot-password / reset-password flow.

Lifecycle:
1. User requests reset → token created (hashed in DB) → email sent
2. User clicks link → token verified → user sets new password
3. Token consumed (marked used) → all user sessions revoked
4. Token expires after 1 hour (configurable)
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class PasswordResetToken(UUIDMixin, TimestampMixin, Base):
    """A password reset token (sent via email)."""

    __tablename__ = "password_reset_tokens"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Token hash (we store hash, not the raw token)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)

    # Status
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Request context
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<PasswordResetToken user={self.user_id} used={self.is_used}>"

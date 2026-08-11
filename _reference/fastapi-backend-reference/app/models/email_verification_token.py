"""EmailVerificationToken model — for email verification flow.

Lifecycle:
1. User registers → token created → email sent
2. User clicks link → token verified → user.email_verified = True
3. Token consumed → cannot be reused
4. Token expires after 24 hours
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class EmailVerificationToken(UUIDMixin, TimestampMixin, Base):
    """An email verification token (sent after registration)."""

    __tablename__ = "email_verification_tokens"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Token hash (we store hash, not the raw token)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)

    # Status
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<EmailVerificationToken user={self.user_id} used={self.is_used}>"

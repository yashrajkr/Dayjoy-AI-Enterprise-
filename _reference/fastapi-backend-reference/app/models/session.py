"""Session model — tracks active user sessions (for device management + revocation)."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Session(UUIDMixin, TimestampMixin, Base):
    """A user session — created on login, destroyed on logout.

    Tracks device info for the "active sessions" UI (like Google's device management).
    Sessions can be revoked (force logout) by the user or an admin.
    """

    __tablename__ = "sessions"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Token reference (the JWT jti claim — lets us invalidate by token)
    token_jti: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)

    # Device / client info
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    device_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    device_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # web, mobile, api

    # Status
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Session user={self.user_id} active={self.is_active}>"

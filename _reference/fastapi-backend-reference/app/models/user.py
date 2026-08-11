"""User model — represents a platform user.

A user belongs to one or more organizations (via UserOrganization).
A user has one or more roles (via UserRole).
"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType as JSONB
from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    pass


class User(UUIDMixin, TimestampMixin, Base):
    """A platform user.

    A user authenticates via email/password (local) or SSO (SAML/OIDC — Phase 5+).
    A user belongs to one or more organizations and has roles within each.
    """

    __tablename__ = "users"

    # ===== Identity =====
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ===== Authentication =====
    # SSO subject (from SAML/OIDC IdP) — nullable for local accounts
    sso_subject: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    # Local password hash (bcrypt) — null for SSO-only users
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Password history (JSON array of previous hashes, max 5)
    # Prevents reusing recent passwords
    password_history: Mapped[list] = mapped_column(JSONB, default=list)
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ===== Email Verification =====
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ===== Status =====
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ===== Security / Brute-force Protection =====
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # ===== MFA =====
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ===== Profile =====
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)
    notification_preferences: Mapped[dict] = mapped_column(JSONB, default=dict)

    # ===== Relationships =====
    # No FK-based relationship to UserRole (queried via repository)

    def __repr__(self) -> str:
        return f"<User {self.email}>"

    @property
    def is_authenticated(self) -> bool:
        """compat with auth libraries."""
        return True

    @property
    def is_locked(self) -> bool:
        """True if account is currently locked due to failed login attempts."""
        if self.locked_until is None:
            return False
        from datetime import datetime

        now = datetime.now(UTC)
        locked = self.locked_until
        if locked.tzinfo is None:
            locked = locked.replace(tzinfo=UTC)
        return locked > now

    @property
    def display_name(self) -> str:
        """Human-friendly name for UI."""
        return self.full_name or self.email.split("@")[0]

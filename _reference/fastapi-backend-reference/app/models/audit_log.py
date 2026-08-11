"""AuditLog model — append-only, tamper-evident audit trail.

Every security-relevant action is logged:
- login, logout, login_failed
- user_created, user_updated, user_deleted
- role_assigned, role_revoked
- permission_granted, permission_revoked
- password_changed, password_reset
- session_revoked
- config_changed

Logs are hash-chained for tamper detection.
"""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType as JSONB
from app.models.base import Base, UUIDMixin


class AuditLog(UUIDMixin, Base):
    """An audit event — append-only (no updates, no deletes).

    Hash-chained: each entry includes the hash of the previous entry,
    making tampering detectable (changing one entry breaks the chain).
    """

    __tablename__ = "audit_logs"

    # Event time (separate from created_at for partitioning)
    event_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Actor (who performed the action)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    actor_type: Mapped[str] = mapped_column(
        String(20), default="user", nullable=False
    )  # user, system, integration
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Organization context
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Action
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Examples: user.login, user.logout, user.create, role.assign, permission.grant

    # Resource (what was acted upon)
    resource_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Outcome
    outcome: Mapped[str] = mapped_column(String(20), default="success", nullable=False)
    # Values: success, failure, denied

    # Context
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Details (JSONB for flexible payload)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Error (if outcome is failure)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Hash chain (for tamper detection)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} {self.outcome}>"

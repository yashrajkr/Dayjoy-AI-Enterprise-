"""Ticket models — support tickets with priority, status, assignment, comments."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


class Ticket(UUIDMixin, TimestampMixin, Base):
    """A support ticket.

    Lifecycle: open → in_progress → resolved → closed (or → escalated).
    """

    __tablename__ = "tickets"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # ===== Identity =====
    ticket_number: Mapped[str] = mapped_column(
        String(20), nullable=False, unique=True, index=True
    )  # e.g., TKT-2026-00001
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # ===== Customer / Distributor =====
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    distributor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # ===== Classification =====
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    priority: Mapped[str] = mapped_column(
        String(20), default="medium", nullable=False, index=True
    )  # low, medium, high, urgent
    status: Mapped[str] = mapped_column(
        String(20), default="open", nullable=False, index=True
    )  # open, in_progress, resolved, closed, escalated

    # ===== Assignment =====
    assigned_to: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # ===== Channel =====
    channel: Mapped[str] = mapped_column(
        String(20), default="web", nullable=False
    )  # web, voice, whatsapp, email

    # ===== Resolution =====
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ===== Escalation (placeholder) =====
    is_escalated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ===== Metadata =====
    tags: Mapped[list] = mapped_column(JSONBType, default=list)
    attachments: Mapped[list] = mapped_column(JSONBType, default=list)
    first_response_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ===== SLA (placeholder) =====
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Ticket {self.ticket_number} {self.status}>"


class TicketComment(UUIDMixin, TimestampMixin, Base):
    """A comment on a support ticket (public or internal note)."""

    __tablename__ = "ticket_comments"

    ticket_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    author_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    author_type: Mapped[str] = mapped_column(
        String(20), default="user", nullable=False
    )  # user, agent, system, customer

    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    attachments: Mapped[list] = mapped_column(JSONBType, default=list)

    def __repr__(self) -> str:
        return f"<TicketComment ticket={self.ticket_id} internal={self.is_internal}>"

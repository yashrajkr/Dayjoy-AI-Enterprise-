"""Distributor model — direct-selling distributor (Dayjoy-specific but generic)."""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Distributor(UUIDMixin, TimestampMixin, Base):
    """A distributor in the direct-selling network.

    Distributors have a hierarchy: each distributor has a sponsor (upline).
    They can have a team (downline).
    """

    __tablename__ = "distributors"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # ===== Distributor identity =====
    distributor_code: Mapped[str] = mapped_column(
        String(50), nullable=False, unique=True, index=True
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)

    # ===== Hierarchy =====
    sponsor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    upline_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    level: Mapped[int] = mapped_column(default=0, nullable=False)

    # ===== Status =====
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False, index=True
    )  # active, inactive, suspended, terminated
    rank: Mapped[str] = mapped_column(String(50), default="starter", nullable=False)
    # Ranks: starter, bronze, silver, gold, platinum, diamond

    # ===== Commission (placeholder) =====
    commission_rate: Mapped[float] = mapped_column(default=0.0, nullable=False)
    total_pv: Mapped[float] = mapped_column(default=0.0, nullable=False)
    total_bv: Mapped[float] = mapped_column(default=0.0, nullable=False)

    # ===== Dates =====
    joined_at: Mapped[str | None] = mapped_column(String(50), nullable=True)
    terminated_at: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # ===== Metadata =====
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    referral_code: Mapped[str | None] = mapped_column(
        String(50), nullable=True, unique=True, index=True
    )

    def __repr__(self) -> str:
        return f"<Distributor {self.distributor_code} {self.full_name}>"

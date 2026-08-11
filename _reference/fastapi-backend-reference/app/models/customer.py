"""Customer model — represents an end customer of a tenant organization."""

from typing import TYPE_CHECKING

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    pass


class Customer(UUIDMixin, TimestampMixin, Base):
    """A customer of a tenant organization.

    Multi-tenant: every customer belongs to an organization_id.
    Customers can have notes, tags, addresses, and a timeline of activity.
    """

    __tablename__ = "customers"

    # ===== Tenant isolation =====
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # ===== Identity =====
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ===== Status =====
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False, index=True
    )  # active, inactive, blacklisted

    # ===== Contact details =====
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ===== Metadata =====
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list)  # JSON array of tag strings
    preferred_language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)

    # ===== External refs =====
    crm_contact_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<Customer {self.full_name}>"

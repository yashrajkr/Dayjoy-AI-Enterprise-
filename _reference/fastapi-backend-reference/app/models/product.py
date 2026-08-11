"""Product models — products, categories, variants."""

from sqlalchemy import Boolean, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


class Category(UUIDMixin, TimestampMixin, Base):
    """Product category (e.g., Wellness, Personal Care, Home)."""

    __tablename__ = "categories"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<Category {self.name}>"


class Product(UUIDMixin, TimestampMixin, Base):
    """A product in the catalogue.

    Products have PV (Point Value) and BV (Business Volume) for direct-selling.
    """

    __tablename__ = "products"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    category_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # ===== Identity =====
    sku: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    short_description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ===== Pricing =====
    price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    compare_at_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)

    # ===== Direct-selling =====
    pv: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # Point Value
    bv: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # Business Volume

    # ===== Status =====
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False, index=True
    )  # active, draft, archived, out_of_stock

    # ===== Inventory (placeholder) =====
    track_inventory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ===== Media =====
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    images: Mapped[list] = mapped_column(JSONBType, default=list)  # JSON array of URLs

    # ===== Additional info =====
    nutritional_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    faqs: Mapped[list] = mapped_column(JSONBType, default=list)  # JSON array of {q, a}
    tags: Mapped[list] = mapped_column(JSONBType, default=list)  # JSON array of tag strings
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_unit: Mapped[str] = mapped_column(String(10), default="g", nullable=False)

    def __repr__(self) -> str:
        return f"<Product {self.sku} {self.name}>"


class ProductVariant(UUIDMixin, TimestampMixin, Base):
    """A variant of a product (e.g., different size, color)."""

    __tablename__ = "product_variants"

    product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)

    price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    pv: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    bv: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Attributes (JSON: {"size": "500ml", "color": "red"})
    attributes: Mapped[dict] = mapped_column(JSONBType, default=dict)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<ProductVariant {self.sku} {self.name}>"

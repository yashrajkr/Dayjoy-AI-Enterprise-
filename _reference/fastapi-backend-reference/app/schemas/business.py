"""Product schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=100)
    description: str | None = None
    parent_id: uuid.UUID | None = None
    is_active: bool = True
    sort_order: int = 0


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class CategoryResponse(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ProductBase(BaseModel):
    sku: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=100)
    description: str | None = None
    short_description: str | None = None
    price: float = 0.0
    compare_at_price: float | None = None
    currency: str = "INR"
    pv: float = 0.0
    bv: float = 0.0
    category_id: uuid.UUID | None = None
    status: str = "active"
    track_inventory: bool = False
    stock_quantity: int = 0
    image_url: str | None = None
    images: list[str] = Field(default_factory=list)
    nutritional_info: str | None = None
    tags: list[str] = Field(default_factory=list)
    weight: float | None = None
    weight_unit: str = "g"


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    short_description: str | None = None
    price: float | None = None
    compare_at_price: float | None = None
    pv: float | None = None
    bv: float | None = None
    category_id: uuid.UUID | None = None
    status: str | None = None
    track_inventory: bool | None = None
    stock_quantity: int | None = None
    image_url: str | None = None
    images: list[str] | None = None
    nutritional_info: str | None = None
    tags: list[str] | None = None
    weight: float | None = None


class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    faqs: list = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class KnowledgeArticleBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    slug: str | None = Field(None, max_length=200)
    summary: str | None = None
    content: str = Field(..., min_length=1)
    category_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)
    status: str = "draft"


class KnowledgeArticleCreate(KnowledgeArticleBase):
    pass


class KnowledgeArticleUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    content: str | None = None
    category_id: uuid.UUID | None = None
    tags: list[str] | None = None
    status: str | None = None
    is_pinned: bool | None = None


class KnowledgeArticleResponse(KnowledgeArticleBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    content_html: str | None = None
    version: int
    author_id: uuid.UUID | None = None
    published_at: datetime | None = None
    attachments: list = Field(default_factory=list)
    view_count: int
    is_pinned: bool
    created_at: datetime
    updated_at: datetime


class TicketBase(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    customer_id: uuid.UUID | None = None
    distributor_id: uuid.UUID | None = None
    category: str | None = None
    priority: str = "medium"
    channel: str = "web"
    tags: list[str] = Field(default_factory=list)


class TicketCreate(TicketBase):
    pass


class TicketUpdate(BaseModel):
    subject: str | None = None
    priority: str | None = None
    status: str | None = None
    assigned_to: uuid.UUID | None = None
    category: str | None = None
    resolution: str | None = None
    tags: list[str] | None = None


class TicketResponse(TicketBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    ticket_number: str
    status: str
    assigned_to: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    resolution: str | None = None
    is_escalated: bool
    attachments: list = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    body: str
    notification_type: str
    category: str | None = None
    is_read: bool
    action_url: str | None = None
    action_label: str | None = None
    created_at: datetime

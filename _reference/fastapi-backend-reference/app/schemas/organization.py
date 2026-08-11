"""Organization schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class OrganizationBase(BaseModel):
    """Shared organization fields."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class OrganizationCreate(OrganizationBase):
    """Schema for creating an organization."""

    slug: str | None = Field(None, min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    plan: str = Field("free", max_length=50)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not v.replace("-", "").isalnum():
            raise ValueError("Slug must contain only lowercase letters, numbers, and hyphens")
        return v.lower()


class OrganizationUpdate(BaseModel):
    """Schema for updating an organization."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None
    plan: str | None = Field(None, max_length=50)
    logo_url: str | None = None
    primary_color: str | None = Field(None, max_length=7)


class OrganizationResponse(OrganizationBase):
    """Schema for organization response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    is_active: bool
    plan: str
    logo_url: str | None
    primary_color: str | None
    created_at: datetime
    updated_at: datetime
    member_count: int | None = None

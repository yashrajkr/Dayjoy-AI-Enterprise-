"""Permission schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PermissionBase(BaseModel):
    """Shared permission fields."""

    code: str = Field(..., min_length=3, max_length=100, pattern=r"^[a-z_]+:[a-z_]+$")
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None

    @field_validator("code")
    @classmethod
    def validate_code_format(cls, v: str) -> str:
        if ":" not in v:
            raise ValueError("Permission code must be in format 'resource:action'")
        parts = v.split(":")
        if len(parts) != 2:
            raise ValueError("Permission code must have exactly one colon")
        return v


class PermissionCreate(PermissionBase):
    """Schema for creating a permission."""


class PermissionUpdate(BaseModel):
    """Schema for updating a permission."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class PermissionResponse(PermissionBase):
    """Schema for permission response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    resource: str
    action: str
    is_system: bool
    created_at: datetime
    updated_at: datetime

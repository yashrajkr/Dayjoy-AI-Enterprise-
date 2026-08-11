"""Role schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RoleBase(BaseModel):
    """Shared role fields."""

    name: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z0-9_]+$")
    display_name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None


class RoleCreate(RoleBase):
    """Schema for creating a role."""

    scope: str = Field("global", max_length=20)
    priority: int = Field(0, ge=0, le=1000)
    permission_codes: list[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    """Schema for updating a role."""

    display_name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    priority: int | None = Field(None, ge=0, le=1000)
    permission_codes: list[str] | None = None


class RoleResponse(RoleBase):
    """Schema for role response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_system: bool
    scope: str
    priority: int
    permissions: list[str] = Field(default_factory=list, description="Permission codes")
    created_at: datetime
    updated_at: datetime

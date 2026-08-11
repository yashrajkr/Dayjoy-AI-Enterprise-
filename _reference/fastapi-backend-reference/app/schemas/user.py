"""User schemas (request/response shapes for User entity)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    """Shared user fields."""

    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    phone: str | None = Field(None, max_length=20)


class UserCreate(UserBase):
    """Schema for creating a user (admin-side)."""

    password: str | None = Field(None, min_length=8, max_length=128)
    role: str = Field("employee", max_length=50)
    organization_id: uuid.UUID | None = None
    is_active: bool = True


class UserUpdate(BaseModel):
    """Schema for updating a user (admin-side)."""

    email: EmailStr | None = None
    full_name: str | None = Field(None, min_length=1, max_length=255)
    phone: str | None = Field(None, max_length=20)
    is_active: bool | None = None
    is_email_verified: bool | None = None


class UserUpdateProfile(BaseModel):
    """Schema for a user updating their own profile."""

    full_name: str | None = Field(None, min_length=1, max_length=255)
    phone: str | None = Field(None, max_length=20)
    preferred_language: str | None = Field(None, max_length=10)
    timezone: str | None = Field(None, max_length=50)
    avatar_url: str | None = None
    notification_preferences: dict | None = None


class UserProfile(BaseModel):
    """User profile (own data, more fields than UserResponse)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    is_email_verified: bool
    preferred_language: str
    timezone: str
    avatar_url: str | None
    notification_preferences: dict
    last_login_at: datetime | None
    created_at: datetime


class UserResponse(UserBase):
    """Schema for user response (never exposes password)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_active: bool
    is_email_verified: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    roles: list[str] = Field(default_factory=list, description="Role names")

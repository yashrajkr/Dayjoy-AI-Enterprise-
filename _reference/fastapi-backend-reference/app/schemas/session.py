"""Session schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionResponse(BaseModel):
    """Schema for session response (active sessions list)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ip_address: str | None
    user_agent: str | None
    device_name: str | None
    device_type: str | None
    is_active: bool
    last_used_at: datetime
    created_at: datetime
    expires_at: datetime

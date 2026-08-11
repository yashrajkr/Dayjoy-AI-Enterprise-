"""Audit log schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    """Schema for audit log response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_time: datetime
    actor_id: uuid.UUID | None
    actor_type: str
    actor_email: str | None
    organization_id: uuid.UUID | None
    action: str
    resource_type: str | None
    resource_id: uuid.UUID | None
    outcome: str
    ip_address: str | None
    details: dict
    error_message: str | None

"""Shared service-layer helpers."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.repositories.organization import UserOrganizationRepository


async def resolve_org_id(db: AsyncSession, user: Any) -> uuid.UUID:
    repo = UserOrganizationRepository(db)
    memberships = await repo.get_user_organizations(user.id)
    if not memberships:
        raise ValidationError("User is not a member of any organization")
    return uuid.UUID(memberships[0].organization_id)


async def resolve_org_id_optional(db: AsyncSession, user: Any) -> uuid.UUID | None:
    repo = UserOrganizationRepository(db)
    memberships = await repo.get_user_organizations(user.id)
    if not memberships:
        return None
    return uuid.UUID(memberships[0].organization_id)

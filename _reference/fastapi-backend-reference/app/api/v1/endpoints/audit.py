"""Audit log endpoints."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.repositories.audit import AuditLogRepository
from app.schemas.audit import AuditLogResponse

router = APIRouter()


@router.get(
    "/audit-logs",
    response_model=list[AuditLogResponse],
    summary="List audit logs",
    description="List audit logs (requires 'audit:read' permission).",
    dependencies=[Depends(require_permission("audit:read"))],
)
async def list_audit_logs(
    organization_id: uuid.UUID | None = None,
    action: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogResponse]:
    """List audit logs with optional filters."""
    repo = AuditLogRepository(db)
    if organization_id:
        logs = await repo.get_by_organization(
            organization_id, skip=skip, limit=limit, action=action
        )
    else:
        # Get all (super admin only — enforced by permission check)
        from sqlalchemy import select

        from app.models.audit_log import AuditLog

        stmt = select(AuditLog).order_by(AuditLog.event_time.desc()).offset(skip).limit(limit)
        if action:
            stmt = stmt.where(AuditLog.action == action)
        result = await db.execute(stmt)
        logs = list(result.scalars().all())

    return [
        AuditLogResponse(
            id=log.id,
            event_time=log.event_time,
            actor_id=log.actor_id,
            actor_type=log.actor_type,
            actor_email=log.actor_email,
            organization_id=log.organization_id,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            outcome=log.outcome,
            ip_address=log.ip_address,
            details=log.details,
            error_message=log.error_message,
        )
        for log in logs
    ]

"""Audit log repository."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.repositories.base import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):
    """Repository for AuditLog entity.

    Audit logs are append-only — no update() or delete() methods.
    """

    model = AuditLog

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def create_log(  # type: ignore[override]
        self,
        *,
        action: str,
        actor_id: str | None = None,
        actor_type: str = "user",
        actor_email: str | None = None,
        organization_id: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        outcome: str = "success",
        ip_address: str | None = None,
        user_agent: str | None = None,
        request_id: str | None = None,
        details: dict | None = None,
        error_message: str | None = None,
    ) -> AuditLog:
        """Create a new audit log entry (append-only).

        Computes hash chain: current_hash = sha256(previous_hash + action + actor_id + event_time)
        """
        # Get the last log entry's hash
        last_log = await self.db.execute(
            select(AuditLog).order_by(AuditLog.event_time.desc()).limit(1)
        )
        last_entry = last_log.scalar_one_or_none()
        previous_hash = last_entry.current_hash if last_entry else None

        # Compute current hash
        import hashlib

        hash_input = (
            f"{previous_hash or ''}|{action}|{actor_id or ''}|{datetime.utcnow().isoformat()}"
        )
        current_hash = hashlib.sha256(hash_input.encode()).hexdigest()

        log = AuditLog(
            action=action,
            actor_id=actor_id,
            actor_type=actor_type,
            actor_email=actor_email,
            organization_id=organization_id,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id,
            details=details or {},
            error_message=error_message,
            previous_hash=previous_hash,
            current_hash=current_hash,
        )
        self.db.add(log)
        await self.db.flush()
        await self.db.refresh(log)
        return log

    async def get_by_organization(
        self,
        organization_id: uuid.UUID,
        skip: int = 0,
        limit: int = 100,
        action: str | None = None,
    ) -> list[AuditLog]:
        """Get audit logs for an organization."""
        stmt = select(AuditLog).where(AuditLog.organization_id == str(organization_id))
        if action:
            stmt = stmt.where(AuditLog.action == action)
        stmt = stmt.order_by(AuditLog.event_time.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_actor(
        self, actor_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> list[AuditLog]:
        """Get audit logs by actor."""
        result = await self.db.execute(
            select(AuditLog)
            .where(AuditLog.actor_id == str(actor_id))
            .order_by(AuditLog.event_time.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

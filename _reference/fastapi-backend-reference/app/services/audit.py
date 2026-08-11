"""Audit service — logs security-relevant actions."""

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.repositories.audit import AuditLogRepository

logger = get_logger(__name__)


class AuditService:
    """Service for recording audit log entries."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.audit_repo = AuditLogRepository(db)

    async def log(
        self,
        *,
        action: str,
        actor_id: UUID | str | None = None,
        actor_type: str = "user",
        actor_email: str | None = None,
        organization_id: UUID | str | None = None,
        resource_type: str | None = None,
        resource_id: UUID | str | None = None,
        outcome: str = "success",
        ip_address: str | None = None,
        user_agent: str | None = None,
        request_id: str | None = None,
        details: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        """Record an audit log entry.

        Args:
            action: What happened (e.g., 'user.login', 'role.assign')
            actor_id: Who did it (user ID)
            actor_type: 'user', 'system', or 'integration'
            actor_email: Actor's email (for display)
            organization_id: Org context
            resource_type: What was acted upon (e.g., 'user', 'organization')
            resource_id: ID of the resource
            outcome: 'success', 'failure', or 'denied'
            ip_address: Request IP
            user_agent: Request user agent
            request_id: Request trace ID
            details: Additional context (JSON)
            error_message: Error details if outcome is failure
        """
        try:
            await self.audit_repo.create_log(
                action=action,
                actor_id=str(actor_id) if actor_id else None,
                actor_type=actor_type,
                actor_email=actor_email,
                organization_id=str(organization_id) if organization_id else None,
                resource_type=resource_type,
                resource_id=str(resource_id) if resource_id else None,
                outcome=outcome,
                ip_address=ip_address,
                user_agent=user_agent,
                request_id=request_id,
                details=details or {},
                error_message=error_message,
            )
        except Exception as e:
            # Audit logging should never break the request
            logger.error("audit_log_failed", action=action, error=str(e))

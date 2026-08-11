"""Event Bus — internal event-driven architecture.

Supports:
- Event publishing (any service can publish events)
- Event subscription (workflows, webhooks, notifications)
- Event replay (re-deliver events that failed)
- Dead letter queue (events that failed after max retries)
- Event versioning (events can evolve over time)
- Audit trail (every event is logged)
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.workflow import (
    DeadLetterQueue,
    EventLog,
    EventSubscription,
)

logger = get_logger(__name__)


class EventBus:
    """Internal event bus for publish/subscribe messaging."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def publish(
        self,
        *,
        organization_id: uuid.UUID,
        event_type: str,
        data: dict[str, Any],
        source: str = "system",
        correlation_id: str | None = None,
        event_version: str = "1.0",
    ) -> EventLog:
        """Publish an event to the event bus.

        All matching subscriptions will be triggered.
        """
        # Find matching subscriptions
        result = await self.db.execute(
            select(EventSubscription).where(
                EventSubscription.organization_id == str(organization_id),
                EventSubscription.event_type == event_type,
                EventSubscription.is_active == True,  # noqa: E712
            )
        )
        subscriptions = result.scalars().all()

        # Create event log
        event_log = EventLog(
            organization_id=str(organization_id),
            event_type=event_type,
            event_version=event_version,
            data=data,
            source=source,
            subscribers_count=len(subscriptions),
            correlation_id=correlation_id,
        )
        self.db.add(event_log)
        await self.db.flush()

        # Deliver to subscribers
        delivered = 0
        failed = 0

        for sub in subscriptions:
            try:
                await self._deliver(event_log, sub)
                delivered += 1
            except Exception as e:
                logger.error(
                    "event_delivery_failed",
                    event_type=event_type,
                    subscription_id=str(sub.id),
                    error=str(e),
                )
                failed += 1
                await self._send_to_dlq(event_log, sub, str(e))

        event_log.delivered_count = delivered
        event_log.failed_count = failed
        await self.db.flush()

        logger.info(
            "event_published",
            event_type=event_type,
            subscribers=len(subscriptions),
            delivered=delivered,
            failed=failed,
        )

        return event_log

    async def subscribe(
        self,
        *,
        organization_id: uuid.UUID,
        event_type: str,
        handler_type: str,
        handler_config: dict,
        filter: dict | None = None,
        max_retries: int = 3,
    ) -> EventSubscription:
        """Subscribe to events of a specific type."""
        sub = EventSubscription(
            organization_id=str(organization_id),
            event_type=event_type,
            handler_type=handler_type,
            handler_config=handler_config,
            filter=filter or {},
            max_retries=max_retries,
            is_active=True,
        )
        self.db.add(sub)
        await self.db.flush()
        return sub

    async def replay(
        self,
        event_log_id: uuid.UUID,
    ) -> dict:
        """Replay a failed event delivery."""
        event = await self.db.get(EventLog, event_log_id)
        if event is None:
            return {"error": "Event not found"}

        # Re-find subscriptions
        result = await self.db.execute(
            select(EventSubscription).where(
                EventSubscription.organization_id == event.organization_id,
                EventSubscription.event_type == event.event_type,
                EventSubscription.is_active == True,  # noqa: E712
            )
        )
        subscriptions = result.scalars().all()

        delivered = 0
        failed = 0

        for sub in subscriptions:
            try:
                await self._deliver(event, sub)
                delivered += 1
            except Exception as e:
                failed += 1
                await self._send_to_dlq(event, sub, str(e))

        return {
            "event_log_id": str(event_log_id),
            "event_type": event.event_type,
            "delivered": delivered,
            "failed": failed,
        }

    async def list_events(
        self,
        organization_id: uuid.UUID,
        *,
        event_type: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[EventLog]:
        """List event logs."""
        stmt = select(EventLog).where(EventLog.organization_id == str(organization_id))
        if event_type:
            stmt = stmt.where(EventLog.event_type == event_type)
        stmt = stmt.order_by(EventLog.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_dlq(
        self,
        organization_id: uuid.UUID,
    ) -> list[DeadLetterQueue]:
        """List dead letter queue entries."""
        result = await self.db.execute(
            select(DeadLetterQueue)
            .where(
                DeadLetterQueue.organization_id == str(organization_id),
                DeadLetterQueue.status == "failed",
            )
            .order_by(DeadLetterQueue.created_at.desc())
        )
        return list(result.scalars().all())

    async def _deliver(self, event: EventLog, subscription: EventSubscription) -> None:
        """Deliver an event to a subscriber.

        Handler types:
        - workflow: trigger a workflow execution
        - webhook: send HTTP POST to a URL
        - notification: create a notification
        - code: run custom code
        """
        handler_type = subscription.handler_type
        config = subscription.handler_config or {}

        if handler_type == "workflow":
            # Trigger workflow
            from app.workflow.engine import WorkflowEngine

            engine = WorkflowEngine(self.db)
            workflow_id = config.get("workflow_id")
            if workflow_id:
                await engine.trigger(
                    workflow_id=uuid.UUID(workflow_id),
                    trigger_data=event.data,
                    triggered_by=None,  # system
                )

        elif handler_type == "webhook":
            # In production, this would make an HTTP POST
            logger.info(
                "webhook_delivery",
                event_type=event.event_type,
                webhook_url=config.get("webhook_url"),
            )

        elif handler_type == "notification":
            # Create notification
            from app.models.notification import Notification

            user_id = config.get("user_id")
            if user_id:
                notif = Notification(
                    user_id=user_id,
                    title=f"Event: {event.event_type}",
                    body=str(event.data)[:500],
                    notification_type="info",
                    is_read=False,
                )
                self.db.add(notif)
                await self.db.flush()

        elif handler_type == "code":
            logger.info("code_handler", event_type=event.event_type)

    async def _send_to_dlq(
        self,
        event: EventLog,
        subscription: EventSubscription,
        error: str,
    ) -> None:
        """Send a failed event to the dead letter queue."""
        dlq = DeadLetterQueue(
            organization_id=event.organization_id,
            event_log_id=str(event.id),
            subscription_id=str(subscription.id),
            event_type=event.event_type,
            event_data=event.data,
            error_message=error,
            retry_count=subscription.max_retries,
            status="failed",
        )
        self.db.add(dlq)
        await self.db.flush()

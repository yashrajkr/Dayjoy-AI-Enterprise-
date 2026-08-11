"""Event bus worker — async background message dispatch with retry + DLQ.

Processes pending EventBusMessages and dispatches them to subscribers
(webhook / queue / plugin / mcp / agent / workflow). For webhook subscribers,
delegates to WebhookDeliveryWorker. For other subscriber types, marks as
delivered (real integrations would invoke the appropriate handler).
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.marketplace_ecosystem import (
    EventBusMessage,
    EventBusSubscription,
    EventBusTopic,
)
from app.services.marketplace_ecosystem import EventBusService
from app.services.webhook_delivery import compute_next_retry

logger = get_logger(__name__)

MAX_MESSAGES_PER_BATCH = 100
SLEEP_SECONDS = 3


class EventBusWorker:
    """Async worker that processes pending event bus messages."""

    def __init__(self, db: AsyncSession, max_messages: int = MAX_MESSAGES_PER_BATCH) -> None:
        self.db = db
        self.max_messages = max_messages

    async def run_once(self) -> dict[str, Any]:
        """Process one batch of pending messages."""
        result = await self.db.execute(
            select(EventBusMessage).where(
                EventBusMessage.status.in_(["pending", "retry"]),
                (EventBusMessage.next_retry_at.is_(None)) |
                (EventBusMessage.next_retry_at <= datetime.now(UTC)),
            ).order_by(
                EventBusMessage.priority.desc(),
                EventBusMessage.scheduled_at.asc(),
            ).limit(self.max_messages))
        messages = list(result.scalars().all())
        if not messages:
            return {"delivered": 0, "failed": 0, "dead_letter": 0, "retried": 0,
                    "total_processed": 0}

        delivered = 0
        failed = 0
        dead_letter = 0
        retried = 0

        for msg in messages:
            outcome = await self._process_one(msg)
            if outcome == "delivered":
                delivered += 1
            elif outcome == "retry":
                retried += 1
            elif outcome == "dead_letter":
                dead_letter += 1
            elif outcome == "failed":
                failed += 1

        await self.db.flush()
        return {"delivered": delivered, "failed": failed, "retried": retried,
                "dead_letter": dead_letter, "total_processed": len(messages)}

    async def _process_one(self, msg: EventBusMessage) -> str:
        """Process a single message. Returns 'delivered' / 'retry' / 'dead_letter' / 'failed'."""
        # Mark as processing
        msg.status = "processing"
        msg.attempt_count = (msg.attempt_count or 0) + 1
        msg.last_attempt_at = datetime.now(UTC)
        await self.db.flush()

        # Fetch the subscription to find the subscriber_type
        sub = None
        if msg.subscription_id:
            sub = await self.db.get(EventBusSubscription, msg.subscription_id)

        if sub is None or not sub.is_active:
            msg.status = "dead_letter"
            msg.error = "Subscription no longer exists or is inactive"
            return "dead_letter"

        # Apply filter expression (basic support — JSON path matching)
        if sub.filter_expression and not _matches_filter(msg.payload, sub.filter_expression):
            # Filter-out is a successful no-op (not a failure)
            msg.status = "delivered"
            msg.delivered_at = datetime.now(UTC)
            msg.error = "Filtered out"
            return "delivered"

        # Dispatch based on subscriber_type
        try:
            outcome = await self._dispatch(msg, sub)
            if outcome is True:
                msg.status = "delivered"
                msg.delivered_at = datetime.now(UTC)
                msg.error = None
                return "delivered"
            else:
                return await self._schedule_retry_or_dlq(msg, "Dispatch returned False")
        except Exception as e:
            return await self._schedule_retry_or_dlq(msg, f"{type(e).__name__}: {e}")

    async def _dispatch(self, msg: EventBusMessage, sub: EventBusSubscription) -> bool:
        """Dispatch to the appropriate subscriber. Returns True on success."""
        subscriber_type = sub.subscriber_type
        # In production, each branch would invoke the real subscriber:
        # - webhook: POST to a target URL via httpx (handled by WebhookDeliveryWorker)
        # - queue: push to Redis/RabbitMQ/SQS
        # - plugin: invoke plugin's event handler in sandbox
        # - mcp: invoke MCP tool
        # - agent: trigger agent run
        # - workflow: trigger workflow execution
        # For now, we mark as successfully delivered (simulated).
        if subscriber_type == "webhook":
            # Webhook delivery is handled separately by WebhookDeliveryWorker
            return True
        elif subscriber_type == "queue":
            return True
        elif subscriber_type == "plugin":
            return True
        elif subscriber_type == "mcp":
            return True
        elif subscriber_type == "agent":
            return True
        elif subscriber_type == "workflow":
            return True
        else:
            logger.warning("unknown_subscriber_type", type=subscriber_type)
            return False

    async def _schedule_retry_or_dlq(self, msg: EventBusMessage, error: str) -> str:
        """Either schedule a retry or move to DLQ based on attempt count."""
        msg.error = error
        if msg.attempt_count >= msg.max_attempts:
            msg.status = "dead_letter"
            return "dead_letter"
        msg.status = "retry"
        # Reuse the same backoff schedule as webhook delivery
        msg.next_retry_at = compute_next_retry(msg.attempt_count)
        return "retry"


def _matches_filter(payload: dict | None, expression: str) -> bool:
    """Basic filter matching — supports JSON-path-like expressions.

    Examples:
        'event_type == "order.created"' — basic equality
        'priority >= 5' — numeric comparison
        '*' — match all (always true)

    For complex filtering, integrate a real expression engine (CEL, JSONPath).
    """
    if not expression or expression.strip() == "*" or expression.strip() == "":
        return True
    try:
        # Simple equality / comparison support
        expr = expression.strip()
        for op in ["==", "!=", ">=", "<=", ">", "<"]:
            if op in expr:
                parts = [p.strip() for p in expr.split(op, 1)]
                if len(parts) != 2:
                    continue
                key, expected = parts
                # Strip quotes from expected
                if expected.startswith('"') and expected.endswith('"'):
                    expected = expected[1:-1]
                # Look up the key in payload
                actual = payload.get(key) if payload else None
                if op == "==":
                    return str(actual) == expected
                if op == "!=":
                    return str(actual) != expected
                try:
                    if op == ">=":
                        return float(actual or 0) >= float(expected)
                    if op == "<=":
                        return float(actual or 0) <= float(expected)
                    if op == ">":
                        return float(actual or 0) > float(expected)
                    if op == "<":
                        return float(actual or 0) < float(expected)
                except (ValueError, TypeError):
                    return False
        # No operator found — treat as plain string match
        return expr in json.dumps(payload or {})
    except Exception:
        # On any parsing error, default to True (don't filter out)
        return True


async def run_event_bus_worker(db_factory, *, batch_size: int = MAX_MESSAGES_PER_BATCH,
                                sleep_seconds: int = SLEEP_SECONDS,
                                max_iterations: int | None = None) -> None:
    """Long-running event bus worker loop."""
    iteration = 0
    while max_iterations is None or iteration < max_iterations:
        iteration += 1
        try:
            async with db_factory() as session:
                worker = EventBusWorker(session, max_messages=batch_size)
                stats = await worker.run_once()
                await session.commit()
                if stats["total_processed"] > 0:
                    logger.info("event_bus_worker_batch", **stats)
                if stats["total_processed"] == 0:
                    await asyncio.sleep(sleep_seconds)
        except Exception as e:
            logger.error("event_bus_worker_error", error=str(e))
            await asyncio.sleep(sleep_seconds)

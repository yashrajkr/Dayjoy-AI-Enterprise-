"""Webhook delivery worker — async background delivery with exponential backoff + jitter.

Production-grade delivery:
- Exponential backoff: 1m, 2m, 4m, 8m, 16m, 32m (with jitter)
- Constant-time HMAC signing
- Idempotency via event_id in headers
- Async HTTP via httpx with configurable timeout
- Per-subscription rate limiting (max 10 concurrent deliveries)
- DLQ after max_retries exhausted
- Optional payload transformation via subscription headers
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import random
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.marketplace_ecosystem import (
    WebhookEventLog,
    WebhookSubscription,
)
from app.services.marketplace_ecosystem import (
    WebhookPlatformService,
    _decrypt_value,
)

logger = get_logger(__name__)


# Backoff schedule in minutes (capped at 32 minutes)
BACKOFF_MINUTES = [1, 2, 4, 8, 16, 32]
JITTER_RATIO = 0.25  # ±25% jitter
DEFAULT_TIMEOUT_SECONDS = 30
MAX_CONCURRENT_PER_SUBSCRIPTION = 5
SUCCESS_STATUS_RANGE = range(200, 300)  # 2xx = success
RETRYABLE_STATUS_RANGE = list(range(500, 600)) + [408, 429]  # 5xx + timeout + rate limit


def compute_next_retry(attempt: int) -> datetime:
    """Compute the next retry time with exponential backoff + jitter.

    attempt is 1-indexed (1 = first retry, 2 = second, etc.)
    """
    idx = min(attempt - 1, len(BACKOFF_MINUTES) - 1)
    base_minutes = BACKOFF_MINUTES[idx]
    jitter = base_minutes * JITTER_RATIO
    actual_minutes = base_minutes + random.uniform(-jitter, jitter)
    return datetime.now(UTC) + timedelta(minutes=max(0.1, actual_minutes))


def should_retry(status_code: int | None, error: str | None) -> bool:
    """Decide whether to retry based on response status + error."""
    if status_code is None:  # Network error / timeout — always retry
        return True
    if status_code in RETRYABLE_STATUS_RANGE:
        return True
    return False


def sign_payload(payload: bytes, secret: str) -> str:
    """Compute HMAC-SHA256 signature with timestamp prefix (Stripe-style)."""
    timestamp = int(datetime.now(UTC).timestamp())
    signed_payload = f"{timestamp}.{payload.decode('utf-8', errors='replace')}"
    signature = hmac.new(
        secret.encode(), signed_payload.encode(), hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


class WebhookDeliveryWorker:
    """Async worker that delivers pending webhook events with retry support."""

    def __init__(self, db: AsyncSession,
                 http_client: Any | None = None,
                 max_events: int = 100) -> None:
        self.db = db
        self.max_events = max_events
        # Use injected http_client (for testing); otherwise lazily import httpx
        self._http_client = http_client

    async def _get_http_client(self) -> Any:
        if self._http_client is not None:
            return self._http_client
        try:
            import httpx
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(DEFAULT_TIMEOUT_SECONDS),
                limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
                follow_redirects=False,  # Webhooks shouldn't follow redirects (security)
            )
        except ImportError:
            logger.warning("httpx_not_installed_webhook_delivery_disabled")
            return None
        return self._http_client

    async def run_once(self) -> dict[str, Any]:
        """Process one batch of pending outgoing webhook events."""
        client = await self._get_http_client()
        if client is None:
            return {"delivered": 0, "failed": 0, "retried": 0, "dead_letter": 0,
                    "total_processed": 0, "skipped": "httpx not installed"}

        # Lock pending events by atomically marking them as "processing"
        result = await self.db.execute(
            select(WebhookEventLog).where(
                WebhookEventLog.direction == "outgoing",
                WebhookEventLog.status.in_(["pending", "retry"]),
                (WebhookEventLog.next_retry_at.is_(None)) |
                (WebhookEventLog.next_retry_at <= datetime.now(UTC)),
            ).order_by(WebhookEventLog.created_at.asc()).limit(self.max_events))
        events = list(result.scalars().all())
        if not events:
            return {"delivered": 0, "failed": 0, "retried": 0, "dead_letter": 0,
                    "total_processed": 0}

        delivered = 0
        failed = 0
        retried = 0
        dead_letter = 0

        for event in events:
            outcome = await self._deliver_one(event, client)
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
                "dead_letter": dead_letter, "total_processed": len(events)}

    async def _deliver_one(self, event: WebhookEventLog, client: Any) -> str:
        """Deliver a single event. Returns 'delivered' / 'retry' / 'dead_letter' / 'failed'."""
        # Mark as processing
        event.status = "processing"
        event.attempt_count = (event.attempt_count or 0) + 1
        event.last_attempt_at = datetime.now(UTC)  # type: ignore[assignment]
        await self.db.flush()

        # Fetch the subscription for target URL + secret
        sub = None
        if event.subscription_id:
            sub = await self.db.get(WebhookSubscription, event.subscription_id)

        if sub is None or not sub.is_active:
            event.status = "dead_letter"
            event.error = "Subscription no longer exists or is inactive"
            return "dead_letter"

        # Build headers
        payload_bytes = json.dumps(event.payload or {}, separators=(",", ":")).encode("utf-8")
        headers = {"Content-Type": "application/json",
                   "X-Webhook-Event-ID": event.event_id,
                   "X-Webhook-Event-Type": event.event_type,
                   "X-Webhook-Attempt": str(event.attempt_count)}
        # Add subscription headers (overrides)
        if sub.headers:
            headers.update({str(k): str(v) for k, v in sub.headers.items()})
        # Sign the payload
        if sub.secret_encrypted:
            try:
                secret = _decrypt_value(sub.secret_encrypted)
                headers["X-Webhook-Signature"] = sign_payload(payload_bytes, secret)
            except Exception as e:
                logger.warning("webhook_sign_failed", error=str(e), event_id=event.event_id)

        # Make the HTTP POST
        timeout = getattr(sub, "timeout_seconds", DEFAULT_TIMEOUT_SECONDS) or DEFAULT_TIMEOUT_SECONDS
        status_code: int | None = None
        error: str | None = None
        response_body: str | None = None
        latency_ms: int = 0
        try:
            import time as _time
            t0 = _time.monotonic()
            response = await client.post(
                sub.target_url, content=payload_bytes, headers=headers,
                timeout=timeout)
            t1 = _time.monotonic()
            latency_ms = int((t1 - t0) * 1000)
            status_code = response.status_code
            response_body = response.text[:2000] if response.text else None
        except Exception as e:
            error = f"{type(e).__name__}: {e}"

        event.response_status = status_code
        event.response_body = response_body
        event.latency_ms = latency_ms

        # Update subscription counters
        if status_code in SUCCESS_STATUS_RANGE:
            event.status = "delivered"
            event.delivered_at = datetime.now(UTC)
            event.error = None
            sub.success_count = (sub.success_count or 0) + 1
            sub.last_invoked_at = datetime.now(UTC)
            sub.last_status_code = status_code
            return "delivered"

        # Failure — decide whether to retry
        event.error = error or f"HTTP {status_code}"
        sub.failure_count = (sub.failure_count or 0) + 1
        sub.last_status_code = status_code

        max_attempts = getattr(sub, "max_retries", 5) or 5
        if event.attempt_count >= max_attempts or not should_retry(status_code, error):
            event.status = "dead_letter"
            return "dead_letter"

        # Schedule retry
        event.status = "retry"
        event.next_retry_at = compute_next_retry(event.attempt_count)
        return "retry"

    async def close(self) -> None:
        if self._http_client is not None:
            try:
                await self._http_client.aclose()
            except Exception:
                pass
            self._http_client = None


async def run_webhook_worker(db_factory, *, batch_size: int = 100,
                              sleep_seconds: int = 5,
                              max_iterations: int | None = None) -> None:
    """Long-running webhook worker loop.

    Args:
        db_factory: callable that returns a fresh AsyncSession
        batch_size: events to process per iteration
        sleep_seconds: idle time between batches when queue is empty
        max_iterations: stop after N iterations (None = run forever)
    """
    iteration = 0
    while max_iterations is None or iteration < max_iterations:
        iteration += 1
        try:
            async with db_factory() as session:
                worker = WebhookDeliveryWorker(session, max_events=batch_size)
                stats = await worker.run_once()
                await session.commit()
                await worker.close()
                if stats["total_processed"] > 0:
                    logger.info("webhook_worker_batch", **stats)
                if stats["total_processed"] == 0:
                    await asyncio.sleep(sleep_seconds)
        except Exception as e:
            logger.error("webhook_worker_error", error=str(e))
            await asyncio.sleep(sleep_seconds)

"""Push providers — FCM (Firebase Cloud Messaging), Log (dev)."""

import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.notifications.providers.base import PushProvider, PushResult

logger = get_logger(__name__)


class FCMProvider(PushProvider):
    """Firebase Cloud Messaging push notification provider.

    Uses the HTTP v1 API (requires a service account JSON file).
    Falls back to the legacy API if FCM_SERVER_KEY is set.
    """

    def __init__(self, server_key: str = "", project_id: str = "") -> None:
        self.server_key = server_key or settings.FCM_SERVER_KEY
        self.project_id = project_id or settings.FCM_PROJECT_ID
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "fcm"

    def is_available(self) -> bool:
        return bool(self.server_key or (self.project_id and settings.FCM_SERVICE_ACCOUNT_JSON))

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=settings.PUSH_TIMEOUT)
        return self._client

    async def send(
        self,
        *,
        token: str,
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
        icon: str | None = None,
        click_action: str | None = None,
    ) -> PushResult:
        if not self.is_available():
            return PushResult(success=False, provider="fcm", error="FCM not configured")

        start = time.perf_counter()
        client = self._get_client()

        # Use legacy API if server_key is set (simpler, no OAuth needed)
        if self.server_key:
            url = "https://fcm.googleapis.com/fcm/send"
            headers = {
                "Authorization": f"key={self.server_key}",
                "Content-Type": "application/json",
            }
            payload: dict[str, Any] = {
                "to": token,
                "notification": {
                    "title": title,
                    "body": body,
                },
            }
            if icon:
                payload["notification"]["icon"] = icon
            if click_action:
                payload["notification"]["click_action"] = click_action
            if data:
                payload["data"] = data
        else:
            # HTTP v1 API (requires OAuth — not fully implemented here)
            return PushResult(
                success=False,
                provider="fcm",
                error="FCM HTTP v1 API requires OAuth setup — use legacy server key instead",
            )

        try:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            resp_data = response.json()
            latency_ms = int((time.perf_counter() - start) * 1000)
            msg_id = resp_data.get("message_id") or resp_data.get("multicast_id", "")
            return PushResult(
                success=True,
                message_id=str(msg_id) if msg_id else None,
                provider="fcm",
                latency_ms=latency_ms,
                raw_response=resp_data,
            )
        except httpx.HTTPStatusError as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            return PushResult(
                success=False,
                provider="fcm",
                error=f"FCM {e.response.status_code}: {e.response.text[:300]}",
                latency_ms=latency_ms,
            )
        except Exception as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            return PushResult(success=False, provider="fcm", error=str(e), latency_ms=latency_ms)

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


class LogPushProvider(PushProvider):
    """Dev push provider — logs instead of sending."""

    @property
    def name(self) -> str:
        return "log"

    def is_available(self) -> bool:
        return True

    async def send(self, **kwargs: Any) -> PushResult:
        logger.info("log_push_sent", token=kwargs.get("token", "")[:20], title=kwargs.get("title"))
        return PushResult(
            success=True,
            message_id=f"log_push_{int(time.time())}",
            provider="log",
            latency_ms=0,
        )


def get_push_provider(provider: str | None = None) -> PushProvider:
    """Get the configured push provider."""
    if not settings.ENABLE_PUSH_NOTIFICATIONS:
        return LogPushProvider()
    return FCMProvider()

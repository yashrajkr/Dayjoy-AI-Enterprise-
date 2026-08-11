"""Email providers — Resend (primary), SendGrid, Log (dev)."""

import asyncio
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.notifications.providers.base import EmailProvider, EmailResult

logger = get_logger(__name__)


class ResendProvider(EmailProvider):
    """Resend email provider (https://resend.com)."""

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key or settings.RESEND_API_KEY
        self.base_url = "https://api.resend.com"
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "resend"

    def is_available(self) -> bool:
        return bool(self.api_key)

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=settings.EMAIL_TIMEOUT,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def send(
        self,
        *,
        to: str,
        subject: str,
        html: str | None = None,
        text: str | None = None,
        from_email: str = "",
        from_name: str = "",
        reply_to: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> EmailResult:
        if not self.is_available():
            return EmailResult(success=False, provider="resend", error="RESEND_API_KEY not configured")

        start = time.perf_counter()
        client = self._get_client()

        from_addr = f"{from_name or settings.DEFAULT_FROM_NAME} <{from_email or settings.DEFAULT_FROM_EMAIL}>"

        payload: dict[str, Any] = {
            "from": from_addr,
            "to": [to],
            "subject": subject,
        }
        if html:
            payload["html"] = html
        if text:
            payload["text"] = text
        if reply_to or settings.DEFAULT_REPLY_TO:
            payload["reply_to"] = reply_to or settings.DEFAULT_REPLY_TO
        if attachments:
            payload["attachments"] = attachments
        if headers:
            payload["headers"] = headers

        try:
            response = await client.post("/emails", json=payload)
            response.raise_for_status()
            data = response.json()
            latency_ms = int((time.perf_counter() - start) * 1000)
            return EmailResult(
                success=True,
                message_id=data.get("id"),
                provider="resend",
                latency_ms=latency_ms,
                raw_response=data,
            )
        except httpx.HTTPStatusError as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            error_msg = f"Resend API error {e.response.status_code}: {e.response.text[:300]}"
            logger.error("resend_send_failed", status=e.response.status_code, error=error_msg)
            return EmailResult(success=False, provider="resend", error=error_msg, latency_ms=latency_ms)
        except Exception as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            return EmailResult(success=False, provider="resend", error=str(e), latency_ms=latency_ms)

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


class SendGridProvider(EmailProvider):
    """SendGrid email provider (https://sendgrid.com)."""

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key or settings.SENDGRID_API_KEY
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "sendgrid"

    def is_available(self) -> bool:
        return bool(self.api_key)

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url="https://api.sendgrid.com/v3",
                timeout=settings.EMAIL_TIMEOUT,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def send(self, **kwargs: Any) -> EmailResult:
        if not self.is_available():
            return EmailResult(success=False, provider="sendgrid", error="SENDGRID_API_KEY not configured")

        start = time.perf_counter()
        client = self._get_client()

        from_email = kwargs.get("from_email") or settings.DEFAULT_FROM_EMAIL
        from_name = kwargs.get("from_name") or settings.DEFAULT_FROM_NAME

        content: list[dict[str, str]] = []
        if kwargs.get("text"):
            content.append({"type": "text/plain", "value": kwargs["text"]})
        if kwargs.get("html"):
            content.append({"type": "text/html", "value": kwargs["html"]})

        payload = {
            "personalizations": [{"to": [{"email": kwargs["to"]}]}],
            "from": {"email": from_email, "name": from_name},
            "subject": kwargs["subject"],
            "content": content or [{"type": "text/plain", "value": ""}],
        }
        if kwargs.get("reply_to") or settings.DEFAULT_REPLY_TO:
            payload["reply_to"] = {"email": kwargs.get("reply_to") or settings.DEFAULT_REPLY_TO}

        try:
            response = await client.post("/mail/send", json=payload)
            response.raise_for_status()
            latency_ms = int((time.perf_counter() - start) * 1000)
            msg_id = response.headers.get("X-Message-Id", "")
            return EmailResult(success=True, message_id=msg_id, provider="sendgrid", latency_ms=latency_ms)
        except httpx.HTTPStatusError as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            return EmailResult(success=False, provider="sendgrid", error=f"SendGrid {e.response.status_code}: {e.response.text[:300]}", latency_ms=latency_ms)
        except Exception as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            return EmailResult(success=False, provider="sendgrid", error=str(e), latency_ms=latency_ms)

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


class LogEmailProvider(EmailProvider):
    """Dev email provider — logs instead of sending."""

    @property
    def name(self) -> str:
        return "log"

    def is_available(self) -> bool:
        return True

    async def send(self, **kwargs: Any) -> EmailResult:
        logger.info(
            "log_email_sent",
            to=kwargs.get("to"),
            subject=kwargs.get("subject"),
            from_=kwargs.get("from_email"),
        )
        return EmailResult(
            success=True,
            message_id=f"log_{int(time.time())}",
            provider="log",
            latency_ms=0,
        )


def get_email_provider(provider: str | None = None) -> EmailProvider:
    """Get the configured email provider."""
    provider_name = provider or settings.EMAIL_PROVIDER
    if provider_name == "resend":
        return ResendProvider()
    if provider_name == "sendgrid":
        return SendGridProvider()
    if provider_name == "log":
        return LogEmailProvider()
    # Default to log for unknown providers
    return LogEmailProvider()

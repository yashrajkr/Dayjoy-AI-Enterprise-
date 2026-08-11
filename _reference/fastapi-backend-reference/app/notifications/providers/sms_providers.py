"""SMS providers — Twilio, Log (dev)."""

import base64
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.notifications.providers.base import SMSProvider, SMSResult

logger = get_logger(__name__)


class TwilioSMSProvider(SMSProvider):
    """Twilio SMS provider (reuses TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN)."""

    def __init__(
        self,
        account_sid: str = "",
        auth_token: str = "",
        from_number: str = "",
    ) -> None:
        self.account_sid = account_sid or settings.TWILIO_ACCOUNT_SID
        self.auth_token = auth_token or settings.TWILIO_AUTH_TOKEN
        self.from_number = from_number or settings.TWILIO_SMS_FROM or settings.TWILIO_PHONE_NUMBER
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "twilio"

    def is_available(self) -> bool:
        return bool(self.account_sid and self.auth_token)

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            credentials = f"{self.account_sid}:{self.auth_token}"
            encoded = base64.b64encode(credentials.encode()).decode()
            self._client = httpx.AsyncClient(
                base_url=f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}",
                timeout=settings.SMS_TIMEOUT,
                headers={
                    "Authorization": f"Basic {encoded}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
        return self._client

    async def send(
        self,
        *,
        to: str,
        body: str,
        from_number: str = "",
        sender_id: str = "",
    ) -> SMSResult:
        if not self.is_available():
            return SMSResult(success=False, provider="twilio", error="Twilio credentials not configured")

        start = time.perf_counter()
        client = self._get_client()

        from_val = from_number or self.from_number or settings.DEFAULT_SMS_SENDER_ID
        data = {
            "To": to,
            "From": from_val,
            "Body": body,
        }

        try:
            response = await client.post("/Messages.json", data=data)
            response.raise_for_status()
            resp_data = response.json()
            latency_ms = int((time.perf_counter() - start) * 1000)
            return SMSResult(
                success=True,
                message_id=resp_data.get("sid"),
                provider="twilio",
                latency_ms=latency_ms,
                raw_response=resp_data,
            )
        except httpx.HTTPStatusError as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            return SMSResult(
                success=False,
                provider="twilio",
                error=f"Twilio {e.response.status_code}: {e.response.text[:300]}",
                latency_ms=latency_ms,
            )
        except Exception as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            return SMSResult(success=False, provider="twilio", error=str(e), latency_ms=latency_ms)

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


class LogSMSProvider(SMSProvider):
    """Dev SMS provider — logs instead of sending."""

    @property
    def name(self) -> str:
        return "log"

    def is_available(self) -> bool:
        return True

    async def send(self, **kwargs: Any) -> SMSResult:
        logger.info("log_sms_sent", to=kwargs.get("to"), body=kwargs.get("body", "")[:100])
        return SMSResult(
            success=True,
            message_id=f"log_sms_{int(time.time())}",
            provider="log",
            latency_ms=0,
        )


def get_sms_provider(provider: str | None = None) -> SMSProvider:
    """Get the configured SMS provider."""
    provider_name = provider or settings.SMS_PROVIDER
    if provider_name == "twilio":
        return TwilioSMSProvider()
    if provider_name == "log":
        return LogSMSProvider()
    return LogSMSProvider()

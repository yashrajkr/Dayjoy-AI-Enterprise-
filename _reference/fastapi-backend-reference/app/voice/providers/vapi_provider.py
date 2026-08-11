"""Vapi voice provider — fully implemented.

Vapi (https://vapi.ai) is a voice AI platform that handles STT, LLM, TTS,
and telephony in one API. This adapter:
- Creates / updates / deletes Vapi assistants
- Starts / ends outbound calls
- Verifies webhook signatures (HMAC-SHA256)
- Parses Vapi webhook events into our provider-agnostic ProviderEvent format

Vapi assistant config reference:
  https://docs.vapi.ai/api-reference/assistants/create

Vapi webhook reference:
  https://docs.vapi.ai/orchestration/webhooks

Environment variables:
  VAPI_API_KEY       — Server-side API key (full access)
  VAPI_PUBLIC_KEY    — Used for webhook signature verification
  VAPI_WEBHOOK_SECRET — Optional shared secret for additional webhook auth
  VAPI_BASE_URL      — https://api.vapi.ai (default)
  VAPI_ASSISTANT_ID  — Default assistant ID (optional)
  VAPI_PHONE_NUMBER_ID — Vapi phone number to dial out from
"""

import asyncio
import hashlib
import hmac
import json
import time
from typing import Any

import httpx

from app.voice.providers.base import VoiceProvider
from app.voice.providers.exceptions import (
    VoiceProviderAuthenticationError,
    VoiceProviderConnectionError,
    VoiceProviderRateLimitError,
    VoiceProviderTimeoutError,
)
from app.voice.providers.models import (
    AssistantConfig,
    CallStatus,
    ProviderCallRequest,
    ProviderCallResponse,
    ProviderEvent,
    ProviderEventType,
)
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# Maps Vapi message types → our event types
_VAPI_EVENT_TYPE_MAP: dict[str, ProviderEventType] = {
    "call-start": ProviderEventType.CALL_STARTED,
    "call-end": ProviderEventType.CALL_ENDED,
    "call-answer": ProviderEventType.CALL_ANSWERED,
    "transcript": ProviderEventType.STT_FINAL,
    "partial-transcript": ProviderEventType.STT_PARTIAL,
    "assistant-response": ProviderEventType.ASSISTANT_RESPONSE,
    "speech-start": ProviderEventType.TTS_START,
    "speech-end": ProviderEventType.TTS_END,
    "interruption": ProviderEventType.INTERRUPTION,
    "barge-in": ProviderEventType.BARGE_IN,
    "silence-timeout": ProviderEventType.SILENCE_DETECTED,
    "error": ProviderEventType.ERROR,
    "transfer": ProviderEventType.CALL_TRANSFERRED,
}


class VapiVoiceProvider(VoiceProvider):
    """Vapi voice provider (fully implemented)."""

    def __init__(
        self,
        api_key: str,
        public_key: str = "",
        webhook_secret: str = "",
        base_url: str = "https://api.vapi.ai",
        phone_number_id: str = "",
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        super().__init__(
            api_key=api_key,
            base_url=base_url or "https://api.vapi.ai",
            timeout=timeout,
            max_retries=max_retries,
        )
        self.public_key = public_key
        self.webhook_secret = webhook_secret
        self.phone_number_id = phone_number_id

    @property
    def name(self) -> str:
        return "vapi"

    @classmethod
    def from_settings(cls) -> "VapiVoiceProvider":
        return cls(
            api_key=settings.VAPI_API_KEY,
            public_key=settings.VAPI_PUBLIC_KEY,
            webhook_secret=settings.VAPI_WEBHOOK_SECRET,
            base_url=settings.VAPI_BASE_URL,
            phone_number_id=settings.VAPI_PHONE_NUMBER_ID,
            timeout=settings.VAPI_TIMEOUT,
            max_retries=settings.VAPI_MAX_RETRIES,
        )

    def _get_client(self) -> httpx.AsyncClient:
        """Lazy-init the httpx async client."""
        if self._client is None or self._client.is_closed:
            self._require_api_key()
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "DayjoyAI-Voice/1.0",
                },
            )
        return self._client

    # ===== Assistant management =====

    async def create_assistant(
        self,
        config: AssistantConfig,
    ) -> dict[str, Any]:
        """Create a Vapi assistant.

        Vapi assistant config:
          https://docs.vapi.ai/api-reference/assistants/create
        """
        self._require_api_key()
        client = self._get_client()
        payload = self._build_assistant_payload(config)

        response_data = await self._request_with_retry(
            "POST", "/assistant", json=payload
        )
        assistant_id = response_data.get("id")
        if not assistant_id:
            raise VoiceProviderConnectionError(
                f"Vapi create_assistant returned no ID: {response_data!r}"
            )
        logger.info(
            "vapi_assistant_created",
            assistant_id=assistant_id,
            name=config.name,
        )
        return response_data

    async def update_assistant(
        self,
        provider_assistant_id: str,
        config: AssistantConfig,
    ) -> dict[str, Any]:
        """Update a Vapi assistant."""
        self._require_api_key()
        client = self._get_client()
        payload = self._build_assistant_payload(config)
        response_data = await self._request_with_retry(
            "PATCH",
            f"/assistant/{provider_assistant_id}",
            json=payload,
        )
        logger.info(
            "vapi_assistant_updated",
            assistant_id=provider_assistant_id,
        )
        return response_data

    async def delete_assistant(self, provider_assistant_id: str) -> bool:
        """Delete a Vapi assistant."""
        self._require_api_key()
        client = self._get_client()
        try:
            await self._request_with_retry(
                "DELETE", f"/assistant/{provider_assistant_id}"
            )
            logger.info("vapi_assistant_deleted", assistant_id=provider_assistant_id)
            return True
        except VoiceProviderError as e:
            logger.warning(
                "vapi_assistant_delete_failed",
                assistant_id=provider_assistant_id,
                error=str(e),
            )
            return False

    async def get_assistant(self, provider_assistant_id: str) -> dict[str, Any]:
        """Fetch assistant details from Vapi."""
        self._require_api_key()
        return await self._request_with_retry(
            "GET", f"/assistant/{provider_assistant_id}"
        )

    def _build_assistant_payload(self, config: AssistantConfig) -> dict[str, Any]:
        """Translate AssistantConfig → Vapi assistant payload.

        Vapi expects a specific structure for `model`, `voice`, `transcriber`,
        and `firstMessage`. This function maps our provider-agnostic config
        to that structure.
        """
        # First message (greeting) — Vapi uses this as the opening line
        first_message = config.first_message or config.greeting

        # Model config (LLM)
        model_config: dict[str, Any] = {
            "provider": "openai",  # default; override via provider_config
            "model": "gpt-4o-mini",
            "temperature": config.temperature,
            "maxTokens": config.max_tokens,
            "messages": [
                {
                    "role": "system",
                    "content": config.system_prompt,
                }
            ],
        }
        # Allow provider_config to override / extend model settings
        if "model" in config.provider_config:
            model_config.update(config.provider_config["model"])

        # Voice config (TTS)
        voice_config: dict[str, Any] = {
            "provider": config.voice_provider,
            "voiceId": config.voice,
        }
        if "voice" in config.provider_config:
            voice_config.update(config.provider_config["voice"])

        # Transcriber config (STT)
        transcriber_config: dict[str, Any] = {
            "provider": config.stt_provider,
            "model": "nova-2",  # Deepgram default
            "language": config.language,
        }
        if "transcriber" in config.provider_config:
            transcriber_config.update(config.provider_config["transcriber"])

        payload: dict[str, Any] = {
            "name": config.name,
            "firstMessage": first_message,
            "model": model_config,
            "voice": voice_config,
            "transcriber": transcriber_config,
            "silenceTimeoutSeconds": config.silence_timeout_seconds,
            "maxDurationSeconds": config.max_call_duration,
            "backgroundSound": "off",
            "backending": "enabled" if config.enable_barge_in else "disabled",
        }

        # Optional messages
        if config.fallback_message:
            payload["voicemailMessage"] = config.fallback_message
        if config.end_of_call_message:
            payload["endCallMessage"] = config.end_of_call_message

        # Server URL (for webhooks — set per-tenant in provider_config)
        if "server_url" in config.provider_config:
            payload["serverUrl"] = config.provider_config["server_url"]
        if "server_url_secret" in config.provider_config:
            payload["serverUrlSecret"] = config.provider_config["server_url_secret"]

        # Metadata
        if config.metadata:
            payload["metadata"] = config.metadata

        # Any other provider-specific overrides
        if "extra" in config.provider_config:
            payload.update(config.provider_config["extra"])

        return payload

    # ===== Call management =====

    async def start_call(
        self,
        request: ProviderCallRequest,
    ) -> ProviderCallResponse:
        """Start an outbound call via Vapi.

        Vapi call API: https://docs.vapi.ai/api-reference/calls/create
        """
        self._require_api_key()
        client = self._get_client()

        payload: dict[str, Any] = {
            "assistantId": request.assistant_id,
            "customer": {
                "number": request.to_number,
            },
        }
        if request.from_number:
            payload["phoneNumberId"] = request.from_number
        elif self.phone_number_id:
            payload["phoneNumberId"] = self.phone_number_id
        if request.metadata:
            payload["metadata"] = request.metadata

        response_data = await self._request_with_retry("POST", "/call", json=payload)
        call_id = response_data.get("id")
        if not call_id:
            raise VoiceProviderConnectionError(
                f"Vapi start_call returned no call ID: {response_data!r}"
            )

        # Map Vapi status → our status
        status_str = response_data.get("status", "ringing")
        status = self._map_call_status(status_str)

        logger.info(
            "vapi_call_started",
            call_sid=call_id,
            assistant_id=request.assistant_id,
            to=request.to_number,
        )

        return ProviderCallResponse(
            call_sid=call_id,
            status=status,
            provider_assistant_id=request.assistant_id,
            started_at=response_data.get("createdAt"),
            metadata=response_data.get("metadata", {}),
        )

    async def end_call(self, call_sid: str) -> bool:
        """End a Vapi call."""
        self._require_api_key()
        client = self._get_client()
        try:
            await self._request_with_retry("POST", f"/call/{call_sid}/end-call")
            logger.info("vapi_call_ended", call_sid=call_sid)
            return True
        except VoiceProviderError as e:
            logger.warning("vapi_call_end_failed", call_sid=call_sid, error=str(e))
            return False

    async def get_call(self, call_sid: str) -> dict[str, Any]:
        """Fetch call status from Vapi."""
        self._require_api_key()
        return await self._request_with_retry("GET", f"/call/{call_sid}")

    @staticmethod
    def _map_call_status(vapi_status: str) -> CallStatus:
        """Map Vapi status string → our CallStatus enum."""
        mapping = {
            "ringing": CallStatus.RINGING,
            "answered": CallStatus.ANSWERED,
            "in-progress": CallStatus.IN_PROGRESS,
            "on-hold": CallStatus.ON_HOLD,
            "transferring": CallStatus.TRANSFERRING,
            "completed": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
            "missed": CallStatus.MISSED,
            "busy": CallStatus.BUSY,
            "no-answer": CallStatus.NO_ANSWER,
            "escalated": CallStatus.ESCALATED,
        }
        return mapping.get(vapi_status.lower(), CallStatus.IN_PROGRESS)

    # ===== Webhook handling =====

    def verify_webhook_signature(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> bool:
        """Verify Vapi webhook signature.

        Vapi uses HMAC-SHA256 with the webhook secret.
        See: https://docs.vapi.ai/orchestration/webhooks/security

        The signature is sent in the `X-Vapi-Signature` header (Hex).
        If VAPI_WEBHOOK_SECRET is empty, we accept the webhook (testing only).

        Vapi also supports a pre-shared secret sent in the `X-Vapi-Server-Secret`
        header; if VAPI_WEBHOOK_SECRET is set, we verify it matches.
        """
        # Check pre-shared server secret first (if configured)
        if self.webhook_secret:
            server_secret = (
                headers.get("X-Vapi-Server-Secret")
                or headers.get("x-vapi-server-secret")
                or ""
            )
            if server_secret != self.webhook_secret:
                logger.warning(
                    "vapi_webhook_server_secret_mismatch",
                )
                return False

        # HMAC-SHA256 signature verification (if public_key is configured)
        if not self.public_key:
            # No public key configured — skip HMAC verification
            # (rely on server-secret check above, or network-level auth)
            return True

        signature_header = (
            headers.get("X-Vapi-Signature")
            or headers.get("x-vapi-signature")
            or ""
        )
        if not signature_header:
            logger.warning("vapi_webhook_missing_signature_header")
            return False

        # Compute expected signature
        expected = hmac.new(
            self.public_key.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()

        # Constant-time comparison
        if not hmac.compare_digest(expected, signature_header):
            logger.warning(
                "vapi_webhook_signature_mismatch",
                expected_prefix=expected[:16],
                got_prefix=signature_header[:16],
            )
            return False

        return True

    def parse_webhook_event(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> ProviderEvent:
        """Parse a Vapi webhook into a ProviderEvent.

        Vapi webhook payload structure (varies by event type):
        {
          "message": {
            "type": "transcript" | "call-start" | "call-end" | ...,
            "call": {"id": "..."},
            "transcript": "text" (for transcript events),
            "transcriptType": "partial" | "final",
            "role": "user" | "assistant",
            ...
          },
          "createdAt": "2024-..."
        }
        """
        try:
            data = json.loads(body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise VoiceProviderConnectionError(
                f"Cannot parse Vapi webhook body: {e}"
            ) from e

        # Vapi wraps the actual event in a `message` object
        message = data.get("message", data)  # some events are flat
        if not isinstance(message, dict):
            raise VoiceProviderConnectionError(
                f"Vapi webhook has no message dict: {data!r}"
            )

        event_type_str = message.get("type", "unknown")
        event_type = _VAPI_EVENT_TYPE_MAP.get(
            event_type_str, ProviderEventType.UNKNOWN
        )

        # Extract call SID
        call = message.get("call") or {}
        call_sid = call.get("id") or message.get("callId")

        # Build payload (provider-agnostic)
        payload: dict[str, Any] = {
            "text": message.get("transcript", ""),
            "speaker": self._map_speaker(message.get("role")),
            "start_time": message.get("startTimeOffset", 0.0)
            if isinstance(message.get("startTimeOffset"), (int, float))
            else 0.0,
            "end_time": message.get("endTimeOffset", 0.0)
            if isinstance(message.get("endTimeOffset"), (int, float))
            else 0.0,
            "confidence": message.get("confidence"),
            "language": message.get("language"),
            "is_partial": message.get("transcriptType") == "partial",
            "status": message.get("status"),
            "ended_reason": message.get("endedReason"),
            "transfer_destination": message.get("transferDestination"),
            "error_message": message.get("error", {}).get("message")
            if isinstance(message.get("error"), dict)
            else message.get("error"),
        }
        # Strip None values
        payload = {k: v for k, v in payload.items() if v is not None}

        timestamp_offset = 0.0
        if "startTimeOffset" in message and isinstance(
            message["startTimeOffset"], (int, float)
        ):
            timestamp_offset = float(message["startTimeOffset"])

        return ProviderEvent(
            event_type=event_type,
            call_sid=call_sid,
            session_id=None,  # caller resolves this from call_sid
            timestamp_offset=timestamp_offset,
            payload=payload,
            raw=data,
        )

    @staticmethod
    def _map_speaker(role: str | None) -> str:
        """Map Vapi role → our speaker convention."""
        if not role:
            return "system"
        role_lower = role.lower()
        if role_lower in ("user", "caller", "customer"):
            return "caller"
        if role_lower in ("assistant", "bot", "ai"):
            return "assistant"
        return "system"

    # ===== HTTP retry helper =====

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Execute an HTTP request with retry + exponential backoff."""
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return await self._request_once(method, url, **kwargs)
            except VoiceProviderRateLimitError as e:
                last_exc = e
                wait = min(2**attempt, 30)
                logger.warning(
                    "vapi_rate_limited",
                    attempt=attempt,
                    wait_seconds=wait,
                    url=url,
                )
                await asyncio.sleep(wait)
            except VoiceProviderTimeoutError as e:
                last_exc = e
                wait = min(2**attempt, 10)
                logger.warning(
                    "vapi_timeout",
                    attempt=attempt,
                    wait_seconds=wait,
                    url=url,
                )
                await asyncio.sleep(wait)
            except VoiceProviderConnectionError as e:
                last_exc = e
                wait = min(2**attempt, 10)
                logger.warning(
                    "vapi_connection_error",
                    attempt=attempt,
                    wait_seconds=wait,
                    url=url,
                )
                await asyncio.sleep(wait)
        raise last_exc if last_exc else VoiceProviderConnectionError(
            f"vapi_request_failed_after_retries: {method} {url}"
        )

    async def _request_once(
        self,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Execute a single HTTP request."""
        client = self._get_client()
        start = time.perf_counter()
        try:
            response = await client.request(method, url, **kwargs)
        except httpx.TimeoutException as e:
            raise VoiceProviderTimeoutError(
                f"Vapi request timed out: {method} {url}"
            ) from e
        except httpx.ConnectError as e:
            raise VoiceProviderConnectionError(
                f"Cannot connect to Vapi: {e}"
            ) from e
        except httpx.HTTPError as e:
            raise VoiceProviderConnectionError(
                f"Vapi HTTP error: {e}"
            ) from e

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        # Handle HTTP error status codes
        if response.status_code == 401:
            raise VoiceProviderAuthenticationError(
                f"Vapi 401 Unauthorized — check VAPI_API_KEY"
            )
        if response.status_code == 429:
            raise VoiceProviderRateLimitError(
                f"Vapi 429 Too Many Requests"
            )
        if response.status_code >= 500:
            raise VoiceProviderConnectionError(
                f"Vapi {response.status_code} server error: {response.text[:200]}"
            )
        if response.status_code >= 400:
            # Client error — return details
            try:
                error_body = response.json()
            except Exception:
                error_body = {"raw": response.text[:500]}
            raise VoiceProviderConnectionError(
                f"Vapi {response.status_code} client error: {error_body}"
            )

        # Parse JSON response
        try:
            return response.json()
        except Exception as e:
            raise VoiceProviderConnectionError(
                f"Vapi returned non-JSON response: {e}"
            ) from e

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

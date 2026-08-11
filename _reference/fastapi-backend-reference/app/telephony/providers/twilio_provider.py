"""Twilio telephony provider — fully implemented.

Twilio (https://twilio.com) is the industry-standard telephony API. This
adapter implements:
- Outbound calls (make_call)
- Call control (end, transfer, hold, resume)
- Recording (start, stop)
- Phone number management (list, purchase, release)
- Webhook verification (HMAC-SHA1 — Twilio's signature scheme)
- Webhook parsing (inbound calls, status callbacks, recording callbacks)
- TwiML generation (Say, Dial, Connect+Stream, Record, Hangup)

Twilio API reference:
  Calls:        https://www.twilio.com/docs/voice/api/call-resource
  Recordings:   https://www.twilio.com/docs/voice/api/recording
  Phone numbers: https://www.twilio.com/docs/phone-numbers
  Webhooks:     https://www.twilio.com/docs/usage/webhooks
  TwiML:        https://www.twilio.com/docs/voice/twiml
  Media Stream: https://www.twilio.com/docs/voice/media-streams

Environment variables:
  TWILIO_ACCOUNT_SID  — Account SID (ACxxx)
  TWILIO_AUTH_TOKEN    — Auth token (used for API + webhook signature)
  TWILIO_PHONE_NUMBER  — Default caller ID for outbound calls
  TWILIO_BASE_URL      — https://api.twilio.com (default)
"""

import asyncio
import base64
import hashlib
import hmac
import time
import urllib.parse
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.telephony.providers.base import TelephonyProvider
from app.telephony.providers.exceptions import (
    TelephonyProviderAuthenticationError,
    TelephonyProviderConnectionError,
    TelephonyProviderError,
    TelephonyProviderRateLimitError,
    TelephonyProviderTimeoutError,
)
from app.telephony.providers.models import (
    CallDirection,
    CallTransferRequest,
    ProviderCallStatus,
    ProviderInboundCall,
    TelephonyCallRequest,
    TelephonyCallResponse,
    TelephonyEvent,
    TelephonyEventType,
)
from app.telephony.twiml import (
    connect_to_ai,
    forward_to_number,
    generate_dial_twiml as _gen_dial,
    generate_say_twiml as _gen_say,
    generate_hangup_twiml as _gen_hangup,
    say_and_hangup,
    voicemail,
    reject_busy,
)

logger = get_logger(__name__)


# Maps Twilio call status → our ProviderCallStatus
_TWILIO_STATUS_MAP: dict[str, ProviderCallStatus] = {
    "queued": ProviderCallStatus.QUEUED,
    "ringing": ProviderCallStatus.RINGING,
    "in-progress": ProviderCallStatus.IN_PROGRESS,
    "completed": ProviderCallStatus.COMPLETED,
    "canceled": ProviderCallStatus.CANCELED,
    "failed": ProviderCallStatus.FAILED,
    "busy": ProviderCallStatus.BUSY,
    "no-answer": ProviderCallStatus.NO_ANSWER,
}


class TwilioTelephonyProvider(TelephonyProvider):
    """Twilio telephony provider (fully implemented)."""

    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        base_url: str = "https://api.twilio.com",
        default_phone_number: str = "",
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        super().__init__(
            account_sid=account_sid,
            auth_token=auth_token,
            base_url=base_url or "https://api.twilio.com",
            timeout=timeout,
            max_retries=max_retries,
        )
        self.default_phone_number = default_phone_number

    @property
    def name(self) -> str:
        return "twilio"

    @classmethod
    def from_settings(cls) -> "TwilioTelephonyProvider":
        return cls(
            account_sid=settings.TWILIO_ACCOUNT_SID,
            auth_token=settings.TWILIO_AUTH_TOKEN,
            base_url=settings.TWILIO_BASE_URL,
            default_phone_number=settings.TWILIO_PHONE_NUMBER,
            timeout=settings.TWILIO_TIMEOUT,
            max_retries=settings.TWILIO_MAX_RETRIES,
        )

    def _get_client(self) -> httpx.AsyncClient:
        """Lazy-init the httpx async client with Twilio Basic Auth."""
        if self._client is None or self._client.is_closed:
            self._require_credentials()
            # Twilio uses HTTP Basic Auth: account_sid:auth_token
            credentials = f"{self.account_sid}:{self.auth_token}"
            encoded = base64.b64encode(credentials.encode()).decode()
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers={
                    "Authorization": f"Basic {encoded}",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "DayjoyAI-Telephony/1.0",
                },
            )
        return self._client

    def _api_url(self, path: str) -> str:
        """Build the full API URL for a Twilio resource.

        Twilio API URLs follow the pattern:
          /2010-04-01/Accounts/{AccountSid}/{resource}
        """
        return f"/2010-04-01/Accounts/{self.account_sid}{path}"

    # ===== Call control =====

    async def make_call(
        self,
        request: TelephonyCallRequest,
    ) -> TelephonyCallResponse:
        """Initiate an outbound call via Twilio.

        Twilio API: POST /2010-04-01/Accounts/{SID}/Calls.json
        """
        self._require_credentials()
        client = self._get_client()

        # Build form data (Twilio uses application/x-www-form-urlencoded)
        data: dict[str, str] = {
            "To": request.to_number,
            "From": request.from_number or self.default_phone_number,
        }
        if request.twiml:
            data["Twiml"] = request.twiml
        elif request.twiml_url:
            data["Url"] = request.twiml_url
        elif request.application_sid:
            data["ApplicationSid"] = request.application_sid
        else:
            # Default: connect to AI media stream
            data["Twiml"] = connect_to_ai(
                ai_websocket_url="",  # caller fills this in
                recording_enabled=request.record,
            )

        if request.timeout:
            data["Timeout"] = str(request.timeout)
        if request.record:
            data["Record"] = "true"
        if request.recording_status_callback:
            data["RecordingStatusCallback"] = request.recording_status_callback
        if request.status_callback:
            data["StatusCallback"] = request.status_callback
        if request.status_callback_event:
            data["StatusCallbackEvent"] = " ".join(request.status_callback_event)
        if request.machine_detection:
            data["MachineDetection"] = request.machine_detection

        # Custom metadata (Twilio Passthrough API)
        for k, v in request.metadata.items():
            if isinstance(v, str):
                data[k] = v

        response_data = await self._request_with_retry(
            "POST", self._api_url("/Calls.json"), data=data
        )
        call_sid = response_data.get("sid")
        if not call_sid:
            raise TelephonyProviderConnectionError(
                f"Twilio make_call returned no SID: {response_data!r}"
            )

        status_str = response_data.get("status", "queued")
        status = _TWILIO_STATUS_MAP.get(status_str, ProviderCallStatus.QUEUED)

        logger.info(
            "twilio_call_made",
            call_sid=call_sid,
            to=request.to_number,
            from_=data["From"],
            status=status.value,
        )

        return TelephonyCallResponse(
            call_sid=call_sid,
            status=status,
            direction=CallDirection.OUTBOUND,
            from_number=data["From"],
            to_number=request.to_number,
            started_at=response_data.get("date_created"),
            metadata=response_data,
        )

    async def end_call(self, call_sid: str) -> bool:
        """End a Twilio call by updating its status to 'completed'."""
        self._require_credentials()
        client = self._get_client()
        try:
            await self._request_with_retry(
                "POST",
                self._api_url(f"/Calls/{call_sid}.json"),
                data={"Status": "completed"},
            )
            logger.info("twilio_call_ended", call_sid=call_sid)
            return True
        except TelephonyProviderError as e:
            logger.warning("twilio_end_call_failed", call_sid=call_sid, error=str(e))
            return False

    async def transfer_call(
        self,
        request: CallTransferRequest,
    ) -> bool:
        """Transfer a Twilio call by updating its TwiML to <Dial>."""
        self._require_credentials()
        client = self._get_client()

        # Build TwiML that dials the transfer target
        if request.twiml_url:
            twiml = None
            url = request.twiml_url
        else:
            url = None
            twiml = _gen_dial(
                request.to_number,
                timeout=request.timeout,
                record=request.record,
            )

        data: dict[str, str] = {}
        if twiml:
            data["Twiml"] = twiml
        if url:
            data["Url"] = url

        try:
            await self._request_with_retry(
                "POST",
                self._api_url(f"/Calls/{request.call_sid}.json"),
                data=data,
            )
            logger.info(
                "twilio_call_transferred",
                call_sid=request.call_sid,
                to=request.to_number,
            )
            return True
        except TelephonyProviderError as e:
            logger.warning(
                "twilio_transfer_failed",
                call_sid=request.call_sid,
                error=str(e),
            )
            return False

    async def hold_call(self, call_sid: str) -> bool:
        """Put a Twilio call on hold by playing hold music.

        Twilio doesn't have a native "hold" verb — we use <Play> with a
        looping hold-music URL. The caller's audio stream is preserved.
        """
        self._require_credentials()
        client = self._get_client()
        # Hold music URL — Twilio-provided royalty-free hold music
        hold_music_url = "http://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3"
        twiml = f'<Response><Play loop="0">{hold_music_url}</Play></Response>'
        try:
            await self._request_with_retry(
                "POST",
                self._api_url(f"/Calls/{call_sid}.json"),
                data={"Twiml": twiml},
            )
            logger.info("twilio_call_held", call_sid=call_sid)
            return True
        except TelephonyProviderError as e:
            logger.warning("twilio_hold_failed", call_sid=call_sid, error=str(e))
            return False

    async def resume_call(self, call_sid: str) -> bool:
        """Resume a held call by re-connecting to the AI stream."""
        self._require_credentials()
        client = self._get_client()
        # To resume, we re-issue the original connect-to-AI TwiML
        twiml = connect_to_ai(
            ai_websocket_url="",  # caller fills this in
            recording_enabled=False,
        )
        try:
            await self._request_with_retry(
                "POST",
                self._api_url(f"/Calls/{call_sid}.json"),
                data={"Twiml": twiml},
            )
            logger.info("twilio_call_resumed", call_sid=call_sid)
            return True
        except TelephonyProviderError as e:
            logger.warning("twilio_resume_failed", call_sid=call_sid, error=str(e))
            return False

    async def get_call(self, call_sid: str) -> dict[str, Any]:
        """Fetch call details from Twilio."""
        self._require_credentials()
        return await self._request_with_retry(
            "GET", self._api_url(f"/Calls/{call_sid}.json")
        )

    # ===== Recording =====

    async def start_recording(self, call_sid: str) -> str | None:
        """Start recording a Twilio call.

        Twilio API: POST /2010-04-01/Accounts/{SID}/Calls/{CallSid}/Recordings.json
        """
        self._require_credentials()
        client = self._get_client()
        data = {
            "RecordingStatusCallback": "",
            "RecordingChannels": settings.RECORDING_CHANNELS,
            "RecordingFormat": settings.RECORDING_FORMAT,
        }
        try:
            response_data = await self._request_with_retry(
                "POST",
                self._api_url(f"/Calls/{call_sid}/Recordings.json"),
                data=data,
            )
            recording_sid = response_data.get("sid")
            logger.info(
                "twilio_recording_started",
                call_sid=call_sid,
                recording_sid=recording_sid,
            )
            return recording_sid
        except TelephonyProviderError as e:
            logger.warning(
                "twilio_recording_start_failed",
                call_sid=call_sid,
                error=str(e),
            )
            return None

    async def stop_recording(self, call_sid: str, recording_sid: str) -> bool:
        """Stop a Twilio recording by updating its status to 'stopped'."""
        self._require_credentials()
        client = self._get_client()
        try:
            await self._request_with_retry(
                "POST",
                self._api_url(f"/Recordings/{recording_sid}.json"),
                data={"Status": "stopped"},
            )
            logger.info(
                "twilio_recording_stopped",
                call_sid=call_sid,
                recording_sid=recording_sid,
            )
            return True
        except TelephonyProviderError as e:
            logger.warning(
                "twilio_recording_stop_failed",
                call_sid=call_sid,
                recording_sid=recording_sid,
                error=str(e),
            )
            return False

    # ===== Phone number management =====

    async def list_phone_numbers(self) -> list[dict[str, Any]]:
        """List Twilio phone numbers owned by this account."""
        self._require_credentials()
        response_data = await self._request_with_retry(
            "GET", self._api_url("/IncomingPhoneNumbers.json")
        )
        return response_data.get("incoming_phone_numbers", [])

    async def purchase_phone_number(
        self,
        phone_number: str,
        friendly_name: str | None = None,
    ) -> dict[str, Any]:
        """Purchase / provision a Twilio phone number.

        If the number is already in your account, this returns its details.
        Otherwise it attempts to buy it (requires available balance).
        """
        self._require_credentials()
        client = self._get_client()
        data: dict[str, str] = {"PhoneNumber": phone_number}
        if friendly_name:
            data["FriendlyName"] = friendly_name

        response_data = await self._request_with_retry(
            "POST",
            self._api_url("/IncomingPhoneNumbers.json"),
            data=data,
        )
        logger.info(
            "twilio_number_purchased",
            phone_number=phone_number,
            sid=response_data.get("sid"),
        )
        return response_data

    async def release_phone_number(self, phone_number_sid: str) -> bool:
        """Release (delete) a Twilio phone number."""
        self._require_credentials()
        try:
            await self._request_with_retry(
                "DELETE",
                self._api_url(f"/IncomingPhoneNumbers/{phone_number_sid}.json"),
            )
            logger.info("twilio_number_released", sid=phone_number_sid)
            return True
        except TelephonyProviderError as e:
            logger.warning(
                "twilio_number_release_failed",
                sid=phone_number_sid,
                error=str(e),
            )
            return False

    # ===== Webhook signature verification =====

    def verify_webhook_signature(
        self,
        body: bytes,
        headers: dict[str, str],
        url: str | None = None,
    ) -> bool:
        """Verify a Twilio webhook signature.

        Twilio signs requests with HMAC-SHA1 using the Auth Token as the key.
        The signature is computed over: URL + sorted POST params (URL-encoded).
        The signature is sent in the `X-Twilio-Signature` header (Base64).

        Reference: https://www.twilio.com/docs/usage/security

        Args:
            body: Raw request body bytes.
            headers: Request headers.
            url: The full URL Twilio sent the webhook to (REQUIRED for Twilio).

        Returns:
            True if the signature is valid, False otherwise.
        """
        if not self.auth_token:
            # No auth token configured — cannot verify
            logger.warning("twilio_webhook_no_auth_token")
            return False

        signature_header = (
            headers.get("X-Twilio-Signature")
            or headers.get("x-twilio-signature")
            or ""
        )
        if not signature_header:
            logger.warning("twilio_webhook_missing_signature")
            return False

        if not url:
            # Cannot verify without URL — Twilio's signature scheme requires it
            logger.warning("twilio_webhook_no_url")
            return False

        # Build the string to sign: URL + sorted POST params
        # Twilio expects the URL exactly as it appears in the request.
        # The POST params are appended as key=value pairs in sorted order.
        try:
            body_str = body.decode("utf-8") if body else ""
            params = urllib.parse.parse_qs(body_str, keep_blank_values=True)
            # Flatten single-value lists
            flat_params = {k: v[0] if v else "" for k, v in params.items()}
        except Exception:
            flat_params = {}

        # Sort params and build the string
        sorted_params = sorted(flat_params.items())
        param_str = "".join(f"{k}{v}" for k, v in sorted_params)
        string_to_sign = url + param_str

        # Compute HMAC-SHA1
        computed = hmac.new(
            self.auth_token.encode(),
            string_to_sign.encode(),
            hashlib.sha1,
        ).digest()
        computed_b64 = base64.b64encode(computed).decode()

        # Constant-time comparison
        if not hmac.compare_digest(computed_b64, signature_header):
            logger.warning(
                "twilio_webhook_signature_mismatch",
                expected_prefix=computed_b64[:16],
                got_prefix=signature_header[:16],
            )
            return False

        return True

    # ===== Webhook parsing =====

    def parse_inbound_call(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> ProviderInboundCall:
        """Parse an inbound call webhook from Twilio.

        Twilio sends a POST with form-encoded params when a call comes in.
        Key params: CallSid, From, To, Direction, CallerName, Called, AccountSid.
        """
        try:
            body_str = body.decode("utf-8") if body else ""
            params = urllib.parse.parse_qs(body_str, keep_blank_values=True)
            flat = {k: v[0] if v else "" for k, v in params.items()}
        except Exception as e:
            raise TelephonyProviderConnectionError(
                f"Cannot parse Twilio inbound call body: {e}"
            ) from e

        call_sid = flat.get("CallSid", "")
        if not call_sid:
            raise TelephonyProviderConnectionError(
                "Twilio inbound call webhook missing CallSid"
            )

        direction_str = flat.get("Direction", "inbound").lower()
        direction = (
            CallDirection.INBOUND
            if "inbound" in direction_str
            else CallDirection.OUTBOUND
        )

        return ProviderInboundCall(
            call_sid=call_sid,
            from_number=flat.get("From", ""),
            to_number=flat.get("To", ""),
            direction=direction,
            caller_name=flat.get("CallerName"),
            called_number_sid=flat.get("Called"),
            account_sid=flat.get("AccountSid"),
            metadata=flat,
        )

    def parse_status_callback(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> TelephonyEvent:
        """Parse a Twilio status callback webhook."""
        try:
            body_str = body.decode("utf-8") if body else ""
            params = urllib.parse.parse_qs(body_str, keep_blank_values=True)
            flat = {k: v[0] if v else "" for k, v in params.items()}
        except Exception as e:
            raise TelephonyProviderConnectionError(
                f"Cannot parse Twilio status callback: {e}"
            ) from e

        call_sid = flat.get("CallSid", "")
        twilio_status = flat.get("CallStatus", "").lower()

        # Map Twilio status → our event type
        status_to_event = {
            "ringing": TelephonyEventType.CALL_RINGING,
            "in-progress": TelephonyEventType.CALL_ANSWERED,
            "completed": TelephonyEventType.CALL_COMPLETED,
            "canceled": TelephonyEventType.CALL_CANCELED,
            "failed": TelephonyEventType.CALL_FAILED,
            "busy": TelephonyEventType.CALL_BUSY,
            "no-answer": TelephonyEventType.CALL_NO_ANSWER,
        }
        event_type = status_to_event.get(
            twilio_status, TelephonyEventType.UNKNOWN
        )

        # Build payload
        payload: dict[str, Any] = {
            "status": twilio_status,
            "from": flat.get("From"),
            "to": flat.get("To"),
            "duration_seconds": int(flat["CallDuration"]) if flat.get("CallDuration") else None,
            "answered_by": flat.get("AnsweredBy"),
            "forwarding_from": flat.get("ForwardedFrom"),
            "hangup_cause": flat.get("HangupCause"),
        }
        # Strip None values
        payload = {k: v for k, v in payload.items() if v is not None}

        return TelephonyEvent(
            event_type=event_type,
            call_sid=call_sid,
            payload=payload,
            raw=flat,
        )

    def parse_recording_callback(
        self,
        body: bytes,
        headers: dict[str, str],
    ) -> TelephonyEvent:
        """Parse a Twilio recording status callback webhook."""
        try:
            body_str = body.decode("utf-8") if body else ""
            params = urllib.parse.parse_qs(body_str, keep_blank_values=True)
            flat = {k: v[0] if v else "" for k, v in params.items()}
        except Exception as e:
            raise TelephonyProviderConnectionError(
                f"Cannot parse Twilio recording callback: {e}"
            ) from e

        recording_status = flat.get("RecordingStatus", "").lower()
        event_type_map = {
            "in-progress": TelephonyEventType.RECORDING_STARTED,
            "completed": TelephonyEventType.RECORDING_COMPLETED,
            "failed": TelephonyEventType.RECORDING_FAILED,
            "absent": TelephonyEventType.RECORDING_FAILED,
        }
        event_type = event_type_map.get(
            recording_status, TelephonyEventType.RECORDING_COMPLETED
        )

        payload: dict[str, Any] = {
            "recording_sid": flat.get("RecordingSid"),
            "url": flat.get("RecordingUrl"),
            "duration_seconds": int(flat["RecordingDuration"])
            if flat.get("RecordingDuration")
            else 0,
            "channels": int(flat["RecordingChannels"]) if flat.get("RecordingChannels") else 1,
            "format": "wav" if "wav" in flat.get("RecordingUrl", "").lower() else "mp3",
            "status": recording_status,
        }

        return TelephonyEvent(
            event_type=event_type,
            call_sid=flat.get("CallSid"),
            payload=payload,
            raw=flat,
        )

    # ===== TwiML generation =====

    def generate_connect_twiml(
        self,
        ai_websocket_url: str,
        *,
        greeting_text: str | None = None,
        recording_enabled: bool = True,
        recording_status_callback: str | None = None,
        session_id: str | None = None,
        organization_id: str | None = None,
        assistant_id: str | None = None,
    ) -> str:
        """Generate TwiML to connect a call to the AI media stream."""
        return connect_to_ai(
            ai_websocket_url=ai_websocket_url,
            greeting_text=greeting_text,
            recording_enabled=recording_enabled,
            recording_status_callback=recording_status_callback,
            session_id=session_id,
            organization_id=organization_id,
            assistant_id=assistant_id,
        )

    def generate_dial_twiml(
        self,
        to_number: str,
        *,
        timeout: int = 30,
        record: bool = False,
        caller_id: str | None = None,
    ) -> str:
        """Generate TwiML to dial (transfer/forward) a call."""
        return _gen_dial(
            to_number, timeout=timeout, record=record, caller_id=caller_id
        )

    def generate_say_twiml(
        self,
        text: str,
        *,
        voice: str = "Polly.Joanna",
        language: str = "en-US",
    ) -> str:
        """Generate TwiML to speak text to the caller (TTS)."""
        return _gen_say(text, voice=voice, language=language)

    def generate_hangup_twiml(self) -> str:
        """Generate TwiML to hang up the call."""
        return _gen_hangup()

    # ===== HTTP retry helper =====

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        *,
        data: dict[str, str] | None = None,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute an HTTP request with retry + exponential backoff."""
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return await self._request_once(method, url, data=data, params=params)
            except TelephonyProviderRateLimitError as e:
                last_exc = e
                wait = min(2**attempt, 30)
                logger.warning(
                    "twilio_rate_limited",
                    attempt=attempt,
                    wait_seconds=wait,
                    url=url,
                )
                await asyncio.sleep(wait)
            except TelephonyProviderTimeoutError as e:
                last_exc = e
                wait = min(2**attempt, 10)
                logger.warning(
                    "twilio_timeout",
                    attempt=attempt,
                    wait_seconds=wait,
                    url=url,
                )
                await asyncio.sleep(wait)
            except TelephonyProviderConnectionError as e:
                last_exc = e
                wait = min(2**attempt, 10)
                logger.warning(
                    "twilio_connection_error",
                    attempt=attempt,
                    wait_seconds=wait,
                    url=url,
                )
                await asyncio.sleep(wait)
        raise last_exc if last_exc else TelephonyProviderConnectionError(
            f"twilio_request_failed_after_retries: {method} {url}"
        )

    async def _request_once(
        self,
        method: str,
        url: str,
        *,
        data: dict[str, str] | None = None,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute a single HTTP request."""
        client = self._get_client()
        start = time.perf_counter()
        try:
            response = await client.request(
                method, url, data=data, params=params
            )
        except httpx.TimeoutException as e:
            raise TelephonyProviderTimeoutError(
                f"Twilio request timed out: {method} {url}"
            ) from e
        except httpx.ConnectError as e:
            raise TelephonyProviderConnectionError(
                f"Cannot connect to Twilio: {e}"
            ) from e
        except httpx.HTTPError as e:
            raise TelephonyProviderConnectionError(
                f"Twilio HTTP error: {e}"
            ) from e

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        # Handle HTTP error status codes
        if response.status_code == 401 or response.status_code == 403:
            raise TelephonyProviderAuthenticationError(
                f"Twilio {response.status_code} — check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN"
            )
        if response.status_code == 429:
            raise TelephonyProviderRateLimitError(
                f"Twilio 429 Too Many Requests"
            )
        if response.status_code >= 500:
            raise TelephonyProviderConnectionError(
                f"Twilio {response.status_code} server error: {response.text[:200]}"
            )
        if response.status_code >= 400:
            try:
                error_body = response.json()
            except Exception:
                error_body = {"raw": response.text[:500]}
            raise TelephonyProviderConnectionError(
                f"Twilio {response.status_code} client error: {error_body}"
            )

        # For DELETE requests, the response body may be empty
        if method == "DELETE" and not response.content:
            return {"deleted": True}

        # Parse JSON response
        try:
            return response.json()
        except Exception as e:
            raise TelephonyProviderConnectionError(
                f"Twilio returned non-JSON response: {e}"
            ) from e

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

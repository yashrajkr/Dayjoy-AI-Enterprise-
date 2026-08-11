"""Plivo telephony provider — stub implementation.

Plivo (https://plivo.com) is a CPaaS provider similar to Twilio.
This stub raises NotImplementedError for all methods.
"""

from typing import Any

from app.telephony.providers.base import TelephonyProvider
from app.telephony.providers.exceptions import (
    TelephonyProviderNotImplementedError,
)
from app.telephony.providers.models import (
    CallTransferRequest,
    ProviderInboundCall,
    TelephonyCallRequest,
    TelephonyCallResponse,
    TelephonyEvent,
)


class PlivoTelephonyProvider(TelephonyProvider):
    """Plivo telephony provider (stub — not yet implemented)."""

    def __init__(self, account_sid: str = "", auth_token: str = "", **kwargs: Any) -> None:
        super().__init__(account_sid=account_sid, auth_token=auth_token, base_url="https://api.plivo.com")

    @property
    def name(self) -> str:
        return "plivo"

    @classmethod
    def from_settings(cls) -> "PlivoTelephonyProvider":
        return cls()

    async def make_call(self, request: TelephonyCallRequest) -> TelephonyCallResponse:
        raise TelephonyProviderNotImplementedError("plivo", "make_call")

    async def end_call(self, call_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("plivo", "end_call")

    async def transfer_call(self, request: CallTransferRequest) -> bool:
        raise TelephonyProviderNotImplementedError("plivo", "transfer_call")

    async def hold_call(self, call_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("plivo", "hold_call")

    async def resume_call(self, call_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("plivo", "resume_call")

    async def get_call(self, call_sid: str) -> dict[str, Any]:
        raise TelephonyProviderNotImplementedError("plivo", "get_call")

    async def start_recording(self, call_sid: str) -> str | None:
        raise TelephonyProviderNotImplementedError("plivo", "start_recording")

    async def stop_recording(self, call_sid: str, recording_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("plivo", "stop_recording")

    async def list_phone_numbers(self) -> list[dict[str, Any]]:
        raise TelephonyProviderNotImplementedError("plivo", "list_phone_numbers")

    async def purchase_phone_number(self, phone_number: str, friendly_name: str | None = None) -> dict[str, Any]:
        raise TelephonyProviderNotImplementedError("plivo", "purchase_phone_number")

    async def release_phone_number(self, phone_number_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("plivo", "release_phone_number")

    def verify_webhook_signature(self, body: bytes, headers: dict[str, str], url: str | None = None) -> bool:
        raise TelephonyProviderNotImplementedError("plivo", "verify_webhook_signature")

    def parse_inbound_call(self, body: bytes, headers: dict[str, str]) -> ProviderInboundCall:
        raise TelephonyProviderNotImplementedError("plivo", "parse_inbound_call")

    def parse_status_callback(self, body: bytes, headers: dict[str, str]) -> TelephonyEvent:
        raise TelephonyProviderNotImplementedError("plivo", "parse_status_callback")

    def parse_recording_callback(self, body: bytes, headers: dict[str, str]) -> TelephonyEvent:
        raise TelephonyProviderNotImplementedError("plivo", "parse_recording_callback")

    def generate_connect_twiml(self, ai_websocket_url: str, **kwargs: Any) -> str:
        raise TelephonyProviderNotImplementedError("plivo", "generate_connect_twiml")

    def generate_dial_twiml(self, to_number: str, **kwargs: Any) -> str:
        raise TelephonyProviderNotImplementedError("plivo", "generate_dial_twiml")

    def generate_say_twiml(self, text: str, **kwargs: Any) -> str:
        raise TelephonyProviderNotImplementedError("plivo", "generate_say_twiml")

    def generate_hangup_twiml(self) -> str:
        raise TelephonyProviderNotImplementedError("plivo", "generate_hangup_twiml")

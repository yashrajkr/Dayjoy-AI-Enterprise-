"""Knowlarity telephony provider — stub implementation.

Knowlarity (https://knowlarity.com) is a cloud telephony provider popular
in India. This stub raises NotImplementedError for all methods.
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


class KnowlarityTelephonyProvider(TelephonyProvider):
    """Knowlarity telephony provider (stub — not yet implemented)."""

    def __init__(self, account_sid: str = "", auth_token: str = "", **kwargs: Any) -> None:
        super().__init__(account_sid=account_sid, auth_token=auth_token, base_url="https://api.knowlarity.com")

    @property
    def name(self) -> str:
        return "knowlarity"

    @classmethod
    def from_settings(cls) -> "KnowlarityTelephonyProvider":
        return cls()

    async def make_call(self, request: TelephonyCallRequest) -> TelephonyCallResponse:
        raise TelephonyProviderNotImplementedError("knowlarity", "make_call")

    async def end_call(self, call_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("knowlarity", "end_call")

    async def transfer_call(self, request: CallTransferRequest) -> bool:
        raise TelephonyProviderNotImplementedError("knowlarity", "transfer_call")

    async def hold_call(self, call_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("knowlarity", "hold_call")

    async def resume_call(self, call_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("knowlarity", "resume_call")

    async def get_call(self, call_sid: str) -> dict[str, Any]:
        raise TelephonyProviderNotImplementedError("knowlarity", "get_call")

    async def start_recording(self, call_sid: str) -> str | None:
        raise TelephonyProviderNotImplementedError("knowlarity", "start_recording")

    async def stop_recording(self, call_sid: str, recording_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("knowlarity", "stop_recording")

    async def list_phone_numbers(self) -> list[dict[str, Any]]:
        raise TelephonyProviderNotImplementedError("knowlarity", "list_phone_numbers")

    async def purchase_phone_number(self, phone_number: str, friendly_name: str | None = None) -> dict[str, Any]:
        raise TelephonyProviderNotImplementedError("knowlarity", "purchase_phone_number")

    async def release_phone_number(self, phone_number_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("knowlarity", "release_phone_number")

    def verify_webhook_signature(self, body: bytes, headers: dict[str, str], url: str | None = None) -> bool:
        raise TelephonyProviderNotImplementedError("knowlarity", "verify_webhook_signature")

    def parse_inbound_call(self, body: bytes, headers: dict[str, str]) -> ProviderInboundCall:
        raise TelephonyProviderNotImplementedError("knowlarity", "parse_inbound_call")

    def parse_status_callback(self, body: bytes, headers: dict[str, str]) -> TelephonyEvent:
        raise TelephonyProviderNotImplementedError("knowlarity", "parse_status_callback")

    def parse_recording_callback(self, body: bytes, headers: dict[str, str]) -> TelephonyEvent:
        raise TelephonyProviderNotImplementedError("knowlarity", "parse_recording_callback")

    def generate_connect_twiml(self, ai_websocket_url: str, **kwargs: Any) -> str:
        raise TelephonyProviderNotImplementedError("knowlarity", "generate_connect_twiml")

    def generate_dial_twiml(self, to_number: str, **kwargs: Any) -> str:
        raise TelephonyProviderNotImplementedError("knowlarity", "generate_dial_twiml")

    def generate_say_twiml(self, text: str, **kwargs: Any) -> str:
        raise TelephonyProviderNotImplementedError("knowlarity", "generate_say_twiml")

    def generate_hangup_twiml(self) -> str:
        raise TelephonyProviderNotImplementedError("knowlarity", "generate_hangup_twiml")

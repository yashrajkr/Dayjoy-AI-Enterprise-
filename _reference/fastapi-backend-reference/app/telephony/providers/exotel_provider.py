"""Exotel telephony provider — stub implementation.

Exotel (https://exotel.com) is a popular telephony provider in India/SEA.
This stub raises NotImplementedError for all methods. To activate:
1. Implement each method following the Exotel API docs
2. Add `exotel` to TELEPHONY_PROVIDER_REGISTRY (already done)
3. Set TELEPHONY_PROVIDER=exotel in your .env
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


class ExotelTelephonyProvider(TelephonyProvider):
    """Exotel telephony provider (stub — not yet implemented)."""

    def __init__(self, account_sid: str = "", auth_token: str = "", **kwargs: Any) -> None:
        super().__init__(account_sid=account_sid, auth_token=auth_token, base_url="https://api.exotel.com")

    @property
    def name(self) -> str:
        return "exotel"

    @classmethod
    def from_settings(cls) -> "ExotelTelephonyProvider":
        return cls()

    async def make_call(self, request: TelephonyCallRequest) -> TelephonyCallResponse:
        raise TelephonyProviderNotImplementedError("exotel", "make_call")

    async def end_call(self, call_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("exotel", "end_call")

    async def transfer_call(self, request: CallTransferRequest) -> bool:
        raise TelephonyProviderNotImplementedError("exotel", "transfer_call")

    async def hold_call(self, call_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("exotel", "hold_call")

    async def resume_call(self, call_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("exotel", "resume_call")

    async def get_call(self, call_sid: str) -> dict[str, Any]:
        raise TelephonyProviderNotImplementedError("exotel", "get_call")

    async def start_recording(self, call_sid: str) -> str | None:
        raise TelephonyProviderNotImplementedError("exotel", "start_recording")

    async def stop_recording(self, call_sid: str, recording_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("exotel", "stop_recording")

    async def list_phone_numbers(self) -> list[dict[str, Any]]:
        raise TelephonyProviderNotImplementedError("exotel", "list_phone_numbers")

    async def purchase_phone_number(self, phone_number: str, friendly_name: str | None = None) -> dict[str, Any]:
        raise TelephonyProviderNotImplementedError("exotel", "purchase_phone_number")

    async def release_phone_number(self, phone_number_sid: str) -> bool:
        raise TelephonyProviderNotImplementedError("exotel", "release_phone_number")

    def verify_webhook_signature(self, body: bytes, headers: dict[str, str], url: str | None = None) -> bool:
        raise TelephonyProviderNotImplementedError("exotel", "verify_webhook_signature")

    def parse_inbound_call(self, body: bytes, headers: dict[str, str]) -> ProviderInboundCall:
        raise TelephonyProviderNotImplementedError("exotel", "parse_inbound_call")

    def parse_status_callback(self, body: bytes, headers: dict[str, str]) -> TelephonyEvent:
        raise TelephonyProviderNotImplementedError("exotel", "parse_status_callback")

    def parse_recording_callback(self, body: bytes, headers: dict[str, str]) -> TelephonyEvent:
        raise TelephonyProviderNotImplementedError("exotel", "parse_recording_callback")

    def generate_connect_twiml(self, ai_websocket_url: str, **kwargs: Any) -> str:
        raise TelephonyProviderNotImplementedError("exotel", "generate_connect_twiml")

    def generate_dial_twiml(self, to_number: str, **kwargs: Any) -> str:
        raise TelephonyProviderNotImplementedError("exotel", "generate_dial_twiml")

    def generate_say_twiml(self, text: str, **kwargs: Any) -> str:
        raise TelephonyProviderNotImplementedError("exotel", "generate_say_twiml")

    def generate_hangup_twiml(self) -> str:
        raise TelephonyProviderNotImplementedError("exotel", "generate_hangup_twiml")

"""Meta WhatsApp Cloud API client.

Implements the Meta WhatsApp Business Cloud API:
- Send messages (text, media, template, interactive)
- Upload media
- Download media
- Verify webhook signatures (HMAC-SHA256)
- Parse inbound webhook events

API reference: https://developers.facebook.com/docs/whatsapp/cloud-api

Authentication: Bearer token (System User access token).
Webhook verification: X-Hub-Signature-256 header (HMAC-SHA256 with App Secret).
"""

import asyncio
import hashlib
import hmac
import json
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class MetaWhatsAppError(Exception):
    """Base exception for Meta WhatsApp API errors."""

    def __init__(self, message: str, code: int | None = None) -> None:
        super().__init__(message)
        self.code = code


class MetaWhatsAppClient:
    """Async client for the Meta WhatsApp Cloud API.

    Each tenant gets its own client instance (with its own access token
    + phone number ID). The client is created on-demand by WhatsAppService.
    """

    def __init__(
        self,
        access_token: str,
        phone_number_id: str,
        api_version: str = "v18.0",
        app_secret: str = "",
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self.access_token = access_token
        self.phone_number_id = phone_number_id
        self.api_version = api_version or settings.WHATSAPP_API_VERSION
        self.app_secret = app_secret
        self.timeout = timeout
        self.max_retries = max_retries
        self._client: httpx.AsyncClient | None = None

    @property
    def base_url(self) -> str:
        return f"https://graph.facebook.com/{self.api_version}"

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type": "application/json",
                    "User-Agent": "DayjoyAI-WhatsApp/1.0",
                },
            )
        return self._client

    # ===== Send messages =====

    async def send_text(
        self,
        to: str,
        text: str,
        *,
        preview_url: bool = False,
        reply_to_message_id: str | None = None,
    ) -> dict[str, Any]:
        """Send a text message.

        Args:
            to: Recipient phone number (E.164 without +, e.g. "1234567890").
            text: Message body (max 4096 chars).
            preview_url: Whether to show URL previews.
            reply_to_message_id: WA message ID to reply to.

        Returns:
            Meta API response: {"messaging_product": "whatsapp", "contacts": [...], "messages": [{"id": "..."}]}
        """
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"body": text, "preview_url": preview_url},
        }
        if reply_to_message_id:
            payload["context"] = {"message_id": reply_to_message_id}
        return await self._post(f"/{self.phone_number_id}/messages", payload)

    async def send_media(
        self,
        to: str,
        media_type: str,
        media_id: str,
        *,
        caption: str | None = None,
        reply_to_message_id: str | None = None,
    ) -> dict[str, Any]:
        """Send a media message (image, video, audio, document).

        Args:
            to: Recipient phone number.
            media_type: image, video, audio, document.
            media_id: Meta media ID (from upload_media).
            caption: Optional caption (image/video/document only).
        """
        media_obj: dict[str, Any] = {"id": media_id}
        if caption and media_type in ("image", "video", "document"):
            media_obj["caption"] = caption
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": media_type,
            media_type: media_obj,
        }
        if reply_to_message_id:
            payload["context"] = {"message_id": reply_to_message_id}
        return await self._post(f"/{self.phone_number_id}/messages", payload)

    async def send_location(
        self,
        to: str,
        latitude: float,
        longitude: float,
        *,
        name: str | None = None,
        address: str | None = None,
    ) -> dict[str, Any]:
        """Send a location message."""
        location: dict[str, Any] = {"latitude": latitude, "longitude": longitude}
        if name:
            location["name"] = name
        if address:
            location["address"] = address
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "location",
            "location": location,
        }
        return await self._post(f"/{self.phone_number_id}/messages", payload)

    async def send_template(
        self,
        to: str,
        template_name: str,
        language: str = "en",
        components: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Send a template message (for proactive outbound outside 24h window).

        Args:
            to: Recipient phone number.
            template_name: Approved template name.
            language: Template language code.
            components: Template component parameters.
        """
        template: dict[str, Any] = {"name": template_name, "language": {"code": language}}
        if components:
            template["components"] = components
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "template",
            "template": template,
        }
        return await self._post(f"/{self.phone_number_id}/messages", payload)

    async def send_interactive_buttons(
        self,
        to: str,
        body_text: str,
        buttons: list[dict[str, str]],
        *,
        header: dict[str, Any] | None = None,
        footer_text: str | None = None,
    ) -> dict[str, Any]:
        """Send an interactive button message.

        Args:
            to: Recipient phone number.
            body_text: Body text.
            buttons: List of {"type": "reply", "id": "btn1", "title": "Yes"}.
            header: Optional header.
            footer_text: Optional footer text.
        """
        action = {"buttons": buttons}
        interactive: dict[str, Any] = {"type": "button", "body": {"text": body_text}, "action": action}
        if header:
            interactive["header"] = header
        if footer_text:
            interactive["footer"] = {"text": footer_text}
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": interactive,
        }
        return await self._post(f"/{self.phone_number_id}/messages", payload)

    async def send_interactive_list(
        self,
        to: str,
        body_text: str,
        button_text: str,
        sections: list[dict[str, Any]],
        *,
        header_text: str | None = None,
        footer_text: str | None = None,
    ) -> dict[str, Any]:
        """Send an interactive list message."""
        interactive: dict[str, Any] = {
            "type": "list",
            "body": {"text": body_text},
            "action": {"button": button_text, "sections": sections},
        }
        if header_text:
            interactive["header"] = {"type": "text", "text": header_text}
        if footer_text:
            interactive["footer"] = {"text": footer_text}
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": interactive,
        }
        return await self._post(f"/{self.phone_number_id}/messages", payload)

    async def send_contacts(
        self,
        to: str,
        contacts: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Send a contacts message."""
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "contacts",
            "contacts": contacts,
        }
        return await self._post(f"/{self.phone_number_id}/messages", payload)

    async def mark_message_read(self, message_id: str) -> dict[str, Any]:
        """Mark a message as read (sends read receipt)."""
        payload = {"messaging_product": "whatsapp", "status": "read", "message_id": message_id}
        return await self._post(f"/{self.phone_number_id}/messages", payload)

    # ===== Media =====

    async def upload_media(
        self,
        file_path: str,
        mime_type: str,
        *,
        filename: str | None = None,
    ) -> dict[str, Any]:
        """Upload a media file to Meta.

        Returns: {"id": "<media_id>"}
        """
        import os

        if not filename:
            filename = os.path.basename(file_path)

        # Read file
        with open(file_path, "rb") as f:
            file_data = f.read()

        # Multipart form data
        files = {
            "file": (filename, file_data, mime_type),
        }
        data = {
            "messaging_product": "whatsapp",
            "type": mime_type.split("/")[0],  # image, video, audio, document
        }

        client = self._get_client()
        # Override content type for multipart
        headers = {
            "Authorization": f"Bearer {self.access_token}",
        }
        try:
            response = await client.post(
                f"/{self.phone_number_id}/media",
                data=data,
                files=files,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error("meta_upload_media_failed", status=e.response.status_code, body=e.response.text[:500])
            raise MetaWhatsAppError(
                f"Upload failed: {e.response.status_code} {e.response.text[:200]}",
                code=e.response.status_code,
            ) from e

    async def download_media(self, media_id: str) -> dict[str, Any]:
        """Get media metadata + download URL.

        Returns: {"id": "...", "messaging_product": "whatsapp", "url": "...", "mime_type": "...", "sha256": "...", "file_size": ...}

        The URL is temporary (expires in ~5 minutes). Download the file
        immediately after getting the URL.
        """
        return await self._get(f"/{media_id}")

    async def download_media_file(self, download_url: str) -> bytes:
        """Download the actual media file from the URL returned by download_media."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(download_url)
                response.raise_for_status()
                return response.content
            except httpx.HTTPStatusError as e:
                raise MetaWhatsAppError(
                    f"Download failed: {e.response.status_code}",
                    code=e.response.status_code,
                ) from e

    # ===== Phone number management =====

    async def get_phone_number(self) -> dict[str, Any]:
        """Get details about the phone number (display number, quality, etc.)."""
        return await self._get(f"/{self.phone_number_id}")

    async def get_business_profile(self) -> dict[str, Any]:
        """Get the WhatsApp Business profile."""
        return await self._get(f"/whatsapp_business_profile?phone_number_id={self.phone_number_id}")

    # ===== Templates =====

    async def create_template(self, template_data: dict[str, Any]) -> dict[str, Any]:
        """Submit a template to Meta for approval."""
        waba_id = settings.WHATSAPP_BUSINESS_ACCOUNT_ID
        return await self._post(f"/{waba_id}/message_templates", template_data)

    async def list_templates(self) -> dict[str, Any]:
        """List all templates for the business account."""
        waba_id = settings.WHATSAPP_BUSINESS_ACCOUNT_ID
        return await self._get(f"/{waba_id}/message_templates")

    async def delete_template(self, template_name: str) -> bool:
        """Delete a template."""
        waba_id = settings.WHATSAPP_BUSINESS_ACCOUNT_ID
        try:
            await self._delete(f"/{waba_id}/message_templates?name={template_name}")
            return True
        except MetaWhatsAppError:
            return False

    # ===== Webhook verification =====

    def verify_webhook_signature(
        self,
        body: bytes,
        signature_header: str,
    ) -> bool:
        """Verify the X-Hub-Signature-256 header.

        Meta signs webhook payloads with HMAC-SHA256 using the App Secret.

        Args:
            body: Raw request body bytes.
            signature_header: Value of X-Hub-Signature-256 header (e.g. "sha256=abc123...").

        Returns:
            True if the signature is valid, False otherwise.
        """
        if not self.app_secret:
            # No app secret configured — cannot verify
            logger.warning("meta_webhook_no_app_secret")
            return False

        if not signature_header or not signature_header.startswith("sha256="):
            logger.warning("meta_webhook_invalid_signature_format")
            return False

        # Extract the hex digest
        expected_sig = signature_header.removeprefix("sha256=")

        # Compute HMAC-SHA256
        computed = hmac.new(
            self.app_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()

        # Constant-time comparison
        return hmac.compare_digest(computed, expected_sig)

    @staticmethod
    def verify_webhook_challenge(
        mode: str,
        token: str,
        verify_token: str,
        challenge: str,
    ) -> str | None:
        """Verify the webhook subscription challenge.

        Meta sends a GET request with:
        - hub.mode = "subscribe"
        - hub.verify_token = the token you configured
        - hub.challenge = a string to echo back

        Returns the challenge string if valid, None otherwise.
        """
        if mode == "subscribe" and token == verify_token:
            return challenge
        return None

    # ===== Webhook parsing =====

    @staticmethod
    def parse_webhook(body: dict[str, Any]) -> list[dict[str, Any]]:
        """Parse an inbound Meta webhook into a list of events.

        Meta webhook structure:
        {
          "object": "whatsapp_business_account",
          "entry": [
            {
              "id": "<WABA_ID>",
              "changes": [
                {
                  "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"phone_number_id": "...", "display_phone_number": "..."},
                    "contacts": [{"profile": {"name": "..."}, "wa_id": "..."}],
                    "messages": [...],
                    "statuses": [...]
                  },
                  "field": "messages"
                }
              ]
            }
          ]
        }

        Returns a list of normalized events, each with:
        - event_type: message.received, message.delivered, message.read, message.failed, etc.
        - phone_number_id, from_number, to_number
        - message: {type, text, media_id, location, etc.}
        - status: {id, status, timestamp, etc.}
        """
        events: list[dict[str, Any]] = []

        if body.get("object") != "whatsapp_business_account":
            return events

        for entry in body.get("entry", []):
            waba_id = entry.get("id")
            for change in entry.get("changes", []):
                if change.get("field") != "messages":
                    continue
                value = change.get("value", {})
                metadata = value.get("metadata", {})
                phone_number_id = metadata.get("phone_number_id")
                display_phone_number = metadata.get("display_phone_number")

                # Parse messages
                contacts = {c["wa_id"]: c for c in value.get("contacts", [])}
                for msg in value.get("messages", []):
                    wa_id = msg.get("from")
                    contact = contacts.get(wa_id, {})
                    event = MetaWhatsAppClient._parse_message(
                        msg, contact, phone_number_id, display_phone_number
                    )
                    if event:
                        events.append(event)

                # Parse statuses (delivery receipts)
                for status in value.get("statuses", []):
                    event = MetaWhatsAppClient._parse_status(status, phone_number_id)
                    if event:
                        events.append(event)

        return events

    @staticmethod
    def _parse_message(
        msg: dict[str, Any],
        contact: dict[str, Any],
        phone_number_id: str | None,
        display_phone_number: str | None,
    ) -> dict[str, Any] | None:
        """Parse a single message from a webhook."""
        msg_type = msg.get("type", "unknown")
        from_number = msg.get("from", "")
        wa_message_id = msg.get("id", "")
        timestamp_str = msg.get("timestamp", "")

        event: dict[str, Any] = {
            "event_type": "message.received",
            "phone_number_id": phone_number_id,
            "display_phone_number": display_phone_number,
            "from_number": from_number,
            "to_number": display_phone_number or "",
            "wa_message_id": wa_message_id,
            "timestamp": timestamp_str,
            "customer_name": contact.get("profile", {}).get("name"),
            "message_type": msg_type,
            "raw": msg,
        }

        # Extract content based on type
        if msg_type == "text":
            event["text"] = msg.get("text", {}).get("body", "")
        elif msg_type in ("image", "video", "audio", "document", "sticker"):
            media = msg.get(msg_type, {})
            event["media_id"] = media.get("id")
            event["mime_type"] = media.get("mime_type")
            event["sha256"] = media.get("sha256")
            event["caption"] = media.get("caption")
            event["filename"] = media.get("filename")
        elif msg_type == "location":
            loc = msg.get("location", {})
            event["latitude"] = loc.get("latitude")
            event["longitude"] = loc.get("longitude")
            event["location_name"] = loc.get("name")
            event["location_address"] = loc.get("address")
        elif msg_type == "contacts":
            event["contacts"] = msg.get("contacts", [])
        elif msg_type == "interactive":
            interactive = msg.get("interactive", {})
            event["interactive_type"] = interactive.get("type")
            if interactive.get("type") == "button_reply":
                event["interactive_payload"] = interactive.get("button_reply", {})
                event["text"] = interactive.get("button_reply", {}).get("title", "")
            elif interactive.get("type") == "list_reply":
                event["interactive_payload"] = interactive.get("list_reply", {})
                event["text"] = interactive.get("list_reply", {}).get("title", "")
            else:
                event["interactive_payload"] = interactive
        elif msg_type == "button":
            event["text"] = msg.get("button", {}).get("text", "")
            event["interactive_payload"] = msg.get("button", {})
        elif msg_type == "reaction":
            reaction = msg.get("reaction", {})
            event["reaction_emoji"] = reaction.get("emoji")
            event["reaction_target_message_id"] = reaction.get("message_id")
        elif msg_type == "system":
            event["text"] = msg.get("system", {}).get("body", "")
        else:
            event["text"] = ""

        # Reply context
        context = msg.get("context")
        if context:
            event["reply_to_message_id"] = context.get("id")

        return event

    @staticmethod
    def _parse_status(
        status: dict[str, Any],
        phone_number_id: str | None,
    ) -> dict[str, Any] | None:
        """Parse a delivery status from a webhook."""
        status_value = status.get("status")
        wa_message_id = status.get("id")
        recipient = status.get("recipient_id")
        timestamp = status.get("timestamp")
        conversation = status.get("conversation", {})
        pricing = status.get("pricing", {})
        errors = status.get("errors", [])

        event_type_map = {
            "sent": "message.sent",
            "delivered": "message.delivered",
            "read": "message.read",
            "failed": "message.failed",
        }
        event_type = event_type_map.get(status_value, f"message.{status_value}")

        event: dict[str, Any] = {
            "event_type": event_type,
            "phone_number_id": phone_number_id,
            "wa_message_id": wa_message_id,
            "from_number": phone_number_id or "",
            "to_number": recipient or "",
            "timestamp": timestamp,
            "status": status_value,
            "conversation_id": conversation.get("id"),
            "conversation_type": conversation.get("type"),
            "pricing_category": pricing.get("category"),
            "pricing_model": pricing.get("pricing_model"),
            "raw": status,
        }

        if errors:
            first_error = errors[0]
            event["error_code"] = first_error.get("code")
            event["error_message"] = first_error.get("title") or first_error.get("message")

        return event

    # ===== HTTP helpers =====

    async def _post(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        """POST with retry."""
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                client = self._get_client()
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 401:
                    raise MetaWhatsAppError("Invalid access token", code=401) from e
                if e.response.status_code == 429:
                    wait = min(2**attempt, 30)
                    logger.warning("meta_rate_limited", attempt=attempt, wait=wait)
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                if e.response.status_code >= 500:
                    wait = min(2**attempt, 10)
                    logger.warning("meta_server_error", status=e.response.status_code, attempt=attempt, wait=wait)
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                # Client error — don't retry
                error_body = e.response.text[:500]
                logger.error("meta_api_client_error", status=e.response.status_code, body=error_body)
                raise MetaWhatsAppError(
                    f"Meta API error {e.response.status_code}: {error_body}",
                    code=e.response.status_code,
                ) from e
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                wait = min(2**attempt, 10)
                logger.warning("meta_connection_error", attempt=attempt, wait=wait, error=str(e))
                await asyncio.sleep(wait)
                last_exc = e
        raise MetaWhatsAppError(f"Failed after {self.max_retries} retries: {last_exc}") from last_exc

    async def _get(self, url: str) -> dict[str, Any]:
        """GET with retry."""
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                client = self._get_client()
                response = await client.get(url)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 401:
                    raise MetaWhatsAppError("Invalid access token", code=401) from e
                if e.response.status_code == 404:
                    raise MetaWhatsAppError("Resource not found", code=404) from e
                if e.response.status_code >= 500:
                    wait = min(2**attempt, 10)
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                raise MetaWhatsAppError(
                    f"Meta API error {e.response.status_code}: {e.response.text[:200]}",
                    code=e.response.status_code,
                ) from e
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                wait = min(2**attempt, 10)
                await asyncio.sleep(wait)
                last_exc = e
        raise MetaWhatsAppError(f"Failed after {self.max_retries} retries: {last_exc}") from last_exc

    async def _delete(self, url: str) -> dict[str, Any]:
        """DELETE."""
        client = self._get_client()
        response = await client.delete(url)
        response.raise_for_status()
        if response.content:
            return response.json()
        return {"deleted": True}

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

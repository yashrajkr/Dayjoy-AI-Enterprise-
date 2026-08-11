"""Telephony webhook endpoints — inbound webhooks from telephony providers.

These endpoints are PUBLIC (no JWT auth) — they authenticate via
provider-specific signature verification (HMAC-SHA1 for Twilio).

Routes:
  POST /api/v1/telephony/webhook/{provider}/voice      — Inbound call webhook
  POST /api/v1/telephony/webhook/{provider}/status      — Status callback
  POST /api/v1/telephony/webhook/{provider}/recording   — Recording callback
  GET  /api/v1/telephony/webhook/{provider}/test        — Health check

The webhook URL structure matches Twilio's convention:
  - Voice webhook: returns TwiML XML
  - Status callback: returns 200 OK (no body)
  - Recording callback: returns 200 OK (no body)

Configure these URLs in your Twilio console:
  Phone Numbers → Manage → Active numbers → [your number] → Voice & Fax
  - A CALL COMES IN: Webhook → POST https://your-domain.com/api/v1/telephony/webhook/twilio/voice
  - PRIMARY HANDLER FAILS: Webhook → POST https://your-domain.com/api/v1/telephony/webhook/twilio/voice
  - CALL STATUS CHANGES: Webhook → POST https://your-domain.com/api/v1/telephony/webhook/twilio/status
  - RECORDING STATUS CHANGES: Webhook → POST https://your-domain.com/api/v1/telephony/webhook/twilio/recording
"""

from typing import Any

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.telephony import TelephonyService
from app.telephony.providers import (
    TelephonyProviderError,
    get_telephony_provider,
)

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/webhook/{provider}/voice",
    summary="Inbound voice call webhook",
    response_class=PlainTextResponse,
)
async def telephony_voice_webhook(
    provider: str,
    request: Request,
) -> PlainTextResponse:
    """Handle an inbound voice call from the telephony provider.

    Returns TwiML XML that tells the provider how to handle the call:
    - <Connect><Stream> → connect to AI media stream
    - <Dial>            → forward to another number
    - <Record>          → voicemail
    - <Hangup>          → reject

    The webhook URL (including query string) is REQUIRED for Twilio's
    signature verification.
    """
    body = await request.body()
    # Build the full URL Twilio sent the webhook to (required for signature verification)
    webhook_url = str(request.url)
    # Normalize headers (case-insensitive)
    headers: dict[str, str] = {}
    for key, value in request.headers.items():
        headers[key] = value

    async with AsyncSessionLocal() as db:
        try:
            svc = TelephonyService(db, provider=get_telephony_provider(provider))
            result = await svc.process_inbound_call(
                body=body,
                headers=headers,
                webhook_url=webhook_url,
            )
            await db.commit()

            if result.get("status") == "error":
                logger.warning(
                    "telephony_voice_webhook_error",
                    provider=provider,
                    error=result.get("error"),
                )
                # Return a minimal hangup TwiML on error
                from app.telephony.twiml import generate_hangup_twiml
                return PlainTextResponse(
                    content=generate_hangup_twiml(),
                    media_type="text/xml",
                    status_code=200,
                )

            twiml = result.get("twiml", "")
            return PlainTextResponse(content=twiml, media_type="text/xml", status_code=200)

        except TelephonyProviderError as e:
            logger.warning(
                "telephony_voice_webhook_provider_error",
                provider=provider,
                error=str(e),
            )
            from app.telephony.twiml import generate_hangup_twiml
            return PlainTextResponse(
                content=generate_hangup_twiml(),
                media_type="text/xml",
                status_code=200,
            )
        except Exception as e:
            logger.exception(
                "telephony_voice_webhook_unexpected_error",
                provider=provider,
                error=str(e),
            )
            from app.telephony.twiml import generate_hangup_twiml
            return PlainTextResponse(
                content=generate_hangup_twiml(),
                media_type="text/xml",
                status_code=200,
            )


@router.post(
    "/webhook/{provider}/status",
    summary="Call status callback webhook",
)
async def telephony_status_webhook(
    provider: str,
    request: Request,
) -> JSONResponse:
    """Handle a call status callback from the telephony provider.

    Twilio sends status updates at: initiated, ringing, answered, completed.
    We update the TelephonyCallSession status accordingly.
    """
    body = await request.body()
    webhook_url = str(request.url)
    headers: dict[str, str] = {}
    for key, value in request.headers.items():
        headers[key] = value

    async with AsyncSessionLocal() as db:
        try:
            svc = TelephonyService(db, provider=get_telephony_provider(provider))
            result = await svc.process_status_callback(
                body=body,
                headers=headers,
                webhook_url=webhook_url,
            )
            await db.commit()
            return JSONResponse(status_code=200, content=result)
        except TelephonyProviderError as e:
            logger.warning(
                "telephony_status_webhook_error",
                provider=provider,
                error=str(e),
            )
            return JSONResponse(
                status_code=400,
                content={"status": "error", "error": str(e)},
            )
        except Exception as e:
            logger.exception(
                "telephony_status_webhook_unexpected_error",
                provider=provider,
                error=str(e),
            )
            return JSONResponse(
                status_code=500,
                content={"status": "error", "error": "Internal error"},
            )


@router.post(
    "/webhook/{provider}/recording",
    summary="Recording status callback webhook",
)
async def telephony_recording_webhook(
    provider: str,
    request: Request,
) -> JSONResponse:
    """Handle a recording status callback from the telephony provider.

    Twilio sends this when a recording completes (or fails).
    We store the recording metadata for later retrieval.
    """
    body = await request.body()
    webhook_url = str(request.url)
    headers: dict[str, str] = {}
    for key, value in request.headers.items():
        headers[key] = value

    async with AsyncSessionLocal() as db:
        try:
            svc = TelephonyService(db, provider=get_telephony_provider(provider))
            result = await svc.process_recording_callback(
                body=body,
                headers=headers,
                webhook_url=webhook_url,
            )
            await db.commit()
            return JSONResponse(status_code=200, content=result)
        except TelephonyProviderError as e:
            logger.warning(
                "telephony_recording_webhook_error",
                provider=provider,
                error=str(e),
            )
            return JSONResponse(
                status_code=400,
                content={"status": "error", "error": str(e)},
            )
        except Exception as e:
            logger.exception(
                "telephony_recording_webhook_unexpected_error",
                provider=provider,
                error=str(e),
            )
            return JSONResponse(
                status_code=500,
                content={"status": "error", "error": "Internal error"},
            )


@router.get(
    "/webhook/{provider}/test",
    summary="Test webhook endpoint (verify provider config)",
)
async def telephony_webhook_test(
    provider: str,
) -> dict[str, Any]:
    """Quick health check for a telephony provider webhook config.

    Returns 200 if the provider is registered, 404 otherwise.
    """
    try:
        provider_instance = get_telephony_provider(provider)
        return {
            "status": "ok",
            "provider": provider,
            "name": provider_instance.name,
            "configured": True,
        }
    except TelephonyProviderError as e:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"status": "error", "error": str(e)},
        )

"""Voice webhook endpoints — inbound webhooks from voice providers.

These endpoints are PUBLIC (no JWT auth) — they authenticate via
provider-specific signature verification (HMAC-SHA256 for Vapi).

Routes:
  POST /api/v1/voice/webhook/{provider}    — Inbound webhook
  GET  /api/v1/voice/webhook/{provider}/test — Test endpoint (returns 200 if configured)
"""

from typing import Any

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.voice import VoiceService
from app.voice.providers import VoiceProviderError, get_voice_provider

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/webhook/{provider}",
    summary="Inbound voice provider webhook",
    include_in_schema=True,
)
async def voice_webhook(
    provider: str,
    request: Request,
) -> JSONResponse:
    """Handle an inbound webhook from a voice provider.

    Authentication: provider-specific signature verification (HMAC-SHA256).
    No JWT required — providers can't authenticate as users.

    Flow:
    1. Read raw body (needed for signature verification)
    2. Extract headers (case-insensitive)
    3. Verify signature via the provider adapter
    4. Parse the event
    5. Resolve the session by call_sid
    6. Apply state transitions + persist transcript
    7. Log everything to voice_webhook_logs (audit trail)
    """
    # Read raw body
    body = await request.body()
    if not body:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Empty body"},
        )

    # Normalize headers (case-insensitive)
    headers: dict[str, str] = {}
    for key, value in request.headers.items():
        headers[key] = value

    # Source IP (for audit)
    source_ip = request.client.host if request.client else None

    # Process via VoiceService
    # We don't know the organization_id yet — it's resolved from the call_sid
    # during webhook processing.
    async with AsyncSessionLocal() as db:
        try:
            svc = VoiceService(db)
            result = await svc.process_webhook(
                organization_id=None,  # resolved from call_sid
                provider_name=provider,
                body=body,
                headers=headers,
                source_ip=source_ip,
            )
            await db.commit()
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=result,
            )
        except VoiceProviderError as e:
            logger.warning(
                "voice_webhook_provider_error",
                provider=provider,
                error=str(e),
            )
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"status": "error", "error": str(e)},
            )
        except Exception as e:
            logger.exception(
                "voice_webhook_unexpected_error",
                provider=provider,
                error=str(e),
            )
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"status": "error", "error": "Internal error"},
            )


@router.get(
    "/webhook/{provider}/test",
    summary="Test webhook endpoint (verify provider config)",
)
async def voice_webhook_test(
    provider: str,
) -> dict[str, Any]:
    """Quick health check for a voice provider webhook config.

    Returns 200 if the provider is registered, 404 otherwise.
    Does NOT verify credentials — use this to confirm the route is reachable.
    """
    try:
        provider_instance = get_voice_provider(provider)
        return {
            "status": "ok",
            "provider": provider,
            "name": provider_instance.name,
            "configured": True,
        }
    except VoiceProviderError as e:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"status": "error", "error": str(e)},
        )

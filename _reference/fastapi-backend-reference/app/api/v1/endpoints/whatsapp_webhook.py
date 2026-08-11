"""WhatsApp webhook endpoint — inbound webhooks from Meta.

This endpoint is PUBLIC (no JWT auth) — it authenticates via:
1. Webhook verification challenge (GET): verify_token must match
2. HMAC-SHA256 signature verification (POST): X-Hub-Signature-256 header

Routes:
  GET  /api/v1/whatsapp/webhook  — Webhook verification (challenge)
  POST /api/v1/whatsapp/webhook  — Inbound messages + status updates

Configure this URL in your Meta App Dashboard:
  WhatsApp → Configuration → Webhook → Subscribe to events
  Callback URL: https://your-domain.com/api/v1/whatsapp/webhook
  Verify Token: <your WHATSAPP_VERIFY_TOKEN>
  Subscribe to: messages, message_deliveries, message_reads
"""

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.whatsapp import WhatsAppService

logger = get_logger(__name__)

router = APIRouter()


@router.get("/webhook", summary="WhatsApp webhook verification", response_class=PlainTextResponse, response_model=None)
async def verify_webhook(request: Request) -> PlainTextResponse | JSONResponse:
    """Handle Meta's webhook verification challenge.

    Meta sends a GET request with:
    - hub.mode = "subscribe"
    - hub.verify_token = the token you configured in the Meta dashboard
    - hub.challenge = a string to echo back

    If the verify_token matches an account's verify_token, we echo the challenge.
    """
    query_params = dict(request.query_params)
    mode = query_params.get("hub.mode", "")
    token = query_params.get("hub.verify_token", "")
    challenge = query_params.get("hub.challenge", "")

    if mode != "subscribe":
        return JSONResponse(
            status_code=403,
            content={"error": "Invalid mode"},
        )

    async with AsyncSessionLocal() as db:
        svc = WhatsAppService(db)
        result = await svc.process_webhook(
            body=b"",
            headers={},
            query_params=query_params,
            source_ip=request.client.host if request.client else None,
        )
        await db.commit()

    if result.get("status") == "ok" and result.get("challenge"):
        return PlainTextResponse(content=result["challenge"], status_code=200)
    return JSONResponse(
        status_code=403,
        content={"error": "Verification failed", "detail": result.get("error")},
    )


@router.post("/webhook", summary="WhatsApp inbound webhook")
async def receive_webhook(request: Request) -> JSONResponse:
    """Handle inbound WhatsApp messages + status updates from Meta.

    Meta sends POST requests to this endpoint when:
    - A customer sends a message (message.received)
    - A message is delivered (message.delivered)
    - A message is read (message.read)
    - A message fails (message.failed)

    The request body is signed with HMAC-SHA256 (X-Hub-Signature-256 header).
    We verify the signature (if app_secret is configured) before processing.
    """
    body = await request.body()
    headers: dict[str, str] = {}
    for key, value in request.headers.items():
        headers[key] = value
    query_params = dict(request.query_params)
    source_ip = request.client.host if request.client else None

    async with AsyncSessionLocal() as db:
        try:
            svc = WhatsAppService(db)
            result = await svc.process_webhook(
                body=body,
                headers=headers,
                query_params=query_params,
                source_ip=source_ip,
            )
            await db.commit()

            if result.get("status") == "error":
                return JSONResponse(
                    status_code=result.get("code", 400),
                    content=result,
                )
            return JSONResponse(status_code=200, content=result)
        except Exception as e:
            logger.exception("whatsapp_webhook_error", error=str(e))
            await db.rollback()
            return JSONResponse(
                status_code=500,
                content={"status": "error", "error": "Internal error"},
            )

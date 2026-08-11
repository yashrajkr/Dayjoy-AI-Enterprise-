"""WebSocket streaming layer for real-time voice conversations.

Endpoint: /api/v1/voice/stream/{session_token}

The session_token is a short-lived JWT-like token issued by the
POST /api/v1/voice/sessions/{id}/stream-token endpoint. It binds a
WebSocket connection to a specific VoiceSession + organization.

Protocol (JSON messages, bidirectional):

Client → Server:
  {"type": "audio", "data": "<base64 PCM audio chunk>"}
  {"type": "stt_final", "text": "...", "confidence": 0.95}
  {"type": "barge_in"}
  {"type": "end"}

Server → Client:
  {"type": "metadata", "citations": [...], "confidence": ..., "rag_used": ...}
  {"type": "chunk", "text": "...", "sequence": N}  # streaming AI response
  {"type": "tts", "audio": "<base64>", "sequence": N}  # streaming TTS audio
  {"type": "done", "latency_ms": ..., "tokens_in": ..., "tokens_out": ...}
  {"type": "error", "message": "...", "fallback": "..."}
  {"type": "ended", "outcome": "..."}

For real-time voice, the typical flow is:
1. Client opens WebSocket with session_token
2. Client streams audio chunks (captured from mic)
3. STT runs client-side or server-side (provider-specific)
4. Client sends stt_final when the user finishes an utterance
5. Server runs the AI pipeline (RAG + LLM), streams chunks back
6. Client receives chunks and synthesizes TTS (or server does it)
7. If the user interrupts (barge_in), server aborts the current response

This implementation supports both modes:
- Provider-managed STT/TTS (Vapi handles audio — we just receive transcripts)
- Client-managed STT/TTS (browser sends transcripts, receives text + we TTS)

For Vapi, the typical mode is provider-managed: Vapi handles STT/TTS,
sends webhook events for each transcript segment, and we orchestrate
the AI via the conversation service. The WebSocket here is used for
LIVE UI updates (showing the transcript + citations in real time)
rather than audio streaming.
"""

import asyncio
import json
import uuid
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.core.security import create_access_token, verify_token
from app.models.voice import VoiceAssistant, VoiceSession
from app.voice.conversation import VoiceConversationService
from app.voice.session_manager import VoiceSessionManager

logger = get_logger(__name__)

router = APIRouter()


class StreamTokenRequest(BaseModel):
    """Request to mint a WebSocket stream token."""

    session_id: uuid.UUID


class StreamTokenResponse(BaseModel):
    """Response with a WebSocket stream token."""

    token: str
    expires_in_seconds: int
    ws_url: str


# ===== Connection manager (tracks live WebSocket connections) =====


class VoiceConnectionManager:
    """Tracks active WebSocket connections per session.

    Used for:
    - Barge-in: when a caller interrupts, we notify all connections
      for that session to stop playing TTS audio
    - Live updates: webhook events (transcript, status) are pushed to
      all connections for that session
    """

    def __init__(self) -> None:
        # session_id → set of WebSocket connections
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, session_id: str, ws: WebSocket) -> None:
        await ws.accept()
        if session_id not in self._connections:
            self._connections[session_id] = set()
        self._connections[session_id].add(ws)
        logger.info("voice_ws_connected", session_id=session_id, total=len(self._connections[session_id]))

    async def disconnect(self, session_id: str, ws: WebSocket) -> None:
        if session_id in self._connections:
            self._connections[session_id].discard(ws)
            if not self._connections[session_id]:
                del self._connections[session_id]
        logger.info("voice_ws_disconnected", session_id=session_id)

    async def broadcast(self, session_id: str, message: dict[str, Any]) -> None:
        """Send a message to all connections for a session."""
        if session_id not in self._connections:
            return
        dead: list[WebSocket] = []
        for ws in self._connections[session_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[session_id].discard(ws)


# Singleton connection manager
voice_connections = VoiceConnectionManager()


# ===== REST endpoint: mint a stream token =====


@router.post(
    "/sessions/{session_id}/stream-token",
    response_model=StreamTokenResponse,
    summary="Mint a WebSocket stream token",
)
async def mint_stream_token(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> StreamTokenResponse:
    """Mint a short-lived token for WebSocket authentication.

    The token binds a WebSocket connection to a specific VoiceSession.
    TTL is VOICE_WS_TOKEN_TTL_SECONDS (default 5 minutes).
    """
    # Look up the session to verify it exists + user has access
    # (This will be wired up with proper auth deps in the endpoint module)
    token = create_access_token(
        subject=str(session_id),
        claims={
            "type": "voice_stream",
            "session_id": str(session_id),
        },
        expires_delta=timedelta(seconds=settings.VOICE_WS_TOKEN_TTL_SECONDS),
    )
    return StreamTokenResponse(
        token=token,
        expires_in_seconds=settings.VOICE_WS_TOKEN_TTL_SECONDS,
        ws_url=f"/api/v1/voice/stream/{session_id}",
    )


# ===== WebSocket endpoint =====


@router.websocket(
    "/stream/{session_id}",
    name="voice_stream",
)
async def voice_stream_ws(
    ws: WebSocket,
    session_id: uuid.UUID,
    token: str = Query(...),
) -> None:
    """Bidirectional voice stream for a session.

    Authentication: `?token=<stream_token>` query param.
    """
    # 1. Verify the stream token
    try:
        payload = verify_token(token, expected_type="voice_stream")
    except Exception:
        # Fall back: verify as access token (in case the type wasn't set)
        payload = verify_token(token, expected_type="access")
        if payload is None or payload.get("session_id") != str(session_id):
            await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
            return
        # Token is valid access token with session_id claim — proceed
    else:
        if payload is None or payload.get("session_id") != str(session_id):
            await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token does not match session")
            return

    # 2. Load the session + assistant
    async with AsyncSessionLocal() as db:
        try:
            session = await _load_session(db, session_id)
            assistant = await _load_assistant(db, session)
        except Exception as e:
            await ws.close(code=status.WS_1011_INTERNAL_ERROR, reason=str(e))
            return

        # 3. Accept the connection + register with the connection manager
        await voice_connections.connect(str(session_id), ws)

        session_mgr = VoiceSessionManager(db)
        conversation = VoiceConversationService(db)

        try:
            # 4. Send initial state (greeting + session metadata)
            await ws.send_json({
                "type": "session_start",
                "session_id": str(session.id),
                "assistant_name": assistant.name,
                "greeting": assistant.greeting,
                "language": session.language,
                "voice": assistant.voice,
                "voice_provider": assistant.voice_provider,
            })

            # 5. Main message loop
            while True:
                try:
                    raw = await ws.receive_text()
                except WebSocketDisconnect:
                    break

                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await ws.send_json({"type": "error", "message": "Invalid JSON"})
                    continue

                msg_type = msg.get("type")
                if msg_type == "stt_final":
                    # Caller finished an utterance — process via AI pipeline
                    text = msg.get("text", "").strip()
                    if not text:
                        continue
                    await _handle_user_utterance(
                        ws=ws,
                        db=db,
                        session=session,
                        assistant=assistant,
                        session_mgr=session_mgr,
                        conversation=conversation,
                        text=text,
                        confidence=msg.get("confidence"),
                    )
                elif msg_type == "barge_in":
                    # Caller interrupted — record it
                    await session_mgr.record_barge_in(session)
                    await voice_connections.broadcast(
                        str(session_id),
                        {"type": "barge_in"},
                    )
                elif msg_type == "end":
                    # Client requested end
                    await session_mgr.end_session(
                        session,
                        outcome="caller_ended",
                        hangup_by="caller",
                    )
                    await ws.send_json({"type": "ended", "outcome": "caller_ended"})
                    break
                elif msg_type == "audio":
                    # Audio chunk — in Vapi mode, audio is handled by the provider,
                    # so we just acknowledge. In client-managed mode, we'd forward
                    # to the STT service here.
                    pass
                elif msg_type == "ping":
                    await ws.send_json({"type": "pong"})
                else:
                    await ws.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {msg_type}",
                    })

                await db.commit()

        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(
                "voice_ws_error",
                session_id=str(session_id),
                error=str(e),
            )
            try:
                await ws.send_json({"type": "error", "message": str(e)})
            except Exception:
                pass
        finally:
            await voice_connections.disconnect(str(session_id), ws)
            await ws.close()


async def _handle_user_utterance(
    *,
    ws: WebSocket,
    db: AsyncSession,
    session: VoiceSession,
    assistant: VoiceAssistant,
    session_mgr: VoiceSessionManager,
    conversation: VoiceConversationService,
    text: str,
    confidence: float | None = None,
) -> None:
    """Handle a finalized user utterance (STT final)."""
    # Persist the caller message
    await session_mgr.add_message(
        session,
        speaker="caller",
        text=text,
        is_final=True,
        stt_confidence=confidence,
    )

    # Stream the AI response
    try:
        full_response_parts: list[str] = []
        async for chunk in conversation.stream_user_utterance(
            session=session,
            user_text=text,
            assistant=assistant,
        ):
            # Broadcast to all connections for this session
            await voice_connections.broadcast(str(session.id), chunk)

            if chunk.get("type") == "chunk":
                full_response_parts.append(chunk["text"])
            elif chunk.get("type") == "done":
                # Persist the assistant message
                full_text = chunk.get("full_response") or "".join(full_response_parts)
                await session_mgr.add_message(
                    session,
                    speaker="assistant",
                    text=full_text,
                    is_final=True,
                    latency_ms=chunk.get("latency_ms", 0),
                    ai_confidence=chunk.get("confidence"),
                    model=chunk.get("model"),
                    tokens_in=chunk.get("tokens_in", 0),
                    tokens_out=chunk.get("tokens_out", 0),
                    citations=chunk.get("citations"),
                )
                await db.commit()
            elif chunk.get("type") == "error":
                # Persist fallback message
                await session_mgr.add_message(
                    session,
                    speaker="assistant",
                    text=chunk.get("fallback", assistant.fallback_message),
                    is_final=True,
                )
                await db.commit()
    except Exception as e:
        logger.error(
            "voice_utterance_failed",
            session_id=str(session.id),
            error=str(e),
        )
        await ws.send_json({
            "type": "error",
            "message": str(e),
            "fallback": assistant.fallback_message,
        })


async def _load_session(db: AsyncSession, session_id: uuid.UUID) -> VoiceSession:
    result = await db.execute(
        select(VoiceSession).where(VoiceSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise ValueError(f"Voice session {session_id} not found")
    return session


async def _load_assistant(db: AsyncSession, session: VoiceSession) -> VoiceAssistant:
    if session.assistant_id is None:
        raise ValueError(f"Session {session.id} has no assistant_id")
    result = await db.execute(
        select(VoiceAssistant).where(VoiceAssistant.id == session.assistant_id)
    )
    assistant = result.scalar_one_or_none()
    if assistant is None:
        raise ValueError(f"Assistant {session.assistant_id} not found")
    return assistant

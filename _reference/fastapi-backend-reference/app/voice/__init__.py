"""Voice AI package — provider abstraction, session manager, conversation engine.

Stage 2 Step 3 — Enterprise Voice AI Platform Integration.

Public API:
    from app.voice import VoiceService, get_voice_provider

Architecture:
  Customer Voice → STT (provider-managed) → AI Gateway (LLM + RAG) → TTS → Customer
                  ↑                          ↑
                  |                          |
                  +-- streaming via WebSocket or provider webhook

Provider abstraction (`app.voice.providers`):
  - VoiceProvider (abstract base)
  - VapiProvider (fully implemented)
  - RetellProvider, BlandProvider, LiveKitProvider, PipecatProvider (stubs
    that raise NotImplementedError — designed for future implementation)

Session manager (`app.voice.session_manager`):
  - VoiceSessionManager — creates / updates / ends voice sessions
  - Tracks call lifecycle, caller context, AI conversation binding

Conversation engine (`app.voice.conversation`):
  - VoiceConversationService — orchestrates STT → AI → TTS per turn
  - Integrates with AIGateway (Stage 2 Step 1) + RAG pipeline (Stage 2 Step 2)
  - Streams AI responses chunk-by-chunk to the WebSocket client
  - Handles barge-in (caller interrupting assistant mid-speech)

WebSocket (`app.voice.streaming.ws`):
  - /api/v1/voice/stream/{session_token} — bidirectional voice stream
  - Client → server: audio frames (base64) + control messages
  - Server → client: assistant audio + transcript + citations

Webhook handler (`app.api.v1.endpoints.voice_webhook`):
  - POST /api/v1/voice/webhook/{provider} — inbound provider webhooks
  - Verifies signature, logs to voice_webhook_logs, dispatches to handler
"""

from app.voice.conversation import VoiceConversationService
from app.voice.providers import (
    VoiceProvider,
    VoiceProviderError,
    get_voice_provider,
)
from app.voice.service import VoiceService
from app.voice.session_manager import VoiceSessionManager

__all__ = [
    "VoiceConversationService",
    "VoiceProvider",
    "VoiceProviderError",
    "VoiceService",
    "VoiceSessionManager",
    "get_voice_provider",
]

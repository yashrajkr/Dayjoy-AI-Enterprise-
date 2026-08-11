"""Telephony package — provider abstraction, call router, webhook manager.

Stage 2 Step 4 — Enterprise Telephony Integration Platform.

The telephony layer is the LAYER BELOW voice AI:
  PSTN → Telephony (Twilio) → Voice AI (Vapi) → AI Provider (LLM) → RAG

It is responsible for:
- Phone number management (provisioning, configuration, routing)
- Call routing (rules-based: AI, voicemail, forward, reject)
- Call control (transfer, hold, resume, terminate)
- Recording (start, stop, store, access control)
- Webhook handling (signature verification, event routing)
- Retry (failed calls, network errors)
- Provider abstraction (Twilio fully implemented; Exotel/Plivo/Knowlarity stubs)

It delegates AI logic to the existing Voice AI platform (app.voice.*) — it
does NOT duplicate STT/TTS/LLM/RAG.

Public API:
    from app.telephony import TelephonyService, get_telephony_provider
"""

from app.telephony.providers import (
    TelephonyProvider,
    TelephonyProviderError,
    get_telephony_provider,
)
from app.telephony.service import TelephonyService

__all__ = [
    "TelephonyProvider",
    "TelephonyProviderError",
    "TelephonyService",
    "get_telephony_provider",
]

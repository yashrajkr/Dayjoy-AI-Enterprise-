"""WhatsApp AI package — Meta Cloud API client + conversation manager.

Stage 2 Step 5 — Enterprise WhatsApp AI Platform.

The WhatsApp layer connects customer WhatsApp messages to the AI Provider
Layer (Stage 2 Step 1) and RAG system (Stage 2 Step 2):

  Customer → WhatsApp → Meta Cloud API → Webhook → Conversation Manager
    → AI Gateway → RAG → Response Generator → WhatsApp Reply

Public API:
    from app.whatsapp import WhatsAppService
"""

from app.whatsapp.meta_client import MetaWhatsAppClient
from app.whatsapp.service import WhatsAppService

__all__ = ["MetaWhatsAppClient", "WhatsAppService"]

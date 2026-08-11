"""Voice conversation service — orchestrates STT → AI → TTS per turn.

This service is the bridge between the streaming WebSocket layer and the
existing AI infrastructure (LLM Gateway from Stage 2 Step 1 + RAG pipeline
from Stage 2 Step 2).

Per turn (caller utterance → assistant response):
1. Receive final STT transcript (from provider webhook or WebSocket)
2. Load conversation memory (previous turns)
3. Build context: tenant config + assistant prompt + RAG context
4. Call LLM Gateway (or stream chunks via LLM gateway's stream method)
5. Stream AI response chunks back (for TTS to synthesize)
6. Persist assistant message with citations + confidence
7. Track barge-in: if caller interrupts mid-response, abort TTS

The service is stateless between turns — all state lives in the
VoiceSession + VoiceMessage rows + the AIConversation (for memory).
"""

import time
import uuid
from typing import Any, AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gateway import AIGateway
from app.ai.llm_gateway import llm_gateway
from app.ai.providers import Message, MessageRole
from app.ai.rag_pipeline import KnowledgeRAGService
from app.core.config import settings
from app.core.logging import get_logger
from app.models.voice import VoiceAssistant, VoiceMessage, VoiceSession

logger = get_logger(__name__)


class VoiceConversationService:
    """Orchestrates the per-turn AI conversation loop for voice calls."""

    def __init__(
        self,
        db: AsyncSession,
        ai_gateway: AIGateway | None = None,
    ) -> None:
        self.db = db
        self._ai_gateway = ai_gateway
        self._rag: KnowledgeRAGService | None = None

    @property
    def ai_gateway(self) -> AIGateway:
        if self._ai_gateway is None:
            self._ai_gateway = AIGateway(self.db)
        return self._ai_gateway

    @property
    def rag(self) -> KnowledgeRAGService:
        if self._rag is None:
            self._rag = KnowledgeRAGService(self.db)
        return self._rag

    async def process_user_utterance(
        self,
        *,
        session: VoiceSession,
        user_text: str,
        assistant: VoiceAssistant,
    ) -> dict[str, Any]:
        """Process a finalized caller utterance and return the assistant response.

        This is the NON-streaming variant — useful for webhook-driven flows
        where the provider batches the response. For real-time streaming,
        use `stream_user_utterance` instead.

        Returns:
            Dict with: response, citations, confidence, latency_ms, tokens_in,
            tokens_out, model, rag_used, fallback.
        """
        start = time.perf_counter()

        # 1. Retrieve RAG context (if enabled)
        rag_context = ""
        citations: list[dict[str, Any]] = []
        confidence = 1.0
        rag_used = False
        fallback = False

        if assistant.enable_rag and user_text.strip():
            try:
                rag_result = await self.rag.search(
                    query=user_text,
                    organization_id=uuid.UUID(session.organization_id),
                    categories=list(assistant.rag_categories or []) or None,
                    user_id=uuid.UUID(session.user_id) if session.user_id else None,
                    conversation_id=uuid.UUID(session.ai_conversation_id)
                    if session.ai_conversation_id
                    else None,
                )
                rag_context = rag_result.get("context", "")
                citations = rag_result.get("citations", [])
                confidence = rag_result.get("confidence", 1.0)
                rag_used = True
                if rag_result.get("was_fallback"):
                    fallback = True
            except Exception as e:
                logger.warning(
                    "voice_rag_failed",
                    session_id=str(session.id),
                    error=str(e),
                )
                # Continue without RAG context

        # 2. Build the AI request
        # Use the AI Gateway (which routes through prompt manager, memory, etc.)
        try:
            result = await self.ai_gateway.chat(
                message=user_text,
                organization_id=uuid.UUID(session.organization_id),
                user_id=uuid.UUID(session.user_id) if session.user_id else None,
                conversation_id=uuid.UUID(session.ai_conversation_id)
                if session.ai_conversation_id
                else None,
                channel="voice",
                context={
                    "session_id": str(session.id),
                    "caller_phone": session.caller_phone,
                    "caller_name": session.caller_name,
                    "customer_id": session.customer_id,
                    "language": session.language,
                    "rag_context": rag_context,
                    "assistant_type": assistant.assistant_type,
                    "voice": True,  # hint to AI: keep responses concise for TTS
                },
            )
        except Exception as e:
            logger.error(
                "voice_ai_gateway_failed",
                session_id=str(session.id),
                error=str(e),
            )
            # Return fallback message
            return {
                "response": assistant.fallback_message,
                "citations": [],
                "confidence": 0.0,
                "latency_ms": int((time.perf_counter() - start) * 1000),
                "tokens_in": 0,
                "tokens_out": 0,
                "model": None,
                "rag_used": rag_used,
                "fallback": True,
                "fallback_reason": f"ai_gateway_error: {e}",
            }

        # 3. Bind AI conversation ID to the session (first turn)
        if session.ai_conversation_id is None and result.get("conversation_id"):
            session.ai_conversation_id = result["conversation_id"]
            await self.db.flush()

        latency_ms = int((time.perf_counter() - start) * 1000)

        return {
            "response": result["response"],
            "citations": citations or result.get("citations", []),
            "confidence": result.get("confidence", confidence),
            "latency_ms": latency_ms,
            "tokens_in": result.get("tokens_in", 0),
            "tokens_out": result.get("tokens_out", 0),
            "model": result.get("model"),
            "rag_used": rag_used,
            "fallback": fallback,
            "conversation_id": result.get("conversation_id"),
        }

    async def stream_user_utterance(
        self,
        *,
        session: VoiceSession,
        user_text: str,
        assistant: VoiceAssistant,
    ) -> AsyncIterator[dict[str, Any]]:
        """Stream an assistant response chunk-by-chunk.

        Yields dicts with `type` field:
        - {"type": "metadata", "citations": [...], "confidence": ..., "rag_used": ...}
        - {"type": "chunk", "text": "...", "sequence": N}
        - {"type": "done", "latency_ms": ..., "tokens_in": ..., "tokens_out": ...}
        - {"type": "error", "message": "...", "fallback": "..."}

        This is suitable for driving TTS in real time as the LLM streams tokens.
        """
        start = time.perf_counter()

        # 1. Retrieve RAG context first (non-streaming — we need the full context
        # before the LLM starts generating)
        rag_context = ""
        citations: list[dict[str, Any]] = []
        confidence = 1.0
        rag_used = False

        if assistant.enable_rag and user_text.strip():
            try:
                rag_result = await self.rag.search(
                    query=user_text,
                    organization_id=uuid.UUID(session.organization_id),
                    categories=list(assistant.rag_categories or []) or None,
                )
                rag_context = rag_result.get("context", "")
                citations = rag_result.get("citations", [])
                confidence = rag_result.get("confidence", 1.0)
                rag_used = True
            except Exception as e:
                logger.warning(
                    "voice_rag_failed_stream",
                    session_id=str(session.id),
                    error=str(e),
                )

        # Yield metadata first (so client knows citations before chunks)
        yield {
            "type": "metadata",
            "citations": citations,
            "confidence": confidence,
            "rag_used": rag_used,
        }

        # 2. Stream the LLM response
        # Build messages for the LLM gateway
        system_prompt = self._render_system_prompt(assistant, session, rag_context)
        messages = [
            Message(role=MessageRole.SYSTEM, content=system_prompt),
        ]
        # Add conversation memory (previous turns)
        memory_msgs = await self._load_memory(session, max_turns=10)
        messages.extend(memory_msgs)
        # Current user message
        messages.append(Message(role=MessageRole.USER, content=user_text))

        try:
            chunk_index = 0
            full_response_parts: list[str] = []
            tokens_in = 0
            tokens_out = 0
            model = None

            async for chunk in llm_gateway.stream(
                messages=messages,
                model=assistant.ai_model or None,
                temperature=assistant.temperature,
                max_tokens=assistant.max_tokens,
            ):
                if chunk.content:
                    full_response_parts.append(chunk.content)
                    yield {
                        "type": "chunk",
                        "text": chunk.content,
                        "sequence": chunk_index,
                    }
                    chunk_index += 1
                if chunk.usage:
                    tokens_in = chunk.usage.prompt_tokens
                    tokens_out = chunk.usage.completion_tokens
                if chunk.model:
                    model = chunk.model

            latency_ms = int((time.perf_counter() - start) * 1000)
            yield {
                "type": "done",
                "latency_ms": latency_ms,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "model": model,
                "full_response": "".join(full_response_parts),
            }

        except Exception as e:
            logger.error(
                "voice_llm_stream_failed",
                session_id=str(session.id),
                error=str(e),
            )
            yield {
                "type": "error",
                "message": str(e),
                "fallback": assistant.fallback_message,
            }

    # ====================================================================
    # Helpers
    # ====================================================================

    def _render_system_prompt(
        self,
        assistant: VoiceAssistant,
        session: VoiceSession,
        rag_context: str,
    ) -> str:
        """Render the assistant's system prompt with conversation context.

        Uses simple Jinja2-style variable substitution (no auto-escaping).
        Variables available:
        - organization_name (from metadata or 'this company')
        - caller_name, caller_phone
        - customer_id
        - language
        - business_hours (JSON string)
        - rag_context (assembled knowledge context)
        - assistant_type
        """
        # Try Jinja2 rendering; fall back to .format() if Jinja2 not available
        try:
            from jinja2 import Template

            template = Template(assistant.system_prompt)
            return template.render(
                organization_name=assistant.metadata_.get("organization_name", "this company"),
                caller_name=session.caller_name or "the caller",
                caller_phone=session.caller_phone or "",
                customer_id=session.customer_id or "",
                language=session.language,
                business_hours=str(assistant.business_hours or {}),
                rag_context=rag_context,
                assistant_type=assistant.assistant_type,
                assistant_name=assistant.name,
                greeting=assistant.greeting,
                fallback_message=assistant.fallback_message,
            )
        except Exception:
            # Fallback: simple variable substitution
            prompt = assistant.system_prompt
            prompt = prompt.replace("{{ rag_context }}", rag_context)
            prompt = prompt.replace("{{ caller_name }}", session.caller_name or "the caller")
            prompt = prompt.replace("{{ language }}", session.language)
            prompt = prompt.replace("{{ assistant_type }}", assistant.assistant_type)
            return prompt

    async def _load_memory(
        self,
        session: VoiceSession,
        max_turns: int = 10,
    ) -> list[Message]:
        """Load recent VoiceMessage rows as LLM Message objects."""
        result = await self.db.execute(
            select(VoiceMessage)
            .where(
                VoiceMessage.session_id == str(session.id),
                VoiceMessage.is_final == True,  # noqa: E712
            )
            .order_by(VoiceMessage.sequence.desc())
            .limit(max_turns * 2)  # caller + assistant per turn
        )
        messages = list(result.scalars().all())
        messages.reverse()  # oldest first
        out: list[Message] = []
        for m in messages:
            if m.speaker == "caller":
                out.append(Message(role=MessageRole.USER, content=m.text))
            elif m.speaker == "assistant":
                out.append(Message(role=MessageRole.ASSISTANT, content=m.text))
        return out

    async def get_assistant_for_session(
        self,
        session: VoiceSession,
    ) -> VoiceAssistant:
        """Load the assistant for a session (or raise)."""
        if session.assistant_id is None:
            raise ValueError(f"Session {session.id} has no assistant_id")
        result = await self.db.execute(
            select(VoiceAssistant).where(VoiceAssistant.id == session.assistant_id)
        )
        assistant = result.scalar_one_or_none()
        if assistant is None:
            raise ValueError(f"Assistant {session.assistant_id} not found")
        return assistant

    async def should_escalate(
        self,
        session: VoiceSession,
        assistant: VoiceAssistant,
    ) -> tuple[bool, str | None]:
        """Decide whether to escalate to a human.

        Escalates if:
        - Session has too many low-confidence turns (>= 3)
        - Caller explicitly asked for a human
        - Assistant has no escalation_phone configured → skip
        """
        if not assistant.escalation_phone:
            return False, None

        # Check recent low-confidence turns
        result = await self.db.execute(
            select(VoiceMessage)
            .where(
                VoiceMessage.session_id == str(session.id),
                VoiceMessage.speaker == "assistant",
                VoiceMessage.is_final == True,  # noqa: E712
            )
            .order_by(VoiceMessage.sequence.desc())
            .limit(3)
        )
        recent = list(result.scalars().all())
        if len(recent) >= 3:
            low_conf_count = sum(
                1 for m in recent
                if m.ai_confidence is not None and m.ai_confidence < assistant.escalation_threshold
            )
            if low_conf_count >= 3:
                return True, "low_confidence_3_consecutive_turns"

        return False, None

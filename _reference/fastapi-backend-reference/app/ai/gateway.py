"""AI Gateway — the central entry point for all AI requests.

Architecture flow:
  Client → AI Gateway → Intent Router → Prompt Manager → Conversation Memory
    → Tool Calling Engine → Agent Orchestrator → Knowledge Retrieval
    → Business APIs → LLM → Safety Layer → Response Formatter → Client

The AI Gateway:
1. Receives all AI requests (from any channel: web, voice, WhatsApp, email)
2. Authenticates the caller (JWT validation)
3. Identifies the tenant (organization_id)
4. Loads tenant AI configuration (AIConfig)
5. Routes request to the appropriate agent (Intent Router)
6. Applies guardrails (Safety Layer)
7. Returns structured responses with citations and confidence
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.memory import MemoryService
from app.ai.orchestrator import AgentOrchestrator
from app.ai.prompt_manager import PromptManager
from app.ai.rag import RAGService
from app.ai.safety.guardrails import SafetyGuardrails
from app.ai.tools.engine import ToolEngine
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.models.ai import (
    AIConfig,
    AIConversation,
    ConversationTurn,
)

logger = get_logger(__name__)


class AIGateway:
    """Central AI Gateway — routes all AI requests through the pipeline.

    This is the single entry point for all AI interactions.
    Channel-agnostic: works for web chat, voice, WhatsApp, email.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.prompt_manager = PromptManager(db)
        self.memory = MemoryService(db)
        self.tool_engine = ToolEngine(db)
        self.rag = RAGService(db)
        self.safety = SafetyGuardrails()
        self.orchestrator = AgentOrchestrator(
            db=db,
            prompt_manager=self.prompt_manager,
            memory=self.memory,
            tool_engine=self.tool_engine,
            rag=self.rag,
            safety=self.safety,
        )

    async def chat(
        self,
        message: str,
        *,
        organization_id: uuid.UUID,
        user_id: uuid.UUID | None = None,
        conversation_id: uuid.UUID | None = None,
        channel: str = "web",
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Process a chat message through the full AI pipeline.

        This is the main entry point for all AI interactions.

        Args:
            message: The user's message text.
            organization_id: The tenant organization ID.
            user_id: The user ID (optional for anonymous).
            conversation_id: Existing conversation ID (optional — creates new if None).
            channel: Communication channel (web, voice, whatsapp, email).
            context: Additional context (customer_id, distributor_id, etc.).

        Returns:
            Dict with: response, conversation_id, citations, confidence, tool_calls,
            agent_type, tokens_in, tokens_out, latency_ms.
        """
        import time

        start_time = time.time()

        # 1. Load tenant AI configuration
        ai_config = await self._load_ai_config(organization_id)

        # 2. Safety: check input for prompt injection / PII
        input_check = self.safety.check_input(message, ai_config)
        if input_check.blocked:
            logger.warning("ai_input_blocked", reason=input_check.reason)
            return {
                "response": "I cannot process that request. Please rephrase.",
                "conversation_id": str(conversation_id) if conversation_id else None,
                "citations": [],
                "confidence": 0.0,
                "tool_calls": [],
                "agent_type": None,
                "tokens_in": 0,
                "tokens_out": 0,
                "latency_ms": int((time.time() - start_time) * 1000),
                "was_filtered": True,
                "filter_reason": input_check.reason,
            }

        # 3. Get or create conversation
        if conversation_id:
            conversation = await self._get_conversation(conversation_id)
        else:
            conversation = await self._create_conversation(
                organization_id=organization_id,
                user_id=user_id,
                channel=channel,
                context=context or {},
            )

        # 4. Load conversation memory (short-term turns)
        memory_context = await self.memory.load_short_term(conversation.id, ai_config)

        # 5. Route to the appropriate agent (Intent Router)
        agent = await self.orchestrator.route_intent(
            message=message,
            ai_config=ai_config,
            memory_context=memory_context,
        )

        # 6. Execute the agent (which may: call RAG, call tools, call LLM)
        result = await self.orchestrator.execute_agent(
            agent=agent,
            message=message,
            conversation=conversation,
            ai_config=ai_config,
            memory_context=memory_context,
        )

        # 7. Safety: check output
        output_check = self.safety.check_output(result.get("response", ""), ai_config)
        if output_check.blocked:
            result["response"] = "I apologize, but I cannot provide that information."
            result["was_filtered"] = True
            result["filter_reason"] = output_check.reason

        # 8. Save conversation turn
        latency_ms = int((time.time() - start_time) * 1000)
        turn = await self._save_turn(
            conversation_id=conversation.id,
            turn_number=result.get("turn_number", 1),
            user_message=message,
            ai_response=result["response"],
            agent_type=agent.agent_type,
            model=result.get("model", ai_config.default_model),
            tokens_in=result.get("tokens_in", 0),
            tokens_out=result.get("tokens_out", 0),
            latency_ms=latency_ms,
            tool_calls=result.get("tool_calls", []),
            retrieved_chunks=result.get("retrieved_chunks", []),
            citations=result.get("citations", []),
            confidence=result.get("confidence", 0.0),
            was_filtered=result.get("was_filtered", False),
            filter_reason=result.get("filter_reason"),
            cost_cents=result.get("cost_cents", 0),
        )

        # 9. Update conversation totals
        await self._update_conversation_totals(conversation, result, latency_ms)

        # 10. Return structured response
        return {
            "response": result["response"],
            "conversation_id": str(conversation.id),
            "turn_id": str(turn.id),
            "citations": result.get("citations", []),
            "confidence": result.get("confidence", 0.0),
            "tool_calls": result.get("tool_calls", []),
            "agent_type": agent.agent_type,
            "model": result.get("model", ai_config.default_model),
            "tokens_in": result.get("tokens_in", 0),
            "tokens_out": result.get("tokens_out", 0),
            "latency_ms": latency_ms,
            "was_filtered": result.get("was_filtered", False),
        }

    async def _load_ai_config(self, organization_id: uuid.UUID) -> AIConfig:
        """Load or create AI configuration for a tenant."""
        from sqlalchemy import select

        result = await self.db.execute(
            select(AIConfig).where(AIConfig.organization_id == str(organization_id))
        )
        config = result.scalar_one_or_none()

        if config is None:
            # Create default config
            config = AIConfig(
                organization_id=str(organization_id),
            )
            self.db.add(config)
            await self.db.flush()

        return config

    async def _get_conversation(self, conversation_id: uuid.UUID) -> AIConversation:
        """Get an existing conversation."""
        from sqlalchemy import select

        result = await self.db.execute(
            select(AIConversation).where(AIConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            raise ValidationError(f"Conversation {conversation_id} not found")
        return conv

    async def _create_conversation(
        self,
        organization_id: uuid.UUID,
        user_id: uuid.UUID | None,
        channel: str,
        context: dict,
    ) -> AIConversation:
        """Create a new conversation."""
        conv = AIConversation(
            organization_id=str(organization_id),
            user_id=str(user_id) if user_id else None,
            channel=channel,
            status="active",
            context=context,
            started_at=datetime.now(UTC),
        )
        self.db.add(conv)
        await self.db.flush()
        return conv

    async def _save_turn(
        self,
        conversation_id: uuid.UUID,
        turn_number: int,
        user_message: str,
        ai_response: str,
        agent_type: str | None,
        model: str,
        tokens_in: int,
        tokens_out: int,
        latency_ms: int,
        tool_calls: list,
        retrieved_chunks: list,
        citations: list,
        confidence: float,
        was_filtered: bool,
        filter_reason: str | None,
        cost_cents: int,
    ) -> ConversationTurn:
        """Save a conversation turn (user message + AI response)."""
        # Save user turn
        user_turn = ConversationTurn(
            conversation_id=str(conversation_id),
            turn_number=turn_number * 2 - 1,
            role="user",
            content=user_message,
        )
        self.db.add(user_turn)

        # Save assistant turn
        assistant_turn = ConversationTurn(
            conversation_id=str(conversation_id),
            turn_number=turn_number * 2,
            role="assistant",
            content=ai_response,
            agent_type=agent_type,
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=latency_ms,
            tool_calls=tool_calls,
            retrieved_chunks=retrieved_chunks,
            citations=citations,
            confidence=confidence,
            was_filtered=was_filtered,
            filter_reason=filter_reason,
            cost_cents=cost_cents,
        )
        self.db.add(assistant_turn)
        await self.db.flush()
        return assistant_turn

    async def _update_conversation_totals(
        self, conversation: AIConversation, result: dict, latency_ms: int
    ) -> None:
        """Update conversation aggregate totals."""
        conversation.total_tokens_in += result.get("tokens_in", 0)
        conversation.total_tokens_out += result.get("tokens_out", 0)
        conversation.total_cost_cents += result.get("cost_cents", 0)
        await self.db.flush()

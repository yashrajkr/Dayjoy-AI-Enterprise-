"""Multi-Agent Orchestrator — routes requests to specialized agents.

Architecture:
  Client → AI Gateway → Orchestrator → Agent (Support/Sales/Knowledge/etc.)
                                    → RAG (if needed)
                                    → Tools (if needed)
                                    → LLM (always)
                                    → Safety (always)

The orchestrator:
1. Classifies the user's intent (Intent Router)
2. Selects the appropriate agent
3. Executes the agent (which may call RAG, tools, LLM)
4. Handles failures and timeouts
5. Falls back to escalation agent if confidence is low

Agent communication patterns:
- Single-specialist routing (70% of turns)
- Fan-out / fan-in (20% — multiple agents contribute)
- Sequential handoff (10% — multi-step workflow)
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.ai import AgentConfig, AIConfig, AIConversation

logger = get_logger(__name__)


class AgentOrchestrator:
    """Routes requests to specialized AI agents and coordinates execution."""

    def __init__(
        self,
        db: AsyncSession,
        prompt_manager: Any,
        memory: Any,
        tool_engine: Any,
        rag: Any,
        safety: Any,
    ) -> None:
        self.db = db
        self.prompt_manager = prompt_manager
        self.memory = memory
        self.tool_engine = tool_engine
        self.rag = rag
        self.safety = safety

    async def route_intent(
        self,
        message: str,
        ai_config: AIConfig,
        memory_context: list[dict[str, str]],
    ) -> AgentConfig:
        """Classify the user's intent and select the appropriate agent.

        Uses a simple keyword-based router (in production, this would use
        a fast LLM like GPT-4o-mini for classification).

        Returns: AgentConfig for the selected agent.
        """
        message_lower = message.lower()

        # Get available agents for this tenant
        enabled_agents = (
            ai_config.enabled_agents if ai_config else ["support", "knowledge", "escalation"]
        )

        # Intent classification (keyword-based — production would use LLM)
        selected_agent_type = "support"  # default

        # Support intent
        support_keywords = [
            "help",
            "issue",
            "problem",
            "ticket",
            "support",
            "complaint",
            "error",
            "broken",
            "not working",
        ]
        if any(kw in message_lower for kw in support_keywords):
            selected_agent_type = "support"

        # Sales intent
        sales_keywords = [
            "buy",
            "purchase",
            "price",
            "cost",
            "order",
            "recommend",
            "best",
            "compare",
        ]
        if any(kw in message_lower for kw in sales_keywords):
            selected_agent_type = "sales"

        # Knowledge intent
        knowledge_keywords = [
            "what is",
            "how to",
            "explain",
            "tell me about",
            "information",
            "guide",
            "instructions",
        ]
        if any(kw in message_lower for kw in knowledge_keywords):
            selected_agent_type = "knowledge"

        # Escalation intent
        escalation_keywords = [
            "human",
            "agent",
            "manager",
            "supervisor",
            "escalate",
            "speak to someone",
        ]
        if any(kw in message_lower for kw in escalation_keywords):
            selected_agent_type = "escalation"

        # Check if selected agent is enabled for this tenant
        if selected_agent_type not in enabled_agents:
            selected_agent_type = "support"  # fallback

        # Load agent config from DB
        result = await self.db.execute(
            select(AgentConfig).where(
                AgentConfig.agent_type == selected_agent_type,
                AgentConfig.is_active == True,  # noqa: E712
            )
        )
        agent = result.scalar_one_or_none()

        # If agent config not found, create a default
        if agent is None:
            agent = AgentConfig(
                agent_type=selected_agent_type,
                name=f"{selected_agent_type.title()} Agent",
                model=ai_config.default_model if ai_config else "gpt-4o-mini",
                temperature=0.2,
                max_tokens=2000,
                enable_rag=True,
                enable_memory=True,
                enable_tool_calling=True,
                enable_safety_filter=True,
                confidence_threshold=0.55,
                latency_budget_ms=2000,
                is_active=True,
            )

        logger.info("agent_routed", agent_type=selected_agent_type, message_preview=message[:100])
        return agent

    async def execute_agent(
        self,
        agent: AgentConfig,
        message: str,
        conversation: AIConversation,
        ai_config: AIConfig,
        memory_context: list[dict[str, str]],
    ) -> dict[str, Any]:
        """Execute the selected agent.

        This is where the agent:
        1. Optionally retrieves knowledge (RAG)
        2. Optionally calls tools
        3. Calls the LLM
        4. Applies safety checks
        5. Returns the response

        NOTE: In production, this would call the actual LLM API (OpenAI/Anthropic).
        For now, it returns a structured mock response that demonstrates the pipeline.
        """
        import time

        start = time.time()

        # 1. RAG retrieval (if enabled and agent has RAG)
        retrieved_chunks = []
        citations = []
        confidence = 0.75  # default

        if agent.enable_rag and ai_config and ai_config.rag_enabled:
            rag_result = await self.rag.search(
                query=message,
                organization_id=uuid.UUID(conversation.organization_id),
                top_k=ai_config.rag_top_k,
            )
            retrieved_chunks = rag_result.get("results", [])
            confidence = rag_result.get("confidence", 0.0)

            # Build citations
            for chunk in retrieved_chunks:
                citations.append(
                    {
                        "source": chunk.get("source", "Unknown"),
                        "page": chunk.get("page"),
                        "heading_path": chunk.get("heading_path", []),
                        "score": chunk.get("hybrid_score", 0.0),
                    }
                )

            # If RAG returned a fallback (low confidence), mark for escalation
            if rag_result.get("fallback"):
                confidence = 0.0

        # 2. Tool calling (if enabled)
        tool_calls = []
        if agent.enable_tool_calling and ai_config:
            # Check if the message looks like it needs a tool
            # (In production, the LLM would decide this via function calling)
            tool_calls = await self._maybe_call_tools(
                message=message,
                agent=agent,
                ai_config=ai_config,
                conversation=conversation,
            )

        # 3. Generate response (LLM call — mocked for now)
        # In production: response = await self._call_llm(agent, message, memory_context, retrieved_chunks)
        response_text = self._generate_mock_response(
            agent_type=agent.agent_type,
            message=message,
            retrieved_chunks=retrieved_chunks,
            tool_calls=tool_calls,
            confidence=confidence,
        )

        latency_ms = int((time.time() - start) * 1000)

        # 4. Check confidence threshold for escalation
        if confidence < agent.confidence_threshold:
            response_text = (
                f"{response_text}\n\n"
                "I'm not fully confident in this answer. Would you like me to "
                "escalate this to a human agent who can help you better?"
            )

        return {
            "response": response_text,
            "agent_type": agent.agent_type,
            "model": agent.model,
            "tokens_in": len(message) // 4,  # rough estimate
            "tokens_out": len(response_text) // 4,
            "latency_ms": latency_ms,
            "tool_calls": tool_calls,
            "retrieved_chunks": retrieved_chunks,
            "citations": citations,
            "confidence": confidence,
            "cost_cents": 1,  # placeholder
            "was_filtered": False,
            "turn_number": len(memory_context) // 2 + 1,
        }

    async def _maybe_call_tools(
        self,
        message: str,
        agent: AgentConfig,
        ai_config: AIConfig,
        conversation: AIConversation,
    ) -> list[dict]:
        """Check if the message requires tool calls and execute them.

        In production, the LLM decides which tools to call via function calling.
        For now, we use keyword-based detection.
        """
        tool_calls = []
        message_lower = message.lower()
        org_id = uuid.UUID(conversation.organization_id)

        # Check if agent has tools allowed
        if not agent.allowed_tools:
            return tool_calls

        # Customer lookup
        if any(kw in message_lower for kw in ["my account", "my details", "customer"]):
            if "customer_lookup" in (agent.allowed_tools or []):
                result = await self.tool_engine.execute(
                    "customer_lookup",
                    {"organization_id": str(org_id)},
                    organization_id=org_id,
                    conversation_id=conversation.id,
                    agent_type=agent.agent_type,
                )
                tool_calls.append(
                    {
                        "tool": "customer_lookup",
                        "success": result["success"],
                        "duration_ms": result["duration_ms"],
                    }
                )

        # Product search
        if any(kw in message_lower for kw in ["product", "price", "buy", "catalog"]):
            if "product_search" in (agent.allowed_tools or []):
                query = message[:100]  # Use message as search query
                result = await self.tool_engine.execute(
                    "product_search",
                    {"query": query, "organization_id": str(org_id)},
                    organization_id=org_id,
                    conversation_id=conversation.id,
                    agent_type=agent.agent_type,
                )
                tool_calls.append(
                    {
                        "tool": "product_search",
                        "success": result["success"],
                        "duration_ms": result["duration_ms"],
                    }
                )

        # Knowledge search (RAG)
        if any(kw in message_lower for kw in ["what is", "how to", "guide", "policy"]):
            if "knowledge_search" in (agent.allowed_tools or []):
                result = await self.tool_engine.execute(
                    "knowledge_search",
                    {"query": message, "organization_id": str(org_id)},
                    organization_id=org_id,
                    conversation_id=conversation.id,
                    agent_type=agent.agent_type,
                )
                tool_calls.append(
                    {
                        "tool": "knowledge_search",
                        "success": result["success"],
                        "duration_ms": result["duration_ms"],
                    }
                )

        return tool_calls

    def _generate_mock_response(
        self,
        agent_type: str,
        message: str,
        retrieved_chunks: list,
        tool_calls: list,
        confidence: float,
    ) -> str:
        """Generate a mock LLM response.

        In production, this would call OpenAI/Anthropic API.
        For now, it constructs a structured response that demonstrates the pipeline.
        """
        parts = [f"[{agent_type.title()} Agent]"]

        if retrieved_chunks:
            parts.append(f"I found {len(retrieved_chunks)} relevant knowledge sources.")
            # Include a snippet from the top result
            top = retrieved_chunks[0]
            snippet = top.get("text", "")[:200]
            parts.append(f"According to {top.get('source', 'our knowledge base')}: {snippet}...")
        else:
            parts.append(
                "I don't have specific knowledge about this, but I'll help based on what I know."
            )

        if tool_calls:
            parts.append(f"I also looked up information using {len(tool_calls)} tool(s):")
            for tc in tool_calls:
                status = "✓" if tc["success"] else "✗"
                parts.append(f"  {status} {tc['tool']}")

        parts.append(f"\nConfidence: {confidence:.0%}")

        return "\n".join(parts)

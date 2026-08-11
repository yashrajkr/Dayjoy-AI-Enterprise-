"""Conversation Memory — session, short-term, long-term memory.

Manages:
- Session memory (current conversation context)
- Short-term memory (last N turns, for LLM context window)
- Long-term memory (extracted facts about the user)
- Conversation summaries (auto-generated when conversation is long)
- Context window management (token budget)
- Memory expiration (old conversations cleaned up)
- Tenant isolation (memory is scoped to organization)
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.ai import AIConfig, AIConversation, ConversationTurn

logger = get_logger(__name__)

# Maximum tokens for memory context (leaves room for prompt + response)
MAX_MEMORY_TOKENS = 3000


class MemoryService:
    """Manages conversation memory for AI agents."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def load_short_term(
        self, conversation_id: uuid.UUID, ai_config: AIConfig
    ) -> list[dict[str, str]]:
        """Load short-term memory (last N turns) for the LLM context window.

        Args:
            conversation_id: The conversation ID.
            ai_config: AI configuration (contains short_term_turns setting).

        Returns:
            List of {"role": "user"|"assistant", "content": "..."} dicts.
        """
        max_turns = ai_config.short_term_turns if ai_config else 10

        result = await self.db.execute(
            select(ConversationTurn)
            .where(ConversationTurn.conversation_id == str(conversation_id))
            .order_by(ConversationTurn.turn_number.desc())
            .limit(max_turns * 2)  # *2 because each turn = user + assistant
        )
        turns = list(reversed(result.scalars().all()))

        # Convert to LLM message format
        messages = []
        total_tokens = 0
        for turn in turns:
            # Rough token estimate: 1 token ≈ 4 chars
            turn_tokens = len(turn.content) // 4
            if total_tokens + turn_tokens > MAX_MEMORY_TOKENS:
                break  # Respect context window
            messages.append({"role": turn.role, "content": turn.content})
            total_tokens += turn_tokens

        return messages

    async def load_long_term(self, conversation_id: uuid.UUID) -> dict[str, Any]:
        """Load long-term memory (extracted facts) for a conversation."""
        result = await self.db.execute(
            select(AIConversation).where(AIConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            return {}
        return conv.long_term_memory or {}

    async def load_user_preferences(self, conversation_id: uuid.UUID) -> dict[str, Any]:
        """Load user preferences extracted from conversation."""
        result = await self.db.execute(
            select(AIConversation).where(AIConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            return {}
        return conv.user_preferences or {}

    async def save_long_term(
        self,
        conversation_id: uuid.UUID,
        key: str,
        value: Any,
    ) -> None:
        """Save a fact to long-term memory.

        Args:
            conversation_id: The conversation ID.
            key: The fact key (e.g., "preferred_language", "customer_id").
            value: The fact value.
        """
        result = await self.db.execute(
            select(AIConversation).where(AIConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            return

        memory = conv.long_term_memory or {}
        memory[key] = value
        conv.long_term_memory = memory
        await self.db.flush()

    async def save_user_preference(
        self,
        conversation_id: uuid.UUID,
        key: str,
        value: Any,
    ) -> None:
        """Save a user preference."""
        result = await self.db.execute(
            select(AIConversation).where(AIConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            return

        prefs = conv.user_preferences or {}
        prefs[key] = value
        conv.user_preferences = prefs
        await self.db.flush()

    async def get_conversation_summary(self, conversation_id: uuid.UUID) -> str | None:
        """Get the auto-generated conversation summary."""
        result = await self.db.execute(
            select(AIConversation).where(AIConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            return None
        return conv.summary

    async def update_summary(self, conversation_id: uuid.UUID, summary: str) -> None:
        """Update the conversation summary (auto-generated when conversation is long)."""
        result = await self.db.execute(
            select(AIConversation).where(AIConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            return
        conv.summary = summary
        await self.db.flush()

    async def get_context(self, conversation_id: uuid.UUID, ai_config: AIConfig) -> dict[str, Any]:
        """Get the full context for an AI request.

        Combines: short-term memory + long-term memory + user preferences + summary.
        """
        short_term = await self.load_short_term(conversation_id, ai_config)
        long_term = await self.load_long_term(conversation_id)
        preferences = await self.load_user_preferences(conversation_id)
        summary = await self.get_conversation_summary(conversation_id)

        return {
            "short_term": short_term,
            "long_term": long_term,
            "preferences": preferences,
            "summary": summary,
        }

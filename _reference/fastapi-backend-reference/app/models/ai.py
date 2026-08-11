"""AI Platform models — prompts, conversations, tools, agents, RAG, evaluation.

Phase 4: The brain of the system.
All models are multi-tenant (organization_id).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin

# ====================================================================
# MODULE 2: Prompt Management
# ====================================================================


class Prompt(UUIDMixin, TimestampMixin, Base):
    """A prompt template with versioning.

    Supports: system prompts, agent prompts, tenant-specific prompts.
    Environment separation: dev, staging, prod.
    """

    __tablename__ = "ai_prompts"

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Prompt type: system, agent, tenant, welcome, fallback
    prompt_type: Mapped[str] = mapped_column(String(20), default="system", nullable=False)

    # Current version number
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Environment: dev, staging, prod
    environment: Mapped[str] = mapped_column(String(20), default="dev", nullable=False)

    # Variables (JSON: {"var_name": {"description": "...", "default": "..."}})
    variables: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Is this prompt active?
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Prompt {self.name} v{self.current_version}>"


class PromptVersion(UUIDMixin, TimestampMixin, Base):
    """A specific version of a prompt template.

    Stores the actual prompt content (Jinja2 template).
    Supports rollback by activating a previous version.
    """

    __tablename__ = "ai_prompt_versions"

    prompt_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)  # Jinja2 template

    # Who created this version
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Change log
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Is this the active version?
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Testing: performance metrics for this version
    test_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    test_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<PromptVersion prompt={self.prompt_id} v{self.version}>"


# ====================================================================
# MODULE 3: Conversation Memory
# ====================================================================


class AIConversation(UUIDMixin, TimestampMixin, Base):
    """An AI conversation (across one or more turns).

    Tracks: user, channel, agent, context, summary.
    """

    __tablename__ = "ai_conversations"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Channel: web, voice, whatsapp, email
    channel: Mapped[str] = mapped_column(String(20), default="web", nullable=False)

    # Which agent handled this conversation
    agent_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Status: active, completed, escalated, abandoned
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)

    # Context (JSON: customer_id, distributor_id, current_intent, etc.)
    context: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Conversation summary (auto-generated when conversation is long)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Long-term memory (JSON: key facts about the user extracted from conversation)
    long_term_memory: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # User preferences (extracted from conversation)
    user_preferences: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Token tracking
    total_tokens_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Cost tracking
    total_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Metadata
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<AIConversation {self.id} channel={self.channel} status={self.status}>"


class ConversationTurn(UUIDMixin, TimestampMixin, Base):
    """A single turn in an AI conversation (user message + AI response)."""

    __tablename__ = "ai_conversation_turns"

    conversation_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    turn_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Role: user, assistant, system, tool
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Which agent responded
    agent_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # LLM details
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Tool calls made during this turn
    tool_calls: Mapped[list] = mapped_column(JSONBType, default=list)

    # RAG: retrieved chunks used for this response
    retrieved_chunks: Mapped[list] = mapped_column(JSONBType, default=list)

    # Citations
    citations: Mapped[list] = mapped_column(JSONBType, default=list)

    # Confidence score (0.0-1.0)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Safety: was this response filtered?
    was_filtered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    filter_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Cost
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<ConversationTurn conv={self.conversation_id} turn={self.turn_number}>"


# ====================================================================
# MODULE 4: Tool Calling Framework
# ====================================================================


class ToolDefinition(UUIDMixin, TimestampMixin, Base):
    """A tool that AI agents can call (e.g., customer_lookup, product_search).

    Tools are plug-in based — new tools can be added without code changes
    (as long as the execution handler is registered).
    """

    __tablename__ = "ai_tool_definitions"

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Tool handler (Python function path: "app.ai.tools.customer:lookup_customer")
    handler: Mapped[str] = mapped_column(String(255), nullable=False)

    # Input schema (JSON Schema format)
    input_schema: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Output schema (JSON Schema format)
    output_schema: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Which agents can use this tool?
    allowed_agents: Mapped[list] = mapped_column(
        JSONBType, default=list
    )  # ["support", "sales", ...]

    # Safety: is this tool destructive (creates/updates/deletes data)?
    is_destructive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Requires human approval?
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Rate limit (calls per minute per tenant)
    rate_limit: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<ToolDefinition {self.name}>"


class ToolCallLog(UUIDMixin, TimestampMixin, Base):
    """Log of a tool call made by an AI agent."""

    __tablename__ = "ai_tool_call_logs"

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    turn_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    tool_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    agent_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Input/Output
    input: Mapped[dict] = mapped_column(JSONBType, default=dict)
    output: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)

    # Status: success, error, timeout, denied
    status: Mapped[str] = mapped_column(String(20), default="success", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timing
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<ToolCallLog {self.tool_name} {self.status}>"


# ====================================================================
# MODULE 5: Multi-Agent Orchestrator
# ====================================================================


class AgentConfig(UUIDMixin, TimestampMixin, Base):
    """Configuration for a specialized AI agent.

    Each agent has: a system prompt, allowed tools, LLM settings, guardrails.
    """

    __tablename__ = "ai_agent_configs"

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Agent identity
    agent_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Types: support, sales, product, distributor, crm, knowledge, analytics, escalation, workflow
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # LLM settings
    llm_provider: Mapped[str] = mapped_column(String(50), default="openai", nullable=False)
    model: Mapped[str] = mapped_column(String(100), default="gpt-4o-mini", nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.2, nullable=False)
    max_tokens: Mapped[int] = mapped_column(Integer, default=2000, nullable=False)

    # Prompt (references Prompt table)
    prompt_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Allowed tools (JSON array of tool names)
    allowed_tools: Mapped[list] = mapped_column(JSONBType, default=list)

    # Guardrails
    enable_rag: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_memory: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_tool_calling: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_safety_filter: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Confidence threshold for escalation
    confidence_threshold: Mapped[float] = mapped_column(Float, default=0.55, nullable=False)

    # Latency budget (ms)
    latency_budget_ms: Mapped[int] = mapped_column(Integer, default=2000, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Priority (for orchestrator routing — higher = preferred)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ===== Phase 6: Agent Platform additions =====
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    context_window: Mapped[int] = mapped_column(Integer, default=4096, nullable=False)
    memory_config: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    guardrails: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    slug: Mapped[str | None] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<AgentConfig {self.agent_type}>"


# ====================================================================
# MODULE 6: RAG (Retrieval-Augmented Generation)
# ====================================================================


class RAGDocument(UUIDMixin, TimestampMixin, Base):
    """A document ingested into the RAG pipeline.

    Lifecycle: uploaded → parsing → chunking → embedding → ready → archived
    """

    __tablename__ = "rag_documents"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Document info
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    source_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Format: pdf, docx, html, md, csv, txt
    format: Mapped[str] = mapped_column(String(20), nullable=False)

    # Category (e.g., product_catalog, policy, faq, training)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Status: uploaded, parsing, chunking, embedding, ready, failed, archived
    status: Mapped[str] = mapped_column(String(20), default="uploaded", nullable=False, index=True)

    # Page count, chunk count
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Language
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    # Version
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    parent_document_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Metadata (JSON: author, tags, custom fields)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONBType, default=dict)

    # Error (if status is failed)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Uploaded by
    uploaded_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<RAGDocument {self.filename} {self.status}>"


class RAGChunk(UUIDMixin, TimestampMixin, Base):
    """A semantic chunk of a RAG document.

    Chunks are the unit of retrieval — the RAG engine searches chunks,
    not whole documents.
    """

    __tablename__ = "rag_chunks"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    document_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Chunk content
    text: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # Metadata
    heading_path: Mapped[list] = mapped_column(JSONBType, default=list)  # ["H1", "H2", "H3"]
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    # Chunk metadata (JSON: source, category, tags, etc.)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONBType, default=dict)

    # Embedding model info
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Status: ready, stale, archived
    status: Mapped[str] = mapped_column(String(20), default="ready", nullable=False)

    # Staleness: when was this chunk last verified?
    last_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<RAGChunk doc={self.document_id} idx={self.chunk_index}>"


class RAGEmbedding(UUIDMixin, TimestampMixin, Base):
    """Vector embedding for a RAG chunk (stored in pgvector).

    Uses HNSW index for fast approximate nearest neighbor search.
    """

    __tablename__ = "rag_embeddings"

    chunk_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    model_id: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)

    # The embedding vector (dimension depends on model)
    # NOTE: In production with pgvector, this would be a `vector(1536)` column.
    # For SQLite compatibility in tests, we store as JSON.
    embedding: Mapped[list] = mapped_column(JSONBType, default=list)

    def __repr__(self) -> str:
        return f"<RAGEmbedding chunk={self.chunk_id} model={self.model_id}>"


# ====================================================================
# MODULE 8: AI Evaluation
# ====================================================================


class EvalRun(UUIDMixin, TimestampMixin, Base):
    """An evaluation run (a batch of test queries against the AI system)."""

    __tablename__ = "ai_eval_runs"

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # What was evaluated
    eval_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Types: grounding, hallucination, tool_calling, agent_routing, prompt_quality

    # Configuration (JSON: model, temperature, agent, prompt version, etc.)
    config: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Results (aggregate)
    total_queries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    passed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Metrics (JSON: {accuracy: 0.95, grounding: 0.88, hallucination_rate: 0.02, ...})
    metrics: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Status: running, completed, failed
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)

    # Started/completed
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<EvalRun {self.name} {self.status}>"


class EvalResult(UUIDMixin, TimestampMixin, Base):
    """A single evaluation result (one query → one response → scored)."""

    __tablename__ = "ai_eval_results"

    eval_run_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Query and response
    query: Mapped[str] = mapped_column(Text, nullable=False)
    response: Mapped[str] = mapped_column(Text, nullable=False)

    # Expected (for grounding tests)
    expected: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Scores (0.0-1.0)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    grounding: Mapped[float | None] = mapped_column(Float, nullable=True)
    relevance: Mapped[float | None] = mapped_column(Float, nullable=True)
    hallucination_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Metrics
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_in: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Tool calls
    tool_calls: Mapped[list] = mapped_column(JSONBType, default=list)
    tool_success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Citation
    has_citation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    citation_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Pass/fail
    passed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<EvalResult run={self.eval_run_id} passed={self.passed}>"


# ====================================================================
# MODULE 1 & 9: AI Configuration
# ====================================================================


class AIConfig(UUIDMixin, TimestampMixin, Base):
    """Tenant-level AI configuration (LLM provider, default model, etc.).

    Changes take effect without code changes (loaded at request time).
    """

    __tablename__ = "ai_configs"

    organization_id: Mapped[str] = mapped_column(
        String(36), nullable=False, unique=True, index=True
    )

    # LLM provider settings
    llm_provider: Mapped[str] = mapped_column(String(50), default="openai", nullable=False)
    default_model: Mapped[str] = mapped_column(String(100), default="gpt-4o-mini", nullable=False)
    fallback_model: Mapped[str] = mapped_column(String(100), default="gpt-4o", nullable=False)

    # Default LLM parameters
    default_temperature: Mapped[float] = mapped_column(Float, default=0.2, nullable=False)
    default_max_tokens: Mapped[int] = mapped_column(Integer, default=2000, nullable=False)

    # Memory settings
    memory_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    short_term_turns: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    long_term_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # RAG settings
    rag_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rag_top_k: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    rag_confidence_threshold: Mapped[float] = mapped_column(Float, default=0.55, nullable=False)

    # Embedding settings
    embedding_model: Mapped[str] = mapped_column(
        String(100), default="text-embedding-3-small", nullable=False
    )

    # Safety settings
    safety_filter_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    prompt_injection_filter: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pii_redaction: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_requests_per_minute: Mapped[int] = mapped_column(Integer, default=100, nullable=False)

    # Enabled agents (JSON array of agent_type strings)
    enabled_agents: Mapped[list] = mapped_column(
        JSONBType, default=lambda: ["support", "knowledge", "escalation"]
    )

    # Enabled tools (JSON array of tool names)
    enabled_tools: Mapped[list] = mapped_column(
        JSONBType, default=lambda: ["customer_lookup", "product_search", "knowledge_search"]
    )

    # Cost guardrail (daily token budget in cents)
    daily_budget_cents: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)

    def __repr__(self) -> str:
        return f"<AIConfig org={self.organization_id}>"

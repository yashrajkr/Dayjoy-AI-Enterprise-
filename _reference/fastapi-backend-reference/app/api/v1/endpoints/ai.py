"""AI Platform API endpoints.

Endpoints:
- POST /ai/chat — Main AI chat endpoint (AI Gateway)
- POST /ai/documents — Upload document to RAG pipeline
- GET /ai/documents — List RAG documents
- POST /ai/search — Knowledge search (RAG)
- GET /ai/prompts — List prompts
- POST /ai/prompts — Create prompt
- POST /ai/prompts/{id}/versions — Create prompt version
- POST /ai/prompts/{id}/rollback/{version} — Rollback prompt
- GET /ai/agents — List agent configs
- PATCH /ai/agents/{id} — Update agent config
- GET /ai/tools — List tools
- POST /ai/tools/{name}/execute — Execute a tool
- GET /ai/conversations — List conversations
- GET /ai/conversations/{id} — Get conversation with turns
- GET /ai/evaluations — List evaluation runs
- POST /ai/evaluations — Create evaluation run
- GET /ai/config — Get AI configuration
- PATCH /ai/config — Update AI configuration
"""

import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gateway import AIGateway
from app.api.deps import CurrentUser
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.ai import (
    AgentConfig,
    AIConfig,
    AIConversation,
    ConversationTurn,
    EvalRun,
    Prompt,
    RAGDocument,
    ToolDefinition,
)

router = APIRouter()


# ===== Schemas =====


class ChatRequest(BaseModel):
    """AI chat request."""

    message: str = Field(..., min_length=1, max_length=10000)
    conversation_id: uuid.UUID | None = None
    channel: str = "web"
    context: dict = Field(default_factory=dict)


class ChatResponse(BaseModel):
    """AI chat response."""

    response: str
    conversation_id: str
    turn_id: str
    citations: list = Field(default_factory=list)
    confidence: float
    tool_calls: list = Field(default_factory=list)
    agent_type: str | None = None
    model: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    was_filtered: bool = False


class DocumentUploadRequest(BaseModel):
    """RAG document upload request."""

    filename: str
    content: str
    format: str = "txt"
    category: str | None = None
    title: str | None = None
    language: str = "en"


class KnowledgeSearchRequest(BaseModel):
    """Knowledge search request."""

    query: str
    top_k: int = 5


class PromptCreateRequest(BaseModel):
    """Prompt creation request."""

    name: str
    content: str
    prompt_type: str = "system"
    description: str | None = None
    environment: str = "dev"


class PromptVersionRequest(BaseModel):
    """Prompt version creation request."""

    content: str
    change_summary: str | None = None


class AgentUpdateRequest(BaseModel):
    """Agent config update request."""

    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    is_active: bool | None = None
    enable_rag: bool | None = None
    enable_memory: bool | None = None
    enable_tool_calling: bool | None = None
    confidence_threshold: float | None = None


class ToolExecuteRequest(BaseModel):
    """Tool execution request."""

    input_data: dict = Field(default_factory=dict)


class AIConfigUpdateRequest(BaseModel):
    """AI configuration update request."""

    default_model: str | None = None
    default_temperature: float | None = None
    rag_enabled: bool | None = None
    rag_top_k: int | None = None
    safety_filter_enabled: bool | None = None
    enabled_agents: list[str] | None = None
    enabled_tools: list[str] | None = None


class EvalRunCreateRequest(BaseModel):
    """Evaluation run creation request."""

    name: str
    description: str | None = None
    eval_type: str = "grounding"
    config: dict = Field(default_factory=dict)


# ===== Chat (AI Gateway) =====


@router.post("/chat", response_model=ChatResponse, summary="AI Chat")
async def ai_chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> ChatResponse:
    """Send a message to the AI and get a response.

    This is the main entry point for all AI interactions.
    The AI Gateway routes the message through:
    1. Safety check (input)
    2. Intent routing (agent selection)
    3. Memory loading
    4. RAG retrieval (if needed)
    5. Tool calling (if needed)
    6. LLM call
    7. Safety check (output)
    8. Response with citations and confidence
    """
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    if org_id is None:
        return ChatResponse(
            response="You are not associated with an organization.",
            conversation_id="",
            turn_id="",
            citations=[],
            confidence=0.0,
            tool_calls=[],
            agent_type=None,
            model="none",
            tokens_in=0,
            tokens_out=0,
            latency_ms=0,
        )

    gateway = AIGateway(db)
    result = await gateway.chat(
        message=request.message,
        organization_id=uuid.UUID(org_id),
        user_id=user.id,
        conversation_id=request.conversation_id,
        channel=request.channel,
        context=request.context,
    )

    return ChatResponse(**result)


# ===== RAG (Knowledge Base) =====


@router.post("/documents", status_code=status.HTTP_201_CREATED, summary="Upload to RAG")
async def upload_rag_document(
    request: DocumentUploadRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Upload a document to the RAG pipeline.

    The document will be:
    1. Chunked (semantic, heading-aware)
    2. Embedded (stored in vector DB)
    3. Searchable via /ai/search
    """
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    from app.ai.rag import RAGService

    rag = RAGService(db)
    doc = await rag.ingest_document(
        organization_id=uuid.UUID(org_id),
        filename=request.filename,
        content=request.content,
        format=request.format,
        category=request.category,
        title=request.title,
        language=request.language,
        uploaded_by=user.id,
    )

    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "status": doc.status,
        "chunk_count": doc.chunk_count,
    }


@router.get("/documents", summary="List RAG documents")
async def list_rag_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List RAG documents."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    result = await db.execute(
        select(RAGDocument)
        .where(RAGDocument.organization_id == org_id)
        .order_by(RAGDocument.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "filename": d.filename,
            "status": d.status,
            "chunk_count": d.chunk_count,
            "category": d.category,
            "title": d.title,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


@router.post("/search", summary="Knowledge search (RAG)")
async def knowledge_search(
    request: KnowledgeSearchRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Search the knowledge base using RAG.

    Returns cited, confidence-scored results.
    If confidence is too low, returns a fallback response (hallucination prevention).
    """
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return {"results": [], "total": 0, "confidence": 0.0, "fallback": True}
    org_id = user_orgs[0].organization_id

    from app.ai.rag import RAGService

    rag = RAGService(db)
    return await rag.search(
        query=request.query,
        organization_id=uuid.UUID(org_id),
        top_k=request.top_k,
    )


# ===== Prompt Management =====


@router.get("/prompts", summary="List prompts")
async def list_prompts(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List all prompts."""
    result = await db.execute(select(Prompt))
    prompts = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "prompt_type": p.prompt_type,
            "current_version": p.current_version,
            "environment": p.environment,
            "is_active": p.is_active,
        }
        for p in prompts
    ]


@router.post("/prompts", status_code=status.HTTP_201_CREATED, summary="Create prompt")
async def create_prompt(
    request: PromptCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Create a new prompt with an initial version."""
    from app.ai.prompt_manager import PromptManager

    pm = PromptManager(db)
    prompt = await pm.create_prompt(
        name=request.name,
        content=request.content,
        prompt_type=request.prompt_type,
        description=request.description,
        environment=request.environment,
        created_by=user.id,
    )
    return {"id": str(prompt.id), "name": prompt.name, "version": prompt.current_version}


@router.post("/prompts/{prompt_id}/versions", summary="Create prompt version")
async def create_prompt_version(
    prompt_id: uuid.UUID,
    request: PromptVersionRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Create a new version of a prompt (deactivates previous versions)."""
    from app.ai.prompt_manager import PromptManager

    pm = PromptManager(db)
    version = await pm.create_version(
        prompt_id=prompt_id,
        content=request.content,
        change_summary=request.change_summary,
        created_by=user.id,
    )
    return {"id": str(version.id), "version": version.version, "is_active": version.is_active}


@router.post("/prompts/{prompt_id}/rollback/{version}", summary="Rollback prompt")
async def rollback_prompt(
    prompt_id: uuid.UUID,
    version: int,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Rollback to a previous prompt version."""
    from app.ai.prompt_manager import PromptManager

    pm = PromptManager(db)
    v = await pm.rollback(prompt_id, version)
    return {"id": str(v.id), "version": v.version, "is_active": True}


# ===== Agent Management =====


@router.get("/agents", summary="List agents")
async def list_agents(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List all AI agent configurations."""
    result = await db.execute(select(AgentConfig))
    agents = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "agent_type": a.agent_type,
            "name": a.name,
            "model": a.model,
            "temperature": a.temperature,
            "is_active": a.is_active,
            "enable_rag": a.enable_rag,
            "enable_memory": a.enable_memory,
            "enable_tool_calling": a.enable_tool_calling,
            "confidence_threshold": a.confidence_threshold,
            "allowed_tools": a.allowed_tools,
        }
        for a in agents
    ]


@router.patch("/agents/{agent_id}", summary="Update agent config")
async def update_agent(
    agent_id: uuid.UUID,
    request: AgentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Update an AI agent configuration."""
    agent = await db.get(AgentConfig, agent_id)
    if agent is None:
        raise NotFoundError("Agent", str(agent_id))

    updates = request.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(agent, key, value)

    await db.commit()
    await db.refresh(agent)
    return {"id": str(agent.id), "agent_type": agent.agent_type, "is_active": agent.is_active}


# ===== Tool Management =====


@router.get("/tools", summary="List tools")
async def list_tools(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List all available AI tools."""
    result = await db.execute(select(ToolDefinition))
    tools = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "display_name": t.display_name,
            "description": t.description,
            "is_destructive": t.is_destructive,
            "requires_approval": t.requires_approval,
            "is_active": t.is_active,
            "allowed_agents": t.allowed_agents,
        }
        for t in tools
    ]


@router.post("/tools/{tool_name}/execute", summary="Execute a tool")
async def execute_tool(
    tool_name: str,
    request: ToolExecuteRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Execute an AI tool directly (for testing/admin)."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    from app.ai.tools.engine import ToolEngine

    engine = ToolEngine(db)
    result = await engine.execute(
        tool_name=tool_name,
        input_data=request.input_data,
        organization_id=uuid.UUID(org_id) if org_id else None,
    )
    return result


# ===== Conversations =====


@router.get("/conversations", summary="List AI conversations")
async def list_conversations(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List AI conversations for the current user."""
    result = await db.execute(
        select(AIConversation)
        .where(AIConversation.user_id == str(user.id))
        .order_by(AIConversation.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    convs = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "channel": c.channel,
            "agent_type": c.agent_type,
            "status": c.status,
            "total_tokens_in": c.total_tokens_in,
            "total_tokens_out": c.total_tokens_out,
            "summary": c.summary,
            "created_at": c.created_at.isoformat(),
        }
        for c in convs
    ]


@router.get("/conversations/{conversation_id}", summary="Get conversation")
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Get a conversation with all turns."""
    conv = await db.get(AIConversation, conversation_id)
    if conv is None:
        raise NotFoundError("Conversation", str(conversation_id))

    result = await db.execute(
        select(ConversationTurn)
        .where(ConversationTurn.conversation_id == str(conversation_id))
        .order_by(ConversationTurn.turn_number)
    )
    turns = result.scalars().all()

    return {
        "id": str(conv.id),
        "channel": conv.channel,
        "agent_type": conv.agent_type,
        "status": conv.status,
        "summary": conv.summary,
        "context": conv.context,
        "long_term_memory": conv.long_term_memory,
        "turns": [
            {
                "turn_number": t.turn_number,
                "role": t.role,
                "content": t.content,
                "agent_type": t.agent_type,
                "confidence": t.confidence,
                "citations": t.citations,
                "tool_calls": t.tool_calls,
                "was_filtered": t.was_filtered,
                "created_at": t.created_at.isoformat(),
            }
            for t in turns
        ],
    }


# ===== Evaluations =====


@router.get("/evaluations", summary="List evaluations")
async def list_evaluations(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    """List AI evaluation runs."""
    result = await db.execute(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(50))
    runs = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "eval_type": r.eval_type,
            "status": r.status,
            "total_queries": r.total_queries,
            "passed": r.passed,
            "failed": r.failed,
            "metrics": r.metrics,
            "created_at": r.created_at.isoformat(),
        }
        for r in runs
    ]


@router.post("/evaluations", status_code=status.HTTP_201_CREATED, summary="Create evaluation")
async def create_evaluation(
    request: EvalRunCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Create an AI evaluation run."""
    from datetime import datetime

    run = EvalRun(
        name=request.name,
        description=request.description,
        eval_type=request.eval_type,
        config=request.config,
        status="completed",
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        total_queries=0,
        passed=0,
        failed=0,
        metrics={},
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return {"id": str(run.id), "name": run.name, "status": run.status}


# ===== AI Configuration =====


@router.get("/config", summary="Get AI configuration")
async def get_ai_config(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Get AI configuration for the current user's organization."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return {"error": "No organization found"}
    org_id = user_orgs[0].organization_id

    result = await db.execute(select(AIConfig).where(AIConfig.organization_id == org_id))
    config = result.scalar_one_or_none()

    if config is None:
        return {
            "organization_id": org_id,
            "default_model": "gpt-4o-mini",
            "rag_enabled": True,
            "safety_filter_enabled": True,
            "enabled_agents": ["support", "knowledge", "escalation"],
            "enabled_tools": ["customer_lookup", "product_search", "knowledge_search"],
        }

    return {
        "id": str(config.id),
        "organization_id": config.organization_id,
        "llm_provider": config.llm_provider,
        "default_model": config.default_model,
        "default_temperature": config.default_temperature,
        "rag_enabled": config.rag_enabled,
        "rag_top_k": config.rag_top_k,
        "safety_filter_enabled": config.safety_filter_enabled,
        "enabled_agents": config.enabled_agents,
        "enabled_tools": config.enabled_tools,
        "daily_budget_cents": config.daily_budget_cents,
    }


@router.patch("/config", summary="Update AI configuration")
async def update_ai_config(
    request: AIConfigUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Update AI configuration for the current user's organization."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id

    result = await db.execute(select(AIConfig).where(AIConfig.organization_id == org_id))
    config = result.scalar_one_or_none()

    if config is None:
        config = AIConfig(organization_id=org_id)
        db.add(config)

    updates = request.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)
    return {"id": str(config.id), "updated": list(updates.keys())}

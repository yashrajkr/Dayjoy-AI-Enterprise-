"""AI Agent Platform API — 25 endpoints for agent management, execution, workflows, evaluations."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.exceptions import NotFoundError
from app.core.response import created, no_content, paginated, success
from app.models.agent_platform import (
    AgentEvaluation, AgentExecution, AIWorkflowDefinition, AIWorkflowExecution,
)
from app.services.agent_platform_services import (
    AgentEvaluationService, AgentExecutionEngine, GuardrailsService,
    MemoryService, MultiAgentOrchestrator, WorkflowEngine,
)
from app.services.agent_registry import AgentRegistryService
from app.services.common import resolve_org_id

router = APIRouter()


# ===== Schemas =====

class CreateAgentRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    agent_type: str = "custom"
    description: str | None = None
    avatar_url: str | None = None
    system_prompt: str | None = None
    instructions: str | None = None
    llm_provider: str = "openai"
    model: str = "gpt-4o-mini"
    temperature: float = Field(0.3, ge=0.0, le=2.0)
    max_tokens: int = Field(2000, ge=50, le=8000)
    timeout_seconds: int = 30
    max_retries: int = 3
    context_window: int = 4096
    memory_config: dict | None = None
    guardrails: dict | None = None
    confidence_threshold: float = 0.55
    enable_rag: bool = True
    enable_memory: bool = True
    enable_tool_calling: bool = True
    enable_safety_filter: bool = True
    allowed_tools: list[str] = Field(default_factory=list)
    knowledge_collections: list[str] = Field(default_factory=list)
    template_id: uuid.UUID | None = None


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    avatar_url: str | None = None
    system_prompt: str | None = None
    instructions: str | None = None
    llm_provider: str | None = None
    model: str | None = None
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    max_tokens: int | None = None
    timeout_seconds: int | None = None
    max_retries: int | None = None
    context_window: int | None = None
    memory_config: dict | None = None
    guardrails: dict | None = None
    confidence_threshold: float | None = None
    enable_rag: bool | None = None
    enable_memory: bool | None = None
    enable_tool_calling: bool | None = None
    enable_safety_filter: bool | None = None
    allowed_tools: list[str] | None = None
    is_active: bool | None = None
    change_summary: str | None = None


class CloneAgentRequest(BaseModel):
    new_name: str
    new_description: str | None = None


class ExecuteAgentRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    conversation_id: str | None = None
    input_metadata: dict | None = None


class BindKnowledgeRequest(BaseModel):
    collection_name: str
    is_primary: bool = False


class CreateWorkflowRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    steps: list[dict] = Field(default_factory=list)
    trigger_type: str = "manual"
    trigger_config: dict | None = None


class ExecuteWorkflowRequest(BaseModel):
    input_context: dict = Field(default_factory=dict)


class OrchestrateRequest(BaseModel):
    task: str = Field(..., min_length=1, max_length=4000)
    supervisor_agent_id: uuid.UUID | None = None
    worker_agents: dict[str, str] = Field(default_factory=dict)


class EvaluateRequest(BaseModel):
    agent_id: uuid.UUID | None = None
    execution_id: uuid.UUID | None = None
    question: str
    answer: str
    context: str = ""
    citations: list | None = None


class UserRatingRequest(BaseModel):
    execution_id: uuid.UUID
    rating: int = Field(..., ge=1, le=5)
    feedback: str | None = None


class CheckInjectionRequest(BaseModel):
    text: str


class CreateFromTemplateRequest(BaseModel):
    template_id: uuid.UUID
    name: str
    description: str | None = None


# ===== Agent CRUD =====

@router.post("/agents", status_code=status.HTTP_201_CREATED, summary="Create agent")
async def create_agent(request: CreateAgentRequest, response: Response, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    agent = await svc.create_agent(
        organization_id=org_id, created_by=user.id, name=request.name, agent_type=request.agent_type,
        description=request.description, avatar_url=request.avatar_url, system_prompt=request.system_prompt,
        instructions=request.instructions, llm_provider=request.llm_provider, model=request.model,
        temperature=request.temperature, max_tokens=request.max_tokens, timeout_seconds=request.timeout_seconds,
        max_retries=request.max_retries, context_window=request.context_window, memory_config=request.memory_config,
        guardrails=request.guardrails, confidence_threshold=request.confidence_threshold,
        enable_rag=request.enable_rag, enable_memory=request.enable_memory,
        enable_tool_calling=request.enable_tool_calling, enable_safety_filter=request.enable_safety_filter,
        allowed_tools=request.allowed_tools, knowledge_collections=request.knowledge_collections,
        template_id=request.template_id)
    await db.commit()
    return created(svc.to_dict(agent), response=response)


@router.get("/agents", summary="List agents")
async def list_agents(agent_type: str | None = Query(None), is_archived: bool = Query(False),
                      skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    agents, total = await svc.list_agents(organization_id=org_id, agent_type=agent_type, is_archived=is_archived, skip=skip, limit=limit)
    return paginated([svc.to_dict(a) for a in agents], total=total, skip=skip, limit=limit)


@router.get("/agents/{agent_id}", summary="Get agent")
async def get_agent(agent_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    agent = await svc.get_agent(organization_id=org_id, agent_id=agent_id)
    return success(svc.to_dict(agent))


@router.patch("/agents/{agent_id}", summary="Update agent")
async def update_agent(agent_id: uuid.UUID, request: UpdateAgentRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    updates = request.model_dump(exclude_unset=True)
    agent = await svc.update_agent(organization_id=org_id, agent_id=agent_id, updated_by=user.id, **updates)
    await db.commit()
    return success(svc.to_dict(agent))


@router.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete agent")
async def delete_agent(agent_id: uuid.UUID, response: Response, user: CurrentUser = None, db: DBSession = None) -> None:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    await svc.delete_agent(organization_id=org_id, agent_id=agent_id, deleted_by=user.id)
    await db.commit()
    return no_content(response)


@router.post("/agents/{agent_id}/archive", summary="Archive agent")
async def archive_agent(agent_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    agent = await svc.archive_agent(organization_id=org_id, agent_id=agent_id, archived_by=user.id)
    await db.commit()
    return success(svc.to_dict(agent))


@router.post("/agents/{agent_id}/restore", summary="Restore agent")
async def restore_agent(agent_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    agent = await svc.restore_agent(organization_id=org_id, agent_id=agent_id, restored_by=user.id)
    await db.commit()
    return success(svc.to_dict(agent))


@router.post("/agents/{agent_id}/clone", status_code=status.HTTP_201_CREATED, summary="Clone agent")
async def clone_agent(agent_id: uuid.UUID, request: CloneAgentRequest, response: Response, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    clone = await svc.clone_agent(organization_id=org_id, agent_id=agent_id, cloned_by=user.id, new_name=request.new_name, new_description=request.new_description)
    await db.commit()
    return created(svc.to_dict(clone), response=response)


@router.post("/agents/{agent_id}/publish", summary="Publish as template")
async def publish_agent(agent_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    agent = await svc.publish_agent(organization_id=org_id, agent_id=agent_id, published_by=user.id)
    await db.commit()
    return success(svc.to_dict(agent))


@router.post("/agents/{agent_id}/unpublish", summary="Unpublish")
async def unpublish_agent(agent_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    agent = await svc.unpublish_agent(organization_id=org_id, agent_id=agent_id, unpublished_by=user.id)
    await db.commit()
    return success(svc.to_dict(agent))


# ===== Agent Versions =====

@router.get("/agents/{agent_id}/versions", summary="List versions")
async def list_versions(agent_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    versions = await svc.list_versions(organization_id=org_id, agent_id=agent_id)
    return success([{"id": str(v.id), "version": v.version, "change_summary": v.change_summary,
                     "is_active": v.is_active, "created_by": v.created_by,
                     "created_at": v.created_at.isoformat() if v.created_at else None} for v in versions])


@router.post("/agents/{agent_id}/rollback/{version}", summary="Rollback to version")
async def rollback_agent(agent_id: uuid.UUID, version: int, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    agent = await svc.rollback_to_version(organization_id=org_id, agent_id=agent_id, version=version, rolled_back_by=user.id)
    await db.commit()
    return success(svc.to_dict(agent))


# ===== Agent Knowledge =====

@router.get("/agents/{agent_id}/knowledge", summary="List knowledge bindings")
async def list_knowledge(agent_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    return success(await svc.list_knowledge_bindings(organization_id=org_id, agent_id=agent_id))


@router.post("/agents/{agent_id}/knowledge", status_code=status.HTTP_201_CREATED, summary="Bind knowledge")
async def bind_knowledge(agent_id: uuid.UUID, request: BindKnowledgeRequest, response: Response, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    binding = await svc.bind_knowledge(organization_id=org_id, agent_id=agent_id, collection_name=request.collection_name, is_primary=request.is_primary)
    await db.commit()
    return created({"collection_name": binding.collection_name, "is_primary": binding.is_primary}, response=response)


@router.delete("/agents/{agent_id}/knowledge/{collection_name}", status_code=status.HTTP_204_NO_CONTENT, summary="Unbind knowledge")
async def unbind_knowledge(agent_id: uuid.UUID, collection_name: str, response: Response, user: CurrentUser = None, db: DBSession = None) -> None:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    await svc.unbind_knowledge(organization_id=org_id, agent_id=agent_id, collection_name=collection_name)
    await db.commit()
    return no_content(response)


# ===== Agent Tools =====

@router.get("/agents/{agent_id}/tools", summary="List tool bindings")
async def list_tools(agent_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    return success(await svc.list_tool_bindings(organization_id=org_id, agent_id=agent_id))


# ===== Agent Execution =====

@router.post("/agents/{agent_id}/execute", summary="Execute agent")
async def execute_agent(agent_id: uuid.UUID, request: ExecuteAgentRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    engine = AgentExecutionEngine(db)
    result = await engine.execute(agent_id=agent_id, organization_id=org_id, input_message=request.message,
                                  user_id=user.id, conversation_id=request.conversation_id, input_metadata=request.input_metadata)
    await db.commit()
    return success(result)


@router.get("/agents/{agent_id}/executions", summary="List executions")
async def list_executions(agent_id: uuid.UUID, skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    result = await db.execute(
        select(AgentExecution).where(AgentExecution.organization_id == str(org_id), AgentExecution.agent_id == str(agent_id))
        .order_by(AgentExecution.created_at.desc()).offset(skip).limit(limit))
    count_result = await db.execute(
        select(func.count()).select_from(AgentExecution)
        .where(AgentExecution.organization_id == str(org_id), AgentExecution.agent_id == str(agent_id)))
    total = int(count_result.scalar_one_or_none() or 0)
    return paginated([{"id": str(e.id), "status": e.status, "input_message": e.input_message[:200],
                       "output_message": (e.output_message or "")[:200], "input_tokens": e.input_tokens,
                       "output_tokens": e.output_tokens, "cost_cents": e.cost_cents, "latency_ms": e.latency_ms,
                       "confidence": e.confidence, "tool_calls_count": e.tool_calls_count,
                       "retrieved_chunks_count": e.retrieved_chunks_count, "llm_provider": e.llm_provider,
                       "llm_model": e.llm_model, "created_at": e.created_at.isoformat() if e.created_at else None}
                      for e in result.scalars().all()], total=total, skip=skip, limit=limit)


@router.get("/executions/{execution_id}", summary="Get execution detail")
async def get_execution(execution_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    execution = await db.get(AgentExecution, execution_id)
    if execution is None or execution.organization_id != str(org_id):
        raise NotFoundError("Execution", str(execution_id))
    return success({"id": str(execution.id), "agent_id": execution.agent_id, "status": execution.status,
                    "input_message": execution.input_message, "output_message": execution.output_message,
                    "error_message": execution.error_message, "llm_provider": execution.llm_provider,
                    "llm_model": execution.llm_model, "input_tokens": execution.input_tokens,
                    "output_tokens": execution.output_tokens, "total_tokens": execution.total_tokens,
                    "cost_cents": execution.cost_cents, "latency_ms": execution.latency_ms,
                    "llm_latency_ms": execution.llm_latency_ms, "retrieval_latency_ms": execution.retrieval_latency_ms,
                    "tool_calls_count": execution.tool_calls_count, "tool_calls": execution.tool_calls,
                    "retrieved_chunks_count": execution.retrieved_chunks_count, "citations": execution.citations,
                    "confidence": execution.confidence, "retry_count": execution.retry_count,
                    "started_at": execution.started_at.isoformat() if execution.started_at else None,
                    "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
                    "created_at": execution.created_at.isoformat() if execution.created_at else None})


# ===== Templates =====

@router.get("/templates", summary="List templates")
async def list_templates(category: str | None = Query(None), user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    templates = await svc.list_templates(organization_id=org_id, category=category, published_only=True)
    return success([{"id": str(t.id), "name": t.name, "slug": t.slug, "description": t.description,
                     "category": t.category, "is_system": t.is_system, "version": t.version,
                     "clone_count": t.clone_count, "rating": (t.rating_sum / t.rating_count) if t.rating_count > 0 else None,
                     "tags": t.tags or [], "icon": t.icon} for t in templates])


@router.post("/agents/from-template", status_code=status.HTTP_201_CREATED, summary="Create from template")
async def create_from_template(request: CreateFromTemplateRequest, response: Response, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentRegistryService(db)
    agent = await svc.create_agent(organization_id=org_id, created_by=user.id, name=request.name,
                                    description=request.description, template_id=request.template_id)
    await db.commit()
    return created(svc.to_dict(agent), response=response)


# ===== Workflows =====

@router.post("/workflows", status_code=status.HTTP_201_CREATED, summary="Create workflow")
async def create_workflow(request: CreateWorkflowRequest, response: Response, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    wf = AIWorkflowDefinition(organization_id=str(org_id), name=request.name, description=request.description,
                               steps=request.steps, trigger_type=request.trigger_type,
                               trigger_config=request.trigger_config, is_active=True, created_by=str(user.id))
    db.add(wf)
    await db.flush()
    await db.commit()
    return created({"id": str(wf.id), "name": wf.name, "steps_count": len(wf.steps)}, response=response)


@router.get("/workflows", summary="List workflows")
async def list_workflows(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    result = await db.execute(
        select(AIWorkflowDefinition).where(AIWorkflowDefinition.organization_id == str(org_id), AIWorkflowDefinition.is_active == True)  # noqa: E712
        .order_by(AIWorkflowDefinition.created_at.desc()))
    return success([{"id": str(w.id), "name": w.name, "description": w.description,
                     "steps_count": len(w.steps or []), "trigger_type": w.trigger_type,
                     "created_at": w.created_at.isoformat() if w.created_at else None} for w in result.scalars().all()])


@router.post("/workflows/{workflow_id}/execute", summary="Execute workflow")
async def execute_workflow(workflow_id: uuid.UUID, request: ExecuteWorkflowRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    engine = WorkflowEngine(db)
    result = await engine.execute_workflow(workflow_id=workflow_id, organization_id=org_id, user_id=user.id, input_context=request.input_context)
    await db.commit()
    return success(result)


@router.get("/workflows/executions", summary="List workflow executions")
async def list_wf_executions(skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    result = await db.execute(
        select(AIWorkflowExecution).where(AIWorkflowExecution.organization_id == str(org_id))
        .order_by(AIWorkflowExecution.created_at.desc()).offset(skip).limit(limit))
    count_result = await db.execute(
        select(func.count()).select_from(AIWorkflowExecution)
        .where(AIWorkflowExecution.organization_id == str(org_id)))
    total = int(count_result.scalar_one_or_none() or 0)
    return paginated([{"id": str(e.id), "workflow_id": str(e.workflow_id) if e.workflow_id else None,
                       "status": e.status, "completed_steps": e.completed_steps, "total_steps": e.total_steps,
                       "total_cost_cents": e.total_cost_cents, "total_tokens": e.total_tokens,
                       "latency_ms": e.latency_ms, "error_message": e.error_message,
                       "created_at": e.created_at.isoformat() if e.created_at else None}
                      for e in result.scalars().all()], total=total, skip=skip, limit=limit)


# ===== Multi-Agent Orchestration =====

@router.post("/orchestrate", summary="Multi-agent orchestration")
async def orchestrate(request: OrchestrateRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Orchestrate multiple agents to complete a complex task."""
    org_id = await resolve_org_id(db, user)
    orchestrator = MultiAgentOrchestrator(db)
    # Convert string agent IDs to UUIDs
    worker_agents = {k: uuid.UUID(v) for k, v in request.worker_agents.items()} if request.worker_agents else {}
    supervisor_id = uuid.UUID(str(request.supervisor_agent_id)) if request.supervisor_agent_id else None
    result = await orchestrator.orchestrate(task=request.task, organization_id=org_id, user_id=user.id,
                                            supervisor_agent_id=supervisor_id, worker_agents=worker_agents)
    await db.commit()
    return success(result)


# ===== Memory =====

@router.get("/agents/{agent_id}/memory", summary="Get agent memory")
async def get_memory(agent_id: uuid.UUID, memory_type: str | None = Query(None), limit: int = Query(20, ge=1, le=100),
                     user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MemoryService(db)
    memories = await svc.recall(organization_id=org_id, memory_type=memory_type, agent_id=agent_id, user_id=user.id, limit=limit)
    return success([{"id": str(m.id), "memory_type": m.memory_type, "content": m.content,
                     "importance": m.importance, "created_at": m.created_at.isoformat() if m.created_at else None}
                    for m in memories])


@router.post("/agents/{agent_id}/memory/summarize", summary="Summarize conversation memory")
async def summarize_memory(agent_id: uuid.UUID, conversation_id: str = Query(...), user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MemoryService(db)
    summary = await svc.summarize(organization_id=org_id, conversation_id=conversation_id)
    await db.commit()
    return success({"summary": summary})


# ===== Evaluation =====

@router.post("/evaluations", summary="Evaluate agent answer")
async def evaluate_answer(request: EvaluateRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Run LLM-as-judge evaluation on an agent answer."""
    org_id = await resolve_org_id(db, user)
    svc = AgentEvaluationService(db)
    result = await svc.evaluate(organization_id=org_id, agent_id=request.agent_id, execution_id=request.execution_id,
                                 question=request.question, answer=request.answer, context=request.context, citations=request.citations)
    await db.commit()
    return success(result)


@router.post("/evaluations/rating", status_code=status.HTTP_201_CREATED, summary="Record user rating")
async def record_rating(request: UserRatingRequest, response: Response, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Record a user's 1-5 star rating on an agent execution."""
    org_id = await resolve_org_id(db, user)
    execution = await db.get(AgentExecution, request.execution_id)
    if execution is None or execution.organization_id != str(org_id):
        raise NotFoundError("Execution", str(request.execution_id))
    svc = AgentEvaluationService(db)
    result = await svc.evaluate(organization_id=org_id, agent_id=uuid.UUID(execution.agent_id) if execution.agent_id else None,
                                 execution_id=execution.id, question=execution.input_message,
                                 answer=execution.output_message or "", context="", citations=execution.citations,
                                 latency_ms=execution.latency_ms, cost_cents=execution.cost_cents,
                                 total_tokens=execution.total_tokens)
    # Update with user rating
    from app.models.agent_platform import AgentEvaluation
    eval_obj = await db.get(AgentEvaluation, uuid.UUID(result["evaluation_id"]))
    if eval_obj:
        eval_obj.user_rating = request.rating
        eval_obj.user_feedback = request.feedback
        eval_obj.eval_method = "user_rating"
        await db.flush()
    await db.commit()
    return created({"evaluation_id": result["evaluation_id"], "rating": request.rating}, response=response)


@router.get("/evaluations/summary", summary="Evaluation summary")
async def evaluation_summary(days: int = Query(30, ge=1, le=365), user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AgentEvaluationService(db)
    return success(await svc.get_summary(organization_id=org_id, days=days))


# ===== Guardrails =====

@router.post("/guardrails/check-injection", summary="Check prompt injection")
async def check_injection(request: CheckInjectionRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Check if text contains prompt injection attempts."""
    svc = GuardrailsService(db)
    return success(svc.check_prompt_injection(request.text))

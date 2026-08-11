"""AI Reliability Platform API — prompts, observability, guardrails, evaluation, cost analytics."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, no_content, paginated, success
from app.services.ai_reliability import (
    AIObservatoryService, ConfidenceEngine, CostAnalyticsService,
    EvaluationFrameworkService, GuardrailEngine, ModelRouter,
    PromptRegistryService,
)
from app.services.common import resolve_org_id

router = APIRouter()


# ===== Schemas =====

class CreatePromptRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    user_prompt_template: str = Field(..., min_length=1)
    system_prompt: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] = Field(default_factory=list)
    variables: dict = Field(default_factory=dict)
    default_model: str | None = None
    default_temperature: float = Field(0.3, ge=0.0, le=2.0)
    default_max_tokens: int = Field(2000, ge=50, le=8000)


class UpdatePromptRequest(BaseModel):
    name: str | None = None
    user_prompt_template: str | None = None
    system_prompt: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    variables: dict | None = None
    default_model: str | None = None
    default_temperature: float | None = Field(None, ge=0.0, le=2.0)
    change_summary: str | None = None


class CreateExperimentRequest(BaseModel):
    name: str
    model: str
    provider: str
    temperature: float = 0.3
    max_tokens: int = 2000
    input_variables: dict = Field(default_factory=dict)
    prompt_id: uuid.UUID | None = None


class CheckInputRequest(BaseModel):
    text: str
    max_tokens: int = 8000


class CheckOutputRequest(BaseModel):
    output: str
    context: str | None = None
    citations: list | None = None
    expected_json: bool = False


class ComputeScoresRequest(BaseModel):
    output: str
    citations: list | None = None
    context: str | None = None
    latency_ms: int = 0
    guardrail_issues: list | None = None


class RouteModelRequest(BaseModel):
    strategy: str = "cheapest"
    required_capability: str | None = None
    max_cost_per_1k: float | None = None
    max_latency_ms: int | None = None


class CreateDatasetRequest(BaseModel):
    name: str
    dataset_type: str = "golden"
    description: str | None = None
    samples: list[dict] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class CreateEvalRunRequest(BaseModel):
    name: str
    eval_type: str = "quality"
    prompt_id: uuid.UUID | None = None
    agent_id: str | None = None
    model: str | None = None
    dataset_id: uuid.UUID | None = None


class ComputeMetricsRequest(BaseModel):
    question: str
    answer: str
    expected: str | None = None
    context: str | None = None
    citations: list | None = None
    latency_ms: int = 0
    cost_cents: int = 0


# ===== Prompt Registry =====

@router.post("/prompts", status_code=status.HTTP_201_CREATED, summary="Create prompt")
async def create_prompt(request: CreatePromptRequest, response: Response,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PromptRegistryService(db)
    prompt = await svc.create_prompt(
        organization_id=org_id, created_by=user.id, name=request.name,
        user_prompt_template=request.user_prompt_template, system_prompt=request.system_prompt,
        description=request.description, category=request.category, tags=request.tags,
        variables=request.variables, default_model=request.default_model,
        default_temperature=request.default_temperature, default_max_tokens=request.default_max_tokens)
    await db.commit()
    return created(svc.to_dict(prompt), response=response)


@router.get("/prompts", summary="List prompts")
async def list_prompts(category: str | None = Query(None), status_filter: str | None = Query(None, alias="status"),
                       skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PromptRegistryService(db)
    prompts, total = await svc.list_prompts(organization_id=org_id, category=category,
                                             status=status_filter, skip=skip, limit=limit)
    return paginated([svc.to_dict(p) for p in prompts], total=total, skip=skip, limit=limit)


@router.get("/prompts/{prompt_id}", summary="Get prompt")
async def get_prompt(prompt_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PromptRegistryService(db)
    prompt = await svc.get_prompt(organization_id=org_id, prompt_id=prompt_id)
    return success(svc.to_dict(prompt))


@router.patch("/prompts/{prompt_id}", summary="Update prompt")
async def update_prompt(prompt_id: uuid.UUID, request: UpdatePromptRequest,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PromptRegistryService(db)
    updates = request.model_dump(exclude_unset=True)
    prompt = await svc.update_prompt(organization_id=org_id, prompt_id=prompt_id,
                                     updated_by=user.id, **updates)
    await db.commit()
    return success(svc.to_dict(prompt))


@router.get("/prompts/{prompt_id}/versions", summary="List prompt versions")
async def list_prompt_versions(prompt_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PromptRegistryService(db)
    versions = await svc.list_versions(organization_id=org_id, prompt_id=prompt_id)
    return success([{"id": str(v.id), "version": v.version, "change_summary": v.change_summary,
                     "is_active": v.is_active, "approval_status": v.approval_status,
                     "test_score": v.test_score, "created_by": v.created_by,
                     "created_at": v.created_at.isoformat() if v.created_at else None}
                    for v in versions])


@router.post("/prompts/{prompt_id}/rollback/{version}", summary="Rollback prompt")
async def rollback_prompt(prompt_id: uuid.UUID, version: int,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PromptRegistryService(db)
    prompt = await svc.rollback_to_version(organization_id=org_id, prompt_id=prompt_id, version=version)
    await db.commit()
    return success(svc.to_dict(prompt))


@router.post("/prompts/{prompt_id}/approve/{version}", summary="Approve version")
async def approve_version(prompt_id: uuid.UUID, version: int,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PromptRegistryService(db)
    ver = await svc.approve_version(organization_id=org_id, prompt_id=prompt_id,
                                    version=version, approved_by=user.id)
    await db.commit()
    return success({"version": ver.version, "approval_status": ver.approval_status})


@router.post("/prompts/{prompt_id}/publish", summary="Publish prompt")
async def publish_prompt(prompt_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PromptRegistryService(db)
    prompt = await svc.publish_prompt(organization_id=org_id, prompt_id=prompt_id)
    await db.commit()
    return success(svc.to_dict(prompt))


@router.post("/prompts/{prompt_id}/compare", summary="Compare versions")
async def compare_versions(prompt_id: uuid.UUID, version_a: int = Query(...),
                            version_b: int = Query(...),
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PromptRegistryService(db)
    result = await svc.compare_versions(organization_id=org_id, prompt_id=prompt_id,
                                        version_a=version_a, version_b=version_b)
    return success(result)


# ===== Observability =====

@router.get("/observatory/dashboard", summary="AI observatory dashboard")
async def observatory_dashboard(days: int = Query(7, ge=1, le=90),
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AIObservatoryService(db)
    return success(await svc.get_observatory_dashboard(organization_id=org_id, days=days))


@router.get("/observatory/requests", summary="List LLM requests")
async def list_llm_requests(agent_id: str | None = Query(None),
                            status_filter: str | None = Query(None, alias="status"),
                            skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AIObservatoryService(db)
    requests, total = await svc.list_requests(organization_id=org_id, agent_id=agent_id,
                                               status=status_filter, skip=skip, limit=limit)
    return paginated(requests, total=total, skip=skip, limit=limit)


@router.get("/observatory/traces/{trace_id}", summary="Get trace")
async def get_trace(trace_id: str, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AIObservatoryService(db)
    return success(await svc.get_trace(organization_id=org_id, trace_id=trace_id))


# ===== Guardrails =====

@router.post("/guardrails/check-input", summary="Check input safety")
async def check_input(request: CheckInputRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    engine = GuardrailEngine(db)
    result = engine.check_input(request.text, max_tokens=request.max_tokens)
    # Log the event
    await engine.log_event(
        organization_id=org_id, guardrail_type="input_check", direction="input",
        input_text=request.text[:1000], action=result["action"],
        reason=str(result["issues"]), severity="critical" if not result["is_safe"] else "info")
    await db.commit()
    return success(result)


@router.post("/guardrails/check-output", summary="Check output safety")
async def check_output(request: CheckOutputRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    engine = GuardrailEngine(db)
    result = engine.check_output(request.output, context=request.context,
                                  citations=request.citations, expected_json=request.expected_json)
    await engine.log_event(
        organization_id=org_id, guardrail_type="output_check", direction="output",
        output=request.output[:1000], action=result["action"],
        reason=str(result["issues"]), severity="critical" if not result["is_safe"] else "info")
    await db.commit()
    return success(result)


@router.get("/guardrails/events", summary="List guardrail events")
async def list_guardrail_events(guardrail_type: str | None = Query(None),
                                skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    engine = GuardrailEngine(db)
    events, total = await engine.list_events(organization_id=org_id, guardrail_type=guardrail_type,
                                             skip=skip, limit=limit)
    return paginated(events, total=total, skip=skip, limit=limit)


# ===== Confidence Engine =====

@router.post("/confidence/compute", summary="Compute confidence scores")
async def compute_confidence(request: ComputeScoresRequest,
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    return success(ConfidenceEngine.compute_scores(
        output=request.output, citations=request.citations, context=request.context,
        latency_ms=request.latency_ms, guardrail_issues=request.guardrail_issues))


# ===== Model Router =====

@router.post("/model-router/route", summary="Route to best model")
async def route_model(request: RouteModelRequest,
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    return success(ModelRouter.route(
        strategy=request.strategy, required_capability=request.required_capability,
        max_cost_per_1k=request.max_cost_per_1k, max_latency_ms=request.max_latency_ms))


@router.get("/model-router/models", summary="List registered models")
async def list_models(user: CurrentUser = None, db: DBSession = None) -> dict:
    return success(ModelRouter.list_models())


# ===== Evaluation =====

@router.post("/evaluation/datasets", status_code=status.HTTP_201_CREATED, summary="Create dataset")
async def create_dataset(request: CreateDatasetRequest, response: Response,
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EvaluationFrameworkService(db)
    dataset = await svc.create_dataset(
        organization_id=org_id, created_by=user.id, name=request.name,
        dataset_type=request.dataset_type, description=request.description,
        samples=request.samples, tags=request.tags)
    await db.commit()
    return created({"id": str(dataset.id), "name": dataset.name,
                    "dataset_type": dataset.dataset_type, "total_samples": dataset.total_samples},
                   response=response)


@router.get("/evaluation/datasets", summary="List datasets")
async def list_datasets(dataset_type: str | None = Query(None),
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EvaluationFrameworkService(db)
    return success(await svc.list_datasets(organization_id=org_id, dataset_type=dataset_type))


@router.post("/evaluation/runs", status_code=status.HTTP_201_CREATED, summary="Create eval run")
async def create_eval_run(request: CreateEvalRunRequest, response: Response,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EvaluationFrameworkService(db)
    run = await svc.create_eval_run(
        organization_id=org_id, created_by=user.id, name=request.name,
        eval_type=request.eval_type, prompt_id=request.prompt_id,
        agent_id=request.agent_id, model=request.model, dataset_id=request.dataset_id)
    await db.commit()
    return created({"id": str(run.id), "name": run.name, "status": run.status}, response=response)


@router.get("/evaluation/runs", summary="List eval runs")
async def list_eval_runs(skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EvaluationFrameworkService(db)
    runs, total = await svc.list_eval_runs(organization_id=org_id, skip=skip, limit=limit)
    return paginated(runs, total=total, skip=skip, limit=limit)


@router.post("/evaluation/compute-metrics", summary="Compute metrics for a sample")
async def compute_metrics(request: ComputeMetricsRequest,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    return success(EvaluationFrameworkService.compute_metrics(
        question=request.question, answer=request.answer, expected=request.expected,
        context=request.context, citations=request.citations,
        latency_ms=request.latency_ms, cost_cents=request.cost_cents))


# ===== Cost Analytics =====

@router.get("/cost/report", summary="AI cost report")
async def cost_report(days: int = Query(30, ge=1, le=365),
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = CostAnalyticsService(db)
    return success(await svc.get_cost_report(organization_id=org_id, days=days))

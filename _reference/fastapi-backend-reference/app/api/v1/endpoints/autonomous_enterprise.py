"""Autonomous Enterprise OS API — digital twins, simulations, knowledge graph, decisions, predictions, optimizations, memory, recommendations, executions, approvals, executive copilot."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, paginated, success
from app.services.autonomous_enterprise import (
    ApprovalEngine,
    DecisionEngine,
    DigitalTwinService,
    ExecutiveCopilotService,
    ExecutionService,
    KnowledgeGraphService,
    MemoryService,
    OPTIMIZATION_TYPES,
    ORG_MEMORY_TYPES,
    PREDICTION_TYPES,
    RecommendationService,
    SimulationEngine,
    OptimizationService,
    PredictionService,
    SIMULATION_TYPES,
    TWIN_TYPES,
)
from app.services.common import resolve_org_id

router = APIRouter()


# ====================================================================
# Schemas
# ====================================================================

class CreateTwinRequest(BaseModel):
    twin_type: str
    entity_id: str
    name: str
    description: str | None = None
    properties: dict = Field(default_factory=dict)
    state: dict = Field(default_factory=dict)
    metrics: dict = Field(default_factory=dict)
    snapshot_frequency_minutes: int = 60
    parent_twin_id: uuid.UUID | None = None


class UpdateTwinStateRequest(BaseModel):
    state: dict | None = None
    metrics: dict | None = None
    health_score: float | None = None
    risk_score: float | None = None
    anomaly_score: float | None = None
    trigger_snapshot: bool = True


class CreateSimulationRequest(BaseModel):
    name: str
    simulation_type: str
    description: str | None = None
    target_twin_id: uuid.UUID | None = None
    input_params: dict = Field(default_factory=dict)
    assumptions: list = Field(default_factory=list)
    constraints: list = Field(default_factory=list)
    time_horizon_days: int = 30
    time_step_days: int = 1
    monte_carlo_runs: int = 1


class CreatePlanningSessionRequest(BaseModel):
    name: str
    goal: str
    goal_type: str
    target_metric: str | None = None
    target_value: float | None = None
    current_value: float | None = None
    time_horizon_days: int = 90
    constraints: list = Field(default_factory=list)
    assumptions: list = Field(default_factory=list)
    priority: int = 5


class CreateDecisionRequest(BaseModel):
    title: str
    description: str | None = None
    decision_type: str
    category: str | None = None
    proposed_by: str = "ai"
    options: list[dict]
    related_simulation_id: uuid.UUID | None = None
    related_planning_session_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)


class ApproveDecisionRequest(BaseModel):
    notes: str | None = None


class ReviewDecisionRequest(BaseModel):
    outcome: str  # success/partial/failed
    actual_impact: dict | None = None


class SelectScenarioRequest(BaseModel):
    scenario_id: str


class PredictRequest(BaseModel):
    prediction_type: str
    historical_data: list[dict] | None = None
    horizon_days: int = 30
    model_slug: str | None = None
    target_entity_type: str | None = None
    target_entity_id: str | None = None
    input_features: dict | None = None


class CreateOptimizationRequest(BaseModel):
    name: str
    optimization_type: str
    objective: str  # minimize/maximize
    objective_metric: str
    target_entity_type: str | None = None
    target_entity_id: str | None = None
    constraints: list = Field(default_factory=list)
    parameters: dict = Field(default_factory=dict)


class CreateRecommendationRequest(BaseModel):
    title: str
    description: str
    category: str
    priority: str = "medium"
    recommendation_type: str
    target_entity_type: str | None = None
    target_entity_id: str | None = None
    proposed_action: dict | None = None
    expected_impact: dict | None = None
    risks: list = Field(default_factory=list)
    prerequisites: list = Field(default_factory=list)
    evidence: list = Field(default_factory=list)
    generated_by: str = "ai"
    agent_id: str | None = None
    related_simulation_id: uuid.UUID | None = None
    related_decision_id: uuid.UUID | None = None
    expires_in_days: int | None = 30


class ReviewRecommendationRequest(BaseModel):
    decision: str  # accepted/rejected
    notes: str | None = None


class CreateExecutionRequest(BaseModel):
    action_type: str
    action_name: str
    action_id: str | None = None
    input: dict = Field(default_factory=dict)
    parameters: dict = Field(default_factory=dict)
    triggered_by: str = "human"
    risk_level: str = "low"
    cost_cents: int = 0
    can_rollback: bool = False
    safety_checks: list = Field(default_factory=list)
    related_decision_id: uuid.UUID | None = None
    related_recommendation_id: uuid.UUID | None = None
    related_planning_session_id: uuid.UUID | None = None


class CompleteExecutionRequest(BaseModel):
    output: dict | None = None
    error: str | None = None


class CreateApprovalRuleRequest(BaseModel):
    name: str
    action_type: str
    conditions: list = Field(default_factory=list)
    auto_approve: bool = False
    auto_reject: bool = False
    max_risk_level: str | None = None
    max_cost_cents: int | None = None
    required_approvers: list = Field(default_factory=list)
    approval_timeout_minutes: int = 60
    fallback_action: str = "reject"
    priority: int = 100
    description: str | None = None


class EvaluateApprovalRequest(BaseModel):
    action_type: str
    risk_level: str = "low"
    cost_cents: int = 0
    context: dict = Field(default_factory=dict)


class StoreAgentMemoryRequest(BaseModel):
    agent_id: str
    memory_type: str
    content: str
    summary: str | None = None
    embedding: list | None = None
    metadata: dict | None = None
    importance_score: float = 0.5
    expires_in_days: int | None = None


class StoreOrgMemoryRequest(BaseModel):
    memory_type: str
    title: str
    content: str
    source_type: str | None = None
    source_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict | None = None
    importance_score: float = 0.5
    confidence_score: float = 1.0
    expires_in_days: int | None = None


class CopilotAskRequest(BaseModel):
    question_type: str
    question: str | None = None
    context: dict = Field(default_factory=dict)


class UpsertBusinessNodeRequest(BaseModel):
    node_type: str
    node_id: str
    name: str
    properties: dict = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class AddBusinessEdgeRequest(BaseModel):
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    edge_type: str
    weight: float = 1.0
    properties: dict = Field(default_factory=dict)
    is_directed: bool = True


class UpsertKgEntityRequest(BaseModel):
    entity_type: str
    entity_text: str
    canonical_id: str | None = None
    properties: dict = Field(default_factory=dict)
    source_document_id: str | None = None
    confidence_score: float = 1.0


class AddKgRelationRequest(BaseModel):
    source_entity_id: uuid.UUID
    target_entity_id: uuid.UUID
    relation_type: str
    properties: dict = Field(default_factory=dict)
    confidence_score: float = 1.0
    source_document_id: str | None = None


class TraverseGraphRequest(BaseModel):
    start_node_id: uuid.UUID
    max_depth: int = 3
    edge_types: list[str] | None = None


# ====================================================================
# Digital Twin endpoints
# ====================================================================

@router.get("/digital-twins/types", summary="List supported twin types")
async def list_twin_types() -> dict:
    return success({"types": sorted(TWIN_TYPES)})


@router.post("/digital-twins", status_code=status.HTTP_201_CREATED, summary="Create digital twin")
async def create_twin(request: CreateTwinRequest, response: Response,
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DigitalTwinService(db)
    twin = await svc.create_twin(
        organization_id=org_id, twin_type=request.twin_type, entity_id=request.entity_id,
        name=request.name, description=request.description, properties=request.properties,
        state=request.state, metrics=request.metrics,
        snapshot_frequency_minutes=request.snapshot_frequency_minutes,
        parent_twin_id=request.parent_twin_id, created_by=str(user.id))
    await db.commit()
    return created(svc.to_dict(twin), response=response)


@router.get("/digital-twins", summary="List digital twins")
async def list_twins(twin_type: str | None = Query(None),
                      skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DigitalTwinService(db)
    twins, total = await svc.list_twins(organization_id=org_id, twin_type=twin_type,
                                          skip=skip, limit=limit)
    return paginated([svc.to_dict(t) for t in twins], total=total, skip=skip, limit=limit)


@router.get("/digital-twins/{twin_id}", summary="Get digital twin")
async def get_twin(twin_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DigitalTwinService(db)
    twin = await svc.get_twin(twin_id=twin_id, organization_id=org_id)
    return success(svc.to_dict(twin))


@router.patch("/digital-twins/{twin_id}", summary="Update twin state")
async def update_twin_state(twin_id: uuid.UUID, request: UpdateTwinStateRequest,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DigitalTwinService(db)
    twin = await svc.update_twin_state(
        twin_id=twin_id, organization_id=org_id, state=request.state,
        metrics=request.metrics, health_score=request.health_score,
        risk_score=request.risk_score, anomaly_score=request.anomaly_score,
        trigger_snapshot=request.trigger_snapshot)
    await db.commit()
    return success(svc.to_dict(twin))


@router.post("/digital-twins/{twin_id}/snapshot", summary="Capture twin snapshot")
async def snapshot_twin(twin_id: uuid.UUID, trigger_reason: str = "manual",
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DigitalTwinService(db)
    snapshot = await svc.snapshot_twin(twin_id=twin_id, organization_id=org_id,
                                          trigger_reason=trigger_reason)
    await db.commit()
    return success({"id": str(snapshot.id), "twin_id": str(twin_id),
                    "trigger_reason": snapshot.trigger_reason,
                    "captured_at": snapshot.captured_at.isoformat() if snapshot.captured_at else None})


@router.get("/digital-twins/{twin_id}/snapshots", summary="List twin snapshots")
async def list_twin_snapshots(twin_id: uuid.UUID, limit: int = Query(100, ge=1, le=1000),
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DigitalTwinService(db)
    snapshots = await svc.list_snapshots(twin_id=twin_id, organization_id=org_id, limit=limit)
    return success([{"id": str(s.id), "state": s.state, "metrics": s.metrics,
                     "health_score": s.health_score, "risk_score": s.risk_score,
                     "anomaly_score": s.anomaly_score, "trigger_reason": s.trigger_reason,
                     "captured_at": s.captured_at.isoformat() if s.captured_at else None}
                    for s in snapshots])


@router.get("/digital-twins/{twin_id}/lineage", summary="Get twin lineage")
async def get_twin_lineage(twin_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DigitalTwinService(db)
    return success(await svc.get_twin_lineage(twin_id=twin_id, organization_id=org_id))


# ====================================================================
# Simulation endpoints
# ====================================================================

@router.get("/simulations/types", summary="List simulation types")
async def list_simulation_types() -> dict:
    return success({"types": sorted(SIMULATION_TYPES)})


@router.post("/simulations", status_code=status.HTTP_201_CREATED, summary="Create simulation")
async def create_simulation(request: CreateSimulationRequest, response: Response,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = SimulationEngine(db)
    sim = await svc.create_simulation(
        organization_id=org_id, name=request.name, simulation_type=request.simulation_type,
        description=request.description, target_twin_id=request.target_twin_id,
        input_params=request.input_params, assumptions=request.assumptions,
        constraints=request.constraints, time_horizon_days=request.time_horizon_days,
        time_step_days=request.time_step_days, monte_carlo_runs=request.monte_carlo_runs,
        created_by=str(user.id))
    await db.commit()
    return created(svc.simulation_to_dict(sim), response=response)


@router.post("/simulations/{simulation_id}/run", summary="Run simulation")
async def run_simulation(simulation_id: uuid.UUID,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = SimulationEngine(db)
    result = await svc.run_simulation(simulation_id=simulation_id, organization_id=org_id)
    await db.commit()
    return success(result)


@router.get("/simulations", summary="List simulations")
async def list_simulations(simulation_type: str | None = Query(None),
                            status_filter: str | None = Query(None, alias="status"),
                            skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = SimulationEngine(db)
    sims, total = await svc.list_simulations(organization_id=org_id,
                                                simulation_type=simulation_type,
                                                status=status_filter, skip=skip, limit=limit)
    return paginated([svc.simulation_to_dict(s) for s in sims], total=total, skip=skip, limit=limit)


@router.get("/simulations/{simulation_id}", summary="Get simulation")
async def get_simulation(simulation_id: uuid.UUID,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = SimulationEngine(db)
    sim = await svc.get_simulation(simulation_id=simulation_id, organization_id=org_id)
    return success(svc.simulation_to_dict(sim))


@router.get("/simulations/{simulation_id}/results", summary="List simulation results")
async def list_simulation_results(simulation_id: uuid.UUID,
                                    scenario_branch: str | None = Query(None),
                                    skip: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=5000),
                                    user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = SimulationEngine(db)
    results, total = await svc.list_results(simulation_id=simulation_id,
                                              organization_id=org_id,
                                              scenario_branch=scenario_branch,
                                              skip=skip, limit=limit)
    return paginated([{"id": str(r.id), "step_index": r.step_index,
                       "step_date": r.step_date.isoformat() if r.step_date else None,
                       "state": r.state, "metrics": r.metrics, "events": r.events,
                       "scenario_branch": r.scenario_branch,
                       "probability": r.probability,
                       "confidence_interval_low": r.confidence_interval_low,
                       "confidence_interval_high": r.confidence_interval_high}
                      for r in results], total=total, skip=skip, limit=limit)


@router.get("/simulations/{simulation_id}/compare", summary="Compare simulation scenarios")
async def compare_scenarios(simulation_id: uuid.UUID,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = SimulationEngine(db)
    return success(await svc.compare_scenarios(simulation_id=simulation_id,
                                                 organization_id=org_id))


# ====================================================================
# Planning + Decision endpoints
# ====================================================================

@router.post("/planning/sessions", status_code=status.HTTP_201_CREATED, summary="Create planning session")
async def create_planning_session(request: CreatePlanningSessionRequest, response: Response,
                                    user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    session = await svc.create_planning_session(
        organization_id=org_id, name=request.name, goal=request.goal,
        goal_type=request.goal_type, target_metric=request.target_metric,
        target_value=request.target_value, current_value=request.current_value,
        time_horizon_days=request.time_horizon_days, constraints=request.constraints,
        assumptions=request.assumptions, priority=request.priority, created_by=str(user.id))
    await db.commit()
    return created(svc.session_to_dict(session), response=response)


@router.post("/planning/sessions/{session_id}/generate", summary="Auto-generate plan")
async def generate_plan(session_id: uuid.UUID,
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    session = await svc.generate_plan(session_id=session_id, organization_id=org_id)
    await db.commit()
    return success(svc.session_to_dict(session))


@router.get("/planning/sessions", summary="List planning sessions")
async def list_planning_sessions(status_filter: str | None = Query(None, alias="status"),
                                   skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                                   user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    sessions, total = await svc.list_planning_sessions(organization_id=org_id,
                                                          status=status_filter, skip=skip, limit=limit)
    return paginated([svc.session_to_dict(s) for s in sessions], total=total, skip=skip, limit=limit)


@router.get("/planning/sessions/{session_id}/compare", summary="Compare planning scenarios")
async def compare_planning_scenarios(session_id: uuid.UUID,
                                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    return success(await svc.compare_scenarios(session_id=session_id, organization_id=org_id))


@router.post("/planning/sessions/{session_id}/select", summary="Select planning scenario")
async def select_scenario(session_id: uuid.UUID, request: SelectScenarioRequest,
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    session = await svc.select_scenario(session_id=session_id, organization_id=org_id,
                                          scenario_id=request.scenario_id)
    await db.commit()
    return success(svc.session_to_dict(session))


@router.post("/decisions", status_code=status.HTTP_201_CREATED, summary="Create decision")
async def create_decision(request: CreateDecisionRequest, response: Response,
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    decision = await svc.create_decision(
        organization_id=org_id, title=request.title, description=request.description,
        decision_type=request.decision_type, category=request.category,
        proposed_by=request.proposed_by, proposed_by_id=str(user.id),
        options=request.options, related_simulation_id=request.related_simulation_id,
        related_planning_session_id=request.related_planning_session_id, tags=request.tags)
    await db.commit()
    return created(svc.decision_to_dict(decision), response=response)


@router.post("/decisions/{decision_id}/approve", summary="Approve decision")
async def approve_decision(decision_id: uuid.UUID, request: ApproveDecisionRequest,
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    decision = await svc.approve_decision(decision_id=decision_id, organization_id=org_id,
                                            approved_by=str(user.id), notes=request.notes)
    await db.commit()
    return success(svc.decision_to_dict(decision))


@router.post("/decisions/{decision_id}/implement", summary="Implement decision")
async def implement_decision(decision_id: uuid.UUID,
                               user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    decision = await svc.implement_decision(decision_id=decision_id, organization_id=org_id)
    await db.commit()
    return success(svc.decision_to_dict(decision))


@router.post("/decisions/{decision_id}/review", summary="Review decision outcome")
async def review_decision(decision_id: uuid.UUID, request: ReviewDecisionRequest,
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    decision = await svc.review_decision(decision_id=decision_id, organization_id=org_id,
                                           outcome=request.outcome,
                                           actual_impact=request.actual_impact)
    await db.commit()
    return success(svc.decision_to_dict(decision))


@router.get("/decisions", summary="List decisions")
async def list_decisions(status_filter: str | None = Query(None, alias="status"),
                           decision_type: str | None = Query(None),
                           skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DecisionEngine(db)
    decisions, total = await svc.list_decisions(organization_id=org_id, status=status_filter,
                                                  decision_type=decision_type, skip=skip, limit=limit)
    return paginated([svc.decision_to_dict(d) for d in decisions], total=total, skip=skip, limit=limit)


# ====================================================================
# Prediction endpoints
# ====================================================================

@router.get("/predictions/types", summary="List prediction types")
async def list_prediction_types() -> dict:
    return success({"types": sorted(PREDICTION_TYPES)})


@router.post("/predictions", status_code=status.HTTP_201_CREATED, summary="Generate prediction")
async def generate_prediction(request: PredictRequest, response: Response,
                                 user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PredictionService(db)
    result = await svc.predict(
        organization_id=org_id, prediction_type=request.prediction_type,
        historical_data=request.historical_data, horizon_days=request.horizon_days,
        model_slug=request.model_slug, target_entity_type=request.target_entity_type,
        target_entity_id=request.target_entity_id, input_features=request.input_features)
    await db.commit()
    return created(svc.prediction_to_dict(result), response=response)


@router.get("/predictions", summary="List predictions")
async def list_predictions(prediction_type: str | None = Query(None),
                             skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PredictionService(db)
    predictions, total = await svc.list_predictions(organization_id=org_id,
                                                       prediction_type=prediction_type,
                                                       skip=skip, limit=limit)
    return paginated([svc.prediction_to_dict(p) for p in predictions], total=total, skip=skip, limit=limit)


# ====================================================================
# Optimization endpoints
# ====================================================================

@router.get("/optimizations/types", summary="List optimization types")
async def list_optimization_types() -> dict:
    return success({"types": sorted(OPTIMIZATION_TYPES)})


@router.post("/optimizations", status_code=status.HTTP_201_CREATED, summary="Create optimization run")
async def create_optimization(request: CreateOptimizationRequest, response: Response,
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = OptimizationService(db)
    run = await svc.create_run(
        organization_id=org_id, name=request.name,
        optimization_type=request.optimization_type, objective=request.objective,
        objective_metric=request.objective_metric,
        target_entity_type=request.target_entity_type,
        target_entity_id=request.target_entity_id,
        constraints=request.constraints, parameters=request.parameters,
        created_by=str(user.id))
    await db.commit()
    return created(svc.run_to_dict(run), response=response)


@router.post("/optimizations/{run_id}/run", summary="Run optimization")
async def run_optimization(run_id: uuid.UUID,
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = OptimizationService(db)
    result = await svc.run_optimization(run_id=run_id, organization_id=org_id)
    await db.commit()
    return success(result)


@router.post("/optimizations/{run_id}/apply", summary="Apply optimization recommendations")
async def apply_optimization(run_id: uuid.UUID,
                               user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = OptimizationService(db)
    run = await svc.apply_recommendations(run_id=run_id, organization_id=org_id,
                                            applied_by=str(user.id))
    await db.commit()
    return success(svc.run_to_dict(run))


@router.get("/optimizations", summary="List optimization runs")
async def list_optimizations(optimization_type: str | None = Query(None),
                               status_filter: str | None = Query(None, alias="status"),
                               skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                               user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = OptimizationService(db)
    runs, total = await svc.list_runs(organization_id=org_id,
                                        optimization_type=optimization_type,
                                        status=status_filter, skip=skip, limit=limit)
    return paginated([svc.run_to_dict(r) for r in runs], total=total, skip=skip, limit=limit)


# ====================================================================
# Knowledge Graph endpoints
# ====================================================================

@router.post("/knowledge-graph/business/nodes", summary="Upsert business node")
async def upsert_business_node(request: UpsertBusinessNodeRequest,
                                 user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = KnowledgeGraphService(db)
    node = await svc.upsert_business_node(organization_id=org_id, node_type=request.node_type,
                                            node_id=request.node_id, name=request.name,
                                            properties=request.properties, tags=request.tags)
    await db.commit()
    return success({"id": str(node.id), "node_type": node.node_type,
                    "node_id": node.node_id, "name": node.name})


@router.get("/knowledge-graph/business/nodes", summary="List business nodes")
async def list_business_nodes(node_type: str | None = Query(None),
                                skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = KnowledgeGraphService(db)
    nodes, total = await svc.list_business_nodes(organization_id=org_id, node_type=node_type,
                                                    skip=skip, limit=limit)
    return paginated([{"id": str(n.id), "node_type": n.node_type, "node_id": n.node_id,
                       "name": n.name, "properties": n.properties, "tags": n.tags}
                      for n in nodes], total=total, skip=skip, limit=limit)


@router.post("/knowledge-graph/business/edges", status_code=status.HTTP_201_CREATED,
             summary="Add business edge")
async def add_business_edge(request: AddBusinessEdgeRequest, response: Response,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = KnowledgeGraphService(db)
    edge = await svc.add_business_edge(organization_id=org_id,
                                         source_node_id=request.source_node_id,
                                         target_node_id=request.target_node_id,
                                         edge_type=request.edge_type, weight=request.weight,
                                         properties=request.properties,
                                         is_directed=request.is_directed)
    await db.commit()
    return created({"id": str(edge.id), "edge_type": edge.edge_type,
                    "source": str(edge.source_node_id), "target": str(edge.target_node_id)},
                   response=response)


@router.post("/knowledge-graph/business/traverse", summary="Traverse business graph (BFS)")
async def traverse_business_graph(request: TraverseGraphRequest,
                                    user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = KnowledgeGraphService(db)
    return success(await svc.traverse_business_graph(
        organization_id=org_id, start_node_id=request.start_node_id,
        max_depth=request.max_depth, edge_types=request.edge_types))


@router.post("/knowledge-graph/entities", summary="Upsert KG entity")
async def upsert_kg_entity(request: UpsertKgEntityRequest,
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = KnowledgeGraphService(db)
    entity = await svc.upsert_kg_entity(organization_id=org_id, entity_type=request.entity_type,
                                          entity_text=request.entity_text,
                                          canonical_id=request.canonical_id,
                                          properties=request.properties,
                                          source_document_id=request.source_document_id,
                                          confidence_score=request.confidence_score)
    await db.commit()
    return success({"id": str(entity.id), "entity_type": entity.entity_type,
                    "entity_text": entity.entity_text, "mention_count": entity.mention_count})


@router.get("/knowledge-graph/entities", summary="List KG entities")
async def list_kg_entities(entity_type: str | None = Query(None),
                            search: str | None = Query(None),
                            skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = KnowledgeGraphService(db)
    entities, total = await svc.list_kg_entities(organization_id=org_id, entity_type=entity_type,
                                                    search=search, skip=skip, limit=limit)
    return paginated([{"id": str(e.id), "entity_type": e.entity_type,
                       "entity_text": e.entity_text, "canonical_id": e.canonical_id,
                       "properties": e.properties, "confidence_score": e.confidence_score,
                       "mention_count": e.mention_count}
                      for e in entities], total=total, skip=skip, limit=limit)


@router.post("/knowledge-graph/relations", status_code=status.HTTP_201_CREATED,
             summary="Add KG relation")
async def add_kg_relation(request: AddKgRelationRequest, response: Response,
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = KnowledgeGraphService(db)
    relation = await svc.add_kg_relation(organization_id=org_id,
                                            source_entity_id=request.source_entity_id,
                                            target_entity_id=request.target_entity_id,
                                            relation_type=request.relation_type,
                                            properties=request.properties,
                                            confidence_score=request.confidence_score,
                                            source_document_id=request.source_document_id)
    await db.commit()
    return created({"id": str(relation.id), "relation_type": relation.relation_type,
                    "source": str(relation.source_entity_id),
                    "target": str(relation.target_entity_id)}, response=response)


@router.get("/knowledge-graph/entities/{entity_id}/relations", summary="Get entity relations")
async def get_entity_relations(entity_id: uuid.UUID,
                                 user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = KnowledgeGraphService(db)
    return success(await svc.find_entity_relations(entity_id=entity_id, organization_id=org_id))


# ====================================================================
# Memory endpoints
# ====================================================================

@router.post("/memory/agent", status_code=status.HTTP_201_CREATED, summary="Store agent memory")
async def store_agent_memory(request: StoreAgentMemoryRequest, response: Response,
                               user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MemoryService(db)
    from datetime import timedelta
    expires_at = None
    if request.expires_in_days:
        from datetime import datetime, UTC
        expires_at = datetime.now(UTC) + timedelta(days=request.expires_in_days)
    mem = await svc.store_agent_memory(
        organization_id=org_id, agent_id=request.agent_id,
        memory_type=request.memory_type, content=request.content,
        summary=request.summary, embedding=request.embedding, metadata=request.metadata,
        importance_score=request.importance_score, expires_at=expires_at)
    await db.commit()
    return created({"id": str(mem.id), "agent_id": mem.agent_id,
                    "memory_type": mem.memory_type}, response=response)


@router.get("/memory/agent/{agent_id}", summary="Retrieve agent memory")
async def retrieve_agent_memory(agent_id: str,
                                  memory_type: str | None = Query(None),
                                  limit: int = Query(10, ge=1, le=100),
                                  min_importance: float = Query(0.0, ge=0.0, le=1.0),
                                  user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MemoryService(db)
    memories = await svc.retrieve_agent_memory(
        organization_id=org_id, agent_id=agent_id, memory_type=memory_type,
        limit=limit, min_importance=min_importance)
    await db.commit()
    return success([{"id": str(m.id), "memory_type": m.memory_type,
                     "content": m.content, "summary": m.summary,
                     "importance_score": m.importance_score,
                     "access_count": m.access_count,
                     "created_at": m.created_at.isoformat() if m.created_at else None}
                    for m in memories])


@router.post("/memory/organization", status_code=status.HTTP_201_CREATED, summary="Store org memory")
async def store_org_memory(request: StoreOrgMemoryRequest, response: Response,
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MemoryService(db)
    from datetime import datetime, timedelta, UTC
    expires_at = None
    if request.expires_in_days:
        expires_at = datetime.now(UTC) + timedelta(days=request.expires_in_days)
    mem = await svc.store_organization_memory(
        organization_id=org_id, memory_type=request.memory_type,
        title=request.title, content=request.content, source_type=request.source_type,
        source_id=request.source_id, tags=request.tags, metadata=request.metadata,
        importance_score=request.importance_score, confidence_score=request.confidence_score,
        created_by=str(user.id), expires_at=expires_at)
    await db.commit()
    return created({"id": str(mem.id), "memory_type": mem.memory_type, "title": mem.title},
                   response=response)


@router.get("/memory/organization", summary="Retrieve org memory")
async def retrieve_org_memory(memory_type: str | None = Query(None),
                                limit: int = Query(20, ge=1, le=200),
                                min_importance: float = Query(0.0, ge=0.0, le=1.0),
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MemoryService(db)
    memories = await svc.retrieve_organization_memory(
        organization_id=org_id, memory_type=memory_type, limit=limit,
        min_importance=min_importance)
    return success([{"id": str(m.id), "memory_type": m.memory_type, "title": m.title,
                     "content": m.content, "tags": m.tags,
                     "importance_score": m.importance_score,
                     "confidence_score": m.confidence_score,
                     "source_type": m.source_type,
                     "created_at": m.created_at.isoformat() if m.created_at else None}
                    for m in memories])


@router.post("/memory/organization/learn-from-decision/{decision_id}",
             status_code=status.HTTP_201_CREATED,
             summary="Auto-generate learning memory from reviewed decision")
async def learn_from_decision(decision_id: uuid.UUID, response: Response,
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MemoryService(db)
    mem = await svc.learn_from_decision(decision_id=decision_id, organization_id=org_id)
    await db.commit()
    return created({"id": str(mem.id), "title": mem.title,
                    "memory_type": mem.memory_type}, response=response)


# ====================================================================
# Recommendation endpoints
# ====================================================================

@router.post("/recommendations", status_code=status.HTTP_201_CREATED, summary="Create recommendation")
async def create_recommendation(request: CreateRecommendationRequest, response: Response,
                                  user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = RecommendationService(db)
    rec = await svc.create_recommendation(
        organization_id=org_id, title=request.title, description=request.description,
        category=request.category, priority=request.priority,
        recommendation_type=request.recommendation_type,
        target_entity_type=request.target_entity_type, target_entity_id=request.target_entity_id,
        proposed_action=request.proposed_action, expected_impact=request.expected_impact,
        risks=request.risks, prerequisites=request.prerequisites,
        evidence=request.evidence, generated_by=request.generated_by,
        agent_id=request.agent_id, related_simulation_id=request.related_simulation_id,
        related_decision_id=request.related_decision_id, expires_in_days=request.expires_in_days)
    await db.commit()
    return created(svc.to_dict(rec), response=response)


@router.get("/recommendations", summary="List recommendations")
async def list_recommendations(status_filter: str | None = Query(None, alias="status"),
                                 category: str | None = Query(None),
                                 priority: str | None = Query(None),
                                 skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                                 user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = RecommendationService(db)
    recs, total = await svc.list_recommendations(organization_id=org_id, status=status_filter,
                                                    category=category, priority=priority,
                                                    skip=skip, limit=limit)
    return paginated([svc.to_dict(r) for r in recs], total=total, skip=skip, limit=limit)


@router.post("/recommendations/{rec_id}/review", summary="Review recommendation")
async def review_recommendation(rec_id: uuid.UUID, request: ReviewRecommendationRequest,
                                  user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = RecommendationService(db)
    rec = await svc.review_recommendation(rec_id=rec_id, organization_id=org_id,
                                            decision=request.decision, reviewed_by=str(user.id),
                                            notes=request.notes)
    await db.commit()
    return success(svc.to_dict(rec))


@router.post("/recommendations/{rec_id}/implement", summary="Implement recommendation")
async def implement_recommendation(rec_id: uuid.UUID,
                                     user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = RecommendationService(db)
    rec = await svc.implement_recommendation(rec_id=rec_id, organization_id=org_id)
    await db.commit()
    return success(svc.to_dict(rec))


# ====================================================================
# Approval + Execution endpoints
# ====================================================================

@router.post("/approvals/rules", status_code=status.HTTP_201_CREATED, summary="Create approval rule")
async def create_approval_rule(request: CreateApprovalRuleRequest, response: Response,
                                 user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ApprovalEngine(db)
    rule = await svc.create_rule(
        organization_id=org_id, name=request.name, action_type=request.action_type,
        conditions=request.conditions, auto_approve=request.auto_approve,
        auto_reject=request.auto_reject, max_risk_level=request.max_risk_level,
        max_cost_cents=request.max_cost_cents, required_approvers=request.required_approvers,
        approval_timeout_minutes=request.approval_timeout_minutes,
        fallback_action=request.fallback_action, priority=request.priority,
        description=request.description, created_by=str(user.id))
    await db.commit()
    return created({"id": str(rule.id), "name": rule.name,
                    "action_type": rule.action_type, "auto_approve": rule.auto_approve,
                    "auto_reject": rule.auto_reject, "priority": rule.priority}, response=response)


@router.get("/approvals/rules", summary="List approval rules")
async def list_approval_rules(action_type: str | None = Query(None),
                                skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ApprovalEngine(db)
    rules, total = await svc.list_rules(organization_id=org_id, action_type=action_type,
                                          skip=skip, limit=limit)
    return paginated([{"id": str(r.id), "name": r.name, "action_type": r.action_type,
                       "auto_approve": r.auto_approve, "auto_reject": r.auto_reject,
                       "max_risk_level": r.max_risk_level, "max_cost_cents": r.max_cost_cents,
                       "priority": r.priority, "is_active": r.is_active}
                      for r in rules], total=total, skip=skip, limit=limit)


@router.post("/approvals/evaluate", summary="Evaluate approval for an action")
async def evaluate_approval(request: EvaluateApprovalRequest,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ApprovalEngine(db)
    return success(await svc.evaluate(organization_id=org_id,
                                         action_type=request.action_type,
                                         risk_level=request.risk_level,
                                         cost_cents=request.cost_cents,
                                         context=request.context))


@router.post("/executions", status_code=status.HTTP_201_CREATED, summary="Create execution")
async def create_execution(request: CreateExecutionRequest, response: Response,
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ExecutionService(db)
    execution, approval = await svc.create_execution(
        organization_id=org_id, action_type=request.action_type,
        action_name=request.action_name, action_id=request.action_id,
        input=request.input, parameters=request.parameters,
        triggered_by=request.triggered_by, triggered_by_id=str(user.id),
        related_decision_id=request.related_decision_id,
        related_recommendation_id=request.related_recommendation_id,
        related_planning_session_id=request.related_planning_session_id,
        risk_level=request.risk_level, cost_cents=request.cost_cents,
        can_rollback=request.can_rollback, safety_checks=request.safety_checks)
    await db.commit()
    return created({"execution": svc.to_dict(execution), "approval": approval}, response=response)


@router.post("/executions/{execution_id}/safety-checks", summary="Run safety checks")
async def run_safety_checks(execution_id: uuid.UUID,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ExecutionService(db)
    result = await svc.run_safety_checks(execution_id=execution_id, organization_id=org_id)
    await db.commit()
    return success(result)


@router.post("/executions/{execution_id}/start", summary="Start execution")
async def start_execution(execution_id: uuid.UUID,
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ExecutionService(db)
    execution = await svc.start_execution(execution_id=execution_id, organization_id=org_id)
    await db.commit()
    return success(svc.to_dict(execution))


@router.post("/executions/{execution_id}/complete", summary="Complete execution")
async def complete_execution(execution_id: uuid.UUID, request: CompleteExecutionRequest,
                               user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ExecutionService(db)
    execution = await svc.complete_execution(execution_id=execution_id,
                                                organization_id=org_id,
                                                output=request.output, error=request.error)
    await db.commit()
    return success(svc.to_dict(execution))


@router.post("/executions/{execution_id}/rollback", summary="Rollback execution")
async def rollback_execution(execution_id: uuid.UUID,
                               user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ExecutionService(db)
    execution = await svc.rollback_execution(execution_id=execution_id,
                                                organization_id=org_id,
                                                rolled_back_by=str(user.id))
    await db.commit()
    return success(svc.to_dict(execution))


@router.get("/executions", summary="List executions")
async def list_executions(status_filter: str | None = Query(None, alias="status"),
                            action_type: str | None = Query(None),
                            skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ExecutionService(db)
    executions, total = await svc.list_executions(organization_id=org_id, status=status_filter,
                                                     action_type=action_type, skip=skip, limit=limit)
    return paginated([svc.to_dict(e) for e in executions], total=total, skip=skip, limit=limit)


# ====================================================================
# Executive Copilot
# ====================================================================

@router.post("/copilot/ask", summary="Ask the executive copilot")
async def copilot_ask(request: CopilotAskRequest,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ExecutiveCopilotService(db)
    result = await svc.ask(organization_id=org_id, question_type=request.question_type,
                              question=request.question, context=request.context)
    await db.commit()
    return success(result)


@router.get("/copilot/question-types", summary="List supported copilot question types")
async def list_question_types() -> dict:
    return success({"question_types": sorted(ExecutiveCopilotService.QUESTION_TYPES)})

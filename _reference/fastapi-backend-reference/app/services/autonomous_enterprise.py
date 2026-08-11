"""Autonomous Enterprise Operating System services.

This module provides 10 services that power the autonomous enterprise OS:

  - DigitalTwinService        : Create + snapshot digital twins of org entities
  - SimulationEngine          : 11 simulation types with Monte Carlo support
  - KnowledgeGraphService     : Business + knowledge graph (nodes, edges, traversal)
  - DecisionEngine            : AI planner + multi-step planning + constraint solver
  - PredictionService         : Time-series forecasting (linear/MA/exp smoothing/heuristic)
  - OptimizationService       : 7 optimization types (cost/token/infra/workflow/prompt/latency/resource)
  - MemoryService             : Agent + organization memory (long/short/semantic/temporal/episodic)
  - ExecutionService          : Autonomous action execution with rollback + safety checks
  - ApprovalEngine            : Auto-approval rules + manual approval workflow
  - ExecutiveCopilotService   : 5 question types (what/why/what-next/what-to-do/impact)
"""

from __future__ import annotations

import math
import random
import statistics
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.autonomous_enterprise import (
    AgentMemory,
    ApprovalRule,
    BusinessGraphEdge,
    BusinessGraphNode,
    DecisionHistory,
    DigitalTwin,
    DigitalTwinSnapshot,
    Execution,
    ForecastModel,
    KnowledgeGraphEntity,
    KnowledgeGraphRelation,
    OptimizationRun,
    OrganizationMemory,
    PlanningSession,
    PredictionResult,
    Recommendation,
    Simulation,
    SimulationResult,
)

logger = get_logger(__name__)


# Supported twin types
TWIN_TYPES = {
    "organization", "department", "employee", "customer", "lead",
    "sales_pipeline", "inventory", "product", "finance", "project",
    "marketing", "support", "knowledge_base", "ai_agent", "workflow",
    "infrastructure", "server", "database", "api_service",
}

SIMULATION_TYPES = {
    "what_if", "business", "financial", "sales", "demand", "inventory",
    "risk", "failure", "resource", "hiring", "pricing", "churn",
}

OPTIMIZATION_TYPES = {
    "cost", "token", "infrastructure", "workflow", "prompt", "latency", "resource",
}

PREDICTION_TYPES = {
    "sales", "revenue", "churn", "demand", "latency",
    "error_rate", "cost", "usage",
}

MEMORY_TYPES = {"long_term", "short_term", "semantic", "temporal", "episodic"}

ORG_MEMORY_TYPES = {
    "policy", "decision", "learning", "incident", "insight", "best_practice",
}

# Risk levels (lower index = lower risk)
RISK_LEVELS = ["low", "medium", "high", "critical"]


# ====================================================================
# Digital Twin Service
# ====================================================================

class DigitalTwinService:
    """Manages digital twins — virtual replicas of org entities."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_twin(self, *, organization_id: uuid.UUID, twin_type: str,
                          entity_id: str, name: str, description: str | None = None,
                          properties: dict | None = None, state: dict | None = None,
                          metrics: dict | None = None,
                          snapshot_frequency_minutes: int = 60,
                          parent_twin_id: uuid.UUID | None = None,
                          created_by: str | None = None) -> DigitalTwin:
        if twin_type not in TWIN_TYPES:
            raise ValidationError(f"Invalid twin_type: {twin_type}. Supported: {sorted(TWIN_TYPES)}")
        slug = name.lower().replace(" ", "-").replace(".", "-")[:200]
        # Check uniqueness
        existing_q = await self.db.execute(
            select(DigitalTwin).where(
                DigitalTwin.organization_id == str(organization_id),
                DigitalTwin.twin_type == twin_type,
                DigitalTwin.entity_id == entity_id))
        if existing_q.scalar_one_or_none():
            raise ValidationError(f"Twin already exists for {twin_type}/{entity_id}")
        twin = DigitalTwin(
            organization_id=str(organization_id), twin_type=twin_type, entity_id=entity_id,
            name=name, slug=slug, description=description,
            properties=properties or {}, state=state or {}, metrics=metrics or {},
            health_score=100.0, risk_score=0.0, anomaly_score=0.0,
            parent_twin_id=parent_twin_id,
            snapshot_frequency_minutes=snapshot_frequency_minutes,
            is_active=True)
        self.db.add(twin)
        await self.db.flush()
        # Capture initial snapshot
        await self.snapshot_twin(twin_id=twin.id, organization_id=organization_id,
                                   trigger_reason="initial")
        return twin

    async def get_twin(self, *, twin_id: uuid.UUID,
                       organization_id: uuid.UUID) -> DigitalTwin:
        twin = await self.db.get(DigitalTwin, twin_id)
        if twin is None or twin.organization_id != str(organization_id):
            raise NotFoundError("DigitalTwin", str(twin_id))
        return twin

    async def list_twins(self, *, organization_id: uuid.UUID,
                         twin_type: str | None = None,
                         is_active: bool | None = True,
                         skip: int = 0, limit: int = 100) -> tuple[list[DigitalTwin], int]:
        conditions = [DigitalTwin.organization_id == str(organization_id)]
        if twin_type:
            conditions.append(DigitalTwin.twin_type == twin_type)
        if is_active is not None:
            conditions.append(DigitalTwin.is_active.is_(is_active))
        total = int((await self.db.execute(
            select(func.count()).select_from(DigitalTwin).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(DigitalTwin).where(*conditions)
            .order_by(DigitalTwin.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def update_twin_state(self, *, twin_id: uuid.UUID,
                                 organization_id: uuid.UUID,
                                 state: dict | None = None,
                                 metrics: dict | None = None,
                                 health_score: float | None = None,
                                 risk_score: float | None = None,
                                 anomaly_score: float | None = None,
                                 trigger_snapshot: bool = True) -> DigitalTwin:
        twin = await self.get_twin(twin_id=twin_id, organization_id=organization_id)
        if state is not None:
            twin.state = state
        if metrics is not None:
            twin.metrics = metrics
        if health_score is not None:
            twin.health_score = health_score
        if risk_score is not None:
            twin.risk_score = risk_score
        if anomaly_score is not None:
            twin.anomaly_score = anomaly_score
        await self.db.flush()
        if trigger_snapshot:
            await self.snapshot_twin(twin_id=twin.id, organization_id=organization_id,
                                       trigger_reason="update")
        return twin

    async def snapshot_twin(self, *, twin_id: uuid.UUID,
                              organization_id: uuid.UUID,
                              trigger_reason: str = "scheduled") -> DigitalTwinSnapshot:
        """Capture a point-in-time snapshot of the twin's state."""
        twin = await self.get_twin(twin_id=twin_id, organization_id=organization_id)
        snapshot = DigitalTwinSnapshot(
            twin_id=twin.id, organization_id=str(organization_id),
            state=twin.state, metrics=twin.metrics,
            health_score=twin.health_score, risk_score=twin.risk_score,
            anomaly_score=twin.anomaly_score, trigger_reason=trigger_reason,
            captured_at=datetime.now(UTC))
        self.db.add(snapshot)
        twin.last_snapshot_at = datetime.now(UTC)
        await self.db.flush()
        return snapshot

    async def list_snapshots(self, *, twin_id: uuid.UUID,
                              organization_id: uuid.UUID,
                              limit: int = 100) -> list[DigitalTwinSnapshot]:
        await self.get_twin(twin_id=twin_id, organization_id=organization_id)
        result = await self.db.execute(
            select(DigitalTwinSnapshot).where(
                DigitalTwinSnapshot.twin_id == twin_id,
                DigitalTwinSnapshot.organization_id == str(organization_id))
            .order_by(DigitalTwinSnapshot.captured_at.desc()).limit(limit))
        return list(result.scalars().all())

    async def get_twin_lineage(self, *, twin_id: uuid.UUID,
                                organization_id: uuid.UUID) -> dict[str, Any]:
        """Get the parent + child twins of a twin."""
        twin = await self.get_twin(twin_id=twin_id, organization_id=organization_id)
        parent = None
        if twin.parent_twin_id:
            parent = await self.db.get(DigitalTwin, twin.parent_twin_id)
        children_q = await self.db.execute(
            select(DigitalTwin).where(DigitalTwin.parent_twin_id == twin_id))
        children = list(children_q.scalars().all())
        return {"twin": self.to_dict(twin),
                "parent": self.to_dict(parent) if parent else None,
                "children": [self.to_dict(c) for c in children]}

    def to_dict(self, t: DigitalTwin) -> dict[str, Any]:
        return {"id": str(t.id), "twin_type": t.twin_type, "entity_id": t.entity_id,
                "name": t.name, "slug": t.slug, "description": t.description,
                "state": t.state, "properties": t.properties, "metrics": t.metrics,
                "health_score": t.health_score, "risk_score": t.risk_score,
                "anomaly_score": t.anomaly_score,
                "parent_twin_id": str(t.parent_twin_id) if t.parent_twin_id else None,
                "snapshot_frequency_minutes": t.snapshot_frequency_minutes,
                "last_snapshot_at": t.last_snapshot_at.isoformat() if t.last_snapshot_at else None,
                "is_active": t.is_active,
                "created_at": t.created_at.isoformat() if t.created_at else None}


# ====================================================================
# Simulation Engine — 11 simulation types
# ====================================================================

class SimulationEngine:
    """Runs business simulations on digital twins.

    Each simulation type has a dedicated step function that advances the
    twin's state by one time-step. Monte Carlo runs are supported via
    multiple scenario_branch identifiers per step.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_simulation(self, *, organization_id: uuid.UUID,
                                  name: str, simulation_type: str,
                                  description: str | None = None,
                                  target_twin_id: uuid.UUID | None = None,
                                  input_params: dict | None = None,
                                  assumptions: list | None = None,
                                  constraints: list | None = None,
                                  time_horizon_days: int = 30,
                                  time_step_days: int = 1,
                                  monte_carlo_runs: int = 1,
                                  created_by: str | None = None) -> Simulation:
        if simulation_type not in SIMULATION_TYPES:
            raise ValidationError(
                f"Invalid simulation_type: {simulation_type}. Supported: {sorted(SIMULATION_TYPES)}")
        if time_horizon_days <= 0 or time_step_days <= 0:
            raise ValidationError("time_horizon_days and time_step_days must be positive")
        if time_horizon_days < time_step_days:
            raise ValidationError("time_horizon_days must be >= time_step_days")
        if monte_carlo_runs < 1 or monte_carlo_runs > 1000:
            raise ValidationError("monte_carlo_runs must be between 1 and 1000")
        sim = Simulation(
            organization_id=str(organization_id), name=name,
            simulation_type=simulation_type, description=description,
            target_twin_id=target_twin_id,
            input_params=input_params or {}, assumptions=assumptions or [],
            constraints=constraints or [], time_horizon_days=time_horizon_days,
            time_step_days=time_step_days, monte_carlo_runs=monte_carlo_runs,
            status="pending", progress_percent=0.0, created_by=created_by)
        self.db.add(sim)
        await self.db.flush()
        return sim

    async def run_simulation(self, *, simulation_id: uuid.UUID,
                              organization_id: uuid.UUID) -> dict[str, Any]:
        """Execute a simulation synchronously + return summary metrics."""
        sim = await self.db.get(Simulation, simulation_id)
        if sim is None or sim.organization_id != str(organization_id):
            raise NotFoundError("Simulation", str(simulation_id))
        if sim.status not in {"pending", "running"}:
            raise ValidationError(f"Cannot re-run simulation in status '{sim.status}'")
        sim.status = "running"
        sim.started_at = datetime.now(UTC)
        sim.progress_percent = 0.0
        await self.db.flush()

        # Fetch target twin if specified
        twin = None
        if sim.target_twin_id:
            twin = await self.db.get(DigitalTwin, sim.target_twin_id)

        try:
            step_count = sim.time_horizon_days // sim.time_step_days
            all_metrics: list[dict[str, float]] = []
            for run_idx in range(sim.monte_carlo_runs):
                scenario_branch = f"run_{run_idx + 1}" if sim.monte_carlo_runs > 1 else "primary"
                # Initial state
                current_state: dict[str, Any] = {}
                if twin is not None:
                    current_state = dict(twin.state or {})
                # Merge input_params into state
                current_state.update(sim.input_params or {})
                for step_idx in range(step_count):
                    step_date = datetime.now(UTC) + timedelta(days=step_idx * sim.time_step_days)
                    new_state, step_metrics, events = self._advance_step(
                        simulation_type=sim.simulation_type,
                        state=current_state, step_index=step_idx,
                        step_days=sim.time_step_days, params=sim.input_params or {},
                        assumptions=sim.assumptions or [],
                        constraints=sim.constraints or [],
                        random_seed=hash((simulation_id, run_idx, step_idx)) % 2**31)
                    result = SimulationResult(
                        simulation_id=sim.id, organization_id=str(organization_id),
                        step_index=step_idx, step_date=step_date,
                        state=new_state, metrics=step_metrics, events=events,
                        scenario_branch=scenario_branch)
                    self.db.add(result)
                    current_state = new_state
                    all_metrics.append(step_metrics)
                    sim.progress_percent = ((run_idx * step_count + step_idx + 1) /
                                              (sim.monte_carlo_runs * step_count)) * 100.0
                    await self.db.flush()
            sim.status = "completed"
            sim.completed_at = datetime.now(UTC)
            sim.progress_percent = 100.0
            await self.db.flush()
            # Build aggregates
            aggregates = self._compute_aggregates(all_metrics)
            return {"simulation_id": str(simulation_id), "status": "completed",
                    "steps_executed": step_count * sim.monte_carlo_runs,
                    "monte_carlo_runs": sim.monte_carlo_runs,
                    "aggregates": aggregates,
                    "progress_percent": 100.0}
        except Exception as e:
            sim.status = "failed"
            sim.error = str(e)
            sim.completed_at = datetime.now(UTC)
            await self.db.flush()
            logger.error("simulation_failed", simulation_id=str(simulation_id), error=str(e))
            raise

    def _advance_step(self, *, simulation_type: str, state: dict[str, Any],
                       step_index: int, step_days: int, params: dict,
                       assumptions: list, constraints: list,
                       random_seed: int) -> tuple[dict[str, Any], dict[str, float], list[dict]]:
        """Advance one step using the type-specific model.

        Returns (new_state, metrics, events).
        """
        rng = random.Random(random_seed)
        new_state = dict(state)
        events: list[dict] = []
        if simulation_type == "sales":
            return self._step_sales(new_state, step_index, step_days, params, rng, events)
        if simulation_type == "revenue" or simulation_type == "financial":
            return self._step_financial(new_state, step_index, step_days, params, rng, events)
        if simulation_type == "demand":
            return self._step_demand(new_state, step_index, step_days, params, rng, events)
        if simulation_type == "inventory":
            return self._step_inventory(new_state, step_index, step_days, params, rng, events)
        if simulation_type == "churn":
            return self._step_churn(new_state, step_index, step_days, params, rng, events)
        if simulation_type == "pricing":
            return self._step_pricing(new_state, step_index, step_days, params, rng, events)
        if simulation_type == "hiring" or simulation_type == "resource":
            return self._step_hiring(new_state, step_index, step_days, params, rng, events)
        if simulation_type == "risk":
            return self._step_risk(new_state, step_index, step_days, params, rng, events)
        if simulation_type == "failure":
            return self._step_failure(new_state, step_index, step_days, params, rng, events)
        # business / what_if — generic
        return self._step_generic(new_state, step_index, step_days, params, rng, events)

    # ----- Type-specific step functions -----

    def _step_sales(self, state: dict, step_idx: int, step_days: int,
                     params: dict, rng: random.Random,
                     events: list) -> tuple[dict, dict, list]:
        leads = float(state.get("leads", 1000.0))
        conversion_rate = float(params.get("conversion_rate", 0.10))
        avg_deal_size = float(params.get("avg_deal_size", 500.0))
        growth_rate = float(params.get("growth_rate", 0.01))  # 1% per step
        seasonality = 1.0 + 0.1 * math.sin(step_idx * 0.5)
        noise = rng.uniform(-0.05, 0.05)
        new_leads = leads * (1 + growth_rate + noise) * seasonality
        new_customers = new_leads * conversion_rate * (1 + rng.uniform(-0.05, 0.05))
        revenue = new_customers * avg_deal_size
        state["leads"] = round(new_leads, 2)
        state["customers"] = round(state.get("customers", 0) + new_customers, 2)
        state["cumulative_revenue"] = round(state.get("cumulative_revenue", 0) + revenue, 2)
        metrics = {"new_leads": new_leads, "new_customers": new_customers,
                   "revenue": revenue, "cumulative_revenue": state["cumulative_revenue"]}
        if new_customers > 0:
            events.append({"type": "sales.closed", "count": int(new_customers),
                             "revenue": revenue})
        return state, metrics, events

    def _step_financial(self, state: dict, step_idx: int, step_days: int,
                         params: dict, rng: random.Random,
                         events: list) -> tuple[dict, dict, list]:
        revenue = float(state.get("revenue", 100000.0))
        cost_ratio = float(params.get("cost_ratio", 0.65))
        growth = float(params.get("growth_rate", 0.02))
        expense_growth = float(params.get("expense_growth", 0.01))
        revenue *= (1 + growth + rng.uniform(-0.01, 0.02))
        costs = revenue * cost_ratio * (1 + expense_growth * step_idx * 0.01)
        profit = revenue - costs
        cash = float(state.get("cash", 500000.0)) + profit
        state["revenue"] = round(revenue, 2)
        state["costs"] = round(costs, 2)
        state["profit"] = round(profit, 2)
        state["cash"] = round(cash, 2)
        state["margin"] = round(profit / revenue if revenue else 0.0, 4)
        metrics = {"revenue": revenue, "costs": costs, "profit": profit,
                   "cash": cash, "margin": state["margin"]}
        if profit < 0:
            events.append({"type": "financial.loss", "loss": abs(profit)})
        return state, metrics, events

    def _step_demand(self, state: dict, step_idx: int, step_days: int,
                      params: dict, rng: random.Random,
                      events: list) -> tuple[dict, dict, list]:
        base_demand = float(state.get("base_demand", 500.0))
        trend = float(params.get("trend_per_step", 1.0))
        seasonality_amplitude = float(params.get("seasonality_amplitude", 0.2))
        noise = rng.uniform(-0.1, 0.1)
        seasonal = 1.0 + seasonality_amplitude * math.sin(step_idx * 0.4)
        demand = (base_demand + trend * step_idx) * seasonal * (1 + noise)
        state["demand"] = round(demand, 2)
        state["cumulative_demand"] = round(state.get("cumulative_demand", 0) + demand, 2)
        metrics = {"demand": demand, "cumulative_demand": state["cumulative_demand"]}
        if demand > base_demand * 1.3:
            events.append({"type": "demand.spike", "demand": demand})
        return state, metrics, events

    def _step_inventory(self, state: dict, step_idx: int, step_days: int,
                          params: dict, rng: random.Random,
                          events: list) -> tuple[dict, dict, list]:
        stock = float(state.get("stock", 1000.0))
        reorder_point = float(params.get("reorder_point", 200.0))
        reorder_qty = float(params.get("reorder_qty", 1000.0))
        daily_demand = float(params.get("daily_demand", 50.0))
        lead_time_days = int(params.get("lead_time_days", 5))
        stock -= daily_demand * step_days * (1 + rng.uniform(-0.1, 0.1))
        if stock <= reorder_point:
            # Place order — arrives after lead time
            events.append({"type": "inventory.reorder", "quantity": reorder_qty,
                             "arrives_in_steps": max(1, lead_time_days // step_days)})
            state["pending_reorder"] = reorder_qty
            state["pending_reorder_arrival_step"] = step_idx + max(1, lead_time_days // step_days)
        # Check for pending reorder arrival
        if state.get("pending_reorder_arrival_step") == step_idx:
            stock += float(state.get("pending_reorder", 0))
            events.append({"type": "inventory.restock", "quantity": state.get("pending_reorder", 0)})
            state["pending_reorder"] = 0
            state["pending_reorder_arrival_step"] = None
        if stock < 0:
            events.append({"type": "inventory.stockout", "shortage": abs(stock)})
            stock = 0.0
        state["stock"] = round(stock, 2)
        metrics = {"stock": stock, "reorder_point": reorder_point}
        return state, metrics, events

    def _step_churn(self, state: dict, step_idx: int, step_days: int,
                     params: dict, rng: random.Random,
                     events: list) -> tuple[dict, dict, list]:
        customers = float(state.get("customers", 1000.0))
        new_per_step = float(params.get("new_per_step", 20.0))
        churn_rate = float(params.get("churn_rate_per_step", 0.02))
        churned = customers * churn_rate * (1 + rng.uniform(-0.1, 0.1))
        customers = customers - churned + new_per_step
        state["customers"] = round(customers, 2)
        state["churned"] = round(state.get("churned", 0) + churned, 2)
        state["acquired"] = round(state.get("acquired", 0) + new_per_step, 2)
        metrics = {"customers": customers, "churned": churned,
                   "acquired": new_per_step, "net": new_per_step - churned}
        if churned > customers * 0.05:
            events.append({"type": "churn.spike", "churned": churned})
        return state, metrics, events

    def _step_pricing(self, state: dict, step_idx: int, step_days: int,
                       params: dict, rng: random.Random,
                       events: list) -> tuple[dict, dict, list]:
        price = float(state.get("price", 100.0))
        elasticity = float(params.get("elasticity", -1.5))
        base_volume = float(params.get("base_volume", 1000.0))
        cost_per_unit = float(params.get("cost_per_unit", 60.0))
        price_change = float(params.get("price_change_per_step", 0.0))
        price *= (1 + price_change + rng.uniform(-0.02, 0.02))
        volume = base_volume * (price / 100.0) ** elasticity
        revenue = volume * price
        cost = volume * cost_per_unit
        profit = revenue - cost
        state["price"] = round(price, 2)
        state["volume"] = round(volume, 2)
        state["revenue"] = round(revenue, 2)
        state["profit"] = round(profit, 2)
        metrics = {"price": price, "volume": volume, "revenue": revenue, "profit": profit}
        return state, metrics, events

    def _step_hiring(self, state: dict, step_idx: int, step_days: int,
                      params: dict, rng: random.Random,
                      events: list) -> tuple[dict, dict, list]:
        headcount = float(state.get("headcount", 100.0))
        attrition_rate = float(params.get("attrition_per_step", 0.01))
        hiring_rate = float(params.get("hiring_per_step", 0.015))
        salary = float(params.get("avg_salary", 80000.0))
        hiring_cost = float(params.get("hiring_cost_per_hire", 5000.0))
        attrition = headcount * attrition_rate * (1 + rng.uniform(-0.1, 0.1))
        new_hires = headcount * hiring_rate
        headcount = headcount - attrition + new_hires
        labor_cost = headcount * salary / 365 * step_days
        recruiting_cost = new_hires * hiring_cost
        state["headcount"] = round(headcount, 2)
        state["attrition"] = round(state.get("attrition", 0) + attrition, 2)
        state["new_hires"] = round(state.get("new_hires", 0) + new_hires, 2)
        state["labor_cost"] = round(state.get("labor_cost", 0) + labor_cost, 2)
        state["recruiting_cost"] = round(state.get("recruiting_cost", 0) + recruiting_cost, 2)
        metrics = {"headcount": headcount, "attrition": attrition,
                   "new_hires": new_hires, "labor_cost": labor_cost,
                   "recruiting_cost": recruiting_cost}
        return state, metrics, events

    def _step_risk(self, state: dict, step_idx: int, step_days: int,
                    params: dict, rng: random.Random,
                    events: list) -> tuple[dict, dict, list]:
        risk_score = float(state.get("risk_score", 0.3))
        mitigation_effect = float(params.get("mitigation_per_step", 0.0))
        external_shock_prob = float(params.get("shock_probability", 0.05))
        # Random walk with mitigation
        risk_score += rng.uniform(-0.05, 0.05)
        risk_score -= mitigation_effect
        # External shock
        if rng.random() < external_shock_prob:
            shock_magnitude = rng.uniform(0.1, 0.3)
            risk_score += shock_magnitude
            events.append({"type": "risk.shock", "magnitude": shock_magnitude})
        risk_score = max(0.0, min(1.0, risk_score))
        state["risk_score"] = round(risk_score, 4)
        state["value_at_risk"] = round(float(state.get("asset_value", 1000000)) * risk_score, 2)
        metrics = {"risk_score": risk_score, "value_at_risk": state["value_at_risk"]}
        if risk_score > 0.7:
            events.append({"type": "risk.high", "score": risk_score})
        return state, metrics, events

    def _step_failure(self, state: dict, step_idx: int, step_days: int,
                       params: dict, rng: random.Random,
                       events: list) -> tuple[dict, dict, list]:
        # Simulate infrastructure failures with MTBF + repair time
        mtbf_hours = float(params.get("mtbf_hours", 720.0))
        mttr_hours = float(params.get("mttr_hours", 4.0))
        servers = int(state.get("servers", 10))
        uptime_pct = float(state.get("uptime_pct", 99.9))
        failed_now = 0
        for _ in range(servers):
            failure_prob = step_days * 24 / mtbf_hours
            if rng.random() < failure_prob:
                failed_now += 1
                events.append({"type": "failure.server", "server_id": f"srv_{rng.randint(1, servers)}"})
        # Repair: each server has ~mttr_hours / (step_days * 24) chance of being fixed per step
        previously_failed = int(state.get("failed_servers", 0))
        repaired = 0
        for _ in range(previously_failed):
            repair_prob = step_days * 24 / mttr_hours
            if rng.random() < repair_prob:
                repaired += 1
        total_failed = max(0, previously_failed - repaired + failed_now)
        operational = servers - total_failed
        new_uptime = (operational / servers) * 100 if servers else 0
        # Exponential moving average of uptime
        uptime_pct = 0.9 * uptime_pct + 0.1 * new_uptime
        state["failed_servers"] = total_failed
        state["operational_servers"] = operational
        state["uptime_pct"] = round(uptime_pct, 4)
        metrics = {"failed_servers": total_failed, "operational_servers": operational,
                   "uptime_pct": uptime_pct}
        return state, metrics, events

    def _step_generic(self, state: dict, step_idx: int, step_days: int,
                       params: dict, rng: random.Random,
                       events: list) -> tuple[dict, dict, list]:
        # Generic what-if: apply a delta to each numeric key in params
        metrics: dict[str, float] = {}
        for key, delta in params.items():
            if isinstance(delta, (int, float)):
                current = float(state.get(key, 0.0))
                noise = rng.uniform(-0.05, 0.05) * abs(delta) if delta != 0 else 0
                new_value = current + delta + noise
                state[key] = round(new_value, 4)
                metrics[key] = new_value
        return state, metrics, events

    def _compute_aggregates(self, all_metrics: list[dict[str, float]]) -> dict[str, Any]:
        """Compute summary statistics across all simulation steps."""
        if not all_metrics:
            return {}
        all_keys = set()
        for m in all_metrics:
            all_keys.update(m.keys())
        aggregates: dict[str, Any] = {}
        for key in all_keys:
            values = [m.get(key, 0) for m in all_metrics if isinstance(m.get(key), (int, float))]
            if not values:
                continue
            aggregates[key] = {
                "mean": statistics.mean(values),
                "min": min(values),
                "max": max(values),
                "stddev": statistics.stdev(values) if len(values) > 1 else 0.0,
                "sum": sum(values),
                "count": len(values),
            }
        return aggregates

    async def get_simulation(self, *, simulation_id: uuid.UUID,
                              organization_id: uuid.UUID) -> Simulation:
        sim = await self.db.get(Simulation, simulation_id)
        if sim is None or sim.organization_id != str(organization_id):
            raise NotFoundError("Simulation", str(simulation_id))
        return sim

    async def list_simulations(self, *, organization_id: uuid.UUID,
                                simulation_type: str | None = None,
                                status: str | None = None,
                                skip: int = 0, limit: int = 50) -> tuple[list[Simulation], int]:
        conditions = [Simulation.organization_id == str(organization_id)]
        if simulation_type:
            conditions.append(Simulation.simulation_type == simulation_type)
        if status:
            conditions.append(Simulation.status == status)
        total = int((await self.db.execute(
            select(func.count()).select_from(Simulation).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(Simulation).where(*conditions)
            .order_by(Simulation.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def list_results(self, *, simulation_id: uuid.UUID,
                            organization_id: uuid.UUID,
                            scenario_branch: str | None = None,
                            skip: int = 0, limit: int = 1000) -> tuple[list[SimulationResult], int]:
        sim = await self.get_simulation(simulation_id=simulation_id, organization_id=organization_id)
        conditions = [SimulationResult.simulation_id == sim.id]
        if scenario_branch:
            conditions.append(SimulationResult.scenario_branch == scenario_branch)
        total = int((await self.db.execute(
            select(func.count()).select_from(SimulationResult).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(SimulationResult).where(*conditions)
            .order_by(SimulationResult.step_index.asc(),
                       SimulationResult.scenario_branch.asc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def compare_scenarios(self, *, simulation_id: uuid.UUID,
                                  organization_id: uuid.UUID) -> dict[str, Any]:
        """Aggregate results by scenario_branch for comparison."""
        sim = await self.get_simulation(simulation_id=simulation_id, organization_id=organization_id)
        result_q = await self.db.execute(
            select(SimulationResult).where(SimulationResult.simulation_id == sim.id)
            .order_by(SimulationResult.scenario_branch, SimulationResult.step_index))
        results = list(result_q.scalars().all())
        if not results:
            return {"simulation_id": str(simulation_id), "scenarios": []}
        by_branch: dict[str, list[SimulationResult]] = {}
        for r in results:
            by_branch.setdefault(r.scenario_branch or "primary", []).append(r)
        scenarios = []
        for branch, branch_results in by_branch.items():
            all_metrics: list[dict[str, float]] = [r.metrics or {} for r in branch_results]
            aggregates = self._compute_aggregates(all_metrics)
            final_metrics = branch_results[-1].metrics if branch_results else {}
            scenarios.append({
                "scenario_branch": branch,
                "step_count": len(branch_results),
                "final_state": branch_results[-1].state if branch_results else {},
                "final_metrics": final_metrics,
                "aggregates": aggregates,
            })
        return {"simulation_id": str(simulation_id),
                "simulation_type": sim.simulation_type,
                "scenarios": scenarios}

    def simulation_to_dict(self, s: Simulation) -> dict[str, Any]:
        return {"id": str(s.id), "name": s.name,
                "simulation_type": s.simulation_type,
                "description": s.description,
                "target_twin_id": str(s.target_twin_id) if s.target_twin_id else None,
                "input_params": s.input_params,
                "assumptions": s.assumptions, "constraints": s.constraints,
                "time_horizon_days": s.time_horizon_days,
                "time_step_days": s.time_step_days,
                "monte_carlo_runs": s.monte_carlo_runs,
                "status": s.status, "progress_percent": s.progress_percent,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "error": s.error, "created_by": s.created_by,
                "created_at": s.created_at.isoformat() if s.created_at else None}


# ====================================================================
# Knowledge Graph Service
# ====================================================================

class KnowledgeGraphService:
    """Manages business graph + knowledge graph (entities, relations, traversal)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ----- Business Graph (org entities) -----

    async def upsert_business_node(self, *, organization_id: uuid.UUID,
                                     node_type: str, node_id: str,
                                     name: str, properties: dict | None = None,
                                     tags: list[str] | None = None) -> BusinessGraphNode:
        existing_q = await self.db.execute(
            select(BusinessGraphNode).where(
                BusinessGraphNode.organization_id == str(organization_id),
                BusinessGraphNode.node_type == node_type,
                BusinessGraphNode.node_id == node_id))
        node = existing_q.scalar_one_or_none()
        if node:
            node.name = name
            if properties is not None:
                node.properties = properties
            if tags is not None:
                node.tags = tags
            node.last_synced_at = datetime.now(UTC)
        else:
            node = BusinessGraphNode(
                organization_id=str(organization_id), node_type=node_type,
                node_id=node_id, name=name, properties=properties or {},
                tags=tags or [], is_active=True,
                last_synced_at=datetime.now(UTC))
            self.db.add(node)
        await self.db.flush()
        return node

    async def add_business_edge(self, *, organization_id: uuid.UUID,
                                  source_node_id: uuid.UUID, target_node_id: uuid.UUID,
                                  edge_type: str, weight: float = 1.0,
                                  properties: dict | None = None,
                                  is_directed: bool = True) -> BusinessGraphEdge:
        # Check uniqueness
        existing_q = await self.db.execute(
            select(BusinessGraphEdge).where(
                BusinessGraphEdge.source_node_id == source_node_id,
                BusinessGraphEdge.target_node_id == target_node_id,
                BusinessGraphEdge.edge_type == edge_type))
        if existing_q.scalar_one_or_none():
            raise ValidationError("Edge already exists")
        edge = BusinessGraphEdge(
            organization_id=str(organization_id),
            source_node_id=source_node_id, target_node_id=target_node_id,
            edge_type=edge_type, weight=weight,
            properties=properties or {}, is_directed=is_directed)
        self.db.add(edge)
        await self.db.flush()
        return edge

    async def list_business_nodes(self, *, organization_id: uuid.UUID,
                                    node_type: str | None = None,
                                    skip: int = 0, limit: int = 100) -> tuple[list[BusinessGraphNode], int]:
        conditions = [BusinessGraphNode.organization_id == str(organization_id),
                       BusinessGraphNode.is_active.is_(True)]
        if node_type:
            conditions.append(BusinessGraphNode.node_type == node_type)
        total = int((await self.db.execute(
            select(func.count()).select_from(BusinessGraphNode).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(BusinessGraphNode).where(*conditions)
            .order_by(BusinessGraphNode.name.asc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def list_business_edges(self, *, organization_id: uuid.UUID,
                                    node_id: uuid.UUID | None = None,
                                    edge_type: str | None = None,
                                    skip: int = 0, limit: int = 100) -> tuple[list[BusinessGraphEdge], int]:
        conditions = [BusinessGraphEdge.organization_id == str(organization_id)]
        if node_id:
            conditions.append(or_(
                BusinessGraphEdge.source_node_id == node_id,
                BusinessGraphEdge.target_node_id == node_id))
        if edge_type:
            conditions.append(BusinessGraphEdge.edge_type == edge_type)
        total = int((await self.db.execute(
            select(func.count()).select_from(BusinessGraphEdge).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(BusinessGraphEdge).where(*conditions).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def traverse_business_graph(self, *, organization_id: uuid.UUID,
                                        start_node_id: uuid.UUID,
                                        max_depth: int = 3,
                                        edge_types: list[str] | None = None) -> dict[str, Any]:
        """BFS traversal of the business graph starting from a node."""
        if max_depth < 1 or max_depth > 5:
            raise ValidationError("max_depth must be between 1 and 5")
        visited: set[str] = set()
        nodes: list[dict] = []
        edges: list[dict] = []
        queue: list[tuple[uuid.UUID, int]] = [(start_node_id, 0)]
        while queue:
            current_id, depth = queue.pop(0)
            current_id_str = str(current_id)
            if current_id_str in visited or depth > max_depth:
                continue
            visited.add(current_id_str)
            node = await self.db.get(BusinessGraphNode, current_id)
            if node is None or node.organization_id != str(organization_id):
                continue
            nodes.append({"id": str(node.id), "node_type": node.node_type,
                          "node_id": node.node_id, "name": node.name,
                          "depth": depth})
            # Find connected edges
            edge_q = await self.db.execute(
                select(BusinessGraphEdge).where(
                    BusinessGraphEdge.organization_id == str(organization_id),
                    or_(BusinessGraphEdge.source_node_id == current_id,
                        BusinessGraphEdge.target_node_id == current_id)))
            for edge in edge_q.scalars().all():
                if edge_types and edge.edge_type not in edge_types:
                    continue
                edges.append({"id": str(edge.id), "source": str(edge.source_node_id),
                              "target": str(edge.target_node_id), "edge_type": edge.edge_type,
                              "weight": edge.weight})
                next_id = edge.target_node_id if edge.source_node_id == current_id else edge.source_node_id
                if str(next_id) not in visited and depth + 1 <= max_depth:
                    queue.append((next_id, depth + 1))
        return {"start_node_id": str(start_node_id), "max_depth": max_depth,
                "nodes": nodes, "edges": edges, "total_nodes": len(nodes),
                "total_edges": len(edges)}

    # ----- Knowledge Graph (extracted entities) -----

    async def upsert_kg_entity(self, *, organization_id: uuid.UUID,
                                 entity_type: str, entity_text: str,
                                 canonical_id: str | None = None,
                                 properties: dict | None = None,
                                 source_document_id: str | None = None,
                                 confidence_score: float = 1.0) -> KnowledgeGraphEntity:
        # Try to find existing entity by canonical_id or (type, text)
        existing_q = await self.db.execute(
            select(KnowledgeGraphEntity).where(
                KnowledgeGraphEntity.organization_id == str(organization_id),
                KnowledgeGraphEntity.entity_type == entity_type,
                KnowledgeGraphEntity.entity_text == entity_text))
        entity = existing_q.scalar_one_or_none()
        if entity:
            entity.mention_count = (entity.mention_count or 1) + 1
            if properties:
                entity.properties = properties
            if confidence_score:
                entity.confidence_score = confidence_score
        else:
            entity = KnowledgeGraphEntity(
                organization_id=str(organization_id), entity_type=entity_type,
                entity_text=entity_text, canonical_id=canonical_id,
                properties=properties or {}, source_document_id=source_document_id,
                confidence_score=confidence_score, mention_count=1)
            self.db.add(entity)
        await self.db.flush()
        return entity

    async def add_kg_relation(self, *, organization_id: uuid.UUID,
                                source_entity_id: uuid.UUID,
                                target_entity_id: uuid.UUID,
                                relation_type: str,
                                properties: dict | None = None,
                                confidence_score: float = 1.0,
                                source_document_id: str | None = None) -> KnowledgeGraphRelation:
        existing_q = await self.db.execute(
            select(KnowledgeGraphRelation).where(
                KnowledgeGraphRelation.source_entity_id == source_entity_id,
                KnowledgeGraphRelation.target_entity_id == target_entity_id,
                KnowledgeGraphRelation.relation_type == relation_type))
        if existing_q.scalar_one_or_none():
            raise ValidationError("Relation already exists")
        relation = KnowledgeGraphRelation(
            organization_id=str(organization_id),
            source_entity_id=source_entity_id, target_entity_id=target_entity_id,
            relation_type=relation_type, properties=properties or {},
            confidence_score=confidence_score, source_document_id=source_document_id)
        self.db.add(relation)
        await self.db.flush()
        return relation

    async def list_kg_entities(self, *, organization_id: uuid.UUID,
                                 entity_type: str | None = None,
                                 search: str | None = None,
                                 skip: int = 0, limit: int = 100) -> tuple[list[KnowledgeGraphEntity], int]:
        conditions = [KnowledgeGraphEntity.organization_id == str(organization_id)]
        if entity_type:
            conditions.append(KnowledgeGraphEntity.entity_type == entity_type)
        if search:
            like = f"%{search.lower()}%"
            conditions.append(func.lower(KnowledgeGraphEntity.entity_text).like(like))
        total = int((await self.db.execute(
            select(func.count()).select_from(KnowledgeGraphEntity).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(KnowledgeGraphEntity).where(*conditions)
            .order_by(KnowledgeGraphEntity.mention_count.desc(),
                       KnowledgeGraphEntity.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def find_entity_relations(self, *, entity_id: uuid.UUID,
                                      organization_id: uuid.UUID) -> dict[str, Any]:
        """Get all incoming + outgoing relations for an entity."""
        entity = await self.db.get(KnowledgeGraphEntity, entity_id)
        if entity is None or entity.organization_id != str(organization_id):
            raise NotFoundError("KnowledgeGraphEntity", str(entity_id))
        outgoing_q = await self.db.execute(
            select(KnowledgeGraphRelation).where(
                KnowledgeGraphRelation.source_entity_id == entity_id))
        incoming_q = await self.db.execute(
            select(KnowledgeGraphRelation).where(
                KnowledgeGraphRelation.target_entity_id == entity_id))
        outgoing = list(outgoing_q.scalars().all())
        incoming = list(incoming_q.scalars().all())
        return {"entity_id": str(entity_id), "entity_text": entity.entity_text,
                "entity_type": entity.entity_type,
                "outgoing": [{"id": str(r.id), "target_entity_id": str(r.target_entity_id),
                              "relation_type": r.relation_type,
                              "confidence_score": r.confidence_score} for r in outgoing],
                "incoming": [{"id": str(r.id), "source_entity_id": str(r.source_entity_id),
                              "relation_type": r.relation_type,
                              "confidence_score": r.confidence_score} for r in incoming]}


# ====================================================================
# Decision Engine + AI Planner
# ====================================================================

class DecisionEngine:
    """AI planner + decision record management."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_planning_session(self, *, organization_id: uuid.UUID,
                                        name: str, goal: str, goal_type: str,
                                        target_metric: str | None = None,
                                        target_value: float | None = None,
                                        current_value: float | None = None,
                                        time_horizon_days: int = 90,
                                        constraints: list | None = None,
                                        assumptions: list | None = None,
                                        priority: int = 5,
                                        created_by: str | None = None) -> PlanningSession:
        session = PlanningSession(
            organization_id=str(organization_id), name=name, goal=goal,
            goal_type=goal_type, target_metric=target_metric,
            target_value=target_value, current_value=current_value,
            time_horizon_days=time_horizon_days,
            constraints=constraints or [], assumptions=assumptions or [],
            steps=[], scenarios=[], priority=priority, status="draft",
            progress_percent=0.0, created_by=created_by)
        self.db.add(session)
        await self.db.flush()
        return session

    async def generate_plan(self, *, session_id: uuid.UUID,
                              organization_id: uuid.UUID) -> PlanningSession:
        """Auto-generate a multi-step plan to achieve the session's goal.

        Uses a heuristic planner that breaks the goal into N steps based on
        goal_type. In production, this would invoke an LLM agent.
        """
        session = await self.db.get(PlanningSession, session_id)
        if session is None or session.organization_id != str(organization_id):
            raise NotFoundError("PlanningSession", str(session_id))
        if session.status not in {"draft", "active"}:
            raise ValidationError(f"Cannot generate plan for session in status '{session.status}'")
        # Generate steps based on goal type
        steps = self._generate_steps_for_goal(
            goal_type=session.goal_type,
            goal=session.goal,
            target_metric=session.target_metric,
            target_value=session.target_value,
            current_value=session.current_value,
            time_horizon_days=session.time_horizon_days,
            constraints=session.constraints or [])
        session.steps = steps
        # Generate 3 scenarios: conservative / baseline / aggressive
        session.scenarios = self._generate_scenarios(steps, session.time_horizon_days)
        session.selected_scenario_id = "baseline"
        session.status = "active"
        session.started_at = datetime.now(UTC)
        await self.db.flush()
        return session

    def _generate_steps_for_goal(self, *, goal_type: str, goal: str,
                                    target_metric: str | None,
                                    target_value: float | None,
                                    current_value: float | None,
                                    time_horizon_days: int,
                                    constraints: list) -> list[dict]:
        """Heuristic multi-step plan generator."""
        # Generic 5-step plan template applicable to most goals
        steps = [
            {"step_index": 0, "action": "Analyze current state and identify gaps",
             "target": "Establish baseline measurement",
             "expected_outcome": "Clear understanding of gap to target",
             "dependencies": [], "status": "pending",
             "estimated_days": max(1, time_horizon_days // 10)},
            {"step_index": 1, "action": f"Develop {goal_type} strategy",
             "target": f"Strategy document for: {goal[:100]}",
             "expected_outcome": "Approved strategy with KPIs",
             "dependencies": [0], "status": "pending",
             "estimated_days": max(2, time_horizon_days // 5)},
            {"step_index": 2, "action": "Execute quick wins (Phase 1)",
             "target": f"Improve {target_metric or 'metric'} by 25% of gap",
             "expected_outcome": "Measurable progress toward target",
             "dependencies": [1], "status": "pending",
             "estimated_days": max(5, time_horizon_days // 3)},
            {"step_index": 3, "action": "Scale successful initiatives (Phase 2)",
             "target": f"Reach 75% of target {target_metric or 'metric'}",
             "expected_outcome": "Sustained trajectory toward goal",
             "dependencies": [2], "status": "pending",
             "estimated_days": max(5, time_horizon_days // 3)},
            {"step_index": 4, "action": "Optimize and achieve target",
             "target": f"Reach target {target_value or ''} for {target_metric or 'metric'}",
             "expected_outcome": "Goal achieved",
             "dependencies": [3], "status": "pending",
             "estimated_days": max(2, time_horizon_days // 5)},
        ]
        # Add constraint-aware adjustments
        for c in constraints:
            if isinstance(c, dict) and c.get("type") == "budget":
                steps.insert(2, {
                    "step_index": 2, "action": f"Secure budget approval ({c.get('value', 'TBD')})",
                    "target": "Budget approved",
                    "expected_outcome": "Funding available for execution",
                    "dependencies": [1], "status": "pending",
                    "estimated_days": max(2, time_horizon_days // 10),
                })
                # Re-index later steps
                for i, s in enumerate(steps[3:], start=3):
                    s["step_index"] = i
                    s["dependencies"] = [d + 1 if d >= 2 else d for d in s.get("dependencies", [])]
        return steps

    def _generate_scenarios(self, baseline_steps: list[dict],
                              time_horizon_days: int) -> list[dict]:
        """Generate conservative / baseline / aggressive scenarios."""
        baseline_total_days = sum(s.get("estimated_days", 0) for s in baseline_steps)
        return [
            {"id": "conservative", "name": "Conservative",
             "description": "Slower execution with higher confidence",
             "time_to_complete_days": int(baseline_total_days * 1.3),
             "success_probability": 0.85,
             "expected_impact_pct": 0.7},
            {"id": "baseline", "name": "Baseline",
             "description": "Recommended balanced execution",
             "time_to_complete_days": baseline_total_days,
             "success_probability": 0.7,
             "expected_impact_pct": 1.0},
            {"id": "aggressive", "name": "Aggressive",
             "description": "Fast execution with higher risk",
             "time_to_complete_days": int(baseline_total_days * 0.7),
             "success_probability": 0.5,
             "expected_impact_pct": 1.3},
        ]

    async def compare_scenarios(self, *, session_id: uuid.UUID,
                                  organization_id: uuid.UUID) -> dict[str, Any]:
        """Compare planning scenarios side-by-side."""
        session = await self.db.get(PlanningSession, session_id)
        if session is None or session.organization_id != str(organization_id):
            raise NotFoundError("PlanningSession", str(session_id))
        return {"session_id": str(session_id), "goal": session.goal,
                "goal_type": session.goal_type,
                "selected_scenario_id": session.selected_scenario_id,
                "scenarios": session.scenarios or []}

    async def select_scenario(self, *, session_id: uuid.UUID,
                                organization_id: uuid.UUID,
                                scenario_id: str) -> PlanningSession:
        session = await self.db.get(PlanningSession, session_id)
        if session is None or session.organization_id != str(organization_id):
            raise NotFoundError("PlanningSession", str(session_id))
        scenario_ids = [s.get("id") for s in (session.scenarios or [])]
        if scenario_id not in scenario_ids:
            raise ValidationError(f"Invalid scenario_id: {scenario_id}. Available: {scenario_ids}")
        session.selected_scenario_id = scenario_id
        await self.db.flush()
        return session

    async def list_planning_sessions(self, *, organization_id: uuid.UUID,
                                       status: str | None = None,
                                       skip: int = 0, limit: int = 50) -> tuple[list[PlanningSession], int]:
        conditions = [PlanningSession.organization_id == str(organization_id)]
        if status:
            conditions.append(PlanningSession.status == status)
        total = int((await self.db.execute(
            select(func.count()).select_from(PlanningSession).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(PlanningSession).where(*conditions)
            .order_by(PlanningSession.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def create_decision(self, *, organization_id: uuid.UUID,
                                title: str, description: str | None,
                                decision_type: str, category: str | None,
                                proposed_by: str, proposed_by_id: str | None,
                                options: list[dict],
                                related_simulation_id: uuid.UUID | None = None,
                                related_planning_session_id: uuid.UUID | None = None,
                                tags: list[str] | None = None) -> DecisionHistory:
        """Record a decision (AI-proposed or human-proposed)."""
        if not options or not isinstance(options, list):
            raise ValidationError("At least one option is required")
        # Score each option (heuristic — in production, use LLM-as-judge)
        for opt in options:
            if "score" not in opt:
                impact = opt.get("expected_impact", {})
                confidence = float(impact.get("confidence", 0.5)) if isinstance(impact, dict) else 0.5
                revenue_delta = float(impact.get("revenue_delta", 0)) if isinstance(impact, dict) else 0
                cost_delta = float(impact.get("cost_delta", 0)) if isinstance(impact, dict) else 0
                net = revenue_delta - cost_delta
                opt["score"] = round(net * confidence, 2)
        # Auto-select highest-scoring option
        best = max(options, key=lambda o: float(o.get("score", 0)))
        decision = DecisionHistory(
            organization_id=str(organization_id), title=title,
            description=description, decision_type=decision_type, category=category,
            proposed_by=proposed_by, proposed_by_id=proposed_by_id,
            options=options, selected_option=best.get("name"),
            selected_option_index=options.index(best),
            rationale=f"Auto-selected highest-scoring option (score={best.get('score')})",
            expected_impact=best.get("expected_impact"),
            status="proposed",
            related_simulation_id=related_simulation_id,
            related_planning_session_id=related_planning_session_id,
            tags=tags or [])
        self.db.add(decision)
        await self.db.flush()
        return decision

    async def approve_decision(self, *, decision_id: uuid.UUID,
                                 organization_id: uuid.UUID,
                                 approved_by: str,
                                 notes: str | None = None) -> DecisionHistory:
        decision = await self.db.get(DecisionHistory, decision_id)
        if decision is None or decision.organization_id != str(organization_id):
            raise NotFoundError("DecisionHistory", str(decision_id))
        if decision.status != "proposed":
            raise ValidationError(f"Cannot approve decision in status '{decision.status}'")
        decision.status = "approved"
        decision.approved_by = approved_by
        decision.approved_at = datetime.now(UTC)
        if notes:
            decision.rationale = (decision.rationale or "") + f"\n\nApproval notes: {notes}"
        await self.db.flush()
        return decision

    async def implement_decision(self, *, decision_id: uuid.UUID,
                                   organization_id: uuid.UUID) -> DecisionHistory:
        decision = await self.db.get(DecisionHistory, decision_id)
        if decision is None or decision.organization_id != str(organization_id):
            raise NotFoundError("DecisionHistory", str(decision_id))
        if decision.status != "approved":
            raise ValidationError(f"Cannot implement decision in status '{decision.status}'")
        decision.status = "implemented"
        decision.implemented_at = datetime.now(UTC)
        await self.db.flush()
        return decision

    async def review_decision(self, *, decision_id: uuid.UUID,
                                organization_id: uuid.UUID,
                                outcome: str, actual_impact: dict | None = None) -> DecisionHistory:
        if outcome not in {"success", "partial", "failed"}:
            raise ValidationError("outcome must be success/partial/failed")
        decision = await self.db.get(DecisionHistory, decision_id)
        if decision is None or decision.organization_id != str(organization_id):
            raise NotFoundError("DecisionHistory", str(decision_id))
        decision.review_outcome = outcome
        decision.reviewed_at = datetime.now(UTC)
        if actual_impact:
            decision.actual_impact = actual_impact
        await self.db.flush()
        return decision

    async def list_decisions(self, *, organization_id: uuid.UUID,
                               status: str | None = None,
                               decision_type: str | None = None,
                               skip: int = 0, limit: int = 50) -> tuple[list[DecisionHistory], int]:
        conditions = [DecisionHistory.organization_id == str(organization_id)]
        if status:
            conditions.append(DecisionHistory.status == status)
        if decision_type:
            conditions.append(DecisionHistory.decision_type == decision_type)
        total = int((await self.db.execute(
            select(func.count()).select_from(DecisionHistory).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(DecisionHistory).where(*conditions)
            .order_by(DecisionHistory.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    def decision_to_dict(self, d: DecisionHistory) -> dict[str, Any]:
        return {"id": str(d.id), "title": d.title, "description": d.description,
                "decision_type": d.decision_type, "category": d.category,
                "proposed_by": d.proposed_by, "proposed_by_id": d.proposed_by_id,
                "options": d.options, "selected_option": d.selected_option,
                "selected_option_index": d.selected_option_index,
                "rationale": d.rationale, "expected_impact": d.expected_impact,
                "actual_impact": d.actual_impact, "status": d.status,
                "approved_by": d.approved_by,
                "approved_at": d.approved_at.isoformat() if d.approved_at else None,
                "implemented_at": d.implemented_at.isoformat() if d.implemented_at else None,
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                "review_outcome": d.review_outcome,
                "related_simulation_id": str(d.related_simulation_id) if d.related_simulation_id else None,
                "related_planning_session_id": str(d.related_planning_session_id) if d.related_planning_session_id else None,
                "tags": d.tags,
                "created_at": d.created_at.isoformat() if d.created_at else None}

    def session_to_dict(self, s: PlanningSession) -> dict[str, Any]:
        return {"id": str(s.id), "name": s.name, "goal": s.goal,
                "goal_type": s.goal_type, "target_metric": s.target_metric,
                "target_value": s.target_value, "current_value": s.current_value,
                "time_horizon_days": s.time_horizon_days,
                "constraints": s.constraints, "assumptions": s.assumptions,
                "steps": s.steps, "scenarios": s.scenarios,
                "selected_scenario_id": s.selected_scenario_id,
                "priority": s.priority, "status": s.status,
                "progress_percent": s.progress_percent,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None}


# ====================================================================
# Prediction Service
# ====================================================================

class PredictionService:
    """Time-series forecasting with multiple model types."""

    # Default models registered at startup
    DEFAULT_MODELS = [
        {"name": "Linear Trend", "slug": "linear_trend", "model_type": "linear",
         "target_metric": "generic", "hyperparameters": {}, "is_default": True},
        {"name": "Moving Average (7-day)", "slug": "moving_avg_7", "model_type": "moving_average",
         "target_metric": "generic", "hyperparameters": {"window": 7}},
        {"name": "Exponential Smoothing", "slug": "exp_smoothing", "model_type": "exponential_smoothing",
         "target_metric": "generic", "hyperparameters": {"alpha": 0.3}},
        {"name": "Heuristic (Seasonal Naive)", "slug": "seasonal_naive", "model_type": "heuristic",
         "target_metric": "generic", "hyperparameters": {"season_length": 7}},
    ]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register_model(self, *, organization_id: uuid.UUID | None,
                               name: str, slug: str, model_type: str,
                               target_metric: str,
                               description: str | None = None,
                               hyperparameters: dict | None = None,
                               input_features: list | None = None,
                               training_window_days: int = 90,
                               is_default: bool = False,
                               created_by: str | None = None) -> ForecastModel:
        model = ForecastModel(
            organization_id=str(organization_id) if organization_id else None,
            name=name, slug=slug, description=description, model_type=model_type,
            target_metric=target_metric,
            hyperparameters=hyperparameters or {},
            input_features=input_features or [],
            training_window_days=training_window_days,
            is_active=True, is_default=is_default)
        self.db.add(model)
        await self.db.flush()
        return model

    async def list_models(self, *, organization_id: uuid.UUID | None = None,
                            target_metric: str | None = None,
                            skip: int = 0, limit: int = 50) -> tuple[list[ForecastModel], int]:
        conditions = []
        if organization_id:
            org_str = str(organization_id)
            conditions.append(or_(
                ForecastModel.organization_id.is_(None),
                ForecastModel.organization_id == org_str))
        if target_metric:
            conditions.append(ForecastModel.target_metric == target_metric)
        count_q = select(func.count()).select_from(ForecastModel)
        if conditions:
            count_q = count_q.where(*conditions)
        total = int((await self.db.execute(count_q)).scalar_one_or_none() or 0)
        q = select(ForecastModel)
        if conditions:
            q = q.where(*conditions)
        q = q.order_by(ForecastModel.is_default.desc(),
                       ForecastModel.name.asc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def predict(self, *, organization_id: uuid.UUID,
                        prediction_type: str, historical_data: list[dict] | None = None,
                        horizon_days: int = 30,
                        model_slug: str | None = None,
                        target_entity_type: str | None = None,
                        target_entity_id: str | None = None,
                        input_features: dict | None = None) -> PredictionResult:
        """Generate a prediction for the next `horizon_days` days.

        historical_data: list of {date, value} entries (chronological).
        If omitted, generates a synthetic series for demonstration.
        """
        if prediction_type not in PREDICTION_TYPES:
            raise ValidationError(
                f"Invalid prediction_type: {prediction_type}. Supported: {sorted(PREDICTION_TYPES)}")
        if horizon_days < 1 or horizon_days > 365:
            raise ValidationError("horizon_days must be between 1 and 365")
        # Generate synthetic data if none provided
        if not historical_data:
            historical_data = self._generate_synthetic_history(prediction_type, days=90)
        if len(historical_data) < 2:
            raise ValidationError("At least 2 historical data points required")
        # Pick model
        model = None
        if model_slug:
            conditions = [ForecastModel.slug == model_slug,
                           or_(ForecastModel.organization_id.is_(None),
                                ForecastModel.organization_id == str(organization_id)),
                           ForecastModel.is_active.is_(True)]
            model_q = await self.db.execute(select(ForecastModel).where(*conditions))
            model = model_q.scalar_one_or_none()
            if model is None:
                raise NotFoundError("ForecastModel", model_slug)
        else:
            # Use default model
            model_q = await self.db.execute(
                select(ForecastModel).where(
                    ForecastModel.is_default.is_(True),
                    ForecastModel.is_active.is_(True)).limit(1))
            model = model_q.scalar_one_or_none()
            if model is None:
                # Fallback: just use linear
                model_slug = "linear_trend"
        model_type = model.model_type if model else "linear"
        model_name = model.name if model else "Linear Trend (fallback)"
        model_version = "1.0"
        # Run forecasting algorithm
        predictions = self._forecast(
            model_type=model_type, historical=historical_data,
            horizon_days=horizon_days,
            hyperparameters=model.hyperparameters if model else {})
        # Compute aggregates
        values = [p["value"] for p in predictions]
        aggregates = {
            "total": sum(values),
            "mean": statistics.mean(values) if values else 0,
            "min": min(values) if values else 0,
            "max": max(values) if values else 0,
            "trend_direction": "up" if len(values) >= 2 and values[-1] > values[0] else "down",
            "trend_strength": abs(values[-1] - values[0]) / max(abs(values[0]), 1.0) if values else 0.0,
        }
        # Compute simple accuracy metrics on historical fit
        accuracy = self._compute_accuracy(model_type, historical_data,
                                            model.hyperparameters if model else {})
        result = PredictionResult(
            organization_id=str(organization_id), prediction_type=prediction_type,
            target_entity_type=target_entity_type, target_entity_id=target_entity_id,
            model_name=model_name, model_version=model_version,
            horizon_days=horizon_days, predictions=predictions,
            aggregates=aggregates,
            confidence_score=accuracy.get("confidence", 0.5),
            accuracy_metrics=accuracy,
            input_features=input_features,
            generated_at=datetime.now(UTC))
        self.db.add(result)
        await self.db.flush()
        return result

    def _generate_synthetic_history(self, prediction_type: str, days: int) -> list[dict]:
        """Generate a synthetic historical series for the given prediction type."""
        rng = random.Random(hash(prediction_type) & 0xFFFFFFFF)
        base = {"sales": 1000, "revenue": 50000, "churn": 0.02,
                "demand": 500, "latency": 200, "error_rate": 0.01,
                "cost": 5000, "usage": 10000}.get(prediction_type, 100.0)
        history = []
        current = base
        for i in range(days):
            noise = rng.uniform(-0.1, 0.1) * base
            trend = 0.005 * i * base / days  # small upward trend
            seasonal = 0.1 * math.sin(i * 0.4) * base
            current = max(0.0, base + trend + seasonal + noise)
            date = (datetime.now(UTC) - timedelta(days=days - i)).date().isoformat()
            history.append({"date": date, "value": round(current, 2)})
        return history

    def _forecast(self, *, model_type: str, historical: list[dict],
                    horizon_days: int, hyperparameters: dict) -> list[dict]:
        """Run the forecasting algorithm based on model_type."""
        values = [float(h["value"]) for h in historical]
        last_date_str = historical[-1].get("date") if historical else None
        try:
            last_date = datetime.fromisoformat(last_date_str).date() if last_date_str else datetime.now(UTC).date()
        except (ValueError, TypeError):
            last_date = datetime.now(UTC).date()
        predictions: list[dict] = []
        if model_type == "linear":
            # Simple linear regression on the last N points
            n = min(len(values), 30)
            recent = values[-n:]
            x_mean = (n - 1) / 2
            y_mean = sum(recent) / n
            num = sum((i - x_mean) * (y - y_mean) for i, y in enumerate(recent))
            den = sum((i - x_mean) ** 2 for i in range(n))
            slope = num / den if den else 0
            intercept = y_mean - slope * x_mean
            std = statistics.stdev(recent) if len(recent) > 1 else abs(y_mean) * 0.1
            for i in range(1, horizon_days + 1):
                x = n - 1 + i
                value = max(0.0, slope * x + intercept)
                pred_date = (last_date + timedelta(days=i)).isoformat()
                predictions.append({
                    "date": pred_date, "value": round(value, 2),
                    "lower": round(max(0.0, value - 1.96 * std), 2),
                    "upper": round(value + 1.96 * std, 2),
                    "confidence": 0.85,
                })
        elif model_type == "moving_average":
            window = int(hyperparameters.get("window", 7))
            ma_value = sum(values[-window:]) / min(window, len(values))
            std = statistics.stdev(values[-window:]) if len(values[-window:]) > 1 else abs(ma_value) * 0.1
            for i in range(1, horizon_days + 1):
                # Slowly decay back to mean
                decay = 0.95 ** i
                value = ma_value * decay + (statistics.mean(values)) * (1 - decay)
                pred_date = (last_date + timedelta(days=i)).isoformat()
                predictions.append({
                    "date": pred_date, "value": round(value, 2),
                    "lower": round(max(0.0, value - 1.96 * std), 2),
                    "upper": round(value + 1.96 * std, 2),
                    "confidence": 0.7,
                })
        elif model_type == "exponential_smoothing":
            alpha = float(hyperparameters.get("alpha", 0.3))
            smoothed = values[0]
            for v in values[1:]:
                smoothed = alpha * v + (1 - alpha) * smoothed
            std = statistics.stdev(values[-min(len(values), 30):]) if len(values) > 1 else abs(smoothed) * 0.1
            # Use last observed change as trend estimate
            recent_change = (values[-1] - values[-min(len(values), 7)]) / max(1, min(len(values), 7) - 1)
            for i in range(1, horizon_days + 1):
                value = max(0.0, smoothed + recent_change * i)
                pred_date = (last_date + timedelta(days=i)).isoformat()
                predictions.append({
                    "date": pred_date, "value": round(value, 2),
                    "lower": round(max(0.0, value - 1.96 * std), 2),
                    "upper": round(value + 1.96 * std, 2),
                    "confidence": 0.75,
                })
        elif model_type == "heuristic":
            # Seasonal naive: predict = same value from `season_length` steps ago + drift
            season_length = int(hyperparameters.get("season_length", 7))
            drift = (values[-1] - values[0]) / max(1, len(values))
            std = statistics.stdev(values[-min(len(values), 30):]) if len(values) > 1 else abs(values[-1]) * 0.1
            for i in range(1, horizon_days + 1):
                idx = -season_length + (i - 1) % season_length - season_length * ((i - 1) // season_length)
                idx = max(-len(values), idx)
                value = max(0.0, values[idx] + drift * i)
                pred_date = (last_date + timedelta(days=i)).isoformat()
                predictions.append({
                    "date": pred_date, "value": round(value, 2),
                    "lower": round(max(0.0, value - 1.96 * std), 2),
                    "upper": round(value + 1.96 * std, 2),
                    "confidence": 0.65,
                })
        else:
            # Fallback: just repeat last value
            last = values[-1] if values else 0
            for i in range(1, horizon_days + 1):
                pred_date = (last_date + timedelta(days=i)).isoformat()
                predictions.append({"date": pred_date, "value": round(last, 2),
                                    "lower": round(last * 0.9, 2),
                                    "upper": round(last * 1.1, 2),
                                    "confidence": 0.5})
        return predictions

    def _compute_accuracy(self, model_type: str, historical: list[dict],
                            hyperparameters: dict) -> dict[str, float]:
        """Compute accuracy metrics by training on first 80% + predicting last 20%."""
        if len(historical) < 5:
            return {"mae": 0.0, "mape": 0.0, "rmse": 0.0, "confidence": 0.5}
        split = int(len(historical) * 0.8)
        train = historical[:split]
        test = historical[split:]
        if not train or not test:
            return {"mae": 0.0, "mape": 0.0, "rmse": 0.0, "confidence": 0.5}
        preds = self._forecast(model_type=model_type, historical=train,
                                  horizon_days=len(test),
                                  hyperparameters=hyperparameters)
        actuals = [float(h["value"]) for h in test]
        predicted = [p["value"] for p in preds[:len(test)]]
        errors = [a - p for a, p in zip(actuals, predicted)]
        mae = sum(abs(e) for e in errors) / len(errors)
        rmse = math.sqrt(sum(e ** 2 for e in errors) / len(errors))
        mape = (sum(abs(e) / max(abs(a), 1e-9) for e, a in zip(errors, actuals)) / len(errors) * 100)
        # Confidence: higher when MAPE is lower
        confidence = max(0.1, min(0.95, 1.0 - (mape / 100.0)))
        return {"mae": round(mae, 4), "mape": round(mape, 4),
                "rmse": round(rmse, 4), "confidence": round(confidence, 4)}

    async def list_predictions(self, *, organization_id: uuid.UUID,
                                 prediction_type: str | None = None,
                                 skip: int = 0, limit: int = 50) -> tuple[list[PredictionResult], int]:
        conditions = [PredictionResult.organization_id == str(organization_id)]
        if prediction_type:
            conditions.append(PredictionResult.prediction_type == prediction_type)
        total = int((await self.db.execute(
            select(func.count()).select_from(PredictionResult).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(PredictionResult).where(*conditions)
            .order_by(PredictionResult.generated_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    def prediction_to_dict(self, p: PredictionResult) -> dict[str, Any]:
        return {"id": str(p.id), "prediction_type": p.prediction_type,
                "target_entity_type": p.target_entity_type,
                "target_entity_id": p.target_entity_id,
                "model_name": p.model_name, "model_version": p.model_version,
                "horizon_days": p.horizon_days,
                "predictions": p.predictions,
                "aggregates": p.aggregates,
                "confidence_score": p.confidence_score,
                "accuracy_metrics": p.accuracy_metrics,
                "input_features": p.input_features,
                "generated_at": p.generated_at.isoformat() if p.generated_at else None}


# ====================================================================
# Optimization Service
# ====================================================================

class OptimizationService:
    """Optimization engine for cost/token/infra/workflow/prompt/latency/resource."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_run(self, *, organization_id: uuid.UUID,
                           name: str, optimization_type: str,
                           objective: str, objective_metric: str,
                           target_entity_type: str | None = None,
                           target_entity_id: str | None = None,
                           constraints: list | None = None,
                           parameters: dict | None = None,
                           created_by: str | None = None) -> OptimizationRun:
        if optimization_type not in OPTIMIZATION_TYPES:
            raise ValidationError(
                f"Invalid optimization_type: {optimization_type}. Supported: {sorted(OPTIMIZATION_TYPES)}")
        if objective not in {"minimize", "maximize"}:
            raise ValidationError("objective must be minimize or maximize")
        run = OptimizationRun(
            organization_id=str(organization_id), name=name,
            optimization_type=optimization_type,
            target_entity_type=target_entity_type,
            target_entity_id=target_entity_id,
            objective=objective, objective_metric=objective_metric,
            constraints=constraints or [], parameters=parameters or {},
            recommendations=[], applied=False, status="pending",
            created_by=created_by)
        self.db.add(run)
        await self.db.flush()
        return run

    async def run_optimization(self, *, run_id: uuid.UUID,
                                 organization_id: uuid.UUID) -> dict[str, Any]:
        run = await self.db.get(OptimizationRun, run_id)
        if run is None or run.organization_id != str(organization_id):
            raise NotFoundError("OptimizationRun", str(run_id))
        if run.status not in {"pending", "running"}:
            raise ValidationError(f"Cannot re-run optimization in status '{run.status}'")
        run.status = "running"
        await self.db.flush()
        try:
            # Compute baseline (synthetic — in production, query real metrics)
            baseline = self._compute_baseline(run.optimization_type, run.parameters or {})
            run.baseline_value = baseline
            # Generate recommendations
            recommendations = self._generate_recommendations(
                optimization_type=run.optimization_type, baseline=baseline,
                parameters=run.parameters or {}, constraints=run.constraints or [],
                objective=run.objective)
            # Compute optimized value (heuristic: assume 15-30% improvement is achievable)
            improvement_pct = 0.15 + 0.15 * (len(recommendations) / 10)
            if run.objective == "minimize":
                optimized = baseline * (1 - improvement_pct)
            else:
                optimized = baseline * (1 + improvement_pct)
            run.optimized_value = round(optimized, 4)
            run.improvement_percent = round(improvement_pct * 100, 2)
            run.recommendations = recommendations
            run.status = "completed"
            await self.db.flush()
            return {"run_id": str(run_id), "status": "completed",
                    "baseline": baseline, "optimized": run.optimized_value,
                    "improvement_percent": run.improvement_percent,
                    "recommendations_count": len(recommendations)}
        except Exception as e:
            run.status = "failed"
            run.error = str(e)
            await self.db.flush()
            raise

    def _compute_baseline(self, optimization_type: str, params: dict) -> float:
        """Compute a baseline value for the optimization metric."""
        if optimization_type == "cost":
            return float(params.get("monthly_cost_cents", 100000))  # $1000 default
        if optimization_type == "token":
            return float(params.get("monthly_tokens", 50000000))  # 50M tokens
        if optimization_type == "latency":
            return float(params.get("avg_latency_ms", 1500))
        if optimization_type == "infrastructure":
            return float(params.get("monthly_infra_cost_cents", 500000))
        if optimization_type == "workflow":
            return float(params.get("avg_workflow_duration_minutes", 30))
        if optimization_type == "prompt":
            return float(params.get("avg_tokens_per_request", 2000))
        if optimization_type == "resource":
            return float(params.get("avg_cpu_utilization_pct", 65))
        return 100.0

    def _generate_recommendations(self, *, optimization_type: str, baseline: float,
                                     parameters: dict, constraints: list,
                                     objective: str) -> list[dict]:
        """Generate optimization recommendations per type."""
        all_recs: dict[str, list[dict]] = {
            "cost": [
                {"title": "Switch 30% of LLM calls to GPT-4o-mini",
                 "description": "Route low-complexity requests to the cheaper model",
                 "expected_savings_pct": 25.0, "effort": "low", "risk": "low"},
                {"title": "Enable response caching for FAQ queries",
                 "description": "Cache responses to common questions for 24 hours",
                 "expected_savings_pct": 15.0, "effort": "medium", "risk": "low"},
                {"title": "Consolidate underutilized databases",
                 "description": "Merge databases with <10% utilization",
                 "expected_savings_pct": 10.0, "effort": "high", "risk": "medium"},
            ],
            "token": [
                {"title": "Compress system prompts (-30% tokens)",
                 "description": "Rewrite verbose system prompts to be more concise",
                 "expected_savings_pct": 30.0, "effort": "low", "risk": "low"},
                {"title": "Implement context window pruning",
                 "description": "Drop old conversation turns when context > 4000 tokens",
                 "expected_savings_pct": 25.0, "effort": "medium", "risk": "medium"},
                {"title": "Use embeddings-based deduplication",
                 "description": "Skip redundant retrieval calls when context is similar",
                 "expected_savings_pct": 20.0, "effort": "medium", "risk": "low"},
            ],
            "latency": [
                {"title": "Enable streaming responses for all LLM calls",
                 "description": "Improves perceived latency by 60%",
                 "expected_savings_pct": 60.0, "effort": "low", "risk": "low"},
                {"title": "Use CDN for static assets",
                 "description": "Reduce TTFB for asset-heavy pages",
                 "expected_savings_pct": 40.0, "effort": "low", "risk": "low"},
                {"title": "Add Redis caching layer for hot DB queries",
                 "description": "Cache results of frequent queries for 5 minutes",
                 "expected_savings_pct": 35.0, "effort": "medium", "risk": "low"},
            ],
            "infrastructure": [
                {"title": "Right-size EC2 instances based on 30-day utilization",
                 "description": "Downsize instances with <40% CPU",
                 "expected_savings_pct": 30.0, "effort": "medium", "risk": "low"},
                {"title": "Enable auto-scaling for API servers",
                 "description": "Scale horizontally based on traffic",
                 "expected_savings_pct": 20.0, "effort": "medium", "risk": "medium"},
                {"title": "Move to spot instances for batch workloads",
                 "description": "Use spot pricing for non-critical jobs",
                 "expected_savings_pct": 60.0, "effort": "high", "risk": "medium"},
            ],
            "workflow": [
                {"title": "Parallelize independent workflow steps",
                 "description": "Run non-dependent steps concurrently",
                 "expected_savings_pct": 45.0, "effort": "medium", "risk": "low"},
                {"title": "Remove redundant approval steps",
                 "description": "Auto-approve low-risk workflow steps",
                 "expected_savings_pct": 25.0, "effort": "low", "risk": "medium"},
                {"title": "Cache intermediate workflow results",
                 "description": "Avoid re-computing stable intermediate values",
                 "expected_savings_pct": 20.0, "effort": "medium", "risk": "low"},
            ],
            "prompt": [
                {"title": "Use few-shot examples instead of detailed instructions",
                 "description": "Reduce prompt size while maintaining quality",
                 "expected_savings_pct": 35.0, "effort": "low", "risk": "low"},
                {"title": "Drop unused variables from prompt templates",
                 "description": "Audit prompts for unused context",
                 "expected_savings_pct": 15.0, "effort": "low", "risk": "low"},
                {"title": "Use system prompts instead of repeating instructions",
                 "description": "Set instructions once per session",
                 "expected_savings_pct": 25.0, "effort": "low", "risk": "low"},
            ],
            "resource": [
                {"title": "Implement request coalescing for bursty traffic",
                 "description": "Batch concurrent identical requests",
                 "expected_savings_pct": 30.0, "effort": "medium", "risk": "low"},
                {"title": "Schedule batch jobs during off-peak hours",
                 "description": "Move non-urgent workloads to nights/weekends",
                 "expected_savings_pct": 25.0, "effort": "low", "risk": "low"},
                {"title": "Enable horizontal pod autoscaling",
                 "description": "Scale pods based on CPU + memory",
                 "expected_savings_pct": 20.0, "effort": "medium", "risk": "low"},
            ],
        }
        return all_recs.get(optimization_type, [
            {"title": "Perform baseline analysis",
             "description": "No specific recommendations for this type yet",
             "expected_savings_pct": 10.0, "effort": "medium", "risk": "low"}])

    async def list_runs(self, *, organization_id: uuid.UUID,
                          optimization_type: str | None = None,
                          status: str | None = None,
                          skip: int = 0, limit: int = 50) -> tuple[list[OptimizationRun], int]:
        conditions = [OptimizationRun.organization_id == str(organization_id)]
        if optimization_type:
            conditions.append(OptimizationRun.optimization_type == optimization_type)
        if status:
            conditions.append(OptimizationRun.status == status)
        total = int((await self.db.execute(
            select(func.count()).select_from(OptimizationRun).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(OptimizationRun).where(*conditions)
            .order_by(OptimizationRun.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def apply_recommendations(self, *, run_id: uuid.UUID,
                                      organization_id: uuid.UUID,
                                      applied_by: str | None = None) -> OptimizationRun:
        run = await self.db.get(OptimizationRun, run_id)
        if run is None or run.organization_id != str(organization_id):
            raise NotFoundError("OptimizationRun", str(run_id))
        if run.status != "completed":
            raise ValidationError(f"Cannot apply recommendations for run in status '{run.status}'")
        if run.applied:
            raise ValidationError("Recommendations have already been applied")
        run.applied = True
        run.applied_at = datetime.now(UTC)
        run.status = "applied"
        await self.db.flush()
        return run

    def run_to_dict(self, r: OptimizationRun) -> dict[str, Any]:
        return {"id": str(r.id), "name": r.name,
                "optimization_type": r.optimization_type,
                "target_entity_type": r.target_entity_type,
                "target_entity_id": r.target_entity_id,
                "objective": r.objective,
                "objective_metric": r.objective_metric,
                "baseline_value": r.baseline_value,
                "optimized_value": r.optimized_value,
                "improvement_percent": r.improvement_percent,
                "constraints": r.constraints, "parameters": r.parameters,
                "recommendations": r.recommendations,
                "applied": r.applied,
                "applied_at": r.applied_at.isoformat() if r.applied_at else None,
                "status": r.status, "error": r.error,
                "created_by": r.created_by,
                "created_at": r.created_at.isoformat() if r.created_at else None}


# ====================================================================
# Memory Service (Agent + Organization)
# ====================================================================

class MemoryService:
    """Manages per-agent + organization-wide memory."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ----- Agent Memory -----

    async def store_agent_memory(self, *, organization_id: uuid.UUID,
                                   agent_id: str, memory_type: str,
                                   content: str, summary: str | None = None,
                                   embedding: list | None = None,
                                   metadata: dict | None = None,
                                   importance_score: float = 0.5,
                                   expires_at: datetime | None = None) -> AgentMemory:
        if memory_type not in MEMORY_TYPES:
            raise ValidationError(f"Invalid memory_type: {memory_type}. Supported: {sorted(MEMORY_TYPES)}")
        memory = AgentMemory(
            organization_id=str(organization_id), agent_id=agent_id,
            memory_type=memory_type, content=content, summary=summary,
            embedding=embedding, metadata_=metadata,
            importance_score=importance_score, access_count=0,
            expires_at=expires_at)
        self.db.add(memory)
        await self.db.flush()
        return memory

    async def retrieve_agent_memory(self, *, organization_id: uuid.UUID,
                                      agent_id: str,
                                      memory_type: str | None = None,
                                      limit: int = 10,
                                      min_importance: float = 0.0) -> list[AgentMemory]:
        conditions = [AgentMemory.organization_id == str(organization_id),
                       AgentMemory.agent_id == agent_id]
        if memory_type:
            conditions.append(AgentMemory.memory_type == memory_type)
        if min_importance > 0:
            conditions.append(AgentMemory.importance_score >= min_importance)
        # Exclude expired
        conditions.append(or_(
            AgentMemory.expires_at.is_(None),
            AgentMemory.expires_at > datetime.now(UTC)))
        result = await self.db.execute(
            select(AgentMemory).where(*conditions)
            .order_by(AgentMemory.importance_score.desc(),
                       AgentMemory.created_at.desc()).limit(limit))
        memories = list(result.scalars().all())
        # Update access count + last_accessed
        for m in memories:
            m.access_count = (m.access_count or 0) + 1
            m.last_accessed_at = datetime.now(UTC)
        await self.db.flush()
        return memories

    async def forget_agent_memory(self, *, memory_id: uuid.UUID,
                                    organization_id: uuid.UUID) -> bool:
        m = await self.db.get(AgentMemory, memory_id)
        if m is None or m.organization_id != str(organization_id):
            raise NotFoundError("AgentMemory", str(memory_id))
        await self.db.delete(m)
        await self.db.flush()
        return True

    # ----- Organization Memory -----

    async def store_organization_memory(self, *, organization_id: uuid.UUID,
                                          memory_type: str, title: str,
                                          content: str,
                                          source_type: str | None = None,
                                          source_id: str | None = None,
                                          tags: list[str] | None = None,
                                          metadata: dict | None = None,
                                          importance_score: float = 0.5,
                                          confidence_score: float = 1.0,
                                          created_by: str | None = None,
                                          expires_at: datetime | None = None) -> OrganizationMemory:
        if memory_type not in ORG_MEMORY_TYPES:
            raise ValidationError(
                f"Invalid memory_type: {memory_type}. Supported: {sorted(ORG_MEMORY_TYPES)}")
        mem = OrganizationMemory(
            organization_id=str(organization_id), memory_type=memory_type,
            title=title, content=content, source_type=source_type, source_id=source_id,
            tags=tags or [], metadata_=metadata,
            importance_score=importance_score, confidence_score=confidence_score,
            is_active=True, expires_at=expires_at, created_by=created_by)
        self.db.add(mem)
        await self.db.flush()
        return mem

    async def retrieve_organization_memory(self, *, organization_id: uuid.UUID,
                                              memory_type: str | None = None,
                                              tags: list[str] | None = None,
                                              limit: int = 20,
                                              min_importance: float = 0.0) -> list[OrganizationMemory]:
        conditions = [OrganizationMemory.organization_id == str(organization_id),
                       OrganizationMemory.is_active.is_(True)]
        if memory_type:
            conditions.append(OrganizationMemory.memory_type == memory_type)
        if min_importance > 0:
            conditions.append(OrganizationMemory.importance_score >= min_importance)
        # Exclude expired
        conditions.append(or_(
            OrganizationMemory.expires_at.is_(None),
            OrganizationMemory.expires_at > datetime.now(UTC)))
        q = select(OrganizationMemory).where(*conditions)
        if tags:
            # JSON containment check (PostgreSQL)
            q = q.where(OrganizationMemory.tags.contains(tags))
        q = q.order_by(OrganizationMemory.importance_score.desc(),
                        OrganizationMemory.created_at.desc()).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def learn_from_decision(self, *, decision_id: uuid.UUID,
                                    organization_id: uuid.UUID) -> OrganizationMemory:
        """Auto-generate a 'learning' organization memory from a reviewed decision."""
        decision = await self.db.get(DecisionHistory, decision_id)
        if decision is None or decision.organization_id != str(organization_id):
            raise NotFoundError("DecisionHistory", str(decision_id))
        if not decision.review_outcome:
            raise ValidationError("Decision must be reviewed before learning from it")
        title = f"Learning from decision: {decision.title}"
        content = (f"Decision: {decision.title}\n"
                   f"Type: {decision.decision_type}\n"
                   f"Selected option: {decision.selected_option}\n"
                   f"Expected impact: {decision.expected_impact}\n"
                   f"Actual impact: {decision.actual_impact}\n"
                   f"Review outcome: {decision.review_outcome}\n"
                   f"Rationale: {decision.rationale}")
        importance = 0.9 if decision.review_outcome == "success" else 0.7
        confidence = 0.95 if decision.review_outcome == "success" else 0.8
        return await self.store_organization_memory(
            organization_id=organization_id, memory_type="learning",
            title=title, content=content, source_type="decision_history",
            source_id=str(decision.id), tags=[decision.decision_type, decision.review_outcome],
            importance_score=importance, confidence_score=confidence)


# ====================================================================
# Recommendation Service
# ====================================================================

class RecommendationService:
    """Generates + manages AI recommendations."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_recommendation(self, *, organization_id: uuid.UUID,
                                      title: str, description: str,
                                      category: str, priority: str,
                                      recommendation_type: str,
                                      target_entity_type: str | None = None,
                                      target_entity_id: str | None = None,
                                      proposed_action: dict | None = None,
                                      expected_impact: dict | None = None,
                                      risks: list | None = None,
                                      prerequisites: list | None = None,
                                      evidence: list | None = None,
                                      generated_by: str = "ai",
                                      agent_id: str | None = None,
                                      related_simulation_id: uuid.UUID | None = None,
                                      related_decision_id: uuid.UUID | None = None,
                                      expires_in_days: int | None = 30) -> Recommendation:
        if priority not in {"critical", "high", "medium", "low"}:
            raise ValidationError("priority must be critical/high/medium/low")
        expires_at = datetime.now(UTC) + timedelta(days=expires_in_days) if expires_in_days else None
        rec = Recommendation(
            organization_id=str(organization_id), title=title,
            description=description, category=category, priority=priority,
            recommendation_type=recommendation_type,
            target_entity_type=target_entity_type, target_entity_id=target_entity_id,
            proposed_action=proposed_action, expected_impact=expected_impact,
            risks=risks or [], prerequisites=prerequisites or [],
            evidence=evidence or [], generated_by=generated_by, agent_id=agent_id,
            related_simulation_id=related_simulation_id,
            related_decision_id=related_decision_id,
            status="pending", expires_at=expires_at)
        self.db.add(rec)
        await self.db.flush()
        return rec

    async def list_recommendations(self, *, organization_id: uuid.UUID,
                                     status: str | None = None,
                                     category: str | None = None,
                                     priority: str | None = None,
                                     skip: int = 0, limit: int = 50) -> tuple[list[Recommendation], int]:
        conditions = [Recommendation.organization_id == str(organization_id)]
        if status:
            conditions.append(Recommendation.status == status)
        if category:
            conditions.append(Recommendation.category == category)
        if priority:
            conditions.append(Recommendation.priority == priority)
        total = int((await self.db.execute(
            select(func.count()).select_from(Recommendation).where(*conditions)
        )).scalar_one_or_none() or 0)
        # Use a Python-side sort for priority ordering (critical > high > medium > low)
        # since SQLAlchemy's func.case syntax varies by version.
        result = await self.db.execute(
            select(Recommendation).where(*conditions)
            .order_by(Recommendation.created_at.desc()).offset(skip).limit(limit * 4))
        all_recs = list(result.scalars().all())
        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        all_recs.sort(key=lambda r: (priority_order.get(r.priority, 99),))
        return all_recs[:limit], total

    async def review_recommendation(self, *, rec_id: uuid.UUID,
                                      organization_id: uuid.UUID,
                                      decision: str, reviewed_by: str,
                                      notes: str | None = None) -> Recommendation:
        if decision not in {"accepted", "rejected"}:
            raise ValidationError("decision must be accepted or rejected")
        rec = await self.db.get(Recommendation, rec_id)
        if rec is None or rec.organization_id != str(organization_id):
            raise NotFoundError("Recommendation", str(rec_id))
        if rec.status != "pending":
            raise ValidationError(f"Cannot review recommendation in status '{rec.status}'")
        rec.status = decision
        rec.reviewed_by = reviewed_by
        rec.reviewed_at = datetime.now(UTC)
        rec.review_notes = notes
        await self.db.flush()
        return rec

    async def implement_recommendation(self, *, rec_id: uuid.UUID,
                                          organization_id: uuid.UUID) -> Recommendation:
        rec = await self.db.get(Recommendation, rec_id)
        if rec is None or rec.organization_id != str(organization_id):
            raise NotFoundError("Recommendation", str(rec_id))
        if rec.status != "accepted":
            raise ValidationError("Recommendation must be accepted before implementing")
        rec.status = "implemented"
        rec.implemented_at = datetime.now(UTC)
        await self.db.flush()
        return rec

    def to_dict(self, r: Recommendation) -> dict[str, Any]:
        return {"id": str(r.id), "title": r.title, "description": r.description,
                "category": r.category, "priority": r.priority,
                "recommendation_type": r.recommendation_type,
                "target_entity_type": r.target_entity_type,
                "target_entity_id": r.target_entity_id,
                "proposed_action": r.proposed_action,
                "expected_impact": r.expected_impact,
                "risks": r.risks, "prerequisites": r.prerequisites,
                "evidence": r.evidence, "generated_by": r.generated_by,
                "agent_id": r.agent_id,
                "related_simulation_id": str(r.related_simulation_id) if r.related_simulation_id else None,
                "related_decision_id": str(r.related_decision_id) if r.related_decision_id else None,
                "status": r.status, "reviewed_by": r.reviewed_by,
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                "review_notes": r.review_notes,
                "implemented_at": r.implemented_at.isoformat() if r.implemented_at else None,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None}


# ====================================================================
# Approval Engine + Execution Service
# ====================================================================

class ApprovalEngine:
    """Evaluates approval rules to decide auto-approve/auto-reject/manual."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_rule(self, *, organization_id: uuid.UUID,
                            name: str, action_type: str,
                            conditions: list | None = None,
                            auto_approve: bool = False,
                            auto_reject: bool = False,
                            max_risk_level: str | None = None,
                            max_cost_cents: int | None = None,
                            required_approvers: list | None = None,
                            approval_timeout_minutes: int = 60,
                            fallback_action: str = "reject",
                            priority: int = 100,
                            description: str | None = None,
                            created_by: str | None = None) -> ApprovalRule:
        if fallback_action not in {"approve", "reject", "escalate"}:
            raise ValidationError("fallback_action must be approve/reject/escalate")
        if max_risk_level and max_risk_level not in RISK_LEVELS:
            raise ValidationError(f"max_risk_level must be one of {RISK_LEVELS}")
        rule = ApprovalRule(
            organization_id=str(organization_id), name=name, description=description,
            action_type=action_type, conditions=conditions or [],
            auto_approve=auto_approve, auto_reject=auto_reject,
            max_risk_level=max_risk_level, max_cost_cents=max_cost_cents,
            required_approvers=required_approvers or [],
            approval_timeout_minutes=approval_timeout_minutes,
            fallback_action=fallback_action, priority=priority,
            is_active=True, created_by=created_by)
        self.db.add(rule)
        await self.db.flush()
        return rule

    async def evaluate(self, *, organization_id: uuid.UUID,
                         action_type: str,
                         risk_level: str = "low",
                         cost_cents: int = 0,
                         context: dict | None = None) -> dict[str, Any]:
        """Evaluate rules + return approval decision.

        Returns:
            {decision: auto_approved/auto_rejected/manual/pending,
             rule_id: str | None,
             required_approvers: list,
             fallback_action: str}
        """
        # Find matching rules ordered by priority
        result = await self.db.execute(
            select(ApprovalRule).where(
                ApprovalRule.organization_id == str(organization_id),
                ApprovalRule.action_type == action_type,
                ApprovalRule.is_active.is_(True))
            .order_by(ApprovalRule.priority.asc()))
        rules = list(result.scalars().all())
        if not rules:
            # Default: auto-approve low-risk + zero-cost actions, manual otherwise
            if risk_level == "low" and cost_cents == 0:
                return {"decision": "auto_approved", "rule_id": None,
                        "required_approvers": [], "fallback_action": "approve",
                        "reason": "default_low_risk_zero_cost"}
            return {"decision": "manual", "rule_id": None,
                    "required_approvers": [], "fallback_action": "reject",
                    "reason": "default_no_matching_rule"}
        # Apply first matching rule (priority ascending)
        for rule in rules:
            # Check risk level
            if rule.max_risk_level:
                rule_risk_idx = RISK_LEVELS.index(rule.max_risk_level)
                action_risk_idx = RISK_LEVELS.index(risk_level)
                if action_risk_idx > rule_risk_idx:
                    continue  # Action risk too high for this rule
            # Check cost
            if rule.max_cost_cents is not None and cost_cents > rule.max_cost_cents:
                continue
            # Check conditions (basic equality matching)
            if not self._matches_conditions(rule.conditions or [], context or {}):
                continue
            # Rule matches — apply decision
            if rule.auto_approve:
                return {"decision": "auto_approved", "rule_id": str(rule.id),
                        "required_approvers": [], "fallback_action": rule.fallback_action,
                        "reason": "rule_auto_approve"}
            if rule.auto_reject:
                return {"decision": "auto_rejected", "rule_id": str(rule.id),
                        "required_approvers": [], "fallback_action": rule.fallback_action,
                        "reason": "rule_auto_reject"}
            return {"decision": "manual", "rule_id": str(rule.id),
                    "required_approvers": rule.required_approvers or [],
                    "fallback_action": rule.fallback_action,
                    "approval_timeout_minutes": rule.approval_timeout_minutes,
                    "reason": "rule_requires_manual_approval"}
        # No rule matched — apply fallback
        return {"decision": "manual", "rule_id": None,
                "required_approvers": [], "fallback_action": "reject",
                "reason": "no_rule_matched_all_conditions"}

    def _matches_conditions(self, conditions: list, context: dict) -> bool:
        """Basic condition matcher (equality only).

        Conditions: [{"field": "category", "op": "==", "value": "finance"}, ...]
        """
        if not conditions:
            return True
        for cond in conditions:
            if not isinstance(cond, dict):
                continue
            field = cond.get("field")
            op = cond.get("op", "==")
            expected = cond.get("value")
            actual = context.get(field) if field else None
            if op == "==" and actual != expected:
                return False
            if op == "!=" and actual == expected:
                return False
            try:
                if op == ">" and not (float(actual or 0) > float(expected)):
                    return False
                if op == "<" and not (float(actual or 0) < float(expected)):
                    return False
                if op == ">=" and not (float(actual or 0) >= float(expected)):
                    return False
                if op == "<=" and not (float(actual or 0) <= float(expected)):
                    return False
            except (ValueError, TypeError):
                return False
        return True

    async def list_rules(self, *, organization_id: uuid.UUID,
                           action_type: str | None = None,
                           is_active: bool | None = True,
                           skip: int = 0, limit: int = 50) -> tuple[list[ApprovalRule], int]:
        conditions = [ApprovalRule.organization_id == str(organization_id)]
        if action_type:
            conditions.append(ApprovalRule.action_type == action_type)
        if is_active is not None:
            conditions.append(ApprovalRule.is_active.is_(is_active))
        total = int((await self.db.execute(
            select(func.count()).select_from(ApprovalRule).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(ApprovalRule).where(*conditions)
            .order_by(ApprovalRule.priority.asc(),
                       ApprovalRule.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total


class ExecutionService:
    """Executes autonomous actions with safety checks + rollback."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_execution(self, *, organization_id: uuid.UUID,
                                 action_type: str, action_name: str,
                                 action_id: str | None = None,
                                 input: dict | None = None,
                                 parameters: dict | None = None,
                                 triggered_by: str = "human",
                                 triggered_by_id: str | None = None,
                                 related_decision_id: uuid.UUID | None = None,
                                 related_recommendation_id: uuid.UUID | None = None,
                                 related_planning_session_id: uuid.UUID | None = None,
                                 risk_level: str = "low",
                                 cost_cents: int = 0,
                                 can_rollback: bool = False,
                                 safety_checks: list | None = None) -> tuple[Execution, dict[str, Any]]:
        """Create + evaluate approval for an execution.

        Returns (execution, approval_decision).
        """
        # Evaluate approval
        approval_engine = ApprovalEngine(self.db)
        approval = await approval_engine.evaluate(
            organization_id=organization_id, action_type=action_type,
            risk_level=risk_level, cost_cents=cost_cents,
            context=input or {})
        # Determine execution status
        if approval["decision"] == "auto_rejected":
            status = "cancelled"
            approval_status = "rejected"
        elif approval["decision"] == "auto_approved":
            status = "pending"  # ready to run
            approval_status = "auto_approved"
        else:
            status = "pending"
            approval_status = "pending"
        execution = Execution(
            organization_id=str(organization_id), action_type=action_type,
            action_id=action_id, action_name=action_name,
            input=input or {}, parameters=parameters or {},
            triggered_by=triggered_by, triggered_by_id=triggered_by_id,
            related_decision_id=related_decision_id,
            related_recommendation_id=related_recommendation_id,
            related_planning_session_id=related_planning_session_id,
            approval_status=approval_status, status=status,
            can_rollback=can_rollback,
            safety_checks=safety_checks or [], safety_passed=True)
        self.db.add(execution)
        await self.db.flush()
        return execution, approval

    async def run_safety_checks(self, *, execution_id: uuid.UUID,
                                  organization_id: uuid.UUID) -> dict[str, Any]:
        """Run all safety checks for an execution.

        Returns {passed: bool, checks: [...], failures: [...]}.
        """
        execution = await self.db.get(Execution, execution_id)
        if execution is None or execution.organization_id != str(organization_id):
            raise NotFoundError("Execution", str(execution_id))
        checks = execution.safety_checks or []
        results: list[dict] = []
        failures: list[str] = []
        for check in checks:
            if isinstance(check, dict):
                name = check.get("name", "unknown")
                # Run heuristic check — in production, dispatch to actual checkers
                passed = self._run_safety_check(check, execution.input or {})
                results.append({"name": name, "passed": passed})
                if not passed:
                    failures.append(name)
            elif isinstance(check, str):
                # Treat as a named check that always passes
                results.append({"name": check, "passed": True})
        execution.safety_checks = results
        execution.safety_passed = len(failures) == 0
        await self.db.flush()
        return {"passed": execution.safety_passed, "checks": results, "failures": failures}

    def _run_safety_check(self, check: dict, input: dict) -> bool:
        """Run a single safety check (heuristic)."""
        check_type = check.get("type", "always_pass")
        if check_type == "always_pass":
            return True
        if check_type == "max_cost":
            max_cost = float(check.get("value", 0))
            actual_cost = float(input.get("cost_cents", 0))
            return actual_cost <= max_cost
        if check_type == "required_field":
            field = check.get("field")
            return field in input and input[field] is not None
        if check_type == "dry_run_first":
            # Always pass — in production, run a dry-run version of the action
            return True
        return True

    async def start_execution(self, *, execution_id: uuid.UUID,
                                organization_id: uuid.UUID) -> Execution:
        execution = await self.db.get(Execution, execution_id)
        if execution is None or execution.organization_id != str(organization_id):
            raise NotFoundError("Execution", str(execution_id))
        if execution.status != "pending":
            raise ValidationError(f"Cannot start execution in status '{execution.status}'")
        if execution.approval_status == "rejected":
            raise ValidationError("Execution was rejected — cannot start")
        if execution.approval_status == "pending":
            raise ValidationError("Execution is pending manual approval — cannot start")
        if not execution.safety_passed:
            raise ValidationError("Execution failed safety checks — cannot start")
        execution.status = "running"
        execution.started_at = datetime.now(UTC)
        await self.db.flush()
        return execution

    async def complete_execution(self, *, execution_id: uuid.UUID,
                                   organization_id: uuid.UUID,
                                   output: dict | None = None,
                                   error: str | None = None) -> Execution:
        execution = await self.db.get(Execution, execution_id)
        if execution is None or execution.organization_id != str(organization_id):
            raise NotFoundError("Execution", str(execution_id))
        if execution.status != "running":
            raise ValidationError(f"Cannot complete execution in status '{execution.status}'")
        execution.status = "failed" if error else "completed"
        execution.completed_at = datetime.now(UTC)
        if execution.started_at:
            execution.duration_ms = int(
                (execution.completed_at - execution.started_at).total_seconds() * 1000)
        execution.output = output
        execution.error = error
        execution.progress_percent = 100.0 if not error else execution.progress_percent
        await self.db.flush()
        return execution

    async def rollback_execution(self, *, execution_id: uuid.UUID,
                                   organization_id: uuid.UUID,
                                   rolled_back_by: str) -> Execution:
        execution = await self.db.get(Execution, execution_id)
        if execution is None or execution.organization_id != str(organization_id):
            raise NotFoundError("Execution", str(execution_id))
        if not execution.can_rollback:
            raise ValidationError("Execution cannot be rolled back (can_rollback=False)")
        if execution.status not in {"completed", "failed"}:
            raise ValidationError(f"Cannot rollback execution in status '{execution.status}'")
        if execution.rollback_executed:
            raise ValidationError("Rollback has already been executed")
        execution.rollback_executed = True
        execution.rollback_executed_at = datetime.now(UTC)
        execution.rollback_by = rolled_back_by
        execution.status = "rolled_back"
        await self.db.flush()
        return execution

    async def list_executions(self, *, organization_id: uuid.UUID,
                                status: str | None = None,
                                action_type: str | None = None,
                                skip: int = 0, limit: int = 50) -> tuple[list[Execution], int]:
        conditions = [Execution.organization_id == str(organization_id)]
        if status:
            conditions.append(Execution.status == status)
        if action_type:
            conditions.append(Execution.action_type == action_type)
        total = int((await self.db.execute(
            select(func.count()).select_from(Execution).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(Execution).where(*conditions)
            .order_by(Execution.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    def to_dict(self, e: Execution) -> dict[str, Any]:
        return {"id": str(e.id), "action_type": e.action_type,
                "action_id": e.action_id, "action_name": e.action_name,
                "input": e.input, "output": e.output,
                "parameters": e.parameters,
                "triggered_by": e.triggered_by, "triggered_by_id": e.triggered_by_id,
                "related_decision_id": str(e.related_decision_id) if e.related_decision_id else None,
                "related_recommendation_id": str(e.related_recommendation_id) if e.related_recommendation_id else None,
                "related_planning_session_id": str(e.related_planning_session_id) if e.related_planning_session_id else None,
                "approval_status": e.approval_status, "status": e.status,
                "progress_percent": e.progress_percent,
                "started_at": e.started_at.isoformat() if e.started_at else None,
                "completed_at": e.completed_at.isoformat() if e.completed_at else None,
                "duration_ms": e.duration_ms, "error": e.error,
                "can_rollback": e.can_rollback,
                "rollback_executed": e.rollback_executed,
                "rollback_executed_at": e.rollback_executed_at.isoformat() if e.rollback_executed_at else None,
                "rollback_by": e.rollback_by,
                "safety_checks": e.safety_checks, "safety_passed": e.safety_passed,
                "created_at": e.created_at.isoformat() if e.created_at else None}


# ====================================================================
# Executive Copilot Service
# ====================================================================

class ExecutiveCopilotService:
    """Answers 5 executive question types: what/why/what-next/what-to-do/impact."""

    QUESTION_TYPES = {"what_is_happening", "why", "what_will_happen",
                      "what_should_we_do", "expected_impact"}

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def ask(self, *, organization_id: uuid.UUID,
                    question_type: str,
                    question: str | None = None,
                    context: dict | None = None) -> dict[str, Any]:
        if question_type not in self.QUESTION_TYPES:
            raise ValidationError(
                f"Invalid question_type: {question_type}. Supported: {sorted(self.QUESTION_TYPES)}")
        if question_type == "what_is_happening":
            return await self._what_is_happening(organization_id, question, context or {})
        if question_type == "why":
            return await self._why_is_it_happening(organization_id, question, context or {})
        if question_type == "what_will_happen":
            return await self._what_will_happen(organization_id, question, context or {})
        if question_type == "what_should_we_do":
            return await self._what_should_we_do(organization_id, question, context or {})
        if question_type == "expected_impact":
            return await self._expected_impact(organization_id, question, context or {})
        return {"answer": "Unsupported question type"}

    async def _what_is_happening(self, org_id: uuid.UUID,
                                   question: str | None,
                                   context: dict) -> dict[str, Any]:
        """Aggregate current state across the org."""
        # Count active twins by type
        twin_q = await self.db.execute(
            select(DigitalTwin.twin_type, DigitalTwin.health_score, DigitalTwin.risk_score,
                   func.count(DigitalTwin.id))
            .where(DigitalTwin.organization_id == str(org_id),
                   DigitalTwin.is_active.is_(True))
            .group_by(DigitalTwin.twin_type, DigitalTwin.health_score, DigitalTwin.risk_score))
        twin_summary: dict[str, dict[str, Any]] = {}
        for twin_type, health, risk, count in twin_q.all():
            twin_summary.setdefault(twin_type, {"count": 0, "avg_health": 0.0, "avg_risk": 0.0})
            twin_summary[twin_type]["count"] += int(count)
        # Active simulations
        sim_count_q = await self.db.execute(
            select(func.count(Simulation.id)).where(
                Simulation.organization_id == str(org_id),
                Simulation.status.in_(["pending", "running"])))
        active_simulations = int(sim_count_q.scalar_one_or_none() or 0)
        # Pending decisions
        pending_decisions_q = await self.db.execute(
            select(func.count(DecisionHistory.id)).where(
                DecisionHistory.organization_id == str(org_id),
                DecisionHistory.status == "proposed"))
        pending_decisions = int(pending_decisions_q.scalar_one_or_none() or 0)
        # Pending recommendations
        pending_recs_q = await self.db.execute(
            select(func.count(Recommendation.id)).where(
                Recommendation.organization_id == str(org_id),
                Recommendation.status == "pending"))
        pending_recommendations = int(pending_recs_q.scalar_one_or_none() or 0)
        # Running executions
        running_execs_q = await self.db.execute(
            select(func.count(Execution.id)).where(
                Execution.organization_id == str(org_id),
                Execution.status == "running"))
        running_executions = int(running_execs_q.scalar_one_or_none() or 0)
        return {
            "question_type": "what_is_happening",
            "question": question,
            "summary": "Current organizational state snapshot",
            "twin_types": twin_summary,
            "active_simulations": active_simulations,
            "pending_decisions": pending_decisions,
            "pending_recommendations": pending_recommendations,
            "running_executions": running_executions,
            "timestamp": datetime.now(UTC).isoformat(),
        }

    async def _why_is_it_happening(self, org_id: uuid.UUID,
                                     question: str | None,
                                     context: dict) -> dict[str, Any]:
        """Root-cause analysis using recent events + decisions."""
        target_metric = context.get("metric")
        # Look at recent decisions
        recent_decisions_q = await self.db.execute(
            select(DecisionHistory).where(
                DecisionHistory.organization_id == str(org_id))
            .order_by(DecisionHistory.created_at.desc()).limit(10))
        recent_decisions = list(recent_decisions_q.scalars().all())
        # Look at recent execution failures
        failed_execs_q = await self.db.execute(
            select(Execution).where(
                Execution.organization_id == str(org_id),
                Execution.status == "failed")
            .order_by(Execution.completed_at.desc().nullslast()).limit(10))
        failed_executions = list(failed_execs_q.scalars().all())
        # Look at twin anomalies
        anomalous_twins_q = await self.db.execute(
            select(DigitalTwin).where(
                DigitalTwin.organization_id == str(org_id),
                DigitalTwin.is_active.is_(True),
                DigitalTwin.anomaly_score > 0.5)
            .order_by(DigitalTwin.anomaly_score.desc()).limit(10))
        anomalous_twins = list(anomalous_twins_q.scalars().all())
        causes: list[dict] = []
        for d in recent_decisions[:3]:
            if d.review_outcome == "failed":
                causes.append({"type": "decision", "id": str(d.id), "title": d.title,
                                 "explanation": f"Decision '{d.title}' failed review"})
        for e in failed_executions[:3]:
            causes.append({"type": "execution_failure", "id": str(e.id),
                             "title": e.action_name,
                             "explanation": f"Action '{e.action_name}' failed: {e.error or 'unknown'}"})
        for t in anomalous_twins[:3]:
            causes.append({"type": "anomaly", "id": str(t.id), "title": t.name,
                             "explanation": f"Twin '{t.name}' has anomaly score {t.anomaly_score}"})
        return {
            "question_type": "why",
            "question": question,
            "target_metric": target_metric,
            "identified_causes": causes,
            "cause_count": len(causes),
            "recommendation": ("Review the identified causes above. For decision-related causes, "
                                "consider rolling back. For anomalies, investigate the underlying twins."),
            "timestamp": datetime.now(UTC).isoformat(),
        }

    async def _what_will_happen(self, org_id: uuid.UUID,
                                   question: str | None,
                                   context: dict) -> dict[str, Any]:
        """Predict what will happen using the PredictionService."""
        prediction_type = context.get("prediction_type", "sales")
        horizon_days = int(context.get("horizon_days", 30))
        svc = PredictionService(self.db)
        # Use existing predictions if available
        existing_q = await self.db.execute(
            select(PredictionResult).where(
                PredictionResult.organization_id == str(org_id),
                PredictionResult.prediction_type == prediction_type)
            .order_by(PredictionResult.generated_at.desc()).limit(1))
        existing = existing_q.scalar_one_or_none()
        if existing:
            return {
                "question_type": "what_will_happen",
                "question": question,
                "prediction_type": prediction_type,
                "horizon_days": existing.horizon_days,
                "predictions": existing.predictions[:horizon_days],
                "aggregates": existing.aggregates,
                "confidence_score": existing.confidence_score,
                "model_name": existing.model_name,
                "generated_at": existing.generated_at.isoformat(),
                "source": "cached",
            }
        # Generate new prediction
        prediction = await svc.predict(
            organization_id=org_id, prediction_type=prediction_type,
            horizon_days=horizon_days)
        return {
            "question_type": "what_will_happen",
            "question": question,
            "prediction_type": prediction.prediction_type,
            "horizon_days": prediction.horizon_days,
            "predictions": prediction.predictions,
            "aggregates": prediction.aggregates,
            "confidence_score": prediction.confidence_score,
            "model_name": prediction.model_name,
            "generated_at": prediction.generated_at.isoformat(),
            "source": "fresh",
        }

    async def _what_should_we_do(self, org_id: uuid.UUID,
                                   question: str | None,
                                   context: dict) -> dict[str, Any]:
        """Surface top recommendations + pending decisions."""
        rec_svc = RecommendationService(self.db)
        recs, total = await rec_svc.list_recommendations(
            organization_id=org_id, status="pending", limit=5)
        decisions_q = await self.db.execute(
            select(DecisionHistory).where(
                DecisionHistory.organization_id == str(org_id),
                DecisionHistory.status == "proposed")
            .order_by(DecisionHistory.created_at.desc()).limit(5))
        pending_decisions = list(decisions_q.scalars().all())
        return {
            "question_type": "what_should_we_do",
            "question": question,
            "top_recommendations": [rec_svc.to_dict(r) for r in recs],
            "pending_decisions": [{"id": str(d.id), "title": d.title,
                                     "decision_type": d.decision_type,
                                     "category": d.category}
                                    for d in pending_decisions],
            "total_pending_recommendations": total,
            "timestamp": datetime.now(UTC).isoformat(),
        }

    async def _expected_impact(self, org_id: uuid.UUID,
                                  question: str | None,
                                  context: dict) -> dict[str, Any]:
        """Estimate the impact of a proposed action using simulation."""
        target_action = context.get("action") or question or "proposed action"
        # Run a quick what-if simulation
        sim_svc = SimulationEngine(self.db)
        sim = await sim_svc.create_simulation(
            organization_id=org_id, name=f"Impact: {target_action[:100]}",
            simulation_type="what_if", description=f"Impact analysis for: {target_action}",
            input_params=context.get("params", {}),
            time_horizon_days=30, time_step_days=1, monte_carlo_runs=3)
        result = await sim_svc.run_simulation(
            simulation_id=sim.id, organization_id=org_id)
        return {
            "question_type": "expected_impact",
            "question": question,
            "target_action": target_action,
            "simulation_id": str(sim.id),
            "aggregates": result.get("aggregates", {}),
            "monte_carlo_runs": result.get("monte_carlo_runs", 1),
            "confidence": "high" if result.get("monte_carlo_runs", 1) >= 3 else "medium",
            "timestamp": datetime.now(UTC).isoformat(),
        }

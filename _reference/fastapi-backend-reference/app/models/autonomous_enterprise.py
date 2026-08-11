"""Autonomous Enterprise Operating System models — digital twins, simulations, knowledge graph, decision engine, predictions, optimizations, memory, recommendations, executions, approvals."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, BigInteger, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


# ====================================================================
# Digital Twins
# ====================================================================

class DigitalTwin(UUIDMixin, TimestampMixin, Base):
    """Virtual replica of an org entity — keeps current state + derived metrics."""
    __tablename__ = "digital_twins"
    __table_args__ = (
        Index("uq_digital_twins_org_type_entity", "organization_id", "twin_type", "entity_id", unique=True),
        Index("ix_digital_twins_org_type_active", "organization_id", "twin_type", "is_active"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    twin_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    state: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    properties: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    health_score: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    anomaly_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    parent_twin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("digital_twins.id", ondelete="SET NULL"), nullable=True, index=True)
    snapshot_frequency_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    last_snapshot_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)


class DigitalTwinSnapshot(UUIDMixin, Base):
    """Historical snapshot of a digital twin's state for time-series analysis."""
    __tablename__ = "digital_twin_snapshots"
    __table_args__ = (Index("ix_digital_twin_snapshots_twin_captured", "twin_id", "captured_at"),)

    twin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("digital_twins.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    state: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    health_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    anomaly_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    trigger_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ====================================================================
# Simulations
# ====================================================================

class Simulation(UUIDMixin, TimestampMixin, Base):
    """A simulation run on a digital twin (what-if/business/financial/sales/etc.)."""
    __tablename__ = "simulations"
    __table_args__ = (Index("ix_simulations_org_type_created", "organization_id", "simulation_type", "created_at"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    simulation_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_twin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("digital_twins.id", ondelete="SET NULL"), nullable=True, index=True)
    input_params: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    assumptions: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    constraints: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    time_horizon_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    time_step_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    monte_carlo_runs: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class SimulationResult(UUIDMixin, Base):
    """A single time-step result of a simulation run."""
    __tablename__ = "simulation_results"
    __table_args__ = (Index("ix_simulation_results_sim_step", "simulation_id", "step_index"),)

    simulation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    step_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    state: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    events: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    scenario_branch: Mapped[str | None] = mapped_column(String(50), nullable=True)
    probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_interval_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_interval_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ====================================================================
# Business Graph + Knowledge Graph
# ====================================================================

class BusinessGraphNode(UUIDMixin, TimestampMixin, Base):
    """A node in the organization business graph (entity)."""
    __tablename__ = "business_graph"
    __table_args__ = (Index("uq_business_graph_org_node", "organization_id", "node_type", "node_id", unique=True),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    node_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    properties: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BusinessGraphEdge(UUIDMixin, Base):
    """A directed edge between two business graph nodes."""
    __tablename__ = "business_graph_edges"
    __table_args__ = (
        Index("uq_business_graph_edges_source_target_type", "source_node_id", "target_node_id", "edge_type", unique=True),
        Index("ix_business_graph_edges_target_type", "target_node_id", "edge_type"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business_graph.id", ondelete="CASCADE"), nullable=False, index=True)
    target_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("business_graph.id", ondelete="CASCADE"), nullable=False, index=True)
    edge_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    properties: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    is_directed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class KnowledgeGraphEntity(UUIDMixin, TimestampMixin, Base):
    """An entity in the knowledge graph (extracted from documents via NLP)."""
    __tablename__ = "knowledge_graph"
    __table_args__ = (
        Index("ix_knowledge_graph_org_type", "organization_id", "entity_type"),
        Index("ix_knowledge_graph_org_canonical", "organization_id", "canonical_id"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_text: Mapped[str] = mapped_column(String(500), nullable=False)
    canonical_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    properties: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    source_document_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    mention_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class KnowledgeGraphRelation(UUIDMixin, Base):
    """A relation between two knowledge graph entities."""
    __tablename__ = "knowledge_graph_relations"
    __table_args__ = (Index("uq_kg_relations_source_target_type", "source_entity_id", "target_entity_id", "relation_type", unique=True),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_graph.id", ondelete="CASCADE"), nullable=False, index=True)
    target_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_graph.id", ondelete="CASCADE"), nullable=False, index=True)
    relation_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    properties: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    source_document_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ====================================================================
# Decision Engine + Planning
# ====================================================================

class DecisionHistory(UUIDMixin, TimestampMixin, Base):
    """A decision record (AI-proposed or human-proposed)."""
    __tablename__ = "decision_history"
    __table_args__ = (
        Index("ix_decision_history_org_status", "organization_id", "status"),
        Index("ix_decision_history_org_type_created", "organization_id", "decision_type", "created_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    proposed_by: Mapped[str] = mapped_column(String(50), nullable=False)
    proposed_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    options: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    selected_option: Mapped[str | None] = mapped_column(String(200), nullable=True)
    selected_option_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_impact: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    actual_impact: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="proposed", nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    implemented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_outcome: Mapped[str | None] = mapped_column(String(20), nullable=True)
    related_simulation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("simulations.id", ondelete="SET NULL"), nullable=True)
    related_planning_session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)


class PlanningSession(UUIDMixin, TimestampMixin, Base):
    """A multi-step planning session toward a goal."""
    __tablename__ = "planning_sessions"
    __table_args__ = (Index("ix_planning_sessions_org_status", "organization_id", "status"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    goal_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_metric: Mapped[str | None] = mapped_column(String(200), nullable=True)
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    time_horizon_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    constraints: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    assumptions: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    steps: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    scenarios: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    selected_scenario_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OptimizationRun(UUIDMixin, TimestampMixin, Base):
    """An optimization engine run (cost/token/latency/etc.)."""
    __tablename__ = "optimization_runs"
    __table_args__ = (Index("ix_optimization_runs_org_type_created", "organization_id", "optimization_type", "created_at"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    optimization_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    target_entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    objective: Mapped[str] = mapped_column(String(100), nullable=False)
    objective_metric: Mapped[str] = mapped_column(String(200), nullable=False)
    baseline_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    optimized_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    improvement_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    constraints: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    parameters: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    recommendations: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    applied: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


# ====================================================================
# Memory
# ====================================================================

class AgentMemory(UUIDMixin, TimestampMixin, Base):
    """Per-agent memory entries (long/short/semantic/temporal/episodic)."""
    __tablename__ = "agent_memory"
    __table_args__ = (Index("ix_agent_memory_org_agent_type", "organization_id", "agent_id", "memory_type"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    memory_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    embedding: Mapped[list | None] = mapped_column(JSONBType, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)
    importance_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    access_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OrganizationMemory(UUIDMixin, TimestampMixin, Base):
    """Organization-wide memory (policies, decisions, learnings, incidents, insights)."""
    __tablename__ = "organization_memory"
    __table_args__ = (Index("ix_organization_memory_org_type_active", "organization_id", "memory_type", "is_active"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    memory_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    source_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)
    importance_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


# ====================================================================
# Recommendations + Executions + Approvals
# ====================================================================

class Recommendation(UUIDMixin, TimestampMixin, Base):
    """An AI-generated recommendation to humans."""
    __tablename__ = "recommendations"
    __table_args__ = (
        Index("ix_recommendations_org_status_priority", "organization_id", "status", "priority"),
        Index("ix_recommendations_org_category", "organization_id", "category"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    recommendation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    proposed_action: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    expected_impact: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    risks: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    prerequisites: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    evidence: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    generated_by: Mapped[str] = mapped_column(String(50), nullable=False)
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    related_simulation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("simulations.id", ondelete="SET NULL"), nullable=True)
    related_decision_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("decision_history.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    implemented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Execution(UUIDMixin, TimestampMixin, Base):
    """An autonomous action execution with rollback support."""
    __tablename__ = "executions"
    __table_args__ = (
        Index("ix_executions_org_status", "organization_id", "status"),
        Index("ix_executions_org_type_created", "organization_id", "action_type", "created_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    action_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action_name: Mapped[str] = mapped_column(String(200), nullable=False)
    input: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    output: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    parameters: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    triggered_by: Mapped[str] = mapped_column(String(50), nullable=False)
    triggered_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    related_decision_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("decision_history.id", ondelete="SET NULL"), nullable=True)
    related_recommendation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("recommendations.id", ondelete="SET NULL"), nullable=True)
    related_planning_session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("planning_sessions.id", ondelete="SET NULL"), nullable=True)
    approval_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    approval_status: Mapped[str] = mapped_column(String(20), default="auto_approved", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    can_rollback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rollback_executed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rollback_executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rollback_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    safety_checks: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    safety_passed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ApprovalRule(UUIDMixin, TimestampMixin, Base):
    """Auto-approval / auto-reject rule for autonomous actions."""
    __tablename__ = "approval_rules"
    __table_args__ = (Index("ix_approval_rules_org_action_active", "organization_id", "action_type", "is_active"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    conditions: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    auto_approve: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_reject: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_risk_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    max_cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    required_approvers: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    approval_timeout_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    fallback_action: Mapped[str] = mapped_column(String(20), default="reject", nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


# ====================================================================
# Predictions + Forecast Models
# ====================================================================

class PredictionResult(UUIDMixin, Base):
    """A prediction result from a forecast model."""
    __tablename__ = "prediction_results"
    __table_args__ = (Index("ix_prediction_results_org_type_generated", "organization_id", "prediction_type", "generated_at"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    prediction_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    target_entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    horizon_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    predictions: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    aggregates: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    accuracy_metrics: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    input_features: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ForecastModel(UUIDMixin, TimestampMixin, Base):
    """A registered forecast model (statistical / ML / heuristic / ensemble)."""
    __tablename__ = "forecast_models"
    __table_args__ = (Index("uq_forecast_models_org_slug", "organization_id", "slug", unique=True),)

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_metric: Mapped[str] = mapped_column(String(200), nullable=False)
    hyperparameters: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    input_features: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    training_window_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    last_trained_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_accuracy: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)

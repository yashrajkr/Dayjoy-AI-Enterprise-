"""Phase 12: Autonomous Enterprise Operating System.

Adds 16 new tables for digital twins, simulations, knowledge graph, decision engine,
predictions, optimizations, AI memory, recommendations, executions, and approvals.

Revision ID: 0021
Revises: 0020
"""

from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ====================================================================
    # 1. digital_twins — virtual replicas of org entities
    # ====================================================================
    op.create_table(
        "digital_twins",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("twin_type", sa.String(50), nullable=False, index=True),  # organization/department/employee/customer/lead/sales_pipeline/inventory/product/finance/project/marketing/support/knowledge_base/ai_agent/workflow/infrastructure/server/database/api_service
        sa.Column("entity_id", sa.String(36), nullable=False, index=True),  # FK to underlying entity
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("state", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),  # current state snapshot
        sa.Column("properties", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),  # static properties
        sa.Column("metrics", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),  # derived metrics
        sa.Column("health_score", sa.Float, nullable=False, server_default=sa.text("100.0")),
        sa.Column("risk_score", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("anomaly_score", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("parent_twin_id", UUID(as_uuid=True), sa.ForeignKey("digital_twins.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("snapshot_frequency_minutes", sa.Integer, nullable=False, server_default=sa.text("60")),
        sa.Column("last_snapshot_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_digital_twins_org_type_entity", "digital_twins", ["organization_id", "twin_type", "entity_id"], unique=True)
    op.create_index("ix_digital_twins_org_type_active", "digital_twins", ["organization_id", "twin_type", "is_active"])

    # ====================================================================
    # 2. digital_twin_snapshots — historical state snapshots for time-series analysis
    # ====================================================================
    op.create_table(
        "digital_twin_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("twin_id", UUID(as_uuid=True), sa.ForeignKey("digital_twins.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("state", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("metrics", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("health_score", sa.Float, nullable=True),
        sa.Column("risk_score", sa.Float, nullable=True),
        sa.Column("anomaly_score", sa.Float, nullable=True),
        sa.Column("trigger_reason", sa.String(100), nullable=True),  # scheduled/manual/simulation/event
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_digital_twin_snapshots_twin_captured", "digital_twin_snapshots", ["twin_id", "captured_at"])

    # ====================================================================
    # 3. simulations — top-level simulation runs
    # ====================================================================
    op.create_table(
        "simulations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("simulation_type", sa.String(50), nullable=False, index=True),  # what_if/business/financial/sales/demand/inventory/risk/failure/resource/hiring/pricing/churn
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("target_twin_id", UUID(as_uuid=True), sa.ForeignKey("digital_twins.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("input_params", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("assumptions", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("constraints", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("time_horizon_days", sa.Integer, nullable=False, server_default=sa.text("30")),
        sa.Column("time_step_days", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("monte_carlo_runs", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),  # pending/running/completed/failed/cancelled
        sa.Column("progress_percent", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_simulations_org_type_created", "simulations", ["organization_id", "simulation_type", "created_at"])

    # ====================================================================
    # 4. simulation_results — outcomes from simulation runs (time-series)
    # ====================================================================
    op.create_table(
        "simulation_results",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("simulation_id", UUID(as_uuid=True), sa.ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("step_index", sa.Integer, nullable=False),
        sa.Column("step_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("state", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("metrics", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("events", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # events triggered in this step
        sa.Column("scenario_branch", sa.String(50), nullable=True),  # for monte carlo: branch identifier
        sa.Column("probability", sa.Float, nullable=True),
        sa.Column("confidence_interval_low", sa.Float, nullable=True),
        sa.Column("confidence_interval_high", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_simulation_results_sim_step", "simulation_results", ["simulation_id", "step_index"])

    # ====================================================================
    # 5. business_graph — graph of org entities + relationships
    # ====================================================================
    op.create_table(
        "business_graph",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("node_type", sa.String(50), nullable=False, index=True),  # organization/department/employee/customer/lead/product/project/workflow/agent/document/etc
        sa.Column("node_id", sa.String(36), nullable=False, index=True),  # FK to underlying entity
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("properties", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_business_graph_org_node", "business_graph", ["organization_id", "node_type", "node_id"], unique=True)

    # ====================================================================
    # 6. business_graph_edges — relationships between graph nodes
    # ====================================================================
    op.create_table(
        "business_graph_edges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("source_node_id", UUID(as_uuid=True), sa.ForeignKey("business_graph.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_node_id", UUID(as_uuid=True), sa.ForeignKey("business_graph.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("edge_type", sa.String(50), nullable=False, index=True),  # reports_to/manages/owns/customer_of/depends_on/triggers/uses/contains/reports_to/etc
        sa.Column("weight", sa.Float, nullable=False, server_default=sa.text("1.0")),
        sa.Column("properties", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("is_directed", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_business_graph_edges_source_target_type", "business_graph_edges", ["source_node_id", "target_node_id", "edge_type"], unique=True)
    op.create_index("ix_business_graph_edges_target_type", "business_graph_edges", ["target_node_id", "edge_type"])

    # ====================================================================
    # 7. knowledge_graph — entity graph derived from documents + AI extraction
    # ====================================================================
    op.create_table(
        "knowledge_graph",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("entity_type", sa.String(50), nullable=False, index=True),  # person/org/concept/product/place/event/document
        sa.Column("entity_text", sa.String(500), nullable=False),
        sa.Column("canonical_id", sa.String(100), nullable=True),  # for entity resolution / deduplication
        sa.Column("properties", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("source_document_id", sa.String(36), nullable=True, index=True),
        sa.Column("confidence_score", sa.Float, nullable=False, server_default=sa.text("1.0")),
        sa.Column("mention_count", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_knowledge_graph_org_type", "knowledge_graph", ["organization_id", "entity_type"])
    op.create_index("ix_knowledge_graph_org_canonical", "knowledge_graph", ["organization_id", "canonical_id"])

    # ====================================================================
    # 8. knowledge_graph_relations — relationships between knowledge entities
    # ====================================================================
    op.create_table(
        "knowledge_graph_relations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("source_entity_id", UUID(as_uuid=True), sa.ForeignKey("knowledge_graph.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_entity_id", UUID(as_uuid=True), sa.ForeignKey("knowledge_graph.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("relation_type", sa.String(50), nullable=False, index=True),  # works_for/located_in/parent_of/part_of/related_to/mentions
        sa.Column("properties", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("confidence_score", sa.Float, nullable=False, server_default=sa.text("1.0")),
        sa.Column("source_document_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_kg_relations_source_target_type", "knowledge_graph_relations", ["source_entity_id", "target_entity_id", "relation_type"], unique=True)

    # ====================================================================
    # 9. decision_history — decisions made by AI planner + humans
    # ====================================================================
    op.create_table(
        "decision_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("decision_type", sa.String(50), nullable=False, index=True),  # strategic/operational/tactical/emergency
        sa.Column("category", sa.String(50), nullable=True),  # finance/sales/hiring/infrastructure/product/marketing
        sa.Column("proposed_by", sa.String(50), nullable=False),  # ai/human/system
        sa.Column("proposed_by_id", sa.String(36), nullable=True),  # user_id or agent_id
        sa.Column("options", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # array of {name, description, expected_impact, score}
        sa.Column("selected_option", sa.String(200), nullable=True),
        sa.Column("selected_option_index", sa.Integer, nullable=True),
        sa.Column("rationale", sa.Text, nullable=True),
        sa.Column("expected_impact", sa.JSON, nullable=True),  # {revenue_delta, cost_delta, time_to_impact_days, confidence}
        sa.Column("actual_impact", sa.JSON, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'proposed'")),  # proposed/approved/rejected/implemented/rolled_back
        sa.Column("approved_by", sa.String(36), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("implemented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_outcome", sa.String(20), nullable=True),  # success/partial/failed
        sa.Column("related_simulation_id", UUID(as_uuid=True), sa.ForeignKey("simulations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("related_planning_session_id", UUID(as_uuid=True), nullable=True),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_decision_history_org_status", "decision_history", ["organization_id", "status"])
    op.create_index("ix_decision_history_org_type_created", "decision_history", ["organization_id", "decision_type", "created_at"])

    # ====================================================================
    # 10. planning_sessions — multi-step planning sessions
    # ====================================================================
    op.create_table(
        "planning_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("goal", sa.Text, nullable=False),
        sa.Column("goal_type", sa.String(50), nullable=False),  # revenue_growth/cost_reduction/customer_satisfaction/scale/risk_mitigation/compliance
        sa.Column("target_metric", sa.String(200), nullable=True),
        sa.Column("target_value", sa.Float, nullable=True),
        sa.Column("current_value", sa.Float, nullable=True),
        sa.Column("time_horizon_days", sa.Integer, nullable=False, server_default=sa.text("90")),
        sa.Column("constraints", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("assumptions", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("steps", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # [{step_index, action, target, expected_outcome, dependencies, status, started_at, completed_at}]
        sa.Column("scenarios", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # alternative scenarios considered
        sa.Column("selected_scenario_id", sa.String(50), nullable=True),
        sa.Column("priority", sa.Integer, nullable=False, server_default=sa.text("5")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'draft'")),  # draft/active/completed/cancelled/failed
        sa.Column("progress_percent", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_planning_sessions_org_status", "planning_sessions", ["organization_id", "status"])

    # ====================================================================
    # 11. optimization_runs — optimization engine runs
    # ====================================================================
    op.create_table(
        "optimization_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("optimization_type", sa.String(50), nullable=False, index=True),  # cost/token/infrastructure/workflow/prompt/latency/resource
        sa.Column("target_entity_type", sa.String(50), nullable=True),  # agent/workflow/connector/server/etc
        sa.Column("target_entity_id", sa.String(36), nullable=True),
        sa.Column("objective", sa.String(100), nullable=False),  # minimize/maximize
        sa.Column("objective_metric", sa.String(200), nullable=False),  # cost_cents/latency_ms/error_rate/etc
        sa.Column("baseline_value", sa.Float, nullable=True),
        sa.Column("optimized_value", sa.Float, nullable=True),
        sa.Column("improvement_percent", sa.Float, nullable=True),
        sa.Column("constraints", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("parameters", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("recommendations", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("applied", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),  # pending/running/completed/failed/applied
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_optimization_runs_org_type_created", "optimization_runs", ["organization_id", "optimization_type", "created_at"])

    # ====================================================================
    # 12. agent_memory — per-agent memory store (5 types)
    # ====================================================================
    op.create_table(
        "agent_memory",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_id", sa.String(36), nullable=False, index=True),
        sa.Column("memory_type", sa.String(30), nullable=False, index=True),  # long_term/short_term/semantic/temporal/episodic
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("summary", sa.String(500), nullable=True),
        sa.Column("embedding", sa.JSON, nullable=True),  # vector embedding (for semantic search)
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("importance_score", sa.Float, nullable=False, server_default=sa.text("0.5")),
        sa.Column("access_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_agent_memory_org_agent_type", "agent_memory", ["organization_id", "agent_id", "memory_type"])

    # ====================================================================
    # 13. organization_memory — org-wide memory (policies, decisions, learnings)
    # ====================================================================
    op.create_table(
        "organization_memory",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("memory_type", sa.String(30), nullable=False, index=True),  # policy/decision/learning/incident/insight/best_practice
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("source_type", sa.String(30), nullable=True),  # human/ai_simulation/decision_history/incident
        sa.Column("source_id", sa.String(36), nullable=True),
        sa.Column("tags", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("importance_score", sa.Float, nullable=False, server_default=sa.text("0.5")),
        sa.Column("confidence_score", sa.Float, nullable=False, server_default=sa.text("1.0")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_organization_memory_org_type_active", "organization_memory", ["organization_id", "memory_type", "is_active"])

    # ====================================================================
    # 14. recommendations — AI-generated recommendations to humans
    # ====================================================================
    op.create_table(
        "recommendations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("category", sa.String(50), nullable=False, index=True),  # sales/marketing/finance/operations/hr/infrastructure/ai
        sa.Column("priority", sa.String(20), nullable=False, server_default=sa.text("'medium'")),  # critical/high/medium/low
        sa.Column("recommendation_type", sa.String(50), nullable=False),  # action/insight/warning/opportunity
        sa.Column("target_entity_type", sa.String(50), nullable=True),
        sa.Column("target_entity_id", sa.String(36), nullable=True),
        sa.Column("proposed_action", sa.JSON, nullable=True),  # {action_type, params, expected_execution_time_minutes}
        sa.Column("expected_impact", sa.JSON, nullable=True),  # {revenue_delta, cost_delta, time_to_impact_days, confidence}
        sa.Column("risks", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("prerequisites", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("evidence", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # supporting data sources
        sa.Column("generated_by", sa.String(50), nullable=False),  # ai/human
        sa.Column("agent_id", sa.String(36), nullable=True),
        sa.Column("related_simulation_id", UUID(as_uuid=True), sa.ForeignKey("simulations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("related_decision_id", UUID(as_uuid=True), sa.ForeignKey("decision_history.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),  # pending/viewed/accepted/rejected/expired/implemented
        sa.Column("reviewed_by", sa.String(36), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text, nullable=True),
        sa.Column("implemented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_recommendations_org_status_priority", "recommendations", ["organization_id", "status", "priority"])
    op.create_index("ix_recommendations_org_category", "recommendations", ["organization_id", "category"])

    # ====================================================================
    # 15. executions — autonomous action executions with rollback support
    # ====================================================================
    op.create_table(
        "executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("action_type", sa.String(50), nullable=False, index=True),  # workflow/agent/api_call/plugin/webhook/config_change
        sa.Column("action_id", sa.String(36), nullable=True),  # FK to the underlying entity
        sa.Column("action_name", sa.String(200), nullable=False),
        sa.Column("input", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("output", sa.JSON, nullable=True),
        sa.Column("parameters", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("triggered_by", sa.String(50), nullable=False),  # human/ai/scheduler/event/escalation
        sa.Column("triggered_by_id", sa.String(36), nullable=True),
        sa.Column("related_decision_id", UUID(as_uuid=True), sa.ForeignKey("decision_history.id", ondelete="SET NULL"), nullable=True),
        sa.Column("related_recommendation_id", UUID(as_uuid=True), sa.ForeignKey("recommendations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("related_planning_session_id", UUID(as_uuid=True), sa.ForeignKey("planning_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approval_id", UUID(as_uuid=True), nullable=True),
        sa.Column("approval_status", sa.String(20), nullable=False, server_default=sa.text("'auto_approved'")),  # auto_approved/approved/rejected/pending
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),  # pending/running/completed/failed/cancelled/rolled_back
        sa.Column("progress_percent", sa.Float, nullable=False, server_default=sa.text("0.0")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("can_rollback", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("rollback_executed", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("rollback_executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rollback_by", sa.String(36), nullable=True),
        sa.Column("safety_checks", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("safety_passed", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_executions_org_status", "executions", ["organization_id", "status"])
    op.create_index("ix_executions_org_type_created", "executions", ["organization_id", "action_type", "created_at"])

    # ====================================================================
    # 16. approval_rules — auto-approval rules for autonomous actions
    # ====================================================================
    op.create_table(
        "approval_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("action_type", sa.String(50), nullable=False, index=True),
        sa.Column("conditions", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # list of CEL/JSON conditions
        sa.Column("auto_approve", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("auto_reject", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("max_risk_level", sa.String(20), nullable=True),  # low/medium/high/critical
        sa.Column("max_cost_cents", sa.Integer, nullable=True),
        sa.Column("required_approvers", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # list of {user_id, role} for manual approval
        sa.Column("approval_timeout_minutes", sa.Integer, nullable=False, server_default=sa.text("60")),
        sa.Column("fallback_action", sa.String(20), nullable=False, server_default=sa.text("'reject'")),  # approve/reject/escalate
        sa.Column("priority", sa.Integer, nullable=False, server_default=sa.text("100")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_approval_rules_org_action_active", "approval_rules", ["organization_id", "action_type", "is_active"])

    # ====================================================================
    # 17. prediction_results — predictions from forecast models
    # ====================================================================
    op.create_table(
        "prediction_results",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("prediction_type", sa.String(50), nullable=False, index=True),  # sales/revenue/churn/demand/latency/error_rate/cost/usage
        sa.Column("target_entity_type", sa.String(50), nullable=True),
        sa.Column("target_entity_id", sa.String(36), nullable=True),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("model_version", sa.String(50), nullable=True),
        sa.Column("horizon_days", sa.Integer, nullable=False, server_default=sa.text("30")),
        sa.Column("predictions", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),  # [{date, value, lower, upper, confidence}]
        sa.Column("aggregates", sa.JSON, nullable=True),  # {total, mean, min, max, trend_direction, trend_strength}
        sa.Column("confidence_score", sa.Float, nullable=False, server_default=sa.text("0.5")),
        sa.Column("accuracy_metrics", sa.JSON, nullable=True),  # {mae, mape, rmse}
        sa.Column("input_features", sa.JSON, nullable=True),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_prediction_results_org_type_generated", "prediction_results", ["organization_id", "prediction_type", "generated_at"])

    # ====================================================================
    # 18. forecast_models — registered forecast models (statistical/ML/heuristic)
    # ====================================================================
    op.create_table(
        "forecast_models",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=True, index=True),  # NULL = global/system model
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("model_type", sa.String(50), nullable=False),  # linear/moving_average/exponential_smoothing/arima/prophet/lstm/heuristic/ensemble
        sa.Column("target_metric", sa.String(200), nullable=False),  # what this model forecasts
        sa.Column("hyperparameters", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("input_features", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("training_window_days", sa.Integer, nullable=False, server_default=sa.text("90")),
        sa.Column("last_trained_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_accuracy", sa.JSON, nullable=True),  # {mae, mape, rmse, r2}
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_forecast_models_org_slug", "forecast_models", ["organization_id", "slug"], unique=True)


def downgrade() -> None:
    op.drop_table("forecast_models")
    op.drop_table("prediction_results")
    op.drop_table("approval_rules")
    op.drop_table("executions")
    op.drop_table("recommendations")
    op.drop_table("organization_memory")
    op.drop_table("agent_memory")
    op.drop_table("optimization_runs")
    op.drop_table("planning_sessions")
    op.drop_table("decision_history")
    op.drop_index("uq_kg_relations_source_target_type", table_name="knowledge_graph_relations")
    op.drop_table("knowledge_graph_relations")
    op.drop_table("knowledge_graph")
    op.drop_index("uq_business_graph_edges_source_target_type", table_name="business_graph_edges")
    op.drop_table("business_graph_edges")
    op.drop_index("uq_business_graph_org_node", table_name="business_graph")
    op.drop_table("business_graph")
    op.drop_table("simulation_results")
    op.drop_table("simulations")
    op.drop_table("digital_twin_snapshots")
    op.drop_index("uq_digital_twins_org_type_entity", table_name="digital_twins")
    op.drop_table("digital_twins")

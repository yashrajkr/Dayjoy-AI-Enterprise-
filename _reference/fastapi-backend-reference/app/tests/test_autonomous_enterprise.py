"""Tests for Autonomous Enterprise Operating System — digital twins, simulations, knowledge graph, decisions, predictions, optimizations, memory, recommendations, executions, approvals, executive copilot."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import hash_password
from app.models.autonomous_enterprise import (
    AgentMemory,
    BusinessGraphNode,
    DecisionHistory,
    DigitalTwin,
    Execution,
    KnowledgeGraphEntity,
    OrganizationMemory,
    PlanningSession,
    Recommendation,
    Simulation,
)
from app.models.organization import Organization, UserOrganization
from app.models.role import Role
from app.models.user import User
from app.services.autonomous_enterprise import (
    ApprovalEngine,
    DecisionEngine,
    DigitalTwinService,
    ExecutiveCopilotService,
    ExecutionService,
    KnowledgeGraphService,
    MemoryService,
    OptimizationService,
    PredictionService,
    RecommendationService,
    SimulationEngine,
)

import app.models  # noqa: F401


@pytest_asyncio.fixture
async def os_setup():
    """Spin up in-memory SQLite + org + user for autonomous enterprise OS tests."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        org = Organization(name="OS Test Org", slug=f"os-{uuid.uuid4().hex[:8]}", is_active=True)
        session.add(org); await session.flush()
        user = User(email="os@test.com", full_name="OS User",
                    hashed_password=hash_password("TestPass123!"), is_active=True, is_email_verified=True)
        session.add(user); await session.flush()
        session.add(UserOrganization(user_id=str(user.id), organization_id=str(org.id),
                                       role="org_owner", is_active=True))
        session.add(Role(name="org_owner", display_name="Owner", is_system=True,
                           scope="global", priority=90))
        await session.commit()
        org_id = str(org.id); user_id = str(user.id)

    async with async_session() as session:
        yield session, org_id, user_id
    await engine.dispose()


# ====================================================================
# Digital Twin Service tests
# ====================================================================

@pytest.mark.asyncio
class TestDigitalTwinService:
    async def test_create_twin(self, os_setup):
        session, org_id, _ = os_setup
        svc = DigitalTwinService(session)
        twin = await svc.create_twin(
            organization_id=uuid.UUID(org_id), twin_type="department",
            entity_id="dept-eng-001", name="Engineering Department",
            description="Software engineering team",
            properties={"headcount": 50, "location": "HQ"})
        await session.commit()
        assert twin.twin_type == "department"
        assert twin.health_score == 100.0
        assert twin.is_active is True

    async def test_invalid_twin_type_rejected(self, os_setup):
        session, org_id, _ = os_setup
        svc = DigitalTwinService(session)
        with pytest.raises(ValidationError):
            await svc.create_twin(
                organization_id=uuid.UUID(org_id), twin_type="invalid_type",
                entity_id="x", name="X")

    async def test_duplicate_twin_rejected(self, os_setup):
        session, org_id, _ = os_setup
        svc = DigitalTwinService(session)
        await svc.create_twin(
            organization_id=uuid.UUID(org_id), twin_type="server",
            entity_id="srv-001", name="Web Server 1")
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.create_twin(
                organization_id=uuid.UUID(org_id), twin_type="server",
                entity_id="srv-001", name="Web Server 1 - Duplicate")

    async def test_update_twin_state(self, os_setup):
        session, org_id, _ = os_setup
        svc = DigitalTwinService(session)
        twin = await svc.create_twin(
            organization_id=uuid.UUID(org_id), twin_type="api_service",
            entity_id="api-orders", name="Orders API")
        await session.commit()
        updated = await svc.update_twin_state(
            twin_id=twin.id, organization_id=uuid.UUID(org_id),
            state={"rps": 1500, "errors": 5},
            metrics={"p99_latency_ms": 250},
            health_score=85.0, risk_score=0.3,
            anomaly_score=0.1, trigger_snapshot=False)
        await session.commit()
        assert updated.health_score == 85.0
        assert updated.risk_score == 0.3
        assert updated.state["rps"] == 1500

    async def test_snapshot_twin(self, os_setup):
        session, org_id, _ = os_setup
        svc = DigitalTwinService(session)
        twin = await svc.create_twin(
            organization_id=uuid.UUID(org_id), twin_type="database",
            entity_id="db-main", name="Main DB")
        await session.commit()
        snapshot = await svc.snapshot_twin(
            twin_id=twin.id, organization_id=uuid.UUID(org_id),
            trigger_reason="test")
        await session.commit()
        assert snapshot.twin_id == twin.id
        assert snapshot.trigger_reason == "test"

    async def test_list_snapshots(self, os_setup):
        session, org_id, _ = os_setup
        svc = DigitalTwinService(session)
        twin = await svc.create_twin(
            organization_id=uuid.UUID(org_id), twin_type="server",
            entity_id="srv-test", name="Test Server")
        await session.commit()
        # Capture additional snapshots
        await svc.snapshot_twin(twin_id=twin.id, organization_id=uuid.UUID(org_id))
        await svc.snapshot_twin(twin_id=twin.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        snapshots = await svc.list_snapshots(twin_id=twin.id, organization_id=uuid.UUID(org_id))
        assert len(snapshots) >= 3  # initial + 2 additional

    async def test_twin_lineage(self, os_setup):
        session, org_id, _ = os_setup
        svc = DigitalTwinService(session)
        parent = await svc.create_twin(
            organization_id=uuid.UUID(org_id), twin_type="department",
            entity_id="dept-eng", name="Engineering")
        await session.commit()
        child = await svc.create_twin(
            organization_id=uuid.UUID(org_id), twin_type="employee",
            entity_id="emp-001", name="Alice",
            parent_twin_id=parent.id)
        await session.commit()
        lineage = await svc.get_twin_lineage(twin_id=parent.id, organization_id=uuid.UUID(org_id))
        assert lineage["parent"] is None
        assert len(lineage["children"]) == 1
        assert lineage["children"][0]["name"] == "Alice"


# ====================================================================
# Simulation Engine tests
# ====================================================================

@pytest.mark.asyncio
class TestSimulationEngine:
    async def test_create_simulation(self, os_setup):
        session, org_id, _ = os_setup
        svc = SimulationEngine(session)
        sim = await svc.create_simulation(
            organization_id=uuid.UUID(org_id), name="Q1 Sales Forecast",
            simulation_type="sales",
            input_params={"conversion_rate": 0.12, "avg_deal_size": 750},
            time_horizon_days=30, time_step_days=1, monte_carlo_runs=1)
        await session.commit()
        assert sim.simulation_type == "sales"
        assert sim.status == "pending"

    async def test_invalid_simulation_type(self, os_setup):
        session, org_id, _ = os_setup
        svc = SimulationEngine(session)
        with pytest.raises(ValidationError):
            await svc.create_simulation(
                organization_id=uuid.UUID(org_id), name="Bad",
                simulation_type="invalid_type")

    async def test_run_sales_simulation(self, os_setup):
        session, org_id, _ = os_setup
        svc = SimulationEngine(session)
        sim = await svc.create_simulation(
            organization_id=uuid.UUID(org_id), name="Sales Sim",
            simulation_type="sales",
            input_params={"conversion_rate": 0.10, "avg_deal_size": 500,
                          "growth_rate": 0.02},
            time_horizon_days=10, time_step_days=1, monte_carlo_runs=1)
        await session.commit()
        result = await svc.run_simulation(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert result["status"] == "completed"
        assert "aggregates" in result
        # Verify results were saved
        results, total = await svc.list_results(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        assert total == 10  # 10 days

    async def test_run_financial_simulation(self, os_setup):
        session, org_id, _ = os_setup
        svc = SimulationEngine(session)
        sim = await svc.create_simulation(
            organization_id=uuid.UUID(org_id), name="Finance Sim",
            simulation_type="financial",
            input_params={"cost_ratio": 0.65, "growth_rate": 0.03},
            time_horizon_days=12, monte_carlo_runs=1)
        await session.commit()
        result = await svc.run_simulation(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        assert result["status"] == "completed"
        results, _ = await svc.list_results(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        assert len(results) == 12
        # Verify metrics have financial keys
        assert "revenue" in results[0].metrics
        assert "profit" in results[0].metrics

    async def test_run_monte_carlo(self, os_setup):
        session, org_id, _ = os_setup
        svc = SimulationEngine(session)
        sim = await svc.create_simulation(
            organization_id=uuid.UUID(org_id), name="MC Sim",
            simulation_type="sales",
            input_params={"conversion_rate": 0.10, "avg_deal_size": 500},
            time_horizon_days=5, time_step_days=1, monte_carlo_runs=3)
        await session.commit()
        result = await svc.run_simulation(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        assert result["monte_carlo_runs"] == 3
        # Should have 5 * 3 = 15 results
        results, _ = await svc.list_results(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        assert len(results) == 15
        # Three distinct branches
        branches = {r.scenario_branch for r in results}
        assert len(branches) == 3

    async def test_compare_scenarios(self, os_setup):
        session, org_id, _ = os_setup
        svc = SimulationEngine(session)
        sim = await svc.create_simulation(
            organization_id=uuid.UUID(org_id), name="Compare Sim",
            simulation_type="churn",
            input_params={"churn_rate_per_step": 0.03, "new_per_step": 25},
            time_horizon_days=10, monte_carlo_runs=2)
        await session.commit()
        await svc.run_simulation(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        comparison = await svc.compare_scenarios(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        assert len(comparison["scenarios"]) == 2

    async def test_inventory_simulation_with_stockout(self, os_setup):
        session, org_id, _ = os_setup
        svc = SimulationEngine(session)
        sim = await svc.create_simulation(
            organization_id=uuid.UUID(org_id), name="Inventory Sim",
            simulation_type="inventory",
            input_params={"daily_demand": 100, "reorder_point": 200,
                          "reorder_qty": 500, "lead_time_days": 3},
            time_horizon_days=20, time_step_days=1)
        await session.commit()
        await svc.run_simulation(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        results, _ = await svc.list_results(simulation_id=sim.id, organization_id=uuid.UUID(org_id))
        assert len(results) == 20
        # Should have triggered some inventory events
        all_events = []
        for r in results:
            all_events.extend(r.events or [])
        event_types = {e.get("type") for e in all_events}
        # Should have at least reorder events
        assert "inventory.reorder" in event_types or len(all_events) > 0


# ====================================================================
# Knowledge Graph Service tests
# ====================================================================

@pytest.mark.asyncio
class TestKnowledgeGraphService:
    async def test_upsert_business_node(self, os_setup):
        session, org_id, _ = os_setup
        svc = KnowledgeGraphService(session)
        node = await svc.upsert_business_node(
            organization_id=uuid.UUID(org_id), node_type="employee",
            node_id="emp-001", name="Alice Smith",
            properties={"role": "Engineer"}, tags=["engineering"])
        await session.commit()
        assert node.name == "Alice Smith"
        assert node.is_active is True
        # Upsert again should update, not create
        node2 = await svc.upsert_business_node(
            organization_id=uuid.UUID(org_id), node_type="employee",
            node_id="emp-001", name="Alice Smith Jr.",
            properties={"role": "Senior Engineer"})
        await session.commit()
        assert node2.id == node.id
        assert node2.name == "Alice Smith Jr."

    async def test_add_business_edge(self, os_setup):
        session, org_id, _ = os_setup
        svc = KnowledgeGraphService(session)
        n1 = await svc.upsert_business_node(
            organization_id=uuid.UUID(org_id), node_type="employee",
            node_id="emp-001", name="Alice")
        n2 = await svc.upsert_business_node(
            organization_id=uuid.UUID(org_id), node_type="department",
            node_id="dept-eng", name="Engineering")
        await session.commit()
        edge = await svc.add_business_edge(
            organization_id=uuid.UUID(org_id),
            source_node_id=n1.id, target_node_id=n2.id,
            edge_type="reports_to")
        await session.commit()
        assert edge.edge_type == "reports_to"

    async def test_duplicate_edge_rejected(self, os_setup):
        session, org_id, _ = os_setup
        svc = KnowledgeGraphService(session)
        n1 = await svc.upsert_business_node(
            organization_id=uuid.UUID(org_id), node_type="employee",
            node_id="e1", name="A")
        n2 = await svc.upsert_business_node(
            organization_id=uuid.UUID(org_id), node_type="employee",
            node_id="e2", name="B")
        await session.commit()
        await svc.add_business_edge(
            organization_id=uuid.UUID(org_id),
            source_node_id=n1.id, target_node_id=n2.id, edge_type="manages")
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.add_business_edge(
                organization_id=uuid.UUID(org_id),
                source_node_id=n1.id, target_node_id=n2.id, edge_type="manages")

    async def test_traverse_business_graph(self, os_setup):
        session, org_id, _ = os_setup
        svc = KnowledgeGraphService(session)
        ceo = await svc.upsert_business_node(
            organization_id=uuid.UUID(org_id), node_type="employee",
            node_id="ceo", name="CEO")
        vp = await svc.upsert_business_node(
            organization_id=uuid.UUID(org_id), node_type="employee",
            node_id="vp", name="VP")
        ic = await svc.upsert_business_node(
            organization_id=uuid.UUID(org_id), node_type="employee",
            node_id="ic", name="IC")
        await session.commit()
        await svc.add_business_edge(organization_id=uuid.UUID(org_id),
                                      source_node_id=vp.id, target_node_id=ceo.id,
                                      edge_type="reports_to")
        await svc.add_business_edge(organization_id=uuid.UUID(org_id),
                                      source_node_id=ic.id, target_node_id=vp.id,
                                      edge_type="reports_to")
        await session.commit()
        traversal = await svc.traverse_business_graph(
            organization_id=uuid.UUID(org_id), start_node_id=ic.id, max_depth=3)
        assert traversal["total_nodes"] == 3  # ic + vp + ceo

    async def test_upsert_kg_entity(self, os_setup):
        session, org_id, _ = os_setup
        svc = KnowledgeGraphService(session)
        e1 = await svc.upsert_kg_entity(
            organization_id=uuid.UUID(org_id), entity_type="person",
            entity_text="John Smith", canonical_id="john_smith_001",
            source_document_id="doc-001")
        await session.commit()
        # Upsert again — should bump mention count
        e2 = await svc.upsert_kg_entity(
            organization_id=uuid.UUID(org_id), entity_type="person",
            entity_text="John Smith", source_document_id="doc-002")
        await session.commit()
        assert e2.id == e1.id
        assert e2.mention_count == 2

    async def test_add_kg_relation(self, os_setup):
        session, org_id, _ = os_setup
        svc = KnowledgeGraphService(session)
        john = await svc.upsert_kg_entity(
            organization_id=uuid.UUID(org_id), entity_type="person",
            entity_text="John")
        acme = await svc.upsert_kg_entity(
            organization_id=uuid.UUID(org_id), entity_type="organization",
            entity_text="Acme Corp")
        await session.commit()
        relation = await svc.add_kg_relation(
            organization_id=uuid.UUID(org_id),
            source_entity_id=john.id, target_entity_id=acme.id,
            relation_type="works_for")
        await session.commit()
        assert relation.relation_type == "works_for"

    async def test_find_entity_relations(self, os_setup):
        session, org_id, _ = os_setup
        svc = KnowledgeGraphService(session)
        john = await svc.upsert_kg_entity(
            organization_id=uuid.UUID(org_id), entity_type="person",
            entity_text="John")
        acme = await svc.upsert_kg_entity(
            organization_id=uuid.UUID(org_id), entity_type="organization",
            entity_text="Acme")
        await session.commit()
        await svc.add_kg_relation(
            organization_id=uuid.UUID(org_id),
            source_entity_id=john.id, target_entity_id=acme.id,
            relation_type="works_for")
        await session.commit()
        relations = await svc.find_entity_relations(
            entity_id=john.id, organization_id=uuid.UUID(org_id))
        assert len(relations["outgoing"]) == 1
        assert relations["outgoing"][0]["relation_type"] == "works_for"
        assert len(relations["incoming"]) == 0


# ====================================================================
# Decision Engine tests
# ====================================================================

@pytest.mark.asyncio
class TestDecisionEngine:
    async def test_create_planning_session(self, os_setup):
        session, org_id, _ = os_setup
        svc = DecisionEngine(session)
        session_obj = await svc.create_planning_session(
            organization_id=uuid.UUID(org_id), name="Growth Plan",
            goal="Increase revenue by 25% in Q1",
            goal_type="revenue_growth",
            target_metric="monthly_revenue", target_value=125000,
            current_value=100000, time_horizon_days=90)
        await session.commit()
        assert session_obj.goal_type == "revenue_growth"
        assert session_obj.status == "draft"

    async def test_generate_plan(self, os_setup):
        session, org_id, _ = os_setup
        svc = DecisionEngine(session)
        sess = await svc.create_planning_session(
            organization_id=uuid.UUID(org_id), name="Plan",
            goal="Reduce costs by 15%",
            goal_type="cost_reduction", time_horizon_days=60)
        await session.commit()
        updated = await svc.generate_plan(session_id=sess.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert updated.status == "active"
        assert len(updated.steps) >= 5  # at least 5 steps
        assert len(updated.scenarios) == 3  # conservative/baseline/aggressive
        assert updated.selected_scenario_id == "baseline"

    async def test_select_scenario(self, os_setup):
        session, org_id, _ = os_setup
        svc = DecisionEngine(session)
        sess = await svc.create_planning_session(
            organization_id=uuid.UUID(org_id), name="Plan",
            goal="Test", goal_type="revenue_growth")
        await session.commit()
        await svc.generate_plan(session_id=sess.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        updated = await svc.select_scenario(
            session_id=sess.id, organization_id=uuid.UUID(org_id),
            scenario_id="conservative")
        await session.commit()
        assert updated.selected_scenario_id == "conservative"

    async def test_select_invalid_scenario(self, os_setup):
        session, org_id, _ = os_setup
        svc = DecisionEngine(session)
        sess = await svc.create_planning_session(
            organization_id=uuid.UUID(org_id), name="Plan",
            goal="Test", goal_type="revenue_growth")
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.select_scenario(session_id=sess.id, organization_id=uuid.UUID(org_id),
                                        scenario_id="invalid")

    async def test_create_decision_auto_selects_best(self, os_setup):
        session, org_id, _ = os_setup
        svc = DecisionEngine(session)
        options = [
            {"name": "Option A", "description": "First",
             "expected_impact": {"revenue_delta": 50000, "cost_delta": 10000, "confidence": 0.7}},
            {"name": "Option B", "description": "Second",
             "expected_impact": {"revenue_delta": 80000, "cost_delta": 20000, "confidence": 0.8}},
            {"name": "Option C", "description": "Third",
             "expected_impact": {"revenue_delta": 30000, "cost_delta": 5000, "confidence": 0.9}},
        ]
        decision = await svc.create_decision(
            organization_id=uuid.UUID(org_id), title="Which option?",
            description="Pick the best", decision_type="strategic",
            category="finance", proposed_by="ai", proposed_by_id="agent-1",
            options=options)
        await session.commit()
        # Should select Option B: (80000 - 20000) * 0.8 = 48000
        # vs Option A: (50000 - 10000) * 0.7 = 28000
        # vs Option C: (30000 - 5000) * 0.9 = 22500
        assert decision.selected_option == "Option B"
        assert decision.selected_option_index == 1

    async def test_approve_decision(self, os_setup):
        session, org_id, user_id = os_setup
        svc = DecisionEngine(session)
        decision = await svc.create_decision(
            organization_id=uuid.UUID(org_id), title="Approve Test",
            description="Test", decision_type="operational",
            category="operations", proposed_by="ai", proposed_by_id="agent-1",
            options=[{"name": "Yes"}, {"name": "No"}])
        await session.commit()
        approved = await svc.approve_decision(
            decision_id=decision.id, organization_id=uuid.UUID(org_id),
            approved_by=user_id, notes="Looks good")
        await session.commit()
        assert approved.status == "approved"
        assert approved.approved_by == user_id

    async def test_cannot_approve_already_approved(self, os_setup):
        session, org_id, user_id = os_setup
        svc = DecisionEngine(session)
        decision = await svc.create_decision(
            organization_id=uuid.UUID(org_id), title="Double Approve",
            description="Test", decision_type="operational",
            category="operations", proposed_by="ai", proposed_by_id="agent-1",
            options=[{"name": "Yes"}])
        await session.commit()
        await svc.approve_decision(decision_id=decision.id, organization_id=uuid.UUID(org_id),
                                     approved_by=user_id)
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.approve_decision(decision_id=decision.id, organization_id=uuid.UUID(org_id),
                                         approved_by=user_id)

    async def test_implement_decision(self, os_setup):
        session, org_id, user_id = os_setup
        svc = DecisionEngine(session)
        decision = await svc.create_decision(
            organization_id=uuid.UUID(org_id), title="Implement Test",
            description="Test", decision_type="operational",
            category="operations", proposed_by="ai", proposed_by_id="agent-1",
            options=[{"name": "Yes"}])
        await session.commit()
        await svc.approve_decision(decision_id=decision.id, organization_id=uuid.UUID(org_id),
                                     approved_by=user_id)
        await session.commit()
        implemented = await svc.implement_decision(decision_id=decision.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert implemented.status == "implemented"
        assert implemented.implemented_at is not None

    async def test_review_decision(self, os_setup):
        session, org_id, _ = os_setup
        svc = DecisionEngine(session)
        decision = await svc.create_decision(
            organization_id=uuid.UUID(org_id), title="Review Test",
            description="Test", decision_type="operational",
            category="operations", proposed_by="ai", proposed_by_id="agent-1",
            options=[{"name": "Yes"}])
        await session.commit()
        reviewed = await svc.review_decision(
            decision_id=decision.id, organization_id=uuid.UUID(org_id),
            outcome="success",
            actual_impact={"revenue_delta": 55000})
        await session.commit()
        assert reviewed.review_outcome == "success"
        assert reviewed.actual_impact["revenue_delta"] == 55000

    async def test_invalid_review_outcome(self, os_setup):
        session, org_id, _ = os_setup
        svc = DecisionEngine(session)
        decision = await svc.create_decision(
            organization_id=uuid.UUID(org_id), title="Bad Outcome",
            description="Test", decision_type="operational",
            category="operations", proposed_by="ai", proposed_by_id="agent-1",
            options=[{"name": "Yes"}])
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.review_decision(decision_id=decision.id, organization_id=uuid.UUID(org_id),
                                        outcome="invalid")


# ====================================================================
# Prediction Service tests
# ====================================================================

@pytest.mark.asyncio
class TestPredictionService:
    async def test_predict_sales(self, os_setup):
        session, org_id, _ = os_setup
        svc = PredictionService(session)
        result = await svc.predict(
            organization_id=uuid.UUID(org_id), prediction_type="sales",
            horizon_days=14)
        await session.commit()
        assert len(result.predictions) == 14
        assert "total" in result.aggregates
        assert "trend_direction" in result.aggregates
        assert 0 <= result.confidence_score <= 1.0
        # Each prediction should have date, value, lower, upper, confidence
        p = result.predictions[0]
        assert "date" in p
        assert "value" in p
        assert "lower" in p
        assert "upper" in p
        assert p["lower"] <= p["value"] <= p["upper"]

    async def test_predict_with_custom_history(self, os_setup):
        session, org_id, _ = os_setup
        svc = PredictionService(session)
        history = [{"date": f"2024-01-{i:02d}", "value": 1000 + i * 50} for i in range(1, 21)]
        result = await svc.predict(
            organization_id=uuid.UUID(org_id), prediction_type="revenue",
            historical_data=history, horizon_days=7)
        await session.commit()
        assert len(result.predictions) == 7
        # Linear model should detect upward trend
        assert result.aggregates["trend_direction"] == "up"

    async def test_invalid_prediction_type(self, os_setup):
        session, org_id, _ = os_setup
        svc = PredictionService(session)
        with pytest.raises(ValidationError):
            await svc.predict(organization_id=uuid.UUID(org_id),
                                prediction_type="invalid")

    async def test_invalid_horizon(self, os_setup):
        session, org_id, _ = os_setup
        svc = PredictionService(session)
        with pytest.raises(ValidationError):
            await svc.predict(organization_id=uuid.UUID(org_id),
                                prediction_type="sales", horizon_days=0)

    async def test_too_few_data_points(self, os_setup):
        session, org_id, _ = os_setup
        svc = PredictionService(session)
        with pytest.raises(ValidationError):
            await svc.predict(organization_id=uuid.UUID(org_id),
                                prediction_type="sales",
                                historical_data=[{"date": "2024-01-01", "value": 100}])

    async def test_list_predictions(self, os_setup):
        session, org_id, _ = os_setup
        svc = PredictionService(session)
        await svc.predict(organization_id=uuid.UUID(org_id), prediction_type="sales", horizon_days=7)
        await svc.predict(organization_id=uuid.UUID(org_id), prediction_type="revenue", horizon_days=14)
        await session.commit()
        predictions, total = await svc.list_predictions(organization_id=uuid.UUID(org_id))
        assert total == 2


# ====================================================================
# Optimization Service tests
# ====================================================================

@pytest.mark.asyncio
class TestOptimizationService:
    async def test_create_optimization(self, os_setup):
        session, org_id, _ = os_setup
        svc = OptimizationService(session)
        run = await svc.create_run(
            organization_id=uuid.UUID(org_id), name="Cost Optimization",
            optimization_type="cost", objective="minimize",
            objective_metric="monthly_cost_cents",
            parameters={"monthly_cost_cents": 200000})
        await session.commit()
        assert run.optimization_type == "cost"
        assert run.objective == "minimize"

    async def test_invalid_optimization_type(self, os_setup):
        session, org_id, _ = os_setup
        svc = OptimizationService(session)
        with pytest.raises(ValidationError):
            await svc.create_run(
                organization_id=uuid.UUID(org_id), name="Bad",
                optimization_type="invalid", objective="minimize",
                objective_metric="x")

    async def test_invalid_objective(self, os_setup):
        session, org_id, _ = os_setup
        svc = OptimizationService(session)
        with pytest.raises(ValidationError):
            await svc.create_run(
                organization_id=uuid.UUID(org_id), name="Bad",
                optimization_type="cost", objective="invalid",
                objective_metric="x")

    async def test_run_cost_optimization(self, os_setup):
        session, org_id, _ = os_setup
        svc = OptimizationService(session)
        run = await svc.create_run(
            organization_id=uuid.UUID(org_id), name="Cost Opt",
            optimization_type="cost", objective="minimize",
            objective_metric="monthly_cost_cents",
            parameters={"monthly_cost_cents": 100000})
        await session.commit()
        result = await svc.run_optimization(run_id=run.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert result["status"] == "completed"
        assert result["baseline"] == 100000
        assert result["optimized"] < 100000  # minimize
        assert result["improvement_percent"] > 0
        assert result["recommendations_count"] > 0

    async def test_run_latency_optimization(self, os_setup):
        session, org_id, _ = os_setup
        svc = OptimizationService(session)
        run = await svc.create_run(
            organization_id=uuid.UUID(org_id), name="Latency Opt",
            optimization_type="latency", objective="minimize",
            objective_metric="avg_latency_ms",
            parameters={"avg_latency_ms": 1500})
        await session.commit()
        result = await svc.run_optimization(run_id=run.id, organization_id=uuid.UUID(org_id))
        assert result["baseline"] == 1500
        assert result["optimized"] < 1500

    async def test_apply_recommendations(self, os_setup):
        session, org_id, _ = os_setup
        svc = OptimizationService(session)
        run = await svc.create_run(
            organization_id=uuid.UUID(org_id), name="Token Opt",
            optimization_type="token", objective="minimize",
            objective_metric="monthly_tokens",
            parameters={"monthly_tokens": 50000000})
        await session.commit()
        await svc.run_optimization(run_id=run.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        applied = await svc.apply_recommendations(run_id=run.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert applied.applied is True
        assert applied.status == "applied"

    async def test_cannot_apply_already_applied(self, os_setup):
        session, org_id, _ = os_setup
        svc = OptimizationService(session)
        run = await svc.create_run(
            organization_id=uuid.UUID(org_id), name="Double Apply",
            optimization_type="cost", objective="minimize",
            objective_metric="x", parameters={"monthly_cost_cents": 100})
        await session.commit()
        await svc.run_optimization(run_id=run.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        await svc.apply_recommendations(run_id=run.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.apply_recommendations(run_id=run.id, organization_id=uuid.UUID(org_id))


# ====================================================================
# Memory Service tests
# ====================================================================

@pytest.mark.asyncio
class TestMemoryService:
    async def test_store_agent_memory(self, os_setup):
        session, org_id, _ = os_setup
        svc = MemoryService(session)
        mem = await svc.store_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="agent-001",
            memory_type="long_term", content="User prefers email over SMS",
            summary="Communication preference",
            importance_score=0.9)
        await session.commit()
        assert mem.memory_type == "long_term"
        assert mem.importance_score == 0.9

    async def test_invalid_memory_type(self, os_setup):
        session, org_id, _ = os_setup
        svc = MemoryService(session)
        with pytest.raises(ValidationError):
            await svc.store_agent_memory(
                organization_id=uuid.UUID(org_id), agent_id="a1",
                memory_type="invalid_type", content="x")

    async def test_retrieve_agent_memory(self, os_setup):
        session, org_id, _ = os_setup
        svc = MemoryService(session)
        await svc.store_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="agent-1",
            memory_type="long_term", content="Important fact 1",
            importance_score=0.9)
        await svc.store_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="agent-1",
            memory_type="long_term", content="Important fact 2",
            importance_score=0.5)
        await svc.store_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="agent-1",
            memory_type="short_term", content="Quick note",
            importance_score=0.3)
        await session.commit()
        memories = await svc.retrieve_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="agent-1",
            limit=10)
        assert len(memories) == 3
        # Should be sorted by importance descending
        assert memories[0].importance_score == 0.9

    async def test_retrieve_agent_memory_filtered_by_type(self, os_setup):
        session, org_id, _ = os_setup
        svc = MemoryService(session)
        await svc.store_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="a1",
            memory_type="long_term", content="LT1")
        await svc.store_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="a1",
            memory_type="short_term", content="ST1")
        await session.commit()
        memories = await svc.retrieve_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="a1",
            memory_type="long_term")
        assert len(memories) == 1
        assert memories[0].memory_type == "long_term"

    async def test_retrieve_increases_access_count(self, os_setup):
        session, org_id, _ = os_setup
        svc = MemoryService(session)
        mem = await svc.store_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="a1",
            memory_type="long_term", content="X")
        await session.commit()
        await svc.retrieve_agent_memory(organization_id=uuid.UUID(org_id), agent_id="a1")
        await session.commit()
        refreshed = await session.get(AgentMemory, mem.id)
        assert refreshed.access_count == 1

    async def test_forget_agent_memory(self, os_setup):
        session, org_id, _ = os_setup
        svc = MemoryService(session)
        mem = await svc.store_agent_memory(
            organization_id=uuid.UUID(org_id), agent_id="a1",
            memory_type="short_term", content="Forget me")
        await session.commit()
        result = await svc.forget_agent_memory(memory_id=mem.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert result is True
        # Should be deleted
        deleted = await session.get(AgentMemory, mem.id)
        assert deleted is None

    async def test_store_organization_memory(self, os_setup):
        session, org_id, _ = os_setup
        svc = MemoryService(session)
        mem = await svc.store_organization_memory(
            organization_id=uuid.UUID(org_id), memory_type="policy",
            title="API Rate Limit Policy",
            content="All API endpoints are rate-limited to 100 req/min",
            tags=["api", "rate-limit", "policy"])
        await session.commit()
        assert mem.memory_type == "policy"
        assert "rate-limit" in mem.tags

    async def test_invalid_org_memory_type(self, os_setup):
        session, org_id, _ = os_setup
        svc = MemoryService(session)
        with pytest.raises(ValidationError):
            await svc.store_organization_memory(
                organization_id=uuid.UUID(org_id), memory_type="invalid",
                title="X", content="X")

    async def test_retrieve_organization_memory(self, os_setup):
        session, org_id, _ = os_setup
        svc = MemoryService(session)
        await svc.store_organization_memory(
            organization_id=uuid.UUID(org_id), memory_type="policy",
            title="P1", content="Important policy", importance_score=0.9)
        await svc.store_organization_memory(
            organization_id=uuid.UUID(org_id), memory_type="learning",
            title="L1", content="Key learning", importance_score=0.7)
        await session.commit()
        memories = await svc.retrieve_organization_memory(
            organization_id=uuid.UUID(org_id), limit=10)
        assert len(memories) == 2
        # Sorted by importance desc
        assert memories[0].importance_score == 0.9

    async def test_learn_from_decision(self, os_setup):
        session, org_id, _ = os_setup
        decision_svc = DecisionEngine(session)
        decision = await decision_svc.create_decision(
            organization_id=uuid.UUID(org_id), title="Learn Test",
            description="Test", decision_type="operational",
            category="operations", proposed_by="ai", proposed_by_id="agent-1",
            options=[{"name": "Yes"}])
        await session.commit()
        # Review the decision
        await decision_svc.review_decision(
            decision_id=decision.id, organization_id=uuid.UUID(org_id),
            outcome="success", actual_impact={"revenue_delta": 5000})
        await session.commit()
        # Learn from it
        mem_svc = MemoryService(session)
        learning = await mem_svc.learn_from_decision(
            decision_id=decision.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert learning.memory_type == "learning"
        assert learning.importance_score == 0.9  # success → 0.9
        assert "success" in learning.tags

    async def test_learn_from_unreviewed_decision_fails(self, os_setup):
        session, org_id, _ = os_setup
        decision_svc = DecisionEngine(session)
        decision = await decision_svc.create_decision(
            organization_id=uuid.UUID(org_id), title="Unreviewed",
            description="Test", decision_type="operational",
            category="operations", proposed_by="ai", proposed_by_id="agent-1",
            options=[{"name": "Yes"}])
        await session.commit()
        mem_svc = MemoryService(session)
        with pytest.raises(ValidationError):
            await mem_svc.learn_from_decision(decision_id=decision.id, organization_id=uuid.UUID(org_id))


# ====================================================================
# Recommendation Service tests
# ====================================================================

@pytest.mark.asyncio
class TestRecommendationService:
    async def test_create_recommendation(self, os_setup):
        session, org_id, _ = os_setup
        svc = RecommendationService(session)
        rec = await svc.create_recommendation(
            organization_id=uuid.UUID(org_id),
            title="Increase sales team headcount",
            description="Hire 5 more SDRs to handle pipeline growth",
            category="sales", priority="high",
            recommendation_type="action",
            proposed_action={"action_type": "hiring", "params": {"count": 5}},
            expected_impact={"revenue_delta": 50000, "time_to_impact_days": 60, "confidence": 0.8})
        await session.commit()
        assert rec.priority == "high"
        assert rec.status == "pending"

    async def test_invalid_priority(self, os_setup):
        session, org_id, _ = os_setup
        svc = RecommendationService(session)
        with pytest.raises(ValidationError):
            await svc.create_recommendation(
                organization_id=uuid.UUID(org_id), title="X", description="X",
                category="sales", priority="invalid",
                recommendation_type="action")

    async def test_review_recommendation(self, os_setup):
        session, org_id, user_id = os_setup
        svc = RecommendationService(session)
        rec = await svc.create_recommendation(
            organization_id=uuid.UUID(org_id), title="Accept me",
            description="Test", category="ops", priority="medium",
            recommendation_type="action")
        await session.commit()
        reviewed = await svc.review_recommendation(
            rec_id=rec.id, organization_id=uuid.UUID(org_id),
            decision="accepted", reviewed_by=user_id, notes="Approved")
        await session.commit()
        assert reviewed.status == "accepted"
        assert reviewed.reviewed_by == user_id

    async def test_cannot_review_already_reviewed(self, os_setup):
        session, org_id, user_id = os_setup
        svc = RecommendationService(session)
        rec = await svc.create_recommendation(
            organization_id=uuid.UUID(org_id), title="X", description="X",
            category="ops", priority="medium", recommendation_type="action")
        await session.commit()
        await svc.review_recommendation(rec_id=rec.id, organization_id=uuid.UUID(org_id),
                                          decision="accepted", reviewed_by=user_id)
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.review_recommendation(rec_id=rec.id, organization_id=uuid.UUID(org_id),
                                              decision="rejected", reviewed_by=user_id)

    async def test_implement_recommendation(self, os_setup):
        session, org_id, user_id = os_setup
        svc = RecommendationService(session)
        rec = await svc.create_recommendation(
            organization_id=uuid.UUID(org_id), title="Implement me",
            description="Test", category="ops", priority="high",
            recommendation_type="action")
        await session.commit()
        await svc.review_recommendation(rec_id=rec.id, organization_id=uuid.UUID(org_id),
                                          decision="accepted", reviewed_by=user_id)
        await session.commit()
        implemented = await svc.implement_recommendation(rec_id=rec.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert implemented.status == "implemented"

    async def test_cannot_implement_pending(self, os_setup):
        session, org_id, _ = os_setup
        svc = RecommendationService(session)
        rec = await svc.create_recommendation(
            organization_id=uuid.UUID(org_id), title="X", description="X",
            category="ops", priority="medium", recommendation_type="action")
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.implement_recommendation(rec_id=rec.id, organization_id=uuid.UUID(org_id))


# ====================================================================
# Approval Engine tests
# ====================================================================

@pytest.mark.asyncio
class TestApprovalEngine:
    async def test_create_rule(self, os_setup):
        session, org_id, _ = os_setup
        svc = ApprovalEngine(session)
        rule = await svc.create_rule(
            organization_id=uuid.UUID(org_id), name="Auto-approve low-risk",
            action_type="workflow", auto_approve=True,
            max_risk_level="low", max_cost_cents=1000,
            priority=10)
        await session.commit()
        assert rule.auto_approve is True
        assert rule.priority == 10

    async def test_invalid_fallback_action(self, os_setup):
        session, org_id, _ = os_setup
        svc = ApprovalEngine(session)
        with pytest.raises(ValidationError):
            await svc.create_rule(
                organization_id=uuid.UUID(org_id), name="X",
                action_type="workflow", fallback_action="invalid")

    async def test_invalid_risk_level(self, os_setup):
        session, org_id, _ = os_setup
        svc = ApprovalEngine(session)
        with pytest.raises(ValidationError):
            await svc.create_rule(
                organization_id=uuid.UUID(org_id), name="X",
                action_type="workflow", max_risk_level="invalid")

    async def test_evaluate_auto_approve(self, os_setup):
        session, org_id, _ = os_setup
        svc = ApprovalEngine(session)
        await svc.create_rule(
            organization_id=uuid.UUID(org_id), name="Auto",
            action_type="api_call", auto_approve=True,
            max_risk_level="low", max_cost_cents=500, priority=10)
        await session.commit()
        result = await svc.evaluate(
            organization_id=uuid.UUID(org_id), action_type="api_call",
            risk_level="low", cost_cents=100, context={})
        assert result["decision"] == "auto_approved"

    async def test_evaluate_auto_reject(self, os_setup):
        session, org_id, _ = os_setup
        svc = ApprovalEngine(session)
        await svc.create_rule(
            organization_id=uuid.UUID(org_id), name="Reject",
            action_type="config_change", auto_reject=True, priority=10)
        await session.commit()
        result = await svc.evaluate(
            organization_id=uuid.UUID(org_id), action_type="config_change",
            risk_level="critical", cost_cents=0, context={})
        assert result["decision"] == "auto_rejected"

    async def test_evaluate_manual_approval_required(self, os_setup):
        session, org_id, _ = os_setup
        svc = ApprovalEngine(session)
        await svc.create_rule(
            organization_id=uuid.UUID(org_id), name="Manual",
            action_type="plugin_install",
            required_approvers=[{"role": "org_admin"}], priority=10)
        await session.commit()
        result = await svc.evaluate(
            organization_id=uuid.UUID(org_id), action_type="plugin_install",
            risk_level="medium", cost_cents=0, context={})
        assert result["decision"] == "manual"
        assert len(result["required_approvers"]) == 1

    async def test_evaluate_no_matching_rule_default(self, os_setup):
        session, org_id, _ = os_setup
        svc = ApprovalEngine(session)
        result = await svc.evaluate(
            organization_id=uuid.UUID(org_id), action_type="unknown_action",
            risk_level="low", cost_cents=0, context={})
        # No rule + low risk + zero cost → auto-approved
        assert result["decision"] == "auto_approved"

    async def test_evaluate_high_risk_no_rule_requires_manual(self, os_setup):
        session, org_id, _ = os_setup
        svc = ApprovalEngine(session)
        result = await svc.evaluate(
            organization_id=uuid.UUID(org_id), action_type="risky_thing",
            risk_level="critical", cost_cents=1000, context={})
        assert result["decision"] == "manual"


# ====================================================================
# Execution Service tests
# ====================================================================

@pytest.mark.asyncio
class TestExecutionService:
    async def test_create_execution_auto_approved(self, os_setup):
        session, org_id, user_id = os_setup
        svc = ExecutionService(session)
        execution, approval = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="workflow",
            action_name="Run weekly report",
            triggered_by="human", triggered_by_id=user_id,
            risk_level="low", cost_cents=0)
        await session.commit()
        assert execution.status == "pending"
        assert execution.approval_status == "auto_approved"
        assert approval["decision"] == "auto_approved"

    async def test_create_execution_auto_rejected(self, os_setup):
        session, org_id, _ = os_setup
        approval_svc = ApprovalEngine(session)
        await approval_svc.create_rule(
            organization_id=uuid.UUID(org_id), name="Reject all",
            action_type="config_change", auto_reject=True, priority=10)
        await session.commit()
        svc = ExecutionService(session)
        execution, _ = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="config_change",
            action_name="Change DB password",
            triggered_by="human", risk_level="critical")
        await session.commit()
        assert execution.status == "cancelled"
        assert execution.approval_status == "rejected"

    async def test_run_safety_checks_all_pass(self, os_setup):
        session, org_id, _ = os_setup
        svc = ExecutionService(session)
        execution, _ = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="workflow",
            action_name="Safe action",
            safety_checks=[{"name": "always_ok", "type": "always_pass"}])
        await session.commit()
        result = await svc.run_safety_checks(execution_id=execution.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert result["passed"] is True
        assert len(result["failures"]) == 0

    async def test_run_safety_checks_with_failure(self, os_setup):
        session, org_id, _ = os_setup
        svc = ExecutionService(session)
        execution, _ = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="workflow",
            action_name="Risky action",
            input={"cost_cents": 5000},
            safety_checks=[{"name": "max_cost_1000", "type": "max_cost", "value": 1000}])
        await session.commit()
        result = await svc.run_safety_checks(execution_id=execution.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert result["passed"] is False
        assert "max_cost_1000" in result["failures"]

    async def test_start_execution(self, os_setup):
        session, org_id, _ = os_setup
        svc = ExecutionService(session)
        execution, _ = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="workflow",
            action_name="Start me")
        await session.commit()
        started = await svc.start_execution(execution_id=execution.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        assert started.status == "running"
        assert started.started_at is not None

    async def test_cannot_start_cancelled(self, os_setup):
        session, org_id, _ = os_setup
        approval_svc = ApprovalEngine(session)
        await approval_svc.create_rule(
            organization_id=uuid.UUID(org_id), name="Reject",
            action_type="test_action", auto_reject=True, priority=10)
        await session.commit()
        svc = ExecutionService(session)
        execution, _ = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="test_action",
            action_name="X")
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.start_execution(execution_id=execution.id, organization_id=uuid.UUID(org_id))

    async def test_complete_execution(self, os_setup):
        session, org_id, _ = os_setup
        svc = ExecutionService(session)
        execution, _ = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="workflow",
            action_name="Complete me")
        await session.commit()
        await svc.start_execution(execution_id=execution.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        completed = await svc.complete_execution(
            execution_id=execution.id, organization_id=uuid.UUID(org_id),
            output={"result": "success"})
        await session.commit()
        assert completed.status == "completed"
        assert completed.output == {"result": "success"}
        assert completed.duration_ms is not None

    async def test_complete_execution_with_error(self, os_setup):
        session, org_id, _ = os_setup
        svc = ExecutionService(session)
        execution, _ = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="workflow",
            action_name="Failing")
        await session.commit()
        await svc.start_execution(execution_id=execution.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        failed = await svc.complete_execution(
            execution_id=execution.id, organization_id=uuid.UUID(org_id),
            error="Connection refused")
        await session.commit()
        assert failed.status == "failed"
        assert "Connection refused" in (failed.error or "")

    async def test_rollback_execution(self, os_setup):
        session, org_id, user_id = os_setup
        svc = ExecutionService(session)
        execution, _ = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="workflow",
            action_name="Rollback me", can_rollback=True)
        await session.commit()
        await svc.start_execution(execution_id=execution.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        await svc.complete_execution(execution_id=execution.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        rolled = await svc.rollback_execution(
            execution_id=execution.id, organization_id=uuid.UUID(org_id),
            rolled_back_by=user_id)
        await session.commit()
        assert rolled.rollback_executed is True
        assert rolled.status == "rolled_back"

    async def test_cannot_rollback_non_rollbackable(self, os_setup):
        session, org_id, _ = os_setup
        svc = ExecutionService(session)
        execution, _ = await svc.create_execution(
            organization_id=uuid.UUID(org_id), action_type="workflow",
            action_name="No rollback", can_rollback=False)
        await session.commit()
        await svc.start_execution(execution_id=execution.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        await svc.complete_execution(execution_id=execution.id, organization_id=uuid.UUID(org_id))
        await session.commit()
        with pytest.raises(ValidationError):
            await svc.rollback_execution(execution_id=execution.id, organization_id=uuid.UUID(org_id),
                                           rolled_back_by="user")


# ====================================================================
# Executive Copilot tests
# ====================================================================

@pytest.mark.asyncio
class TestExecutiveCopilotService:
    async def test_invalid_question_type(self, os_setup):
        session, org_id, _ = os_setup
        svc = ExecutiveCopilotService(session)
        with pytest.raises(ValidationError):
            await svc.ask(organization_id=uuid.UUID(org_id), question_type="invalid")

    async def test_what_is_happening(self, os_setup):
        session, org_id, _ = os_setup
        # Create some twins for the summary
        twin_svc = DigitalTwinService(session)
        await twin_svc.create_twin(
            organization_id=uuid.UUID(org_id), twin_type="server",
            entity_id="srv-1", name="Web 1")
        await session.commit()
        svc = ExecutiveCopilotService(session)
        result = await svc.ask(organization_id=uuid.UUID(org_id),
                                  question_type="what_is_happening")
        await session.commit()
        assert "active_simulations" in result
        assert "pending_decisions" in result
        assert "twin_types" in result
        assert "server" in result["twin_types"]

    async def test_why(self, os_setup):
        session, org_id, _ = os_setup
        # Create a failed decision
        decision_svc = DecisionEngine(session)
        decision = await decision_svc.create_decision(
            organization_id=uuid.UUID(org_id), title="Failed Decision",
            description="Test", decision_type="strategic",
            category="finance", proposed_by="ai", proposed_by_id="agent-1",
            options=[{"name": "Yes"}])
        await session.commit()
        await decision_svc.review_decision(
            decision_id=decision.id, organization_id=uuid.UUID(org_id),
            outcome="failed")
        await session.commit()
        svc = ExecutiveCopilotService(session)
        result = await svc.ask(organization_id=uuid.UUID(org_id), question_type="why",
                                  context={"metric": "revenue"})
        await session.commit()
        assert "identified_causes" in result
        assert len(result["identified_causes"]) >= 1
        assert result["identified_causes"][0]["type"] == "decision"

    async def test_what_will_happen(self, os_setup):
        session, org_id, _ = os_setup
        svc = ExecutiveCopilotService(session)
        result = await svc.ask(organization_id=uuid.UUID(org_id),
                                  question_type="what_will_happen",
                                  context={"prediction_type": "sales", "horizon_days": 7})
        await session.commit()
        assert "predictions" in result
        assert len(result["predictions"]) == 7
        assert "aggregates" in result
        assert "confidence_score" in result

    async def test_what_should_we_do(self, os_setup):
        session, org_id, _ = os_setup
        # Create a pending recommendation
        rec_svc = RecommendationService(session)
        await rec_svc.create_recommendation(
            organization_id=uuid.UUID(org_id), title="Hire more SDRs",
            description="Sales team is overloaded",
            category="sales", priority="high", recommendation_type="action")
        await session.commit()
        svc = ExecutiveCopilotService(session)
        result = await svc.ask(organization_id=uuid.UUID(org_id),
                                  question_type="what_should_we_do")
        await session.commit()
        assert len(result["top_recommendations"]) >= 1
        assert result["top_recommendations"][0]["title"] == "Hire more SDRs"

    async def test_expected_impact(self, os_setup):
        session, org_id, _ = os_setup
        svc = ExecutiveCopilotService(session)
        result = await svc.ask(organization_id=uuid.UUID(org_id),
                                  question_type="expected_impact",
                                  context={"action": "Increase marketing spend by 20%"})
        await session.commit()
        assert "simulation_id" in result
        assert "aggregates" in result
        assert result["confidence"] == "high"  # monte_carlo_runs >= 3

    async def test_what_will_happen_uses_cached_prediction(self, os_setup):
        session, org_id, _ = os_setup
        # First call generates a fresh prediction
        svc = ExecutiveCopilotService(session)
        result1 = await svc.ask(organization_id=uuid.UUID(org_id),
                                   question_type="what_will_happen",
                                   context={"prediction_type": "sales", "horizon_days": 7})
        await session.commit()
        assert result1["source"] == "fresh"
        # Second call should use cached
        result2 = await svc.ask(organization_id=uuid.UUID(org_id),
                                   question_type="what_will_happen",
                                   context={"prediction_type": "sales", "horizon_days": 7})
        assert result2["source"] == "cached"

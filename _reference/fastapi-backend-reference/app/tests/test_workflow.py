"""Tests for Phase 6 Workflow Automation."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_password

# Import all models
from app.models.ai import *  # noqa: F401, F403
from app.models.customer import Customer  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.omnichannel import *  # noqa: F401, F403
from app.models.organization import Organization, UserOrganization
from app.models.product import Product  # noqa: F401
from app.models.ticket import Ticket  # noqa: F401
from app.models.user import User
from app.models.workflow import *  # noqa: F401, F403


@pytest_asyncio.fixture
async def test_db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        org = Organization(name="Test Org", slug="test-org", is_active=True)
        session.add(org)
        await session.flush()
        user = User(
            email="admin@test.com",
            full_name="Admin",
            hashed_password=hash_password("pass123!"),
            is_active=True,
            is_email_verified=True,
        )
        session.add(user)
        await session.flush()
        membership = UserOrganization(
            user_id=str(user.id),
            organization_id=str(org.id),
            role="org_owner",
            is_active=True,
        )
        session.add(membership)
        await session.commit()
        yield session, org, user
    await engine.dispose()


@pytest.mark.integration
class TestWorkflowEngine:
    @pytest.mark.asyncio
    async def test_create_workflow(self, test_db):
        session, org, user = test_db
        from app.workflow.engine import WorkflowEngine

        engine = WorkflowEngine(session)
        wf = await engine.create_workflow(
            organization_id=org.id,
            name="Test Workflow",
            trigger_type="manual",
            trigger_config={},
            definition={
                "nodes": [
                    {"id": "n1", "type": "trigger"},
                    {"id": "n2", "type": "action", "config": {"action_type": "noop"}},
                ],
                "edges": [{"from": "n1", "to": "n2"}],
            },
        )
        assert wf.id is not None
        assert wf.status == "draft"

    @pytest.mark.asyncio
    async def test_trigger_workflow(self, test_db):
        session, org, user = test_db
        from app.workflow.engine import WorkflowEngine

        engine = WorkflowEngine(session)
        wf = await engine.create_workflow(
            organization_id=org.id,
            name="Auto Trigger Test",
            trigger_type="manual",
            trigger_config={},
            definition={
                "nodes": [
                    {"id": "n1", "type": "trigger"},
                    {"id": "n2", "type": "action", "config": {"action_type": "noop"}},
                ],
                "edges": [{"from": "n1", "to": "n2"}],
            },
        )
        await engine.activate_workflow(wf.id)
        execution = await engine.trigger(workflow_id=wf.id, trigger_data={"test": True})
        assert execution.status == "completed"

    @pytest.mark.asyncio
    async def test_workflow_with_condition(self, test_db):
        session, org, user = test_db
        from app.workflow.engine import WorkflowEngine

        engine = WorkflowEngine(session)
        wf = await engine.create_workflow(
            organization_id=org.id,
            name="Condition Test",
            trigger_type="manual",
            trigger_config={},
            definition={
                "nodes": [
                    {"id": "n1", "type": "trigger"},
                    {
                        "id": "n2",
                        "type": "condition",
                        "config": {"field": "priority", "operator": "eq", "value": "high"},
                    },
                    {"id": "n3", "type": "action", "config": {"action_type": "escalate"}},
                    {"id": "n4", "type": "action", "config": {"action_type": "log"}},
                ],
                "edges": [
                    {"from": "n1", "to": "n2"},
                    {"from": "n2", "to": "n3", "condition": "true"},
                    {"from": "n2", "to": "n4", "condition": "false"},
                ],
            },
        )
        await engine.activate_workflow(wf.id)
        execution = await engine.trigger(workflow_id=wf.id, trigger_data={"priority": "high"})
        assert execution.status == "completed"
        assert len(execution.execution_log) >= 3  # trigger + condition + action


@pytest.mark.integration
class TestEventBus:
    @pytest.mark.asyncio
    async def test_publish_event(self, test_db):
        session, org, user = test_db
        from app.workflow.event_bus import EventBus

        bus = EventBus(session)
        event = await bus.publish(
            organization_id=org.id,
            event_type="test.event",
            data={"key": "value"},
            source="test",
        )
        assert event.id is not None
        assert event.event_type == "test.event"
        assert event.subscribers_count == 0  # No subscriptions yet

    @pytest.mark.asyncio
    async def test_subscribe_and_publish(self, test_db):
        session, org, user = test_db
        from app.workflow.event_bus import EventBus

        bus = EventBus(session)
        await bus.subscribe(
            organization_id=org.id,
            event_type="customer.created",
            handler_type="notification",
            handler_config={"user_id": str(user.id)},
        )
        event = await bus.publish(
            organization_id=org.id,
            event_type="customer.created",
            data={"name": "John"},
            source="test",
        )
        assert event.subscribers_count == 1
        assert event.delivered_count == 1


@pytest.mark.integration
class TestRulesEngine:
    @pytest.mark.asyncio
    async def test_create_rule_set(self, test_db):
        session, org, user = test_db
        from app.workflow.rules_engine import RulesEngine

        engine = RulesEngine(session)
        rs = await engine.create_rule_set(
            organization_id=org.id,
            name="Test Rules",
            rules=[
                {
                    "id": "r1",
                    "name": "High Priority",
                    "condition": {"field": "priority", "operator": "eq", "value": "high"},
                    "action": {
                        "type": "set_variable",
                        "config": {"variable": "escalate", "value": True},
                    },
                }
            ],
            evaluation_mode="all",
        )
        assert rs.id is not None
        assert len(rs.rules) == 1

    @pytest.mark.asyncio
    async def test_evaluate_rules_match(self, test_db):
        session, org, user = test_db
        from app.workflow.rules_engine import RulesEngine

        engine = RulesEngine(session)
        rs = await engine.create_rule_set(
            organization_id=org.id,
            name="Eval Test",
            rules=[
                {
                    "id": "r1",
                    "name": "Check Tier",
                    "condition": {"field": "customer.tier", "operator": "eq", "value": "platinum"},
                    "action": {
                        "type": "set_variable",
                        "config": {"variable": "priority", "value": "high"},
                    },
                }
            ],
        )
        result = await engine.evaluate(rs.id, {"customer": {"tier": "platinum"}})
        assert result["passed"] is True
        assert result["matched_rules"] == ["r1"]
        assert result["variables_set"]["priority"] == "high"

    @pytest.mark.asyncio
    async def test_evaluate_rules_no_match(self, test_db):
        session, org, user = test_db
        from app.workflow.rules_engine import RulesEngine

        engine = RulesEngine(session)
        rs = await engine.create_rule_set(
            organization_id=org.id,
            name="No Match Test",
            rules=[
                {
                    "id": "r1",
                    "name": "Check Tier",
                    "condition": {"field": "tier", "operator": "eq", "value": "platinum"},
                    "action": {},
                }
            ],
        )
        result = await engine.evaluate(rs.id, {"tier": "silver"})
        assert result["passed"] is False
        assert result["matched_rules"] == []

    @pytest.mark.asyncio
    async def test_evaluate_and_condition(self, test_db):
        session, org, user = test_db
        from app.workflow.rules_engine import RulesEngine

        engine = RulesEngine(session)
        rs = await engine.create_rule_set(
            organization_id=org.id,
            name="AND Test",
            rules=[
                {
                    "id": "r1",
                    "name": "Both conditions",
                    "condition": {
                        "type": "and",
                        "conditions": [
                            {"field": "tier", "operator": "eq", "value": "platinum"},
                            {"field": "status", "operator": "eq", "value": "active"},
                        ],
                    },
                    "action": {},
                }
            ],
        )
        result = await engine.evaluate(rs.id, {"tier": "platinum", "status": "active"})
        assert result["passed"] is True
        result2 = await engine.evaluate(rs.id, {"tier": "platinum", "status": "inactive"})
        assert result2["passed"] is False

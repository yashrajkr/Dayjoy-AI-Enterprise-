"""Tests for the Multi-Agent Orchestration layer — router, supervisor, validator, circuit breaker, monitor."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_password
from app.models.ai import AgentConfig
from app.models.multi_agent import AgentHealth, TaskQueue
from app.models.organization import Organization, UserOrganization
from app.models.role import Role
from app.models.user import User
from app.services.multi_agent_orchestrator import (
    AgentCommunicationLayer, AgentMonitor, CircuitBreaker,
    SupervisorService, TaskRouter, TaskScheduler, ValidatorService,
)

import app.models  # noqa: F401


@pytest_asyncio.fixture
async def orch_setup():
    """Create in-memory SQLite + seed org/user/agent."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        org = Organization(name="Orch Test", slug=f"orch-{uuid.uuid4().hex[:8]}", is_active=True)
        session.add(org); await session.flush()
        user = User(email="orch@test.com", full_name="Orch User",
                    hashed_password=hash_password("TestPass123!"), is_active=True, is_email_verified=True)
        session.add(user); await session.flush()
        session.add(UserOrganization(user_id=str(user.id), organization_id=str(org.id), role="org_owner", is_active=True))
        session.add(Role(name="org_owner", display_name="Owner", is_system=True, scope="global", priority=90))

        # Create a support agent
        support = AgentConfig(organization_id=str(org.id), agent_type="support", name="Support Agent",
            slug="support-agent", llm_provider="openai", model="gpt-4o-mini", temperature=0.3,
            max_tokens=2000, is_active=True, enable_rag=True, enable_memory=True,
            enable_tool_calling=True, enable_safety_filter=True, allowed_tools=[],
            confidence_threshold=0.55, version=1, is_archived=False, is_published=False,
            system_prompt="You are a support agent.", timeout_seconds=30, max_retries=3,
            context_window=4096, memory_config={}, guardrails={})
        session.add(support)

        # Create a knowledge agent
        knowledge = AgentConfig(organization_id=str(org.id), agent_type="knowledge", name="Knowledge Agent",
            slug="knowledge-agent", llm_provider="openai", model="gpt-4o-mini", temperature=0.2,
            max_tokens=4000, is_active=True, enable_rag=True, enable_memory=True,
            enable_tool_calling=True, enable_safety_filter=True, allowed_tools=[],
            confidence_threshold=0.55, version=1, is_archived=False, is_published=False,
            system_prompt="You are a knowledge agent.", timeout_seconds=30, max_retries=3,
            context_window=4096, memory_config={}, guardrails={})
        session.add(knowledge)
        await session.commit()

        org_id = str(org.id); user_id = str(user.id)
        support_id = str(support.id); knowledge_id = str(knowledge.id)

    async with async_session() as session:
        yield session, org_id, user_id, support_id, knowledge_id
    await engine.dispose()


# ===== Task Router Tests =====

class TestTaskRouter:
    def test_classify_support_intent(self, orch_setup):
        """Should route support queries to the support agent."""
        _, _, _, _, _ = orch_setup
        from sqlalchemy.ext.asyncio import AsyncSession
        # We test the classify_intent method directly (no DB needed)
        # But we need a session for the router constructor
        # Just test the static method
        router = TaskRouter.__new__(TaskRouter)
        result = router.classify_intent("I need help with my order, it's broken")
        assert result["agent_type"] == "support"
        assert result["confidence"] > 0.3

    def test_classify_sales_intent(self, orch_setup):
        router = TaskRouter.__new__(TaskRouter)
        result = router.classify_intent("I want to buy your product, what's the price?")
        assert result["agent_type"] == "sales"

    def test_classify_finance_intent(self, orch_setup):
        router = TaskRouter.__new__(TaskRouter)
        result = router.classify_intent("I have a question about my invoice and payment")
        assert result["agent_type"] == "finance"

    def test_classify_unknown_intent_fallback(self, orch_setup):
        router = TaskRouter.__new__(TaskRouter)
        result = router.classify_intent("Tell me about the meaning of life")
        assert result["fallback"] is True
        assert result["confidence"] < 0.5


# ===== Validator Tests =====

class TestValidatorService:
    def test_validate_json_valid(self):
        result = ValidatorService.validate_json('{"key": "value"}')
        assert result["valid"] is True
        assert result["data"]["key"] == "value"

    def test_validate_json_invalid(self):
        result = ValidatorService.validate_json("not json at all")
        assert result["valid"] is False
        assert result["error"] is not None

    def test_validate_json_embedded(self):
        """Should extract JSON from surrounding text."""
        result = ValidatorService.validate_json('Here is the result: {"answer": 42} done.')
        assert result["valid"] is True
        assert result["data"]["answer"] == 42

    def test_validate_response_too_short(self):
        result = ValidatorService.validate_response("Hi", min_length=10)
        assert result["valid"] is False
        assert any("short" in i for i in result["issues"])

    def test_validate_response_ok(self):
        result = ValidatorService.validate_response("This is a valid response with enough content.")
        assert result["valid"] is True

    def test_validate_citations_verified(self):
        context = "The return policy allows returns within 30 days of purchase."
        citations = [{"text": "The return policy allows returns within 30 days of purchase."}]
        result = ValidatorService.validate_citations(citations, context)
        assert result["valid"] is True
        assert result["verified_count"] == 1

    def test_validate_citations_not_in_context(self):
        context = "Some other content here."
        citations = [{"text": "This text is not in the context."}]
        result = ValidatorService.validate_citations(citations, context)
        assert result["valid"] is False
        assert result["verified_count"] == 0


# ===== Supervisor Tests =====

@pytest.mark.asyncio
class TestSupervisorService:
    async def test_accept_good_output(self, orch_setup):
        """Supervisor should accept high-confidence, well-cited output."""
        session, org_id, _, support_id, _ = orch_setup
        svc = SupervisorService(session)
        result = await svc.review(
            organization_id=uuid.UUID(org_id), task_id=None,
            agent_id=support_id, output="The return policy allows returns within 30 days.",
            citations=[{"text": "return policy 30 days"}], context="return policy context",
            confidence=0.85)
        assert result["action"] == "accept"

    async def test_retry_low_confidence(self, orch_setup):
        """Supervisor should retry on low confidence."""
        session, org_id, _, support_id, _ = orch_setup
        svc = SupervisorService(session)
        result = await svc.review(
            organization_id=uuid.UUID(org_id), task_id=None,
            agent_id=support_id, output="I'm not sure about this.", confidence=0.15)
        assert result["action"] in ("retry", "escalate")

    async def test_escalate_multiple_issues(self, orch_setup):
        """Supervisor should escalate when multiple issues are found."""
        session, org_id, _, support_id, _ = orch_setup
        svc = SupervisorService(session)
        result = await svc.review(
            organization_id=uuid.UUID(org_id), task_id=None,
            agent_id=support_id, output="I'm not sure. error occurred.",
            confidence=0.1)
        assert result["action"] == "escalate"
        assert len(result["issues"]) >= 3


# ===== Circuit Breaker Tests =====

@pytest.mark.asyncio
class TestCircuitBreaker:
    async def test_closed_allows_execution(self, orch_setup):
        """Fresh circuit breaker should allow execution."""
        session, _, _, support_id, _ = orch_setup
        cb = CircuitBreaker(session)
        result = await cb.can_execute(agent_id=support_id)
        assert result["can_execute"] is True
        assert result["state"] == "closed"

    async def test_record_success(self, orch_setup):
        """Recording success should update averages and reset failures."""
        session, _, _, support_id, _ = orch_setup
        cb = CircuitBreaker(session)
        await cb.record_success(agent_id=support_id, latency_ms=500, cost_cents=3, confidence=0.8)
        result = await cb.can_execute(agent_id=support_id)
        assert result["can_execute"] is True

    async def test_opens_after_threshold(self, orch_setup):
        """Circuit breaker should open after 5 consecutive failures."""
        session, _, _, support_id, _ = orch_setup
        cb = CircuitBreaker(session)
        # Record 5 failures
        for i in range(5):
            await cb.record_failure(agent_id=support_id, error=f"Error {i}")
        result = await cb.can_execute(agent_id=support_id)
        assert result["can_execute"] is False
        assert result["state"] == "open"


# ===== Task Scheduler Tests =====

@pytest.mark.asyncio
class TestTaskScheduler:
    async def test_schedule_and_get_pending(self, orch_setup):
        """Should schedule a task and retrieve it as pending."""
        session, org_id, user_id, _, _ = orch_setup
        scheduler = TaskScheduler(session)
        task = await scheduler.schedule_task(
            organization_id=uuid.UUID(org_id), task_type="test",
            input_data={"query": "hello"}, priority=5)
        await session.commit()

        pending = await scheduler.get_pending_tasks(organization_id=uuid.UUID(org_id))
        assert len(pending) >= 1
        assert pending[0].task_type == "test"

    async def test_cancel_task(self, orch_setup):
        """Should cancel a queued task."""
        from app.core.exceptions import ValidationError
        session, org_id, _, _, _ = orch_setup
        scheduler = TaskScheduler(session)
        task = await scheduler.schedule_task(
            organization_id=uuid.UUID(org_id), task_type="test", input_data={})
        await session.commit()

        await scheduler.cancel_task(organization_id=uuid.UUID(org_id), task_id=task.id)
        await session.commit()

        from sqlalchemy import select
        result = await session.execute(select(TaskQueue).where(TaskQueue.id == task.id))
        updated = result.scalar_one()
        assert updated.status == "cancelled"


# ===== Agent Communication Tests =====

@pytest.mark.asyncio
class TestAgentCommunication:
    async def test_send_and_get(self, orch_setup):
        """Should send a message and retrieve it."""
        session, org_id, _, support_id, knowledge_id = orch_setup
        comms = AgentCommunicationLayer(session)
        await comms.send(
            organization_id=uuid.UUID(org_id),
            from_agent_id=support_id, to_agent_id=knowledge_id,
            message_type="task_request", content="Please search for return policy")
        await session.commit()

        messages = await comms.get_messages(
            organization_id=uuid.UUID(org_id), agent_id=support_id)
        assert len(messages) >= 1
        assert messages[0]["message_type"] == "task_request"


# ===== Agent Monitor Tests =====

@pytest.mark.asyncio
class TestAgentMonitor:
    async def test_dashboard_returns_data(self, orch_setup):
        """Dashboard should return execution, task, health, and cost stats."""
        session, org_id, _, _, _ = orch_setup
        monitor = AgentMonitor(session)
        dashboard = await monitor.get_dashboard(organization_id=uuid.UUID(org_id))
        assert "executions" in dashboard
        assert "task_queue" in dashboard
        assert "agent_health" in dashboard
        assert "cost_24h" in dashboard
        assert "agents" in dashboard
        assert len(dashboard["agents"]) >= 2  # support + knowledge agents

    async def test_agent_health_detail(self, orch_setup):
        """Should return health detail for a specific agent."""
        session, org_id, _, support_id, _ = orch_setup
        monitor = AgentMonitor(session)
        health = await monitor.get_agent_health(
            organization_id=uuid.UUID(org_id), agent_id=uuid.UUID(support_id))
        # No executions yet → status "unknown"
        assert health["status"] in ("unknown", "healthy", "degraded", "unhealthy")

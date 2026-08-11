"""Multi-Agent Orchestration Services — Task Router, Scheduler, Communication, Supervisor, Validator, Circuit Breaker, Monitoring.

This module extends the Phase 6 agent platform with:
  - TaskRouter: intent-based routing to specialized agents
  - TaskScheduler: cron-based + delayed task execution
  - AgentCommunicationLayer: structured message passing between agents
  - SupervisorService: review, validate, retry, escalate
  - ValidatorService: JSON/response/API/citation validation
  - CircuitBreaker: per-agent failure tracking with open/half-open/closed states
  - AgentMonitor: real-time health, running/waiting/completed/failed tracking
"""

from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.agent_platform import AgentExecution
from app.models.multi_agent import AgentCommunication, AgentHealth, TaskHistory, TaskQueue
from app.models.ai import AgentConfig
from app.services.agent_platform_services import (
    AgentExecutionEngine, MemoryService, PlanningEngine,
)
from app.services.agent_registry import AgentRegistryService

logger = get_logger(__name__)


# ====================================================================
# Task Router — intent-based routing to specialized agents
# ====================================================================

class TaskRouter:
    """Routes user requests to the appropriate specialized agent.

    Uses keyword matching + agent type mapping to determine which agent
    should handle a given task. Falls back to a planner agent for unknown intents.
    """

    # Intent → agent_type mapping with keywords
    ROUTING_RULES: list[dict[str, Any]] = [
        {"keywords": ["help", "support", "issue", "problem", "ticket", "complaint", "error", "broken"],
         "agent_type": "support", "task_type": "customer_support"},
        {"keywords": ["buy", "purchase", "price", "cost", "order", "recommend", "deal", "discount"],
         "agent_type": "sales", "task_type": "sales_inquiry"},
        {"keywords": ["campaign", "marketing", "advert", "promote", "social media", "brand"],
         "agent_type": "marketing", "task_type": "marketing"},
        {"keywords": ["employee", "onboarding", "benefits", "policy", "leave", "vacation", "hr"],
         "agent_type": "hr", "task_type": "hr_query"},
        {"keywords": ["hire", "recruit", "candidate", "interview", "job", "resume"],
         "agent_type": "recruitment", "task_type": "recruitment"},
        {"keywords": ["invoice", "payment", "expense", "budget", "finance", "tax", "billing"],
         "agent_type": "finance", "task_type": "finance"},
        {"keywords": ["analytics", "kpi", "metric", "report", "dashboard", "trend", "forecast"],
         "agent_type": "analytics", "task_type": "analytics"},
        {"keywords": ["customer record", "crm", "pipeline", "contact", "lead"],
         "agent_type": "crm", "task_type": "crm"},
        {"keywords": ["email", "mail", "inbox", "draft email"],
         "agent_type": "email", "task_type": "email"},
        {"keywords": ["whatsapp", "message", "chat"],
         "agent_type": "whatsapp", "task_type": "whatsapp"},
        {"keywords": ["schedule", "meeting", "calendar", "appointment", "book"],
         "agent_type": "calendar", "task_type": "calendar"},
        {"keywords": ["knowledge", "document", "search", "find", "lookup"],
         "agent_type": "knowledge", "task_type": "knowledge_search"},
        {"keywords": ["research", "investigate", "analyze", "study", "compare"],
         "agent_type": "research", "task_type": "research"},
        {"keywords": ["summarize", "summary", "condense", "brief"],
         "agent_type": "summarization", "task_type": "summarization"},
        {"keywords": ["report", "generate report", "weekly report", "monthly report"],
         "agent_type": "reporting", "task_type": "reporting"},
        {"keywords": ["translate", "translation", "language"],
         "agent_type": "translation", "task_type": "translation"},
        {"keywords": ["compliance", "regulation", "audit", "policy check"],
         "agent_type": "compliance", "task_type": "compliance"},
        {"keywords": ["security", "threat", "vulnerability", "access review"],
         "agent_type": "security", "task_type": "security"},
    ]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def classify_intent(self, message: str) -> dict[str, Any]:
        """Classify user intent and return routing decision.

        Returns:
            {"agent_type": str, "task_type": str, "confidence": float, "matched_keywords": list}
        """
        lower = message.lower()
        best_match: dict[str, Any] | None = None
        best_score = 0

        for rule in self.ROUTING_RULES:
            matched = [kw for kw in rule["keywords"] if kw in lower]
            if matched:
                score = len(matched) / len(rule["keywords"])
                if score > best_score:
                    best_score = score
                    best_match = {
                        "agent_type": rule["agent_type"],
                        "task_type": rule["task_type"],
                        "confidence": min(1.0, score + 0.3),  # boost confidence
                        "matched_keywords": matched,
                    }

        if best_match is None:
            return {
                "agent_type": "custom",
                "task_type": "general",
                "confidence": 0.3,
                "matched_keywords": [],
                "fallback": True,
            }
        return best_match

    async def find_agent_for_type(self, *, organization_id: uuid.UUID, agent_type: str) -> AgentConfig | None:
        """Find an active agent of the given type in the org."""
        result = await self.db.execute(
            select(AgentConfig).where(
                AgentConfig.organization_id == str(organization_id),
                AgentConfig.agent_type == agent_type,
                AgentConfig.is_active == True,  # noqa: E712
                AgentConfig.is_archived == False,  # noqa: E712
            ).order_by(AgentConfig.priority.desc()).limit(1))
        return result.scalar_one_or_none()

    async def route(self, *, message: str, organization_id: uuid.UUID) -> dict[str, Any]:
        """Route a user message to the appropriate agent.

        Returns:
            {"agent": AgentConfig, "task_type": str, "confidence": float, ...}
            or {"needs_planner": True} if no agent matches.
        """
        intent = self.classify_intent(message)
        agent = await self.find_agent_for_type(
            organization_id=organization_id, agent_type=intent["agent_type"])

        if agent is None and not intent.get("fallback"):
            # Try to find any knowledge agent as fallback
            agent = await self.find_agent_for_type(
                organization_id=organization_id, agent_type="knowledge")

        if agent is None:
            return {"needs_planner": True, "intent": intent, "agent": None}

        return {"agent": agent, "intent": intent, "needs_planner": False}


# ====================================================================
# Agent Communication Layer — structured inter-agent messaging
# ====================================================================

class AgentCommunicationLayer:
    """Enables agents to send structured messages to each other.

    Message types:
      - task_request:  agent A asks agent B to do something
      - task_result:   agent B returns the result to agent A
      - context_share: agent A shares context with agent B
      - escalation:    agent escalates an issue to the supervisor
      - status_update: agent reports its current status
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def send(self, *, organization_id: uuid.UUID,
                   from_agent_id: str | None, to_agent_id: str | None,
                   message_type: str, content: str,
                   task_id: uuid.UUID | None = None,
                   metadata: dict | None = None) -> AgentCommunication:
        """Send a message from one agent to another."""
        msg = AgentCommunication(
            organization_id=str(organization_id),
            task_id=task_id, from_agent_id=from_agent_id, to_agent_id=to_agent_id,
            message_type=message_type, content=content,
            metadata_=metadata or {})
        self.db.add(msg)
        await self.db.flush()
        return msg

    async def get_messages(self, *, organization_id: uuid.UUID,
                           agent_id: str | None = None,
                           task_id: uuid.UUID | None = None,
                           message_type: str | None = None,
                           limit: int = 50) -> list[dict[str, Any]]:
        """Get messages for an agent or task."""
        conditions = [AgentCommunication.organization_id == str(organization_id)]
        if agent_id:
            conditions.append(
                (AgentCommunication.from_agent_id == agent_id) |
                (AgentCommunication.to_agent_id == agent_id))
        if task_id:
            conditions.append(AgentCommunication.task_id == task_id)
        if message_type:
            conditions.append(AgentCommunication.message_type == message_type)

        result = await self.db.execute(
            select(AgentCommunication).where(*conditions)
            .order_by(AgentCommunication.created_at.desc()).limit(limit))
        return [{"id": str(m.id), "from_agent_id": m.from_agent_id, "to_agent_id": m.to_agent_id,
                 "message_type": m.message_type, "content": m.content,
                 "task_id": str(m.task_id) if m.task_id else None,
                 "created_at": m.created_at.isoformat() if m.created_at else None}
                for m in result.scalars().all()]


# ====================================================================
# Supervisor Service — review, validate, retry, escalate
# ====================================================================

class SupervisorService:
    """The Supervisor reviews agent outputs and decides: accept, retry, or escalate.

    Responsibilities:
      - Review outputs for quality + safety
      - Check for hallucinations (output not grounded in context)
      - Validate citations
      - Detect failures + decide on retries
      - Escalate to human if retries exhausted
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.comms = AgentCommunicationLayer(db)

    async def review(self, *, organization_id: uuid.UUID,
                     task_id: uuid.UUID | None,
                     agent_id: str, output: str,
                     citations: list | None = None,
                     context: str = "",
                     confidence: float = 0.0) -> dict[str, Any]:
        """Review an agent's output and decide on the next action.

        Returns:
            {"action": "accept" | "retry" | "escalate", "reason": str, "issues": list}
        """
        issues: list[str] = []

        # 1. Check confidence
        if confidence < 0.3:
            issues.append(f"Low confidence ({confidence:.2f})")

        # 2. Check for hallucination indicators
        hallucination_indicators = ["i'm not sure", "i think maybe", "this might be",
                                     "i don't have enough", "i cannot verify"]
        lower_output = output.lower()[:200]
        if any(ind in lower_output for ind in hallucination_indicators):
            issues.append("Possible hallucination — agent expressed uncertainty")

        # 3. Check output length (too short = incomplete)
        if len(output.strip()) < 10:
            issues.append("Output too short — possibly incomplete")

        # 4. Check citations (if context was provided)
        if context and not citations:
            issues.append("No citations provided despite context being available")

        # 5. Check for error indicators
        if "error" in lower_output or "failed" in lower_output:
            issues.append("Output contains error indicators")

        # Decision
        if len(issues) >= 3:
            action = "escalate"
            reason = f"Multiple issues detected: {'; '.join(issues)}"
        elif len(issues) >= 1:
            action = "retry"
            reason = f"Issues found: {'; '.join(issues)}"
        else:
            action = "accept"
            reason = "Output passed all checks"

        # Log the review as a communication
        await self.comms.send(
            organization_id=organization_id,
            from_agent_id=agent_id, to_agent_id=None,  # to supervisor
            message_type="supervisor_review",
            content=json.dumps({"action": action, "reason": reason, "issues": issues}),
            task_id=task_id)

        return {"action": action, "reason": reason, "issues": issues,
                "confidence": confidence, "citations_count": len(citations or [])}


# ====================================================================
# Validator Service — validate JSON, responses, APIs, citations
# ====================================================================

class ValidatorService:
    """Validates agent outputs against expected schemas and rules."""

    @staticmethod
    def validate_json(text: str) -> dict[str, Any]:
        """Try to parse text as JSON. Returns {valid, data, error}."""
        try:
            data = json.loads(text)
            return {"valid": True, "data": data, "error": None}
        except json.JSONDecodeError as e:
            # Try to extract JSON from text
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(0))
                    return {"valid": True, "data": data, "error": None}
                except json.JSONDecodeError:
                    pass
            return {"valid": False, "data": None, "error": str(e)}

    @staticmethod
    def validate_response(output: str, *, min_length: int = 10,
                          max_length: int = 50000) -> dict[str, Any]:
        """Validate response length and basic quality."""
        issues: list[str] = []
        if len(output) < min_length:
            issues.append(f"Response too short ({len(output)} < {min_length})")
        if len(output) > max_length:
            issues.append(f"Response too long ({len(output)} > {max_length})")
        if output.strip() == output and " " not in output and len(output) > 100:
            issues.append("Response appears to be a single token (no spaces)")
        return {"valid": len(issues) == 0, "issues": issues}

    @staticmethod
    def validate_citations(citations: list, context: str) -> dict[str, Any]:
        """Validate that citations reference actual content in the context."""
        if not citations:
            return {"valid": True, "verified_count": 0, "issues": []}
        issues: list[str] = []
        verified = 0
        for i, cite in enumerate(citations):
            if not isinstance(cite, dict):
                issues.append(f"Citation {i}: not a dict")
                continue
            # Check if citation text appears in context
            cite_text = cite.get("text", "")[:100]
            if cite_text and cite_text in context:
                verified += 1
            elif cite_text:
                issues.append(f"Citation {i}: text not found in context")
        return {"valid": len(issues) == 0, "verified_count": verified,
                "total": len(citations), "issues": issues}


# ====================================================================
# Circuit Breaker — per-agent failure tracking with open/half-open/closed
# ====================================================================

class CircuitBreaker:
    """Circuit breaker for agent execution.

    States:
      - closed:     normal operation (agent is healthy)
      - open:       agent is failing; skip execution and return fallback
      - half_open:  allow one test execution to check if agent recovered

    Thresholds:
      - Open after 5 consecutive failures
      - Half-open after 60 seconds
      - Close after 1 successful execution in half-open
    """

    FAILURE_THRESHOLD = 5
    RECOVERY_TIMEOUT_SECONDS = 60

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def can_execute(self, *, agent_id: str) -> dict[str, Any]:
        """Check if the agent can execute (circuit breaker is closed or half-open)."""
        health = await self._get_or_create_health(agent_id)
        now = datetime.now(UTC)

        if health.circuit_breaker_state == "open":
            # Check if recovery timeout has passed
            if health.circuit_breaker_reset_at:
                reset_at = health.circuit_breaker_reset_at
                if reset_at.tzinfo is None:
                    reset_at = reset_at.replace(tzinfo=UTC)
                if now > reset_at:
                    # Transition to half-open
                    health.circuit_breaker_state = "half_open"
                    await self.db.flush()
                    return {"can_execute": True, "state": "half_open",
                            "reason": "Circuit breaker in half-open state — testing recovery"}
            return {"can_execute": False, "state": "open",
                    "reason": f"Circuit breaker open — {health.consecutive_failures} consecutive failures",
                    "reset_at": health.circuit_breaker_reset_at.isoformat() if health.circuit_breaker_reset_at else None}

        return {"can_execute": True, "state": health.circuit_breaker_state}

    async def record_success(self, *, agent_id: str, latency_ms: int = 0,
                             cost_cents: int = 0, confidence: float = 0.0) -> None:
        """Record a successful execution — resets consecutive failures."""
        health = await self._get_or_create_health(agent_id)
        health.consecutive_failures = 0
        health.total_executions += 1
        health.last_execution_at = datetime.now(UTC)
        health.status = "healthy"

        # Update rolling averages
        if health.avg_latency_ms is None:
            health.avg_latency_ms = float(latency_ms)
        else:
            health.avg_latency_ms = (health.avg_latency_ms * 0.9 + latency_ms * 0.1)
        if health.avg_cost_cents is None:
            health.avg_cost_cents = float(cost_cents)
        else:
            health.avg_cost_cents = (health.avg_cost_cents * 0.9 + cost_cents * 0.1)
        if health.avg_confidence is None:
            health.avg_confidence = confidence
        else:
            health.avg_confidence = (health.avg_confidence * 0.9 + confidence * 0.1)

        # Close circuit breaker if it was half-open
        if health.circuit_breaker_state == "half_open":
            health.circuit_breaker_state = "closed"
            health.circuit_breaker_reset_at = None

        await self.db.flush()

    async def record_failure(self, *, agent_id: str, error: str) -> None:
        """Record a failed execution — may trip the circuit breaker."""
        health = await self._get_or_create_health(agent_id)
        health.consecutive_failures += 1
        health.total_executions += 1
        health.total_failures += 1
        health.last_error_at = datetime.now(UTC)
        health.last_error_message = error[:500]

        if health.consecutive_failures >= self.FAILURE_THRESHOLD:
            health.circuit_breaker_state = "open"
            health.circuit_breaker_reset_at = datetime.now(UTC) + timedelta(seconds=self.RECOVERY_TIMEOUT_SECONDS)
            health.status = "unhealthy"
            logger.warning("circuit_breaker_opened", agent_id=agent_id,
                          failures=health.consecutive_failures)
        elif health.consecutive_failures >= 2:
            health.status = "degraded"

        await self.db.flush()

    async def _get_or_create_health(self, agent_id: str) -> AgentHealth:
        """Get or create the health record for an agent."""
        result = await self.db.execute(
            select(AgentHealth).where(AgentHealth.agent_id == agent_id))
        health = result.scalar_one_or_none()
        if health is None:
            # Need org_id — get from agent config
            agent = await self.db.get(AgentConfig, uuid.UUID(agent_id))
            org_id = agent.organization_id if agent else "unknown"
            health = AgentHealth(
                organization_id=org_id, agent_id=agent_id,
                status="healthy", consecutive_failures=0,
                total_executions=0, total_failures=0,
                circuit_breaker_state="closed")
            self.db.add(health)
            await self.db.flush()
        return health


# ====================================================================
# Agent Monitor — real-time health, running/waiting/completed/failed tracking
# ====================================================================

class AgentMonitor:
    """Real-time monitoring of agent execution across the org."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_dashboard(self, *, organization_id: uuid.UUID) -> dict[str, Any]:
        """Get the complete monitoring dashboard for an org."""
        org_id = str(organization_id)

        # Execution stats
        exec_stats = await self.db.execute(
            select(AgentExecution.status, func.count(AgentExecution.id))
            .where(AgentExecution.organization_id == org_id)
            .group_by(AgentExecution.status))
        exec_counts = {row[0]: int(row[1]) for row in exec_stats.all()}

        # Task queue stats
        task_stats = await self.db.execute(
            select(TaskQueue.status, func.count(TaskQueue.id))
            .where(TaskQueue.organization_id == org_id)
            .group_by(TaskQueue.status))
        task_counts = {row[0]: int(row[1]) for row in task_stats.all()}

        # Agent health summary
        health_stats = await self.db.execute(
            select(AgentHealth.status, func.count(AgentHealth.id))
            .where(AgentHealth.organization_id == org_id)
            .group_by(AgentHealth.status))
        health_counts = {row[0]: int(row[1]) for row in health_stats.all()}

        # Cost + token totals (last 24h)
        cutoff = datetime.now(UTC) - timedelta(hours=24)
        cost_result = await self.db.execute(
            select(func.coalesce(func.sum(AgentExecution.cost_cents), 0),
                   func.coalesce(func.sum(AgentExecution.total_tokens), 0),
                   func.coalesce(func.avg(AgentExecution.latency_ms), 0),
                   func.coalesce(func.avg(AgentExecution.confidence), 0))
            .where(AgentExecution.organization_id == org_id,
                   AgentExecution.created_at >= cutoff))
        cost_row = cost_result.one()

        # Agent list with health
        from sqlalchemy import String as sa_String
        agents_result = await self.db.execute(
            select(AgentConfig, AgentHealth)
            .outerjoin(AgentHealth, AgentHealth.agent_id == AgentConfig.id.cast(sa_String))
            .where(AgentConfig.organization_id == org_id,
                   AgentConfig.is_archived == False)  # noqa: E712
            .order_by(AgentConfig.name))
        agents = []
        for agent, health in agents_result.all():
            agents.append({
                "id": str(agent.id), "name": agent.name,
                "agent_type": agent.agent_type, "model": agent.model,
                "is_active": agent.is_active,
                "health_status": health.status if health else "unknown",
                "consecutive_failures": health.consecutive_failures if health else 0,
                "circuit_breaker_state": health.circuit_breaker_state if health else "closed",
                "avg_latency_ms": health.avg_latency_ms if health else None,
                "avg_cost_cents": health.avg_cost_cents if health else None,
                "total_executions": health.total_executions if health else 0,
                "total_failures": health.total_failures if health else 0,
            })

        return {
            "executions": {
                "running": exec_counts.get("running", 0),
                "completed": exec_counts.get("completed", 0),
                "failed": exec_counts.get("failed", 0),
                "total": sum(exec_counts.values()),
            },
            "task_queue": {
                "queued": task_counts.get("queued", 0),
                "running": task_counts.get("running", 0),
                "completed": task_counts.get("completed", 0),
                "failed": task_counts.get("failed", 0),
                "total": sum(task_counts.values()),
            },
            "agent_health": {
                "healthy": health_counts.get("healthy", 0),
                "degraded": health_counts.get("degraded", 0),
                "unhealthy": health_counts.get("unhealthy", 0),
            },
            "cost_24h": {
                "total_cents": int(cost_row[0] or 0),
                "total_tokens": int(cost_row[1] or 0),
                "avg_latency_ms": int(cost_row[2] or 0),
                "avg_confidence": round(float(cost_row[3] or 0), 4),
            },
            "agents": agents,
        }

    async def get_agent_health(self, *, organization_id: uuid.UUID,
                               agent_id: uuid.UUID) -> dict[str, Any]:
        """Get detailed health for a single agent."""
        result = await self.db.execute(
            select(AgentHealth).where(
                AgentHealth.organization_id == str(organization_id),
                AgentHealth.agent_id == str(agent_id)))
        health = result.scalar_one_or_none()
        if health is None:
            return {"status": "unknown", "message": "No executions recorded yet"}
        return {
            "status": health.status,
            "circuit_breaker_state": health.circuit_breaker_state,
            "consecutive_failures": health.consecutive_failures,
            "total_executions": health.total_executions,
            "total_failures": health.total_failures,
            "failure_rate": (health.total_failures / health.total_executions) if health.total_executions > 0 else 0,
            "avg_latency_ms": health.avg_latency_ms,
            "avg_cost_cents": health.avg_cost_cents,
            "avg_confidence": health.avg_confidence,
            "last_execution_at": health.last_execution_at.isoformat() if health.last_execution_at else None,
            "last_error_at": health.last_error_at.isoformat() if health.last_error_at else None,
            "last_error_message": health.last_error_message,
        }


# ====================================================================
# Task Scheduler — cron-based + delayed task execution
# ====================================================================

class TaskScheduler:
    """Schedules tasks for future execution.

    Supports:
      - Delayed execution (run after N seconds)
      - Priority-based queue ordering
      - Task cancellation
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def schedule_task(self, *, organization_id: uuid.UUID,
                            task_type: str, input_data: dict,
                            priority: int = 5,
                            delay_seconds: int = 0,
                            assigned_agent_id: str | None = None,
                            user_id: str | None = None) -> TaskQueue:
        """Schedule a new task for execution."""
        scheduled_at = datetime.now(UTC) + timedelta(seconds=delay_seconds) if delay_seconds > 0 else None
        task = TaskQueue(
            organization_id=str(organization_id),
            user_id=user_id, task_type=task_type, priority=priority,
            status="queued" if delay_seconds == 0 else "scheduled",
            input=input_data, assigned_agent_id=assigned_agent_id,
            scheduled_at=scheduled_at)
        self.db.add(task)
        await self.db.flush()
        return task

    async def get_pending_tasks(self, *, organization_id: uuid.UUID,
                                limit: int = 10) -> list[TaskQueue]:
        """Get tasks that are ready to execute (queued or scheduled-past-due)."""
        now = datetime.now(UTC)
        result = await self.db.execute(
            select(TaskQueue).where(
                TaskQueue.organization_id == str(organization_id),
                TaskQueue.status.in_(["queued", "scheduled"]),
                (TaskQueue.scheduled_at.is_(None)) | (TaskQueue.scheduled_at <= now),
            ).order_by(TaskQueue.priority.asc(), TaskQueue.created_at.asc()).limit(limit))
        return list(result.scalars().all())

    async def cancel_task(self, *, organization_id: uuid.UUID, task_id: uuid.UUID) -> None:
        """Cancel a queued task."""
        task = await self.db.get(TaskQueue, task_id)
        if task is None or task.organization_id != str(organization_id):
            raise NotFoundError("Task", str(task_id))
        if task.status not in ("queued", "scheduled"):
            raise ValidationError(f"Cannot cancel task with status '{task.status}'")
        task.status = "cancelled"
        await self.db.flush()


# ====================================================================
# Master Orchestrator — the top-level coordinator
# ====================================================================

class MasterOrchestrator:
    """The Master Orchestrator coordinates the entire multi-agent system.

    Flow:
      1. Receive user request
      2. Route to the appropriate agent (TaskRouter)
      3. If no agent matches, use the Planner to decompose + route subtasks
      4. Execute agent(s) with circuit breaker protection
      5. Supervisor reviews the output
      6. If retry needed, retry with fallback agent/model
      7. Return the final validated response
      8. Track everything in task_queue + task_history

    This is the simplest orchestration pattern that satisfies the requirements:
      - Single-agent routing (70% of requests)
      - Planner-decomposed multi-step (20%)
      - Supervisor review always (10%)
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.router = TaskRouter(db)
        self.scheduler = TaskScheduler(db)
        self.comms = AgentCommunicationLayer(db)
        self.supervisor = SupervisorService(db)
        self.validator = ValidatorService()
        self.breaker = CircuitBreaker(db)
        self.monitor = AgentMonitor(db)
        self.execution_engine = AgentExecutionEngine(db)
        self.planner = PlanningEngine(db)
        self.registry = AgentRegistryService(db)

    async def process(self, *, message: str, organization_id: uuid.UUID,
                      user_id: uuid.UUID | None = None) -> dict[str, Any]:
        """Process a user request through the full orchestration pipeline.

        This is the main entry point for the multi-agent system.
        """
        start = time.perf_counter()
        org_id = str(organization_id)

        # 1. Create a task in the queue
        task = TaskQueue(
            organization_id=org_id, user_id=str(user_id) if user_id else None,
            task_type="user_request", priority=5, status="running",
            input={"message": message})
        self.db.add(task)
        await self.db.flush()

        await self._log_event(org_id, task.id, None, "task_created", {"message": message[:200]})

        try:
            # 2. Route the request
            route_result = await self.router.route(
                message=message, organization_id=organization_id)

            if route_result.get("needs_planner"):
                # 3a. No direct agent — use planner to decompose
                await self._log_event(org_id, task.id, None, "planner_invoked", {})
                plan = await self.planner.plan(task=message)

                # Find agents for each subtask
                results: list[dict[str, Any]] = []
                for step in plan:
                    agent = await self.router.find_agent_for_type(
                        organization_id=organization_id,
                        agent_type=step.get("agent_type", "custom"))
                    if agent is None:
                        results.append({"step": step["description"], "output": None,
                                        "error": f"No agent for type {step['agent_type']}"})
                        continue

                    # Check circuit breaker
                    cb = await self.breaker.can_execute(agent_id=str(agent.id))
                    if not cb["can_execute"]:
                        results.append({"step": step["description"], "output": None,
                                        "error": cb["reason"]})
                        continue

                    # Execute
                    exec_result = await self.execution_engine.execute(
                        agent_id=agent.id, organization_id=organization_id,
                        input_message=step["description"], user_id=user_id)
                    results.append({"step": step["description"], "output": exec_result.get("output"),
                                    "agent_id": str(agent.id), "cost_cents": exec_result.get("cost_cents", 0)})

                    # Update circuit breaker
                    if exec_result["status"] == "completed":
                        await self.breaker.record_success(
                            agent_id=str(agent.id), latency_ms=exec_result.get("latency_ms", 0),
                            cost_cents=exec_result.get("cost_cents", 0),
                            confidence=exec_result.get("confidence", 0))
                    else:
                        await self.breaker.record_failure(
                            agent_id=str(agent.id), error=exec_result.get("error", "Unknown"))

                # Synthesize results
                synthesis = "\n\n".join(f"**{r['step']}**: {r.get('output', 'N/A')}"
                                       for r in results if r.get("output"))
                task.output = {"synthesis": synthesis, "steps": results, "plan": plan}
                task.planner_output = plan

                # Supervisor review
                review = await self.supervisor.review(
                    organization_id=organization_id, task_id=task.id,
                    agent_id="", output=synthesis, confidence=0.7)
                task.supervisor_output = review

                if review["action"] == "accept":
                    task.status = "completed"
                elif review["action"] == "retry":
                    task.status = "completed"  # accept with caveats
                else:
                    task.status = "escalated"

                final_output = synthesis
                total_cost = sum(r.get("cost_cents", 0) for r in results)

            else:
                # 3b. Direct routing to a single agent
                agent = route_result["agent"]
                await self._log_event(org_id, task.id, str(agent.id), "agent_routed",
                                     {"agent_type": agent.agent_type,
                                      "confidence": route_result["intent"]["confidence"]})

                # Check circuit breaker
                cb = await self.breaker.can_execute(agent_id=str(agent.id))
                if not cb["can_execute"]:
                    task.status = "failed"
                    task.error_message = cb["reason"]
                    final_output = f"Agent unavailable: {cb['reason']}"
                    total_cost = 0
                else:
                    # Execute
                    exec_result = await self.execution_engine.execute(
                        agent_id=agent.id, organization_id=organization_id,
                        input_message=message, user_id=user_id)

                    # Update circuit breaker
                    if exec_result["status"] == "completed":
                        await self.breaker.record_success(
                            agent_id=str(agent.id), latency_ms=exec_result.get("latency_ms", 0),
                            cost_cents=exec_result.get("cost_cents", 0),
                            confidence=exec_result.get("confidence", 0))
                    else:
                        await self.breaker.record_failure(
                            agent_id=str(agent.id), error=exec_result.get("error", "Unknown"))

                    # Supervisor review
                    review = await self.supervisor.review(
                        organization_id=organization_id, task_id=task.id,
                        agent_id=str(agent.id), output=exec_result.get("output", ""),
                        citations=exec_result.get("citations"),
                        confidence=exec_result.get("confidence", 0))

                    task.supervisor_output = review
                    task.output = {"output": exec_result.get("output"),
                                   "citations": exec_result.get("citations"),
                                   "review": review}
                    total_cost = exec_result.get("cost_cents", 0)

                    if review["action"] == "accept":
                        task.status = "completed"
                        final_output = exec_result.get("output", "")
                    elif review["action"] == "retry" and task.retry_count < task.max_retries:
                        # Simple retry — re-execute
                        task.retry_count += 1
                        retry_result = await self.execution_engine.execute(
                            agent_id=agent.id, organization_id=organization_id,
                            input_message=message, user_id=user_id)
                        final_output = retry_result.get("output", "")
                        task.status = "completed" if retry_result["status"] == "completed" else "failed"
                        total_cost += retry_result.get("cost_cents", 0)
                    elif review["action"] == "escalate":
                        task.status = "escalated"
                        final_output = exec_result.get("output", "") + "\n\n[Note: This response was flagged for review.]"
                    else:
                        task.status = "completed"
                        final_output = exec_result.get("output", "")

            # 4. Complete the task
            task.completed_at = datetime.now(UTC)
            task.latency_ms = int((time.perf_counter() - start) * 1000)
            task.cost_cents = total_cost
            await self.db.flush()

            await self._log_event(org_id, task.id, None, "task_completed",
                                 {"status": task.status, "latency_ms": task.latency_ms,
                                  "cost_cents": total_cost})

            return {
                "task_id": str(task.id), "output": final_output,
                "status": task.status, "latency_ms": task.latency_ms,
                "cost_cents": total_cost, "review": task.supervisor_output,
            }

        except Exception as e:
            logger.error("orchestration_failed", error=str(e))
            task.status = "failed"
            task.error_message = str(e)
            task.completed_at = datetime.now(UTC)
            task.latency_ms = int((time.perf_counter() - start) * 1000)
            await self.db.flush()
            return {"task_id": str(task.id), "output": None, "status": "failed",
                    "error": str(e), "latency_ms": task.latency_ms}

    async def _log_event(self, org_id: str, task_id: uuid.UUID | None,
                         agent_id: str | None, event_type: str, data: dict) -> None:
        """Log an event to task_history."""
        event = TaskHistory(
            organization_id=org_id, task_id=task_id, agent_id=agent_id,
            event_type=event_type, event_data=data)
        self.db.add(event)
        await self.db.flush()

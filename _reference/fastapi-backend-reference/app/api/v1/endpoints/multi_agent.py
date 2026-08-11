"""Multi-Agent Orchestration API — task processing, routing, scheduling, monitoring, communications."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, no_content, paginated, success
from app.models.multi_agent import TaskHistory, TaskQueue
from app.services.common import resolve_org_id
from app.services.multi_agent_orchestrator import (
    AgentCommunicationLayer, AgentMonitor, MasterOrchestrator, TaskRouter,
    TaskScheduler, ValidatorService,
)

router = APIRouter()


# ===== Schemas =====

class ProcessRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)


class ScheduleTaskRequest(BaseModel):
    task_type: str
    input_data: dict = Field(default_factory=dict)
    priority: int = Field(5, ge=1, le=10)
    delay_seconds: int = Field(0, ge=0, le=86400)
    assigned_agent_id: str | None = None


class RouteRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class SendMessageRequest(BaseModel):
    from_agent_id: str | None = None
    to_agent_id: str | None = None
    message_type: str
    content: str
    task_id: uuid.UUID | None = None
    metadata: dict | None = None


class ValidateJsonRequest(BaseModel):
    text: str


# ===== Master Orchestrator =====

@router.post("/process", summary="Process request via master orchestrator")
async def process_request(request: ProcessRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Process a user request through the full multi-agent orchestration pipeline.

    The orchestrator will:
    1. Route the request to the appropriate agent
    2. If no agent matches, decompose into subtasks via the Planner
    3. Execute with circuit breaker protection
    4. Supervisor reviews the output
    5. Return the validated response
    """
    org_id = await resolve_org_id(db, user)
    orchestrator = MasterOrchestrator(db)
    result = await orchestrator.process(
        message=request.message, organization_id=org_id, user_id=user.id)
    await db.commit()
    return success(result)


# ===== Task Router =====

@router.post("/route", summary="Route message to agent")
async def route_message(request: RouteRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Classify user intent and find the appropriate agent."""
    org_id = await resolve_org_id(db, user)
    router_svc = TaskRouter(db)
    result = await router_svc.route(message=request.message, organization_id=org_id)
    return success({
        "intent": result.get("intent"),
        "needs_planner": result.get("needs_planner", False),
        "agent_id": str(result["agent"].id) if result.get("agent") else None,
        "agent_name": result["agent"].name if result.get("agent") else None,
        "agent_type": result["agent"].agent_type if result.get("agent") else None,
    })


# ===== Task Queue =====

@router.get("/tasks", summary="List tasks")
async def list_tasks(status_filter: str | None = Query(None, alias="status"),
                     skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                     user: CurrentUser = None, db: DBSession = None) -> dict:
    """List tasks in the queue."""
    from sqlalchemy import func
    org_id = await resolve_org_id(db, user)
    conditions = [TaskQueue.organization_id == str(org_id)]
    if status_filter:
        conditions.append(TaskQueue.status == status_filter)
    count_result = await db.execute(
        select(func.count()).select_from(TaskQueue).where(*conditions))
    total = int(count_result.scalar_one_or_none() or 0)
    result = await db.execute(
        select(TaskQueue).where(*conditions)
        .order_by(TaskQueue.created_at.desc()).offset(skip).limit(limit))
    return paginated([
        {"id": str(t.id), "task_type": t.task_type, "status": t.status,
         "priority": t.priority, "assigned_agent_id": t.assigned_agent_id,
         "error_message": t.error_message, "retry_count": t.retry_count,
         "cost_cents": t.cost_cents, "total_tokens": t.total_tokens,
         "latency_ms": t.latency_ms,
         "created_at": t.created_at.isoformat() if t.created_at else None,
         "completed_at": t.completed_at.isoformat() if t.completed_at else None}
        for t in result.scalars().all()
    ], total=total, skip=skip, limit=limit)


@router.get("/tasks/{task_id}", summary="Get task detail")
async def get_task(task_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Get full details of a task."""
    from app.core.exceptions import NotFoundError
    org_id = await resolve_org_id(db, user)
    task = await db.get(TaskQueue, task_id)
    if task is None or task.organization_id != str(org_id):
        raise NotFoundError("Task", str(task_id))
    return success({
        "id": str(task.id), "task_type": task.task_type, "status": task.status,
        "priority": task.priority, "input": task.input, "output": task.output,
        "assigned_agent_id": task.assigned_agent_id,
        "planner_output": task.planner_output, "supervisor_output": task.supervisor_output,
        "error_message": task.error_message, "retry_count": task.retry_count,
        "cost_cents": task.cost_cents, "total_tokens": task.total_tokens,
        "latency_ms": task.latency_ms,
        "scheduled_at": task.scheduled_at.isoformat() if task.scheduled_at else None,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    })


@router.post("/tasks/schedule", status_code=status.HTTP_201_CREATED, summary="Schedule task")
async def schedule_task(request: ScheduleTaskRequest, response: Response,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    """Schedule a new task for future execution."""
    org_id = await resolve_org_id(db, user)
    scheduler = TaskScheduler(db)
    task = await scheduler.schedule_task(
        organization_id=org_id, task_type=request.task_type,
        input_data=request.input_data, priority=request.priority,
        delay_seconds=request.delay_seconds,
        assigned_agent_id=request.assigned_agent_id,
        user_id=str(user.id))
    await db.commit()
    return created({"id": str(task.id), "task_type": task.task_type,
                    "status": task.status, "scheduled_at": task.scheduled_at.isoformat() if task.scheduled_at else None},
                   response=response)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Cancel task")
async def cancel_task(task_id: uuid.UUID, response: Response,
                      user: CurrentUser = None, db: DBSession = None) -> None:
    """Cancel a queued or scheduled task."""
    org_id = await resolve_org_id(db, user)
    scheduler = TaskScheduler(db)
    await scheduler.cancel_task(organization_id=org_id, task_id=task_id)
    await db.commit()
    return no_content(response)


# ===== Task History =====

@router.get("/tasks/{task_id}/history", summary="Task event history")
async def get_task_history(task_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Get the event history for a task."""
    from app.core.exceptions import NotFoundError
    org_id = await resolve_org_id(db, user)
    result = await db.execute(
        select(TaskHistory).where(
            TaskHistory.organization_id == str(org_id),
            TaskHistory.task_id == task_id)
        .order_by(TaskHistory.timestamp))
    return success([
        {"id": str(h.id), "event_type": h.event_type, "event_data": h.event_data,
         "agent_id": h.agent_id, "timestamp": h.timestamp.isoformat() if h.timestamp else None}
        for h in result.scalars().all()
    ])


# ===== Agent Communications =====

@router.get("/communications", summary="List agent communications")
async def list_communications(agent_id: str | None = Query(None),
                              task_id: uuid.UUID | None = Query(None),
                              message_type: str | None = Query(None),
                              limit: int = Query(50, ge=1, le=200),
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    """List inter-agent communications."""
    org_id = await resolve_org_id(db, user)
    comms = AgentCommunicationLayer(db)
    messages = await comms.get_messages(
        organization_id=org_id, agent_id=agent_id, task_id=task_id,
        message_type=message_type, limit=limit)
    return success(messages)


@router.post("/communications", status_code=status.HTTP_201_CREATED, summary="Send agent message")
async def send_communication(request: SendMessageRequest, response: Response,
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    """Send a structured message between agents."""
    org_id = await resolve_org_id(db, user)
    comms = AgentCommunicationLayer(db)
    msg = await comms.send(
        organization_id=org_id, from_agent_id=request.from_agent_id,
        to_agent_id=request.to_agent_id, message_type=request.message_type,
        content=request.content, task_id=request.task_id, metadata=request.metadata)
    await db.commit()
    return created({"id": str(msg.id), "message_type": msg.message_type,
                    "content": msg.content}, response=response)


# ===== Monitoring =====

@router.get("/monitor/dashboard", summary="Agent monitoring dashboard")
async def monitoring_dashboard(user: CurrentUser = None, db: DBSession = None) -> dict:
    """Get the complete monitoring dashboard — agent health, execution stats, costs."""
    org_id = await resolve_org_id(db, user)
    monitor = AgentMonitor(db)
    return success(await monitor.get_dashboard(organization_id=org_id))


@router.get("/monitor/agents/{agent_id}/health", summary="Agent health detail")
async def agent_health_detail(agent_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Get detailed health for a single agent."""
    org_id = await resolve_org_id(db, user)
    monitor = AgentMonitor(db)
    return success(await monitor.get_agent_health(organization_id=org_id, agent_id=agent_id))


# ===== Validator =====

@router.post("/validate/json", summary="Validate JSON")
async def validate_json(request: ValidateJsonRequest, user: CurrentUser = None, db: DBSession = None) -> dict:
    """Validate that text is valid JSON."""
    return success(ValidatorService.validate_json(request.text))

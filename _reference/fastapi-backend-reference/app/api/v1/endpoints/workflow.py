"""Workflow Automation API endpoints.

Endpoints:
- Workflows: CRUD + trigger + execution history
- Approvals: list + approve/reject
- Events: publish + list + replay + DLQ
- Connectors: CRUD + health check + logs
- Webhooks: CRUD + receive
- Rule Sets: CRUD + evaluate
- Scheduled Jobs: CRUD + execute + history
- Operational Dashboard: workflow health, queue, errors
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.models.workflow import (
    Connector,
    ConnectorLog,
    DeadLetterQueue,
    EventLog,
    ScheduledJob,
    WebhookEndpoint,
    Workflow,
    WorkflowApproval,
    WorkflowExecution,
)
from app.workflow.engine import WorkflowEngine
from app.workflow.event_bus import EventBus
from app.workflow.rules_engine import RulesEngine

router = APIRouter()


# ===== Schemas =====


class WorkflowCreateRequest(BaseModel):
    name: str
    description: str | None = None
    trigger_type: str
    trigger_config: dict = Field(default_factory=dict)
    definition: dict = Field(default_factory=dict)
    template_id: uuid.UUID | None = None


class WorkflowTriggerRequest(BaseModel):
    trigger_data: dict = Field(default_factory=dict)


class ApprovalDecisionRequest(BaseModel):
    approved: bool
    notes: str | None = None


class EventPublishRequest(BaseModel):
    event_type: str
    data: dict = Field(default_factory=dict)
    source: str = "api"


class EventSubscribeRequest(BaseModel):
    event_type: str
    handler_type: str  # workflow, webhook, notification
    handler_config: dict = Field(default_factory=dict)
    filter: dict = Field(default_factory=dict)
    max_retries: int = 3


class ConnectorCreateRequest(BaseModel):
    connector_type: str
    name: str
    description: str | None = None
    config: dict = Field(default_factory=dict)
    auth_type: str = "api_key"
    credentials_ref: str | None = None


class WebhookCreateRequest(BaseModel):
    name: str
    source: str
    handler_type: str = "event"
    handler_config: dict = Field(default_factory=dict)
    verify_signature: bool = True


class RuleSetCreateRequest(BaseModel):
    name: str
    description: str | None = None
    rules: list = Field(default_factory=list)
    evaluation_mode: str = "all"


class RuleEvaluateRequest(BaseModel):
    context: dict = Field(default_factory=dict)


class ScheduledJobCreateRequest(BaseModel):
    name: str
    description: str | None = None
    schedule_type: str  # cron, interval, one_time, delayed
    schedule_config: dict = Field(default_factory=dict)
    job_type: str  # workflow, notification, sync, cleanup, report
    job_config: dict = Field(default_factory=dict)
    max_retries: int = 3


# ===== Helper =====


async def _get_org_id(db: AsyncSession, user) -> str | None:
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    return user_orgs[0].organization_id if user_orgs else None


# ===== Workflows =====


@router.get("/workflows", summary="List workflows")
async def list_workflows(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    result = await db.execute(
        select(Workflow)
        .where(Workflow.organization_id == org_id)
        .order_by(Workflow.created_at.desc())
    )
    return [
        {
            "id": str(w.id),
            "name": w.name,
            "status": w.status,
            "trigger_type": w.trigger_type,
            "total_executions": w.total_executions,
            "successful": w.successful_executions,
            "failed": w.failed_executions,
        }
        for w in result.scalars().all()
    ]


@router.post("/workflows", status_code=status.HTTP_201_CREATED, summary="Create workflow")
async def create_workflow(
    request: WorkflowCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    org_id = await _get_org_id(db, user)
    engine = WorkflowEngine(db)
    wf = await engine.create_workflow(
        organization_id=uuid.UUID(org_id),
        name=request.name,
        description=request.description,
        trigger_type=request.trigger_type,
        trigger_config=request.trigger_config,
        definition=request.definition,
        template_id=request.template_id,
        created_by=user.id,
    )
    return {"id": str(wf.id), "name": wf.name, "status": wf.status}


@router.post("/workflows/{workflow_id}/activate", summary="Activate workflow")
async def activate_workflow(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    engine = WorkflowEngine(db)
    wf = await engine.activate_workflow(workflow_id)
    return {"id": str(wf.id), "status": wf.status}


@router.post("/workflows/{workflow_id}/trigger", summary="Trigger workflow")
async def trigger_workflow(
    workflow_id: uuid.UUID,
    request: WorkflowTriggerRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    engine = WorkflowEngine(db)
    execution = await engine.trigger(
        workflow_id=workflow_id,
        trigger_data=request.trigger_data,
        triggered_by=user.id,
    )
    return {
        "execution_id": str(execution.id),
        "status": execution.status,
        "variables": execution.variables,
        "execution_log": execution.execution_log,
    }


@router.get("/workflows/{workflow_id}/executions", summary="List workflow executions")
async def list_executions(
    workflow_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    result = await db.execute(
        select(WorkflowExecution)
        .where(WorkflowExecution.workflow_id == str(workflow_id))
        .order_by(WorkflowExecution.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [
        {
            "id": str(e.id),
            "status": e.status,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            "duration_ms": e.duration_ms,
            "error_message": e.error_message,
        }
        for e in result.scalars().all()
    ]


# ===== Approvals =====


@router.get("/approvals", summary="List pending approvals")
async def list_approvals(
    status: str | None = "pending",
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    stmt = select(WorkflowApproval).where(WorkflowApproval.organization_id == org_id)
    if status:
        stmt = stmt.where(WorkflowApproval.status == status)
    stmt = stmt.order_by(WorkflowApproval.created_at.desc())
    result = await db.execute(stmt)
    return [
        {
            "id": str(a.id),
            "title": a.title,
            "status": a.status,
            "description": a.description,
            "context": a.context,
            "created_at": a.created_at.isoformat(),
        }
        for a in result.scalars().all()
    ]


@router.post("/approvals/{approval_id}/decide", summary="Approve or reject")
async def decide_approval(
    approval_id: uuid.UUID,
    request: ApprovalDecisionRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    engine = WorkflowEngine(db)
    approval = await engine.approve(
        approval_id,
        approved=request.approved,
        decided_by=user.id,
        notes=request.notes,
    )
    return {"id": str(approval.id), "status": approval.status}


# ===== Events =====


@router.post("/events/publish", summary="Publish event")
async def publish_event(
    request: EventPublishRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    org_id = await _get_org_id(db, user)
    bus = EventBus(db)
    event = await bus.publish(
        organization_id=uuid.UUID(org_id),
        event_type=request.event_type,
        data=request.data,
        source=request.source,
    )
    return {
        "id": str(event.id),
        "event_type": event.event_type,
        "subscribers": event.subscribers_count,
        "delivered": event.delivered_count,
        "failed": event.failed_count,
    }


@router.post(
    "/events/subscribe", status_code=status.HTTP_201_CREATED, summary="Subscribe to events"
)
async def subscribe_to_event(
    request: EventSubscribeRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    org_id = await _get_org_id(db, user)
    bus = EventBus(db)
    sub = await bus.subscribe(
        organization_id=uuid.UUID(org_id),
        event_type=request.event_type,
        handler_type=request.handler_type,
        handler_config=request.handler_config,
        filter=request.filter,
        max_retries=request.max_retries,
    )
    return {"id": str(sub.id), "event_type": sub.event_type, "handler_type": sub.handler_type}


@router.get("/events", summary="List events")
async def list_events(
    event_type: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    bus = EventBus(db)
    events = await bus.list_events(uuid.UUID(org_id), event_type=event_type, skip=skip, limit=limit)
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "source": e.source,
            "subscribers": e.subscribers_count,
            "delivered": e.delivered_count,
            "failed": e.failed_count,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]


@router.post("/events/{event_id}/replay", summary="Replay event")
async def replay_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    bus = EventBus(db)
    return await bus.replay(event_id)


@router.get("/events/dlq", summary="List dead letter queue")
async def list_dlq(db: AsyncSession = Depends(get_db), user: CurrentUser = None) -> list[dict]:
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    bus = EventBus(db)
    dlq = await bus.list_dlq(uuid.UUID(org_id))
    return [
        {
            "id": str(d.id),
            "event_type": d.event_type,
            "error_message": d.error_message,
            "retry_count": d.retry_count,
            "status": d.status,
            "created_at": d.created_at.isoformat(),
        }
        for d in dlq
    ]


# ===== Connectors =====


@router.get("/connectors", summary="List connectors")
async def list_connectors(
    db: AsyncSession = Depends(get_db), user: CurrentUser = None
) -> list[dict]:
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    result = await db.execute(
        select(Connector)
        .where(Connector.organization_id == org_id)
        .order_by(Connector.created_at.desc())
    )
    return [
        {
            "id": str(c.id),
            "connector_type": c.connector_type,
            "name": c.name,
            "is_active": c.is_active,
            "last_health_status": c.last_health_status,
            "sync_enabled": c.sync_enabled,
            "last_sync_at": c.last_sync_at.isoformat() if c.last_sync_at else None,
        }
        for c in result.scalars().all()
    ]


@router.post("/connectors", status_code=status.HTTP_201_CREATED, summary="Create connector")
async def create_connector(
    request: ConnectorCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    org_id = await _get_org_id(db, user)
    connector = Connector(
        organization_id=org_id,
        connector_type=request.connector_type,
        name=request.name,
        description=request.description,
        config=request.config,
        auth_type=request.auth_type,
        credentials_ref=request.credentials_ref,
        is_active=True,
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return {
        "id": str(connector.id),
        "connector_type": connector.connector_type,
        "name": connector.name,
    }


@router.get("/connectors/{connector_id}/logs", summary="List connector logs")
async def list_connector_logs(
    connector_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[dict]:
    result = await db.execute(
        select(ConnectorLog)
        .where(ConnectorLog.connector_id == str(connector_id))
        .order_by(ConnectorLog.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [
        {
            "id": str(l.id),
            "operation": l.operation,
            "method": l.method,
            "endpoint": l.endpoint,
            "status": l.status,
            "duration_ms": l.duration_ms,
            "error_message": l.error_message,
            "created_at": l.created_at.isoformat(),
        }
        for l in result.scalars().all()
    ]


# ===== Webhooks =====


@router.get("/webhooks", summary="List webhooks")
async def list_webhooks(db: AsyncSession = Depends(get_db), user: CurrentUser = None) -> list[dict]:
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    result = await db.execute(
        select(WebhookEndpoint).where(WebhookEndpoint.organization_id == org_id)
    )
    return [
        {
            "id": str(w.id),
            "name": w.name,
            "path": w.path,
            "source": w.source,
            "is_active": w.is_active,
            "total_received": w.total_received,
        }
        for w in result.scalars().all()
    ]


@router.post("/webhooks", status_code=status.HTTP_201_CREATED, summary="Create webhook")
async def create_webhook(
    request: WebhookCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    org_id = await _get_org_id(db, user)
    import secrets

    path = f"/webhooks/{request.source}/{secrets.token_hex(8)}"
    webhook = WebhookEndpoint(
        organization_id=org_id,
        name=request.name,
        path=path,
        source=request.source,
        handler_type=request.handler_type,
        handler_config=request.handler_config,
        secret=secrets.token_hex(16),
        verify_signature=request.verify_signature,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    return {"id": str(webhook.id), "path": webhook.path, "secret": webhook.secret}


# ===== Rule Sets =====


@router.get("/rules", summary="List rule sets")
async def list_rule_sets(
    db: AsyncSession = Depends(get_db), user: CurrentUser = None
) -> list[dict]:
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    engine = RulesEngine(db)
    rule_sets = await engine.list_rule_sets(uuid.UUID(org_id))
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "description": r.description,
            "evaluation_mode": r.evaluation_mode,
            "rules_count": len(r.rules or []),
            "is_active": r.is_active,
            "version": r.version,
        }
        for r in rule_sets
    ]


@router.post("/rules", status_code=status.HTTP_201_CREATED, summary="Create rule set")
async def create_rule_set(
    request: RuleSetCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    org_id = await _get_org_id(db, user)
    engine = RulesEngine(db)
    rs = await engine.create_rule_set(
        organization_id=uuid.UUID(org_id),
        name=request.name,
        rules=request.rules,
        description=request.description,
        evaluation_mode=request.evaluation_mode,
    )
    return {"id": str(rs.id), "name": rs.name}


@router.post("/rules/{rule_set_id}/evaluate", summary="Evaluate rule set")
async def evaluate_rule_set(
    rule_set_id: uuid.UUID,
    request: RuleEvaluateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    engine = RulesEngine(db)
    result = await engine.evaluate(rule_set_id, request.context)
    return result


# ===== Scheduled Jobs =====


@router.get("/jobs", summary="List scheduled jobs")
async def list_jobs(db: AsyncSession = Depends(get_db), user: CurrentUser = None) -> list[dict]:
    org_id = await _get_org_id(db, user)
    if not org_id:
        return []
    result = await db.execute(
        select(ScheduledJob)
        .where(ScheduledJob.organization_id == org_id)
        .order_by(ScheduledJob.created_at.desc())
    )
    return [
        {
            "id": str(j.id),
            "name": j.name,
            "schedule_type": j.schedule_type,
            "job_type": j.job_type,
            "status": j.status,
            "total_runs": j.total_runs,
            "successful_runs": j.successful_runs,
            "failed_runs": j.failed_runs,
            "next_run_at": j.next_run_at.isoformat() if j.next_run_at else None,
        }
        for j in result.scalars().all()
    ]


@router.post("/jobs", status_code=status.HTTP_201_CREATED, summary="Create scheduled job")
async def create_job(
    request: ScheduledJobCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    org_id = await _get_org_id(db, user)
    job = ScheduledJob(
        organization_id=org_id,
        name=request.name,
        description=request.description,
        schedule_type=request.schedule_type,
        schedule_config=request.schedule_config,
        job_type=request.job_type,
        job_config=request.job_config,
        max_retries=request.max_retries,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return {"id": str(job.id), "name": job.name, "schedule_type": job.schedule_type}


# ===== Operational Dashboard =====


@router.get("/dashboard", summary="Operational dashboard")
async def get_operational_dashboard(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Get operational dashboard with workflow health, queue status, and errors."""
    org_id = await _get_org_id(db, user)
    if not org_id:
        return {"workflows": {}, "events": {}, "connectors": {}, "jobs": {}}

    # Workflow stats
    wf_result = await db.execute(
        select(
            func.count().label("total"),
            func.sum(
                func.cast(
                    WorkflowExecution.status == "running", sa_int := type(func.cast(1, sa.Integer_))
                )
            ).label("running"),  # type: ignore
        )
        .select_from(WorkflowExecution)
        .where(WorkflowExecution.organization_id == org_id)
    )
    wf_row = wf_result.one()

    result = await db.execute(
        select(WorkflowExecution.status, func.count().label("count"))
        .where(WorkflowExecution.organization_id == org_id)
        .group_by(WorkflowExecution.status)
    )
    wf_status_counts = {row.status: row.count for row in result}

    # Event stats
    evt_result = await db.execute(
        select(func.count()).select_from(EventLog).where(EventLog.organization_id == org_id)
    )
    total_events = evt_result.scalar_one_or_none() or 0

    dlq_result = await db.execute(
        select(func.count())
        .select_from(DeadLetterQueue)
        .where(DeadLetterQueue.organization_id == org_id, DeadLetterQueue.status == "failed")
    )
    dlq_count = dlq_result.scalar_one_or_none() or 0

    # Connector stats
    conn_result = await db.execute(
        select(Connector.connector_type, func.count().label("count"))
        .where(Connector.organization_id == org_id, Connector.is_active == True)  # noqa: E712
        .group_by(Connector.connector_type)
    )
    connector_counts = {row.connector_type: row.count for row in conn_result}

    # Pending approvals
    appr_result = await db.execute(
        select(func.count())
        .select_from(WorkflowApproval)
        .where(WorkflowApproval.organization_id == org_id, WorkflowApproval.status == "pending")
    )
    pending_approvals = appr_result.scalar_one_or_none() or 0

    # Active jobs
    job_result = await db.execute(
        select(func.count())
        .select_from(ScheduledJob)
        .where(ScheduledJob.organization_id == org_id, ScheduledJob.status == "active")
    )
    active_jobs = job_result.scalar_one_or_none() or 0

    return {
        "workflows": {
            "total_executions": int(
                wf_status_counts.get("completed", 0)
                + wf_status_counts.get("running", 0)
                + wf_status_counts.get("failed", 0)
            ),
            "running": int(wf_status_counts.get("running", 0)),
            "completed": int(wf_status_counts.get("completed", 0)),
            "failed": int(wf_status_counts.get("failed", 0)),
            "paused": int(wf_status_counts.get("paused", 0)),
        },
        "events": {
            "total_published": total_events,
            "dead_letter_count": dlq_count,
        },
        "connectors": {
            "by_type": connector_counts,
            "total": sum(connector_counts.values()),
        },
        "approvals": {
            "pending": pending_approvals,
        },
        "jobs": {
            "active": active_jobs,
        },
    }

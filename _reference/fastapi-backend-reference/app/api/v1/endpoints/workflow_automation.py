"""Enterprise Workflow Automation API — 30+ endpoints for definition, execution, approvals, scheduling, monitoring."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.exceptions import NotFoundError
from app.core.response import created, no_content, paginated, success
from app.services.common import resolve_org_id
from app.services.workflow_automation import (
    WorkflowApprovalService, WorkflowDefinitionService, WorkflowExecutionService,
    WorkflowMonitor, WorkflowQueueService, WorkflowScheduleService,
)

router = APIRouter()


# ===== Schemas =====

class CreateWorkflowRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    definition: dict | None = None
    trigger_type: str = "manual"
    trigger_config: dict | None = None
    category: str | None = None
    tags: list[str] = Field(default_factory=list)
    icon: str | None = None
    timeout_seconds: int = 300
    retry_policy: dict | None = None


class UpdateWorkflowRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    definition: dict | None = None
    trigger_type: str | None = None
    trigger_config: dict | None = None
    category: str | None = None
    tags: list[str] | None = None
    icon: str | None = None
    is_active: bool | None = None
    is_published: bool | None = None
    timeout_seconds: int | None = None
    change_summary: str | None = None


class ExecuteWorkflowRequest(BaseModel):
    input_data: dict = Field(default_factory=dict)


class EnqueueRequest(BaseModel):
    priority: int = Field(5, ge=1, le=10)
    input_data: dict = Field(default_factory=dict)
    delay_seconds: int = Field(0, ge=0, le=86400)


class CreateScheduleRequest(BaseModel):
    name: str
    schedule_type: str  # cron, daily, weekly, monthly, one_time
    cron_expression: str | None = None
    timezone: str = "UTC"
    input_data: dict = Field(default_factory=dict)


class ApproveRequest(BaseModel):
    comment: str | None = None


class ReassignRequest(BaseModel):
    new_approver_id: uuid.UUID


# ===== Workflow Definition CRUD =====

@router.post("/workflows", status_code=status.HTTP_201_CREATED, summary="Create workflow")
async def create_workflow(request: CreateWorkflowRequest, response: Response,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowDefinitionService(db)
    wf = await svc.create_workflow(
        organization_id=org_id, name=request.name, description=request.description,
        definition=request.definition, trigger_type=request.trigger_type,
        trigger_config=request.trigger_config, category=request.category,
        tags=request.tags, icon=request.icon, owner_id=user.id,
        timeout_seconds=request.timeout_seconds, retry_policy=request.retry_policy)
    await db.commit()
    return created(svc.to_dict(wf), response=response)


@router.get("/workflows", summary="List workflows")
async def list_workflows(is_active: bool | None = Query(None), is_template: bool | None = Query(None),
                         category: str | None = Query(None), skip: int = Query(0, ge=0),
                         limit: int = Query(50, ge=1, le=200),
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowDefinitionService(db)
    workflows, total = await svc.list_workflows(
        organization_id=org_id, is_active=is_active, is_template=is_template,
        category=category, skip=skip, limit=limit)
    return paginated([svc.to_dict(w) for w in workflows], total=total, skip=skip, limit=limit)


@router.get("/workflows/{workflow_id}", summary="Get workflow")
async def get_workflow(workflow_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowDefinitionService(db)
    wf = await svc.get_workflow(organization_id=org_id, workflow_id=workflow_id)
    return success(svc.to_dict(wf))


@router.patch("/workflows/{workflow_id}", summary="Update workflow")
async def update_workflow(workflow_id: uuid.UUID, request: UpdateWorkflowRequest,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowDefinitionService(db)
    updates = request.model_dump(exclude_unset=True)
    wf = await svc.update_workflow(organization_id=org_id, workflow_id=workflow_id,
                                   updated_by=user.id, **updates)
    await db.commit()
    return success(svc.to_dict(wf))


@router.delete("/workflows/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete workflow")
async def delete_workflow(workflow_id: uuid.UUID, response: Response,
                          user: CurrentUser = None, db: DBSession = None) -> None:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowDefinitionService(db)
    await svc.delete_workflow(organization_id=org_id, workflow_id=workflow_id)
    await db.commit()
    return no_content(response)


# ===== Workflow Versions =====

@router.get("/workflows/{workflow_id}/versions", summary="List versions")
async def list_versions(workflow_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowDefinitionService(db)
    versions = await svc.list_versions(organization_id=org_id, workflow_id=workflow_id)
    return success([{"id": str(v.id), "version": v.version, "change_summary": v.change_summary,
                     "is_active": v.is_active, "created_by": v.created_by,
                     "created_at": v.created_at.isoformat() if v.created_at else None}
                    for v in versions])


@router.post("/workflows/{workflow_id}/rollback/{version}", summary="Rollback to version")
async def rollback_workflow(workflow_id: uuid.UUID, version: int,
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowDefinitionService(db)
    wf = await svc.rollback_to_version(organization_id=org_id, workflow_id=workflow_id, version=version)
    await db.commit()
    return success(svc.to_dict(wf))


# ===== Workflow Execution =====

@router.post("/workflows/{workflow_id}/execute", summary="Execute workflow")
async def execute_workflow(workflow_id: uuid.UUID, request: ExecuteWorkflowRequest,
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowExecutionService(db)
    result = await svc.execute(organization_id=org_id, workflow_id=workflow_id,
                               input_data=request.input_data, user_id=user.id)
    await db.commit()
    return success(result)


@router.post("/executions/{execution_id}/pause", summary="Pause execution")
async def pause_execution(execution_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowExecutionService(db)
    execution = await svc.pause(organization_id=org_id, execution_id=execution_id)
    await db.commit()
    return success({"id": str(execution.id), "status": execution.status})


@router.post("/executions/{execution_id}/resume", summary="Resume execution")
async def resume_execution(execution_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowExecutionService(db)
    execution = await svc.resume(organization_id=org_id, execution_id=execution_id)
    await db.commit()
    return success({"id": str(execution.id), "status": execution.status})


@router.post("/executions/{execution_id}/cancel", summary="Cancel execution")
async def cancel_execution(execution_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowExecutionService(db)
    execution = await svc.cancel(organization_id=org_id, execution_id=execution_id)
    await db.commit()
    return success({"id": str(execution.id), "status": execution.status})


@router.post("/executions/{execution_id}/retry", summary="Retry execution")
async def retry_execution(execution_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowExecutionService(db)
    result = await svc.retry(organization_id=org_id, execution_id=execution_id)
    await db.commit()
    return success(result)


@router.get("/executions", summary="List executions")
async def list_executions(workflow_id: uuid.UUID | None = Query(None),
                          status_filter: str | None = Query(None, alias="status"),
                          skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowExecutionService(db)
    executions, total = await svc.list_executions(
        organization_id=org_id, workflow_id=workflow_id, status=status_filter,
        skip=skip, limit=limit)
    return paginated(executions, total=total, skip=skip, limit=limit)


@router.get("/executions/{execution_id}/logs", summary="Execution logs")
async def get_execution_logs(execution_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowExecutionService(db)
    logs = await svc.get_logs(organization_id=org_id, execution_id=execution_id)
    return success(logs)


@router.get("/executions/{execution_id}/variables", summary="Execution variables")
async def get_execution_variables(execution_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowExecutionService(db)
    variables = await svc.get_variables(organization_id=org_id, execution_id=execution_id)
    return success(variables)


# ===== Approvals =====

@router.get("/approvals", summary="List approvals")
async def list_approvals(status_filter: str | None = Query(None, alias="status"),
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowApprovalService(db)
    approvals = await svc.list_approvals(organization_id=org_id, status=status_filter)
    return success(approvals)


@router.post("/approvals/{approval_id}/approve", summary="Approve")
async def approve_workflow(approval_id: uuid.UUID, request: ApproveRequest,
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowApprovalService(db)
    approval = await svc.approve(organization_id=org_id, approval_id=approval_id,
                                 approver_id=user.id, comment=request.comment)
    await db.commit()
    return success({"id": str(approval.id), "status": approval.status})


@router.post("/approvals/{approval_id}/reject", summary="Reject")
async def reject_workflow(approval_id: uuid.UUID, request: ApproveRequest,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowApprovalService(db)
    approval = await svc.reject(organization_id=org_id, approval_id=approval_id,
                                rejector_id=user.id, comment=request.comment)
    await db.commit()
    return success({"id": str(approval.id), "status": approval.status})


@router.post("/approvals/{approval_id}/reassign", summary="Reassign approval")
async def reassign_approval(approval_id: uuid.UUID, request: ReassignRequest,
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowApprovalService(db)
    approval = await svc.reassign(organization_id=org_id, approval_id=approval_id,
                                  new_approver_id=request.new_approver_id)
    await db.commit()
    return success({"id": str(approval.id), "approver_id": approval.approver_id})


# ===== Scheduling =====

@router.post("/workflows/{workflow_id}/schedules", status_code=status.HTTP_201_CREATED, summary="Create schedule")
async def create_schedule(workflow_id: uuid.UUID, request: CreateScheduleRequest, response: Response,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowScheduleService(db)
    schedule = await svc.create_schedule(
        organization_id=org_id, workflow_id=workflow_id, name=request.name,
        schedule_type=request.schedule_type, cron_expression=request.cron_expression,
        timezone=request.timezone, input_data=request.input_data, created_by=user.id)
    await db.commit()
    return created({"id": str(schedule.id), "name": schedule.name,
                    "schedule_type": schedule.schedule_type,
                    "next_run_at": schedule.next_run_at.isoformat() if schedule.next_run_at else None},
                   response=response)


@router.get("/schedules", summary="List schedules")
async def list_schedules(is_active: bool | None = Query(None),
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowScheduleService(db)
    schedules = await svc.list_schedules(organization_id=org_id, is_active=is_active)
    return success(schedules)


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete schedule")
async def delete_schedule(schedule_id: uuid.UUID, response: Response,
                          user: CurrentUser = None, db: DBSession = None) -> None:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowScheduleService(db)
    await svc.delete_schedule(organization_id=org_id, schedule_id=schedule_id)
    await db.commit()
    return no_content(response)


# ===== Queue =====

@router.post("/workflows/{workflow_id}/enqueue", status_code=status.HTTP_201_CREATED, summary="Enqueue workflow")
async def enqueue_workflow(workflow_id: uuid.UUID, request: EnqueueRequest, response: Response,
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowQueueService(db)
    item = await svc.enqueue(organization_id=org_id, workflow_id=workflow_id,
                             priority=request.priority, input_data=request.input_data,
                             delay_seconds=request.delay_seconds)
    await db.commit()
    return created({"id": str(item.id), "status": item.status, "priority": item.priority,
                    "scheduled_at": item.scheduled_at.isoformat() if item.scheduled_at else None},
                   response=response)


@router.get("/queue", summary="Queue stats")
async def queue_stats(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowQueueService(db)
    return success(await svc.get_queue_stats(organization_id=org_id))


@router.delete("/queue/{item_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Cancel queue item")
async def cancel_queue_item(item_id: uuid.UUID, response: Response,
                            user: CurrentUser = None, db: DBSession = None) -> None:
    org_id = await resolve_org_id(db, user)
    svc = WorkflowQueueService(db)
    await svc.cancel_item(organization_id=org_id, item_id=item_id)
    await db.commit()
    return no_content(response)


# ===== Monitoring =====

@router.get("/monitor/dashboard", summary="Workflow monitoring dashboard")
async def monitor_dashboard(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    monitor = WorkflowMonitor(db)
    return success(await monitor.get_dashboard(organization_id=org_id))

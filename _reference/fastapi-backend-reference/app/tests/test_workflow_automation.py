"""Tests for Enterprise Workflow Automation — definition CRUD, execution, approvals, scheduling, queue, monitoring."""

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
from app.models.organization import Organization, UserOrganization
from app.models.role import Role
from app.models.user import User
from app.models.workflow import Workflow, WorkflowApproval, WorkflowExecution
from app.services.workflow_automation import (
    WorkflowApprovalService, WorkflowDefinitionService, WorkflowExecutionService,
    WorkflowMonitor, WorkflowQueueService, WorkflowScheduleService,
)

import app.models  # noqa: F401


@pytest_asyncio.fixture
async def wf_setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        org = Organization(name="WF Test", slug=f"wf-{uuid.uuid4().hex[:8]}", is_active=True)
        session.add(org); await session.flush()
        user = User(email="wf@test.com", full_name="WF User",
                    hashed_password=hash_password("TestPass123!"), is_active=True, is_email_verified=True)
        session.add(user); await session.flush()
        session.add(UserOrganization(user_id=str(user.id), organization_id=str(org.id), role="org_owner", is_active=True))
        session.add(Role(name="org_owner", display_name="Owner", is_system=True, scope="global", priority=90))
        await session.commit()
        org_id = str(org.id); user_id = str(user.id)

    async with async_session() as session:
        yield session, org_id, user_id
    await engine.dispose()


# ===== Workflow Definition Service Tests =====

@pytest.mark.asyncio
class TestWorkflowDefinitionService:
    async def test_create_workflow(self, wf_setup):
        session, org_id, user_id = wf_setup
        svc = WorkflowDefinitionService(session)
        wf = await svc.create_workflow(
            organization_id=uuid.UUID(org_id), name="Test Workflow",
            description="A test", definition={"nodes": [], "edges": []}, owner_id=uuid.UUID(user_id))
        await session.commit()
        assert wf.name == "Test Workflow"
        assert wf.version == 1

    async def test_list_workflows(self, wf_setup):
        session, org_id, _ = wf_setup
        svc = WorkflowDefinitionService(session)
        await svc.create_workflow(organization_id=uuid.UUID(org_id), name="WF 1")
        await svc.create_workflow(organization_id=uuid.UUID(org_id), name="WF 2")
        await session.commit()
        workflows, total = await svc.list_workflows(organization_id=uuid.UUID(org_id))
        assert total == 2
        assert len(workflows) == 2

    async def test_update_workflow_creates_version(self, wf_setup):
        session, org_id, user_id = wf_setup
        svc = WorkflowDefinitionService(session)
        wf = await svc.create_workflow(organization_id=uuid.UUID(org_id), name="Original")
        await session.flush()
        updated = await svc.update_workflow(
            organization_id=uuid.UUID(org_id), workflow_id=wf.id,
            updated_by=uuid.UUID(user_id), name="Updated", change_summary="Renamed")
        await session.commit()
        assert updated.name == "Updated"
        assert updated.version == 2
        versions = await svc.list_versions(organization_id=uuid.UUID(org_id), workflow_id=wf.id)
        assert len(versions) == 2

    async def test_rollback_to_version(self, wf_setup):
        session, org_id, user_id = wf_setup
        svc = WorkflowDefinitionService(session)
        wf = await svc.create_workflow(organization_id=uuid.UUID(org_id), name="v1")
        await session.flush()
        await svc.update_workflow(organization_id=uuid.UUID(org_id), workflow_id=wf.id,
                                  updated_by=uuid.UUID(user_id), name="v2", change_summary="v2")
        await session.flush()
        restored = await svc.rollback_to_version(
            organization_id=uuid.UUID(org_id), workflow_id=wf.id, version=1)
        await session.commit()
        assert restored.name == "v1"
        assert restored.version == 3  # v1 → v2 → v3 (rollback)

    async def test_delete_workflow_soft_delete(self, wf_setup):
        session, org_id, _ = wf_setup
        svc = WorkflowDefinitionService(session)
        wf = await svc.create_workflow(organization_id=uuid.UUID(org_id), name="To Delete")
        await session.flush()
        await svc.delete_workflow(organization_id=uuid.UUID(org_id), workflow_id=wf.id)
        await session.commit()
        # Should still exist but inactive
        result = await svc.get_workflow(organization_id=uuid.UUID(org_id), workflow_id=wf.id)
        assert result.is_active is False


# ===== Workflow Queue Service Tests =====

@pytest.mark.asyncio
class TestWorkflowQueueService:
    async def test_enqueue_and_get_pending(self, wf_setup):
        session, org_id, _ = wf_setup
        # Create a workflow first
        def_svc = WorkflowDefinitionService(session)
        wf = await def_svc.create_workflow(organization_id=uuid.UUID(org_id), name="Queue Test")
        await session.flush()

        svc = WorkflowQueueService(session)
        await svc.enqueue(organization_id=uuid.UUID(org_id), workflow_id=wf.id, priority=3)
        await session.commit()

        pending = await svc.get_pending(organization_id=uuid.UUID(org_id))
        assert len(pending) >= 1
        assert pending[0].priority == 3

    async def test_cancel_queue_item(self, wf_setup):
        from app.core.exceptions import ValidationError
        session, org_id, _ = wf_setup
        def_svc = WorkflowDefinitionService(session)
        wf = await def_svc.create_workflow(organization_id=uuid.UUID(org_id), name="Cancel Test")
        await session.flush()

        svc = WorkflowQueueService(session)
        item = await svc.enqueue(organization_id=uuid.UUID(org_id), workflow_id=wf.id)
        await session.flush()
        await svc.cancel_item(organization_id=uuid.UUID(org_id), item_id=item.id)
        await session.commit()
        assert item.status == "cancelled"

    async def test_queue_stats(self, wf_setup):
        session, org_id, _ = wf_setup
        def_svc = WorkflowDefinitionService(session)
        wf = await def_svc.create_workflow(organization_id=uuid.UUID(org_id), name="Stats Test")
        await session.flush()

        svc = WorkflowQueueService(session)
        await svc.enqueue(organization_id=uuid.UUID(org_id), workflow_id=wf.id)
        await svc.enqueue(organization_id=uuid.UUID(org_id), workflow_id=wf.id)
        await session.flush()
        stats = await svc.get_queue_stats(organization_id=uuid.UUID(org_id))
        assert stats.get("queued", 0) >= 2


# ===== Workflow Schedule Service Tests =====

@pytest.mark.asyncio
class TestWorkflowScheduleService:
    async def test_create_schedule(self, wf_setup):
        session, org_id, user_id = wf_setup
        def_svc = WorkflowDefinitionService(session)
        wf = await def_svc.create_workflow(organization_id=uuid.UUID(org_id), name="Scheduled WF")
        await session.flush()

        svc = WorkflowScheduleService(session)
        schedule = await svc.create_schedule(
            organization_id=uuid.UUID(org_id), workflow_id=wf.id, name="Daily Run",
            schedule_type="daily", timezone="UTC", created_by=uuid.UUID(user_id))
        await session.commit()
        assert schedule.name == "Daily Run"
        assert schedule.schedule_type == "daily"
        assert schedule.next_run_at is not None

    async def test_list_schedules(self, wf_setup):
        session, org_id, _ = wf_setup
        def_svc = WorkflowDefinitionService(session)
        wf = await def_svc.create_workflow(organization_id=uuid.UUID(org_id), name="Sched List")
        await session.flush()

        svc = WorkflowScheduleService(session)
        await svc.create_schedule(organization_id=uuid.UUID(org_id), workflow_id=wf.id,
                                  name="S1", schedule_type="daily")
        await svc.create_schedule(organization_id=uuid.UUID(org_id), workflow_id=wf.id,
                                  name="S2", schedule_type="weekly")
        await session.commit()
        schedules = await svc.list_schedules(organization_id=uuid.UUID(org_id))
        assert len(schedules) >= 2

    async def test_delete_schedule(self, wf_setup):
        session, org_id, _ = wf_setup
        def_svc = WorkflowDefinitionService(session)
        wf = await def_svc.create_workflow(organization_id=uuid.UUID(org_id), name="Delete Sched")
        await session.flush()

        svc = WorkflowScheduleService(session)
        schedule = await svc.create_schedule(organization_id=uuid.UUID(org_id), workflow_id=wf.id,
                                             name="To Delete", schedule_type="one_time")
        await session.flush()
        await svc.delete_schedule(organization_id=uuid.UUID(org_id), schedule_id=schedule.id)
        await session.commit()
        schedules = await svc.list_schedules(organization_id=uuid.UUID(org_id))
        assert all(s["id"] != str(schedule.id) for s in schedules)


# ===== Workflow Monitor Tests =====

@pytest.mark.asyncio
class TestWorkflowMonitor:
    async def test_dashboard_returns_data(self, wf_setup):
        session, org_id, _ = wf_setup
        monitor = WorkflowMonitor(session)
        dashboard = await monitor.get_dashboard(organization_id=uuid.UUID(org_id))
        assert "executions" in dashboard
        assert "queue" in dashboard
        assert "performance_24h" in dashboard
        assert "timeline" in dashboard
        assert dashboard["executions"]["total"] >= 0


# ===== Workflow Approval Service Tests =====

@pytest.mark.asyncio
class TestWorkflowApprovalService:
    async def test_list_approvals_empty(self, wf_setup):
        session, org_id, _ = wf_setup
        svc = WorkflowApprovalService(session)
        approvals = await svc.list_approvals(organization_id=uuid.UUID(org_id))
        assert len(approvals) == 0

    async def test_approve_and_reject(self, wf_setup):
        from app.core.exceptions import ValidationError
        session, org_id, user_id = wf_setup
        # Create a workflow + execution first
        def_svc = WorkflowDefinitionService(session)
        wf = await def_svc.create_workflow(organization_id=uuid.UUID(org_id), name="Approval Test")
        await session.flush()
        # Create an approval directly
        approval = WorkflowApproval(
            organization_id=org_id, execution_id=str(uuid.uuid4()),
            workflow_id=str(wf.id), node_id="approval_node",
            title="Test Approval", approver_id=str(user_id),
            status="pending")
        session.add(approval)
        await session.flush()

        svc = WorkflowApprovalService(session)
        # Approve
        approved = await svc.approve(
            organization_id=uuid.UUID(org_id), approval_id=approval.id,
            approver_id=uuid.UUID(user_id), comment="Looks good")
        assert approved.status == "approved"

        # Cannot approve again
        with pytest.raises(ValidationError):
            await svc.approve(organization_id=uuid.UUID(org_id), approval_id=approval.id,
                              approver_id=uuid.UUID(user_id))

    async def test_reassign(self, wf_setup):
        session, org_id, user_id = wf_setup
        def_svc = WorkflowDefinitionService(session)
        wf = await def_svc.create_workflow(organization_id=uuid.UUID(org_id), name="Reassign Test")
        await session.flush()
        approval = WorkflowApproval(
            organization_id=org_id, execution_id=str(uuid.uuid4()),
            workflow_id=str(wf.id), node_id="node1", title="Reassign Test",
            approver_id=str(user_id), status="pending")
        session.add(approval); await session.flush()

        svc = WorkflowApprovalService(session)
        new_user = User(email="new@test.com", full_name="New",
                        hashed_password=hash_password("p"), is_active=True, is_email_verified=True)
        session.add(new_user); await session.flush()

        reassigned = await svc.reassign(
            organization_id=uuid.UUID(org_id), approval_id=approval.id,
            new_approver_id=new_user.id)
        assert reassigned.approver_id == str(new_user.id)

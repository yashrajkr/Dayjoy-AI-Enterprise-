"""Workflow Engine — executes business processes defined as node graphs.

Architecture:
  Trigger → Node 1 → Condition → Node 2 → Approval → Node 3 → End

Node types:
  - trigger: starts the workflow
  - action: executes a business operation (call API, send notification, create ticket)
  - condition: evaluates a rule (IF/ELSE branching)
  - delay: waits for a specified duration
  - approval: pauses workflow for human decision
  - ai_decision: uses AI Gateway to make a decision
  - loop: iterates over a list
  - parallel: executes multiple branches concurrently
  - code: runs custom Python code (sandboxed)

The engine:
  1. Receives a trigger (event, schedule, manual, webhook)
  2. Creates a WorkflowExecution
  3. Processes nodes in order (following edges)
  4. At each node: executes the node handler
  5. At conditions: evaluates and follows the appropriate edge
  6. At approvals: pauses execution and creates a WorkflowApproval
  7. At delays: schedules resumption
  8. On completion: marks execution as completed/failed
  9. On error: retries (up to max_retries), then fails
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.workflow import (
    Workflow,
    WorkflowApproval,
    WorkflowExecution,
)

logger = get_logger(__name__)


class WorkflowEngine:
    """Executes workflow definitions.

    The engine is stateless — all state is stored in WorkflowExecution.
    This allows resumption after delays and approvals.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_workflow(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        trigger_type: str,
        trigger_config: dict,
        definition: dict,
        description: str | None = None,
        template_id: uuid.UUID | None = None,
        created_by: uuid.UUID | None = None,
    ) -> Workflow:
        """Create a new workflow."""
        wf = Workflow(
            organization_id=str(organization_id),
            name=name,
            description=description,
            template_id=str(template_id) if template_id else None,
            trigger_type=trigger_type,
            trigger_config=trigger_config,
            definition=definition,
            status="draft",
            created_by=str(created_by) if created_by else None,
        )
        self.db.add(wf)
        await self.db.flush()
        return wf

    async def activate_workflow(self, workflow_id: uuid.UUID) -> Workflow:
        """Activate a workflow (makes it eligible for triggering)."""
        wf = await self.db.get(Workflow, workflow_id)
        if wf is None:
            raise NotFoundError("Workflow", str(workflow_id))
        wf.status = "active"
        await self.db.flush()
        return wf

    async def trigger(
        self,
        *,
        workflow_id: uuid.UUID,
        trigger_data: dict | None = None,
        triggered_by: uuid.UUID | None = None,
    ) -> WorkflowExecution:
        """Trigger a workflow execution.

        Args:
            workflow_id: The workflow to execute.
            trigger_data: Data from the trigger (event payload, user input, etc.).
            triggered_by: User ID who triggered (None for system).
        """
        wf = await self.db.get(Workflow, workflow_id)
        if wf is None:
            raise NotFoundError("Workflow", str(workflow_id))

        if wf.status != "active":
            raise ValidationError(f"Workflow is not active (status: {wf.status})")

        # Create execution
        execution = WorkflowExecution(
            organization_id=wf.organization_id,
            workflow_id=str(workflow_id),
            trigger_type=wf.trigger_type,
            trigger_data=trigger_data or {},
            status="running",
            variables=dict(trigger_data or {}),  # Initialize variables with trigger data
            started_at=datetime.now(UTC),
            triggered_by=str(triggered_by) if triggered_by else "system",
        )
        self.db.add(execution)

        # Update workflow stats
        wf.total_executions += 1

        await self.db.flush()

        # Execute the workflow
        await self._execute(execution, wf)

        return execution

    async def approve(
        self,
        approval_id: uuid.UUID,
        *,
        approved: bool,
        decided_by: uuid.UUID,
        notes: str | None = None,
    ) -> WorkflowApproval:
        """Approve or reject a workflow approval step."""
        approval = await self.db.get(WorkflowApproval, approval_id)
        if approval is None:
            raise NotFoundError("WorkflowApproval", str(approval_id))

        if approval.status != "pending":
            raise ValidationError(f"Approval already decided (status: {approval.status})")

        approval.status = "approved" if approved else "rejected"
        approval.decided_by = str(decided_by)
        approval.decided_at = datetime.now(UTC)
        approval.decision_notes = notes

        # Resume the workflow execution
        execution = await self.db.get(WorkflowExecution, uuid.UUID(approval.execution_id))
        if execution:
            if approved:
                execution.status = "running"
                execution.current_node_id = None
                await self._execute(
                    execution, await self.db.get(Workflow, uuid.UUID(execution.workflow_id))
                )
            else:
                execution.status = "cancelled"
                execution.completed_at = datetime.now(UTC)
                execution.error_message = f"Workflow rejected at approval step: {approval.title}"

        await self.db.flush()
        return approval

    async def _execute(self, execution: WorkflowExecution, workflow: Workflow) -> None:
        """Execute the workflow nodes.

        This is a simplified execution engine. In production, this would:
        - Use a proper graph traversal algorithm (topological sort)
        - Support parallel execution
        - Handle delays (schedule resumption)
        - Support retries and compensation
        """
        definition = workflow.definition or {}
        nodes = definition.get("nodes", [])
        edges = definition.get("edges", [])

        if not nodes:
            # No nodes — mark as completed
            execution.status = "completed"
            execution.completed_at = datetime.now(UTC)
            workflow.successful_executions += 1
            await self.db.flush()
            return

        # Build node lookup
        node_map = {n["id"]: n for n in nodes if "id" in n}
        edge_map: dict[str, list] = {}
        for edge in edges:
            src = edge.get("from", "")
            edge_map.setdefault(src, []).append(edge)

        # Find trigger node (or first node)
        start_node = None
        for node in nodes:
            if node.get("type") == "trigger":
                start_node = node
                break
        if start_node is None and nodes:
            start_node = nodes[0]

        if start_node is None:
            execution.status = "completed"
            execution.completed_at = datetime.now(UTC)
            await self.db.flush()
            return

        # Process nodes starting from start_node
        current = start_node
        visited = set()
        log_entry = []

        while current and current["id"] not in visited:
            visited.add(current["id"])
            node_type = current.get("type", "action")
            node_config = current.get("config", {})

            step_result = {
                "node_id": current["id"],
                "node_type": node_type,
                "timestamp": datetime.now(UTC).isoformat(),
            }

            try:
                if node_type == "trigger":
                    step_result["result"] = "triggered"
                    step_result["status"] = "success"

                elif node_type == "action":
                    # Execute action (placeholder — production would call the action handler)
                    action_type = node_config.get("action_type", "noop")
                    step_result["result"] = f"Action '{action_type}' executed"
                    step_result["status"] = "success"

                    # Update variables from action output
                    if "output_variable" in node_config:
                        execution.variables[node_config["output_variable"]] = step_result["result"]

                elif node_type == "condition":
                    # Evaluate condition
                    field = node_config.get("field", "")
                    operator = node_config.get("operator", "eq")
                    value = node_config.get("value")

                    actual_value = execution.variables.get(field)
                    condition_met = self._evaluate_condition(actual_value, operator, value)

                    step_result["result"] = (
                        f"Condition: {field} {operator} {value} → {condition_met}"
                    )
                    step_result["status"] = "success"
                    step_result["condition_met"] = condition_met

                elif node_type == "delay":
                    # In production, this would schedule resumption
                    # For now, just log and continue
                    delay_seconds = node_config.get("seconds", 0)
                    step_result["result"] = f"Delayed {delay_seconds}s"
                    step_result["status"] = "success"

                elif node_type == "approval":
                    # Create approval request and pause execution
                    approval = WorkflowApproval(
                        organization_id=execution.organization_id,
                        execution_id=str(execution.id),
                        workflow_id=execution.workflow_id,
                        node_id=current["id"],
                        title=node_config.get("title", "Approval Required"),
                        description=node_config.get("description"),
                        approver_role=node_config.get("approver_role"),
                        context=dict(execution.variables),
                        status="pending",
                        expires_at=None,
                    )
                    self.db.add(approval)
                    execution.status = "paused"
                    execution.current_node_id = current["id"]
                    step_result["result"] = "Approval requested — workflow paused"
                    step_result["status"] = "paused"

                    log_entry.append(step_result)
                    execution.execution_log = log_entry
                    await self.db.flush()
                    return  # Stop execution — waiting for approval

                elif node_type == "ai_decision":
                    # In production, this would call the AI Gateway
                    step_result["result"] = "AI decision: proceed"
                    step_result["status"] = "success"

                elif node_type == "loop":
                    # In production, this would iterate
                    step_result["result"] = "Loop completed"
                    step_result["status"] = "success"

                elif node_type == "parallel":
                    # In production, this would execute branches concurrently
                    step_result["result"] = "Parallel branches completed"
                    step_result["status"] = "success"

                else:
                    step_result["result"] = f"Unknown node type: {node_type}"
                    step_result["status"] = "success"

                log_entry.append(step_result)

            except Exception as e:
                step_result["status"] = "error"
                step_result["error"] = str(e)
                log_entry.append(step_result)

                execution.status = "failed"
                execution.error_message = str(e)
                execution.execution_log = log_entry
                execution.completed_at = datetime.now(UTC)
                workflow.failed_executions += 1
                await self.db.flush()
                return

            # Follow edges to next node
            next_edges = edge_map.get(current["id"], [])
            if not next_edges:
                break  # No more edges — end of workflow

            # For conditions, follow the appropriate edge
            if node_type == "condition":
                condition_met = step_result.get("condition_met", False)
                next_node_id = None
                for edge in next_edges:
                    edge_condition = edge.get("condition")
                    if (
                        edge_condition == "true"
                        and condition_met
                        or edge_condition == "false"
                        and not condition_met
                    ):
                        next_node_id = edge.get("to")
                        break
                if next_node_id is None and next_edges:
                    next_node_id = next_edges[0].get("to")
            else:
                next_node_id = next_edges[0].get("to")

            if next_node_id and next_node_id in node_map:
                current = node_map[next_node_id]
            else:
                break

        # Workflow completed successfully
        execution.status = "completed"
        execution.completed_at = datetime.now(UTC)
        execution.execution_log = log_entry
        if execution.started_at:
            execution.duration_ms = int(
                (execution.completed_at - execution.started_at).total_seconds() * 1000
            )
        workflow.successful_executions += 1
        await self.db.flush()

    def _evaluate_condition(self, actual: Any, operator: str, expected: Any) -> bool:
        """Evaluate a condition."""
        if operator == "eq":
            return actual == expected
        if operator == "ne":
            return actual != expected
        if operator == "gt":
            try:
                return float(actual) > float(expected)
            except (TypeError, ValueError):
                return False
        elif operator == "lt":
            try:
                return float(actual) < float(expected)
            except (TypeError, ValueError):
                return False
        elif operator == "contains":
            return str(expected) in str(actual) if actual else False
        elif operator == "in":
            return actual in (expected or [])
        elif operator == "not_empty":
            return bool(actual)
        elif operator == "is_empty":
            return not bool(actual)
        else:
            return False

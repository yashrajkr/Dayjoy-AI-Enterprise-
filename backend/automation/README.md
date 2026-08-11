# Automation Module

Workflow automation engine. Currently a placeholder — to be implemented.

Reference docs:
- docs/implementation/07_AUTOMATION_BUILD_PLAN.md
- docs/operations/15_STANDARD_OPERATING_PROCEDURES.md

Planned components:
- workflows.service.ts — workflow CRUD
- workflow-engine.service.ts — execution engine
- workflow-trigger.service.ts — event/schedule triggers
- workflow-execution.service.ts — execution tracking
- automation.controller.ts — REST API

Database tables (already in schema.prisma):
- Workflow, WorkflowExecution, WorkflowStep, WorkflowTrigger, ExecutionLog

"""Workflow Automation models — workflows, events, connectors, rules, scheduler.

Phase 6: Enterprise automation and integration platform.
All models are multi-tenant (organization_id).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin

# ====================================================================
# MODULE 1: Workflow Engine
# ====================================================================


class Workflow(UUIDMixin, TimestampMixin, Base):
    """A workflow definition (visual/programmable process).

    Status: draft, active, paused, archived.
    Workflows have triggers, steps (nodes), and edges (connections).
    """

    __tablename__ = "workflows"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Template reference (if created from a template)
    template_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Trigger: what starts this workflow
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Types: event, schedule, manual, webhook, ai_escalation
    trigger_config: Mapped[dict] = mapped_column(JSONBType, default=dict)
    # e.g., {"event": "customer.created"}, {"cron": "0 9 * * *"}, {"webhook": "/webhooks/lead"}

    # Workflow definition (JSON: nodes + edges for visual editor)
    # Nodes: {id, type, config} where type is: trigger, condition, action, delay,
    #         approval, ai_decision, loop, parallel, code
    # Edges: {from, to, condition}
    definition: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Status
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False, index=True
    )  # draft, active, paused, archived

    # Version
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Execution stats
    total_executions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_executions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_executions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Metadata
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    tags: Mapped[list] = mapped_column(JSONBType, default=list)

    # Phase 8 additions
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    owner_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    retry_policy: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    def __repr__(self) -> str:
        return f"<Workflow {self.name} {self.status}>"


class WorkflowExecution(UUIDMixin, TimestampMixin, Base):
    """A single execution of a workflow.

    Tracks the state, current step, variables, and outcome.
    """

    __tablename__ = "workflow_executions"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    workflow_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Trigger info
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_data: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Execution state
    status: Mapped[str] = mapped_column(
        String(20), default="running", nullable=False, index=True
    )  # running, completed, failed, paused, cancelled, timed_out

    # Current node (for workflows paused at approval/manual steps)
    current_node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Variables (workflow context data)
    variables: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Execution log (JSON array of step results)
    execution_log: Mapped[list] = mapped_column(JSONBType, default=list)

    # Error handling
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Triggered by
    triggered_by: Mapped[str | None] = mapped_column(
        String(36), nullable=True
    )  # user_id or "system"

    # Phase 8 additions
    context: Mapped[dict] = mapped_column(JSONBType, default=dict)
    checkpoint: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    parent_execution_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    workflow_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<WorkflowExecution workflow={self.workflow_id} {self.status}>"


class WorkflowTemplate(UUIDMixin, TimestampMixin, Base):
    """A reusable workflow template.

    Templates are pre-built workflows that can be instantiated with custom config.
    """

    __tablename__ = "workflow_templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=True, index=True)

    # Template definition (same format as Workflow.definition)
    definition: Mapped[dict] = mapped_column(JSONBType, default=dict)
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_config: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Required variables (for instantiation)
    required_variables: Mapped[list] = mapped_column(JSONBType, default=list)

    # Status
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<WorkflowTemplate {self.name}>"


class WorkflowApproval(UUIDMixin, TimestampMixin, Base):
    """An approval step in a workflow (human decision node)."""

    __tablename__ = "workflow_approvals"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    workflow_id: Mapped[str] = mapped_column(String(36), nullable=False)
    node_id: Mapped[str] = mapped_column(String(100), nullable=False)

    # Approval details
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    approver_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # user_id
    approver_role: Mapped[str | None] = mapped_column(String(50), nullable=True)  # role name

    # Context (what needs approval)
    context: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Status: pending, approved, rejected, timeout
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)

    # Decision
    decided_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timeout
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<WorkflowApproval {self.status}>"


# ====================================================================
# MODULE 2: Event Bus
# ====================================================================


class EventSubscription(UUIDMixin, TimestampMixin, Base):
    """A subscription to events on the internal event bus.

    When an event is published, all matching subscriptions are triggered.
    Subscriptions can trigger workflows or call webhooks.
    """

    __tablename__ = "event_subscriptions"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # What event to listen for (e.g., "customer.created", "ticket.escalated")
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # What to do when event fires
    handler_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Types: workflow, webhook, notification, code
    handler_config: Mapped[dict] = mapped_column(JSONBType, default=dict)
    # e.g., {"workflow_id": "..."}, {"webhook_url": "..."}, {"template": "..."}

    # Filter (only fire if event data matches filter)
    filter: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Retry config
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    retry_delay_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<EventSubscription {self.event_type}>"


class EventLog(UUIDMixin, TimestampMixin, Base):
    """A log of every event published on the event bus.

    Append-only. Used for replay, audit, and debugging.
    """

    __tablename__ = "event_logs"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Event identity
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    event_version: Mapped[str] = mapped_column(String(20), default="1.0", nullable=False)

    # Event data (JSON payload)
    data: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Source
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    # Sources: api, workflow, ai_agent, connector, scheduler, system

    # Delivery status
    subscribers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    delivered_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Metadata
    correlation_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    def __repr__(self) -> str:
        return f"<EventLog {self.event_type}>"


class DeadLetterQueue(UUIDMixin, TimestampMixin, Base):
    """Events that failed delivery after max retries.

    Stored for manual inspection and replay.
    """

    __tablename__ = "dead_letter_queue"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    event_log_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    subscription_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)

    # What failed
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    event_data: Mapped[dict] = mapped_column(JSONBType, default=dict)
    error_message: Mapped[str] = mapped_column(Text, nullable=False)

    # Retry attempts
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Status: failed, replayed, ignored
    status: Mapped[str] = mapped_column(String(20), default="failed", nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<DeadLetterQueue {self.event_type} {self.status}>"


# ====================================================================
# MODULE 3: Integration Platform (Connectors)
# ====================================================================


class Connector(UUIDMixin, TimestampMixin, Base):
    """An external system integration connector.

    Each connector type (Salesforce, HubSpot, etc.) has a handler class.
    Connector instances store credentials and configuration per tenant.
    """

    __tablename__ = "connectors"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Connector identity
    connector_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Types: salesforce, hubspot, zoho, dynamics, google_workspace, microsoft_365,
    #        slack, teams, razorpay, stripe, payu, whatsapp, email, sms, erp

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Configuration (JSON: API URLs, sync settings, field mappings, etc.)
    config: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Credentials (encrypted — stored as reference to Vault secret)
    credentials_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Auth type: oauth2, api_key, basic, bearer, custom
    auth_type: Mapped[str] = mapped_column(String(20), default="api_key", nullable=False)

    # Health check
    last_health_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_health_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # healthy, unhealthy
    last_health_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Sync settings
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sync_interval_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_status: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Rate limiting
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    rate_limit_remaining: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    def __repr__(self) -> str:
        return f"<Connector {self.connector_type} {self.name}>"


class ConnectorLog(UUIDMixin, TimestampMixin, Base):
    """Log of connector operations (API calls, syncs, webhooks)."""

    __tablename__ = "connector_logs"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    connector_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Operation
    operation: Mapped[str] = mapped_column(String(50), nullable=False)
    # Operations: api_call, sync, webhook_received, webhook_sent, auth_refresh, health_check

    # Details
    method: Mapped[str | None] = mapped_column(String(10), nullable=True)  # GET, POST, etc.
    endpoint: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Request/Response
    request_data: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_data: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(String(20), default="success", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timing
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<ConnectorLog {self.operation} {self.status}>"


class WebhookEndpoint(UUIDMixin, TimestampMixin, Base):
    """A registered webhook endpoint (inbound from external systems)."""

    __tablename__ = "webhook_endpoints"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Webhook identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # e.g., "/webhooks/salesforce", "/webhooks/whatsapp"

    # Source system
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    # Sources: salesforce, hubspot, whatsapp, razorpay, stripe, custom

    # What to do when webhook fires
    handler_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Types: workflow, event, notification, code
    handler_config: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # Security
    secret: Mapped[str | None] = mapped_column(String(255), nullable=True)  # HMAC signing secret
    verify_signature: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Stats
    total_received: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<WebhookEndpoint {self.path}>"


# ====================================================================
# MODULE 5: Business Rules Engine
# ====================================================================


class RuleSet(UUIDMixin, TimestampMixin, Base):
    """A named collection of business rules.

    Rule sets can be shared across workflows and evaluated independently.
    """

    __tablename__ = "rule_sets"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Rules (JSON array of rule objects)
    # Each rule: {id, name, condition: {field, operator, value}, action: {type, config}}
    rules: Mapped[list] = mapped_column(JSONBType, default=list)

    # Evaluation mode: all (AND — all rules must pass), any (OR — any rule can pass)
    evaluation_mode: Mapped[str] = mapped_column(String(10), default="all", nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    def __repr__(self) -> str:
        return f"<RuleSet {self.name}>"


# ====================================================================
# MODULE 6: Scheduler
# ====================================================================


class ScheduledJob(UUIDMixin, TimestampMixin, Base):
    """A scheduled job (cron, recurring, one-time, delayed)."""

    __tablename__ = "scheduled_jobs"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Job identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Schedule type: cron, interval, one_time, delayed
    schedule_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Schedule config
    # cron: {"expression": "0 9 * * *"}
    # interval: {"minutes": 60}
    # one_time: {"run_at": "2026-07-20T09:00:00Z"}
    # delayed: {"delay_seconds": 300}
    schedule_config: Mapped[dict] = mapped_column(JSONBType, default=dict)

    # What to do
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Types: workflow, notification, sync, cleanup, report
    job_config: Mapped[dict] = mapped_column(JSONBType, default=dict)
    # e.g., {"workflow_id": "..."}, {"template": "payment_reminder", "to": "..."}

    # Execution
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False, index=True
    )  # active, paused, completed, failed
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Stats
    total_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Retry
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    def __repr__(self) -> str:
        return f"<ScheduledJob {self.name} {self.schedule_type}>"


class JobExecution(UUIDMixin, TimestampMixin, Base):
    """A single execution of a scheduled job."""

    __tablename__ = "job_executions"

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    scheduled_job_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Execution
    status: Mapped[str] = mapped_column(
        String(20), default="running", nullable=False
    )  # running, completed, failed, timeout

    # Result
    result: Mapped[dict | None] = mapped_column(JSONBType, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Retry
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<JobExecution job={self.scheduled_job_id} {self.status}>"

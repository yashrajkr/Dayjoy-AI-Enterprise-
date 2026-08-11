"""Enterprise SaaS Platform models — Stage 2 Step 10.

Tables:
- subscription_plans: configurable plans (Free, Starter, Pro, Business, Enterprise)
- subscriptions: org's active subscription (plan, status, billing cycle)
- invoices: billing records (line items, totals, payment status)
- usage_records: daily usage metering per org (AI, voice, WhatsApp, storage)
- usage_alerts: usage threshold alerts (80%, 90%, 100%)
- onboarding_steps: guided onboarding progress per org
- support_tickets: customer support tickets
- feature_requests: customer feature requests + voting
- system_status: platform status page entries
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


# ====================================================================
# Subscription Plans
# ====================================================================


class SubscriptionPlan(UUIDMixin, TimestampMixin, Base):
    """A subscription plan (Free, Starter, Professional, Business, Enterprise).

    Plans define usage limits that are enforced at the application layer.
    When an org exceeds a limit, the action is blocked (or throttled).
    """

    __tablename__ = "subscription_plans"
    __table_args__ = (
        Index("ix_sub_plans_tier", "tier"),
    )

    # Identity
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tier (ordering: 0=free, 1=starter, 2=pro, 3=business, 4=enterprise)
    tier: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Pricing (in cents — integer to avoid floating-point money issues)
    price_monthly_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_yearly_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)

    # Trial
    trial_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
    trial_plan_tier: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Which tier to give during trial (default: same as this plan)

    # Usage limits (-1 = unlimited)
    limit_ai_requests_per_month: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    limit_voice_minutes_per_month: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    limit_whatsapp_messages_per_month: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    limit_knowledge_storage_mb: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    limit_users: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    limit_phone_numbers: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    limit_api_calls_per_day: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    limit_rag_documents: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    limit_notification_emails_per_month: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    limit_notification_sms_per_month: Mapped[int] = mapped_column(Integer, default=50, nullable=False)

    # Features (boolean flags)
    features: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)
    # {"voice_ai": true, "whatsapp": true, "custom_branding": false, "api_access": true, ...}

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Public plans are shown on the pricing page; private plans are custom

    # Sort order
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<SubscriptionPlan {self.name!r} tier={self.tier}>"


# ====================================================================
# Subscriptions (org's active plan)
# ====================================================================


class Subscription(UUIDMixin, TimestampMixin, Base):
    """An organization's subscription to a plan.

    One subscription per org (enforced by unique organization_id).
    Tracks billing cycle, status, trial, and renewal.
    """

    __tablename__ = "subscriptions"
    __table_args__ = (
        Index("ix_subscriptions_org", "organization_id", unique=True),
        Index("ix_subscriptions_status", "status"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    plan_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("subscription_plans.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Status: trial, active, past_due, canceled, suspended, expired
    status: Mapped[str] = mapped_column(
        String(20), default="trial", nullable=False
    )

    # Billing cycle
    billing_cycle: Mapped[str] = mapped_column(
        String(10), default="monthly", nullable=False
    )  # monthly, yearly

    # Dates
    trial_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Payment gateway (architecture-ready — not implemented)
    payment_gateway: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # stripe, razorpay, none
    gateway_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gateway_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gateway_payment_method_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Coupon
    coupon_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    coupon_discount_percent: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Auto-renew
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Seat count (for per-seat pricing)
    seats: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<Subscription org={self.organization_id} status={self.status}>"


# ====================================================================
# Invoices
# ====================================================================


class Invoice(UUIDMixin, TimestampMixin, Base):
    """A billing invoice for a subscription period.

    Invoices are generated at the start of each billing cycle.
    Line items detail the charges (plan + overages + add-ons).
    """

    __tablename__ = "invoices"
    __table_args__ = (
        Index("ix_invoices_org", "organization_id"),
        Index("ix_invoices_status", "status"),
        Index("ix_invoices_org_created", "organization_id", "created_at"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    subscription_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("subscriptions.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Invoice identity
    invoice_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    # e.g. "INV-2024-001"

    # Period
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Amounts (in cents)
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tax_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)

    # Status: draft, open, paid, void, uncollectible
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )

    # Payment
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_gateway: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gateway_invoice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Line items
    # Format: [{"description": "Professional Plan - Monthly", "quantity": 1, "amount_cents": 9900, "type": "plan"},
    #          {"description": "AI overage - 500 extra requests", "quantity": 500, "amount_cents": 500, "type": "overage"}]
    line_items: Mapped[list] = mapped_column(JSONBType, default=list)

    # Billing address
    billing_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_address: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)

    # Tax
    tax_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # PDF URL (generated invoice PDF)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Invoice {self.invoice_number} status={self.status} total={self.total_cents}c>"


# ====================================================================
# Usage Records (daily metering per org)
# ====================================================================


class UsageRecord(UUIDMixin, TimestampMixin, Base):
    """Daily usage metering for an organization.

    One row per (organization_id, date). Tracks all metered resources
    for billing, limits enforcement, and analytics.
    """

    __tablename__ = "usage_records"
    __table_args__ = (
        Index("ix_usage_org_date", "organization_id", "date", unique=True),
        Index("ix_usage_org_month", "organization_id", "period_month"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)

    # Date (truncated to midnight)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Period (for monthly aggregation queries)
    period_month: Mapped[str] = mapped_column(String(7), nullable=False)
    # Format: "2024-01" (YYYY-MM)

    # AI usage
    ai_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_tokens_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_tokens_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Voice usage
    voice_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    voice_calls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    voice_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # WhatsApp usage
    whatsapp_messages_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    whatsapp_messages_received: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    whatsapp_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Telephony usage
    telephony_calls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    telephony_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    telephony_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Notifications
    notification_emails: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notification_sms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notification_push: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notification_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Storage
    knowledge_storage_mb: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    media_storage_mb: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # API
    api_calls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Users
    active_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Total cost (sum of all cost fields)
    total_cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<UsageRecord org={self.organization_id} date={self.date}>"


# ====================================================================
# Onboarding Steps (guided onboarding progress)
# ====================================================================


class OnboardingStep(UUIDMixin, TimestampMixin, Base):
    """An onboarding step for an organization.

    Tracks progress through the guided onboarding wizard.
    """

    __tablename__ = "onboarding_steps"
    __table_args__ = (
        Index("ix_onboarding_org_step", "organization_id", "step_key", unique=True),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)

    # Step identity
    step_key: Mapped[str] = mapped_column(String(50), nullable=False)
    # create_workspace, verify_email, choose_plan, upload_logo, upload_knowledge,
    # configure_ai, configure_voice, configure_whatsapp, invite_team, launch

    # Display
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    step_title: Mapped[str] = mapped_column(String(255), nullable=False)
    step_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status: pending, in_progress, completed, skipped
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False
    )

    # Completion
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Data captured during this step
    step_data: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict)

    # Required (must complete before launch)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<OnboardingStep org={self.organization_id} step={self.step_key} status={self.status}>"


# ====================================================================
# Support Tickets (customer success)
# ====================================================================


class SupportTicket(UUIDMixin, TimestampMixin, Base):
    """A customer support ticket.

    Tickets can be created by customers from the customer portal
    or by admins on behalf of customers.
    """

    __tablename__ = "support_tickets"
    __table_args__ = (
        Index("ix_support_tickets_org_status", "organization_id", "status"),
        Index("ix_support_tickets_priority", "priority"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)

    # Ticket identity
    ticket_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    # e.g. "TKT-2024-001"

    # Content
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Category: technical, billing, feature_request, bug, question, onboarding
    category: Mapped[str] = mapped_column(
        String(50), default="technical", nullable=False
    )

    # Priority: low, medium, high, urgent
    priority: Mapped[str] = mapped_column(
        String(20), default="medium", nullable=False
    )

    # Status: open, in_progress, waiting_customer, resolved, closed
    status: Mapped[str] = mapped_column(
        String(20), default="open", nullable=False
    )

    # Assignment
    assigned_to: Mapped[str | None] = mapped_column(String(36), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Resolution
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Satisfaction
    satisfaction_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    satisfaction_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tags
    tags: Mapped[list] = mapped_column(JSONBType, default=list)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<SupportTicket {self.ticket_number} status={self.status}>"


# ====================================================================
# Feature Requests (customer success)
# ====================================================================


class FeatureRequest(UUIDMixin, TimestampMixin, Base):
    """A feature request submitted by a customer.

    Customers can submit + upvote feature requests. Admins can
    update the status (under review, planned, in progress, shipped, declined).
    """

    __tablename__ = "feature_requests"
    __table_args__ = (
        Index("ix_feature_requests_org_status", "organization_id", "status"),
        Index("ix_feature_requests_votes", "votes"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    requested_by: Mapped[str] = mapped_column(String(36), nullable=False)

    # Content
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Category: ai, voice, telephony, whatsapp, notification, billing, ui, api, other
    category: Mapped[str] = mapped_column(String(50), default="other", nullable=False)

    # Status: submitted, under_review, planned, in_progress, shipped, declined
    status: Mapped[str] = mapped_column(
        String(20), default="submitted", nullable=False
    )

    # Voting
    votes: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    voted_by: Mapped[list] = mapped_column(JSONBType, default=list)
    # List of user IDs who voted

    # Priority (set by admin)
    priority: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Admin response
    admin_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_release: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Metadata
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONBType, default=dict, nullable=False
    )

    def __repr__(self) -> str:
        return f"<FeatureRequest {self.title!r} votes={self.votes} status={self.status}>"


# ====================================================================
# System Status (platform status page)
# ====================================================================


class SystemStatus(UUIDMixin, TimestampMixin, Base):
    """A system status entry for the platform status page.

    Tracks incidents, maintenance windows, and overall platform health
    visible to customers on the status page.
    """

    __tablename__ = "system_status"
    __table_args__ = (
        Index("ix_sys_status_type", "type"),
        Index("ix_sys_status_created", "created_at"),
    )

    # Type: incident, maintenance, degradation, outage, info
    type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Content
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Affected services (JSON array)
    affected_services: Mapped[list] = mapped_column(JSONBType, default=list)
    # ["api", "voice", "whatsapp", "telephony", "notifications", "rag"]

    # Severity: minor, major, critical, maintenance
    severity: Mapped[str] = mapped_column(String(20), default="minor", nullable=False)

    # Status: investigating, identified, monitoring, resolved, scheduled
    status: Mapped[str] = mapped_column(
        String(20), default="investigating", nullable=False
    )

    # Timeline
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Updates (timeline of status updates)
    # Format: [{"timestamp": "...", "status": "...", "message": "..."}]
    updates: Mapped[list] = mapped_column(JSONBType, default=list)

    # Is this visible on the public status page?
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<SystemStatus {self.type} {self.title!r} status={self.status}>"

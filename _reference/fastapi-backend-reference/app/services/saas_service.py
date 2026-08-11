"""SaaS Platform Service — commercial operations (Stage 2 Step 10).

Provides:
- Company registration (create org + user + workspace + trial subscription)
- Subscription management (plans, upgrade, downgrade, cancel)
- Billing (invoices, payment status — gateway-ready architecture)
- Usage metering (record + check limits + monthly aggregation)
- Onboarding (guided wizard steps + progress tracking)
- Admin dashboard (all orgs, revenue, MRR, churn, usage)
- Customer success (support tickets, feature requests, system status)
"""

import uuid
from datetime import datetime, UTC, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.security import hash_password
from app.models.organization import Organization, UserOrganization
from app.models.role import Role
from app.models.saas import (
    FeatureRequest,
    Invoice,
    OnboardingStep,
    Subscription,
    SubscriptionPlan,
    SupportTicket,
    SystemStatus,
    UsageRecord,
)
from app.models.user import User

logger = get_logger(__name__)


class SaaSService:
    """Commercial SaaS platform service (multi-tenant)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ====================================================================
    # Company Registration
    # ====================================================================

    async def register_company(
        self,
        *,
        company_name: str,
        slug: str,
        admin_email: str,
        admin_password: str,
        admin_full_name: str,
        plan_name: str = "professional",
        description: str | None = None,
    ) -> dict[str, Any]:
        """Register a new company + admin user + workspace + trial subscription.

        This is the entry point for the SaaS sign-up flow.
        """
        # 1. Check slug uniqueness
        existing = await self.db.execute(
            select(Organization).where(Organization.slug == slug)
        )
        if existing.scalar_one_or_none() is not None:
            raise ValidationError(f"Slug '{slug}' is already taken")

        # 2. Check email uniqueness
        existing_email = await self.db.execute(
            select(User).where(User.email == admin_email)
        )
        if existing_email.scalar_one_or_none() is not None:
            raise ValidationError(f"Email '{admin_email}' is already registered")

        # 3. Get plan
        plan = await self._get_plan_by_name(plan_name)

        # 4. Create organization
        org = Organization(
            name=company_name,
            slug=slug,
            description=description,
            is_active=True,
            plan=plan_name,
            trial_ends_at=datetime.now(UTC) + timedelta(days=plan.trial_days),
            settings={},
        )
        self.db.add(org)
        await self.db.flush()

        # 5. Create admin user
        admin = User(
            email=admin_email,
            full_name=admin_full_name,
            hashed_password=hash_password(admin_password),
            is_active=True,
            is_email_verified=False,
            is_superuser=False,
        )
        self.db.add(admin)
        await self.db.flush()

        # 6. Link user to org as org_owner
        membership = UserOrganization(
            user_id=str(admin.id),
            organization_id=str(org.id),
            role="org_owner",
            is_active=True,
            joined_at=datetime.now(UTC),
        )
        self.db.add(membership)

        # 7. Create trial subscription
        now = datetime.now(UTC)
        subscription = Subscription(
            organization_id=str(org.id),
            plan_id=str(plan.id),
            status="trial",
            billing_cycle="monthly",
            trial_started_at=now,
            trial_ends_at=now + timedelta(days=plan.trial_days),
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            auto_renew=True,
            seats=1,
        )
        self.db.add(subscription)

        # 8. Create onboarding steps
        await self._create_onboarding_steps(org.id, admin.id)

        await self.db.flush()

        logger.info(
            "company_registered",
            org_id=str(org.id),
            org_name=company_name,
            admin_email=admin_email,
            plan=plan_name,
        )

        return {
            "organization_id": str(org.id),
            "user_id": str(admin.id),
            "subscription_id": str(subscription.id),
            "plan": plan_name,
            "trial_ends_at": subscription.trial_ends_at.isoformat() if subscription.trial_ends_at else None,
        }

    # ====================================================================
    # Subscription Plans
    # ====================================================================

    async def list_plans(self, *, public_only: bool = True) -> list[SubscriptionPlan]:
        conditions = [SubscriptionPlan.is_active == True]  # noqa: E712
        if public_only:
            conditions.append(SubscriptionPlan.is_public == True)  # noqa: E712
        result = await self.db.execute(
            select(SubscriptionPlan)
            .where(*conditions)
            .order_by(SubscriptionPlan.sort_order.asc())
        )
        return list(result.scalars().all())

    async def get_plan(self, plan_id: uuid.UUID) -> SubscriptionPlan:
        result = await self.db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if plan is None:
            raise NotFoundError(f"Plan {plan_id} not found")
        return plan

    async def _get_plan_by_name(self, name: str) -> SubscriptionPlan:
        result = await self.db.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.name == name,
                SubscriptionPlan.is_active == True,  # noqa: E712
            )
        )
        plan = result.scalar_one_or_none()
        if plan is None:
            raise NotFoundError(f"Plan '{name}' not found")
        return plan

    # ====================================================================
    # Subscriptions
    # ====================================================================

    async def get_subscription(self, *, organization_id: uuid.UUID) -> Subscription:
        result = await self.db.execute(
            select(Subscription).where(
                Subscription.organization_id == str(organization_id)
            )
        )
        sub = result.scalar_one_or_none()
        if sub is None:
            raise NotFoundError(f"No subscription for organization {organization_id}")
        return sub

    async def upgrade_subscription(
        self,
        *,
        organization_id: uuid.UUID,
        new_plan_id: uuid.UUID,
        billing_cycle: str = "monthly",
    ) -> Subscription:
        """Upgrade/downgrade subscription to a new plan."""
        sub = await self.get_subscription(organization_id=organization_id)
        new_plan = await self.get_plan(new_plan_id)

        old_plan_id = sub.plan_id
        sub.plan_id = str(new_plan_id)
        sub.billing_cycle = billing_cycle

        # If upgrading from trial to paid, activate
        if sub.status == "trial" and new_plan.price_monthly_cents > 0:
            sub.status = "active"
            now = datetime.now(UTC)
            sub.current_period_start = now
            sub.current_period_end = now + (
                timedelta(days=365) if billing_cycle == "yearly" else timedelta(days=30)
            )

        await self.db.flush()

        # Create invoice for the new plan
        if new_plan.price_monthly_cents > 0 and sub.status == "active":
            await self._create_invoice(
                organization_id=organization_id,
                subscription_id=sub.id if hasattr(sub.id, 'hex') else uuid.UUID(str(sub.id)),
                plan=new_plan,
                billing_cycle=billing_cycle,
            )

        logger.info(
            "subscription_upgraded",
            org_id=str(organization_id),
            old_plan=old_plan_id,
            new_plan=new_plan_id,
        )
        return sub

    async def cancel_subscription(
        self,
        *,
        organization_id: uuid.UUID,
        reason: str | None = None,
    ) -> Subscription:
        """Cancel subscription (takes effect at period end)."""
        sub = await self.get_subscription(organization_id=organization_id)
        sub.status = "canceled"
        sub.canceled_at = datetime.now(UTC)
        sub.auto_renew = False
        sub.metadata_ = {**(sub.metadata_ or {}), "cancellation_reason": reason}
        await self.db.flush()
        logger.info("subscription_canceled", org_id=str(organization_id), reason=reason)
        return sub

    # ====================================================================
    # Billing
    # ====================================================================

    async def list_invoices(
        self,
        *,
        organization_id: uuid.UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Invoice], int]:
        conditions = [Invoice.organization_id == str(organization_id)]
        count_stmt = select(func.count()).select_from(Invoice).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()
        result = await self.db.execute(
            select(Invoice)
            .where(*conditions)
            .order_by(Invoice.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total

    async def get_invoice(self, *, organization_id: uuid.UUID, invoice_id: uuid.UUID) -> Invoice:
        result = await self.db.execute(
            select(Invoice).where(
                Invoice.id == invoice_id,
                Invoice.organization_id == str(organization_id),
            )
        )
        invoice = result.scalar_one_or_none()
        if invoice is None:
            raise NotFoundError(f"Invoice {invoice_id} not found")
        return invoice

    async def _create_invoice(
        self,
        *,
        organization_id: uuid.UUID,
        subscription_id: uuid.UUID,
        plan: SubscriptionPlan,
        billing_cycle: str,
    ) -> Invoice:
        """Create an invoice for a billing period."""
        now = datetime.now(UTC)
        period_end = now + (timedelta(days=365) if billing_cycle == "yearly" else timedelta(days=30))

        amount = plan.price_yearly_cents if billing_cycle == "yearly" else plan.price_monthly_cents
        invoice_num = f"INV-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

        line_items = [{
            "description": f"{plan.display_name} Plan - {billing_cycle}",
            "quantity": 1,
            "amount_cents": amount,
            "type": "plan",
        }]

        invoice = Invoice(
            organization_id=str(organization_id),
            subscription_id=str(subscription_id),
            invoice_number=invoice_num,
            period_start=now,
            period_end=period_end,
            due_date=now + timedelta(days=30),
            subtotal_cents=amount,
            discount_cents=0,
            tax_cents=0,
            total_cents=amount,
            currency=plan.currency,
            status="open",
            line_items=line_items,
        )
        self.db.add(invoice)
        await self.db.flush()
        return invoice

    # ====================================================================
    # Usage Metering
    # ====================================================================

    async def record_usage(
        self,
        *,
        organization_id: uuid.UUID,
        metric: str,
        value: int = 1,
        cost_cents: int = 0,
    ) -> UsageRecord:
        """Record usage for an organization (increments today's record)."""
        now = datetime.now(UTC)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_month = today.strftime("%Y-%m")
        org_id_str = str(organization_id)

        # Get or create today's record
        result = await self.db.execute(
            select(UsageRecord).where(
                UsageRecord.organization_id == org_id_str,
                UsageRecord.date == today,
            )
        )
        record = result.scalar_one_or_none()

        if record is None:
            record = UsageRecord(
                organization_id=org_id_str,
                date=today,
                period_month=period_month,
            )
            self.db.add(record)
            await self.db.flush()

        # Increment the metric
        if hasattr(record, metric):
            current = getattr(record, metric) or 0
            setattr(record, metric, current + value)
        else:
            raise ValidationError(f"Unknown usage metric: {metric}")

        # Update cost if applicable
        if cost_cents > 0 and metric.endswith("_cost_cents"):
            record.total_cost_cents = (record.total_cost_cents or 0) + cost_cents
        elif cost_cents > 0:
            # Add to the appropriate cost field
            cost_field = f"{metric.split('_')[0]}_cost_cents"
            if hasattr(record, cost_field):
                current_cost = getattr(record, cost_field) or 0
                setattr(record, cost_field, current_cost + cost_cents)
                record.total_cost_cents = (record.total_cost_cents or 0) + cost_cents

        await self.db.flush()
        return record

    async def get_usage_summary(
        self,
        *,
        organization_id: uuid.UUID,
        month: str | None = None,
    ) -> dict[str, Any]:
        """Get monthly usage summary for an organization."""
        if month is None:
            month = datetime.now(UTC).strftime("%Y-%m")

        result = await self.db.execute(
            select(
                func.sum(UsageRecord.ai_requests).label("ai_requests"),
                func.sum(UsageRecord.ai_tokens_in).label("ai_tokens_in"),
                func.sum(UsageRecord.ai_tokens_out).label("ai_tokens_out"),
                func.sum(UsageRecord.ai_cost_cents).label("ai_cost_cents"),
                func.sum(UsageRecord.voice_minutes).label("voice_minutes"),
                func.sum(UsageRecord.voice_calls).label("voice_calls"),
                func.sum(UsageRecord.voice_cost_cents).label("voice_cost_cents"),
                func.sum(UsageRecord.whatsapp_messages_sent).label("whatsapp_sent"),
                func.sum(UsageRecord.whatsapp_messages_received).label("whatsapp_received"),
                func.sum(UsageRecord.whatsapp_cost_cents).label("whatsapp_cost_cents"),
                func.sum(UsageRecord.telephony_calls).label("telephony_calls"),
                func.sum(UsageRecord.telephony_minutes).label("telephony_minutes"),
                func.sum(UsageRecord.notification_emails).label("notification_emails"),
                func.sum(UsageRecord.notification_sms).label("notification_sms"),
                func.sum(UsageRecord.api_calls).label("api_calls"),
                func.sum(UsageRecord.total_cost_cents).label("total_cost_cents"),
                func.max(UsageRecord.active_users).label("active_users"),
                func.max(UsageRecord.knowledge_storage_mb).label("knowledge_storage_mb"),
            ).where(
                UsageRecord.organization_id == str(organization_id),
                UsageRecord.period_month == month,
            )
        )
        row = result.one()

        # Get plan limits
        try:
            sub = await self.get_subscription(organization_id=organization_id)
            plan = await self.get_plan(uuid.UUID(sub.plan_id))
            limits = {
                "ai_requests": plan.limit_ai_requests_per_month,
                "voice_minutes": plan.limit_voice_minutes_per_month,
                "whatsapp_messages": plan.limit_whatsapp_messages_per_month,
                "knowledge_storage_mb": plan.limit_knowledge_storage_mb,
                "users": plan.limit_users,
                "notification_emails": plan.limit_notification_emails_per_month,
                "notification_sms": plan.limit_notification_sms_per_month,
            }
        except NotFoundError:
            limits = {}

        usage = {
            "month": month,
            "ai_requests": row.ai_requests or 0,
            "ai_tokens_in": row.ai_tokens_in or 0,
            "ai_tokens_out": row.ai_tokens_out or 0,
            "ai_cost_cents": row.ai_cost_cents or 0,
            "voice_minutes": row.voice_minutes or 0,
            "voice_calls": row.voice_calls or 0,
            "voice_cost_cents": row.voice_cost_cents or 0,
            "whatsapp_messages_sent": row.whatsapp_sent or 0,
            "whatsapp_messages_received": row.whatsapp_received or 0,
            "whatsapp_cost_cents": row.whatsapp_cost_cents or 0,
            "telephony_calls": row.telephony_calls or 0,
            "telephony_minutes": row.telephony_minutes or 0,
            "notification_emails": row.notification_emails or 0,
            "notification_sms": row.notification_sms or 0,
            "api_calls": row.api_calls or 0,
            "total_cost_cents": row.total_cost_cents or 0,
            "active_users": row.active_users or 0,
            "knowledge_storage_mb": float(row.knowledge_storage_mb or 0),
            "limits": limits,
        }

        # Calculate usage percentages
        usage["usage_percent"] = {}
        for key, limit in limits.items():
            if limit > 0 and key in usage:
                usage["usage_percent"][key] = min(100, (usage[key] / limit) * 100)

        return usage

    async def check_usage_limit(
        self,
        *,
        organization_id: uuid.UUID,
        metric: str,
    ) -> bool:
        """Check if an org has exceeded their plan limit for a metric.

        Returns True if the action is ALLOWED (within limit), False if blocked.
        """
        try:
            sub = await self.get_subscription(organization_id=organization_id)
            plan = await self.get_plan(uuid.UUID(sub.plan_id))
        except NotFoundError:
            return True  # No subscription = unlimited (dev mode)

        # Map metric to plan limit
        limit_map = {
            "ai_requests": plan.limit_ai_requests_per_month,
            "voice_minutes": plan.limit_voice_minutes_per_month,
            "whatsapp_messages_sent": plan.limit_whatsapp_messages_per_month,
            "notification_emails": plan.limit_notification_emails_per_month,
            "notification_sms": plan.limit_notification_sms_per_month,
        }

        limit = limit_map.get(metric)
        if limit is None or limit == -1:
            return True  # Unlimited

        usage = await self.get_usage_summary(organization_id=organization_id)
        current = usage.get(metric, 0)

        return current < limit

    # ====================================================================
    # Onboarding
    # ====================================================================

    async def _create_onboarding_steps(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        """Create default onboarding steps for a new org."""
        steps = [
            ("create_workspace", 1, "Create Workspace", "Your workspace is ready!", True),
            ("verify_email", 2, "Verify Email", "Confirm your email address", True),
            ("choose_plan", 3, "Choose Plan", "Select the plan that fits your needs", True),
            ("upload_logo", 4, "Upload Logo", "Customize your workspace with your brand", False),
            ("upload_knowledge", 5, "Upload Knowledge", "Add documents to your knowledge base", True),
            ("configure_ai", 6, "Configure AI", "Set up your AI assistant", True),
            ("configure_voice", 7, "Configure Voice", "Set up voice AI (optional)", False),
            ("configure_whatsapp", 8, "Configure WhatsApp", "Set up WhatsApp (optional)", False),
            ("invite_team", 9, "Invite Team", "Invite your team members", False),
            ("launch", 10, "Launch", "You're ready to go live!", True),
        ]
        for key, order, title, desc, required in steps:
            step = OnboardingStep(
                organization_id=str(org_id),
                step_key=key,
                step_order=order,
                step_title=title,
                step_description=desc,
                status="completed" if key == "create_workspace" else "pending",
                completed_at=datetime.now(UTC) if key == "create_workspace" else None,
                completed_by=str(user_id) if key == "create_workspace" else None,
                is_required=required,
            )
            self.db.add(step)
        await self.db.flush()

    async def get_onboarding_progress(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> list[OnboardingStep]:
        result = await self.db.execute(
            select(OnboardingStep)
            .where(OnboardingStep.organization_id == str(organization_id))
            .order_by(OnboardingStep.step_order)
        )
        return list(result.scalars().all())

    async def complete_onboarding_step(
        self,
        *,
        organization_id: uuid.UUID,
        step_key: str,
        completed_by: uuid.UUID,
        step_data: dict[str, Any] | None = None,
    ) -> OnboardingStep:
        result = await self.db.execute(
            select(OnboardingStep).where(
                OnboardingStep.organization_id == str(organization_id),
                OnboardingStep.step_key == step_key,
            )
        )
        step = result.scalar_one_or_none()
        if step is None:
            raise NotFoundError(f"Onboarding step '{step_key}' not found")
        step.status = "completed"
        step.completed_at = datetime.now(UTC)
        step.completed_by = str(completed_by)
        if step_data:
            step.step_data = {**(step.step_data or {}), **step_data}
        await self.db.flush()
        return step

    # ====================================================================
    # Support Tickets
    # ====================================================================

    async def create_ticket(
        self,
        *,
        organization_id: uuid.UUID,
        created_by: uuid.UUID,
        subject: str,
        description: str,
        category: str = "technical",
        priority: str = "medium",
    ) -> SupportTicket:
        now = datetime.now(UTC)
        ticket_num = f"TKT-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
        ticket = SupportTicket(
            organization_id=str(organization_id),
            created_by=str(created_by),
            ticket_number=ticket_num,
            subject=subject,
            description=description,
            category=category,
            priority=priority,
            status="open",
        )
        self.db.add(ticket)
        await self.db.flush()
        return ticket

    async def list_tickets(
        self,
        *,
        organization_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[SupportTicket], int]:
        conditions = []
        if organization_id is not None:
            conditions.append(SupportTicket.organization_id == str(organization_id))
        if status is not None:
            conditions.append(SupportTicket.status == status)
        count_stmt = select(func.count()).select_from(SupportTicket).where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar_one()
        result = await self.db.execute(
            select(SupportTicket)
            .where(*conditions)
            .order_by(SupportTicket.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total

    async def resolve_ticket(
        self,
        *,
        ticket_id: uuid.UUID,
        resolved_by: uuid.UUID,
        resolution_notes: str | None = None,
    ) -> SupportTicket:
        result = await self.db.execute(
            select(SupportTicket).where(SupportTicket.id == ticket_id)
        )
        ticket = result.scalar_one_or_none()
        if ticket is None:
            raise NotFoundError(f"Ticket {ticket_id} not found")
        ticket.status = "resolved"
        ticket.resolved_at = datetime.now(UTC)
        ticket.resolved_by = str(resolved_by)
        ticket.resolution_notes = resolution_notes
        await self.db.flush()
        return ticket

    # ====================================================================
    # Feature Requests
    # ====================================================================

    async def create_feature_request(
        self,
        *,
        organization_id: uuid.UUID,
        requested_by: uuid.UUID,
        title: str,
        description: str,
        category: str = "other",
    ) -> FeatureRequest:
        fr = FeatureRequest(
            organization_id=str(organization_id),
            requested_by=str(requested_by),
            title=title,
            description=description,
            category=category,
            status="submitted",
            votes=1,
            voted_by=[str(requested_by)],
        )
        self.db.add(fr)
        await self.db.flush()
        return fr

    async def list_feature_requests(
        self,
        *,
        status: str | None = None,
        limit: int = 50,
    ) -> list[FeatureRequest]:
        conditions = []
        if status:
            conditions.append(FeatureRequest.status == status)
        result = await self.db.execute(
            select(FeatureRequest)
            .where(*conditions)
            .order_by(FeatureRequest.votes.desc(), FeatureRequest.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def vote_feature_request(
        self,
        *,
        feature_request_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> FeatureRequest:
        result = await self.db.execute(
            select(FeatureRequest).where(FeatureRequest.id == feature_request_id)
        )
        fr = result.scalar_one_or_none()
        if fr is None:
            raise NotFoundError(f"Feature request {feature_request_id} not found")
        user_id_str = str(user_id)
        if user_id_str not in (fr.voted_by or []):
            fr.votes += 1
            fr.voted_by = list(fr.voted_by or []) + [user_id_str]
        await self.db.flush()
        return fr

    # ====================================================================
    # System Status
    # ====================================================================

    async def list_system_status(
        self,
        *,
        public_only: bool = True,
        limit: int = 20,
    ) -> list[SystemStatus]:
        conditions = []
        if public_only:
            conditions.append(SystemStatus.is_public == True)  # noqa: E712
        result = await self.db.execute(
            select(SystemStatus)
            .where(*conditions)
            .order_by(SystemStatus.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # ====================================================================
    # Admin Dashboard
    # ====================================================================

    async def get_admin_dashboard(self) -> dict[str, Any]:
        """Get admin dashboard metrics (platform-wide)."""
        # Total orgs
        total_orgs = (await self.db.execute(
            select(func.count()).select_from(Organization).where(Organization.is_active == True)  # noqa: E712
        )).scalar_one()

        # Active subscriptions
        active_subs = (await self.db.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status.in_(["trial", "active"])
            )
        )).scalar_one()

        # Trial subscriptions
        trial_subs = (await self.db.execute(
            select(func.count()).select_from(Subscription).where(Subscription.status == "trial")
        )).scalar_one()

        # Total revenue (paid invoices this month)
        now = datetime.now(UTC)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        revenue = (await self.db.execute(
            select(func.sum(Invoice.total_cents)).where(
                Invoice.status == "paid",
                Invoice.created_at >= month_start,
            )
        )).scalar_one() or 0

        # Total users
        total_users = (await self.db.execute(
            select(func.count()).select_from(User).where(User.is_active == True)  # noqa: E712
        )).scalar_one()

        # Open tickets
        open_tickets = (await self.db.execute(
            select(func.count()).select_from(SupportTicket).where(
                SupportTicket.status.in_(["open", "in_progress"])
            )
        )).scalar_one()

        # Plan distribution
        plan_dist_result = await self.db.execute(
            select(SubscriptionPlan.name, func.count(Subscription.id))
            .join(Subscription, Subscription.plan_id == SubscriptionPlan.id)
            .where(Subscription.status.in_(["trial", "active"]))
            .group_by(SubscriptionPlan.name)
        )
        plan_distribution = {name: count for name, count in plan_dist_result.all()}

        return {
            "total_organizations": total_orgs,
            "active_subscriptions": active_subs,
            "trial_subscriptions": trial_subs,
            "total_users": total_users,
            "open_tickets": open_tickets,
            "revenue_this_month_cents": revenue,
            "plan_distribution": plan_distribution,
            "timestamp": datetime.now(UTC).isoformat(),
        }

    async def list_organizations(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Organization], int]:
        total = (await self.db.execute(
            select(func.count()).select_from(Organization)
        )).scalar_one()
        result = await self.db.execute(
            select(Organization)
            .order_by(Organization.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total

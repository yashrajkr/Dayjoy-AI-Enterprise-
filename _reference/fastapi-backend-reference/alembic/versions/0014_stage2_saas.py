"""stage 2 step 10: commercial saas platform

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-16 00:14:00.000000

Tables: subscription_plans, subscriptions, invoices, usage_records,
onboarding_steps, support_tickets, feature_requests, system_status
"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Subscription Plans
    op.create_table("subscription_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tier", sa.Integer(), server_default="0", nullable=False),
        sa.Column("price_monthly_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("price_yearly_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("currency", sa.String(3), server_default="USD", nullable=False),
        sa.Column("trial_days", sa.Integer(), server_default="14", nullable=False),
        sa.Column("trial_plan_tier", sa.Integer(), nullable=True),
        sa.Column("limit_ai_requests_per_month", sa.Integer(), server_default="100", nullable=False),
        sa.Column("limit_voice_minutes_per_month", sa.Integer(), server_default="60", nullable=False),
        sa.Column("limit_whatsapp_messages_per_month", sa.Integer(), server_default="100", nullable=False),
        sa.Column("limit_knowledge_storage_mb", sa.Integer(), server_default="100", nullable=False),
        sa.Column("limit_users", sa.Integer(), server_default="5", nullable=False),
        sa.Column("limit_phone_numbers", sa.Integer(), server_default="1", nullable=False),
        sa.Column("limit_api_calls_per_day", sa.Integer(), server_default="1000", nullable=False),
        sa.Column("limit_rag_documents", sa.Integer(), server_default="50", nullable=False),
        sa.Column("limit_notification_emails_per_month", sa.Integer(), server_default="500", nullable=False),
        sa.Column("limit_notification_sms_per_month", sa.Integer(), server_default="50", nullable=False),
        sa.Column("features", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_public", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_sub_plans_tier", "subscription_plans", ["tier"])

    # Subscriptions
    op.create_table("subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(20), server_default="trial", nullable=False),
        sa.Column("billing_cycle", sa.String(10), server_default="monthly", nullable=False),
        sa.Column("trial_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_gateway", sa.String(50), nullable=True),
        sa.Column("gateway_customer_id", sa.String(255), nullable=True),
        sa.Column("gateway_subscription_id", sa.String(255), nullable=True),
        sa.Column("gateway_payment_method_id", sa.String(255), nullable=True),
        sa.Column("coupon_code", sa.String(100), nullable=True),
        sa.Column("coupon_discount_percent", sa.Float(), nullable=True),
        sa.Column("auto_renew", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("seats", sa.Integer(), server_default="1", nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_subscriptions_org", "subscriptions", ["organization_id"], unique=True)
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"])

    # Invoices
    op.create_table("invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("invoice_number", sa.String(50), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("subtotal_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("discount_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("tax_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("currency", sa.String(3), server_default="USD", nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_gateway", sa.String(50), nullable=True),
        sa.Column("gateway_invoice_id", sa.String(255), nullable=True),
        sa.Column("gateway_payment_id", sa.String(255), nullable=True),
        sa.Column("line_items", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("billing_name", sa.String(255), nullable=True),
        sa.Column("billing_email", sa.String(255), nullable=True),
        sa.Column("billing_address", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("tax_rate", sa.Float(), nullable=True),
        sa.Column("tax_id", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("pdf_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_invoices_org", "invoices", ["organization_id"])
    op.create_index("ix_invoices_status", "invoices", ["status"])
    op.create_index("ix_invoices_org_created", "invoices", ["organization_id", "created_at"])

    # Usage Records
    op.create_table("usage_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_month", sa.String(7), nullable=False),
        sa.Column("ai_requests", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_tokens_in", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_tokens_out", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("voice_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("voice_calls", sa.Integer(), server_default="0", nullable=False),
        sa.Column("voice_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("whatsapp_messages_sent", sa.Integer(), server_default="0", nullable=False),
        sa.Column("whatsapp_messages_received", sa.Integer(), server_default="0", nullable=False),
        sa.Column("whatsapp_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("telephony_calls", sa.Integer(), server_default="0", nullable=False),
        sa.Column("telephony_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("telephony_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("notification_emails", sa.Integer(), server_default="0", nullable=False),
        sa.Column("notification_sms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("notification_push", sa.Integer(), server_default="0", nullable=False),
        sa.Column("notification_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("knowledge_storage_mb", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("media_storage_mb", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("api_calls", sa.Integer(), server_default="0", nullable=False),
        sa.Column("active_users", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_usage_org_date", "usage_records", ["organization_id", "date"], unique=True)
    op.create_index("ix_usage_org_month", "usage_records", ["organization_id", "period_month"])

    # Onboarding Steps
    op.create_table("onboarding_steps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("step_key", sa.String(50), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("step_title", sa.String(255), nullable=False),
        sa.Column("step_description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("step_data", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("is_required", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_onboarding_org_step", "onboarding_steps", ["organization_id", "step_key"], unique=True)

    # Support Tickets
    op.create_table("support_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ticket_number", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(50), server_default="technical", nullable=False),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False),
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("satisfaction_score", sa.Integer(), nullable=True),
        sa.Column("satisfaction_comment", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_support_tickets_org_status", "support_tickets", ["organization_id", "status"])
    op.create_index("ix_support_tickets_priority", "support_tickets", ["priority"])

    # Feature Requests
    op.create_table("feature_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(50), server_default="other", nullable=False),
        sa.Column("status", sa.String(20), server_default="submitted", nullable=False),
        sa.Column("votes", sa.Integer(), server_default="1", nullable=False),
        sa.Column("voted_by", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("priority", sa.String(20), nullable=True),
        sa.Column("admin_response", sa.Text(), nullable=True),
        sa.Column("estimated_release", sa.String(100), nullable=True),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_feature_requests_org_status", "feature_requests", ["organization_id", "status"])
    op.create_index("ix_feature_requests_votes", "feature_requests", ["votes"])

    # System Status
    op.create_table("system_status",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("affected_services", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("severity", sa.String(20), server_default="minor", nullable=False),
        sa.Column("status", sa.String(20), server_default="investigating", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updates", postgresql.JSON(astext_type=sa.Text()), server_default="[]"),
        sa.Column("is_public", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_sys_status_type", "system_status", ["type"])
    op.create_index("ix_sys_status_created", "system_status", ["created_at"])

    # Seed default plans
    op.execute("""
        INSERT INTO subscription_plans (id, name, display_name, description, tier, price_monthly_cents, price_yearly_cents, trial_days, limit_ai_requests_per_month, limit_voice_minutes_per_month, limit_whatsapp_messages_per_month, limit_knowledge_storage_mb, limit_users, limit_phone_numbers, limit_api_calls_per_day, limit_rag_documents, limit_notification_emails_per_month, limit_notification_sms_per_month, features, is_active, is_public, sort_order, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'free', 'Free', 'Get started with basic AI', 0, 0, 0, 0, 100, 0, 10, 50, 3, 0, 100, 10, 50, 5, '{"voice_ai": false, "whatsapp": false, "custom_branding": false, "api_access": true}'::json, true, true, 0, now(), now()),
            (gen_random_uuid(), 'starter', 'Starter', 'For small teams getting started', 1, 2900, 29000, 14, 1000, 60, 500, 500, 10, 1, 5000, 100, 2000, 100, '{"voice_ai": true, "whatsapp": false, "custom_branding": false, "api_access": true}'::json, true, true, 1, now(), now()),
            (gen_random_uuid(), 'professional', 'Professional', 'For growing businesses', 2, 9900, 99000, 14, 10000, 500, 5000, 5000, 50, 3, 50000, 1000, 10000, 500, '{"voice_ai": true, "whatsapp": true, "custom_branding": true, "api_access": true}'::json, true, true, 2, now(), now()),
            (gen_random_uuid(), 'business', 'Business', 'For established companies', 3, 29900, 299000, 14, 50000, 2000, 25000, 25000, 200, 10, 250000, 5000, 50000, 2000, '{"voice_ai": true, "whatsapp": true, "custom_branding": true, "api_access": true, "priority_support": true}'::json, true, true, 3, now(), now()),
            (gen_random_uuid(), 'enterprise', 'Enterprise', 'For large organizations', 4, -1, -1, 30, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, '{"voice_ai": true, "whatsapp": true, "custom_branding": true, "api_access": true, "priority_support": true, "dedicated_manager": true, "sso": true, "custom_contracts": true}'::json, true, false, 4, now(), now())
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.drop_index("ix_sys_status_created", table_name="system_status")
    op.drop_index("ix_sys_status_type", table_name="system_status")
    op.drop_table("system_status")

    op.drop_index("ix_feature_requests_votes", table_name="feature_requests")
    op.drop_index("ix_feature_requests_org_status", table_name="feature_requests")
    op.drop_table("feature_requests")

    op.drop_index("ix_support_tickets_priority", table_name="support_tickets")
    op.drop_index("ix_support_tickets_org_status", table_name="support_tickets")
    op.drop_table("support_tickets")

    op.drop_index("ix_onboarding_org_step", table_name="onboarding_steps")
    op.drop_table("onboarding_steps")

    op.drop_index("ix_usage_org_month", table_name="usage_records")
    op.drop_index("ix_usage_org_date", table_name="usage_records")
    op.drop_table("usage_records")

    op.drop_index("ix_invoices_org_created", table_name="invoices")
    op.drop_index("ix_invoices_status", table_name="invoices")
    op.drop_index("ix_invoices_org", table_name="invoices")
    op.drop_table("invoices")

    op.drop_index("ix_subscriptions_status", table_name="subscriptions")
    op.drop_index("ix_subscriptions_org", table_name="subscriptions")
    op.drop_table("subscriptions")

    op.drop_index("ix_sub_plans_tier", table_name="subscription_plans")
    op.drop_table("subscription_plans")

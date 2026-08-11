"""Phase 9: Enterprise SaaS Control Plane — API keys, usage, quotas, billing, secrets, deployments.

Revision ID: 0018
Revises: 0017
"""

from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ===== 1. api_keys =====
    op.create_table(
        "api_keys",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("key_prefix", sa.String(20), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("scopes", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("rate_limit_per_minute", sa.Integer, nullable=False, server_default=sa.text("60")),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_ip", sa.String(45), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_api_keys_org_user", "api_keys", ["organization_id", "user_id"])

    # ===== 2. api_usage =====
    op.create_table(
        "api_usage",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("api_key_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("endpoint", sa.String(200), nullable=False),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("status_code", sa.Integer, nullable=False),
        sa.Column("latency_ms", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("request_size_bytes", sa.Integer, nullable=True),
        sa.Column("response_size_bytes", sa.Integer, nullable=True),
        sa.Column("tokens_used", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("cost_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_api_usage_org_created", "api_usage", ["organization_id", "created_at"])
    op.create_index("ix_api_usage_org_endpoint", "api_usage", ["organization_id", "endpoint"])

    # ===== 3. usage_quotas =====
    op.create_table(
        "usage_quotas",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, unique=True, index=True),
        sa.Column("max_users", sa.Integer, nullable=False, server_default=sa.text("10")),
        sa.Column("max_agents", sa.Integer, nullable=False, server_default=sa.text("5")),
        sa.Column("max_workflows", sa.Integer, nullable=False, server_default=sa.text("10")),
        sa.Column("max_documents", sa.Integer, nullable=False, server_default=sa.text("100")),
        sa.Column("max_calls_per_month", sa.Integer, nullable=False, server_default=sa.text("1000")),
        sa.Column("max_tokens_per_month", sa.BigInteger, nullable=False, server_default=sa.text("1000000")),
        sa.Column("max_storage_mb", sa.Integer, nullableFalse := True, server_default=sa.text("1024")),
        sa.Column("max_projects", sa.Integer, nullable=False, server_default=sa.text("5")),
        sa.Column("max_api_keys", sa.Integer, nullable=False, server_default=sa.text("5")),
        sa.Column("max_voice_minutes_per_month", sa.Integer, nullable=False, server_default=sa.text("100")),
        sa.Column("max_kb_documents", sa.Integer, nullable=False, server_default=sa.text("500")),
        sa.Column("max_rag_searches_per_day", sa.Integer, nullable=False, server_default=sa.text("1000")),
        sa.Column("max_workflow_runs_per_month", sa.Integer, nullable=False, server_default=sa.text("500")),
        sa.Column("max_agent_executions_per_month", sa.Integer, nullable=False, server_default=sa.text("1000")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ===== 4. billing_events =====
    op.create_table(
        "billing_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("subscription_id", sa.String(36), nullable=True),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("currency", sa.String(3), nullable=False, server_default=sa.text("'USD'")),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("provider", sa.String(30), nullable=True),
        sa.Column("provider_event_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_billing_events_org_created", "billing_events", ["organization_id", "created_at"])

    # ===== 5. payments =====
    op.create_table(
        "payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("invoice_id", sa.String(36), nullable=True),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default=sa.text("'USD'")),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("provider_payment_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("failure_reason", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_payments_org_status", "payments", ["organization_id", "status"])

    # ===== 6. encrypted_secrets =====
    op.create_table(
        "encrypted_secrets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("secret_type", sa.String(50), nullable=False),
        sa.Column("encrypted_value", sa.Text, nullable=False),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_encrypted_secrets_org_name", "encrypted_secrets", ["organization_id", "name"], unique=True)

    # ===== 7. deployment_logs =====
    op.create_table(
        "deployment_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=True, index=True),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("environment", sa.String(20), nullable=False),
        sa.Column("deployment_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("changes", sa.Text, nullable=True),
        sa.Column("deployed_by", sa.String(36), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rollback_of", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_deploy_logs_env_status", "deployment_logs", ["environment", "status"])

    # ===== 8. tenant_settings =====
    op.create_table(
        "tenant_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", sa.String(36), nullable=False, unique=True, index=True),
        sa.Column("custom_domain", sa.String(255), nullable=True),
        sa.Column("logo_url", sa.Text, nullable=True),
        sa.Column("primary_color", sa.String(7), nullable=True),
        sa.Column("timezone", sa.String(50), nullable=False, server_default=sa.text("'UTC'")),
        sa.Column("locale", sa.String(10), nullable=False, server_default=sa.text("'en'")),
        sa.Column("default_ai_provider", sa.String(50), nullable=True),
        sa.Column("default_ai_model", sa.String(100), nullable=True),
        sa.Column("features", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("security_settings", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("notification_settings", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ===== 9. Seed enterprise plans =====
    op.execute("""
        INSERT INTO subscription_plans (id, name, description, price_monthly, price_yearly, currency, features, limits, trial_days, is_active, sort_order, created_at, updated_at)
        VALUES
        (gen_random_uuid(), 'Enterprise', 'Full enterprise platform with unlimited everything',
         99900, 999900, 'USD',
         '{"ai_agents": true, "workflows": true, "voice_ai": true, "whatsapp": true, "telephony": true, "rag": true, "multi_agent": true, "custom_domain": true, "sso": true, "audit_logs": true, "api_access": true, "white_label": true}',
         '{"max_users": -1, "max_agents": -1, "max_workflows": -1, "max_documents": -1, "max_tokens": 100000000, "max_storage_mb": 102400, "max_calls": -1, "max_voice_minutes": 10000}',
         30, true, 100, now(), now()),
        (gen_random_uuid(), 'Business', 'For growing teams that need advanced AI features',
         29900, 299900, 'USD',
         '{"ai_agents": true, "workflows": true, "voice_ai": true, "rag": true, "api_access": true}',
         '{"max_users": 50, "max_agents": 25, "max_workflows": 50, "max_documents": 5000, "max_tokens": 10000000, "max_storage_mb": 10240, "max_calls": 50000, "max_voice_minutes": 1000}',
         14, true, 50, now(), now())
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.drop_table("tenant_settings")
    op.drop_table("deployment_logs")
    op.drop_index("uq_encrypted_secrets_org_name", table_name="encrypted_secrets")
    op.drop_table("encrypted_secrets")
    op.drop_table("payments")
    op.drop_table("billing_events")
    op.drop_table("usage_quotas")
    op.drop_table("api_usage")
    op.drop_table("api_keys")

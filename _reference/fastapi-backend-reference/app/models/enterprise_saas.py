"""Enterprise SaaS Control Plane models — API keys, usage, quotas, billing, secrets, deployments."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, BigInteger, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import JSONBType
from app.models.base import Base, TimestampMixin, UUIDMixin


class ApiKey(UUIDMixin, Base):
    """A per-organization API key for programmatic access."""
    __tablename__ = "api_keys"
    __table_args__ = (Index("ix_api_keys_org_user", "organization_id", "user_id"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(20), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    scopes: Mapped[list] = mapped_column(JSONBType, default=list, nullable=False)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ApiUsage(UUIDMixin, Base):
    """Per-API-call usage log — tracks every request for billing + analytics."""
    __tablename__ = "api_usage"
    __table_args__ = (
        Index("ix_api_usage_org_created", "organization_id", "created_at"),
        Index("ix_api_usage_org_endpoint", "organization_id", "endpoint"),
    )

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    endpoint: Mapped[str] = mapped_column(String(200), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    request_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UsageQuota(UUIDMixin, Base):
    """Per-organization resource limits — enforced before every operation."""
    __tablename__ = "usage_quotas"
    __table_args__ = (Index("ix_usage_quotas_org", "organization_id", unique=True),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    max_users: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    max_agents: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_workflows: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    max_documents: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    max_calls_per_month: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    max_tokens_per_month: Mapped[int] = mapped_column(BigInteger, default=1000000, nullable=False)
    max_storage_mb: Mapped[int] = mapped_column(Integer, default=1024, nullable=False)
    max_projects: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_api_keys: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_voice_minutes_per_month: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    max_kb_documents: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    max_rag_searches_per_day: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    max_workflow_runs_per_month: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    max_agent_executions_per_month: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class BillingEvent(UUIDMixin, Base):
    """A billing event — charge, refund, credit, adjustment."""
    __tablename__ = "billing_events"
    __table_args__ = (Index("ix_billing_events_org_created", "organization_id", "created_at"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subscription_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    provider_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Payment(UUIDMixin, TimestampMixin, Base):
    """A payment record — tracks Stripe/Razorpay payments."""
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_org_status", "organization_id", "status"),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    invoice_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    provider_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EncryptedSecret(UUIDMixin, TimestampMixin, Base):
    """An encrypted secret — API keys, database credentials, etc."""
    __tablename__ = "encrypted_secrets"
    __table_args__ = (Index("uq_encrypted_secrets_org_name", "organization_id", "name", unique=True),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    secret_type: Mapped[str] = mapped_column(String(50), nullable=False)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONBType, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class DeploymentLog(UUIDMixin, Base):
    """A deployment log entry — tracks version deployments across environments."""
    __tablename__ = "deployment_logs"
    __table_args__ = (Index("ix_deploy_logs_env_status", "environment", "status"),)

    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False)
    deployment_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    changes: Mapped[str | None] = mapped_column(Text, nullable=True)
    deployed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rollback_of: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TenantSettings(UUIDMixin, Base):
    """Per-tenant configurable settings — branding, domain, locale, features."""
    __tablename__ = "tenant_settings"
    __table_args__ = (Index("ix_tenant_settings_org", "organization_id", unique=True),)

    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    custom_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)
    locale: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    default_ai_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    default_ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    features: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    security_settings: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    notification_settings: Mapped[dict] = mapped_column(JSONBType, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

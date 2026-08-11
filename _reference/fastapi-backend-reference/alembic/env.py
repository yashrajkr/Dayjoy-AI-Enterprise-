"""Alembic migration environment.

Reads database URL from app settings (not hardcoded).
Detects models from app.models to support autogenerate.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from app.core.config import settings
from app.core.database import Base

# Import ALL models here so Alembic can detect them for autogenerate
from app.models.autonomous_enterprise import (  # noqa: F401
    AgentMemory,
    ApprovalRule,
    BusinessGraphEdge,
    BusinessGraphNode,
    DecisionHistory,
    DigitalTwin,
    DigitalTwinSnapshot,
    Execution,
    ForecastModel,
    KnowledgeGraphEntity,
    KnowledgeGraphRelation,
    OptimizationRun,
    OrganizationMemory,
    PlanningSession,
    PredictionResult,
    Recommendation,
    Simulation,
    SimulationResult,
)
from app.models.marketplace_ecosystem import (  # noqa: F401
    AiGatewayRoute,
    ApiCatalogEntry,
    DeveloperApp,
    EventBusMessage,
    EventBusSubscription,
    EventBusTopic,
    EcosystemConnector,
    EcosystemConnectorInstance,
    EcosystemPlugin,
    EcosystemPluginInstallation,
    EcosystemPluginPermission,
    EcosystemPluginReview,
    EcosystemPluginVersion,
    GovernanceApproval,
    MarketplaceCategory,
    MarketplaceDownload,
    MarketplaceItem,
    MarketplaceRating,
    MarketplaceReview,
    McpResource,
    McpServer,
    McpTool,
    SdkRelease,
    WebhookEventLog,
    WebhookSubscription,
)
from app.models.ai_reliability import (  # noqa: F401
    CostReport,
    EvaluationRun,
    GoldenDataset,
    GuardrailEvent,
    LLMRequest,
    LLMTrace,
    PromptExperiment,
    PromptRegistry,
    PromptRegistryVersion,
)
from app.models.enterprise_saas import (  # noqa: F401
    ApiKey,
    ApiUsage,
    BillingEvent,
    DeploymentLog,
    EncryptedSecret,
    Payment,
    TenantSettings,
    UsageQuota,
)
from app.models.workflow_automation import (  # noqa: F401
    WorkflowLog,
    WorkflowQueueItem,
    WorkflowSchedule,
    WorkflowVariable,
    WorkflowVersion,
)
from app.models.multi_agent import (  # noqa: F401
    AgentCommunication,
    AgentHealth,
    TaskHistory,
    TaskQueue,
)
from app.models.agent_platform import (  # noqa: F401
    AgentEvaluation,
    AgentExecution,
    AgentKnowledge,
    AgentMemory,
    AgentTemplate,
    AgentTool,
    AgentVersion,
    AIWorkflowDefinition,
    AIWorkflowExecution,
)
from app.models.ai import (  # noqa: F401
    AgentConfig,
    AIConfig,
    AIConversation,
    ConversationTurn,
    EvalResult,
    EvalRun,
    Prompt,
    PromptVersion,
    RAGChunk,
    RAGDocument,
    RAGEmbedding,
    ToolCallLog,
    ToolDefinition,
)
from app.models.analytics import (  # noqa: F401
    AlertEvent,
    AlertRule,
    ChurnRiskScore,
    Dashboard,
    Forecast,
    Insight,
    KPIMetric,
    MetricSnapshot,
    Report,
    ReportExecution,
)
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.customer import Customer  # noqa: F401
from app.models.distributor import Distributor  # noqa: F401
from app.models.email_verification_token import EmailVerificationToken  # noqa: F401
from app.models.knowledge import (  # noqa: F401
    DocumentChunk,
    DocumentVersion,
    EmbeddingsMetadata,
    IngestionJob,
    KnowledgeDocument,
    KnowledgeSource,
    RAGSearchLog,
)
from app.models.knowledge_article import (  # noqa: F401
    KnowledgeArticle,
    KnowledgeArticleVersion,
    KnowledgeCategory,
)
from app.models.notification import (  # noqa: F401
    FileUpload,
    Notification,
    NotificationBranding,
    NotificationChannel,
    NotificationLog,
    NotificationPreference,
    NotificationTemplate,
)
from app.models.observability import (  # noqa: F401
    Alert,
    ErrorReport,
    MonitoringEvent,
    PerformanceReport,
    SystemMetric,
)
from app.models.saas import (  # noqa: F401
    FeatureRequest,
    Invoice,
    OnboardingStep,
    SubscriptionPlan,
    Subscription,
    SupportTicket,
    SystemStatus,
    UsageRecord,
)
from app.models.omnichannel import (  # noqa: F401
    AgentAvailability,
    CallLog,
    CallTranscript,
    ChannelConversation,
    ChannelMetric,
    EmailMessage,
    EmailThread,
    HandoffRequest,
    WhatsAppMessage,
)
from app.models.organization import Organization, UserOrganization  # noqa: F401
from app.models.password_reset_token import PasswordResetToken  # noqa: F401
from app.models.permission import Permission, RolePermission  # noqa: F401
from app.models.product import Category, Product, ProductVariant  # noqa: F401
from app.models.refresh_token import RefreshToken  # noqa: F401
from app.models.role import Role, UserRole  # noqa: F401
from app.models.session import Session  # noqa: F401
from app.models.telephony import (  # noqa: F401
    BusinessHoursSchedule,
    CallRecording,
    PhoneNumber,
    RoutingRule,
    TelephonyCallEvent,
    TelephonyCallLog,
    TelephonyCallSession,
    TelephonyProvider,
    TelephonySettings,
)
from app.models.ticket import Ticket, TicketComment  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.voice import (  # noqa: F401
    CallEvent,
    VoiceAnalytics,
    VoiceAssistant,
    VoiceMessage,
    VoiceProvider,
    VoiceSession,
    VoiceSettings,
    VoiceWebhookLog,
)
from app.models.whatsapp import (  # noqa: F401
    WhatsAppAccount,
    WhatsAppAnalytics,
    WhatsAppHandoff,
    WhatsAppMedia,
    WhatsAppMessage,
    WhatsAppNumber,
    WhatsAppSession,
    WhatsAppTemplate,
    WhatsAppWebhook,
)
from app.models.workflow import (  # noqa: F401
    Connector,
    ConnectorLog,
    DeadLetterQueue,
    EventLog,
    EventSubscription,
    JobExecution,
    RuleSet,
    ScheduledJob,
    WebhookEndpoint,
    Workflow,
    WorkflowApproval,
    WorkflowExecution,
    WorkflowTemplate,
)
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# ===== Alembic Config =====
config = context.config

# Set the SQLAlchemy URL from app settings
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Configure logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate
target_metadata = Base.metadata


# ===== Offline Migrations (generates SQL script) =====


def run_migrations_offline() -> None:
    """Run migrations in offline mode.

    Generates SQL without connecting to the database.
    Useful for review or applying migrations manually.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ===== Online Migrations (connects to DB) =====


def do_run_migrations(connection: Connection) -> None:
    """Run migrations with a live database connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in online mode (async).

    Creates an async engine, connects, and runs migrations.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


# ===== Entry Point =====

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())

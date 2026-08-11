"""Aggregates all v1 API routers into one.

Mounted at /api/v1 in the main app.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    agent_platform,
    ai,
    ai_reliability,
    analytics,
    audit,
    auth,
    autonomous_enterprise,
    connectors,
    customers,
    developer,
    ecosystem,
    enterprise_saas,
    health,
    knowledge,
    knowledge_tickets,
    llm,
    marketplace,
    mcp,
    multi_agent,
    notifications,
    notifications_dashboard,
    observability,
    omnichannel,
    organizations,
    oauth,
    plugins,
    products,
    production,
    rbac,
    saas,
    sessions,
    telephony,
    telephony_webhook,
    users,
    voice,
    voice_webhook,
    webhook_platform,
    whatsapp,
    whatsapp_webhook,
    workflow,
    workflow_automation,
)

api_router = APIRouter()

# Health (no auth)
api_router.include_router(health.router, prefix="/health", tags=["health"])

# Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])

# User management
api_router.include_router(users.router, prefix="/users", tags=["users"])

# Organizations
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])

# Roles + Permissions
api_router.include_router(rbac.router, prefix="/iam", tags=["iam"])

# Sessions
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])

# Audit logs
api_router.include_router(audit.router, prefix="/iam", tags=["audit"])

# Phase 3: Business modules
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(
    knowledge_tickets.router, prefix="/content", tags=["knowledge-base", "tickets"]
)
api_router.include_router(
    notifications_dashboard.router, prefix="/notifications", tags=["notifications"]
)
api_router.include_router(notifications_dashboard.router, tags=["dashboard"])

# Phase 4: AI Platform
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])

# LLM Provider Gateway
api_router.include_router(llm.router, prefix="/ai/llm", tags=["llm"])

# Stage 2 Step 2: Enterprise RAG & Knowledge Management
api_router.include_router(
    knowledge.router, prefix="/knowledge", tags=["knowledge", "rag"]
)

# Stage 2 Step 3: Enterprise Voice AI Platform
api_router.include_router(voice.router, prefix="/voice", tags=["voice"])
api_router.include_router(voice_webhook.router, prefix="/voice", tags=["voice", "webhook"])

# Stage 2 Step 4: Enterprise Telephony Integration Platform
api_router.include_router(telephony.router, prefix="/telephony", tags=["telephony"])
api_router.include_router(telephony_webhook.router, prefix="/telephony", tags=["telephony", "webhook"])

# Stage 2 Step 5: Enterprise WhatsApp AI Platform
api_router.include_router(whatsapp.router, prefix="/whatsapp", tags=["whatsapp"])
api_router.include_router(whatsapp_webhook.router, prefix="/whatsapp", tags=["whatsapp", "webhook"])

# Stage 2 Step 6: Enterprise Notification Platform
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])

# Stage 2 Step 7: Enterprise Observability Platform
api_router.include_router(observability.router, prefix="/observability", tags=["observability"])

# Stage 2 Step 10: Commercial SaaS Platform
api_router.include_router(saas.router, prefix="/saas", tags=["saas"])

# Phase 5: Omnichannel
api_router.include_router(omnichannel.router, prefix="/omnichannel", tags=["omnichannel"])

# Phase 6: Workflow Automation
api_router.include_router(workflow.router, prefix="/automation", tags=["automation"])

# Phase 7: Analytics & BI
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])

# Phase 6: Enterprise AI Agent Platform
api_router.include_router(
    agent_platform.router, prefix="/agents-platform", tags=["ai-agents", "platform"]
)

# Phase 7: Multi-Agent Orchestration
api_router.include_router(
    multi_agent.router, prefix="/orchestration", tags=["orchestration", "multi-agent"]
)

# Phase 8: Enterprise Workflow Automation
api_router.include_router(
    workflow_automation.router, prefix="/workflow-automation", tags=["workflow", "automation"]
)

# Phase 9: Enterprise SaaS Control Plane
api_router.include_router(
    enterprise_saas.router, prefix="/enterprise", tags=["enterprise", "saas", "admin"]
)

# Phase 10: AI Reliability Platform
api_router.include_router(
    ai_reliability.router, prefix="/ai-ops", tags=["ai-ops", "reliability", "observability"]
)

# Phase 11: Enterprise AI Ecosystem — Marketplace, Plugins, Connectors, MCP, Webhooks, Event Bus, Developer Portal, AI Gateway, Search, Governance
api_router.include_router(
    marketplace.router, prefix="/marketplace", tags=["marketplace"]
)
api_router.include_router(
    plugins.router, prefix="/plugins", tags=["plugins", "ecosystem"]
)
api_router.include_router(
    connectors.router, prefix="/connectors", tags=["connectors", "ecosystem"]
)
api_router.include_router(
    mcp.router, prefix="/mcp", tags=["mcp", "ecosystem"]
)
api_router.include_router(
    developer.router, prefix="/developer", tags=["developer", "portal"]
)
api_router.include_router(
    webhook_platform.router, prefix="/platform", tags=["webhooks", "event-bus", "platform"]
)
api_router.include_router(
    ecosystem.router, prefix="/ecosystem", tags=["ai-gateway", "search", "governance"]
)

# Phase 11.5: Production hardening — OAuth2, sandbox, MCP client, payments, SDK generator, analytics, full-text search
api_router.include_router(
    oauth.router, prefix="/oauth", tags=["oauth2", "authentication"]
)
api_router.include_router(
    production.router, prefix="/production", tags=["production", "sandbox", "payments", "analytics", "sdk"]
)

# Phase 12: Autonomous Enterprise Operating System — digital twins, simulations, knowledge graph, decisions, predictions, optimizations, memory, recommendations, executions, approvals, executive copilot
api_router.include_router(
    autonomous_enterprise.router, prefix="/enterprise-os",
    tags=["enterprise-os", "digital-twin", "simulation", "knowledge-graph",
          "decision", "prediction", "optimization", "memory",
          "recommendation", "execution", "approval", "copilot"]
)

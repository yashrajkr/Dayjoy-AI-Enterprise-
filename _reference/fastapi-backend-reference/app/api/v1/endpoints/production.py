"""Plugin sandbox + MCP client + SDK generator + payments + connector OAuth endpoints."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Form, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.exceptions import ValidationError
from app.core.response import created, paginated, success
from app.services.common import resolve_org_id
from app.services.connector_oauth import ConnectorOAuthService
from app.services.fulltext_search import FullTextSearchService
from app.services.marketplace_payments import MarketplacePaymentsService, handle_stripe_webhook
from app.services.mcp_client import McpClientManager
from app.services.plugin_analytics import PluginAnalyticsService
from app.services.plugin_sandbox import PluginSandbox
from app.services.sdk_generator import SdkGeneratorService, SUPPORTED_LANGUAGES

router = APIRouter()


# ====================================================================
# Plugin Sandbox Endpoints
# ====================================================================

class ExecutePluginRequest(BaseModel):
    args: dict = Field(default_factory=dict)
    handler: str = "handler"
    timeout_seconds: int = Field(30, ge=1, le=300)
    memory_limit_mb: int = Field(256, ge=32, le=2048)


@router.post("/plugins/installations/{installation_id}/execute",
             summary="Execute plugin in sandboxed subprocess")
async def execute_plugin(installation_id: uuid.UUID, request: ExecutePluginRequest,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    """Execute a plugin handler in an isolated subprocess with strict resource limits."""
    org_id = await resolve_org_id(db, user)
    sandbox = PluginSandbox(db, timeout=request.timeout_seconds,
                              memory_limit_mb=request.memory_limit_mb)
    result = await sandbox.execute(installation_id=installation_id,
                                     args=request.args, handler=request.handler)
    await db.commit()
    return success({
        "success": result.success, "exit_code": result.exit_code,
        "stdout": result.stdout[:5000],  # truncate for response
        "stderr": result.stderr[:5000],
        "duration_ms": result.duration_ms, "timed_out": result.timed_out,
        "result": result.result, "error": result.error,
    })


@router.post("/plugins/installations/{installation_id}/sandbox-health",
             summary="Run a sandbox health check on a plugin")
async def sandbox_health_check(installation_id: uuid.UUID,
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    """Run a no-op sandboxed execution to verify the plugin still works."""
    sandbox = PluginSandbox(db)
    result = await sandbox.health_check(installation_id=installation_id)
    await db.commit()
    return success(result)


# ====================================================================
# MCP Client Endpoints
# ====================================================================

class InvokeMcpToolRequest(BaseModel):
    arguments: dict = Field(default_factory=dict)


@router.post("/mcp/servers/{server_id}/discover-live",
             summary="Discover tools from a live MCP server")
async def mcp_discover_live(server_id: uuid.UUID,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    """Connect to a live MCP server, list its tools, and persist them to the database."""
    manager = McpClientManager(db)
    result = await manager.discover_tools(server_id=server_id)
    await db.commit()
    return success(result)


@router.post("/mcp/servers/{server_id}/health-live",
             summary="Ping a live MCP server")
async def mcp_health_live(server_id: uuid.UUID,
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    """Connect to a live MCP server and ping it for health."""
    manager = McpClientManager(db)
    status_val = await manager.health_check(server_id=server_id)
    await db.commit()
    return success({"server_id": str(server_id), "health_status": status_val})


@router.post("/mcp/tools/{tool_id}/invoke-live",
             summary="Invoke a tool on a live MCP server")
async def mcp_invoke_live(tool_id: uuid.UUID, request: InvokeMcpToolRequest,
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    """Connect to a live MCP server and invoke a specific tool with arguments."""
    manager = McpClientManager(db)
    result = await manager.invoke_tool(tool_id=tool_id, arguments=request.arguments)
    await db.commit()
    return success(result)


@router.get("/mcp/servers/{server_id}/resources-live",
            summary="List resources from a live MCP server")
async def mcp_list_resources_live(server_id: uuid.UUID,
                                    user: CurrentUser = None, db: DBSession = None) -> dict:
    """Connect to a live MCP server and list its resources."""
    manager = McpClientManager(db)
    resources = await manager.discover_resources(server_id=server_id)
    await db.commit()
    return success(resources)


# ====================================================================
# Plugin Analytics Endpoints
# ====================================================================

@router.get("/plugins/analytics/overview", summary="Plugin ecosystem overview")
async def plugin_analytics_overview(days: int = Query(30, ge=1, le=365),
                                      user: CurrentUser = None, db: DBSession = None) -> dict:
    """Get high-level plugin analytics for the organization."""
    org_id = await resolve_org_id(db, user)
    svc = PluginAnalyticsService(db)
    return success(await svc.get_overview(organization_id=org_id, days=days))


@router.get("/plugins/analytics/time-series", summary="Plugin time-series metric")
async def plugin_analytics_time_series(
    metric: str = Query("installs", pattern="^(installs|uninstalls|errors|health_checks)$"),
    days: int = Query(30, ge=1, le=365),
    bucket: str = Query("day", pattern="^(day|week)$"),
    user: CurrentUser = None, db: DBSession = None,
) -> dict:
    """Get a time-series of a plugin metric over time."""
    org_id = await resolve_org_id(db, user)
    svc = PluginAnalyticsService(db)
    return success(await svc.get_time_series(organization_id=org_id, metric=metric,
                                               days=days, bucket=bucket))


@router.get("/plugins/analytics/top", summary="Top plugins leaderboard")
async def plugin_analytics_top(limit: int = Query(10, ge=1, le=100),
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    """Get the most-installed plugins (leaderboard)."""
    org_id = await resolve_org_id(db, user)
    svc = PluginAnalyticsService(db)
    return success(await svc.get_top_plugins(organization_id=org_id, limit=limit))


@router.get("/plugins/analytics/errors", summary="Plugin error summary")
async def plugin_analytics_errors(days: int = Query(7, ge=1, le=90),
                                    user: CurrentUser = None, db: DBSession = None) -> dict:
    """Get a summary of installations with errors in the last N days."""
    org_id = await resolve_org_id(db, user)
    svc = PluginAnalyticsService(db)
    return success(await svc.get_error_summary(organization_id=org_id, days=days))


@router.get("/plugins/{plugin_id}/analytics", summary="Per-plugin detail analytics")
async def plugin_analytics_detail(plugin_id: uuid.UUID,
                                    days: int = Query(30, ge=1, le=365),
                                    user: CurrentUser = None, db: DBSession = None) -> dict:
    """Get detailed analytics for a single plugin."""
    org_id = await resolve_org_id(db, user)
    svc = PluginAnalyticsService(db)
    return success(await svc.get_plugin_detail(plugin_id=plugin_id,
                                                  organization_id=org_id, days=days))


# ====================================================================
# Full-text Search Endpoints
# ====================================================================

class FullTextSearchRequest(BaseModel):
    query: str = Field(..., min_length=2)
    item_types: list[str] | None = None
    limit_per_type: int = Field(10, ge=1, le=50)


@router.post("/search/fulltext", summary="Full-text search across marketplace")
async def fulltext_search(request: FullTextSearchRequest,
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    """Run a full-text search across the marketplace (PostgreSQL tsvector + LIKE fallback)."""
    org_id = await resolve_org_id(db, user)
    svc = FullTextSearchService(db)
    result = await svc.unified_search(query=request.query, organization_id=org_id,
                                        item_types=request.item_types,
                                        limit_per_type=request.limit_per_type)
    return success(result)


# ====================================================================
# SDK Generator Endpoints
# ====================================================================

class GenerateSdkRequest(BaseModel):
    api_entry_id: uuid.UUID | None = None
    openapi_spec: dict | None = None
    language: str = Field(..., max_length=30)
    package_name: str | None = None
    version: str = "1.0.0"
    base_url: str | None = None
    api_name: str | None = None
    api_description: str | None = None


@router.post("/sdk/generate", summary="Generate an SDK from an OpenAPI spec")
async def generate_sdk(request: GenerateSdkRequest,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    """Generate SDK package files in any of 7 supported languages."""
    if request.language not in SUPPORTED_LANGUAGES:
        raise ValidationError(f"Unsupported language: {request.language}. Supported: {sorted(SUPPORTED_LANGUAGES)}")
    svc = SdkGeneratorService(db=db)
    if request.api_entry_id:
        result = await svc.generate_from_api(
            api_entry_id=request.api_entry_id, language=request.language,
            package_name=request.package_name, version=request.version)
    elif request.openapi_spec:
        result = svc.generate_from_spec(
            spec=request.openapi_spec, language=request.language,
            package_name=request.package_name or "dayjoy_sdk",
            version=request.version,
            base_url=request.base_url or "",
            api_name=request.api_name or "DayJoy API",
            api_description=request.api_description or "")
    else:
        raise ValidationError("Either api_entry_id or openapi_spec must be provided")
    return success(result)


@router.get("/sdk/languages", summary="List supported SDK languages")
async def list_sdk_languages() -> dict:
    return success({"languages": sorted(SUPPORTED_LANGUAGES)})


# ====================================================================
# Marketplace Payments Endpoints
# ====================================================================

class CreatePaymentIntentRequest(BaseModel):
    item_id: uuid.UUID


@router.post("/marketplace/payments/intent", summary="Create a payment intent")
async def create_payment_intent(request: CreatePaymentIntentRequest,
                                  user: CurrentUser = None, db: DBSession = None) -> dict:
    """Create a payment intent for a paid marketplace item (Stripe Connect or ledger mode)."""
    org_id = await resolve_org_id(db, user)
    svc = MarketplacePaymentsService(db)
    result = await svc.create_payment_intent(item_id=request.item_id,
                                               buyer_org_id=org_id, buyer_user_id=str(user.id))
    return success(result)


class ConfirmPurchaseRequest(BaseModel):
    intent_id: str
    item_id: uuid.UUID


@router.post("/marketplace/payments/confirm", summary="Confirm a paid purchase")
async def confirm_purchase(request: ConfirmPurchaseRequest,
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    """Confirm a purchase after payment succeeds — grants download access."""
    org_id = await resolve_org_id(db, user)
    svc = MarketplacePaymentsService(db)
    result = await svc.confirm_purchase(intent_id=request.intent_id,
                                          item_id=request.item_id,
                                          buyer_org_id=org_id, buyer_user_id=str(user.id))
    await db.commit()
    return success(result)


@router.post("/marketplace/payments/fees", summary="Calculate marketplace fees")
async def calculate_fees(price_cents: int = Query(..., ge=0),
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    """Calculate the platform commission + seller take for a given price."""
    svc = MarketplacePaymentsService(db)
    return success(svc.calculate_fee(price_cents))


# ====================================================================
# Connector OAuth Endpoints
# ====================================================================

class OAuthAuthorizeUrlRequest(BaseModel):
    connector_id: uuid.UUID
    redirect_uri: str
    scopes: list[str] | None = None
    use_pkce: bool = True


@router.post("/connectors/oauth/authorize-url", summary="Build OAuth authorization URL")
async def build_oauth_authorize_url(request: OAuthAuthorizeUrlRequest,
                                      user: CurrentUser = None, db: DBSession = None) -> dict:
    """Build the provider authorization URL + state for the OAuth flow."""
    org_id = await resolve_org_id(db, user)
    svc = ConnectorOAuthService(db)
    result = await svc.build_authorization_url_async(
        connector_id=request.connector_id, organization_id=org_id,
        user_id=str(user.id), redirect_uri=request.redirect_uri,
        scopes=request.scopes, use_pkce=request.use_pkce)
    return success(result)


class OAuthExchangeRequest(BaseModel):
    code: str
    state: str


@router.post("/connectors/oauth/exchange", status_code=status.HTTP_201_CREATED,
             summary="Exchange OAuth code for tokens + create instance")
async def exchange_oauth_code(request: OAuthExchangeRequest, response: Response,
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    """Exchange an OAuth authorization code for tokens + create a connector instance."""
    svc = ConnectorOAuthService(db)
    result = await svc.exchange_code(code=request.code, state=request.state)
    await db.commit()
    return created(result, response=response)


class OAuthRefreshRequest(BaseModel):
    instance_id: uuid.UUID


@router.post("/connectors/oauth/refresh", summary="Refresh OAuth access token")
async def refresh_oauth_token(request: OAuthRefreshRequest,
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    """Refresh the access token for a connector instance using its refresh_token."""
    org_id = await resolve_org_id(db, user)
    svc = ConnectorOAuthService(db)
    result = await svc.refresh_token(instance_id=request.instance_id,
                                       organization_id=org_id)
    await db.commit()
    return success(result)


# ====================================================================
# Worker Control Endpoints
# ====================================================================

class RunWorkerRequest(BaseModel):
    batch_size: int = Field(100, ge=1, le=1000)


@router.post("/workers/webhooks/run", summary="Run one webhook delivery batch")
async def run_webhook_worker(request: RunWorkerRequest,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    """Run one batch of the webhook delivery worker (admin operation)."""
    from app.services.webhook_delivery import WebhookDeliveryWorker
    worker = WebhookDeliveryWorker(db, max_events=request.batch_size)
    stats = await worker.run_once()
    await db.commit()
    await worker.close()
    return success(stats)


@router.post("/workers/event-bus/run", summary="Run one event bus worker batch")
async def run_event_bus_worker(request: RunWorkerRequest,
                                 user: CurrentUser = None, db: DBSession = None) -> dict:
    """Run one batch of the event bus worker (admin operation)."""
    from app.services.event_bus_worker import EventBusWorker
    worker = EventBusWorker(db, max_messages=request.batch_size)
    stats = await worker.run_once()
    await db.commit()
    return success(stats)


@router.post("/workers/oauth/cleanup", summary="Clean up expired OAuth codes + tokens")
async def run_oauth_cleanup(user: CurrentUser = None, db: DBSession = None) -> dict:
    """Remove expired OAuth authorization codes and refresh tokens from the in-memory store."""
    from app.services.oauth_service import cleanup_expired_codes_and_tokens
    cleaned = cleanup_expired_codes_and_tokens()
    return success({"cleaned_up": cleaned})

"""MCP (Model Context Protocol) API — servers, tools, resources, health, discovery."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, paginated, success
from app.services.common import resolve_org_id
from app.services.marketplace_ecosystem import McpService

router = APIRouter()


# ===== Schemas =====

class RegisterServerRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    transport: str = Field(..., max_length=20)  # stdio/sse/websocket/http
    endpoint: str | None = None
    transport_config: dict | None = None
    auth_type: str | None = None
    auth_config: dict | None = None
    description: str | None = None
    version: str | None = None
    vendor: str | None = None
    vendor_url: str | None = None
    icon: str | None = None
    is_official: bool = False
    auto_discover_tools: bool = True


class UpdateServerRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    endpoint: str | None = None
    transport_config: dict | None = None
    auth_type: str | None = None
    auth_config: dict | None = None
    version: str | None = None
    vendor: str | None = None
    is_enabled: bool | None = None
    auto_discover_tools: bool | None = None


class RegisterToolRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict | None = None
    annotations: dict | None = None
    is_destructive: bool = False
    requires_confirmation: bool = False
    category: str | None = None
    tags: list[str] = Field(default_factory=list)


class RegisterResourceRequest(BaseModel):
    uri: str = Field(..., min_length=1, max_length=500)
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    is_template: bool = False


class InvokeToolRequest(BaseModel):
    latency_ms: int = 0
    success: bool = True


class DiscoverToolsRequest(BaseModel):
    tools: list[dict]  # [{name, description, input_schema, output_schema, annotations, ...}]


# ===== Servers =====

@router.post("/servers", status_code=status.HTTP_201_CREATED, summary="Register MCP server")
async def register_server(request: RegisterServerRequest, response: Response,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = McpService(db)
    server = await svc.register_server(
        organization_id=org_id, name=request.name, slug=request.slug,
        transport=request.transport, endpoint=request.endpoint,
        transport_config=request.transport_config, auth_type=request.auth_type,
        auth_config=request.auth_config, description=request.description,
        version=request.version, vendor=request.vendor, vendor_url=request.vendor_url,
        icon=request.icon, is_official=request.is_official,
        auto_discover_tools=request.auto_discover_tools)
    await db.commit()
    return created(svc.server_to_dict(server), response=response)


@router.get("/servers", summary="List MCP servers")
async def list_servers(is_enabled: bool | None = Query(None),
                       skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = McpService(db)
    servers, total = await svc.list_servers(organization_id=org_id, is_enabled=is_enabled,
                                             skip=skip, limit=limit)
    return paginated([svc.server_to_dict(s) for s in servers], total=total, skip=skip, limit=limit)


@router.get("/servers/{server_id}", summary="Get MCP server")
async def get_server(server_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = McpService(db)
    server = await svc.get_server(server_id=server_id)
    return success(svc.server_to_dict(server))


@router.patch("/servers/{server_id}", summary="Update MCP server")
async def update_server(server_id: uuid.UUID, request: UpdateServerRequest,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = McpService(db)
    updates = request.model_dump(exclude_unset=True)
    server = await svc.update_server(server_id=server_id, **updates)
    await db.commit()
    return success(svc.server_to_dict(server))


@router.delete("/servers/{server_id}", summary="Disable MCP server")
async def delete_server(server_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = McpService(db)
    await svc.delete_server(server_id=server_id)
    await db.commit()
    return success({"disabled": True, "server_id": str(server_id)})


@router.post("/servers/{server_id}/health", summary="Health check MCP server")
async def health_check_server(server_id: uuid.UUID, status: str = "healthy",
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = McpService(db)
    server = await svc.health_check(server_id=server_id, status=status)
    await db.commit()
    return success(svc.server_to_dict(server))


@router.post("/servers/{server_id}/discover", summary="Discover tools from MCP server")
async def discover_tools(server_id: uuid.UUID, request: DiscoverToolsRequest,
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = McpService(db)
    result = await svc.discover_tools(server_id=server_id, discovered=request.tools)
    await db.commit()
    return success(result)


# ===== Tools =====

@router.post("/servers/{server_id}/tools", status_code=status.HTTP_201_CREATED, summary="Register MCP tool")
async def register_tool(server_id: uuid.UUID, request: RegisterToolRequest, response: Response,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = McpService(db)
    tool = await svc.register_tool(
        server_id=server_id, organization_id=org_id, name=request.name,
        description=request.description, input_schema=request.input_schema,
        output_schema=request.output_schema, annotations=request.annotations,
        is_destructive=request.is_destructive,
        requires_confirmation=request.requires_confirmation,
        category=request.category, tags=request.tags)
    await db.commit()
    return created(svc.tool_to_dict(tool), response=response)


@router.get("/tools", summary="List MCP tools")
async def list_tools(server_id: uuid.UUID | None = Query(None),
                     category: str | None = Query(None),
                     is_enabled: bool | None = Query(None),
                     skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                     user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = McpService(db)
    tools, total = await svc.list_tools(server_id=server_id, organization_id=org_id,
                                         category=category, is_enabled=is_enabled,
                                         skip=skip, limit=limit)
    return paginated([svc.tool_to_dict(t) for t in tools], total=total, skip=skip, limit=limit)


@router.post("/tools/{tool_id}/invoke", summary="Invoke MCP tool (record invocation)")
async def invoke_tool(tool_id: uuid.UUID, request: InvokeToolRequest,
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = McpService(db)
    tool = await svc.invoke_tool(tool_id=tool_id, latency_ms=request.latency_ms,
                                 success=request.success)
    await db.commit()
    return success(svc.tool_to_dict(tool))


# ===== Resources =====

@router.post("/servers/{server_id}/resources", status_code=status.HTTP_201_CREATED,
             summary="Register MCP resource")
async def register_resource(server_id: uuid.UUID, request: RegisterResourceRequest,
                            response: Response,
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = McpService(db)
    resource = await svc.register_resource(
        server_id=server_id, organization_id=org_id, uri=request.uri, name=request.name,
        description=request.description, mime_type=request.mime_type,
        size_bytes=request.size_bytes, is_template=request.is_template)
    await db.commit()
    return created({"id": str(resource.id), "server_id": str(server_id),
                    "uri": resource.uri, "name": resource.name,
                    "mime_type": resource.mime_type, "is_template": resource.is_template,
                    "is_enabled": resource.is_enabled}, response=response)


@router.get("/resources", summary="List MCP resources")
async def list_resources(server_id: uuid.UUID | None = Query(None),
                         skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = McpService(db)
    resources, total = await svc.list_resources(server_id=server_id, organization_id=org_id,
                                                 skip=skip, limit=limit)
    return paginated([{"id": str(r.id), "server_id": str(r.server_id), "uri": r.uri,
                       "name": r.name, "description": r.description,
                       "mime_type": r.mime_type, "size_bytes": r.size_bytes,
                       "is_template": r.is_template, "is_enabled": r.is_enabled,
                       "access_count": r.access_count,
                       "last_accessed_at": r.last_accessed_at.isoformat() if r.last_accessed_at else None}
                      for r in resources], total=total, skip=skip, limit=limit)

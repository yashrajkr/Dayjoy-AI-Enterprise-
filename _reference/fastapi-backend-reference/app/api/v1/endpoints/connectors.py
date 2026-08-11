"""Connectors API — catalog, instances, encrypted credentials, health, OAuth."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, paginated, success
from app.services.common import resolve_org_id
from app.services.marketplace_ecosystem import ConnectorService

router = APIRouter()


# ===== Schemas =====

class CreateConnectorRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., max_length=50)
    provider: str = Field(..., max_length=100)
    auth_type: str = Field(..., max_length=30)
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    icon: str | None = None
    auth_config: dict | None = None
    config_schema: dict | None = None
    capabilities: list[str] = Field(default_factory=list)
    supported_operations: list[str] = Field(default_factory=list)
    webhook_supported: bool = False
    rate_limit_per_minute: int | None = None
    documentation_url: str | None = None
    is_official: bool = False


class CreateInstanceRequest(BaseModel):
    connector_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=200)
    auth_type: str = Field(..., max_length=30)
    credentials: dict
    config: dict = Field(default_factory=dict)


class UpdateInstanceRequest(BaseModel):
    config: dict | None = None
    credentials: dict | None = None
    status: str | None = None


class HealthCheckRequest(BaseModel):
    status: str = "healthy"
    error: str | None = None


# ===== Catalog =====

@router.post("/catalog", status_code=status.HTTP_201_CREATED, summary="Create connector (catalog)")
async def create_connector(request: CreateConnectorRequest, response: Response,
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = ConnectorService(db)
    connector = await svc.create_connector(
        name=request.name, slug=request.slug, category=request.category, provider=request.provider,
        auth_type=request.auth_type, description=request.description, tags=request.tags,
        icon=request.icon, auth_config=request.auth_config, config_schema=request.config_schema,
        capabilities=request.capabilities, supported_operations=request.supported_operations,
        webhook_supported=request.webhook_supported, rate_limit_per_minute=request.rate_limit_per_minute,
        documentation_url=request.documentation_url, is_official=request.is_official)
    await db.commit()
    return created(svc.to_dict(connector), response=response)


@router.get("/catalog", summary="List connectors (catalog)")
async def list_connectors(category: str | None = Query(None),
                          search: str | None = Query(None),
                          skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = ConnectorService(db)
    connectors, total = await svc.list_connectors(category=category, search=search,
                                                  skip=skip, limit=limit)
    return paginated([svc.to_dict(c) for c in connectors], total=total, skip=skip, limit=limit)


@router.get("/catalog/{connector_id}", summary="Get connector (catalog)")
async def get_connector(connector_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = ConnectorService(db)
    connector = await svc.get_connector(connector_id=connector_id)
    return success(svc.to_dict(connector))


@router.get("/categories", summary="List connector categories")
async def list_categories(user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = ConnectorService(db)
    return success(await svc.list_categories())


@router.get("/known", summary="List known connectors (static catalog)")
async def list_known_connectors() -> dict:
    return success(ConnectorService.KNOWN_CONNECTORS)


# ===== Instances =====

@router.post("/instances", status_code=status.HTTP_201_CREATED, summary="Create connector instance")
async def create_instance(request: CreateInstanceRequest, response: Response,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ConnectorService(db)
    instance = await svc.create_instance(
        connector_id=request.connector_id, organization_id=org_id, name=request.name,
        auth_type=request.auth_type, credentials=request.credentials, config=request.config,
        installed_by=str(user.id))
    await db.commit()
    return created(svc.instance_to_dict(instance), response=response)


@router.get("/instances", summary="List connector instances")
async def list_instances(connector_id: uuid.UUID | None = Query(None),
                         skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ConnectorService(db)
    instances, total = await svc.list_instances(organization_id=org_id, connector_id=connector_id,
                                                 skip=skip, limit=limit)
    return paginated([svc.instance_to_dict(i) for i in instances], total=total, skip=skip, limit=limit)


@router.get("/instances/{instance_id}", summary="Get connector instance")
async def get_instance(instance_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ConnectorService(db)
    instance = await svc.get_instance(instance_id=instance_id, organization_id=org_id)
    return success(svc.instance_to_dict(instance))


@router.patch("/instances/{instance_id}", summary="Update instance")
async def update_instance(instance_id: uuid.UUID, request: UpdateInstanceRequest,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ConnectorService(db)
    instance = await svc.update_instance(instance_id=instance_id, organization_id=org_id,
                                          config=request.config, credentials=request.credentials,
                                          status=request.status)
    await db.commit()
    return success(svc.instance_to_dict(instance))


@router.delete("/instances/{instance_id}", summary="Delete instance (disable + wipe creds)")
async def delete_instance(instance_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ConnectorService(db)
    await svc.delete_instance(instance_id=instance_id, organization_id=org_id)
    await db.commit()
    return success({"deleted": True, "instance_id": str(instance_id)})


@router.post("/instances/{instance_id}/health", summary="Health check")
async def health_check(instance_id: uuid.UUID, request: HealthCheckRequest,
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ConnectorService(db)
    instance = await svc.health_check(instance_id=instance_id, organization_id=org_id,
                                       status=request.status, error=request.error)
    await db.commit()
    return success(svc.instance_to_dict(instance))


@router.post("/instances/{instance_id}/record-call", summary="Record API call to connector")
async def record_call(instance_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = ConnectorService(db)
    instance = await svc.record_call(instance_id=instance_id, organization_id=org_id)
    await db.commit()
    return success(svc.instance_to_dict(instance))

"""Developer Portal API — apps, API catalog, SDK releases, OAuth validation."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, paginated, success
from app.services.common import resolve_org_id
from app.services.marketplace_ecosystem import DeveloperPortalService

router = APIRouter()


# ===== Schemas =====

class CreateAppRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    app_type: str = "server"  # server/spa/mobile/desktop/plugin
    redirect_uris: list[str] = Field(default_factory=list)
    scopes: list[str] = Field(default_factory=list)
    rate_limit_per_minute: int = 100
    rate_limit_per_day: int = 10000
    homepage_url: str | None = None
    logo_url: str | None = None
    contact_email: str | None = None
    webhook_url: str | None = None


class UpdateAppRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    redirect_uris: list[str] | None = None
    scopes: list[str] | None = None
    rate_limit_per_minute: int | None = None
    rate_limit_per_day: int | None = None
    homepage_url: str | None = None
    logo_url: str | None = None
    contact_email: str | None = None
    webhook_url: str | None = None
    is_active: bool | None = None


class CreateApiEntryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    api_type: str = Field(..., max_length=20)  # rest/graphql/webhook
    base_url: str | None = None
    openapi_spec: dict | None = None
    graphql_schema: str | None = None
    version: str = "1.0.0"
    auth_type: str | None = None
    documentation_url: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] = Field(default_factory=list)


class CreateSdkReleaseRequest(BaseModel):
    language: str = Field(..., max_length=30)
    version: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    description: str | None = None
    package_url: str | None = None
    repository_url: str | None = None
    documentation_url: str | None = None
    download_url: str | None = None
    checksum: str | None = None
    size_bytes: int | None = None
    min_runtime_version: str | None = None
    release_notes: str | None = None
    is_stable: bool = False


# ===== Apps =====

@router.post("/apps", status_code=status.HTTP_201_CREATED, summary="Create developer app")
async def create_app(request: CreateAppRequest, response: Response,
                     user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DeveloperPortalService(db)
    app, client_secret = await svc.create_app(
        organization_id=org_id, name=request.name, description=request.description,
        app_type=request.app_type, redirect_uris=request.redirect_uris, scopes=request.scopes,
        rate_limit_per_minute=request.rate_limit_per_minute,
        rate_limit_per_day=request.rate_limit_per_day, homepage_url=request.homepage_url,
        logo_url=request.logo_url, contact_email=request.contact_email,
        webhook_url=request.webhook_url, created_by=str(user.id))
    await db.commit()
    return created({**svc.app_to_dict(app), "client_secret": client_secret,
                    "_warning": "Save this client_secret now — it will not be shown again."},
                   response=response)


@router.get("/apps", summary="List developer apps")
async def list_apps(skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                    user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DeveloperPortalService(db)
    apps, total = await svc.list_apps(organization_id=org_id, skip=skip, limit=limit)
    return paginated([svc.app_to_dict(a) for a in apps], total=total, skip=skip, limit=limit)


@router.get("/apps/{app_id}", summary="Get developer app")
async def get_app(app_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DeveloperPortalService(db)
    app = await svc.get_app(app_id=app_id, organization_id=org_id)
    return success(svc.app_to_dict(app))


@router.patch("/apps/{app_id}", summary="Update developer app")
async def update_app(app_id: uuid.UUID, request: UpdateAppRequest,
                     user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DeveloperPortalService(db)
    updates = request.model_dump(exclude_unset=True)
    app = await svc.update_app(app_id=app_id, organization_id=org_id, **updates)
    await db.commit()
    return success(svc.app_to_dict(app))


@router.post("/apps/{app_id}/rotate-secret", summary="Rotate client secret")
async def rotate_secret(app_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DeveloperPortalService(db)
    app, new_secret = await svc.rotate_secret(app_id=app_id, organization_id=org_id)
    await db.commit()
    return success({"client_id": app.client_id, "client_secret": new_secret,
                    "_warning": "Save this new client_secret now — the old one is no longer valid."})


@router.post("/apps/{app_id}/record-request", summary="Record API request (internal)")
async def record_request(app_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = DeveloperPortalService(db)
    app = await svc.record_request(app_id=app_id)
    await db.commit()
    return success(svc.app_to_dict(app))


# ===== API Catalog =====

@router.post("/apis", status_code=status.HTTP_201_CREATED, summary="Create API catalog entry")
async def create_api_entry(request: CreateApiEntryRequest, response: Response,
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DeveloperPortalService(db)
    entry = await svc.create_api_entry(
        organization_id=org_id, name=request.name, slug=request.slug,
        api_type=request.api_type, base_url=request.base_url,
        openapi_spec=request.openapi_spec, graphql_schema=request.graphql_schema,
        version=request.version, auth_type=request.auth_type,
        documentation_url=request.documentation_url, description=request.description,
        category=request.category, tags=request.tags, created_by=str(user.id))
    await db.commit()
    return created(svc.api_to_dict(entry), response=response)


@router.get("/apis", summary="List API catalog entries")
async def list_api_entries(api_type: str | None = Query(None),
                           is_published: bool | None = Query(None),
                           skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DeveloperPortalService(db)
    entries, total = await svc.list_api_entries(organization_id=org_id, api_type=api_type,
                                                 is_published=is_published, skip=skip, limit=limit)
    return paginated([svc.api_to_dict(e) for e in entries], total=total, skip=skip, limit=limit)


@router.post("/apis/{entry_id}/publish", summary="Publish API entry")
async def publish_api_entry(entry_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = DeveloperPortalService(db)
    entry = await svc.publish_api_entry(entry_id=entry_id, organization_id=org_id)
    await db.commit()
    return success(svc.api_to_dict(entry))


# ===== SDK Releases =====

@router.post("/sdks", status_code=status.HTTP_201_CREATED, summary="Create SDK release")
async def create_sdk_release(request: CreateSdkReleaseRequest, response: Response,
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = DeveloperPortalService(db)
    release = await svc.create_sdk_release(
        language=request.language, version=request.version, name=request.name,
        description=request.description, package_url=request.package_url,
        repository_url=request.repository_url, documentation_url=request.documentation_url,
        download_url=request.download_url, checksum=request.checksum,
        size_bytes=request.size_bytes, min_runtime_version=request.min_runtime_version,
        release_notes=request.release_notes, is_stable=request.is_stable,
        published_by=str(user.id))
    await db.commit()
    return created(svc.sdk_to_dict(release), response=response)


@router.get("/sdks", summary="List SDK releases")
async def list_sdk_releases(language: str | None = Query(None),
                            is_stable: bool | None = Query(None),
                            skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                            user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = DeveloperPortalService(db)
    releases, total = await svc.list_sdk_releases(language=language, is_stable=is_stable,
                                                   skip=skip, limit=limit)
    return paginated([svc.sdk_to_dict(s) for s in releases], total=total, skip=skip, limit=limit)


@router.post("/sdks/{release_id}/download", summary="Record SDK download")
async def record_sdk_download(release_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = DeveloperPortalService(db)
    release = await svc.record_sdk_download(release_id=release_id)
    await db.commit()
    return success(svc.sdk_to_dict(release))

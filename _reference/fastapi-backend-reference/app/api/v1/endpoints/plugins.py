"""Plugins API — CRUD, versions, install/uninstall/update, permissions, reviews, health."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, paginated, success
from app.services.common import resolve_org_id
from app.services.marketplace_ecosystem import PluginService

router = APIRouter()


# ===== Schemas =====

class CreatePluginRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(None, max_length=50)
    tags: list[str] = Field(default_factory=list)
    runtime: str = "python"
    entrypoint: str = "main.py"
    permissions: list[dict] = Field(default_factory=list)
    config_schema: dict | None = None
    default_config: dict | None = None
    homepage_url: str | None = None
    repository_url: str | None = None
    documentation_url: str | None = None
    license_: str | None = None
    icon: str | None = None


class UpdatePluginRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    homepage_url: str | None = None
    repository_url: str | None = None
    documentation_url: str | None = None
    icon: str | None = None


class InstallPluginRequest(BaseModel):
    version: str | None = None
    config: dict = Field(default_factory=dict)
    granted_permissions: list[str] | None = None


class UpdateInstallationRequest(BaseModel):
    config: dict | None = None
    granted_permissions: list[str] | None = None
    status: str | None = None


class CreatePluginReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    title: str | None = Field(None, max_length=200)
    body: str | None = None
    version: str | None = None


class AddPermissionRequest(BaseModel):
    permission: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    is_required: bool = False
    risk_level: str = "low"


class HealthCheckRequest(BaseModel):
    status: str = "healthy"
    error: str | None = None


# ===== Plugin CRUD =====

@router.post("", status_code=status.HTTP_201_CREATED, summary="Create plugin")
async def create_plugin(request: CreatePluginRequest, response: Response,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PluginService(db)
    plugin = await svc.create_plugin(
        organization_id=org_id, name=request.name, slug=request.slug,
        description=request.description, category=request.category, tags=request.tags,
        author_id=str(user.id), author_name=getattr(user, "full_name", None) or getattr(user, "email", None),
        runtime=request.runtime, entrypoint=request.entrypoint,
        permissions=request.permissions, config_schema=request.config_schema,
        default_config=request.default_config, homepage_url=request.homepage_url,
        repository_url=request.repository_url, documentation_url=request.documentation_url,
        license_=request.license_, icon=request.icon)
    await db.commit()
    return created(svc.to_dict(plugin), response=response)


@router.get("", summary="List plugins")
async def list_plugins(category: str | None = Query(None),
                       is_published: bool | None = Query(None),
                       search: str | None = Query(None),
                       skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PluginService(db)
    plugins, total = await svc.list_plugins(organization_id=org_id, category=category,
                                            is_published=is_published, search=search,
                                            skip=skip, limit=limit)
    return paginated([svc.to_dict(p) for p in plugins], total=total, skip=skip, limit=limit)


@router.get("/{plugin_id}", summary="Get plugin")
async def get_plugin(plugin_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    plugin = await svc.get_plugin(plugin_id=plugin_id)
    return success(svc.to_dict(plugin))


@router.patch("/{plugin_id}", summary="Update plugin")
async def update_plugin(plugin_id: uuid.UUID, request: UpdatePluginRequest,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    updates = request.model_dump(exclude_unset=True)
    # Map license_ -> license
    if "license_" in updates:
        updates["license"] = updates.pop("license_")
    plugin = await svc.update_plugin(plugin_id=plugin_id, **updates)
    await db.commit()
    return success(svc.to_dict(plugin))


@router.post("/{plugin_id}/publish", summary="Publish plugin")
async def publish_plugin(plugin_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    plugin = await svc.publish_plugin(plugin_id=plugin_id)
    await db.commit()
    return success(svc.to_dict(plugin))


# ===== Versions =====

@router.get("/{plugin_id}/versions", summary="List plugin versions")
async def list_versions(plugin_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    versions = await svc.list_versions(plugin_id=plugin_id)
    return success([{"id": str(v.id), "version": v.version,
                     "release_notes": v.release_notes, "entrypoint": v.entrypoint,
                     "permissions": v.permissions, "is_active": v.is_active,
                     "is_yanked": v.is_yanked, "published_by": v.published_by,
                     "published_at": v.published_at.isoformat() if v.published_at else None,
                     "created_at": v.created_at.isoformat() if v.created_at else None}
                    for v in versions])


@router.post("/{plugin_id}/rollback/{version}", summary="Rollback to version")
async def rollback_to_version(plugin_id: uuid.UUID, version: str,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    plugin = await svc.rollback_to_version(plugin_id=plugin_id, version=version)
    await db.commit()
    return success(svc.to_dict(plugin))


@router.post("/{plugin_id}/yank/{version}", summary="Yank a version")
async def yank_version(plugin_id: uuid.UUID, version: str,
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    ver = await svc.yank_version(plugin_id=plugin_id, version=version)
    await db.commit()
    return success({"version": ver.version, "is_yanked": ver.is_yanked})


# ===== Installations =====

@router.post("/{plugin_id}/install", status_code=status.HTTP_201_CREATED, summary="Install plugin")
async def install_plugin(plugin_id: uuid.UUID, request: InstallPluginRequest, response: Response,
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PluginService(db)
    installation = await svc.install_plugin(
        plugin_id=plugin_id, organization_id=org_id, installed_by=str(user.id),
        version=request.version, config=request.config,
        granted_permissions=request.granted_permissions)
    await db.commit()
    return created(svc.installation_to_dict(installation), response=response)


@router.get("/installations", summary="List installed plugins")
async def list_installations(skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                             user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PluginService(db)
    installations, total = await svc.list_installations(organization_id=org_id, skip=skip, limit=limit)
    return paginated([svc.installation_to_dict(i) for i in installations],
                     total=total, skip=skip, limit=limit)


@router.patch("/installations/{installation_id}", summary="Update installation")
async def update_installation(installation_id: uuid.UUID, request: UpdateInstallationRequest,
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    installation = await svc.update_installation(
        installation_id=installation_id, config=request.config,
        granted_permissions=request.granted_permissions, status=request.status)
    await db.commit()
    return success(svc.installation_to_dict(installation))


@router.delete("/installations/{installation_id}", summary="Uninstall plugin")
async def uninstall_plugin(installation_id: uuid.UUID,
                           user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    await svc.uninstall_plugin(installation_id=installation_id)
    await db.commit()
    return success({"uninstalled": True, "installation_id": str(installation_id)})


@router.post("/installations/{installation_id}/health", summary="Health check")
async def health_check(installation_id: uuid.UUID, request: HealthCheckRequest,
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    installation = await svc.health_check(installation_id=installation_id,
                                          status=request.status, error=request.error)
    await db.commit()
    return success(svc.installation_to_dict(installation))


# ===== Permissions =====

@router.get("/{plugin_id}/permissions", summary="List plugin permissions")
async def list_permissions(plugin_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    permissions = await svc.list_permissions(plugin_id=plugin_id)
    return success([{"id": str(p.id), "permission": p.permission,
                     "description": p.description, "is_required": p.is_required,
                     "risk_level": p.risk_level} for p in permissions])


@router.post("/{plugin_id}/permissions", status_code=status.HTTP_201_CREATED, summary="Add permission")
async def add_permission(plugin_id: uuid.UUID, request: AddPermissionRequest, response: Response,
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    perm = await svc.add_permission(plugin_id=plugin_id, permission=request.permission,
                                    description=request.description,
                                    is_required=request.is_required, risk_level=request.risk_level)
    await db.commit()
    return created({"id": str(perm.id), "permission": perm.permission,
                    "risk_level": perm.risk_level, "is_required": perm.is_required}, response=response)


# ===== Reviews =====

@router.post("/{plugin_id}/reviews", status_code=status.HTTP_201_CREATED, summary="Create plugin review")
async def create_review(plugin_id: uuid.UUID, request: CreatePluginReviewRequest, response: Response,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = PluginService(db)
    review = await svc.create_review(
        plugin_id=plugin_id, organization_id=org_id, user_id=str(user.id),
        user_name=getattr(user, "full_name", None) or getattr(user, "email", None),
        rating=request.rating, title=request.title, body=request.body, version=request.version)
    await db.commit()
    return created({"id": str(review.id), "rating": review.rating, "title": review.title},
                   response=response)


@router.get("/{plugin_id}/reviews", summary="List plugin reviews")
async def list_reviews(plugin_id: uuid.UUID,
                       skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = PluginService(db)
    reviews, total = await svc.list_reviews(plugin_id=plugin_id, skip=skip, limit=limit)
    return paginated([{"id": str(r.id), "user_id": r.user_id, "user_name": r.user_name,
                       "rating": r.rating, "title": r.title, "body": r.body,
                       "version": r.version, "status": r.status,
                       "created_at": r.created_at.isoformat() if r.created_at else None}
                      for r in reviews], total=total, skip=skip, limit=limit)

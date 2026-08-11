"""Marketplace API — listings, categories, downloads, ratings, reviews, moderation."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, paginated, success
from app.services.common import resolve_org_id
from app.services.marketplace_ecosystem import MarketplaceService

router = APIRouter()


# ===== Schemas =====

class CreateCategoryRequest(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    item_type: str = Field(..., max_length=30)
    description: str | None = None
    icon: str | None = None
    parent_id: uuid.UUID | None = None
    sort_order: int = 0


class CreateItemRequest(BaseModel):
    item_type: str = Field(..., max_length=30)
    entity_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    summary: str | None = Field(None, max_length=500)
    description: str | None = None
    category_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)
    icon: str | None = Field(None, max_length=50)
    license_: str | None = Field(None, max_length=50)
    version: str | None = Field(None, max_length=50)
    visibility: str = "public"
    publisher_name: str | None = None
    is_free: bool = True
    price_cents: int = 0
    metadata: dict | None = None


class RateItemRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)


class CreateReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    title: str | None = Field(None, max_length=200)
    body: str = Field(..., min_length=1)


class ModerateRequest(BaseModel):
    action: str  # approve/reject/archive/feature/unfeature/verify/unverify
    reason: str | None = None


# ===== Categories =====

@router.post("/categories", status_code=status.HTTP_201_CREATED, summary="Create category")
async def create_category(request: CreateCategoryRequest, response: Response,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = MarketplaceService(db)
    category = await svc.create_category(
        slug=request.slug, name=request.name, item_type=request.item_type,
        description=request.description, icon=request.icon,
        parent_id=request.parent_id, sort_order=request.sort_order)
    await db.commit()
    return created({"id": str(category.id), "slug": category.slug, "name": category.name,
                    "item_type": category.item_type}, response=response)


@router.get("/categories", summary="List categories")
async def list_categories(item_type: str | None = Query(None),
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = MarketplaceService(db)
    categories = await svc.list_categories(item_type=item_type)
    return success([{"id": str(c.id), "slug": c.slug, "name": c.name,
                     "item_type": c.item_type, "description": c.description,
                     "icon": c.icon, "sort_order": c.sort_order,
                     "parent_id": str(c.parent_id) if c.parent_id else None}
                    for c in categories])


# ===== Items =====

@router.post("/items", status_code=status.HTTP_201_CREATED, summary="Create marketplace item")
async def create_item(request: CreateItemRequest, response: Response,
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    item = await svc.create_item(
        organization_id=org_id, item_type=request.item_type, entity_id=request.entity_id,
        name=request.name, slug=request.slug, summary=request.summary,
        description=request.description, category_id=request.category_id, tags=request.tags,
        icon=request.icon, license_=request.license_, version=request.version,
        visibility=request.visibility, publisher_id=str(user.id), publisher_name=request.publisher_name,
        is_free=request.is_free, price_cents=request.price_cents, metadata=request.metadata)
    await db.commit()
    return created(svc.to_dict(item), response=response)


@router.get("/items", summary="List marketplace items")
async def list_items(item_type: str | None = Query(None),
                     category_id: uuid.UUID | None = Query(None),
                     visibility: str | None = Query(None),
                     is_featured: bool | None = Query(None),
                     search: str | None = Query(None),
                     status_filter: str | None = Query(None, alias="status"),
                     skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                     user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    items, total = await svc.list_items(item_type=item_type, category_id=category_id,
                                         organization_id=org_id, status=status_filter or "published",
                                         visibility=visibility, is_featured=is_featured,
                                         search=search, skip=skip, limit=limit)
    return paginated([svc.to_dict(i) for i in items], total=total, skip=skip, limit=limit)


@router.get("/items/{item_id}", summary="Get marketplace item")
async def get_item(item_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    item = await svc.get_item(item_id=item_id, organization_id=org_id)
    return success(svc.to_dict(item))


@router.post("/items/{item_id}/publish", summary="Publish item")
async def publish_item(item_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    item = await svc.publish_item(item_id=item_id, organization_id=org_id)
    await db.commit()
    return success(svc.to_dict(item))


@router.post("/items/{item_id}/archive", summary="Archive item")
async def archive_item(item_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    item = await svc.archive_item(item_id=item_id, organization_id=org_id)
    await db.commit()
    return success(svc.to_dict(item))


@router.post("/items/{item_id}/feature", summary="Feature / unfeature item")
async def feature_item(item_id: uuid.UUID, featured: bool = True,
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    item = await svc.feature_item(item_id=item_id, featured=featured, organization_id=org_id)
    await db.commit()
    return success(svc.to_dict(item))


@router.post("/items/{item_id}/verify", summary="Verify item")
async def verify_item(item_id: uuid.UUID, verified: bool = True,
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    item = await svc.verify_item(item_id=item_id, verified=verified, organization_id=org_id)
    await db.commit()
    return success(svc.to_dict(item))


# ===== Downloads =====

@router.post("/items/{item_id}/download", status_code=status.HTTP_201_CREATED, summary="Record download/install")
async def record_download(item_id: uuid.UUID, action: str = "install", version: str | None = None,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    download = await svc.record_download(
        item_id=item_id, organization_id=org_id, user_id=str(user.id),
        version=version, action=action)
    await db.commit()
    return created({"id": str(download.id), "item_id": str(item_id),
                    "action": download.action, "status": download.status})


@router.get("/downloads", summary="List downloads")
async def list_downloads(item_id: uuid.UUID | None = Query(None),
                         skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    downloads, total = await svc.list_downloads(organization_id=org_id, item_id=item_id,
                                                 skip=skip, limit=limit)
    return paginated([{"id": str(d.id), "item_id": str(d.item_id), "version": d.version,
                       "action": d.action, "status": d.status, "error": d.error,
                       "created_at": d.created_at.isoformat() if d.created_at else None}
                      for d in downloads], total=total, skip=skip, limit=limit)


# ===== Ratings =====

@router.post("/items/{item_id}/rate", summary="Rate item (1-5)")
async def rate_item(item_id: uuid.UUID, request: RateItemRequest,
                    user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    await svc.rate_item(item_id=item_id, organization_id=org_id,
                        user_id=str(user.id), rating=request.rating)
    await db.commit()
    return success({"rated": True, "rating": request.rating})


# ===== Reviews =====

@router.post("/items/{item_id}/reviews", status_code=status.HTTP_201_CREATED, summary="Create review")
async def create_review(item_id: uuid.UUID, request: CreateReviewRequest, response: Response,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = MarketplaceService(db)
    review = await svc.create_review(
        item_id=item_id, organization_id=org_id, user_id=str(user.id),
        user_name=getattr(user, "full_name", None) or getattr(user, "email", None),
        rating=request.rating, title=request.title, body=request.body)
    await db.commit()
    return created({"id": str(review.id), "rating": review.rating, "title": review.title},
                   response=response)


@router.get("/items/{item_id}/reviews", summary="List reviews for item")
async def list_reviews(item_id: uuid.UUID,
                       skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = MarketplaceService(db)
    reviews, total = await svc.list_reviews(item_id=item_id, skip=skip, limit=limit)
    return paginated([{"id": str(r.id), "user_id": r.user_id, "user_name": r.user_name,
                       "rating": r.rating, "title": r.title, "body": r.body,
                       "is_verified_purchase": r.is_verified_purchase,
                       "helpful_count": r.helpful_count, "status": r.status,
                       "created_at": r.created_at.isoformat() if r.created_at else None}
                      for r in reviews], total=total, skip=skip, limit=limit)


@router.post("/reviews/{review_id}/flag", summary="Flag review for moderation")
async def flag_review(review_id: uuid.UUID, reason: str,
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = MarketplaceService(db)
    review = await svc.flag_review(review_id=review_id, reason=reason)
    await db.commit()
    return success({"flagged": True, "review_id": str(review.id), "reason": review.flag_reason})


# ===== Moderation =====

@router.post("/items/{item_id}/moderate", summary="Moderate item (admin)")
async def moderate_item(item_id: uuid.UUID, request: ModerateRequest,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = MarketplaceService(db)
    item = await svc.moderate_item(item_id=item_id, action=request.action, reason=request.reason)
    await db.commit()
    return success(svc.to_dict(item))

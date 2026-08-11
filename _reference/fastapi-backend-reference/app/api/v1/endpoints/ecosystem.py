"""AI Gateway + Global Search + Governance API — routing rules, search, approvals."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, paginated, success
from app.services.common import resolve_org_id
from app.services.marketplace_ecosystem import (
    AiGatewayService, GlobalSearchService, GovernanceService,
)

router = APIRouter()


# ====================================================================
# Schemas — AI Gateway
# ====================================================================

class CreateRouteRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    route_type: str = "primary"  # primary/fallback/load_balance/conditional
    providers: list[dict] = Field(default_factory=list)
    fallback_chain: list[str] = Field(default_factory=list)
    conditions: dict | None = None
    strategy: str = "cheapest"
    max_cost_per_1k: float | None = None
    max_latency_ms: int | None = None
    required_capability: str | None = None
    priority: int = 100
    description: str | None = None


class UpdateRouteRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    route_type: str | None = None
    providers: list[dict] | None = None
    fallback_chain: list[str] | None = None
    conditions: dict | None = None
    strategy: str | None = None
    max_cost_per_1k: float | None = None
    max_latency_ms: int | None = None
    required_capability: str | None = None
    is_active: bool | None = None
    priority: int | None = None


class SelectProviderRequest(BaseModel):
    strategy: str = "cheapest"  # cheapest/fastest/highest_quality/reasoning/vision
    required_capability: str | None = None
    max_cost_per_1k: float | None = None
    max_latency_ms: int | None = None


class RecordRouteRequest(BaseModel):
    used_fallback: bool = False


# ====================================================================
# Schemas — Governance
# ====================================================================

class CreateApprovalRequest(BaseModel):
    entity_type: str = Field(..., max_length=30)  # plugin/connector/agent/marketplace_item/api/sdk
    entity_id: str = Field(..., min_length=1, max_length=36)
    name: str = Field(..., min_length=1, max_length=200)
    action: str = Field(..., max_length=30)  # install/publish/update/uninstall/promote
    risk_level: str = "low"  # low/medium/high/critical
    risk_assessment: dict | None = None
    metadata: dict | None = None
    expires_in_days: int | None = 30


class ReviewApprovalRequest(BaseModel):
    decision: str = Field(..., pattern="^(approved|rejected)$")
    notes: str | None = None


# ====================================================================
# AI GATEWAY
# ====================================================================

@router.post("/ai-gateway/routes", status_code=status.HTTP_201_CREATED,
             summary="Create AI gateway route")
async def create_route(request: CreateRouteRequest, response: Response,
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AiGatewayService(db)
    route = await svc.create_route(
        organization_id=org_id, name=request.name, route_type=request.route_type,
        providers=request.providers, fallback_chain=request.fallback_chain,
        conditions=request.conditions, strategy=request.strategy,
        max_cost_per_1k=request.max_cost_per_1k, max_latency_ms=request.max_latency_ms,
        required_capability=request.required_capability, priority=request.priority,
        description=request.description)
    await db.commit()
    return created(svc.route_to_dict(route), response=response)


@router.get("/ai-gateway/routes", summary="List AI gateway routes")
async def list_routes(is_active: bool | None = Query(None),
                      skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = AiGatewayService(db)
    routes, total = await svc.list_routes(organization_id=org_id, is_active=is_active,
                                           skip=skip, limit=limit)
    return paginated([svc.route_to_dict(r) for r in routes], total=total, skip=skip, limit=limit)


@router.patch("/ai-gateway/routes/{route_id}", summary="Update route")
async def update_route(route_id: uuid.UUID, request: UpdateRouteRequest,
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = AiGatewayService(db)
    updates = request.model_dump(exclude_unset=True)
    route = await svc.update_route(route_id=route_id, **updates)
    await db.commit()
    return success(svc.route_to_dict(route))


@router.delete("/ai-gateway/routes/{route_id}", summary="Delete route")
async def delete_route(route_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = AiGatewayService(db)
    await svc.delete_route(route_id=route_id)
    await db.commit()
    return success({"deleted": True, "route_id": str(route_id)})


@router.post("/ai-gateway/select", summary="Select best provider (routing)")
async def select_provider(request: SelectProviderRequest,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = AiGatewayService(db)
    return success(await svc.select_provider(
        strategy=request.strategy, required_capability=request.required_capability,
        max_cost_per_1k=request.max_cost_per_1k, max_latency_ms=request.max_latency_ms))


@router.get("/ai-gateway/providers", summary="List known providers")
async def list_providers() -> dict:
    return success(AiGatewayService.KNOWN_PROVIDERS)


@router.post("/ai-gateway/routes/{route_id}/record", summary="Record routed request")
async def record_route_request(route_id: uuid.UUID, request: RecordRouteRequest,
                                user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = AiGatewayService(db)
    route = await svc.record_request(route_id=route_id, used_fallback=request.used_fallback)
    await db.commit()
    return success(svc.route_to_dict(route))


# ====================================================================
# GLOBAL SEARCH
# ====================================================================

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=2)
    item_types: list[str] | None = None
    category: str | None = None
    limit_per_type: int = Field(10, ge=1, le=50)


@router.post("/search", summary="Global marketplace search")
async def global_search(request: SearchRequest,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = GlobalSearchService(db)
    result = await svc.search(
        organization_id=org_id, query=request.query,
        item_types=request.item_types, category=request.category,
        limit_per_type=request.limit_per_type)
    return success(result)


# ====================================================================
# GOVERNANCE — APPROVALS
# ====================================================================

@router.post("/governance/approvals", status_code=status.HTTP_201_CREATED,
             summary="Create approval request")
async def create_approval(request: CreateApprovalRequest, response: Response,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = GovernanceService(db)
    approval = await svc.create_approval(
        organization_id=org_id, entity_type=request.entity_type, entity_id=request.entity_id,
        name=request.name, action=request.action, requested_by=str(user.id),
        risk_level=request.risk_level, risk_assessment=request.risk_assessment,
        metadata=request.metadata, expires_in_days=request.expires_in_days)
    await db.commit()
    return created(svc.to_dict(approval), response=response)


@router.get("/governance/approvals", summary="List approvals")
async def list_approvals(status_filter: str | None = Query(None, alias="status"),
                         entity_type: str | None = Query(None),
                         skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = GovernanceService(db)
    approvals, total = await svc.list_approvals(organization_id=org_id, status=status_filter,
                                                 entity_type=entity_type, skip=skip, limit=limit)
    return paginated([svc.to_dict(a) for a in approvals], total=total, skip=skip, limit=limit)


@router.get("/governance/approvals/{approval_id}", summary="Get approval")
async def get_approval(approval_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = GovernanceService(db)
    approval = await svc.get_approval(approval_id=approval_id, organization_id=org_id)
    return success(svc.to_dict(approval))


@router.post("/governance/approvals/{approval_id}/review", summary="Review (approve/reject)")
async def review_approval(approval_id: uuid.UUID, request: ReviewApprovalRequest,
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = GovernanceService(db)
    approval = await svc.review_approval(
        approval_id=approval_id, organization_id=org_id, reviewer_id=str(user.id),
        decision=request.decision, notes=request.notes)
    await db.commit()
    return success(svc.to_dict(approval))


@router.post("/governance/approvals/{approval_id}/withdraw", summary="Withdraw approval request")
async def withdraw_approval(approval_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = GovernanceService(db)
    approval = await svc.withdraw_approval(approval_id=approval_id, organization_id=org_id,
                                            user_id=str(user.id))
    await db.commit()
    return success(svc.to_dict(approval))

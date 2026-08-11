"""Webhook Platform + Event Bus API — subscriptions, events, topics, messages, DLQ."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.response import created, paginated, success
from app.services.common import resolve_org_id
from app.services.marketplace_ecosystem import EventBusService, WebhookPlatformService

router = APIRouter()


# ====================================================================
# Schemas
# ====================================================================

class CreateSubscriptionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    target_url: str = Field(..., min_length=1, max_length=1000)
    event_types: list[str] = Field(..., min_length=1)
    headers: dict = Field(default_factory=dict)
    max_retries: int = 5
    timeout_seconds: int = 30
    developer_app_id: uuid.UUID | None = None


class UpdateSubscriptionRequest(BaseModel):
    target_url: str | None = None
    event_types: list[str] | None = None
    is_active: bool | None = None
    headers: dict | None = None


class ReceiveIncomingRequest(BaseModel):
    event_type: str = Field(..., max_length=100)
    event_id: str = Field(..., max_length=100)
    payload: dict
    headers: dict | None = None
    signature: str | None = None
    source_ip: str | None = None


class CreateTopicRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    schema_: dict | None = None
    retention_hours: int = 168


class CreateSubscriptionForTopicRequest(BaseModel):
    topic_id: uuid.UUID
    subscriber_type: str  # webhook/queue/plugin/mcp/agent/workflow
    name: str = Field(..., min_length=1, max_length=200)
    subscriber_id: str | None = None
    filter_expression: str | None = None
    transform_config: dict | None = None
    max_retries: int = 3


class PublishEventRequest(BaseModel):
    event_id: str = Field(..., max_length=100)
    payload: dict
    headers: dict | None = None
    priority: int = 5


# ====================================================================
# WEBHOOK SUBSCRIPTIONS
# ====================================================================

@router.post("/webhooks/subscriptions", status_code=status.HTTP_201_CREATED,
             summary="Create webhook subscription")
async def create_webhook_subscription(request: CreateSubscriptionRequest, response: Response,
                                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WebhookPlatformService(db)
    sub, secret = await svc.create_subscription(
        organization_id=org_id, name=request.name, target_url=request.target_url,
        event_types=request.event_types, headers=request.headers,
        max_retries=request.max_retries, timeout_seconds=request.timeout_seconds,
        developer_app_id=request.developer_app_id, created_by=str(user.id))
    await db.commit()
    return created({**svc.subscription_to_dict(sub), "signing_secret": secret,
                    "_warning": "Save this signing_secret now — it will not be shown again."},
                   response=response)


@router.get("/webhooks/subscriptions", summary="List webhook subscriptions")
async def list_webhook_subscriptions(is_active: bool | None = Query(None),
                                      skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                                      user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WebhookPlatformService(db)
    subs, total = await svc.list_subscriptions(organization_id=org_id, is_active=is_active,
                                                skip=skip, limit=limit)
    return paginated([svc.subscription_to_dict(s) for s in subs],
                     total=total, skip=skip, limit=limit)


@router.patch("/webhooks/subscriptions/{subscription_id}", summary="Update subscription")
async def update_webhook_subscription(subscription_id: uuid.UUID, request: UpdateSubscriptionRequest,
                                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WebhookPlatformService(db)
    sub = await svc.update_subscription(
        subscription_id=subscription_id, organization_id=org_id,
        target_url=request.target_url, event_types=request.event_types,
        is_active=request.is_active, headers=request.headers)
    await db.commit()
    return success(svc.subscription_to_dict(sub))


@router.delete("/webhooks/subscriptions/{subscription_id}", summary="Delete webhook subscription")
async def delete_webhook_subscription(subscription_id: uuid.UUID,
                                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WebhookPlatformService(db)
    await svc.delete_subscription(subscription_id=subscription_id, organization_id=org_id)
    await db.commit()
    return success({"deleted": True, "subscription_id": str(subscription_id)})


# ====================================================================
# WEBHOOK EVENTS (incoming + outgoing)
# ====================================================================

@router.post("/webhooks/incoming", status_code=status.HTTP_201_CREATED,
             summary="Receive incoming webhook event")
async def receive_incoming_webhook(request: ReceiveIncomingRequest, response: Response,
                                    user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WebhookPlatformService(db)
    event = await svc.receive_incoming(
        organization_id=org_id, event_type=request.event_type, event_id=request.event_id,
        payload=request.payload, headers=request.headers, signature=request.signature,
        source_ip=request.source_ip)
    await db.commit()
    return created(svc.event_to_dict(event), response=response)


@router.post("/webhooks/deliver", summary="Deliver pending outgoing webhooks")
async def deliver_pending_webhooks(max_events: int = Query(100, ge=1, le=1000),
                                    user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WebhookPlatformService(db)
    result = await svc.deliver_pending(organization_id=org_id, max_events=max_events)
    await db.commit()
    return success(result)


@router.post("/webhooks/events/{event_id}/replay", summary="Replay webhook event")
async def replay_webhook_event(event_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = WebhookPlatformService(db)
    event = await svc.replay_event(event_id=event_id)
    await db.commit()
    return success(svc.event_to_dict(event))


@router.get("/webhooks/events", summary="List webhook events")
async def list_webhook_events(direction: str | None = Query(None),  # incoming/outgoing
                              status_filter: str | None = Query(None, alias="status"),
                              event_type: str | None = Query(None),
                              skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                              user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = WebhookPlatformService(db)
    events, total = await svc.list_events(organization_id=org_id, direction=direction,
                                           status=status_filter, event_type=event_type,
                                           skip=skip, limit=limit)
    return paginated([svc.event_to_dict(e) for e in events], total=total, skip=skip, limit=limit)


# ====================================================================
# EVENT BUS — Topics
# ====================================================================

@router.post("/event-bus/topics", status_code=status.HTTP_201_CREATED, summary="Create event bus topic")
async def create_topic(request: CreateTopicRequest, response: Response,
                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EventBusService(db)
    topic = await svc.create_topic(
        organization_id=org_id, name=request.name, description=request.description,
        schema_=request.schema_, retention_hours=request.retention_hours)
    await db.commit()
    return created({"id": str(topic.id), "name": topic.name, "description": topic.description,
                    "retention_hours": topic.retention_hours, "is_active": topic.is_active},
                   response=response)


@router.get("/event-bus/topics", summary="List event bus topics")
async def list_topics(is_active: bool | None = Query(None),
                      skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                      user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EventBusService(db)
    topics, total = await svc.list_topics(organization_id=org_id, is_active=is_active,
                                           skip=skip, limit=limit)
    return paginated([{"id": str(t.id), "name": t.name, "description": t.description,
                       "retention_hours": t.retention_hours, "is_active": t.is_active,
                       "published_count": t.published_count,
                       "organization_id": t.organization_id,
                       "created_at": t.created_at.isoformat() if t.created_at else None}
                      for t in topics], total=total, skip=skip, limit=limit)


@router.get("/event-bus/system-topics", summary="List built-in system event topics")
async def list_system_topics() -> dict:
    return success(EventBusService.SYSTEM_TOPICS)


# ====================================================================
# EVENT BUS — Subscriptions
# ====================================================================

@router.post("/event-bus/subscriptions", status_code=status.HTTP_201_CREATED,
             summary="Create event bus subscription")
async def create_event_bus_subscription(request: CreateSubscriptionForTopicRequest, response: Response,
                                         user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EventBusService(db)
    sub = await svc.create_subscription(
        organization_id=org_id, topic_id=request.topic_id,
        subscriber_type=request.subscriber_type, name=request.name,
        subscriber_id=request.subscriber_id, filter_expression=request.filter_expression,
        transform_config=request.transform_config, max_retries=request.max_retries)
    await db.commit()
    return created({"id": str(sub.id), "topic_id": str(sub.topic_id),
                    "subscriber_type": sub.subscriber_type, "name": sub.name,
                    "is_active": sub.is_active, "max_retries": sub.max_retries}, response=response)


@router.get("/event-bus/subscriptions", summary="List event bus subscriptions")
async def list_event_bus_subscriptions(topic_id: uuid.UUID | None = Query(None),
                                       is_active: bool | None = Query(None),
                                       skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                                       user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EventBusService(db)
    subs, total = await svc.list_subscriptions(organization_id=org_id, topic_id=topic_id,
                                                is_active=is_active, skip=skip, limit=limit)
    return paginated([{"id": str(s.id), "topic_id": str(s.topic_id),
                       "subscriber_type": s.subscriber_type, "subscriber_id": s.subscriber_id,
                       "name": s.name, "filter_expression": s.filter_expression,
                       "is_active": s.is_active, "max_retries": s.max_retries,
                       "created_at": s.created_at.isoformat() if s.created_at else None}
                      for s in subs], total=total, skip=skip, limit=limit)


# ====================================================================
# EVENT BUS — Publish + Messages + DLQ
# ====================================================================

@router.post("/event-bus/topics/{topic_id}/publish", status_code=status.HTTP_201_CREATED,
             summary="Publish event to topic")
async def publish_event(topic_id: uuid.UUID, request: PublishEventRequest, response: Response,
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EventBusService(db)
    result = await svc.publish(organization_id=org_id, topic_id=topic_id,
                                event_id=request.event_id, payload=request.payload,
                                headers=request.headers, priority=request.priority)
    await db.commit()
    return created(result, response=response)


@router.get("/event-bus/messages", summary="List event bus messages")
async def list_messages(topic_id: uuid.UUID | None = Query(None),
                        status_filter: str | None = Query(None, alias="status"),
                        skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                        user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EventBusService(db)
    messages, total = await svc.list_messages(organization_id=org_id, topic_id=topic_id,
                                               status=status_filter, skip=skip, limit=limit)
    return paginated([{"id": str(m.id), "topic_id": str(m.topic_id),
                       "subscription_id": str(m.subscription_id) if m.subscription_id else None,
                       "event_id": m.event_id, "payload": m.payload,
                       "priority": m.priority, "attempt_count": m.attempt_count,
                       "max_attempts": m.max_attempts, "status": m.status, "error": m.error,
                       "last_attempt_at": m.last_attempt_at.isoformat() if m.last_attempt_at else None,
                       "next_retry_at": m.next_retry_at.isoformat() if m.next_retry_at else None,
                       "delivered_at": m.delivered_at.isoformat() if m.delivered_at else None,
                       "created_at": m.created_at.isoformat() if m.created_at else None}
                      for m in messages], total=total, skip=skip, limit=limit)


@router.post("/event-bus/process", summary="Process pending messages (worker)")
async def process_pending(max_messages: int = Query(100, ge=1, le=1000),
                          user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EventBusService(db)
    result = await svc.process_pending(organization_id=org_id, max_messages=max_messages)
    await db.commit()
    return success(result)


@router.post("/event-bus/messages/{message_id}/replay", summary="Replay message")
async def replay_message(message_id: uuid.UUID, user: CurrentUser = None, db: DBSession = None) -> dict:
    svc = EventBusService(db)
    msg = await svc.replay_message(message_id=message_id)
    await db.commit()
    return success({"id": str(msg.id), "status": msg.status, "attempt_count": msg.attempt_count})


@router.get("/event-bus/dlq", summary="Get dead-letter queue stats")
async def get_dlq_stats(user: CurrentUser = None, db: DBSession = None) -> dict:
    org_id = await resolve_org_id(db, user)
    svc = EventBusService(db)
    return success(await svc.get_dlq_stats(organization_id=org_id))

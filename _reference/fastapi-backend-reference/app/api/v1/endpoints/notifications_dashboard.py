"""Notification and Dashboard endpoints."""

import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.models.customer import Customer
from app.models.notification import Notification
from app.models.product import Product
from app.models.ticket import Ticket
from app.schemas.business import NotificationResponse

router = APIRouter()


# ===== Notifications =====


@router.get(
    "/notifications", response_model=list[NotificationResponse], summary="List my notifications"
)
async def list_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[NotificationResponse]:
    """List notifications for the current user."""
    stmt = select(Notification).where(Notification.user_id == str(user.id))
    if unread_only:
        stmt = stmt.where(Notification.is_read == False)  # noqa: E712
    stmt = stmt.order_by(Notification.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(stmt)
    return [NotificationResponse.model_validate(n) for n in result.scalars().all()]


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> None:
    """Mark a notification as read."""
    from datetime import datetime

    notif = await db.get(Notification, notification_id)
    if notif and notif.user_id == str(user.id):
        notif.is_read = True
        notif.read_at = datetime.now(UTC)
        await db.commit()


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> None:
    """Mark all notifications as read."""
    from datetime import datetime

    from sqlalchemy import update

    await db.execute(
        update(Notification)
        .where(Notification.user_id == str(user.id), Notification.is_read == False)  # noqa: E712
        .values(is_read=True, read_at=datetime.now(UTC))
    )
    await db.commit()


@router.get("/notifications/unread-count", summary="Get unread notification count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Get the count of unread notifications."""
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == str(user.id), Notification.is_read == False)  # noqa: E712
    )
    return {"unread_count": result.scalar_one_or_none() or 0}


# ===== Dashboard =====


@router.get("/dashboard/summary", summary="Dashboard summary KPIs")
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Get dashboard summary KPIs (live data from DB)."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return {"customers": 0, "products": 0, "tickets_open": 0, "tickets_total": 0}
    org_id = user_orgs[0].organization_id

    # Count customers
    cust_result = await db.execute(
        select(func.count()).select_from(Customer).where(Customer.organization_id == org_id)
    )
    customer_count = cust_result.scalar_one_or_none() or 0

    # Count products
    prod_result = await db.execute(
        select(func.count()).select_from(Product).where(Product.organization_id == org_id)
    )
    product_count = prod_result.scalar_one_or_none() or 0

    # Count tickets
    ticket_result = await db.execute(
        select(func.count()).select_from(Ticket).where(Ticket.organization_id == org_id)
    )
    ticket_total = ticket_result.scalar_one_or_none() or 0

    open_ticket_result = await db.execute(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.organization_id == org_id, Ticket.status.in_(["open", "in_progress"]))
    )
    ticket_open = open_ticket_result.scalar_one_or_none() or 0

    return {
        "customers": customer_count,
        "products": product_count,
        "tickets_open": ticket_open,
        "tickets_total": ticket_total,
    }

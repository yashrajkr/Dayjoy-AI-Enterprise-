"""Business tool handlers — plug-in tools for AI agents.

Each handler function takes (input_data: dict, db: AsyncSession) and returns a dict.
These are called dynamically by the ToolEngine.
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.customer import Customer
from app.models.product import Product
from app.models.ticket import Ticket

logger = get_logger(__name__)


async def lookup_customer(input_data: dict[str, Any], db: AsyncSession) -> dict:
    """Look up a customer by email, phone, or ID.

    Input: {"email": "...", "phone": "...", "customer_id": "..."}
    Output: {"customer": {...}} or {"customer": None}
    """
    email = input_data.get("email")
    phone = input_data.get("phone")
    customer_id = input_data.get("customer_id")
    org_id = input_data.get("organization_id")

    stmt = select(Customer)
    if customer_id:
        stmt = stmt.where(Customer.id == uuid.UUID(customer_id))
    elif email:
        stmt = stmt.where(Customer.email == email)
    elif phone:
        stmt = stmt.where(Customer.phone == phone)
    else:
        return {"customer": None, "error": "Must provide email, phone, or customer_id"}

    if org_id:
        stmt = stmt.where(Customer.organization_id == str(org_id))

    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if customer is None:
        return {"customer": None}

    return {
        "customer": {
            "id": str(customer.id),
            "full_name": customer.full_name,
            "email": customer.email,
            "phone": customer.phone,
            "status": customer.status,
            "city": customer.city,
            "country": customer.country,
        }
    }


async def search_products(input_data: dict[str, Any], db: AsyncSession) -> dict:
    """Search the product catalogue.

    Input: {"query": "...", "category_id": "...", "limit": 10}
    Output: {"products": [...], "total": N}
    """
    query = input_data.get("query", "")
    org_id = input_data.get("organization_id")
    limit = min(input_data.get("limit", 10), 50)

    stmt = select(Product).where(Product.status == "active")
    if org_id:
        stmt = stmt.where(Product.organization_id == str(org_id))
    if query:
        stmt = stmt.where(
            (Product.name.ilike(f"%{query}%"))
            | (Product.sku.ilike(f"%{query}%"))
            | (Product.short_description.ilike(f"%{query}%"))
        )
    stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    products = result.scalars().all()

    return {
        "products": [
            {
                "id": str(p.id),
                "sku": p.sku,
                "name": p.name,
                "price": p.price,
                "pv": p.pv,
                "bv": p.bv,
                "short_description": p.short_description,
                "status": p.status,
            }
            for p in products
        ],
        "total": len(products),
    }


async def create_ticket(input_data: dict[str, Any], db: AsyncSession) -> dict:
    """Create a support ticket.

    Input: {"subject": "...", "description": "...", "customer_id": "...", "priority": "medium"}
    Output: {"ticket": {...}}
    """
    import random

    org_id = input_data.get("organization_id")
    ticket_number = f"TKT-2026-{random.randint(10000, 99999)}"

    ticket = Ticket(
        organization_id=str(org_id) if org_id else None,
        ticket_number=ticket_number,
        subject=input_data.get("subject", "Support Request"),
        description=input_data.get("description", ""),
        customer_id=input_data.get("customer_id"),
        priority=input_data.get("priority", "medium"),
        status="open",
        channel="ai_agent",
    )
    db.add(ticket)
    await db.flush()

    return {
        "ticket": {
            "id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "subject": ticket.subject,
            "status": ticket.status,
            "priority": ticket.priority,
        }
    }


async def crm_search(input_data: dict[str, Any], db: AsyncSession) -> dict:
    """Search CRM records (placeholder — returns customer matches).

    Input: {"query": "...", "type": "customer"}
    Output: {"results": [...]}
    """
    query = input_data.get("query", "")
    org_id = input_data.get("organization_id")

    stmt = select(Customer)
    if org_id:
        stmt = stmt.where(Customer.organization_id == str(org_id))
    if query:
        stmt = stmt.where(
            (Customer.full_name.ilike(f"%{query}%"))
            | (Customer.email.ilike(f"%{query}%"))
            | (Customer.phone.ilike(f"%{query}%"))
        )
    stmt = stmt.limit(20)

    result = await db.execute(stmt)
    customers = result.scalars().all()

    return {
        "results": [
            {
                "id": str(c.id),
                "name": c.full_name,
                "email": c.email,
                "phone": c.phone,
                "type": "customer",
            }
            for c in customers
        ],
        "total": len(customers),
    }


async def send_notification(input_data: dict[str, Any], db: AsyncSession) -> dict:
    """Send a notification to a user (in-app).

    Input: {"user_id": "...", "title": "...", "body": "...", "type": "info"}
    Output: {"notification_id": "..."}
    """
    from app.models.notification import Notification

    notif = Notification(
        user_id=input_data.get("user_id", ""),
        title=input_data.get("title", "Notification"),
        body=input_data.get("body", ""),
        notification_type=input_data.get("type", "info"),
        is_read=False,
    )
    db.add(notif)
    await db.flush()

    return {"notification_id": str(notif.id), "status": "sent"}

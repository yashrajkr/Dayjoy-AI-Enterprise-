"""Customer management endpoints."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate
from app.services.audit import AuditService

router = APIRouter()


@router.get("", response_model=list[CustomerResponse], summary="List customers")
async def list_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[CustomerResponse]:
    """List customers (paginated, with optional search and filter)."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    stmt = select(Customer).where(Customer.organization_id == org_id)
    if search:
        stmt = stmt.where(
            or_(
                Customer.full_name.ilike(f"%{search}%"),
                Customer.email.ilike(f"%{search}%"),
                Customer.phone.ilike(f"%{search}%"),
            )
        )
    if status:
        stmt = stmt.where(Customer.status == status)
    stmt = stmt.offset(skip).limit(limit).order_by(Customer.created_at.desc())

    result = await db.execute(stmt)
    customers = result.scalars().all()
    return [CustomerResponse.model_validate(c) for c in customers]


@router.get("/{customer_id}", response_model=CustomerResponse, summary="Get a customer")
async def get_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> CustomerResponse:
    """Get a customer by ID."""
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise NotFoundError("Customer", str(customer_id))
    return CustomerResponse.model_validate(customer)


@router.post(
    "",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a customer",
)
async def create_customer(
    request: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> CustomerResponse:
    """Create a new customer."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    customer = Customer(
        organization_id=org_id,
        **request.model_dump(),
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)

    audit = AuditService(db)
    await audit.log(
        action="customer.create",
        actor_id=user.id,
        organization_id=org_id,
        resource_type="customer",
        resource_id=customer.id,
    )

    return CustomerResponse.model_validate(customer)


@router.patch("/{customer_id}", response_model=CustomerResponse, summary="Update a customer")
async def update_customer(
    customer_id: uuid.UUID,
    request: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> CustomerResponse:
    """Update a customer."""
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise NotFoundError("Customer", str(customer_id))

    updates = request.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(customer, key, value)

    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.delete(
    "/{customer_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a customer"
)
async def delete_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> None:
    """Delete a customer."""
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise NotFoundError("Customer", str(customer_id))
    await db.delete(customer)
    await db.commit()

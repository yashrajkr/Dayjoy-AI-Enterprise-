"""Product management endpoints."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.product import Category, Product
from app.schemas.business import (
    CategoryCreate,
    CategoryResponse,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
)

router = APIRouter()


# ===== Categories =====


@router.get("/categories", response_model=list[CategoryResponse], summary="List categories")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[CategoryResponse]:
    """List product categories."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    result = await db.execute(
        select(Category).where(Category.organization_id == org_id).order_by(Category.sort_order)
    )
    return [CategoryResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    request: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> CategoryResponse:
    """Create a product category."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    slug = request.slug or request.name.lower().replace(" ", "-")
    cat = Category(organization_id=org_id, slug=slug, **request.model_dump(exclude={"slug"}))
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return CategoryResponse.model_validate(cat)


# ===== Products =====


@router.get("", response_model=list[ProductResponse], summary="List products")
async def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    status: str | None = None,
    category_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[ProductResponse]:
    """List products (paginated, with optional search and filter)."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    stmt = select(Product).where(Product.organization_id == org_id)
    if search:
        stmt = stmt.where(
            or_(
                Product.name.ilike(f"%{search}%"),
                Product.sku.ilike(f"%{search}%"),
                Product.short_description.ilike(f"%{search}%"),
            )
        )
    if status:
        stmt = stmt.where(Product.status == status)
    if category_id:
        stmt = stmt.where(Product.category_id == str(category_id))
    stmt = stmt.offset(skip).limit(limit).order_by(Product.created_at.desc())

    result = await db.execute(stmt)
    return [ProductResponse.model_validate(p) for p in result.scalars().all()]


@router.get("/{product_id}", response_model=ProductResponse, summary="Get a product")
async def get_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> ProductResponse:
    """Get a product by ID."""
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product", str(product_id))
    return ProductResponse.model_validate(product)


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a product",
)
async def create_product(
    request: ProductCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> ProductResponse:
    """Create a new product."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    slug = request.slug or request.name.lower().replace(" ", "-")
    product = Product(
        organization_id=org_id,
        slug=slug,
        **request.model_dump(exclude={"slug"}),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return ProductResponse.model_validate(product)


@router.patch("/{product_id}", response_model=ProductResponse, summary="Update a product")
async def update_product(
    product_id: uuid.UUID,
    request: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> ProductResponse:
    """Update a product."""
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product", str(product_id))

    updates = request.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(product, key, value)

    await db.commit()
    await db.refresh(product)
    return ProductResponse.model_validate(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a product")
async def delete_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> None:
    """Delete a product."""
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product", str(product_id))
    await db.delete(product)
    await db.commit()

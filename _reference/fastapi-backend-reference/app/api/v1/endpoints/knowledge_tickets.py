"""Knowledge Base and Ticket endpoints."""

import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.knowledge_article import (
    KnowledgeArticle,
    KnowledgeArticleVersion,
)
from app.models.ticket import Ticket, TicketComment
from app.schemas.business import (
    KnowledgeArticleCreate,
    KnowledgeArticleResponse,
    KnowledgeArticleUpdate,
    TicketCreate,
    TicketResponse,
    TicketUpdate,
)

router = APIRouter()


# ===== Knowledge Base =====


@router.get(
    "/kb/articles", response_model=list[KnowledgeArticleResponse], summary="List KB articles"
)
async def list_kb_articles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[KnowledgeArticleResponse]:
    """List knowledge base articles."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    stmt = select(KnowledgeArticle).where(KnowledgeArticle.organization_id == org_id)
    if search:
        stmt = stmt.where(
            or_(
                KnowledgeArticle.title.ilike(f"%{search}%"),
                KnowledgeArticle.summary.ilike(f"%{search}%"),
            )
        )
    if status:
        stmt = stmt.where(KnowledgeArticle.status == status)
    stmt = stmt.offset(skip).limit(limit).order_by(KnowledgeArticle.created_at.desc())

    result = await db.execute(stmt)
    return [KnowledgeArticleResponse.model_validate(a) for a in result.scalars().all()]


@router.post(
    "/kb/articles", response_model=KnowledgeArticleResponse, status_code=status.HTTP_201_CREATED
)
async def create_kb_article(
    request: KnowledgeArticleCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> KnowledgeArticleResponse:
    """Create a knowledge base article."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    slug = request.slug or request.title.lower().replace(" ", "-")[:200]
    article = KnowledgeArticle(
        organization_id=org_id,
        slug=slug,
        author_id=str(user.id) if user else None,
        **request.model_dump(exclude={"slug"}),
    )
    db.add(article)
    await db.commit()
    await db.refresh(article)
    return KnowledgeArticleResponse.model_validate(article)


@router.get("/kb/articles/{article_id}", response_model=KnowledgeArticleResponse)
async def get_kb_article(
    article_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> KnowledgeArticleResponse:
    """Get a KB article by ID."""
    article = await db.get(KnowledgeArticle, article_id)
    if article is None:
        raise NotFoundError("Article", str(article_id))
    # Increment view count
    article.view_count += 1
    await db.commit()
    await db.refresh(article)
    return KnowledgeArticleResponse.model_validate(article)


@router.patch("/kb/articles/{article_id}", response_model=KnowledgeArticleResponse)
async def update_kb_article(
    article_id: uuid.UUID,
    request: KnowledgeArticleUpdate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> KnowledgeArticleResponse:
    """Update a KB article."""
    article = await db.get(KnowledgeArticle, article_id)
    if article is None:
        raise NotFoundError("Article", str(article_id))

    # Save version history
    old_version = KnowledgeArticleVersion(
        article_id=str(article.id),
        version=article.version,
        title=article.title,
        content=article.content,
        edited_by=str(user.id) if user else None,
        change_summary=f"Updated to v{article.version + 1}",
    )
    db.add(old_version)

    updates = request.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(article, key, value)
    article.version += 1

    await db.commit()
    await db.refresh(article)
    return KnowledgeArticleResponse.model_validate(article)


@router.delete("/kb/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kb_article(
    article_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> None:
    """Delete a KB article."""
    article = await db.get(KnowledgeArticle, article_id)
    if article is None:
        raise NotFoundError("Article", str(article_id))
    await db.delete(article)
    await db.commit()


# ===== Tickets =====


@router.get("/tickets", response_model=list[TicketResponse], summary="List tickets")
async def list_tickets(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: str | None = None,
    priority: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[TicketResponse]:
    """List support tickets."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    if not user_orgs:
        return []
    org_id = user_orgs[0].organization_id

    stmt = select(Ticket).where(Ticket.organization_id == org_id)
    if status:
        stmt = stmt.where(Ticket.status == status)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)
    stmt = stmt.offset(skip).limit(limit).order_by(Ticket.created_at.desc())

    result = await db.execute(stmt)
    return [TicketResponse.model_validate(t) for t in result.scalars().all()]


@router.post("/tickets", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    request: TicketCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> TicketResponse:
    """Create a support ticket."""
    from app.repositories.organization import UserOrganizationRepository

    user_org_repo = UserOrganizationRepository(db)
    user_orgs = await user_org_repo.get_user_organizations(user.id)
    org_id = user_orgs[0].organization_id if user_orgs else None

    # Generate ticket number
    import random

    ticket_number = f"TKT-2026-{random.randint(10000, 99999)}"

    ticket = Ticket(
        organization_id=org_id,
        ticket_number=ticket_number,
        created_by=str(user.id) if user else None,
        **request.model_dump(),
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return TicketResponse.model_validate(ticket)


@router.get("/tickets/{ticket_id}", response_model=TicketResponse)
async def get_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> TicketResponse:
    """Get a ticket by ID."""
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise NotFoundError("Ticket", str(ticket_id))
    return TicketResponse.model_validate(ticket)


@router.patch("/tickets/{ticket_id}", response_model=TicketResponse)
async def update_ticket(
    ticket_id: uuid.UUID,
    request: TicketUpdate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> TicketResponse:
    """Update a ticket (status, priority, assignment, resolution)."""
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise NotFoundError("Ticket", str(ticket_id))

    updates = request.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(ticket, key, value)

    # Handle status transitions
    if updates.get("status") == "resolved" and not ticket.resolved_at:
        from datetime import datetime

        ticket.resolved_at = datetime.now(UTC)
    if updates.get("status") == "closed" and not ticket.closed_at:
        from datetime import datetime

        ticket.closed_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(ticket)
    return TicketResponse.model_validate(ticket)


@router.post("/tickets/{ticket_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_ticket_comment(
    ticket_id: uuid.UUID,
    content: str,
    is_internal: bool = False,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> dict:
    """Add a comment to a ticket."""
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise NotFoundError("Ticket", str(ticket_id))

    comment = TicketComment(
        ticket_id=str(ticket_id),
        author_id=str(user.id) if user else None,
        content=content,
        is_internal=is_internal,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return {"id": str(comment.id), "content": comment.content}

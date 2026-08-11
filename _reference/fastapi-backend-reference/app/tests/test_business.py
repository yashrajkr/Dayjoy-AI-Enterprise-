"""Tests for Phase 3 business modules (Customer, Product, KB, Ticket)."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_password
from app.models.customer import Customer  # noqa: F401
from app.models.knowledge_article import KnowledgeArticle  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.organization import Organization, UserOrganization  # noqa: F401
from app.models.product import Category, Product  # noqa: F401
from app.models.role import Role  # noqa: F401
from app.models.ticket import Ticket  # noqa: F401
from app.models.user import User  # noqa: F401


@pytest_asyncio.fixture
async def test_db():
    """Create in-memory SQLite DB for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        # Seed org, user, role
        org = Organization(name="Test Org", slug="test-org", is_active=True)
        session.add(org)
        await session.flush()

        user = User(
            email="admin@test.com",
            full_name="Admin",
            hashed_password=hash_password("pass123!"),
            is_active=True,
            is_email_verified=True,
        )
        session.add(user)
        await session.flush()

        membership = UserOrganization(
            user_id=str(user.id),
            organization_id=str(org.id),
            role="org_owner",
            is_active=True,
        )
        session.add(membership)
        await session.commit()
        yield session, org, user

    await engine.dispose()


@pytest.mark.integration
class TestCustomerModule:
    """Tests for Customer CRUD."""

    @pytest.mark.asyncio
    async def test_create_customer(self, test_db):
        """Should create a customer."""
        session, org, user = test_db
        customer = Customer(
            organization_id=str(org.id),
            full_name="John Doe",
            email="john@example.com",
            phone="+91-98765-43210",
            status="active",
        )
        session.add(customer)
        await session.commit()
        await session.refresh(customer)
        assert customer.id is not None
        assert customer.full_name == "John Doe"
        assert customer.email == "john@example.com"

    @pytest.mark.asyncio
    async def test_customer_tags_persist(self, test_db):
        """Customer tags should persist as JSON."""
        session, org, user = test_db
        customer = Customer(
            organization_id=str(org.id),
            full_name="Jane Doe",
            tags=["vip", "wholesale"],
        )
        session.add(customer)
        await session.commit()
        await session.refresh(customer)
        assert "vip" in customer.tags
        assert "wholesale" in customer.tags


@pytest.mark.integration
class TestProductModule:
    """Tests for Product CRUD."""

    @pytest.mark.asyncio
    async def test_create_product(self, test_db):
        """Should create a product with PV/BV."""
        session, org, user = test_db
        product = Product(
            organization_id=str(org.id),
            sku="DJ-WP-001",
            name="Wellness Pack",
            slug="wellness-pack",
            price=2500.0,
            pv=250.0,
            bv=200.0,
            status="active",
        )
        session.add(product)
        await session.commit()
        await session.refresh(product)
        assert product.id is not None
        assert product.sku == "DJ-WP-001"
        assert product.pv == 250.0

    @pytest.mark.asyncio
    async def test_create_category(self, test_db):
        """Should create a product category."""
        session, org, user = test_db
        cat = Category(
            organization_id=str(org.id),
            name="Wellness",
            slug="wellness",
            is_active=True,
        )
        session.add(cat)
        await session.commit()
        await session.refresh(cat)
        assert cat.id is not None
        assert cat.name == "Wellness"


@pytest.mark.integration
class TestKnowledgeBaseModule:
    """Tests for KB Article CRUD."""

    @pytest.mark.asyncio
    async def test_create_article(self, test_db):
        """Should create a KB article with Markdown content."""
        session, org, user = test_db
        article = KnowledgeArticle(
            organization_id=str(org.id),
            title="How to use the Wellness Pack",
            slug="wellness-pack-guide",
            content="# Guide\n\nTake 2 tablets daily...",
            status="draft",
            version=1,
            author_id=str(user.id),
        )
        session.add(article)
        await session.commit()
        await session.refresh(article)
        assert article.id is not None
        assert article.title == "How to use the Wellness Pack"
        assert article.status == "draft"
        assert article.version == 1


@pytest.mark.integration
class TestTicketModule:
    """Tests for Ticket CRUD."""

    @pytest.mark.asyncio
    async def test_create_ticket(self, test_db):
        """Should create a support ticket."""
        session, org, user = test_db
        ticket = Ticket(
            organization_id=str(org.id),
            ticket_number="TKT-2026-00001",
            subject="Product not delivered",
            description="I ordered Wellness Pack 5 days ago but haven't received it.",
            priority="high",
            status="open",
            channel="web",
            created_by=str(user.id),
        )
        session.add(ticket)
        await session.commit()
        await session.refresh(ticket)
        assert ticket.id is not None
        assert ticket.ticket_number == "TKT-2026-00001"
        assert ticket.priority == "high"
        assert ticket.status == "open"


@pytest.mark.integration
class TestNotificationModule:
    """Tests for Notification."""

    @pytest.mark.asyncio
    async def test_create_notification(self, test_db):
        """Should create a notification."""
        session, org, user = test_db
        notif = Notification(
            recipient_user_id=str(user.id),
            organization_id=str(org.id),
            channel="in_app",
            recipient=str(user.id),
            subject="Welcome!",
            body_text="Welcome to Dayjoy AI Platform.",
            status="delivered",
        )
        session.add(notif)
        await session.commit()
        await session.refresh(notif)
        assert notif.id is not None
        assert notif.subject == "Welcome!"


@pytest.mark.integration
class TestMultiTenantIsolation:
    """Tests for multi-tenant data isolation."""

    @pytest.mark.asyncio
    async def test_customer_isolated_by_org(self, test_db):
        """Customers from one org should not be visible to another org."""
        session, org, user = test_db

        # Create second org
        org2 = Organization(name="Other Org", slug="other-org", is_active=True)
        session.add(org2)
        await session.flush()

        # Customer in org1
        cust1 = Customer(organization_id=str(org.id), full_name="Org1 Customer")
        session.add(cust1)

        # Customer in org2
        cust2 = Customer(organization_id=str(org2.id), full_name="Org2 Customer")
        session.add(cust2)
        await session.commit()

        # Query org1 customers only
        from sqlalchemy import select

        result = await session.execute(
            select(Customer).where(Customer.organization_id == str(org.id))
        )
        org1_customers = result.scalars().all()
        assert len(org1_customers) == 1
        assert org1_customers[0].full_name == "Org1 Customer"

"""Tests for auth flows (register, login, refresh, password reset).

These are unit tests that test the AuthService logic directly.
They use an in-memory SQLite DB for isolation (no Postgres needed).
"""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base
from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.email_verification_token import EmailVerificationToken  # noqa: F401
from app.models.organization import Organization, UserOrganization  # noqa: F401
from app.models.password_reset_token import PasswordResetToken  # noqa: F401
from app.models.permission import Permission, RolePermission  # noqa: F401
from app.models.refresh_token import RefreshToken  # noqa: F401
from app.models.role import Role, UserRole  # noqa: F401
from app.models.session import Session  # noqa: F401
from app.models.user import User  # noqa: F401
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
)
from app.services.auth import AuthService

# ===== Fixtures =====


@pytest_asyncio.fixture
async def test_db():
    """Create an in-memory SQLite DB for testing.

    Uses a single connection (via StaticPool) to keep the in-memory DB alive
    across multiple sessions within the same test.
    """
    from sqlalchemy.pool import StaticPool

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
        # Seed a default role
        role = Role(
            name="org_owner",
            display_name="Organization Owner",
            description="Full access to their organization",
            is_system=True,
            scope="global",
            priority=90,
        )
        session.add(role)
        await session.commit()
        yield session

    await engine.dispose()


@pytest.fixture
def sample_register_data():
    """Sample registration data."""
    return RegisterRequest(
        email="test@dayjoyai.com",
        password="StrongPass123!",
        full_name="Test User",
        phone="+91-98765-43210",
        organization_name="Dayjoy Marketing",
    )


# ===== Password Tests =====


@pytest.mark.unit
class TestPasswordHashing:
    """Tests for password hashing."""

    def test_hash_returns_bcrypt(self) -> None:
        h = hash_password("test123")
        assert h.startswith("$2b$")

    def test_verify_correct(self) -> None:
        h = hash_password("mysecret")
        assert verify_password("mysecret", h) is True

    def test_verify_incorrect(self) -> None:
        h = hash_password("mysecret")
        assert verify_password("wrong", h) is False

    def test_verify_empty(self) -> None:
        h = hash_password("mysecret")
        assert verify_password("", h) is False

    def test_different_hashes_for_same_password(self) -> None:
        h1 = hash_password("test123")
        h2 = hash_password("test123")
        assert h1 != h2


# ===== JWT Tests =====


@pytest.mark.unit
class TestJWT:
    """Tests for JWT creation and verification."""

    def test_create_access_token(self) -> None:
        token = create_access_token("user-123")
        assert isinstance(token, str)
        assert token.count(".") == 2  # header.payload.signature

    def test_decode_token(self) -> None:
        token = create_access_token("user-123", claims={"role": "admin"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"
        assert payload["role"] == "admin"
        assert payload["type"] == "access"

    def test_decode_invalid_token(self) -> None:
        assert decode_token("invalid") is None
        assert decode_token("") is None


# ===== Auth Service Tests =====


@pytest.mark.integration
class TestAuthService:
    """Integration tests for AuthService (uses in-memory DB)."""

    @pytest.mark.asyncio
    async def test_register_creates_user(self, test_db, sample_register_data):
        """Register should create a user."""
        auth = AuthService(test_db)
        user, token = await auth.register(sample_register_data)
        assert user.email == "test@dayjoyai.com"
        assert user.full_name == "Test User"
        assert token.access_token is not None
        assert token.refresh_token is not None

    @pytest.mark.asyncio
    async def test_register_creates_organization(self, test_db, sample_register_data):
        """Register should create an organization when organization_name is provided."""
        auth = AuthService(test_db)
        user, _ = await auth.register(sample_register_data)
        # User should be associated with an org
        from app.repositories.organization import UserOrganizationRepository

        user_org_repo = UserOrganizationRepository(test_db)
        orgs = await user_org_repo.get_user_organizations(user.id)
        assert len(orgs) == 1
        assert orgs[0].role == "org_owner"

    @pytest.mark.asyncio
    async def test_register_duplicate_email_raises_conflict(self, test_db, sample_register_data):
        """Registering with an existing email should raise ConflictError."""
        auth = AuthService(test_db)
        await auth.register(sample_register_data)

        # Try to register again with same email
        with pytest.raises(ConflictError):
            await auth.register(sample_register_data)

    @pytest.mark.asyncio
    async def test_login_success(self, test_db, sample_register_data):
        """Login with correct credentials should return tokens."""
        auth = AuthService(test_db)
        await auth.register(sample_register_data)

        login_req = LoginRequest(
            email="test@dayjoyai.com",
            password="StrongPass123!",
        )
        user, token = await auth.login(login_req)
        assert user.email == "test@dayjoyai.com"
        assert token.access_token is not None

    @pytest.mark.asyncio
    async def test_login_wrong_password_raises_auth_error(self, test_db, sample_register_data):
        """Login with wrong password should raise AuthenticationError."""
        auth = AuthService(test_db)
        await auth.register(sample_register_data)

        login_req = LoginRequest(
            email="test@dayjoyai.com",
            password="WrongPassword123!",
        )
        with pytest.raises(AuthenticationError):
            await auth.login(login_req)

    @pytest.mark.asyncio
    async def test_login_nonexistent_user_raises_auth_error(self, test_db):
        """Login with non-existent email should raise AuthenticationError."""
        auth = AuthService(test_db)
        login_req = LoginRequest(
            email="nobody@dayjoyai.com",
            password="SomePassword123!",
        )
        with pytest.raises(AuthenticationError):
            await auth.login(login_req)

    @pytest.mark.asyncio
    async def test_refresh_token_rotation(self, test_db, sample_register_data):
        """Refresh token should issue new tokens and invalidate old one."""
        auth = AuthService(test_db)
        _, token = await auth.register(sample_register_data)

        # Refresh
        new_token = await auth.refresh(token.refresh_token)
        assert new_token.access_token is not None
        assert new_token.refresh_token != token.refresh_token

        # Old refresh token should be invalid
        with pytest.raises(AuthenticationError):
            await auth.refresh(token.refresh_token)

    @pytest.mark.asyncio
    async def test_forgot_password_generates_token(self, test_db, sample_register_data):
        """Forgot password should generate a reset token."""
        auth = AuthService(test_db)
        await auth.register(sample_register_data)

        token = await auth.forgot_password(ForgotPasswordRequest(email="test@dayjoyai.com"))
        assert token  # non-empty string

    @pytest.mark.asyncio
    async def test_forgot_password_nonexistent_user_returns_empty(self, test_db):
        """Forgot password for non-existent user should return empty (no leak)."""
        auth = AuthService(test_db)
        token = await auth.forgot_password(ForgotPasswordRequest(email="nobody@dayjoyai.com"))
        assert token == ""

    @pytest.mark.asyncio
    async def test_reset_password_success(self, test_db, sample_register_data):
        """Reset password with valid token should change password."""
        auth = AuthService(test_db)
        await auth.register(sample_register_data)

        reset_token = await auth.forgot_password(ForgotPasswordRequest(email="test@dayjoyai.com"))

        await auth.reset_password(
            ResetPasswordRequest(
                token=reset_token,
                new_password="NewStrongPass456!",
            )
        )

        # Should be able to login with new password
        user, _ = await auth.login(
            LoginRequest(
                email="test@dayjoyai.com",
                password="NewStrongPass456!",
            )
        )
        assert user.email == "test@dayjoyai.com"

    @pytest.mark.asyncio
    async def test_change_password_success(self, test_db, sample_register_data):
        """Change password with correct current password should work."""
        auth = AuthService(test_db)
        user, _ = await auth.register(sample_register_data)

        await auth.change_password(
            user.id,
            ChangePasswordRequest(
                current_password="StrongPass123!",
                new_password="NewStrongPass456!",
            ),
        )

        # Should be able to login with new password
        user, _ = await auth.login(
            LoginRequest(
                email="test@dayjoyai.com",
                password="NewStrongPass456!",
            )
        )
        assert user.email == "test@dayjoyai.com"

    @pytest.mark.asyncio
    async def test_change_password_wrong_current_raises(self, test_db, sample_register_data):
        """Change password with wrong current password should raise."""
        auth = AuthService(test_db)
        user, _ = await auth.register(sample_register_data)

        with pytest.raises(AuthenticationError):
            await auth.change_password(
                user.id,
                ChangePasswordRequest(
                    current_password="WrongCurrent123!",
                    new_password="NewStrongPass456!",
                ),
            )

    @pytest.mark.asyncio
    async def test_brute_force_lockout(self, test_db, sample_register_data):
        """After 5 failed attempts, account should be locked."""
        auth = AuthService(test_db)
        await auth.register(sample_register_data)

        # 5 failed attempts
        for _ in range(5):
            with pytest.raises(AuthenticationError):
                await auth.login(
                    LoginRequest(
                        email="test@dayjoyai.com",
                        password="WrongPassword123!",
                    )
                )

        # 6th attempt — should be locked
        with pytest.raises(AuthenticationError) as exc_info:
            await auth.login(
                LoginRequest(
                    email="test@dayjoyai.com",
                    password="StrongPass123!",  # correct password, but locked
                )
            )
        assert "locked" in str(exc_info.value).lower()

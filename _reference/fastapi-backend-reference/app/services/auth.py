"""Authentication service — full implementation of auth flows.

Phase 2 features:
- register (with optional org creation)
- login (with brute-force protection)
- logout (revoke session + refresh token)
- refresh (token rotation)
- forgot_password / reset_password
- change_password (with history check)
- verify_email
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.core.logging import get_logger
from app.core.password_policy import (
    is_password_in_history,
    validate_password,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_token,
    get_lockout_until,
    hash_password,
    hash_token,
    is_account_locked,
    should_lock_account,
    verify_password,
    verify_token,
)
from app.models.user import User
from app.repositories.email_verification import EmailVerificationTokenRepository
from app.repositories.organization import OrganizationRepository, UserOrganizationRepository
from app.repositories.password_reset import PasswordResetTokenRepository
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.role import RoleRepository, UserRoleRepository
from app.repositories.session import SessionRepository
from app.repositories.user import UserRepository
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
)
from app.schemas.token import Token
from app.schemas.user import UserResponse
from app.services.audit import AuditService

logger = get_logger(__name__)

# Token expiration times
PASSWORD_RESET_EXPIRY_HOURS = 1
EMAIL_VERIFICATION_EXPIRY_HOURS = 24
PASSWORD_HISTORY_LIMIT = 5


class AuthService:
    """Authentication business logic.

    Coordinates: user repo, session repo, refresh token repo, audit service.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.session_repo = SessionRepository(db)
        self.refresh_token_repo = RefreshTokenRepository(db)
        self.password_reset_repo = PasswordResetTokenRepository(db)
        self.email_verification_repo = EmailVerificationTokenRepository(db)
        self.org_repo = OrganizationRepository(db)
        self.user_org_repo = UserOrganizationRepository(db)
        self.role_repo = RoleRepository(db)
        self.user_role_repo = UserRoleRepository(db)
        self.audit = AuditService(db)

    # ===== Registration =====

    async def register(
        self,
        request: RegisterRequest,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[UserResponse, Token]:
        """Register a new user (and optionally a new organization).

        Flow:
        1. Validate password strength
        2. Check email not taken
        3. Hash password
        4. Create user
        5. Create organization (if organization_name provided)
        6. Add user to org as 'org_owner'
        7. Assign 'org_owner' role
        8. Create session + tokens
        9. Generate email verification token
        10. Audit log
        """
        # 1. Validate password strength
        validate_password(request.password)

        # 2. Check email not taken
        if await self.user_repo.email_exists(request.email):
            raise ConflictError(f"User with email '{request.email}' already exists")

        # 3. Hash password
        hashed_password = hash_password(request.password)

        # 4. Create user
        user = await self.user_repo.create(
            email=request.email,
            full_name=request.full_name,
            phone=request.phone,
            hashed_password=hashed_password,
            password_history=[hashed_password],
            password_changed_at=datetime.now(UTC),
            is_active=True,
            is_email_verified=False,
        )

        # 5. Create organization (if provided)
        organization_id = None
        if request.organization_name:
            slug = request.organization_name.lower().replace(" ", "-")
            # Ensure slug uniqueness
            base_slug = slug
            counter = 1
            while await self.org_repo.slug_exists(slug):
                slug = f"{base_slug}-{counter}"
                counter += 1

            org = await self.org_repo.create(
                name=request.organization_name,
                slug=slug,
                plan="free",
                is_active=True,
            )
            organization_id = org.id

            # 6. Add user to org as 'org_owner'
            await self.user_org_repo.add_user_to_org(
                user_id=user.id,
                organization_id=org.id,
                role="org_owner",
            )

            # 7. Assign 'org_owner' role
            org_owner_role = await self.role_repo.get_by_name("org_owner")
            if org_owner_role:
                await self.user_role_repo.assign_role(
                    user_id=user.id,
                    role_id=org_owner_role.id,
                    organization_id=org.id,
                )

        # 8. Create session + tokens
        token_data = await self._create_session_and_tokens(
            user=user,
            organization_id=organization_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # 9. Generate email verification token
        await self._create_email_verification_token(user.id)

        # 10. Audit log
        await self.audit.log(
            action="user.register",
            actor_id=user.id,
            actor_email=user.email,
            organization_id=organization_id,
            resource_type="user",
            resource_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"email": request.email, "organization_created": organization_id is not None},
        )

        # Build response
        user_response = UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            is_active=user.is_active,
            is_email_verified=user.is_email_verified,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            updated_at=user.updated_at,
            roles=["org_owner"] if organization_id else [],
        )

        return user_response, token_data

    # ===== Login =====

    async def login(
        self,
        request: LoginRequest,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[UserResponse, Token]:
        """Authenticate a user with email + password.

        Includes brute-force protection:
        - After 5 failed attempts, lock account for 15 minutes
        - Reset counter on successful login
        """
        # 1. Find user
        user = await self.user_repo.get_by_email(request.email)
        if user is None:
            # Don't reveal whether email exists — same error as wrong password
            await self.audit.log(
                action="user.login_failed",
                actor_email=request.email,
                outcome="failure",
                ip_address=ip_address,
                user_agent=user_agent,
                error_message="user_not_found",
                details={"email": request.email},
            )
            raise AuthenticationError("Invalid email or password")

        # 2. Check if account is locked
        if is_account_locked(user.locked_until):
            await self.audit.log(
                action="user.login_failed",
                actor_id=user.id,
                actor_email=user.email,
                outcome="failure",
                ip_address=ip_address,
                user_agent=user_agent,
                error_message="account_locked",
                details={
                    "locked_until": user.locked_until.isoformat() if user.locked_until else None
                },
            )
            raise AuthenticationError(
                f"Account locked. Try again after {user.locked_until.isoformat() if user.locked_until else 'later'}"
            )

        # 3. Verify password
        if not user.hashed_password or not verify_password(request.password, user.hashed_password):
            # Increment failed attempts
            failed = await self.user_repo.increment_failed_login(user.id)
            if should_lock_account(failed):
                locked_until = get_lockout_until(failed)
                if locked_until:
                    await self.user_repo.lock_account(user.id, locked_until)

            await self.audit.log(
                action="user.login_failed",
                actor_id=user.id,
                actor_email=user.email,
                outcome="failure",
                ip_address=ip_address,
                user_agent=user_agent,
                error_message="invalid_password",
                details={"failed_attempts": failed},
            )
            raise AuthenticationError("Invalid email or password")

        # 4. Check account is active
        if not user.is_active:
            await self.audit.log(
                action="user.login_failed",
                actor_id=user.id,
                actor_email=user.email,
                outcome="failure",
                ip_address=ip_address,
                user_agent=user_agent,
                error_message="account_inactive",
            )
            raise AuthenticationError("Account is inactive. Contact your administrator.")

        # 5. Update last login
        await self.user_repo.update_last_login(user.id, ip_address)
        # Refresh user to get updated last_login_at
        await self.db.refresh(user)

        # 6. Get user's primary organization (first one)
        user_orgs = await self.user_org_repo.get_user_organizations(user.id)
        organization_id = user_orgs[0].organization_id if user_orgs else None

        # 7. Create session + tokens
        token_data = await self._create_session_and_tokens(
            user=user,
            organization_id=organization_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # 8. Get user roles
        user_roles = await self.user_role_repo.get_user_roles(user.id, organization_id)
        role_names = []
        for ur in user_roles:
            role = await self.role_repo.get_by_id(uuid.UUID(ur.role_id))
            if role:
                role_names.append(role.name)

        # 9. Audit log
        await self.audit.log(
            action="user.login",
            actor_id=user.id,
            actor_email=user.email,
            organization_id=organization_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"method": "password"},
        )

        # Build response
        user_response = UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            is_active=user.is_active,
            is_email_verified=user.is_email_verified,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            updated_at=user.updated_at,
            roles=role_names,
        )

        return user_response, token_data

    # ===== Logout =====

    async def logout(
        self,
        access_token: str,
        refresh_token: str | None = None,
    ) -> None:
        """Logout: revoke session + refresh token."""
        # Decode access token to get JTI
        payload = verify_token(access_token, expected_type="access")
        if payload:
            jti = payload.get("jti")
            if jti:
                await self.session_repo.revoke_by_jti(jti)

            # Audit log
            await self.audit.log(
                action="user.logout",
                actor_id=payload.get("sub"),
                organization_id=payload.get("org"),
            )

        # Revoke refresh token
        if refresh_token:
            token_hash = hash_token(refresh_token)
            await self.refresh_token_repo.revoke(token_hash, reason="logout")

    # ===== Refresh Token =====

    async def refresh(self, refresh_token: str) -> Token:
        """Exchange a refresh token for new tokens (rotation).

        Flow:
        1. Verify refresh token JWT
        2. Look up token in DB by hash
        3. Check token is active + not expired
        4. Revoke old refresh token (rotation)
        5. Issue new access + refresh tokens
        6. Audit log
        """
        # 1. Verify JWT
        payload = verify_token(refresh_token, expected_type="refresh")
        if payload is None:
            raise AuthenticationError("Invalid or expired refresh token")

        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id or not jti:
            raise AuthenticationError("Malformed refresh token")

        # 2. Look up in DB
        token_hash = hash_token(refresh_token)
        stored = await self.refresh_token_repo.get_by_hash(token_hash)
        if stored is None:
            raise AuthenticationError("Refresh token not found")

        # 3. Check active + not expired
        if not stored.is_active:
            # Possible token reuse — revoke all user tokens for safety
            await self.refresh_token_repo.revoke_all_for_user(
                stored.user_id, reason="token_reuse_detected"
            )
            raise AuthenticationError("Refresh token has been revoked (possible reuse detected)")

        # Check expiry (handle timezone-naive datetimes from SQLite)
        rt_exp = stored.expires_at
        if rt_exp.tzinfo is None:
            rt_exp = rt_exp.replace(tzinfo=UTC)
        if rt_exp < datetime.now(UTC):
            await self.refresh_token_repo.revoke(token_hash, reason="expired")
            raise AuthenticationError("Refresh token has expired")

        # 4. Revoke old token (rotation)
        await self.refresh_token_repo.revoke(token_hash, reason="rotation")

        # 5. Get user
        user_id_uuid = uuid.UUID(stored.user_id)
        user = await self.user_repo.get_by_id(user_id_uuid)
        if user is None or not user.is_active:
            raise AuthenticationError("User not found or inactive")

        # 6. Issue new tokens
        org_id = uuid.UUID(stored.organization_id) if stored.organization_id else None
        token_data = await self._create_session_and_tokens(
            user=user,
            organization_id=org_id,
            ip_address=stored.ip_address,
            user_agent=stored.user_agent,
        )

        # 7. Audit log
        await self.audit.log(
            action="user.token_refreshed",
            actor_id=user.id,
            organization_id=org_id,
        )

        return token_data

    # ===== Forgot Password =====

    async def forgot_password(
        self,
        request: ForgotPasswordRequest,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> str:
        """Generate a password reset token (sent via email).

        Returns the raw token (in production, this is emailed, not returned).
        For dev/testing, we return it so the caller can use it.
        """
        user = await self.user_repo.get_by_email(request.email)
        if user is None:
            # Don't reveal whether email exists
            return ""

        # Invalidate any existing tokens
        await self.password_reset_repo.invalidate_all_for_user(user.id)

        # Generate new token
        raw_token = generate_token(32)
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(UTC) + timedelta(hours=PASSWORD_RESET_EXPIRY_HOURS)

        await self.password_reset_repo.create_token(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        await self.audit.log(
            action="user.password_reset_requested",
            actor_id=user.id,
            actor_email=user.email,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return raw_token

    # ===== Reset Password =====

    async def reset_password(
        self,
        request: ResetPasswordRequest,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Reset password using a token from email."""
        # 1. Validate password strength
        validate_password(request.new_password)

        # 2. Look up token
        token_hash = hash_token(request.token)
        token = await self.password_reset_repo.get_by_hash(token_hash)
        if token is None or token.is_used:
            raise AuthenticationError("Invalid or already used reset token")

        # 3. Check expiry
        exp = token.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        if exp < datetime.now(UTC):
            raise AuthenticationError("Reset token has expired")

        # 4. Get user
        user = await self.user_repo.get_by_id(uuid.UUID(token.user_id))
        if user is None:
            raise NotFoundError("User", token.user_id)

        # 5. Check password not in history
        if is_password_in_history(
            request.new_password, user.password_history or [], verify_password
        ):
            raise ValidationError("Password was used recently. Choose a different password.")

        # 6. Update password
        new_hash = hash_password(request.new_password)
        new_history = (user.password_history or [])[-(PASSWORD_HISTORY_LIMIT - 1) :]
        new_history.append(new_hash)

        await self.user_repo.update_password(user.id, new_hash, new_history)

        # 7. Mark token as used
        await self.password_reset_repo.mark_used(token_hash)

        # 8. Revoke all sessions + refresh tokens
        await self.session_repo.revoke_all_user_sessions(user.id)
        await self.refresh_token_repo.revoke_all_for_user(user.id, reason="password_change")

        # 9. Audit log
        await self.audit.log(
            action="user.password_reset",
            actor_id=user.id,
            actor_email=user.email,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    # ===== Change Password =====

    async def change_password(
        self,
        user_id: uuid.UUID,
        request: ChangePasswordRequest,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Change password for an authenticated user."""
        # 1. Get user
        user = await self.user_repo.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User", str(user_id))

        # 2. Verify current password
        if not user.hashed_password or not verify_password(
            request.current_password, user.hashed_password
        ):
            raise AuthenticationError("Current password is incorrect")

        # 3. Validate new password strength
        validate_password(request.new_password)

        # 4. Check new password not same as current
        if verify_password(request.new_password, user.hashed_password):
            raise ValidationError("New password must be different from current password")

        # 5. Check password not in history
        if is_password_in_history(
            request.new_password, user.password_history or [], verify_password
        ):
            raise ValidationError("Password was used recently. Choose a different password.")

        # 6. Update password
        new_hash = hash_password(request.new_password)
        new_history = (user.password_history or [])[-(PASSWORD_HISTORY_LIMIT - 1) :]
        new_history.append(new_hash)

        await self.user_repo.update_password(user.id, new_hash, new_history)

        # 7. Revoke all sessions + refresh tokens (force re-login)
        await self.session_repo.revoke_all_user_sessions(user.id)
        await self.refresh_token_repo.revoke_all_for_user(user.id, reason="password_change")

        # 8. Audit log
        await self.audit.log(
            action="user.password_changed",
            actor_id=user.id,
            actor_email=user.email,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    # ===== Email Verification =====

    async def verify_email(self, token: str) -> None:
        """Verify a user's email using a token from email."""
        # 1. Look up token
        token_hash = hash_token(token)
        stored = await self.email_verification_repo.get_by_hash(token_hash)
        if stored is None or stored.is_used:
            raise AuthenticationError("Invalid or already used verification token")

        # 2. Check expiry
        ev_exp = stored.expires_at
        if ev_exp.tzinfo is None:
            ev_exp = ev_exp.replace(tzinfo=UTC)
        if ev_exp < datetime.now(UTC):
            raise AuthenticationError("Verification token has expired")

        # 3. Mark email as verified
        await self.user_repo.verify_email(uuid.UUID(stored.user_id))

        # 4. Mark token as used
        await self.email_verification_repo.mark_used(token_hash)

        # 5. Audit log
        await self.audit.log(
            action="user.email_verified",
            actor_id=stored.user_id,
            resource_type="user",
            resource_id=stored.user_id,
        )

    async def resend_email_verification(self, user_id: uuid.UUID) -> str:
        """Resend email verification token."""
        # Invalidate existing tokens
        await self.email_verification_repo.invalidate_all_for_user(user_id)
        return await self._create_email_verification_token(user_id)

    # ===== Helper: Create Session + Tokens =====

    async def _create_session_and_tokens(
        self,
        user: User,
        organization_id: uuid.UUID | None,
        ip_address: str | None,
        user_agent: str | None,
    ) -> Token:
        """Create a session, refresh token, and JWT tokens."""
        # Claims shared by access + refresh tokens
        claims = {}
        if organization_id:
            claims["org"] = str(organization_id)

        # 1. Create access token
        access_token = create_access_token(
            subject=user.id,
            claims=claims,
        )

        # 2. Create refresh token
        refresh_token = create_refresh_token(
            subject=user.id,
            claims=claims,
        )

        # 3. Store refresh token in DB (hashed)
        refresh_hash = hash_token(refresh_token)
        refresh_payload = verify_token(refresh_token, expected_type="refresh")
        refresh_expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        if refresh_payload and "exp" in refresh_payload:
            refresh_expires_at = datetime.fromtimestamp(refresh_payload["exp"], tz=UTC)

        await self.refresh_token_repo.create_token(
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=refresh_expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
            organization_id=organization_id,
        )

        # 4. Create session
        access_payload = verify_token(access_token, expected_type="access")
        if access_payload and "jti" in access_payload and "exp" in access_payload:
            session_expires_at = datetime.fromtimestamp(access_payload["exp"], tz=UTC)
            await self.session_repo.create_session(
                user_id=user.id,
                token_jti=access_payload["jti"],
                expires_at=session_expires_at,
                ip_address=ip_address,
                user_agent=user_agent,
                organization_id=organization_id,
                device_type="web",
            )

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def _create_email_verification_token(self, user_id: uuid.UUID) -> str:
        """Create an email verification token and return the raw token."""
        raw_token = generate_token(32)
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(UTC) + timedelta(hours=EMAIL_VERIFICATION_EXPIRY_HOURS)
        await self.email_verification_repo.create_token(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        return raw_token

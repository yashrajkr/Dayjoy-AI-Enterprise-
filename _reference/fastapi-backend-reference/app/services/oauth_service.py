"""OAuth2 service — token issuance, refresh, validation, revocation.

Implements RFC 6749 authorization_code + client_credentials + refresh_token grants.
Issues JWT access tokens (1 hour) + opaque refresh tokens (30 days, hashed at rest).
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AuthenticationError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.marketplace_ecosystem import DeveloperApp, WebhookEventLog
from app.services.marketplace_ecosystem import DeveloperPortalService, _hash_secret

logger = get_logger(__name__)


# In-memory store for authorization codes (in production: Redis with TTL)
# Codes are short-lived (10 min) so an in-memory dict is acceptable for single-instance.
_AUTH_CODES: dict[str, dict[str, Any]] = {}
_REFRESH_TOKENS: dict[str, dict[str, Any]] = {}  # token_hash -> metadata

AUTH_CODE_TTL_SECONDS = 600  # 10 minutes
ACCESS_TOKEN_TTL_MINUTES = 60  # 1 hour
REFRESH_TOKEN_TTL_DAYS = 30


class OAuthService:
    """OAuth2 token issuance, refresh, validation, and revocation."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ====================================================================
    # Authorization Code Flow
    # ====================================================================

    async def create_authorization_code(self, *, client_id: str, user_id: str,
                                         redirect_uri: str, scopes: list[str],
                                         state: str | None = None) -> str:
        """Create a short-lived authorization code (RFC 6749 §4.1)."""
        # Validate client + redirect_uri
        app = await self._get_app_by_client_id(client_id)
        if redirect_uri not in (app.redirect_uris or []):
            raise ValidationError(f"redirect_uri '{redirect_uri}' is not registered")
        # Filter scopes to those allowed for the app
        granted_scopes = [s for s in scopes if s in (app.scopes or [])]
        if not granted_scopes and scopes:
            raise ValidationError("Requested scopes not allowed for this application")
        code = f"djcode_{secrets.token_urlsafe(32)}"
        _AUTH_CODES[code] = {
            "client_id": client_id,
            "user_id": user_id,
            "redirect_uri": redirect_uri,
            "scopes": granted_scopes,
            "state": state,
            "expires_at": datetime.now(UTC) + timedelta(seconds=AUTH_CODE_TTL_SECONDS),
        }
        return code

    async def exchange_authorization_code(self, *, code: str, client_id: str,
                                           client_secret: str,
                                           redirect_uri: str) -> dict[str, Any]:
        """Exchange an authorization code for an access token + refresh token."""
        # Validate client credentials
        app = await self._validate_client(client_id, client_secret)
        # Look up code
        code_data = _AUTH_CODES.get(code)
        if code_data is None:
            raise AuthenticationError("Invalid or expired authorization code")
        if datetime.now(UTC) > code_data["expires_at"]:
            _AUTH_CODES.pop(code, None)
            raise AuthenticationError("Authorization code has expired")
        if code_data["client_id"] != client_id:
            raise AuthenticationError("Authorization code was issued to a different client")
        if code_data["redirect_uri"] != redirect_uri:
            raise AuthenticationError("redirect_uri mismatch")
        # Consume the code (one-time use)
        _AUTH_CODES.pop(code, None)
        return await self._issue_tokens(app=app, user_id=code_data["user_id"],
                                         scopes=code_data["scopes"])

    # ====================================================================
    # Client Credentials Flow (machine-to-machine)
    # ====================================================================

    async def exchange_client_credentials(self, *, client_id: str,
                                           client_secret: str,
                                           scopes: list[str] | None = None) -> dict[str, Any]:
        """Exchange client credentials for an access token (RFC 6749 §4.4)."""
        app = await self._validate_client(client_id, client_secret)
        granted_scopes = [s for s in (scopes or []) if s in (app.scopes or [])]
        # Client credentials grant: subject is the app itself, not a user
        return await self._issue_tokens(app=app, user_id=str(app.id),
                                         scopes=granted_scopes, is_client_credentials=True)

    # ====================================================================
    # Refresh Token Flow
    # ====================================================================

    async def refresh_access_token(self, *, refresh_token: str,
                                    client_id: str | None = None) -> dict[str, Any]:
        """Exchange a refresh token for a new access token + refresh token."""
        token_hash = _hash_secret(refresh_token)
        token_data = _REFRESH_TOKENS.get(token_hash)
        if token_data is None:
            raise AuthenticationError("Invalid or revoked refresh token")
        if datetime.now(UTC) > token_data["expires_at"]:
            _REFRESH_TOKENS.pop(token_hash, None)
            raise AuthenticationError("Refresh token has expired")
        if client_id and token_data["client_id"] != client_id:
            raise AuthenticationError("Refresh token was issued to a different client")
        # Rotate: invalidate old refresh token + issue new pair
        _REFRESH_TOKENS.pop(token_hash, None)
        app_q = await self.db.execute(
            select(DeveloperApp).where(DeveloperApp.client_id == token_data["client_id"]))
        app = app_q.scalar_one_or_none()
        if app is None or not app.is_active:
            raise AuthenticationError("Application is no longer active")
        return await self._issue_tokens(app=app, user_id=token_data["user_id"],
                                         scopes=token_data["scopes"])

    # ====================================================================
    # Token Validation (used by API middleware)
    # ====================================================================

    async def validate_access_token(self, token: str) -> dict[str, Any]:
        """Validate a JWT access token issued via OAuth2.

        Returns the decoded claims dict on success; raises AuthenticationError on failure.
        """
        payload = decode_token(token)
        if payload is None:
            raise AuthenticationError("Invalid or expired access token")
        if payload.get("type") != "access":
            raise AuthenticationError("Token is not an access token")
        if payload.get("token_type") != "oauth":
            raise AuthenticationError("Token is not an OAuth2 token")
        # Verify the app is still active
        client_id = payload.get("client_id")
        if client_id:
            app_q = await self.db.execute(
                select(DeveloperApp).where(DeveloperApp.client_id == client_id))
            app = app_q.scalar_one_or_none()
            if app is None or not app.is_active:
                raise AuthenticationError("Application is no longer active")
            # Bump request counter
            await DeveloperPortalService(self.db).record_request(app_id=app.id)
            await self.db.flush()
        return payload

    # ====================================================================
    # Revocation (RFC 7009)
    # ====================================================================

    async def revoke_token(self, *, token: str, client_id: str | None = None) -> bool:
        """Revoke an access token or refresh token."""
        # Try refresh token first (opaque)
        token_hash = _hash_secret(token)
        if token_hash in _REFRESH_TOKENS:
            data = _REFRESH_TOKENS.pop(token_hash)
            if client_id and data["client_id"] != client_id:
                # Re-add — caller is not the owner
                _REFRESH_TOKENS[token_hash] = data
                raise ValidationError("Token was issued to a different client")
            return True
        # Try access token (JWT) — we can't truly revoke a JWT without a blocklist,
        # but we can warn. In production, add a Redis-based JTI blocklist.
        payload = decode_token(token)
        if payload and payload.get("type") == "access":
            logger.info("access_token_revoked", jti=payload.get("jti"),
                        client_id=payload.get("client_id"))
            return True
        return False

    # ====================================================================
    # Helpers
    # ====================================================================

    async def _get_app_by_client_id(self, client_id: str) -> DeveloperApp:
        result = await self.db.execute(
            select(DeveloperApp).where(DeveloperApp.client_id == client_id,
                                       DeveloperApp.is_active.is_(True)))
        app = result.scalar_one_or_none()
        if app is None:
            raise AuthenticationError(f"Unknown client_id: {client_id}")
        return app

    async def _validate_client(self, client_id: str,
                                client_secret: str) -> DeveloperApp:
        """Validate client credentials using constant-time comparison."""
        app = await self._get_app_by_client_id(client_id)
        provided_hash = _hash_secret(client_secret)
        # Constant-time comparison
        import hmac
        if not hmac.compare_digest(app.client_secret_hash, provided_hash):
            raise AuthenticationError("Invalid client credentials")
        return app

    async def _issue_tokens(self, *, app: DeveloperApp, user_id: str,
                             scopes: list[str], is_client_credentials: bool = False
                             ) -> dict[str, Any]:
        """Issue an access token + refresh token pair."""
        # Access token: JWT with OAuth2 marker claims
        access_claims = {
            "client_id": app.client_id,
            "app_id": str(app.id),
            "organization_id": app.organization_id,
            "scopes": scopes,
            "token_type": "oauth",
            "grant_type": "client_credentials" if is_client_credentials else "authorization_code",
        }
        access_token = create_access_token(
            subject=user_id, claims=access_claims,
            expires_delta=timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES))
        # Refresh token: opaque, hashed at rest, stored in memory (production: Redis)
        raw_refresh = f"djref_{secrets.token_urlsafe(48)}"
        _REFRESH_TOKENS[_hash_secret(raw_refresh)] = {
            "client_id": app.client_id,
            "app_id": str(app.id),
            "user_id": user_id,
            "organization_id": app.organization_id,
            "scopes": scopes,
            "expires_at": datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_TTL_DAYS),
        }
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": ACCESS_TOKEN_TTL_MINUTES * 60,
            "refresh_token": raw_refresh,
            "scope": " ".join(scopes),
        }


def cleanup_expired_codes_and_tokens() -> int:
    """Periodic cleanup — call from a background worker.

    Removes expired authorization codes and refresh tokens from in-memory stores.
    Returns the number of items cleaned up.
    """
    now = datetime.now(UTC)
    expired_codes = [k for k, v in _AUTH_CODES.items() if now > v["expires_at"]]
    for k in expired_codes:
        _AUTH_CODES.pop(k, None)
    expired_tokens = [k for k, v in _REFRESH_TOKENS.items() if now > v["expires_at"]]
    for k in expired_tokens:
        _REFRESH_TOKENS.pop(k, None)
    return len(expired_codes) + len(expired_tokens)

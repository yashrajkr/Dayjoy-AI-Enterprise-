"""Connector OAuth flow helpers — authorization code grant + token refresh.

Implements the OAuth2 authorization code flow for connectors like Salesforce,
Slack, GitHub, etc. Each connector defines its own authorize_url, token_url,
scopes, and PKCE requirements via the auth_config field on EcosystemConnector.

Flow:
1. User clicks "Connect" in the UI
2. Backend builds authorize_url + state, redirects user
3. User authenticates with provider, provider redirects back with code
4. Backend exchanges code for access_token + refresh_token
5. Backend stores tokens (encrypted) on the connector instance

This service provides the helpers — the actual HTTP calls use httpx.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.marketplace_ecosystem import EcosystemConnector, EcosystemConnectorInstance
from app.services.marketplace_ecosystem import (
    ConnectorService,
    _encrypt_value,
    _decrypt_value,
    _hash_secret,
)
import json

logger = get_logger(__name__)


# In-memory state store (production: Redis with 10-min TTL)
# Maps state -> { connector_id, organization_id, user_id, code_verifier, redirect_uri }
_OAUTH_STATES: dict[str, dict[str, Any]] = {}


class ConnectorOAuthService:
    """Helpers for the OAuth2 authorization code flow with external providers."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def build_authorization_url(self, *, connector_id: uuid.UUID,
                                 organization_id: uuid.UUID,
                                 user_id: str,
                                 redirect_uri: str,
                                 scopes: list[str] | None = None,
                                 use_pkce: bool = True) -> dict[str, Any]:
        """Build the provider authorization URL + state for the OAuth flow.

        Returns:
            { authorization_url, state, code_verifier (for PKCE) }
        """
        connector = self.db.get_sync(EcosystemConnector, connector_id) if hasattr(self.db, "get_sync") else None
        # We can't easily fetch async here without making this method async.
        # For simplicity, we fetch using a sync session-like approach.
        # In practice, callers should pre-fetch the connector and pass auth_config.
        raise NotImplementedError("Use build_authorization_url_async instead")

    async def build_authorization_url_async(self, *, connector_id: uuid.UUID,
                                              organization_id: uuid.UUID,
                                              user_id: str,
                                              redirect_uri: str,
                                              scopes: list[str] | None = None,
                                              use_pkce: bool = True) -> dict[str, Any]:
        """Async version — fetches the connector + builds the authorize URL."""
        connector = await self.db.get(EcosystemConnector, connector_id)
        if connector is None:
            raise NotFoundError("EcosystemConnector", str(connector_id))
        if connector.auth_type != "oauth2":
            raise ValidationError(f"Connector '{connector.name}' does not use OAuth2")
        auth_config = connector.auth_config or {}
        authorize_url = auth_config.get("authorize_url")
        token_url = auth_config.get("token_url")
        client_id = auth_config.get("client_id")
        default_scopes = auth_config.get("scopes", [])
        if not authorize_url or not client_id:
            raise ValidationError(
                f"Connector '{connector.name}' auth_config is missing authorize_url or client_id")
        # Build state
        state = secrets.token_urlsafe(32)
        code_verifier: str | None = None
        code_challenge: str | None = None
        if use_pkce and auth_config.get("pkce", True):
            code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii").rstrip("=")
            challenge_bytes = hashlib.sha256(code_verifier.encode("ascii")).digest()
            code_challenge = base64.urlsafe_b64encode(challenge_bytes).decode("ascii").rstrip("=")
        # Store state
        _OAUTH_STATES[state] = {
            "connector_id": str(connector_id),
            "organization_id": str(organization_id),
            "user_id": user_id,
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
            "token_url": token_url,
            "client_id": client_id,
            "client_secret_encrypted": auth_config.get("client_secret_encrypted"),
            "scopes": scopes or default_scopes,
            "expires_at": None,  # state is short-lived
        }
        # Build URL
        from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse
        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state,
        }
        final_scopes = scopes or default_scopes
        if final_scopes:
            params["scope"] = " ".join(final_scopes)
        if code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"
        # Append query params to authorize_url
        parsed = urlparse(authorize_url)
        existing_params = dict(parse_qsl(parsed.query))
        existing_params.update(params)
        new_query = urlencode(existing_params)
        final_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path,
                                  parsed.params, new_query, parsed.fragment))
        return {
            "authorization_url": final_url,
            "state": state,
            "code_verifier": code_verifier,
            "connector_id": str(connector_id),
        }

    async def exchange_code(self, *, code: str, state: str) -> dict[str, Any]:
        """Exchange an authorization code for an access token.

        Validates state, looks up the connector, exchanges code with provider.
        Returns the new (or updated) connector instance + token info.
        """
        state_data = _OAUTH_STATES.pop(state, None)
        if state_data is None:
            raise ValidationError("Invalid or expired OAuth state")
        connector_id = uuid.UUID(state_data["connector_id"])
        organization_id = uuid.UUID(state_data["organization_id"])
        user_id = state_data["user_id"]
        redirect_uri = state_data["redirect_uri"]
        code_verifier = state_data.get("code_verifier")
        token_url = state_data["token_url"]
        client_id = state_data["client_id"]
        client_secret_encrypted = state_data.get("client_secret_encrypted")
        # Decrypt client secret if present
        client_secret: str | None = None
        if client_secret_encrypted:
            try:
                client_secret = _decrypt_value(client_secret_encrypted)
            except Exception as e:
                logger.warning("oauth_client_secret_decrypt_failed", error=str(e))
        # Build token exchange request
        token_req_data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
        }
        if client_secret:
            token_req_data["client_secret"] = client_secret
        if code_verifier:
            token_req_data["code_verifier"] = code_verifier
        # Make the HTTP request to the provider's token endpoint
        try:
            import httpx
        except ImportError as e:
            raise ValidationError("httpx is required for OAuth code exchange") from e
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(token_url, data=token_req_data,
                                               headers={"Accept": "application/json"})
                if response.status_code >= 400:
                    raise ValidationError(
                        f"OAuth token exchange failed: HTTP {response.status_code}: {response.text[:500]}")
                token_response = response.json()
        except Exception as e:
            if isinstance(e, ValidationError):
                raise
            raise ValidationError(f"OAuth token exchange request failed: {type(e).__name__}: {e}")
        # Validate token response
        access_token = token_response.get("access_token")
        if not access_token:
            raise ValidationError("OAuth token response missing access_token")
        refresh_token = token_response.get("refresh_token")
        expires_in = token_response.get("expires_in", 3600)
        token_type = token_response.get("token_type", "Bearer")
        scope_returned = token_response.get("scope", "")
        # Build credentials dict for storage
        credentials = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": token_type,
            "expires_in": expires_in,
            "expires_at": _compute_expiry(expires_in),
            "scope": scope_returned,
        }
        # Create or update the connector instance
        svc = ConnectorService(self.db)
        connector = await svc.get_connector(connector_id=connector_id)
        instance_name = f"{connector.name} (OAuth)"
        # Try to find existing instance with this name
        existing_q = await self.db.execute(
            select(EcosystemConnectorInstance).where(
                EcosystemConnectorInstance.organization_id == str(organization_id),
                EcosystemConnectorInstance.name == instance_name))
        existing = existing_q.scalar_one_or_none()
        if existing:
            instance = await svc.update_instance(
                instance_id=existing.id, organization_id=organization_id,
                credentials=credentials, status="active")
        else:
            instance = await svc.create_instance(
                connector_id=connector_id, organization_id=organization_id,
                name=instance_name, auth_type="oauth2",
                credentials=credentials, installed_by=user_id)
        return {
            "instance_id": str(instance.id),
            "connector_id": str(connector_id),
            "connector_name": connector.name,
            "token_type": token_type,
            "expires_in": expires_in,
            "scope": scope_returned,
            "has_refresh_token": refresh_token is not None,
        }

    async def refresh_token(self, *, instance_id: uuid.UUID,
                              organization_id: uuid.UUID) -> dict[str, Any]:
        """Refresh the access token for a connector instance using its refresh_token."""
        svc = ConnectorService(self.db)
        instance = await svc.get_instance(instance_id=instance_id, organization_id=organization_id)
        if instance.auth_type != "oauth2":
            raise ValidationError("Instance does not use OAuth2")
        credentials = await svc.get_credentials(instance_id=instance_id, organization_id=organization_id)
        refresh_token = credentials.get("refresh_token")
        if not refresh_token:
            raise ValidationError("Instance has no refresh_token — user must re-authenticate")
        connector = await svc.get_connector(connector_id=instance.connector_id)
        auth_config = connector.auth_config or {}
        token_url = auth_config.get("token_url")
        client_id = auth_config.get("client_id")
        client_secret_encrypted = auth_config.get("client_secret_encrypted")
        client_secret: str | None = None
        if client_secret_encrypted:
            try:
                client_secret = _decrypt_value(client_secret_encrypted)
            except Exception:
                pass
        if not token_url or not client_id:
            raise ValidationError("Connector auth_config missing token_url or client_id")
        # Make refresh request
        try:
            import httpx
        except ImportError as e:
            raise ValidationError("httpx is required for OAuth token refresh") from e
        refresh_data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
        }
        if client_secret:
            refresh_data["client_secret"] = client_secret
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(token_url, data=refresh_data,
                                               headers={"Accept": "application/json"})
                if response.status_code >= 400:
                    raise ValidationError(
                        f"OAuth refresh failed: HTTP {response.status_code}: {response.text[:500]}")
                token_response = response.json()
        except Exception as e:
            if isinstance(e, ValidationError):
                raise
            raise ValidationError(f"OAuth refresh request failed: {type(e).__name__}: {e}")
        access_token = token_response.get("access_token")
        if not access_token:
            raise ValidationError("OAuth refresh response missing access_token")
        # Some providers rotate refresh tokens — use new one if provided
        new_refresh = token_response.get("refresh_token", refresh_token)
        expires_in = token_response.get("expires_in", 3600)
        # Update credentials
        new_credentials = {
            "access_token": access_token,
            "refresh_token": new_refresh,
            "token_type": token_response.get("token_type", "Bearer"),
            "expires_in": expires_in,
            "expires_at": _compute_expiry(expires_in),
            "scope": token_response.get("scope", credentials.get("scope", "")),
        }
        await svc.update_instance(instance_id=instance_id, organization_id=organization_id,
                                    credentials=new_credentials, status="active")
        return {
            "instance_id": str(instance_id),
            "expires_in": expires_in,
            "has_new_refresh_token": new_refresh != refresh_token,
        }


def _compute_expiry(expires_in: int) -> str:
    """Compute the ISO 8601 expiry timestamp from now + expires_in seconds."""
    from datetime import UTC, datetime, timedelta
    return (datetime.now(UTC) + timedelta(seconds=expires_in)).isoformat()

"""OAuth2 endpoints — authorize, token, revoke (RFC 6749 + RFC 7009)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Form, Query, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.exceptions import AuthenticationError, ValidationError
from app.core.response import success
from app.services.oauth_service import OAuthService

router = APIRouter()


# ===== Schemas =====

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    refresh_token: str | None = None
    scope: str


class RevokeRequest(BaseModel):
    token: str
    token_type_hint: str | None = None  # access_token / refresh_token
    client_id: str | None = None


# ===== GET /oauth/authorize — Authorization endpoint =====

@router.get("/authorize", summary="OAuth2 authorization endpoint")
async def authorize(
    response_type: str = Query(...),  # must be "code"
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    scope: str | None = Query(None),
    state: str | None = Query(None),
    user: CurrentUser = None,
    db: DBSession = None,
) -> Any:
    """OAuth2 authorization endpoint (RFC 6749 §3.1).

    Returns a redirect to the client's redirect_uri with `code` + `state` query params.
    The user must be authenticated (Bearer JWT) to approve the authorization.
    """
    if response_type != "code":
        raise ValidationError("Only response_type=code is supported")
    svc = OAuthService(db)
    scopes = (scope or "").split() if scope else []
    code = await svc.create_authorization_code(
        client_id=client_id, user_id=str(user.id),
        redirect_uri=redirect_uri, scopes=scopes, state=state)
    await db.commit()
    # Build redirect URL
    sep = "&" if "?" in redirect_uri else "?"
    location = f"{redirect_uri}{sep}code={code}"
    if state:
        location += f"&state={state}"
    return RedirectResponse(url=location, status_code=status.HTTP_302_FOUND)


# ===== POST /oauth/token — Token endpoint =====

@router.post("/token", summary="OAuth2 token endpoint", response_model=TokenResponse)
async def token(
    grant_type: str = Form(...),
    code: str | None = Form(None),
    redirect_uri: str | None = Form(None),
    client_id: str | None = Form(None),
    client_secret: str | None = Form(None),
    refresh_token: str | None = Form(None),
    scope: str | None = Form(None),
    db: DBSession = None,
) -> dict[str, Any]:
    """OAuth2 token endpoint (RFC 6749 §3.2).

    Supports three grant types:
    - authorization_code: exchange code for access + refresh token
    - client_credentials: machine-to-machine access token (no user)
    - refresh_token: rotate refresh token + issue new access token
    """
    svc = OAuthService(db)
    if grant_type == "authorization_code":
        if not (code and redirect_uri and client_id and client_secret):
            raise ValidationError("authorization_code grant requires code, redirect_uri, client_id, client_secret")
        result = await svc.exchange_authorization_code(
            code=code, client_id=client_id, client_secret=client_secret,
            redirect_uri=redirect_uri)
    elif grant_type == "client_credentials":
        if not (client_id and client_secret):
            raise ValidationError("client_credentials grant requires client_id, client_secret")
        scopes = (scope or "").split() if scope else None
        result = await svc.exchange_client_credentials(
            client_id=client_id, client_secret=client_secret, scopes=scopes)
    elif grant_type == "refresh_token":
        if not refresh_token:
            raise ValidationError("refresh_token grant requires refresh_token")
        result = await svc.refresh_access_token(
            refresh_token=refresh_token, client_id=client_id)
    else:
        raise ValidationError(f"Unsupported grant_type: {grant_type}")
    await db.commit()
    return result


# ===== POST /oauth/revoke — Token revocation (RFC 7009) =====

@router.post("/revoke", summary="OAuth2 token revocation")
async def revoke(request: RevokeRequest,
                 user: CurrentUser = None, db: DBSession = None) -> dict:
    """Revoke an access token or refresh token (RFC 7009)."""
    svc = OAuthService(db)
    revoked = await svc.revoke_token(token=request.token, client_id=request.client_id)
    await db.commit()
    return success({"revoked": revoked})


# ===== GET /oauth/introspect — Token introspection (RFC 7662) =====

@router.post("/introspect", summary="OAuth2 token introspection")
async def introspect(
    token: str = Form(...),
    client_id: str | None = Form(None),
    client_secret: str | None = Form(None),
    user: CurrentUser = None,
    db: DBSession = None,
) -> dict:
    """Introspect a token — returns active + claims (RFC 7662)."""
    svc = OAuthService(db)
    try:
        payload = await svc.validate_access_token(token)
        return success({
            "active": True,
            "client_id": payload.get("client_id"),
            "user_id": payload.get("sub"),
            "scope": " ".join(payload.get("scopes", [])),
            "exp": payload.get("exp"),
            "iat": payload.get("iat"),
            "token_type": "Bearer",
        })
    except AuthenticationError:
        return success({"active": False})


# ===== POST /oauth/cleanup — Internal cleanup endpoint (called by cron) =====

@router.post("/cleanup", summary="Cleanup expired codes and tokens (internal)")
async def cleanup(user: CurrentUser = None, db: DBSession = None) -> dict:
    """Remove expired authorization codes and refresh tokens from the in-memory store."""
    from app.services.oauth_service import cleanup_expired_codes_and_tokens
    cleaned = cleanup_expired_codes_and_tokens()
    return success({"cleaned_up": cleaned})

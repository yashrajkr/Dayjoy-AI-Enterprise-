"""CSRF Protection Middleware — double-submit cookie pattern.

For state-changing requests (POST, PUT, PATCH, DELETE), validates that the
X-CSRF-Token header matches the csrf_token cookie. This prevents cross-site
request forgery attacks.

GET, HEAD, OPTIONS requests are exempt (they should be idempotent).

Usage:
    The middleware is automatically applied in main.py.
    Frontend must include the X-CSRF-Token header in all state-changing requests,
    using the value from the csrf_token cookie set by this middleware.
"""

import secrets
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.logging import get_logger

logger = get_logger(__name__)

# Methods that require CSRF protection
PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Paths exempt from CSRF (webhooks use their own signature verification)
EXEMPT_PATHS = {
    "/api/v1/voice/webhook",
    "/api/v1/telephony/webhook",
    "/api/v1/whatsapp/webhook",
    "/api/v1/health",
    "/health",
    "/metrics",
    "/docs",
    "/openapi.json",
    "/redoc",
}


class CSRFMiddleware(BaseHTTPMiddleware):
    """CSRF protection using double-submit cookie pattern.

    1. On every response, sets a csrf_token cookie (if not present)
    2. On state-changing requests, validates X-CSRF-Token header matches the cookie
    3. Webhook endpoints are exempt (they use HMAC signature verification instead)
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Set CSRF cookie on every response (if not present)
        response = await call_next(request)

        # Only protect state-changing methods
        if request.method in PROTECTED_METHODS:
            path = request.url.path

            # Check if path is exempt
            is_exempt = any(path.startswith(exempt) for exempt in EXEMPT_PATHS)

            if not is_exempt:
                cookie_token = request.cookies.get("csrf_token")
                header_token = request.headers.get("X-CSRF-Token")

                if not cookie_token or not header_token:
                    logger.warning(
                        "csrf_token_missing",
                        path=path,
                        method=request.method,
                        has_cookie=bool(cookie_token),
                        has_header=bool(header_token),
                    )
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "CSRF token missing. Include X-CSRF-Token header."},
                    )

                if not _constant_time_compare(cookie_token, header_token):
                    logger.warning("csrf_token_mismatch", path=path, method=request.method)
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "CSRF token mismatch."},
                    )

        # Set CSRF cookie if not present
        if "csrf_token" not in request.cookies:
            csrf_token = secrets.token_urlsafe(32)
            response.set_cookie(
                key="csrf_token",
                value=csrf_token,
                httponly=False,  # Frontend JS needs to read it
                samesite="lax",
                secure=request.url.scheme == "https",
                max_age=86400,  # 24 hours
            )

        return response


def _constant_time_compare(a: str, b: str) -> bool:
    """Compare two strings in constant time to prevent timing attacks."""
    if len(a) != len(b):
        return False
    result = 0
    for x, y in zip(a, b, strict=True):
        result |= ord(x) ^ ord(y)
    return result == 0

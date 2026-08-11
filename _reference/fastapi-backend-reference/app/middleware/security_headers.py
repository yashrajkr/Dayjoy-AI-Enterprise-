"""Security Headers Middleware — adds enterprise security headers to all responses.

Implements: HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy,
Permissions-Policy, X-XSS-Protection, CORP, COEP, COOP.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds security headers to every HTTP response.

    These headers protect against:
    - Clickjacking (X-Frame-Options: DENY)
    - MIME sniffing (X-Content-Type-Options: nosniff)
    - XSS (X-XSS-Protection: 1; mode=block)
    - Protocol downgrade (Strict-Transport-Security)
    - Information leakage (Referrer-Policy: strict-origin-when-cross-origin)
    - Content injection (Content-Security-Policy)
    - Spectre/Meltdown (Cross-Origin-Resource-Policy: same-origin)
    """

    SECURITY_HEADERS = {
        "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Content-Security-Policy": (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' wss: ws:; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        ),
    }

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in self.SECURITY_HEADERS.items():
            response.headers[header] = value
        return response

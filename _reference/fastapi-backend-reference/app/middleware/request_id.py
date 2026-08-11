"""Request ID middleware.

Generates a unique ID for each request and attaches it to:
- request.state.request_id (for use in handlers)
- response headers (X-Request-ID)
- structured log context (so all logs for a request share an ID)
"""

import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import bind_context, clear_context


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Adds a unique request ID to every request.

    If the client sends an X-Request-ID header, we use that.
    Otherwise, we generate a new UUID4.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        # Get or generate request ID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

        # Attach to request state (accessible in handlers)
        request.state.request_id = request_id

        # Bind to logging context (all logs in this request will include it)
        bind_context(request_id=request_id, path=request.url.path)

        try:
            response = await call_next(request)
        finally:
            # Clear context after request completes
            clear_context()

        # Add to response headers
        response.headers["X-Request-ID"] = request_id
        return response

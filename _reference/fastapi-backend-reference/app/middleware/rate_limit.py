"""Rate Limiting Middleware — per-tenant, per-endpoint rate limiting.

Uses Redis (sliding window) for distributed rate limiting.
Falls back to in-memory if Redis is unavailable.
"""

import time
from collections import defaultdict
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# In-memory fallback (per-process; not suitable for multi-instance prod)
_memory_store: dict[str, list[float]] = defaultdict(list)

# Rate limit rules: {path_prefix: (max_requests, window_seconds)}
RATE_LIMIT_RULES = {
    "/api/v1/auth/login": (10, 60),        # 10 login attempts per minute
    "/api/v1/auth/register": (5, 60),      # 5 registrations per minute
    "/api/v1/auth/forgot-password": (3, 60), # 3 forgot-password per minute
    "/api/v1/ai/chat": (30, 60),           # 30 AI chats per minute
    "/api/v1/ai/": (60, 60),               # 60 AI API calls per minute
    "/api/v1/": (200, 60),                 # 200 general API calls per minute
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-tenant rate limiting middleware.

    Rate limits are applied per IP address (for unauthenticated) or
    per user ID (for authenticated requests).
    """

    def __init__(self, app, redis_client=None):
        super().__init__(app)
        self.redis = redis_client

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip rate limiting for health checks and docs
        path = request.url.path
        if path in ("/health", "/", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        # Find matching rate limit rule
        max_requests, window = 200, 60  # default
        for prefix, (limit, window_sec) in RATE_LIMIT_RULES.items():
            if path.startswith(prefix):
                max_requests, window = limit, window_sec
                break

        # Get rate limit key (IP or user ID from JWT)
        client_ip = self._get_client_ip(request)
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            # Try to extract user ID from JWT for per-user limiting
            try:
                from app.core.security import decode_token
                token = auth_header.replace("Bearer ", "")
                payload = decode_token(token)
                if payload and payload.get("sub"):
                    rate_key = f"rl:user:{payload['sub']}:{path}"
                else:
                    rate_key = f"rl:ip:{client_ip}:{path}"
            except Exception:
                rate_key = f"rl:ip:{client_ip}:{path}"
        else:
            rate_key = f"rl:ip:{client_ip}:{path}"

        # Check rate limit
        allowed, remaining, reset_at = await self._check_rate_limit(
            rate_key, max_requests, window
        )

        if not allowed:
            logger.warning(
                "rate_limit_exceeded",
                key=rate_key,
                path=path,
                limit=max_requests,
                window=window,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "type": "https://docs.dayjoyai.com/errors/rate_limited",
                    "title": "Rate limit exceeded",
                    "status": 429,
                    "detail": f"Rate limit of {max_requests} requests per {window}s exceeded. Try again after {reset_at}s.",
                    "instance": path,
                },
                headers={
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_at),
                    "Retry-After": str(reset_at),
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_at)
        return response

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP, respecting X-Forwarded-For."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def _check_rate_limit(
        self, key: str, max_requests: int, window: int
    ) -> tuple[bool, int, int]:
        """Check rate limit using sliding window.

        Returns: (allowed, remaining, reset_in_seconds)
        """
        now = time.time()
        window_start = now - window

        if self.redis:
            # Redis-based (production)
            try:
                # Remove old entries
                await self.redis.zremrangebyscore(key, 0, window_start)
                # Count current entries
                count = await self.redis.zcard(key)
                if count >= max_requests:
                    oldest = await self.redis.zrange(key, 0, 0, withscores=True)
                    reset_at = int(window - (now - oldest[0][1])) if oldest else window
                    return False, 0, max(reset_at, 1)
                # Add current request
                await self.redis.zadd(key, {str(now): now})
                await self.redis.expire(key, window)
                remaining = max_requests - count - 1
                return True, remaining, window
            except Exception as e:
                logger.warning("redis_rate_limit_failed", error=str(e))
                # Fall through to in-memory

        # In-memory fallback
        entries = _memory_store[key]
        # Remove old entries
        _memory_store[key] = [t for t in entries if t > window_start]
        entries = _memory_store[key]

        if len(entries) >= max_requests:
            oldest = entries[0] if entries else now
            reset_at = int(window - (now - oldest))
            return False, 0, max(reset_at, 1)

        entries.append(now)
        remaining = max_requests - len(entries)
        return True, remaining, window

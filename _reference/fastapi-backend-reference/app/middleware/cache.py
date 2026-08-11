"""Redis caching layer — performance optimization.

Provides:
- Cached responses for expensive operations (AI config, business hours, etc.)
- Distributed cache across instances (via Redis)
- TTL-based cache expiration
- Cache invalidation helpers
- Fallback to in-memory cache if Redis is unavailable

Usage:
    from app.middleware.cache import cached, get_cache, set_cache, delete_cache

    @cached(ttl=300, key_prefix="ai_config")
    async def get_ai_config(org_id: str):
        ...
"""

import functools
import json
import time
from typing import Any, Callable

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# In-memory fallback (per-process)
_memory_cache: dict[str, tuple[Any, float]] = {}

# Redis client (lazy init)
_redis_client: Any = None


def _get_redis():
    """Get Redis client (lazy init). Returns None if Redis unavailable."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis.asyncio as aioredis
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return _redis_client
    except Exception:
        return None


async def get_cache(key: str) -> Any | None:
    """Get a value from cache (Redis first, then in-memory)."""
    # Try Redis first
    redis = _get_redis()
    if redis:
        try:
            value = await redis.get(key)
            if value is not None:
                return json.loads(value)
        except Exception as e:
            logger.warning("redis_get_failed", key=key, error=str(e))

    # Fallback to in-memory
    if key in _memory_cache:
        value, expires_at = _memory_cache[key]
        if time.time() < expires_at:
            return value
        del _memory_cache[key]

    return None


async def set_cache(key: str, value: Any, ttl: int = 300) -> bool:
    """Set a value in cache (Redis + in-memory)."""
    serialized = json.dumps(value, default=str)

    # Redis
    redis = _get_redis()
    if redis:
        try:
            await redis.setex(key, ttl, serialized)
        except Exception as e:
            logger.warning("redis_set_failed", key=key, error=str(e))

    # In-memory
    _memory_cache[key] = (value, time.time() + ttl)
    return True


async def delete_cache(key: str) -> bool:
    """Delete a key from cache."""
    # Redis
    redis = _get_redis()
    if redis:
        try:
            await redis.delete(key)
        except Exception:
            pass

    # In-memory
    _memory_cache.pop(key, None)
    return True


async def invalidate_pattern(pattern: str) -> int:
    """Delete all keys matching a pattern (e.g., 'ai_config:*')."""
    count = 0
    redis = _get_redis()
    if redis:
        try:
            async for key in redis.scan_iter(match=pattern):
                await redis.delete(key)
                count += 1
        except Exception:
            pass

    # In-memory
    keys_to_delete = [k for k in _memory_cache if pattern.replace("*", "") in k]
    for key in keys_to_delete:
        del _memory_cache[key]
        count += 1

    return count


def cached(ttl: int = 300, key_prefix: str = "cache"):
    """Decorator: cache the result of an async function.

    The cache key is built from: key_prefix + function args.
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key
            key_parts = [key_prefix]
            for arg in args[1:]:  # Skip self
                key_parts.append(str(arg))
            for k, v in sorted(kwargs.items()):
                key_parts.append(f"{k}={v}")
            cache_key = ":".join(key_parts)

            # Try cache
            cached_value = await get_cache(cache_key)
            if cached_value is not None:
                return cached_value

            # Execute function
            result = await func(*args, **kwargs)

            # Cache result
            await set_cache(cache_key, result, ttl)

            return result
        return wrapper
    return decorator

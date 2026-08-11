"""Sentry initialization — error tracking integration.

Initializes the Sentry SDK for backend error tracking.
Captures unhandled exceptions, AI failures, and provider errors.

Setup:
1. Create a project at https://sentry.io (or self-host)
2. Copy the DSN from Project Settings → Client Keys
3. Set SENTRY_DSN in your .env
4. Set ENABLE_SENTRY=true
"""

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_sentry_initialized = False


def init_sentry() -> None:
    """Initialize Sentry SDK if configured."""
    global _sentry_initialized
    if _sentry_initialized:
        return
    if not settings.ENABLE_SENTRY or not settings.SENTRY_DSN:
        logger.info("sentry_disabled")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.redis import RedisIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.SENTRY_ENVIRONMENT or settings.ENVIRONMENT,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            profiles_sample_rate=settings.SENTRY_PROFILES_SAMPLE_RATE,
            send_default_pii=settings.SENTRY_SEND_DEFAULT_PII,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
                RedisIntegration(),
            ],
            before_send=_before_send,
        )
        _sentry_initialized = True
        logger.info("sentry_initialized", environment=settings.ENVIRONMENT)
    except ImportError:
        logger.warning("sentry_sdk_not_installed — pip install sentry-sdk[fastapi]")
    except Exception as e:
        logger.error("sentry_init_failed", error=str(e))


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Filter sensitive data before sending to Sentry."""
    # Mask sensitive headers
    if "request" in event and "headers" in event["request"]:
        headers = event["request"]["headers"]
        sensitive_keys = {"authorization", "cookie", "x-api-key", "x-auth-token"}
        for key in list(headers.keys()):
            if key.lower() in sensitive_keys:
                headers[key] = "[REDACTED]"

    # Mask sensitive body fields
    if "request" in event and "data" in event["request"]:
        data = event["request"]["data"]
        if isinstance(data, dict):
            for key in list(data.keys()):
                if any(s in key.lower() for s in ("password", "token", "secret", "key", "auth")):
                    data[key] = "[REDACTED]"

    return event


def capture_exception(exc: Exception, **context: Any) -> None:
    """Capture an exception with optional context."""
    if not _sentry_initialized:
        return
    try:
        import sentry_sdk
        if context:
            with sentry_sdk.push_scope() as scope:
                for key, value in context.items():
                    scope.set_context(key, value)
                sentry_sdk.capture_exception(exc)
        else:
            sentry_sdk.capture_exception(exc)
    except Exception as e:
        logger.error("sentry_capture_failed", error=str(e))


def capture_message(message: str, level: str = "info", **context: Any) -> None:
    """Capture a message with optional context."""
    if not _sentry_initialized:
        return
    try:
        import sentry_sdk
        sentry_sdk.capture_message(message, level=level)
    except Exception:
        pass

"""Structured logging setup using structlog.

- In development: pretty, colored console output (easy to read)
- In production: structured JSON output (machine-parseable, ships to Datadog/Loki)
"""

import logging
import sys
from typing import Any

import structlog
from structlog.dev import ConsoleRenderer
from structlog.processors import (
    StackInfoRenderer,
    TimeStamper,
    add_log_level,
    format_exc_info,
)
from structlog.stdlib import ProcessorFormatter

from app.core.config import settings


def setup_logging() -> None:
    """Configure structured logging for the application.

    Call this once at application startup (in FastAPI lifespan).
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    # Configure structlog processors
    if settings.ENVIRONMENT == "dev" and settings.LOG_FORMAT == "console":
        # Pretty console output for development
        structlog.configure(
            processors=[
                structlog.contextvars.merge_contextvars,
                TimeStamper(fmt="iso"),
                add_log_level,
                StackInfoRenderer(),
                format_exc_info,
                ConsoleRenderer(colors=True),
            ],
            wrapper_class=structlog.make_filtering_bound_logger(log_level),
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )
    else:
        # JSON output for production (Datadog, Loki, etc.)
        structlog.configure(
            processors=[
                structlog.contextvars.merge_contextvars,
                TimeStamper(fmt="iso"),
                add_log_level,
                StackInfoRenderer(),
                format_exc_info,
                structlog.processors.JSONRenderer(),
            ],
            wrapper_class=structlog.make_filtering_bound_logger(log_level),
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )

    # Configure standard logging to route through structlog
    formatter = ProcessorFormatter(
        processor=structlog.processors.JSONRenderer()
        if settings.ENVIRONMENT != "dev"
        else ConsoleRenderer(colors=True),
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    # Quiet down noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DB_ECHO else logging.WARNING
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance.

    Usage:
        from app.core.logging import get_logger
        logger = get_logger(__name__)
        logger.info("user_logged_in", user_id="123", tenant_id="dayjoy")
    """
    return structlog.get_logger(name)


def bind_context(**kwargs: Any) -> None:
    """Bind context variables that will be included in all subsequent log entries.

    Usage:
        bind_context(request_id="abc-123", user_id="user-456")
        logger.info("processing request")  # will include request_id and user_id
    """
    structlog.contextvars.bind_contextvars(**kwargs)


def clear_context() -> None:
    """Clear all bound context variables."""
    structlog.contextvars.clear_contextvars()

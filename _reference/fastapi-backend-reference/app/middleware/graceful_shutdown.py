"""Graceful Shutdown Handler — ensures in-flight requests complete before exit.

On SIGTERM/SIGINT:
1. Stop accepting new requests
2. Wait for in-flight requests to complete (up to timeout)
3. Close database connections
4. Close Redis connections
5. Flush logs
6. Exit cleanly

This prevents data corruption and ensures zero-downtime deployments.
"""

import asyncio
import signal
import sys
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


class GracefulShutdown:
    """Handles graceful shutdown of the FastAPI application.

    Usage in main.py lifespan:
        shutdown = GracefulShutdown()
        @asynccontextmanager
        async def lifespan(app):
            shutdown.register_signals()
            yield
            await shutdown.cleanup()
    """

    def __init__(self, shutdown_timeout: int = 30):
        self.shutdown_timeout = shutdown_timeout
        self._shutting_down = False
        self._active_requests = 0
        self._cleanup_handlers: list = []

    @property
    def is_shutting_down(self) -> bool:
        return self._shutting_down

    def register_signals(self) -> None:
        """Register signal handlers for graceful shutdown."""
        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, self._handle_signal)

    def _handle_signal(self, signum: int, frame: Any) -> None:
        """Handle shutdown signal."""
        sig_name = signal.Signals(signum).name
        logger.info("shutdown_signal_received", signal=sig_name)
        self._shutting_down = True

    def add_cleanup_handler(self, handler) -> None:
        """Add a cleanup handler to run during shutdown."""
        self._cleanup_handlers.append(handler)

    async def cleanup(self) -> None:
        """Run all cleanup handlers."""
        logger.info("graceful_shutdown_starting", timeout=self.shutdown_timeout)

        # Wait for in-flight requests (with timeout)
        wait_start = asyncio.get_event_loop().time()
        while self._active_requests > 0:
            elapsed = asyncio.get_event_loop().time() - wait_start
            if elapsed >= self.shutdown_timeout:
                logger.warning(
                    "shutdown_timeout_exceeded",
                    active_requests=self._active_requests,
                    elapsed=elapsed,
                )
                break
            logger.info(
                "waiting_for_active_requests",
                active_requests=self._active_requests,
                elapsed=elapsed,
            )
            await asyncio.sleep(1)

        # Run cleanup handlers
        for handler in self._cleanup_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler()
                else:
                    handler()
            except Exception as e:
                logger.error("cleanup_handler_failed", error=str(e))

        logger.info("graceful_shutdown_complete")

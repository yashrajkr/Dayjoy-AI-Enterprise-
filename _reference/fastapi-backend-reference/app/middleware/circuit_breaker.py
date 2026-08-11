"""Circuit Breaker — prevents cascading failures from external service calls.

When a service fails repeatedly, the circuit breaker "trips" and stops
sending requests for a cooldown period. After the cooldown, it allows
a "half-open" test request; if it succeeds, the circuit resets.

States: CLOSED (normal) → OPEN (failing, rejecting) → HALF_OPEN (testing)
"""

import time
from enum import Enum
from typing import Any, Callable

from app.core.logging import get_logger

logger = get_logger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Circuit breaker for external service calls.

    Usage:
        breaker = CircuitBreaker(name="openai", failure_threshold=5, recovery_timeout=60)

        @breaker
        async def call_openai(prompt):
            return await openai.chat.completions.create(...)

    Or manually:
        if breaker.can_execute():
            try:
                result = await call_service()
                breaker.on_success()
            except Exception:
                breaker.on_failure()
        else:
            raise ServiceUnavailableError("Circuit breaker is open")
    """

    def __init__(
        self,
        name: str = "default",
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        half_open_max_calls: int = 3,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float | None = None
        self._half_open_calls = 0

    @property
    def state(self) -> CircuitState:
        """Get current state, transitioning OPEN → HALF_OPEN if recovery time has passed."""
        if self._state == CircuitState.OPEN and self._last_failure_time:
            if time.time() - self._last_failure_time >= self.recovery_timeout:
                self._state = CircuitState.HALF_OPEN
                self._half_open_calls = 0
                logger.info("circuit_breaker_half_open", breaker=self.name)
        return self._state

    def can_execute(self) -> bool:
        """Check if a request can be executed."""
        state = self.state
        if state == CircuitState.CLOSED:
            return True
        if state == CircuitState.HALF_OPEN:
            if self._half_open_calls < self.half_open_max_calls:
                self._half_open_calls += 1
                return True
            return False
        return False  # OPEN

    def on_success(self) -> None:
        """Record a successful call."""
        if self._state == CircuitState.HALF_OPEN:
            self._success_count += 1
            if self._success_count >= self.half_open_max_calls:
                self._reset()
                logger.info("circuit_breaker_closed", breaker=self.name)
        else:
            self._failure_count = 0

    def on_failure(self) -> None:
        """Record a failed call."""
        self._failure_count += 1
        self._last_failure_time = time.time()

        if self._state == CircuitState.HALF_OPEN:
            self._state = CircuitState.OPEN
            logger.warning("circuit_breaker_reopened", breaker=self.name)
        elif self._failure_count >= self.failure_threshold:
            self._state = CircuitState.OPEN
            logger.error(
                "circuit_breaker_opened",
                breaker=self.name,
                failures=self._failure_count,
                threshold=self.failure_threshold,
            )

    def _reset(self) -> None:
        """Reset the circuit breaker to closed state."""
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time = None
        self._half_open_calls = 0

    def get_stats(self) -> dict[str, Any]:
        """Get circuit breaker statistics for monitoring."""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "last_failure_time": self._last_failure_time,
        }


# ===== Pre-configured circuit breakers for external services =====

circuit_breakers: dict[str, CircuitBreaker] = {
    "openai": CircuitBreaker(name="openai", failure_threshold=5, recovery_timeout=60),
    "anthropic": CircuitBreaker(name="anthropic", failure_threshold=5, recovery_timeout=60),
    "deepgram": CircuitBreaker(name="deepgram", failure_threshold=3, recovery_timeout=30),
    "elevenlabs": CircuitBreaker(name="elevenlabs", failure_threshold=3, recovery_timeout=30),
    "twilio": CircuitBreaker(name="twilio", failure_threshold=3, recovery_timeout=30),
    "whatsapp": CircuitBreaker(name="whatsapp", failure_threshold=3, recovery_timeout=60),
    "salesforce": CircuitBreaker(name="salesforce", failure_threshold=5, recovery_timeout=120),
    "redis": CircuitBreaker(name="redis", failure_threshold=10, recovery_timeout=10),
}


def get_circuit_breaker(name: str) -> CircuitBreaker:
    """Get a circuit breaker by name."""
    return circuit_breakers.get(name, CircuitBreaker(name=name))


def get_all_circuit_breaker_stats() -> list[dict[str, Any]]:
    """Get stats for all circuit breakers (for monitoring dashboard)."""
    return [cb.get_stats() for cb in circuit_breakers.values()]

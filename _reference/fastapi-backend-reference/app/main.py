"""FastAPI application entrypoint — Phase 8: Production Hardened.

Production middleware stack (outermost → innermost):
  1. SecurityHeadersMiddleware (add security headers to every response)
  2. RateLimitMiddleware (per-tenant rate limiting)
  3. RequestIDMiddleware (trace every request)
  4. MetricsMiddleware (collect Prometheus metrics)
  5. CORS (allow frontend)
  6. GracefulShutdown (handle SIGTERM cleanly)

Additional production features:
  - /metrics endpoint for Prometheus
  - /health/ready (readiness probe — checks DB + Redis)
  - /health/live (liveness probe — just checks process is alive)
  - Graceful shutdown handler
  - Circuit breakers on external calls
  - Production config validation
"""

from collections.abc import AsyncGenerator
from typing import Any
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import get_logger, setup_logging
from app.middleware.circuit_breaker import get_all_circuit_breaker_stats
from app.middleware.graceful_shutdown import GracefulShutdown
from app.middleware.metrics import MetricsMiddleware, get_metrics_text
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

# ===== Graceful Shutdown Handler =====
shutdown_handler = GracefulShutdown(shutdown_timeout=30)


# ===== Application Lifecycle =====

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown events.

    Startup:
      - Configure structured logging
      - Validate production settings
      - Register signal handlers for graceful shutdown

    Shutdown:
      - Wait for in-flight requests
      - Close database connections
      - Close Redis connections
      - Flush logs
    """
    # === Startup ===
    setup_logging()
    logger = get_logger(__name__)

    # Validate production settings (raises if invalid)
    settings.validate_production()

    # Initialize observability (Sentry + OpenTelemetry)
    try:
        from app.observability import init_sentry, init_tracing
        init_sentry()
        init_tracing()
    except Exception as e:
        logger.warning("observability_init_skipped", error=str(e))

    # Register graceful shutdown signals
    shutdown_handler.register_signals()

    # Add cleanup handlers
    from app.core.database import close_db

    shutdown_handler.add_cleanup_handler(close_db)

    logger.info(
        "application_starting",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        phase="8_production_ready",
    )

    yield

    # === Shutdown ===
    logger.info("application_stopping")
    await shutdown_handler.cleanup()
    logger.info("application_stopped")


# ===== Create App =====

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Enterprise AI Platform — a reusable, multi-tenant, voice-native AI "
        "operating system for enterprises.\n\n"
        "**Phase 8**: Production Ready — Security hardened, observable, scalable."
    ),
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ===== Middleware (order: outermost first) =====

# 1. Security headers (every response gets security headers)
app.add_middleware(SecurityHeadersMiddleware)

# 2. Rate limiting (per IP/user, per endpoint)
app.add_middleware(RateLimitMiddleware)

# 3. Request ID (for tracing)
app.add_middleware(RequestIDMiddleware)

# 4. Metrics collection (Prometheus)
app.add_middleware(MetricsMiddleware)

# 5. CORS (allow frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-RateLimit-Remaining", "X-Response-Time-ms"],
)


# ===== Exception Handlers =====

register_exception_handlers(app)


# ===== Production Endpoints =====


@app.get("/health", tags=["health"], summary="Root health check")
async def root_health() -> dict[str, str]:
    """Simple root health check (no DB)."""
    return {"status": "healthy"}


@app.get("/health/live", tags=["health"], summary="Liveness probe")
async def liveness() -> dict[str, str]:
    """Liveness probe — checks if the process is alive (K8s livenessProbe)."""
    if shutdown_handler.is_shutting_down:
        return {"status": "shutting_down"}
    return {"status": "alive"}


@app.get("/health/ready", tags=["health"], summary="Readiness probe")
async def readiness() -> dict[str, Any]:  # type: ignore[name-defined]
    """Readiness probe — checks if the service is ready to accept traffic.

    Checks: database connectivity, Redis connectivity, circuit breaker states.
    Used by K8s readinessProbe to route traffic only to healthy instances.
    """
    checks: dict[str, str] = {}
    all_healthy = True

    # Check database
    try:
        from sqlalchemy import text
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT 1"))
            result.scalar_one()
        checks["database"] = "healthy"
    except Exception as e:
        checks["database"] = f"unhealthy: {e!s}"
        all_healthy = False

    # Check Redis (if configured)
    try:
        import redis.asyncio as aioredis

        redis = aioredis.from_url(settings.REDIS_URL)
        await redis.ping()
        await redis.close()
        checks["redis"] = "healthy"
    except Exception:
        checks["redis"] = "degraded (non-critical)"

    # Check circuit breakers
    open_breakers = [
        cb["name"] for cb in get_all_circuit_breaker_stats() if cb["state"] == "open"
    ]
    checks["circuit_breakers"] = (
        "all_closed" if not open_breakers else f"open: {', '.join(open_breakers)}"
    )

    status = "ready" if all_healthy else "not_ready"
    from typing import Any as AnyType

    return {"status": status, "checks": checks}


@app.get("/metrics", tags=["monitoring"], summary="Prometheus metrics")
async def prometheus_metrics() -> PlainTextResponse:
    """Prometheus metrics endpoint for scraping."""
    return PlainTextResponse(
        content=get_metrics_text(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


# ===== API Routes =====

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


# ===== Root endpoint =====


@app.get("/", tags=["root"], summary="API root")
async def root() -> dict[str, str]:
    """API root — returns basic info."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "health": "/health",
        "liveness": "/health/live",
        "readiness": "/health/ready",
        "metrics": "/metrics",
    }


# ===== Development-only: print startup banner =====

if settings.is_dev:
    logger = get_logger(__name__)
    logger.info(
        "dev_mode_enabled",
        docs_url="http://localhost:8000/docs",
        health_url="http://localhost:8000/health",
        liveness_url="http://localhost:8000/health/live",
        readiness_url="http://localhost:8000/health/ready",
        metrics_url="http://localhost:8000/metrics",
    )

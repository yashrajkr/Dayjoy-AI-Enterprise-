"""OpenTelemetry distributed tracing initialization.

Sets up OTel tracing with OTLP exporter for distributed tracing across:
- API (FastAPI)
- Database (SQLAlchemy)
- Redis
- HTTP client (httpx)

Traces are sent to the OTLP collector endpoint (configured via OTEL_EXPORTER_ENDPOINT).
The collector can forward to Jaeger, Zipkin, Datadog, or New Relic.

Setup:
1. Deploy an OTLP collector (e.g. otel-collector-contrib)
2. Set OTEL_EXPORTER_ENDPOINT=http://otel-collector:4317
3. Set ENABLE_TRACING=true
"""

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_tracing_initialized = False


def init_tracing() -> None:
    """Initialize OpenTelemetry tracing if configured."""
    global _tracing_initialized
    if _tracing_initialized:
        return
    if not settings.ENABLE_TRACING or not settings.OTEL_EXPORTER_ENDPOINT:
        logger.info("tracing_disabled")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        # Build resource attributes
        attributes = {
            "service.name": settings.OTEL_SERVICE_NAME,
            "service.version": settings.APP_VERSION,
            "deployment.environment": settings.ENVIRONMENT,
        }
        if settings.OTEL_RESOURCE_ATTRIBUTES:
            for pair in settings.OTEL_RESOURCE_ATTRIBUTES.split(","):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    attributes[k.strip()] = v.strip()

        resource = Resource.create(attributes)

        # Create tracer provider
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(
            endpoint=settings.OTEL_EXPORTER_ENDPOINT,
            insecure=True,
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        # Auto-instrument libraries
        # Note: FastAPIInstrumentor must be called after the app is created
        # We store a flag to instrument later in main.py
        logger.info(
            "tracing_initialized",
            endpoint=settings.OTEL_EXPORTER_ENDPOINT,
            service=attributes["service.name"],
        )
        _tracing_initialized = True

    except ImportError:
        logger.warning(
            "opentelemetry_not_installed — pip install opentelemetry-distro "
            "opentelemetry-exporter-otlp opentelemetry-instrumentation-fastapi "
            "opentelemetry-instrumentation-sqlalchemy opentelemetry-instrumentation-redis "
            "opentelemetry-instrumentation-httpx"
        )
    except Exception as e:
        logger.error("tracing_init_failed", error=str(e))


def instrument_app(app: Any) -> None:
    """Instrument a FastAPI app with OpenTelemetry (call after app creation)."""
    if not _tracing_initialized:
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        FastAPIInstrumentor.instrument_app(app)
        SQLAlchemyInstrumentor().instrument(enable_commenter=True)
        RedisInstrumentor().instrument()
        HTTPXClientInstrumentor().instrument()
        logger.info("app_instrumented")
    except Exception as e:
        logger.warning("app_instrumentation_failed", error=str(e))


def get_tracer(name: str = __name__):
    """Get a tracer for manual span creation."""
    if not _tracing_initialized:
        return None
    from opentelemetry import trace
    return trace.get_tracer(name)

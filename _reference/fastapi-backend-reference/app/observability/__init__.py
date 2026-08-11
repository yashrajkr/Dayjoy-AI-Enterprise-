"""Enterprise Observability Platform — Stage 2 Step 7.

Provides:
- Structured JSON logging with secret masking
- Prometheus metrics (extends existing middleware)
- OpenTelemetry distributed tracing
- Sentry error tracking
- Alert engine (rule evaluation + notification)
- Health aggregation
- Performance reporting

Public API:
    from app.observability import ObservabilityService, init_sentry, init_tracing
"""

from app.observability.service import ObservabilityService
from app.observability.sentry_init import init_sentry
from app.observability.tracing import init_tracing

__all__ = ["ObservabilityService", "init_sentry", "init_tracing"]

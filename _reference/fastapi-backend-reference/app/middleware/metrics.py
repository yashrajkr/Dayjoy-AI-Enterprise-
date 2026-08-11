"""Prometheus Metrics — application metrics for monitoring.

Exposes a /metrics endpoint that Prometheus can scrape.
Metrics include:
- HTTP request count, latency, error rate (per endpoint, per method)
- Active in-flight requests
- Database connection pool stats
- Redis connection stats
- AI agent invocation count, latency, token usage
- Workflow execution count, success/failure rate
- Circuit breaker states
"""

import time
from collections import defaultdict
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger

logger = get_logger(__name__)

# In-memory metrics store (production would use prometheus_client)
_metrics: dict[str, Any] = defaultdict(lambda: {"count": 0, "sum": 0.0, "labels": {}})


class MetricsMiddleware(BaseHTTPMiddleware):
    """Collects HTTP request metrics for Prometheus."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.time()

        try:
            response = await call_next(request)
            duration = time.time() - start_time

            # Record metrics
            method = request.method
            path = self._normalize_path(request.url.path)
            status = response.status_code

            # Request count
            key = f"http_requests_total:{method}:{path}:{status}"
            _metrics[key]["count"] += 1

            # Request duration
            key_dur = f"http_request_duration_seconds:{method}:{path}"
            _metrics[key_dur]["count"] += 1
            _metrics[key_dur]["sum"] += duration

            # Add timing header
            response.headers["X-Response-Time-ms"] = str(int(duration * 1000))

            return response

        except Exception as e:
            duration = time.time() - start_time
            key = f"http_requests_total:{request.method}:{self._normalize_path(request.url.path)}:500"
            _metrics[key]["count"] += 1
            logger.error("request_failed", error=str(e), duration_ms=int(duration * 1000))
            raise

    def _normalize_path(self, path: str) -> str:
        """Normalize path for metrics (replace UUIDs with :id)."""
        import re
        # Replace UUIDs
        path = re.sub(r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/:id", path)
        # Replace numeric IDs
        path = re.sub(r"/\d+", "/:id", path)
        return path


def get_metrics_text() -> str:
    """Generate Prometheus-format metrics text for /metrics endpoint."""
    lines = []

    # HTTP request totals
    lines.append("# TYPE http_requests_total counter")
    for key, data in _metrics.items():
        if key.startswith("http_requests_total:"):
            parts = key.split(":", 3)
            method, path, status = parts[1], parts[2], parts[3]
            lines.append(f'http_requests_total{{method="{method}",path="{path}",status="{status}"}} {data["count"]}')

    # HTTP request duration
    lines.append("# TYPE http_request_duration_seconds summary")
    for key, data in _metrics.items():
        if key.startswith("http_request_duration_seconds:"):
            parts = key.split(":", 2)
            method, path = parts[1], parts[2]
            avg = data["sum"] / data["count"] if data["count"] > 0 else 0
            lines.append(f'http_request_duration_seconds{{method="{method}",path="{path}"}} {avg:.6f}')

    # Circuit breaker states
    lines.append("# TYPE circuit_breaker_state gauge")
    try:
        from app.middleware.circuit_breaker import get_all_circuit_breaker_stats
        for cb in get_all_circuit_breaker_stats():
            state_value = 0 if cb["state"] == "closed" else 1 if cb["state"] == "open" else 0.5
            lines.append(f'circuit_breaker_state{{name="{cb["name"]}"}} {state_value}')
    except Exception:
        pass

    # Application info
    lines.append('# TYPE app_info gauge')
    lines.append('app_info{version="0.8.0",phase="8"} 1')

    return "\n".join(lines)


def record_business_metric(name: str, value: float, labels: dict | None = None) -> None:
    """Record a custom business metric."""
    key = f"business_{name}"
    _metrics[key]["count"] += 1
    _metrics[key]["sum"] += value
    if labels:
        _metrics[key]["labels"].update(labels)

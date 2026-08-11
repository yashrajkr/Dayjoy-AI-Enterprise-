"""Health check endpoints.

Used by:
- Docker (HEALTHCHECK)
- Kubernetes (liveness/readiness probes)
- Load balancers (to route traffic only to healthy instances)
- Monitoring (Datadog synthetic checks)
"""

from datetime import UTC, datetime

from fastapi import APIRouter, status
from sqlalchemy import text

from app.api.deps import DBSession, SettingsDep
from app.schemas.health import DatabaseHealthResponse, HealthResponse

router = APIRouter()


@router.get(
    "",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Health check",
    description="Returns 200 if the application is running. Used for liveness probes.",
)
async def health_check(settings: SettingsDep) -> HealthResponse:
    """Basic health check — is the app running?"""
    return HealthResponse(
        status="healthy",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(UTC).isoformat(),
    )


@router.get(
    "/db",
    response_model=DatabaseHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Database health check",
    description="Returns 200 if the database is reachable. Used for readiness probes.",
)
async def health_check_db(db: DBSession) -> DatabaseHealthResponse:
    """Database health check — can we connect to PostgreSQL?"""
    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar_one()
        return DatabaseHealthResponse(status="healthy", database="connected")
    except Exception as e:
        return DatabaseHealthResponse(
            status="unhealthy",
            database=f"error: {type(e).__name__}: {e!s}",
        )

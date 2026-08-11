"""Health check response schema."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Response schema for the /health endpoint."""

    status: str = Field(..., description="Overall health status", examples=["healthy"])
    app: str = Field(..., description="Application name")
    version: str = Field(..., description="Application version")
    environment: str = Field(..., description="Environment name (dev/staging/production)")
    timestamp: str = Field(..., description="Current server time (ISO 8601)")


class DatabaseHealthResponse(BaseModel):
    """Response schema for the /health/db endpoint."""

    status: str = Field(..., examples=["healthy", "unhealthy"])
    database: str = Field(..., examples=["connected", "error: ..."])

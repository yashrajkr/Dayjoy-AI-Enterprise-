"""Tests for the health check endpoints.

Run: uv run pytest app/tests/test_health.py -v
"""

import pytest
from httpx import AsyncClient


@pytest.mark.unit
class TestHealthEndpoint:
    """Tests for GET /health."""

    @pytest.mark.asyncio
    async def test_health_returns_200(self, client: AsyncClient) -> None:
        """Health endpoint should return 200."""
        response = await client.get("/api/v1/health")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_health_returns_status_healthy(self, client: AsyncClient) -> None:
        """Health endpoint should return status=healthy."""
        response = await client.get("/api/v1/health")
        data = response.json()
        assert data["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_health_returns_app_name(self, client: AsyncClient) -> None:
        """Health endpoint should return the app name."""
        response = await client.get("/api/v1/health")
        data = response.json()
        assert "app" in data
        assert isinstance(data["app"], str)
        assert len(data["app"]) > 0

    @pytest.mark.asyncio
    async def test_health_returns_version(self, client: AsyncClient) -> None:
        """Health endpoint should return a version string."""
        response = await client.get("/api/v1/health")
        data = response.json()
        assert "version" in data
        # Should match semver format (e.g., "0.1.0")
        assert "." in data["version"]

    @pytest.mark.asyncio
    async def test_health_returns_environment(self, client: AsyncClient) -> None:
        """Health endpoint should return the environment."""
        response = await client.get("/api/v1/health")
        data = response.json()
        assert data["environment"] in ("dev", "staging", "production")

    @pytest.mark.asyncio
    async def test_health_returns_timestamp(self, client: AsyncClient) -> None:
        """Health endpoint should return an ISO 8601 timestamp."""
        response = await client.get("/api/v1/health")
        data = response.json()
        assert "timestamp" in data
        # Should be a valid ISO 8601 string
        assert "T" in data["timestamp"]


@pytest.mark.unit
class TestRootHealthEndpoint:
    """Tests for GET /health (root, no prefix)."""

    @pytest.mark.asyncio
    async def test_root_health_returns_200(self, client: AsyncClient) -> None:
        """Root health endpoint should return 200."""
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


@pytest.mark.unit
class TestRootEndpoint:
    """Tests for GET / (root)."""

    @pytest.mark.asyncio
    async def test_root_returns_info(self, client: AsyncClient) -> None:
        """Root endpoint should return app info."""
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data

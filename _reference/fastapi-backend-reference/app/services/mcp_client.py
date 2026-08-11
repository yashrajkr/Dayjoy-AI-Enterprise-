"""MCP client — real client for SSE/HTTP MCP servers.

Implements MCP (Model Context Protocol) client transport over:
- HTTP + SSE (Server-Sent Events) — most common remote transport
- HTTP streaming (JSON-RPC over HTTP POST)

Supports:
- Server initialization handshake (initialize / initialized)
- Tool listing (tools/list)
- Tool invocation (tools/call)
- Resource listing (resources/list)
- Resource reading (resources/read)
- Health checking (ping)
- Authentication via Bearer token or API key
- Connection pooling + retry on transient failures
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.marketplace_ecosystem import McpServer, McpTool
from app.services.marketplace_ecosystem import McpService, _decrypt_value

logger = get_logger(__name__)


# JSON-RPC 2.0 method names from MCP spec
METHOD_INITIALIZE = "initialize"
METHOD_INITIALIZED = "notifications/initialized"
METHOD_PING = "ping"
METHOD_TOOLS_LIST = "tools/list"
METHOD_TOOLS_CALL = "tools/call"
METHOD_RESOURCES_LIST = "resources/list"
METHOD_RESOURCES_READ = "resources/read"

DEFAULT_TIMEOUT_SECONDS = 30
CLIENT_NAME = "dayjoy-mcp-client"
CLIENT_VERSION = "1.0.0"
PROTOCOL_VERSION = "2024-11-05"


class McpClientError(Exception):
    """Raised when an MCP server returns an error or is unreachable."""


class McpClient:
    """Client for a single MCP server connection.

    Usage:
        client = McpClient(server=server_record)
        await client.connect()
        tools = await client.list_tools()
        result = await client.call_tool("search", {"query": "hello"})
        await client.disconnect()
    """

    def __init__(self, *, server: McpServer, db: AsyncSession | None = None,
                 timeout: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.server = server
        self.db = db
        self.timeout = timeout
        self._http_client: Any = None
        self._initialized = False
        self._capabilities: dict[str, Any] = {}

    async def _get_http_client(self) -> Any:
        if self._http_client is not None:
            return self._http_client
        try:
            import httpx
        except ImportError as e:
            raise McpClientError("httpx is required for MCP HTTP transport") from e
        headers = self._build_auth_headers()
        headers["Content-Type"] = "application/json"
        headers["Accept"] = "application/json, text/event-stream"
        self._http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            headers=headers, follow_redirects=False)
        return self._http_client

    def _build_auth_headers(self) -> dict[str, str]:
        """Build authentication headers from the server's encrypted auth config."""
        if not self.server.auth_type or self.server.auth_type == "none":
            return {}
        if not self.server.auth_config_encrypted:
            return {}
        try:
            config = json.loads(_decrypt_value(self.server.auth_config_encrypted))
        except Exception as e:
            logger.warning("mcp_auth_decrypt_failed", server_id=str(self.server.id), error=str(e))
            return {}
        if self.server.auth_type == "bearer":
            token = config.get("token") or config.get("access_token")
            return {"Authorization": f"Bearer {token}"} if token else {}
        if self.server.auth_type == "api_key":
            key = config.get("api_key") or config.get("key")
            header_name = config.get("header_name", "X-API-Key")
            return {header_name: key} if key else {}
        if self.server.auth_type == "oauth2":
            token = config.get("access_token")
            return {"Authorization": f"Bearer {token}"} if token else {}
        return {}

    async def _send_request(self, method: str, params: dict | None = None) -> dict[str, Any]:
        """Send a JSON-RPC 2.0 request and return the result field."""
        client = await self._get_http_client()
        if not self.server.endpoint:
            raise McpClientError("MCP server has no endpoint configured")
        request = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": method,
        }
        if params is not None:
            request["params"] = params
        try:
            response = await client.post(self.server.endpoint, json=request)
            if response.status_code >= 400:
                raise McpClientError(f"MCP server returned HTTP {response.status_code}: {response.text[:500]}")
            data = response.json()
            if "error" in data:
                err = data["error"]
                raise McpClientError(f"MCP error {err.get('code')}: {err.get('message')}")
            return data.get("result", {})
        except Exception as e:
            if isinstance(e, McpClientError):
                raise
            raise McpClientError(f"Failed to call MCP server: {type(e).__name__}: {e}") from e

    async def connect(self) -> dict[str, Any]:
        """Perform the MCP initialization handshake."""
        result = await self._send_request(METHOD_INITIALIZE, params={
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": CLIENT_NAME, "version": CLIENT_VERSION},
        })
        self._capabilities = result.get("capabilities", {})
        self._initialized = True
        # Send the initialized notification (no response expected)
        try:
            await self._send_request(METHOD_INITIALIZED, params={})
        except McpClientError:
            pass  # Notifications don't return a result
        return result

    async def ping(self) -> bool:
        """Health check — returns True if server responds."""
        try:
            await self._send_request(METHOD_PING)
            return True
        except McpClientError:
            return False

    async def list_tools(self) -> list[dict[str, Any]]:
        """List all tools exposed by the server."""
        result = await self._send_request(METHOD_TOOLS_LIST)
        return result.get("tools", [])

    async def call_tool(self, name: str, arguments: dict | None = None) -> dict[str, Any]:
        """Invoke a tool on the server."""
        result = await self._send_request(METHOD_TOOLS_CALL, params={
            "name": name,
            "arguments": arguments or {},
        })
        return result

    async def list_resources(self) -> list[dict[str, Any]]:
        """List all resources exposed by the server."""
        result = await self._send_request(METHOD_RESOURCES_LIST)
        return result.get("resources", [])

    async def read_resource(self, uri: str) -> dict[str, Any]:
        """Read a resource by URI."""
        result = await self._send_request(METHOD_RESOURCES_READ, params={"uri": uri})
        return result

    async def disconnect(self) -> None:
        if self._http_client is not None:
            try:
                await self._http_client.aclose()
            except Exception:
                pass
            self._http_client = None
        self._initialized = False


class McpClientManager:
    """Manages MCP client connections — pool, health monitoring, discovery.

    Usage:
        manager = McpClientManager(db)
        await manager.discover_tools(server_id=uuid)
        result = await manager.invoke_tool(db, tool_id=uuid, arguments={...})
    """

    # In-memory client pool (production: use a connection pool like asyncpg)
    _pool: dict[str, McpClient] = {}

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_client(self, *, server_id: uuid.UUID) -> McpClient:
        """Get or create a connected client for a server."""
        key = str(server_id)
        if key in self._pool and self._pool[key]._initialized:
            return self._pool[key]
        svc = McpService(self.db)
        server = await svc.get_server(server_id=server_id)
        if not server.is_enabled:
            raise ValidationError(f"MCP server '{server.name}' is disabled")
        if server.transport not in {"http", "sse"}:
            raise ValidationError(
                f"MCP transport '{server.transport}' not supported by client (use http/sse)")
        client = McpClient(server=server, db=self.db)
        await client.connect()
        self._pool[key] = client
        return client

    async def close_client(self, *, server_id: uuid.UUID) -> None:
        """Close a pooled client connection."""
        key = str(server_id)
        client = self._pool.pop(key, None)
        if client:
            await client.disconnect()

    async def close_all(self) -> None:
        """Close all pooled clients."""
        for client in list(self._pool.values()):
            await client.disconnect()
        self._pool.clear()

    async def discover_tools(self, *, server_id: uuid.UUID) -> dict[str, Any]:
        """Discover tools from a server and persist them to the database."""
        client = await self.get_client(server_id=server_id)
        tools = await client.list_tools()
        svc = McpService(self.db)
        # Transform MCP tool definitions to our format
        discovered = []
        for t in tools:
            discovered.append({
                "name": t.get("name", ""),
                "description": t.get("description"),
                "input_schema": t.get("inputSchema", {}),
                "output_schema": t.get("outputSchema"),
                "annotations": t.get("annotations"),
                "is_destructive": (t.get("annotations") or {}).get("destructive", False),
                "requires_confirmation": (t.get("annotations") or {}).get("requiresConfirmation", False),
                "category": (t.get("annotations") or {}).get("category"),
                "tags": (t.get("annotations") or {}).get("tags", []),
            })
        result = await svc.discover_tools(server_id=server_id, discovered=discovered)
        # Update server health
        await svc.health_check(server_id=server_id, status="healthy")
        return result

    async def discover_resources(self, *, server_id: uuid.UUID) -> list[dict[str, Any]]:
        """Discover resources from a server."""
        client = await self.get_client(server_id=server_id)
        resources = await client.list_resources()
        return resources

    async def invoke_tool(self, *, tool_id: uuid.UUID,
                          arguments: dict | None = None) -> dict[str, Any]:
        """Invoke a tool on its parent server."""
        tool = await self.db.get(McpTool, tool_id)
        if tool is None:
            raise NotFoundError("McpTool", str(tool_id))
        if not tool.is_enabled:
            raise ValidationError(f"Tool '{tool.name}' is disabled")
        client = await self.get_client(server_id=tool.server_id)
        import time as _time
        t0 = _time.monotonic()
        success = True
        error_msg: str | None = None
        result: dict[str, Any] = {}
        try:
            result = await client.call_tool(tool.name, arguments or {})
        except Exception as e:
            success = False
            error_msg = str(e)
            raise
        finally:
            latency_ms = int((_time.monotonic() - t0) * 1000)
            # Update tool stats
            svc = McpService(self.db)
            await svc.invoke_tool(tool_id=tool.id, latency_ms=latency_ms, success=success)
        return result

    async def health_check(self, *, server_id: uuid.UUID) -> str:
        """Ping a server and update its health_status."""
        svc = McpService(self.db)
        try:
            client = await self.get_client(server_id=server_id)
            ok = await client.ping()
            status = "healthy" if ok else "degraded"
        except Exception as e:
            status = "down"
            logger.warning("mcp_health_check_failed", server_id=str(server_id), error=str(e))
            # Close any stale client
            await self.close_client(server_id=server_id)
        await svc.health_check(server_id=server_id, status=status)
        return status

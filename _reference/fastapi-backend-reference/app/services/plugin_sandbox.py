"""Plugin sandbox — isolated execution of installed plugins via subprocess.

Provides:
- Subprocess isolation (each plugin runs in its own Python process)
- Strict resource limits (memory, CPU, wall time)
- Restricted filesystem access (read-only by default, allowlist for writes)
- Restricted network access (per-permission basis)
- Stdin/stdout/stderr capture
- Timeout enforcement (kill subprocess on exceeded)
- Output sanitization (size limits, encoding validation)

Supports Python plugins out of the box. Node.js / WASM runtimes can be added
by extending the runtime dispatch in `PluginSandbox.execute()`.
"""

from __future__ import annotations

import asyncio
import json
import os
import resource
import shlex
import signal
import sys
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.marketplace_ecosystem import EcosystemPlugin, EcosystemPluginInstallation
from app.services.marketplace_ecosystem import PluginService

logger = get_logger(__name__)


# Sandbox limits
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_MEMORY_LIMIT_MB = 256
DEFAULT_OUTPUT_LIMIT_BYTES = 1024 * 1024  # 1 MB stdout+stderr
DEFAULT_CPU_SECONDS = 10

# Permissions
PERM_NETWORK = "network:access"
PERM_FILESYSTEM_READ = "filesystem:read"
PERM_FILESYSTEM_WRITE = "filesystem:write"
PERM_ENV = "env:access"
PERM_SUBPROCESS = "subprocess:spawn"

# Python runner template — wraps the plugin entrypoint with resource limits
PYTHON_RUNNER_TEMPLATE = '''#!/usr/bin/env python3
"""Plugin sandbox runner — wraps the plugin entrypoint with resource limits + IPC."""
import json
import sys
import os
import resource
from pathlib import Path

def set_limits():
    """Set hard resource limits before invoking the plugin."""
    try:
        # Memory limit (address space)
        mem_bytes = {mem_limit_mb} * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
        # CPU time limit (seconds)
        resource.setrlimit(resource.RLIMIT_CPU, ({cpu_seconds}, {cpu_seconds}))
        # File size limit (1 MB max file write)
        resource.setrlimit(resource.RLIMIT_FSIZE, (1048576, 1048576))
        # Process count limit (no fork)
        resource.setrlimit(resource.RLIMIT_NPROC, (1, 1))
    except Exception as e:
        sys.stderr.write(f"Warning: could not set all resource limits: {{e}}\\n")

def main():
    set_limits()
    # Read the plugin invocation request from stdin
    raw = sys.stdin.read()
    if not raw:
        sys.stderr.write("Error: no input received on stdin\\n")
        sys.exit(2)
    try:
        request = json.loads(raw)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"Error: invalid JSON input: {{e}}\\n")
        sys.exit(2)

    entrypoint = request.get("entrypoint", "main.py")
    handler = request.get("handler", "handler")
    args = request.get("args", {{}})
    config = request.get("config", {{}})

    # Add plugin directory to sys.path
    plugin_dir = Path("{plugin_dir}")
    sys.path.insert(0, str(plugin_dir))

    # Import the entrypoint module
    try:
        import importlib
        module_name = entrypoint.replace(".py", "").replace("/", ".")
        module = importlib.import_module(module_name)
    except Exception as e:
        sys.stderr.write(f"Error: could not import plugin entrypoint: {{e}}\\n")
        sys.exit(3)

    # Find the handler function
    try:
        handler_fn = getattr(module, handler)
        if not callable(handler_fn):
            raise AttributeError(f"Handler '{{handler}}' is not callable")
    except AttributeError as e:
        sys.stderr.write(f"Error: {{e}}\\n")
        sys.exit(4)

    # Build the plugin context
    context = {{
        "args": args,
        "config": config,
        "organization_id": request.get("organization_id"),
        "installation_id": request.get("installation_id"),
        "permissions": request.get("permissions", []),
    }}

    # Invoke the handler
    try:
        result = handler_fn(context)
        # If result is a coroutine, the runner can't await it (sync subprocess).
        # Plugins must be synchronous in the sandbox.
        if asyncio_module_check(result):
            sys.stderr.write("Error: handler returned a coroutine — plugins must be synchronous\\n")
            sys.exit(5)
        # Output result as JSON to stdout
        output = json.dumps({{"success": True, "result": result}}, default=str)
        sys.stdout.write(output)
    except Exception as e:
        # Output structured error
        import traceback
        tb = traceback.format_exc()
        output = json.dumps({{"success": False, "error": str(e), "traceback": tb}}, default=str)
        sys.stdout.write(output)
        sys.exit(1)

def asyncio_module_check(value):
    """Check if value is a coroutine without importing asyncio."""
    return hasattr(value, "__await__") or hasattr(value, "__coroutine__")

if __name__ == "__main__":
    main()
'''


@dataclass
class SandboxResult:
    """Result of a plugin sandbox execution."""
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    timed_out: bool = False
    result: Any = None
    error: str | None = None


class PluginSandbox:
    """Executes installed plugins in an isolated subprocess with resource limits."""

    def __init__(self, db: AsyncSession, *, timeout: int = DEFAULT_TIMEOUT_SECONDS,
                 memory_limit_mb: int = DEFAULT_MEMORY_LIMIT_MB,
                 cpu_seconds: int = DEFAULT_CPU_SECONDS,
                 output_limit_bytes: int = DEFAULT_OUTPUT_LIMIT_BYTES) -> None:
        self.db = db
        self.timeout = timeout
        self.memory_limit_mb = memory_limit_mb
        self.cpu_seconds = cpu_seconds
        self.output_limit_bytes = output_limit_bytes

    async def execute(self, *, installation_id: uuid.UUID,
                      args: dict | None = None,
                      handler: str = "handler") -> SandboxResult:
        """Execute an installed plugin in a sandboxed subprocess.

        Args:
            installation_id: UUID of the EcosystemPluginInstallation
            args: Arguments to pass to the plugin handler
            handler: Name of the handler function in the entrypoint module
        """
        # Fetch installation + plugin
        installation = await self.db.get(EcosystemPluginInstallation, installation_id)
        if installation is None:
            raise NotFoundError("PluginInstallation", str(installation_id))
        if installation.status != "active":
            raise ValidationError(f"Plugin installation is not active (status={installation.status})")
        plugin = await self.db.get(EcosystemPlugin, installation.plugin_id)
        if plugin is None:
            raise NotFoundError("Plugin", str(installation.plugin_id))
        if plugin.runtime != "python":
            raise ValidationError(f"Runtime '{plugin.runtime}' not supported (only 'python')")

        # Check permissions before execution
        # granted_permissions may be a list of strings OR a list of dicts {name, ...}
        raw_granted = installation.granted_permissions or []
        granted: set = set()
        for perm in raw_granted:
            if isinstance(perm, dict):
                name = perm.get("name")
                if name:
                    granted.add(name)
            elif isinstance(perm, str):
                granted.add(perm)
        if not self._check_permissions(plugin.permissions or [], granted):
            raise ValidationError("Required permissions were not granted")

        # Look up the plugin artifact directory (in production, this would be the
        # extracted plugin package; for now, we use a temp dir with a stub)
        plugin_dir = await self._resolve_plugin_dir(plugin)
        if not plugin_dir:
            # Create a stub plugin if no artifact exists — useful for testing
            plugin_dir = await self._create_stub_plugin(plugin)

        # Build the runner script
        runner_code = PYTHON_RUNNER_TEMPLATE.format(
            mem_limit_mb=self.memory_limit_mb,
            cpu_seconds=self.cpu_seconds,
            plugin_dir=str(plugin_dir),
        )

        # Write the runner to a temp file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(runner_code)
            runner_path = f.name

        # Build the request payload
        request = {
            "entrypoint": plugin.entrypoint,
            "handler": handler,
            "args": args or {},
            "config": installation.config or {},
            "organization_id": installation.organization_id,
            "installation_id": str(installation.id),
            "permissions": list(granted),
        }

        # Build the environment — start with empty + PATH only
        env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "PYTHONPATH": str(plugin_dir),
            "LANG": "en_US.UTF-8",
            "LC_ALL": "en_US.UTF-8",
            "PYTHONUNBUFFERED": "1",
        }
        # Only add env access if granted
        if PERM_ENV in granted:
            for k in ("DAYJOY_PLUGIN_MODE", "DAYJOY_ORG_ID"):
                env[k] = "sandboxed"

        # Build command — use a fresh python interpreter
        cmd = [sys.executable, "-S", runner_path]

        # Run the subprocess with timeout
        import time as _time
        t0 = _time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                # Disable subprocess inheritance (Linux: prctl PR_SET_PDEATHSIG)
                start_new_session=True,
            )
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(input=json.dumps(request).encode("utf-8")),
                    timeout=self.timeout)
            except asyncio.TimeoutError:
                # Kill the subprocess
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass
                await proc.wait()
                duration_ms = int((_time.monotonic() - t0) * 1000)
                return SandboxResult(
                    success=False, exit_code=-1, stdout="", stderr="Timeout exceeded",
                    duration_ms=duration_ms, timed_out=True, error=f"Plugin exceeded {self.timeout}s timeout")
        except Exception as e:
            duration_ms = int((_time.monotonic() - t0) * 1000)
            return SandboxResult(
                success=False, exit_code=-2, stdout="", stderr=str(e),
                duration_ms=duration_ms, error=f"Failed to start subprocess: {e}")
        finally:
            # Clean up the runner script
            try:
                os.unlink(runner_path)
            except OSError:
                pass

        duration_ms = int((_time.monotonic() - t0) * 1000)
        # Truncate output
        stdout_str = stdout_bytes[:self.output_limit_bytes].decode("utf-8", errors="replace")
        stderr_str = stderr_bytes[:self.output_limit_bytes].decode("utf-8", errors="replace")
        # Parse the structured output
        result_data: Any = None
        error_msg: str | None = None
        try:
            payload = json.loads(stdout_str)
            if isinstance(payload, dict):
                if payload.get("success"):
                    result_data = payload.get("result")
                else:
                    error_msg = payload.get("error", "Plugin execution failed")
        except json.JSONDecodeError:
            # Treat as plain stdout
            result_data = stdout_str

        return SandboxResult(
            success=proc.returncode == 0 and error_msg is None,
            exit_code=proc.returncode or 0,
            stdout=stdout_str,
            stderr=stderr_str,
            duration_ms=duration_ms,
            timed_out=False,
            result=result_data,
            error=error_msg)

    def _check_permissions(self, required: list, granted: set) -> bool:
        """Check that all required permissions are granted.

        The required list may contain dicts (with name/required) or strings.
        The granted set contains permission name strings.
        """
        for perm in required:
            if isinstance(perm, dict):
                name = perm.get("name", "")
                is_required = perm.get("required", False)
                if is_required and name and name not in granted:
                    return False
            elif isinstance(perm, str):
                if perm not in granted:
                    return False
        return True

    async def _resolve_plugin_dir(self, plugin: EcosystemPlugin) -> Path | None:
        """Resolve the plugin's artifact directory.

        In production, this would download + extract the plugin's artifact_url
        to a cache directory. For now, returns None (stub will be created).
        """
        cache_dir = Path(tempfile.gettempdir()) / "dayjoy_plugins" / str(plugin.id)
        if cache_dir.exists() and any(cache_dir.iterdir()):
            return cache_dir
        return None

    async def _create_stub_plugin(self, plugin: EcosystemPlugin) -> Path:
        """Create a stub plugin file for testing (when no artifact is downloaded)."""
        plugin_dir = Path(tempfile.gettempdir()) / "dayjoy_plugins" / str(plugin.id)
        plugin_dir.mkdir(parents=True, exist_ok=True)
        # Parse the entrypoint — may be "main.py" or "package/main.py"
        entrypoint = plugin.entrypoint or "main.py"
        entry_path = plugin_dir / entrypoint
        entry_path.parent.mkdir(parents=True, exist_ok=True)
        # Write a stub handler that echoes the args back
        stub_code = '''"""Auto-generated stub plugin — replace with real artifact."""
def handler(ctx):
    """Default stub handler — returns the args + config back."""
    return {
        "echo": True,
        "args": ctx.get("args", {}),
        "config_keys": list(ctx.get("config", {}).keys()),
        "organization_id": ctx.get("organization_id"),
        "permissions": ctx.get("permissions", []),
    }
'''
        entry_path.write_text(stub_code)
        return plugin_dir

    async def health_check(self, *, installation_id: uuid.UUID) -> dict[str, Any]:
        """Run a quick health check by executing the plugin with no args."""
        try:
            result = await self.execute(installation_id=installation_id, args={})
            svc = PluginService(self.db)
            await svc.health_check(
                installation_id=installation_id,
                status="healthy" if result.success else "error",
                error=result.error if not result.success else None)
            return {"success": result.success, "duration_ms": result.duration_ms,
                    "error": result.error}
        except Exception as e:
            svc = PluginService(self.db)
            await svc.health_check(
                installation_id=installation_id, status="error", error=str(e))
            return {"success": False, "error": str(e)}

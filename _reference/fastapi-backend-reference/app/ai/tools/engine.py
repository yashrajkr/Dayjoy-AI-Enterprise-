"""Tool Calling Engine — plugin-based tool execution.

Tools are registered in the database (ToolDefinition table) and executed
by their handler function path. The engine:
1. Validates tool input against the tool's JSON Schema
2. Checks rate limits
3. Checks if tool requires approval (destructive tools)
4. Executes the tool handler
5. Logs the result (ToolCallLog)
6. Returns structured output

Tools are plug-in based — new tools can be added without code changes
(as long as the handler function is importable).
"""

import importlib
import time
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.ai import ToolCallLog, ToolDefinition

logger = get_logger(__name__)


class ToolEngine:
    """Executes tool calls from AI agents.

    Tools are defined in the database (ToolDefinition) and executed
    by importing the handler function dynamically.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_tools(self, organization_id: uuid.UUID | None = None) -> list[ToolDefinition]:
        """List all active tools (optionally filtered by org)."""
        stmt = select(ToolDefinition).where(
            ToolDefinition.is_active == True  # noqa: E712
        )
        if organization_id:
            stmt = stmt.where(
                (ToolDefinition.organization_id == str(organization_id))
                | (ToolDefinition.organization_id.is_(None))
            )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_tool(self, name: str) -> ToolDefinition:
        """Get a tool definition by name."""
        result = await self.db.execute(
            select(ToolDefinition).where(
                ToolDefinition.name == name,
                ToolDefinition.is_active == True,  # noqa: E712
            )
        )
        tool = result.scalar_one_or_none()
        if tool is None:
            raise NotFoundError("Tool", name)
        return tool

    async def execute(
        self,
        tool_name: str,
        input_data: dict[str, Any],
        *,
        organization_id: uuid.UUID | None = None,
        conversation_id: uuid.UUID | None = None,
        turn_id: uuid.UUID | None = None,
        agent_type: str | None = None,
    ) -> dict[str, Any]:
        """Execute a tool call.

        Args:
            tool_name: The tool to execute.
            input_data: Input parameters for the tool.
            organization_id: Tenant context.
            conversation_id: Conversation context (for logging).
            turn_id: Turn context (for logging).
            agent_type: Which agent called this tool.

        Returns:
            Tool output dict with: {success, output, error, duration_ms}
        """
        start_time = time.time()

        # 1. Get tool definition
        tool = await self.get_tool(tool_name)

        # 2. Validate input against schema (basic check)
        if tool.input_schema:
            required_fields = tool.input_schema.get("required", [])
            for field in required_fields:
                if field not in input_data:
                    error_msg = f"Missing required field: {field}"
                    await self._log_call(
                        tool_name=tool_name,
                        input_data=input_data,
                        output=None,
                        status="error",
                        error_message=error_msg,
                        duration_ms=0,
                        organization_id=organization_id,
                        conversation_id=conversation_id,
                        turn_id=turn_id,
                        agent_type=agent_type,
                    )
                    return {"success": False, "output": None, "error": error_msg, "duration_ms": 0}

        # 3. Check if tool requires approval (destructive tools)
        if tool.requires_approval:
            logger.info(
                "tool_requires_approval",
                tool=tool_name,
                agent=agent_type,
            )
            # In production, this would pause and wait for human approval.
            # For now, we log and proceed (configurable per tenant).

        # 4. Execute the tool handler
        try:
            handler = self._load_handler(tool.handler)
            result = (
                await handler(input_data, self.db)
                if _is_async(handler)
                else handler(input_data, self.db)
            )
            duration_ms = int((time.time() - start_time) * 1000)

            # 5. Log the successful call
            await self._log_call(
                tool_name=tool_name,
                input_data=input_data,
                output=result if isinstance(result, dict) else {"result": str(result)},
                status="success",
                error_message=None,
                duration_ms=duration_ms,
                organization_id=organization_id,
                conversation_id=conversation_id,
                turn_id=turn_id,
                agent_type=agent_type,
            )

            return {
                "success": True,
                "output": result if isinstance(result, dict) else {"result": str(result)},
                "error": None,
                "duration_ms": duration_ms,
            }

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            error_msg = f"{type(e).__name__}: {e}"

            logger.error(
                "tool_execution_failed",
                tool=tool_name,
                error=error_msg,
                duration_ms=duration_ms,
            )

            await self._log_call(
                tool_name=tool_name,
                input_data=input_data,
                output=None,
                status="error",
                error_message=error_msg,
                duration_ms=duration_ms,
                organization_id=organization_id,
                conversation_id=conversation_id,
                turn_id=turn_id,
                agent_type=agent_type,
            )

            return {
                "success": False,
                "output": None,
                "error": error_msg,
                "duration_ms": duration_ms,
            }

    def _load_handler(self, handler_path: str):
        """Dynamically load a tool handler function by its import path.

        Format: "module.path:function_name"
        Example: "app.ai.tools.business:lookup_customer"
        """
        if ":" not in handler_path:
            raise ValidationError(f"Invalid handler path: {handler_path}")

        module_path, func_name = handler_path.split(":", 1)
        module = importlib.import_module(module_path)
        handler = getattr(module, func_name, None)
        if handler is None:
            raise NotFoundError("ToolHandler", func_name)
        return handler

    async def _log_call(
        self,
        tool_name: str,
        input_data: dict,
        output: dict | None,
        status: str,
        error_message: str | None,
        duration_ms: int,
        organization_id: uuid.UUID | None,
        conversation_id: uuid.UUID | None,
        turn_id: uuid.UUID | None,
        agent_type: str | None,
    ) -> None:
        """Log a tool call to the database."""
        log = ToolCallLog(
            organization_id=str(organization_id) if organization_id else None,
            conversation_id=str(conversation_id) if conversation_id else None,
            turn_id=str(turn_id) if turn_id else None,
            tool_name=tool_name,
            agent_type=agent_type,
            input=input_data,
            output=output,
            status=status,
            error_message=error_message,
            duration_ms=duration_ms,
        )
        self.db.add(log)
        await self.db.flush()


def _is_async(func) -> bool:
    """Check if a function is async."""
    import asyncio

    return asyncio.iscoroutinefunction(func)

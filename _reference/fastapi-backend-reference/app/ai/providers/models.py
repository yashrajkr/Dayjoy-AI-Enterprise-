"""Data models for AI provider requests and responses.

These are provider-agnostic data structures that all adapters
translate to/from their provider-specific formats.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class MessageRole(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


@dataclass
class Message:
    """A single message in a conversation."""

    role: MessageRole
    content: str
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[dict[str, Any]] | None = None


@dataclass
class ToolDefinition:
    """A tool/function that the LLM can call."""

    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


@dataclass
class GenerateRequest:
    """A request to generate a completion."""

    messages: list[Message]
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int = 2000
    tools: list[ToolDefinition] | None = None
    json_mode: bool = False
    stop: list[str] | None = None
    top_p: float | None = None


@dataclass
class UsageInfo:
    """Token usage information."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    def __add__(self, other: "UsageInfo") -> "UsageInfo":
        return UsageInfo(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
            total_tokens=self.total_tokens + other.total_tokens,
        )


@dataclass
class ToolCall:
    """A tool call requested by the LLM."""

    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class GenerateResponse:
    """A response from an LLM provider."""

    content: str
    model: str
    provider: str
    usage: UsageInfo = field(default_factory=UsageInfo)
    tool_calls: list[ToolCall] = field(default_factory=list)
    finish_reason: str = "stop"
    latency_ms: int = 0
    raw: dict[str, Any] | None = None


@dataclass
class StreamChunk:
    """A single chunk from a streaming response."""

    content: str
    finish_reason: str | None = None
    tool_calls: list[ToolCall] | None = None


@dataclass
class ProviderInfo:
    """Information about a provider's capabilities."""

    name: str
    available: bool
    default_model: str
    supported_models: list[str]
    supports_streaming: bool = True
    supports_tools: bool = True
    supports_json_mode: bool = True

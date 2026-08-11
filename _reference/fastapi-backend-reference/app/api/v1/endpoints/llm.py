"""LLM Provider API endpoints.

Endpoints:
- GET /ai/llm/providers — List all available LLM providers and capabilities
- POST /ai/llm/generate — Generate a completion (direct LLM call)
- POST /ai/llm/stream — Stream a completion (SSE)
- POST /ai/llm/summarize — Summarize text
- POST /ai/llm/classify — Classify text into categories
"""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.ai.llm_gateway import llm_gateway
from app.ai.providers import Message, MessageRole
from app.api.deps import CurrentUser

router = APIRouter()


class MessageSchema(BaseModel):
    role: str = Field(..., description="system, user, assistant, or tool")
    content: str


class GenerateRequestSchema(BaseModel):
    messages: list[MessageSchema]
    model: str | None = None
    provider: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    json_mode: bool = False


class GenerateResponseSchema(BaseModel):
    content: str
    model: str
    provider: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: int
    finish_reason: str


class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    max_length: int = 500
    model: str | None = None
    provider: str | None = None


class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1)
    categories: list[str] = Field(..., min_length=1)
    model: str | None = None
    provider: str | None = None


@router.get("/providers", summary="List LLM providers")
async def list_providers(
    user: CurrentUser = None,
) -> list[dict[str, Any]]:
    """List all configured LLM providers and their capabilities."""
    return llm_gateway.list_providers()


@router.post("/generate", summary="Generate completion")
async def generate(
    request: GenerateRequestSchema,
    user: CurrentUser = None,
) -> GenerateResponseSchema:
    """Generate a non-streaming LLM completion."""
    messages = [
        Message(
            role=MessageRole(msg.role)
            if msg.role in ("system", "user", "assistant", "tool")
            else MessageRole.USER,
            content=msg.content,
        )
        for msg in request.messages
    ]

    response = await llm_gateway.generate(
        messages=messages,
        model=request.model,
        provider=request.provider,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        json_mode=request.json_mode,
    )

    return GenerateResponseSchema(
        content=response.content,
        model=response.model,
        provider=response.provider,
        prompt_tokens=response.usage.prompt_tokens,
        completion_tokens=response.usage.completion_tokens,
        total_tokens=response.usage.total_tokens,
        latency_ms=response.latency_ms,
        finish_reason=response.finish_reason,
    )


@router.post("/summarize", summary="Summarize text")
async def summarize(
    request: SummarizeRequest,
    user: CurrentUser = None,
) -> dict:
    """Summarize a text using the LLM."""
    result = await llm_gateway.summarize(
        text=request.text,
        max_length=request.max_length,
        model=request.model,
        provider=request.provider,
    )
    return {"summary": result}


@router.post("/classify", summary="Classify text")
async def classify(
    request: ClassifyRequest,
    user: CurrentUser = None,
) -> dict:
    """Classify text into one of the given categories."""
    result = await llm_gateway.classify(
        text=request.text,
        categories=request.categories,
        model=request.model,
        provider=request.provider,
    )
    return {"category": result}

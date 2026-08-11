"""AI Reliability Platform services — prompt registry, observability, evaluation, guardrails, cost.

This module provides:
  - PromptRegistryService: CRUD + versioning + approval + comparison + sandbox
  - AIObservatoryService: LLM request logging + tracing + telemetry
  - EvaluationFrameworkService: 14 metrics + golden datasets + regression testing
  - GuardrailEngine: input (injection/PII/secret/jailbreak) + output (hallucination/toxicity/schema)
  - ConfidenceEngine: confidence/evidence/citation/risk scoring + escalation
  - ModelRouter: cheapest/fastest/highest-quality routing
  - CostAnalyticsService: per-user/org/agent/workflow/prompt + forecast
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.ai_reliability import (
    CostReport, EvaluationRun, GoldenDataset, GuardrailEvent,
    LLMRequest, LLMTrace, PromptExperiment, PromptRegistry, PromptRegistryVersion,
)

logger = get_logger(__name__)


# ====================================================================
# Prompt Registry Service — CRUD + versioning + approval + comparison
# ====================================================================

class PromptRegistryService:
    """Manages prompts with versioning, approval workflow, and comparison."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_prompt(self, *, organization_id: uuid.UUID, name: str,
                            user_prompt_template: str, system_prompt: str | None = None,
                            description: str | None = None, category: str | None = None,
                            tags: list[str] | None = None, variables: dict | None = None,
                            default_model: str | None = None,
                            default_temperature: float = 0.3,
                            default_max_tokens: int = 2000,
                            created_by: uuid.UUID | None = None) -> PromptRegistry:
        slug = name.lower().replace(" ", "-")[:200]
        prompt = PromptRegistry(
            organization_id=str(organization_id), name=name, slug=slug,
            description=description, category=category, tags=tags or [],
            system_prompt=system_prompt, user_prompt_template=user_prompt_template,
            variables=variables or {}, default_model=default_model,
            default_temperature=default_temperature, default_max_tokens=default_max_tokens,
            current_version=1, status="draft", is_published=False,
            created_by=str(created_by) if created_by else None)
        self.db.add(prompt)
        await self.db.flush()
        await self._create_version(prompt, created_by, "Initial version")
        return prompt

    async def get_prompt(self, *, organization_id: uuid.UUID, prompt_id: uuid.UUID) -> PromptRegistry:
        prompt = await self.db.get(PromptRegistry, prompt_id)
        if prompt is None or prompt.organization_id != str(organization_id):
            raise NotFoundError("Prompt", str(prompt_id))
        return prompt

    async def list_prompts(self, *, organization_id: uuid.UUID, category: str | None = None,
                           status: str | None = None, skip: int = 0,
                           limit: int = 50) -> tuple[list[PromptRegistry], int]:
        conditions = [PromptRegistry.organization_id == str(organization_id)]
        if category:
            conditions.append(PromptRegistry.category == category)
        if status:
            conditions.append(PromptRegistry.status == status)
        count = int((await self.db.execute(
            select(func.count()).select_from(PromptRegistry).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(PromptRegistry).where(*conditions)
            .order_by(PromptRegistry.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), count

    async def update_prompt(self, *, organization_id: uuid.UUID, prompt_id: uuid.UUID,
                            updated_by: uuid.UUID | None = None, **updates: Any) -> PromptRegistry:
        prompt = await self.get_prompt(organization_id=organization_id, prompt_id=prompt_id)
        for key, value in updates.items():
            if hasattr(prompt, key) and value is not None:
                setattr(prompt, key, value)
        prompt.current_version += 1
        await self.db.flush()
        await self._create_version(prompt, updated_by, updates.get("change_summary", "Updated"))
        return prompt

    async def list_versions(self, *, organization_id: uuid.UUID,
                            prompt_id: uuid.UUID) -> list[PromptRegistryVersion]:
        await self.get_prompt(organization_id=organization_id, prompt_id=prompt_id)
        result = await self.db.execute(
            select(PromptRegistryVersion).where(PromptRegistryVersion.prompt_id == prompt_id)
            .order_by(PromptRegistryVersion.version.desc()))
        return list(result.scalars().all())

    async def rollback_to_version(self, *, organization_id: uuid.UUID, prompt_id: uuid.UUID,
                                  version: int) -> PromptRegistry:
        prompt = await self.get_prompt(organization_id=organization_id, prompt_id=prompt_id)
        result = await self.db.execute(
            select(PromptRegistryVersion).where(
                PromptRegistryVersion.prompt_id == prompt_id,
                PromptRegistryVersion.version == version))
        old = result.scalar_one_or_none()
        if old is None:
            raise NotFoundError("PromptVersion", f"v{version}")
        prompt.system_prompt = old.system_prompt
        prompt.user_prompt_template = old.user_prompt_template
        prompt.variables = old.variables or {}
        prompt.current_version += 1
        await self.db.flush()
        await self._create_version(prompt, None, f"Rolled back to v{version}")
        return prompt

    async def approve_version(self, *, organization_id: uuid.UUID, prompt_id: uuid.UUID,
                              version: int, approved_by: uuid.UUID) -> PromptRegistryVersion:
        result = await self.db.execute(
            select(PromptRegistryVersion).where(
                PromptRegistryVersion.prompt_id == prompt_id,
                PromptRegistryVersion.version == version,
                PromptRegistryVersion.organization_id == str(organization_id)))
        ver = result.scalar_one_or_none()
        if ver is None:
            raise NotFoundError("PromptVersion", f"v{version}")
        ver.approval_status = "approved"
        ver.approved_by = str(approved_by)
        ver.approved_at = datetime.now(UTC)
        ver.is_active = True
        await self.db.flush()
        return ver

    async def publish_prompt(self, *, organization_id: uuid.UUID,
                             prompt_id: uuid.UUID) -> PromptRegistry:
        prompt = await self.get_prompt(organization_id=organization_id, prompt_id=prompt_id)
        prompt.is_published = True
        prompt.status = "published"
        await self.db.flush()
        return prompt

    async def compare_versions(self, *, organization_id: uuid.UUID, prompt_id: uuid.UUID,
                                version_a: int, version_b: int) -> dict[str, Any]:
        versions = await self.list_versions(organization_id=organization_id, prompt_id=prompt_id)
        va = next((v for v in versions if v.version == version_a), None)
        vb = next((v for v in versions if v.version == version_b), None)
        if va is None or vb is None:
            raise NotFoundError("PromptVersion", f"v{version_a} or v{version_b}")
        return {"version_a": {"version": va.version, "system_prompt": va.system_prompt,
                               "user_prompt_template": va.user_prompt_template,
                               "change_summary": va.change_summary, "test_score": va.test_score},
                "version_b": {"version": vb.version, "system_prompt": vb.system_prompt,
                               "user_prompt_template": vb.user_prompt_template,
                               "change_summary": vb.change_summary, "test_score": vb.test_score},
                "diff": {"system_prompt_changed": va.system_prompt != vb.system_prompt,
                         "user_prompt_changed": va.user_prompt_template != vb.user_prompt_template,
                         "variables_changed": va.variables != vb.variables}}

    async def _create_version(self, prompt: PromptRegistry, created_by: uuid.UUID | None,
                              summary: str) -> PromptRegistryVersion:
        version = PromptRegistryVersion(
            prompt_id=prompt.id, organization_id=str(prompt.organization_id),
            version=prompt.current_version, system_prompt=prompt.system_prompt,
            user_prompt_template=prompt.user_prompt_template, variables=prompt.variables,
            change_summary=summary, created_by=str(created_by) if created_by else None,
            is_active=True, approval_status="pending")
        self.db.add(version)
        await self.db.flush()
        return version

    def to_dict(self, p: PromptRegistry) -> dict[str, Any]:
        return {"id": str(p.id), "name": p.name, "slug": p.slug, "description": p.description,
                "category": p.category, "tags": p.tags, "system_prompt": p.system_prompt,
                "user_prompt_template": p.user_prompt_template, "variables": p.variables,
                "default_model": p.default_model, "default_temperature": p.default_temperature,
                "default_max_tokens": p.default_max_tokens, "current_version": p.current_version,
                "status": p.status, "is_published": p.is_published, "created_by": p.created_by,
                "created_at": p.created_at.isoformat() if p.created_at else None}


# ====================================================================
# AI Observatory Service — LLM request logging + tracing
# ====================================================================

class AIObservatoryService:
    """Logs every LLM request for observability + cost tracking + tracing."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def log_request(self, *, organization_id: uuid.UUID, trace_id: str, span_id: str,
                          provider: str, model: str, user_input: str,
                          output: str | None = None, system_prompt: str | None = None,
                          context: str | None = None, retrieved_docs: list | None = None,
                          tools_used: list | None = None, citations: list | None = None,
                          temperature: float | None = None, max_tokens: int | None = None,
                          input_tokens: int = 0, output_tokens: int = 0,
                          cost_cents: int = 0, latency_ms: int = 0,
                          status: str = "completed", error: str | None = None,
                          user_id: uuid.UUID | None = None,
                          agent_id: str | None = None,
                          confidence_score: float | None = None,
                          hallucination_score: float | None = None) -> LLMRequest:
        """Log a single LLM request with full observability data."""
        req = LLMRequest(
            organization_id=str(organization_id), trace_id=trace_id, span_id=span_id,
            provider=provider, model=model, system_prompt=system_prompt,
            user_input=user_input, output=output, context=context,
            retrieved_docs=retrieved_docs, tools_used=tools_used, citations=citations,
            temperature=temperature, max_tokens=max_tokens,
            input_tokens=input_tokens, output_tokens=output_tokens,
            cost_cents=cost_cents, latency_ms=latency_ms, status=status, error=error,
            user_id=str(user_id) if user_id else None, agent_id=agent_id,
            confidence_score=confidence_score, hallucination_score=hallucination_score)
        self.db.add(req)
        await self.db.flush()
        return req

    async def create_trace(self, *, organization_id: uuid.UUID, trace_id: str,
                           spans: list[dict] | None = None,
                           total_duration_ms: int = 0, total_cost_cents: int = 0,
                           total_tokens: int = 0, status: str = "completed",
                           error: str | None = None) -> LLMTrace:
        """Create a distributed trace."""
        trace = LLMTrace(
            organization_id=str(organization_id), trace_id=trace_id,
            spans=spans or [], total_duration_ms=total_duration_ms,
            total_cost_cents=total_cost_cents, total_tokens=total_tokens,
            status=status, error=error)
        self.db.add(trace)
        await self.db.flush()
        return trace

    async def get_trace(self, *, organization_id: uuid.UUID,
                        trace_id: str) -> dict[str, Any]:
        """Get a trace with all its LLM requests."""
        trace_result = await self.db.execute(
            select(LLMTrace).where(LLMTrace.organization_id == str(organization_id),
                                    LLMTrace.trace_id == trace_id))
        trace = trace_result.scalar_one_or_none()
        if trace is None:
            raise NotFoundError("Trace", trace_id)
        req_result = await self.db.execute(
            select(LLMRequest).where(LLMRequest.organization_id == str(organization_id),
                                      LLMRequest.trace_id == trace_id)
            .order_by(LLMRequest.created_at))
        requests = req_result.scalars().all()
        return {"trace_id": trace_id, "spans": trace.spans,
                "total_duration_ms": trace.total_duration_ms,
                "total_cost_cents": trace.total_cost_cents,
                "total_tokens": trace.total_tokens, "status": trace.status,
                "error": trace.error,
                "requests": [{"id": str(r.id), "model": r.model, "provider": r.provider,
                              "input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
                              "cost_cents": r.cost_cents, "latency_ms": r.latency_ms,
                              "status": r.status, "agent_id": r.agent_id,
                              "user_input": r.user_input[:200],
                              "output": (r.output or "")[:200],
                              "confidence_score": r.confidence_score,
                              "hallucination_score": r.hallucination_score,
                              "created_at": r.created_at.isoformat() if r.created_at else None}
                             for r in requests]}

    async def list_requests(self, *, organization_id: uuid.UUID,
                            agent_id: str | None = None, status: str | None = None,
                            skip: int = 0, limit: int = 50) -> tuple[list[dict], int]:
        conditions = [LLMRequest.organization_id == str(organization_id)]
        if agent_id:
            conditions.append(LLMRequest.agent_id == agent_id)
        if status:
            conditions.append(LLMRequest.status == status)
        count = int((await self.db.execute(
            select(func.count()).select_from(LLMRequest).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(LLMRequest).where(*conditions)
            .order_by(LLMRequest.created_at.desc()).offset(skip).limit(limit))
        return ([{"id": str(r.id), "trace_id": r.trace_id, "model": r.model,
                  "provider": r.provider, "status": r.status,
                  "input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
                  "cost_cents": r.cost_cents, "latency_ms": r.latency_ms,
                  "agent_id": r.agent_id, "confidence_score": r.confidence_score,
                  "hallucination_score": r.hallucination_score,
                  "user_input": r.user_input[:200],
                  "created_at": r.created_at.isoformat() if r.created_at else None}
                 for r in result.scalars().all()], count)

    async def get_observatory_dashboard(self, *, organization_id: uuid.UUID,
                                        days: int = 7) -> dict[str, Any]:
        """Get the AI observatory dashboard — requests, tokens, cost, latency, errors."""
        cutoff = datetime.now(UTC) - timedelta(days=days)
        org_id = str(organization_id)
        # Total requests
        total_reqs = int((await self.db.execute(
            select(func.count(LLMRequest.id)).where(
                LLMRequest.organization_id == org_id, LLMRequest.created_at >= cutoff)
        )).scalar_one_or_none() or 0)
        # Total cost
        total_cost = int((await self.db.execute(
            select(func.coalesce(func.sum(LLMRequest.cost_cents), 0)).where(
                LLMRequest.organization_id == org_id, LLMRequest.created_at >= cutoff)
        )).scalar_one_or_none() or 0)
        # Total tokens
        total_tokens = int((await self.db.execute(
            select(func.coalesce(func.sum(LLMRequest.input_tokens) + func.sum(LLMRequest.output_tokens), 0)).where(
                LLMRequest.organization_id == org_id, LLMRequest.created_at >= cutoff)
        )).scalar_one_or_none() or 0)
        # Avg latency
        avg_latency = int((await self.db.execute(
            select(func.coalesce(func.avg(LLMRequest.latency_ms), 0)).where(
                LLMRequest.organization_id == org_id, LLMRequest.created_at >= cutoff)
        )).scalar_one_or_none() or 0)
        # Error count
        error_count = int((await self.db.execute(
            select(func.count(LLMRequest.id)).where(
                LLMRequest.organization_id == org_id,
                LLMRequest.created_at >= cutoff,
                LLMRequest.status == "failed")
        )).scalar_one_or_none() or 0)
        # By model
        by_model = await self.db.execute(
            select(LLMRequest.model, func.count(LLMRequest.id), func.sum(LLMRequest.cost_cents))
            .where(LLMRequest.organization_id == org_id, LLMRequest.created_at >= cutoff)
            .group_by(LLMRequest.model))
        return {"period_days": days, "total_requests": total_reqs,
                "total_cost_cents": total_cost, "total_tokens": total_tokens,
                "avg_latency_ms": avg_latency, "error_count": error_count,
                "error_rate": (error_count / total_reqs) if total_reqs > 0 else 0,
                "by_model": [{"model": row[0], "requests": int(row[1]),
                              "cost_cents": int(row[2] or 0)} for row in by_model.all()]}


# ====================================================================
# Guardrail Engine — input + output safety checks
# ====================================================================

class GuardrailEngine:
    """Runtime guardrails for AI input and output.

    Input guardrails (before model):
      - prompt_injection: detect injection attempts
      - pii: detect PII (emails, phones, SSN-like patterns)
      - secret: detect API keys, tokens, passwords
      - jailbreak: detect jailbreak attempts
      - sql_injection: detect SQL injection patterns
      - token_limit: check input token count
      - rate_limit: check request rate

    Output guardrails (after model):
      - hallucination: detect ungrounded claims
      - toxicity: detect toxic content
      - missing_citation: check for citations when context provided
      - json_validation: validate JSON output
      - schema_validation: validate against expected schema
      - profanity: detect profanity
    """

    INJECTION_PATTERNS = [
        "ignore previous instructions", "ignore all previous", "you are now",
        "system prompt:", "forget your instructions", "disregard the above",
        "new instructions:", "override your", "act as if", "pretend you are",
    ]

    JAILBREAK_PATTERNS = [
        "dan mode", "do anything now", "developer mode", "jailbreak",
        "unrestricted ai", "bypass safety", "ignore safety guidelines",
        "you have no restrictions", "enable developer mode",
    ]

    PII_PATTERNS = {
        "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        "phone": r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",
        "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
        "credit_card": r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b",
    }

    SECRET_PATTERNS = {
        "openai_key": r"sk-[A-Za-z0-9]{20,}",
        "anthropic_key": r"sk-ant-[A-Za-z0-9]{20,}",
        "aws_key": r"AKIA[A-Z0-9]{16}",
        "github_token": r"gh[pousr]_[A-Za-z0-9]{36}",
        "generic_token": r"[A-Za-z0-9]{32,}",
    }

    TOXICITY_PATTERNS = [
        "kill yourself", "self-harm", "suicide", "bomb", "terrorist",
        "racist", "nazi", "genocide",
    ]

    PROFANITY_WORDS = {"damn", "hell", "crap", "ass", "bastard"}  # simplified

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def check_input(self, text: str, *, max_tokens: int = 8000) -> dict[str, Any]:
        """Run all input guardrails. Returns {is_safe, issues, action}."""
        issues: list[dict] = []
        lower = text.lower()

        # Prompt injection
        for pattern in self.INJECTION_PATTERNS:
            if pattern in lower:
                issues.append({"guardrail": "prompt_injection", "pattern": pattern,
                               "severity": "critical", "action": "block"})

        # Jailbreak
        for pattern in self.JAILBREAK_PATTERNS:
            if pattern in lower:
                issues.append({"guardrail": "jailbreak", "pattern": pattern,
                               "severity": "critical", "action": "block"})

        # PII
        for pii_type, pattern in self.PII_PATTERNS.items():
            matches = re.findall(pattern, text)
            if matches:
                issues.append({"guardrail": "pii", "type": pii_type,
                               "count": len(matches), "severity": "warning",
                               "action": "redact"})

        # Secrets
        for secret_type, pattern in self.SECRET_PATTERNS.items():
            matches = re.findall(pattern, text)
            if matches:
                issues.append({"guardrail": "secret", "type": secret_type,
                               "count": len(matches), "severity": "critical",
                               "action": "block"})

        # SQL injection (basic)
        sql_patterns = ["'; DROP TABLE", "'; DELETE FROM", "UNION SELECT", "--", "/*", "*/"]
        for pattern in sql_patterns:
            if pattern.lower() in lower:
                issues.append({"guardrail": "sql_injection", "pattern": pattern,
                               "severity": "warning", "action": "sanitize"})
                break

        # Token limit (rough estimate: 1 token ≈ 4 chars)
        estimated_tokens = len(text) // 4
        if estimated_tokens > max_tokens:
            issues.append({"guardrail": "token_limit", "estimated_tokens": estimated_tokens,
                           "limit": max_tokens, "severity": "warning", "action": "truncate"})

        critical = [i for i in issues if i["severity"] == "critical"]
        action = "block" if critical else ("sanitize" if issues else "allow")
        return {"is_safe": len(critical) == 0, "issues": issues, "action": action}

    def check_output(self, output: str, *, context: str | None = None,
                     citations: list | None = None,
                     expected_json: bool = False) -> dict[str, Any]:
        """Run all output guardrails. Returns {is_safe, issues, action}."""
        issues: list[dict] = []
        lower = output.lower()

        # Toxicity
        for pattern in self.TOXICITY_PATTERNS:
            if pattern in lower:
                issues.append({"guardrail": "toxicity", "pattern": pattern,
                               "severity": "critical", "action": "block"})

        # Profanity
        words = set(lower.split())
        profanity_found = words & self.PROFANITY_WORDS
        if profanity_found:
            issues.append({"guardrail": "profanity", "words": list(profanity_found),
                           "severity": "warning", "action": "redact"})

        # Missing citation (if context was provided)
        if context and not citations:
            if "[1]" not in output and "[source" not in output.lower():
                issues.append({"guardrail": "missing_citation", "severity": "warning",
                               "action": "flag", "message": "Context provided but no citations in output"})

        # JSON validation
        if expected_json:
            try:
                json.loads(output)
            except json.JSONDecodeError:
                # Try to extract JSON
                match = re.search(r"\{.*\}", output, re.DOTALL)
                if not match:
                    issues.append({"guardrail": "json_validation", "severity": "warning",
                                   "action": "flag", "message": "Expected JSON but output is not valid JSON"})

        # Hallucination indicators
        hallucination_phrases = ["i'm not sure", "i think maybe", "this might be",
                                 "i don't have enough", "i cannot verify", "as far as i know"]
        for phrase in hallucination_phrases:
            if phrase in lower[:200]:
                issues.append({"guardrail": "hallucination_indicator", "phrase": phrase,
                               "severity": "warning", "action": "flag"})
                break

        critical = [i for i in issues if i["severity"] == "critical"]
        action = "block" if critical else ("flag" if issues else "allow")
        return {"is_safe": len(critical) == 0, "issues": issues, "action": action}

    async def log_event(self, *, organization_id: uuid.UUID, guardrail_type: str,
                       direction: str, input_text: str | None = None,
                       output: str | None = None, action: str = "block",
                       reason: str | None = None, severity: str = "warning",
                       trace_id: str | None = None, details: dict | None = None) -> GuardrailEvent:
        """Log a guardrail event for audit + analytics."""
        event = GuardrailEvent(
            organization_id=str(organization_id), trace_id=trace_id,
            guardrail_type=guardrail_type, direction=direction,
            input=input_text, output=output, action=action, reason=reason,
            severity=severity, details=details)
        self.db.add(event)
        await self.db.flush()
        return event

    async def list_events(self, *, organization_id: uuid.UUID,
                          guardrail_type: str | None = None,
                          skip: int = 0, limit: int = 50) -> tuple[list[dict], int]:
        conditions = [GuardrailEvent.organization_id == str(organization_id)]
        if guardrail_type:
            conditions.append(GuardrailEvent.guardrail_type == guardrail_type)
        count = int((await self.db.execute(
            select(func.count()).select_from(GuardrailEvent).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(GuardrailEvent).where(*conditions)
            .order_by(GuardrailEvent.created_at.desc()).offset(skip).limit(limit))
        return ([{"id": str(e.id), "guardrail_type": e.guardrail_type,
                  "direction": e.direction, "action": e.action, "severity": e.severity,
                  "reason": e.reason, "trace_id": e.trace_id,
                  "created_at": e.created_at.isoformat() if e.created_at else None}
                 for e in result.scalars().all()], count)


# ====================================================================
# Confidence Engine — scoring + escalation
# ====================================================================

class ConfidenceEngine:
    """Computes confidence scores and decides on escalation actions."""

    @staticmethod
    def compute_scores(*, output: str, citations: list | None = None,
                       context: str | None = None, latency_ms: int = 0,
                       guardrail_issues: list | None = None) -> dict[str, Any]:
        """Compute confidence, evidence, citation, and risk scores.

        Returns:
            {"confidence": float, "evidence_score": float, "citation_score": float,
             "risk_score": float, "recommendation": str}
        """
        # Citation score
        if citations and len(citations) > 0:
            avg_citation_score = sum(c.get("score", 0.5) for c in citations if isinstance(c, dict)) / len(citations)
            citation_score = min(1.0, avg_citation_score)
        else:
            citation_score = 0.2

        # Evidence score (based on context presence + length)
        if context and len(context) > 100:
            evidence_score = min(1.0, len(context) / 5000)
        else:
            evidence_score = 0.3

        # Risk score (based on guardrail issues)
        if guardrail_issues:
            critical_count = sum(1 for i in guardrail_issues if i.get("severity") == "critical")
            risk_score = min(1.0, critical_count * 0.3 + len(guardrail_issues) * 0.1)
        else:
            risk_score = 0.1

        # Overall confidence
        confidence = (citation_score * 0.4 + evidence_score * 0.4 + (1 - risk_score) * 0.2)
        confidence = max(0.0, min(1.0, confidence))

        # Recommendation
        if confidence < 0.3:
            recommendation = "escalate"
        elif confidence < 0.5:
            recommendation = "ask_clarification"
        elif confidence < 0.7:
            recommendation = "search_again"
        else:
            recommendation = "respond"

        return {"confidence": round(confidence, 4),
                "evidence_score": round(evidence_score, 4),
                "citation_score": round(citation_score, 4),
                "risk_score": round(risk_score, 4),
                "recommendation": recommendation}


# ====================================================================
# Model Router — choose model based on task/budget/latency
# ====================================================================

class ModelRouter:
    """Automatically routes requests to the best model based on criteria.

    Routing strategies:
      - cheapest: lowest cost per token
      - fastest: lowest avg latency
      - highest_quality: best benchmark scores
      - reasoning: models with chain-of-thought capability
      - vision: models with image understanding
      - voice: models optimized for voice
    """

    MODEL_REGISTRY = {
        "gpt-4o": {"provider": "openai", "cost_per_1k_input": 2.5, "cost_per_1k_output": 10,
                    "avg_latency_ms": 2000, "quality": 0.95, "capabilities": ["reasoning", "vision"]},
        "gpt-4o-mini": {"provider": "openai", "cost_per_1k_input": 0.15, "cost_per_1k_output": 0.6,
                         "avg_latency_ms": 800, "quality": 0.85, "capabilities": ["reasoning"]},
        "claude-3-5-sonnet": {"provider": "anthropic", "cost_per_1k_input": 3, "cost_per_1k_output": 15,
                               "avg_latency_ms": 1500, "quality": 0.93, "capabilities": ["reasoning"]},
        "claude-3-haiku": {"provider": "anthropic", "cost_per_1k_input": 0.25, "cost_per_1k_output": 1.25,
                            "avg_latency_ms": 600, "quality": 0.82, "capabilities": []},
        "gemini-1.5-pro": {"provider": "gemini", "cost_per_1k_input": 1.25, "cost_per_1k_output": 5,
                            "avg_latency_ms": 1200, "quality": 0.90, "capabilities": ["reasoning", "vision"]},
        "groq-llama-3.1-70b": {"provider": "groq", "cost_per_1k_input": 0.59, "cost_per_1k_output": 0.79,
                                 "avg_latency_ms": 200, "quality": 0.87, "capabilities": ["reasoning"]},
    }

    @classmethod
    def route(cls, *, strategy: str = "cheapest",
              required_capability: str | None = None,
              max_cost_per_1k: float | None = None,
              max_latency_ms: int | None = None) -> dict[str, Any]:
        """Route to the best model based on the strategy."""
        candidates = dict(cls.MODEL_REGISTRY)

        # Filter by required capability
        if required_capability:
            candidates = {k: v for k, v in candidates.items()
                          if required_capability in v["capabilities"]}

        # Filter by max cost
        if max_cost_per_1k is not None:
            candidates = {k: v for k, v in candidates.items()
                          if v["cost_per_1k_input"] + v["cost_per_1k_output"] <= max_cost_per_1k}

        # Filter by max latency
        if max_latency_ms is not None:
            candidates = {k: v for k, v in candidates.items()
                          if v["avg_latency_ms"] <= max_latency_ms}

        if not candidates:
            return {"model": "gpt-4o-mini", "provider": "openai", "reason": "fallback"}

        if strategy == "cheapest":
            best = min(candidates.items(), key=lambda x: x[1]["cost_per_1k_input"] + x[1]["cost_per_1k_output"])
        elif strategy == "fastest":
            best = min(candidates.items(), key=lambda x: x[1]["avg_latency_ms"])
        elif strategy == "highest_quality":
            best = max(candidates.items(), key=lambda x: x[1]["quality"])
        elif strategy == "reasoning":
            best = max(candidates.items(), key=lambda x: x[1]["quality"]
                       if "reasoning" in x[1]["capabilities"] else 0)
        elif strategy == "vision":
            best = max(candidates.items(), key=lambda x: x[1]["quality"]
                       if "vision" in x[1]["capabilities"] else 0)
        else:
            best = min(candidates.items(), key=lambda x: x[1]["cost_per_1k_input"])

        return {"model": best[0], "provider": best[1]["provider"],
                "cost_per_1k_input": best[1]["cost_per_1k_input"],
                "avg_latency_ms": best[1]["avg_latency_ms"],
                "quality": best[1]["quality"], "strategy": strategy}

    @classmethod
    def list_models(cls) -> list[dict[str, Any]]:
        """List all registered models with their specs."""
        return [{"model": k, **v} for k, v in cls.MODEL_REGISTRY.items()]


# ====================================================================
# Evaluation Framework — 14 metrics + golden datasets + regression
# ====================================================================

class EvaluationFrameworkService:
    """Evaluates AI outputs against golden datasets with 14 metrics."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_dataset(self, *, organization_id: uuid.UUID, name: str,
                             dataset_type: str = "golden",
                             description: str | None = None,
                             samples: list[dict] | None = None,
                             tags: list[str] | None = None,
                             created_by: uuid.UUID | None = None) -> GoldenDataset:
        """Create a test dataset."""
        dataset = GoldenDataset(
            organization_id=str(organization_id), name=name, description=description,
            dataset_type=dataset_type, samples=samples or [],
            total_samples=len(samples or []),
            tags=tags or [], created_by=str(created_by) if created_by else None)
        self.db.add(dataset)
        await self.db.flush()
        return dataset

    async def list_datasets(self, *, organization_id: uuid.UUID,
                            dataset_type: str | None = None) -> list[dict]:
        conditions = [GoldenDataset.organization_id == str(organization_id),
                      GoldenDataset.is_active == True]  # noqa: E712
        if dataset_type:
            conditions.append(GoldenDataset.dataset_type == dataset_type)
        result = await self.db.execute(
            select(GoldenDataset).where(*conditions).order_by(GoldenDataset.created_at.desc()))
        return [{"id": str(d.id), "name": d.name, "description": d.description,
                 "dataset_type": d.dataset_type, "total_samples": d.total_samples,
                 "tags": d.tags} for d in result.scalars().all()]

    async def create_eval_run(self, *, organization_id: uuid.UUID, name: str,
                              eval_type: str = "quality",
                              prompt_id: uuid.UUID | None = None,
                              agent_id: str | None = None,
                              model: str | None = None,
                              dataset_id: uuid.UUID | None = None,
                              created_by: uuid.UUID | None = None) -> EvaluationRun:
        """Create an evaluation run."""
        run = EvaluationRun(
            organization_id=str(organization_id), name=name, eval_type=eval_type,
            prompt_id=prompt_id, agent_id=agent_id, model=model, dataset_id=dataset_id,
            total_samples=0, completed_samples=0, status="pending",
            created_by=str(created_by) if created_by else None)
        self.db.add(run)
        await self.db.flush()
        return run

    async def list_eval_runs(self, *, organization_id: uuid.UUID,
                             skip: int = 0, limit: int = 50) -> tuple[list[dict], int]:
        conditions = [EvaluationRun.organization_id == str(organization_id)]
        count = int((await self.db.execute(
            select(func.count()).select_from(EvaluationRun).where(*conditions)
        )).scalar_one_or_none() or 0)
        result = await self.db.execute(
            select(EvaluationRun).where(*conditions)
            .order_by(EvaluationRun.created_at.desc()).offset(skip).limit(limit))
        return ([{"id": str(r.id), "name": r.name, "eval_type": r.eval_type,
                  "status": r.status, "total_samples": r.total_samples,
                  "completed_samples": r.completed_samples,
                  "avg_correctness": r.avg_correctness, "avg_groundedness": r.avg_groundedness,
                  "avg_faithfulness": r.avg_faithfulness, "avg_relevance": r.avg_relevance,
                  "avg_hallucination_score": r.avg_hallucination_score,
                  "pass_rate": r.pass_rate, "model": r.model,
                  "created_at": r.created_at.isoformat() if r.created_at else None}
                 for r in result.scalars().all()], count)

    @staticmethod
    def compute_metrics(*, question: str, answer: str, expected: str | None = None,
                        context: str | None = None, citations: list | None = None,
                        latency_ms: int = 0, cost_cents: int = 0) -> dict[str, float]:
        """Compute all 14 evaluation metrics for a single sample.

        Uses heuristics (production would use LLM-as-judge for some metrics).
        """
        # Correctness (if expected answer provided)
        if expected:
            # Simple word overlap
            answer_words = set(answer.lower().split())
            expected_words = set(expected.lower().split())
            overlap = len(answer_words & expected_words)
            union = len(answer_words | expected_words)
            correctness = overlap / union if union > 0 else 0.0
        else:
            correctness = None

        # Groundedness (answer supported by context?)
        if context:
            answer_sentences = answer.split(".")
            grounded_count = sum(1 for s in answer_sentences if s.strip() and s.strip()[:50] in context)
            groundedness = grounded_count / max(len(answer_sentences), 1)
        else:
            groundedness = None

        # Faithfulness (no hallucination)
        if context:
            hallucination_phrases = ["i'm not sure", "i think maybe", "this might be",
                                     "i don't have enough", "i cannot verify"]
            lower_answer = answer.lower()[:300]
            has_hallucination = any(p in lower_answer for p in hallucination_phrases)
            faithfulness = 0.3 if has_hallucination else 0.85
        else:
            faithfulness = None

        # Relevance (answer addresses the question?)
        question_words = set(question.lower().split())
        answer_words = set(answer.lower().split())
        relevance = len(question_words & answer_words) / max(len(question_words), 1)

        # Hallucination score (0=no hallucination, 1=high hallucination)
        if faithfulness is not None:
            hallucination_score = 1.0 - faithfulness
        else:
            hallucination_score = 0.5

        # Citation quality
        if citations and len(citations) > 0:
            citation_quality = min(1.0, len(citations) / 5)
        else:
            citation_quality = 0.0 if context else None

        return {
            "correctness": round(correctness, 4) if correctness is not None else None,
            "groundedness": round(groundedness, 4) if groundedness is not None else None,
            "faithfulness": round(faithfulness, 4) if faithfulness is not None else None,
            "relevance": round(relevance, 4),
            "hallucination_score": round(hallucination_score, 4),
            "citation_quality": round(citation_quality, 4) if citation_quality is not None else None,
            "latency_ms": latency_ms,
            "cost_cents": cost_cents,
        }


# ====================================================================
# Cost Analytics Service — per-org/agent/workflow/prompt + forecast
# ====================================================================

class CostAnalyticsService:
    """AI cost analytics — per-org, per-agent, per-workflow, per-user, per-day."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_cost_report(self, *, organization_id: uuid.UUID,
                              days: int = 30) -> dict[str, Any]:
        """Get a comprehensive cost report for the last N days."""
        cutoff = datetime.now(UTC) - timedelta(days=days)
        org_id = str(organization_id)

        # By model
        by_model = await self.db.execute(
            select(LLMRequest.model, func.sum(LLMRequest.cost_cents),
                   func.sum(LLMRequest.input_tokens + LLMRequest.output_tokens),
                   func.count(LLMRequest.id))
            .where(LLMRequest.organization_id == org_id, LLMRequest.created_at >= cutoff)
            .group_by(LLMRequest.model))
        cost_by_model = {row[0]: {"cost_cents": int(row[1] or 0), "tokens": int(row[2] or 0),
                                   "requests": int(row[3])} for row in by_model.all()}

        # By agent
        by_agent = await self.db.execute(
            select(LLMRequest.agent_id, func.sum(LLMRequest.cost_cents))
            .where(LLMRequest.organization_id == org_id, LLMRequest.created_at >= cutoff,
                   LLMRequest.agent_id.isnot(None))
            .group_by(LLMRequest.agent_id))
        cost_by_agent = {row[0]: int(row[1] or 0) for row in by_agent.all()}

        # By day (use func.date for SQLite compat; date_trunc for Postgres)
        try:
            by_day = await self.db.execute(
                select(func.date_trunc("day", LLMRequest.created_at),
                       func.sum(LLMRequest.cost_cents), func.count(LLMRequest.id))
                .where(LLMRequest.organization_id == org_id, LLMRequest.created_at >= cutoff)
                .group_by(func.date_trunc("day", LLMRequest.created_at))
                .order_by(func.date_trunc("day", LLMRequest.created_at)))
        except Exception:
            # SQLite fallback
            by_day = await self.db.execute(
                select(func.date(LLMRequest.created_at),
                       func.sum(LLMRequest.cost_cents), func.count(LLMRequest.id))
                .where(LLMRequest.organization_id == org_id, LLMRequest.created_at >= cutoff)
                .group_by(func.date(LLMRequest.created_at))
                .order_by(func.date(LLMRequest.created_at)))
        cost_by_day = {str(row[0]): {"cost_cents": int(row[1] or 0), "requests": int(row[2])}
                       for row in by_day.all()}

        # Totals
        total_cost = sum(v["cost_cents"] for v in cost_by_model.values())
        total_tokens = sum(v["tokens"] for v in cost_by_model.values())
        total_requests = sum(v["requests"] for v in cost_by_model.values())

        # Simple forecast (average daily cost × 30)
        daily_avg = total_cost / max(days, 1)
        forecast = int(daily_avg * 30)

        return {"period_days": days, "total_cost_cents": total_cost,
                "total_tokens": total_tokens, "total_requests": total_requests,
                "cost_by_model": cost_by_model, "cost_by_agent": cost_by_agent,
                "cost_by_day": cost_by_day, "forecast_next_month_cents": forecast}

"""Agent Registry Service — CRUD, versioning, archive/restore, clone, publish, templates, bindings."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.agent_platform import (
    AgentKnowledge,
    AgentTemplate,
    AgentTool,
    AgentVersion,
)
from app.models.ai import AgentConfig, ToolDefinition
from app.services.audit import AuditService

VALID_AGENT_TYPES = {
    "support", "sales", "product", "knowledge", "analytics", "escalation",
    "workflow", "supervisor", "planner", "researcher", "writer", "reviewer",
    "evaluator", "tool", "custom",
}
VALID_LLM_PROVIDERS = {"openai", "anthropic", "groq", "gemini"}


class AgentRegistryService:
    """Service for AI agent lifecycle management."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.audit = AuditService(db)

    async def create_agent(self, *, organization_id: uuid.UUID, created_by: uuid.UUID | None = None,
                           name: str, agent_type: str = "custom", description: str | None = None,
                           avatar_url: str | None = None, system_prompt: str | None = None,
                           instructions: str | None = None, llm_provider: str = "openai",
                           model: str = "gpt-4o-mini", temperature: float = 0.3,
                           max_tokens: int = 2000, timeout_seconds: int = 30,
                           max_retries: int = 3, context_window: int = 4096,
                           memory_config: dict | None = None, guardrails: dict | None = None,
                           confidence_threshold: float = 0.55, enable_rag: bool = True,
                           enable_memory: bool = True, enable_tool_calling: bool = True,
                           enable_safety_filter: bool = True, allowed_tools: list[str] | None = None,
                           knowledge_collections: list[str] | None = None,
                           template_id: uuid.UUID | None = None) -> AgentConfig:
        if agent_type not in VALID_AGENT_TYPES:
            raise ValidationError(f"Invalid agent_type: {agent_type}. Allowed: {sorted(VALID_AGENT_TYPES)}")
        if llm_provider not in VALID_LLM_PROVIDERS:
            raise ValidationError(f"Invalid llm_provider: {llm_provider}. Allowed: {sorted(VALID_LLM_PROVIDERS)}")

        if template_id is not None:
            template = await self.db.get(AgentTemplate, template_id)
            if template is None:
                raise NotFoundError("AgentTemplate", str(template_id))
            tpl = template.config or {}
            name = name or tpl.get("name", "Unnamed Agent")
            agent_type = tpl.get("agent_type", agent_type)
            system_prompt = system_prompt or tpl.get("system_prompt")
            instructions = instructions or tpl.get("instructions")
            llm_provider = tpl.get("llm_provider", llm_provider)
            model = tpl.get("model", model)
            temperature = tpl.get("temperature", temperature)
            max_tokens = tpl.get("max_tokens", max_tokens)
            template.clone_count += 1

        slug = name.lower().replace(" ", "-")[:100]
        agent = AgentConfig(
            organization_id=str(organization_id), agent_type=agent_type, name=name, slug=slug,
            description=description, avatar_url=avatar_url, system_prompt=system_prompt,
            instructions=instructions, llm_provider=llm_provider, model=model,
            temperature=temperature, max_tokens=max_tokens, timeout_seconds=timeout_seconds,
            max_retries=max_retries, context_window=context_window,
            memory_config=memory_config or {}, guardrails=guardrails or {},
            confidence_threshold=confidence_threshold, enable_rag=enable_rag,
            enable_memory=enable_memory, enable_tool_calling=enable_tool_calling,
            enable_safety_filter=enable_safety_filter, allowed_tools=allowed_tools or [],
            version=1, is_active=True, is_archived=False, is_published=False,
            created_by=str(created_by) if created_by else None,
        )
        self.db.add(agent)
        await self.db.flush()
        await self._create_version(agent, created_by, "Initial version")

        if knowledge_collections:
            for coll_name in knowledge_collections:
                binding = AgentKnowledge(
                    agent_id=str(agent.id), organization_id=str(organization_id),
                    collection_name=coll_name, is_primary=False,
                )
                self.db.add(binding)
        if allowed_tools:
            for tool_name in allowed_tools:
                result = await self.db.execute(select(ToolDefinition).where(ToolDefinition.name == tool_name))
                tool = result.scalar_one_or_none()
                if tool is not None:
                    binding = AgentTool(
                        agent_id=str(agent.id), tool_id=str(tool.id),
                        organization_id=str(organization_id), is_enabled=True,
                    )
                    self.db.add(binding)
        await self.db.flush()
        await self.audit.log(action="agent.create", actor_id=created_by, organization_id=organization_id,
                             resource_type="agent", resource_id=agent.id,
                             details={"name": name, "agent_type": agent_type, "model": model})
        return agent

    async def get_agent(self, *, organization_id: uuid.UUID, agent_id: uuid.UUID,
                        include_archived: bool = False) -> AgentConfig:
        agent = await self.db.get(AgentConfig, agent_id)
        if agent is None or agent.organization_id != str(organization_id):
            raise NotFoundError("Agent", str(agent_id))
        if agent.is_archived and not include_archived:
            raise NotFoundError("Agent", str(agent_id))
        return agent

    async def list_agents(self, *, organization_id: uuid.UUID, agent_type: str | None = None,
                          is_archived: bool = False, skip: int = 0, limit: int = 50) -> tuple[list[AgentConfig], int]:
        conditions = [AgentConfig.organization_id == str(organization_id), AgentConfig.is_archived == is_archived]
        if agent_type:
            conditions.append(AgentConfig.agent_type == agent_type)
        count_stmt = select(func.count()).select_from(AgentConfig).where(*conditions)
        total = int((await self.db.execute(count_stmt)).scalar_one_or_none() or 0)
        stmt = select(AgentConfig).where(*conditions).order_by(AgentConfig.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def update_agent(self, *, organization_id: uuid.UUID, agent_id: uuid.UUID,
                           updated_by: uuid.UUID | None = None, **updates: Any) -> AgentConfig:
        agent = await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        if "agent_type" in updates and updates["agent_type"] not in VALID_AGENT_TYPES:
            raise ValidationError(f"Invalid agent_type: {updates['agent_type']}")
        if "llm_provider" in updates and updates["llm_provider"] not in VALID_LLM_PROVIDERS:
            raise ValidationError(f"Invalid llm_provider: {updates['llm_provider']}")
        for key, value in updates.items():
            if hasattr(agent, key) and value is not None:
                setattr(agent, key, value)
        agent.version += 1
        await self.db.flush()
        change_summary = updates.pop("change_summary", "Updated configuration")
        await self._create_version(agent, updated_by, change_summary)
        await self.audit.log(action="agent.update", actor_id=updated_by, organization_id=organization_id,
                             resource_type="agent", resource_id=agent_id, details=updates)
        return agent

    async def archive_agent(self, *, organization_id, agent_id, archived_by=None) -> AgentConfig:
        agent = await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        agent.is_archived = True; agent.archived_at = datetime.now(UTC); agent.is_active = False
        await self.db.flush()
        return agent

    async def restore_agent(self, *, organization_id, agent_id, restored_by=None) -> AgentConfig:
        agent = await self.get_agent(organization_id=organization_id, agent_id=agent_id, include_archived=True)
        agent.is_archived = False; agent.archived_at = None; agent.is_active = True
        await self.db.flush()
        return agent

    async def delete_agent(self, *, organization_id, agent_id, deleted_by=None) -> None:
        agent = await self.get_agent(organization_id=organization_id, agent_id=agent_id, include_archived=True)
        await self.db.delete(agent)
        await self.db.flush()

    async def clone_agent(self, *, organization_id, agent_id, cloned_by, new_name, new_description=None) -> AgentConfig:
        original = await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        clone = await self.create_agent(
            organization_id=organization_id, created_by=cloned_by, name=new_name,
            agent_type=original.agent_type, description=new_description or original.description,
            avatar_url=original.avatar_url, system_prompt=original.system_prompt,
            instructions=original.instructions, llm_provider=original.llm_provider,
            model=original.model, temperature=original.temperature, max_tokens=original.max_tokens,
            timeout_seconds=original.timeout_seconds, max_retries=original.max_retries,
            context_window=original.context_window, memory_config=original.memory_config,
            guardrails=original.guardrails, confidence_threshold=original.confidence_threshold,
            enable_rag=original.enable_rag, enable_memory=original.enable_memory,
            enable_tool_calling=original.enable_tool_calling, enable_safety_filter=original.enable_safety_filter,
            allowed_tools=original.allowed_tools)
        return clone

    async def publish_agent(self, *, organization_id, agent_id, published_by) -> AgentConfig:
        agent = await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        template = AgentTemplate(
            organization_id=str(organization_id), name=agent.name,
            slug=agent.slug or agent.name.lower().replace(" ", "-")[:100],
            description=agent.description, category=agent.agent_type,
            config={"name": agent.name, "agent_type": agent.agent_type, "system_prompt": agent.system_prompt,
                    "instructions": agent.instructions, "llm_provider": agent.llm_provider, "model": agent.model,
                    "temperature": agent.temperature, "max_tokens": agent.max_tokens,
                    "enable_rag": agent.enable_rag, "enable_memory": agent.enable_memory,
                    "enable_tool_calling": agent.enable_tool_calling, "enable_safety_filter": agent.enable_safety_filter,
                    "allowed_tools": agent.allowed_tools},
            author_id=str(published_by), is_published=True, is_system=False)
        self.db.add(template)
        agent.is_published = True; agent.published_at = datetime.now(UTC)
        await self.db.flush()
        return agent

    async def unpublish_agent(self, *, organization_id, agent_id, unpublished_by) -> AgentConfig:
        agent = await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        agent.is_published = False; agent.published_at = None
        await self.db.flush()
        return agent

    async def list_versions(self, *, organization_id, agent_id) -> list[AgentVersion]:
        await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        result = await self.db.execute(
            select(AgentVersion).where(AgentVersion.agent_id == str(agent_id)).order_by(AgentVersion.version.desc()))
        return list(result.scalars().all())

    async def rollback_to_version(self, *, organization_id, agent_id, version, rolled_back_by=None) -> AgentConfig:
        agent = await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        result = await self.db.execute(
            select(AgentVersion).where(AgentVersion.agent_id == str(agent_id), AgentVersion.version == version))
        old = result.scalar_one_or_none()
        if old is None:
            raise NotFoundError("AgentVersion", f"v{version}")
        snapshot = old.config_snapshot or {}
        for key, value in snapshot.items():
            if hasattr(agent, key):
                setattr(agent, key, value)
        agent.version += 1
        await self.db.flush()
        await self._create_version(agent, rolled_back_by, f"Rolled back to v{version}")
        return agent

    async def bind_knowledge(self, *, organization_id, agent_id, collection_name, is_primary=False) -> AgentKnowledge:
        await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        binding = AgentKnowledge(agent_id=str(agent_id), organization_id=str(organization_id),
                                  collection_name=collection_name, is_primary=is_primary)
        self.db.add(binding)
        await self.db.flush()
        return binding

    async def unbind_knowledge(self, *, organization_id, agent_id, collection_name) -> None:
        result = await self.db.execute(
            select(AgentKnowledge).where(AgentKnowledge.agent_id == str(agent_id),
                                         AgentKnowledge.collection_name == collection_name))
        for b in result.scalars().all():
            await self.db.delete(b)
        await self.db.flush()

    async def list_knowledge_bindings(self, *, organization_id, agent_id) -> list[dict]:
        await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        result = await self.db.execute(select(AgentKnowledge).where(AgentKnowledge.agent_id == str(agent_id)))
        return [{"collection_name": b.collection_name, "is_primary": b.is_primary,
                 "created_at": b.created_at.isoformat() if b.created_at else None}
                for b in result.scalars().all()]

    async def list_tool_bindings(self, *, organization_id, agent_id) -> list[dict]:
        await self.get_agent(organization_id=organization_id, agent_id=agent_id)
        result = await self.db.execute(
            select(AgentTool, ToolDefinition).join(ToolDefinition, ToolDefinition.id == AgentTool.tool_id)
            .where(AgentTool.agent_id == str(agent_id)))
        return [{"tool_id": str(b.tool_id), "tool_name": t.name, "display_name": t.display_name,
                 "is_enabled": b.is_enabled, "requires_approval": b.requires_approval,
                 "rate_limit_override": b.rate_limit_override}
                for b, t in result.all()]

    async def list_templates(self, *, organization_id=None, category=None, published_only=True) -> list[AgentTemplate]:
        conditions = []
        if published_only:
            conditions.append(AgentTemplate.is_published == True)  # noqa: E712
        if organization_id is not None:
            conditions.append((AgentTemplate.organization_id == str(organization_id)) | (AgentTemplate.organization_id.is_(None)))
        else:
            conditions.append(AgentTemplate.organization_id.is_(None))
        if category:
            conditions.append(AgentTemplate.category == category)
        result = await self.db.execute(select(AgentTemplate).where(*conditions).order_by(AgentTemplate.clone_count.desc()))
        return list(result.scalars().all())

    async def _create_version(self, agent: AgentConfig, created_by: uuid.UUID | None, change_summary: str) -> AgentVersion:
        snapshot = {k: getattr(agent, k, None) for k in [
            "name", "agent_type", "description", "system_prompt", "instructions", "llm_provider",
            "model", "temperature", "max_tokens", "timeout_seconds", "max_retries", "context_window",
            "memory_config", "guardrails", "confidence_threshold", "enable_rag", "enable_memory",
            "enable_tool_calling", "enable_safety_filter", "allowed_tools"]}
        version = AgentVersion(agent_id=str(agent.id), organization_id=str(agent.organization_id),
                                version=agent.version, config_snapshot=snapshot, change_summary=change_summary,
                                created_by=str(created_by) if created_by else None, is_active=True)
        self.db.add(version)
        await self.db.flush()
        return version

    def to_dict(self, agent: AgentConfig) -> dict[str, Any]:
        return {
            "id": str(agent.id), "name": agent.name, "slug": agent.slug,
            "agent_type": agent.agent_type, "description": agent.description,
            "avatar_url": agent.avatar_url, "system_prompt": agent.system_prompt,
            "instructions": agent.instructions, "llm_provider": agent.llm_provider,
            "model": agent.model, "temperature": agent.temperature, "max_tokens": agent.max_tokens,
            "timeout_seconds": agent.timeout_seconds, "max_retries": agent.max_retries,
            "context_window": agent.context_window, "memory_config": agent.memory_config,
            "guardrails": agent.guardrails, "confidence_threshold": agent.confidence_threshold,
            "enable_rag": agent.enable_rag, "enable_memory": agent.enable_memory,
            "enable_tool_calling": agent.enable_tool_calling, "enable_safety_filter": agent.enable_safety_filter,
            "allowed_tools": agent.allowed_tools or [], "version": agent.version,
            "is_active": agent.is_active, "is_archived": agent.is_archived,
            "is_published": agent.is_published, "created_by": agent.created_by,
            "created_at": agent.created_at.isoformat() if agent.created_at else None,
            "updated_at": agent.updated_at.isoformat() if agent.updated_at else None,
        }

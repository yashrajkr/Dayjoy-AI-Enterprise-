"""Prompt Manager — versioned prompt templates with Jinja2 rendering.

Supports:
- System prompts, agent prompts, tenant prompts
- Dynamic variables (Jinja2 templates)
- Versioning (each prompt has multiple versions)
- Rollback (activate a previous version)
- Environment separation (dev/staging/prod)
- Prompt testing (score per version)
"""

import uuid
from typing import Any

from jinja2 import Environment, StrictUndefined
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.ai import Prompt, PromptVersion

logger = get_logger(__name__)

# Jinja2 environment for prompt rendering
_jinja_env = Environment(
    undefined=StrictUndefined,  # Fail on missing variables
    autoescape=False,  # Prompts are not HTML
    trim_blocks=True,
    lstrip_blocks=True,
)


class PromptManager:
    """Manages prompt templates with versioning and rendering."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_prompt(self, name: str, organization_id: uuid.UUID | None = None) -> Prompt:
        """Get a prompt by name (optionally tenant-specific)."""
        stmt = select(Prompt).where(
            Prompt.name == name,
            Prompt.is_active == True,  # noqa: E712
        )
        if organization_id:
            stmt = stmt.where(
                (Prompt.organization_id == str(organization_id))
                | (Prompt.organization_id.is_(None))
            )
        stmt = stmt.order_by(Prompt.organization_id.desc())  # tenant-specific first

        result = await self.db.execute(stmt)
        prompt = result.scalar_one_or_none()
        if prompt is None:
            raise NotFoundError("Prompt", name)
        return prompt

    async def get_active_version(self, prompt_id: uuid.UUID) -> PromptVersion:
        """Get the active version of a prompt."""
        result = await self.db.execute(
            select(PromptVersion)
            .where(
                PromptVersion.prompt_id == str(prompt_id),
                PromptVersion.is_active == True,  # noqa: E712
            )
            .order_by(PromptVersion.version.desc())
        )
        version = result.scalar_one_or_none()
        if version is None:
            raise NotFoundError("PromptVersion", f"prompt={prompt_id}")
        return version

    async def render_prompt(
        self,
        name: str,
        variables: dict[str, Any],
        organization_id: uuid.UUID | None = None,
    ) -> str:
        """Render a prompt template with variables.

        Args:
            name: Prompt name.
            variables: Template variables (Jinja2).
            organization_id: Tenant ID (for tenant-specific prompts).

        Returns:
            The rendered prompt string.
        """
        prompt = await self.get_prompt(name, organization_id)
        version = await self.get_active_version(prompt.id)

        try:
            template = _jinja_env.from_string(version.content)
            return template.render(**variables)
        except Exception as e:
            logger.error("prompt_render_failed", prompt=name, error=str(e))
            raise ValidationError(f"Failed to render prompt '{name}': {e}") from e

    async def create_prompt(
        self,
        name: str,
        content: str,
        *,
        prompt_type: str = "system",
        description: str | None = None,
        variables: dict | None = None,
        organization_id: uuid.UUID | None = None,
        environment: str = "dev",
        created_by: uuid.UUID | None = None,
    ) -> Prompt:
        """Create a new prompt with an initial version."""
        prompt = Prompt(
            organization_id=str(organization_id) if organization_id else None,
            name=name,
            description=description,
            prompt_type=prompt_type,
            current_version=1,
            environment=environment,
            variables=variables or {},
            is_active=True,
        )
        self.db.add(prompt)
        await self.db.flush()

        version = PromptVersion(
            prompt_id=str(prompt.id),
            version=1,
            content=content,
            created_by=str(created_by) if created_by else None,
            change_summary="Initial version",
            is_active=True,
        )
        self.db.add(version)
        await self.db.flush()
        return prompt

    async def create_version(
        self,
        prompt_id: uuid.UUID,
        content: str,
        *,
        change_summary: str | None = None,
        created_by: uuid.UUID | None = None,
    ) -> PromptVersion:
        """Create a new version of a prompt (deactivates previous versions)."""
        # Deactivate old versions
        result = await self.db.execute(
            select(PromptVersion).where(
                PromptVersion.prompt_id == str(prompt_id),
                PromptVersion.is_active == True,  # noqa: E712
            )
        )
        for old_version in result.scalars().all():
            old_version.is_active = False

        # Get next version number
        prompt = await self.db.get(Prompt, prompt_id)
        if prompt is None:
            raise NotFoundError("Prompt", str(prompt_id))
        new_version_num = prompt.current_version + 1

        version = PromptVersion(
            prompt_id=str(prompt_id),
            version=new_version_num,
            content=content,
            created_by=str(created_by) if created_by else None,
            change_summary=change_summary,
            is_active=True,
        )
        self.db.add(version)

        prompt.current_version = new_version_num
        await self.db.flush()
        return version

    async def rollback(self, prompt_id: uuid.UUID, version_number: int) -> PromptVersion:
        """Rollback to a previous version (activate it, deactivate current)."""
        # Deactivate current
        result = await self.db.execute(
            select(PromptVersion).where(
                PromptVersion.prompt_id == str(prompt_id),
                PromptVersion.is_active == True,  # noqa: E712
            )
        )
        for v in result.scalars().all():
            v.is_active = False

        # Activate the target version
        result = await self.db.execute(
            select(PromptVersion).where(
                PromptVersion.prompt_id == str(prompt_id),
                PromptVersion.version == version_number,
            )
        )
        target = result.scalar_one_or_none()
        if target is None:
            raise NotFoundError("PromptVersion", f"v{version_number}")

        target.is_active = True

        prompt = await self.db.get(Prompt, prompt_id)
        if prompt:
            prompt.current_version = version_number

        await self.db.flush()
        return target

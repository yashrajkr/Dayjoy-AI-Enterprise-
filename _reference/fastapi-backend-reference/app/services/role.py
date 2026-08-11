"""Role service — role and permission management."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.repositories.permission import PermissionRepository, RolePermissionRepository
from app.repositories.role import RoleRepository, UserRoleRepository
from app.schemas.role import RoleCreate, RoleResponse, RoleUpdate
from app.services.audit import AuditService


class RoleService:
    """Service for role and permission management."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.role_repo = RoleRepository(db)
        self.perm_repo = PermissionRepository(db)
        self.role_perm_repo = RolePermissionRepository(db)
        self.user_role_repo = UserRoleRepository(db)
        self.audit = AuditService(db)

    # ===== Roles =====

    async def get_role(self, role_id: uuid.UUID) -> RoleResponse:
        """Get a role by ID."""
        role = await self.role_repo.get_by_id(role_id)
        if role is None:
            raise NotFoundError("Role", str(role_id))
        # Get permissions for this role
        perm_codes = await self._get_role_permission_codes(role_id)
        return self._to_response(role, perm_codes)

    async def list_roles(self) -> list[RoleResponse]:
        """List all roles."""
        roles = await self.role_repo.get_all()
        result = []
        for role in roles:
            perm_codes = await self._get_role_permission_codes(role.id)
            result.append(self._to_response(role, perm_codes))
        return result

    async def create_role(
        self,
        request: RoleCreate,
        actor_id: uuid.UUID | None = None,
    ) -> RoleResponse:
        """Create a new role."""
        if await self.role_repo.get_by_name(request.name):
            raise ConflictError(f"Role '{request.name}' already exists")

        role = await self.role_repo.create(
            name=request.name,
            display_name=request.display_name,
            description=request.description,
            scope=request.scope,
            priority=request.priority,
            is_system=False,
        )

        # Assign permissions
        if request.permission_codes:
            await self._set_role_permissions(role.id, request.permission_codes)

        await self.audit.log(
            action="role.create",
            actor_id=actor_id,
            resource_type="role",
            resource_id=role.id,
            details={"name": role.name, "permissions": request.permission_codes},
        )

        return await self.get_role(role.id)

    async def update_role(
        self,
        role_id: uuid.UUID,
        request: RoleUpdate,
        actor_id: uuid.UUID | None = None,
    ) -> RoleResponse:
        """Update a role."""
        role = await self.role_repo.get_by_id(role_id)
        if role is None:
            raise NotFoundError("Role", str(role_id))

        if role.is_system and request.permission_codes is not None:
            # System roles' permissions can be updated, but name/scope cannot
            pass

        updates = request.model_dump(exclude_unset=True, exclude_none=True)

        # Handle permission_codes separately
        perm_codes = updates.pop("permission_codes", None)

        if updates:
            role = await self.role_repo.update(role_id, **updates)
            if role is None:
                raise NotFoundError("Role", str(role_id))

        if perm_codes is not None:
            await self._set_role_permissions(role_id, perm_codes)

        await self.audit.log(
            action="role.update",
            actor_id=actor_id,
            resource_type="role",
            resource_id=role_id,
            details=updates,
        )

        return await self.get_role(role_id)

    async def delete_role(
        self,
        role_id: uuid.UUID,
        actor_id: uuid.UUID | None = None,
    ) -> None:
        """Delete a role (cannot delete system roles)."""
        role = await self.role_repo.get_by_id(role_id)
        if role is None:
            raise NotFoundError("Role", str(role_id))

        if role.is_system:
            raise ValidationError("Cannot delete a system role")

        # Check if any users have this role
        user_roles = await self.user_role_repo.get_user_roles(role_id)  # type: ignore[arg-type]
        if user_roles:
            raise ValidationError(
                f"Cannot delete role '{role.name}' — {len(user_roles)} users have it assigned"
            )

        # Revoke all permissions then delete
        await self.role_perm_repo.revoke_all_for_role(role_id)
        await self.role_repo.delete(role_id)

        await self.audit.log(
            action="role.delete",
            actor_id=actor_id,
            resource_type="role",
            resource_id=role_id,
        )

    async def assign_role_to_user(
        self,
        user_id: uuid.UUID,
        role_id: uuid.UUID,
        organization_id: uuid.UUID | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> None:
        """Assign a role to a user."""
        await self.user_role_repo.assign_role(user_id, role_id, organization_id)

        await self.audit.log(
            action="role.assign",
            actor_id=actor_id,
            resource_type="user",
            resource_id=user_id,
            details={
                "role_id": str(role_id),
                "organization_id": str(organization_id) if organization_id else None,
            },
        )

    async def revoke_role_from_user(
        self,
        user_id: uuid.UUID,
        role_id: uuid.UUID,
        organization_id: uuid.UUID | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> None:
        """Revoke a role from a user."""
        await self.user_role_repo.revoke_role(user_id, role_id, organization_id)

        await self.audit.log(
            action="role.revoke",
            actor_id=actor_id,
            resource_type="user",
            resource_id=user_id,
            details={"role_id": str(role_id)},
        )

    # ===== Permissions =====

    async def list_permissions(self):
        """List all permissions."""
        from app.schemas.permission import PermissionResponse

        perms = await self.perm_repo.get_all()
        return [
            PermissionResponse(
                id=p.id,
                code=p.code,
                name=p.name,
                description=p.description,
                resource=p.resource,
                action=p.action,
                is_system=p.is_system,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
            for p in perms
        ]

    async def get_user_permissions(
        self, user_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> list[str]:
        """Get all permission codes for a user (across all their roles)."""
        user_roles = await self.user_role_repo.get_user_roles(user_id, organization_id)
        perm_codes: set[str] = set()
        for ur in user_roles:
            # Get permissions for this role
            role_perms = await self.role_perm_repo.get_role_permissions(uuid.UUID(ur.role_id))
            for rp in role_perms:
                perm = await self.perm_repo.get_by_id(uuid.UUID(rp.permission_id))
                if perm:
                    perm_codes.add(perm.code)
        return list(perm_codes)

    async def get_user_role_names(
        self, user_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> list[str]:
        """Get all role names for a user."""
        user_roles = await self.user_role_repo.get_user_roles(user_id, organization_id)
        role_names: list[str] = []
        for ur in user_roles:
            role = await self.role_repo.get_by_id(uuid.UUID(ur.role_id))
            if role:
                role_names.append(role.name)
        return role_names

    # ===== Helpers =====

    async def _set_role_permissions(self, role_id: uuid.UUID, permission_codes: list[str]) -> None:
        """Replace a role's permissions with the given list."""
        # Revoke all existing
        await self.role_perm_repo.revoke_all_for_role(role_id)

        # Grant new ones
        if permission_codes:
            perms = await self.perm_repo.get_by_codes(permission_codes)
            for perm in perms:
                await self.role_perm_repo.grant_permission(role_id, perm.id)

    def _to_response(self, role, perm_codes: list[str] | None = None) -> RoleResponse:
        """Convert ORM role to response schema."""
        return RoleResponse(
            id=role.id,
            name=role.name,
            display_name=role.display_name,
            description=role.description,
            is_system=role.is_system,
            scope=role.scope,
            priority=role.priority,
            permissions=perm_codes or [],
            created_at=role.created_at,
            updated_at=role.updated_at,
        )

    async def _get_role_permission_codes(self, role_id: uuid.UUID) -> list[str]:
        """Get permission codes for a role."""
        role_perms = await self.role_perm_repo.get_role_permissions(role_id)
        codes: list[str] = []
        for rp in role_perms:
            perm = await self.perm_repo.get_by_id(uuid.UUID(rp.permission_id))
            if perm:
                codes.append(perm.code)
        return codes

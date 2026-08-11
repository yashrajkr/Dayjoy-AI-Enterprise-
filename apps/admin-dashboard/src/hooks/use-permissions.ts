"use client";

import { useAdminStore } from "@/store/admin-store";
import { useCurrentUser } from "@/store/admin-store";
import type { Permission, ResourceType } from "@/types/domain";
import { hasPermission } from "@/lib/rbac";

export function usePermissions() {
  const user = useCurrentUser();
  return {
    user,
    can: (resource: ResourceType, permission: Permission) =>
      hasPermission(user, resource, permission),
  };
}

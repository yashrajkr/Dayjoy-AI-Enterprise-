"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AdminUser, RoleName, ResourceType, Permission } from "@/types/domain";
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import { logAudit } from "./audit-store";

function makePermissions(role: RoleName): AdminUser["permissions"] {
  const perms = ROLE_PERMISSIONS[role] ?? {};
  return perms as AdminUser["permissions"];
}

const SEED_ADMINS: AdminUser[] = [
  {
    id: "usr_admin",
    name: "Admin User",
    email: "admin@dayjoy.ai",
    role: "SUPER_ADMIN",
    permissions: makePermissions("SUPER_ADMIN"),
    status: "active",
    lastActiveAt: new Date().toISOString(),
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "usr_aishwarya",
    name: "Aishwarya Rao",
    email: "aishwarya.rao@dayjoy.ai",
    role: "AI_ADMIN",
    permissions: makePermissions("AI_ADMIN"),
    status: "active",
    lastActiveAt: new Date(Date.now() - 3600_000).toISOString(),
    createdAt: "2026-02-12T00:00:00.000Z",
  },
  {
    id: "usr_kabir",
    name: "Kabir Singh",
    email: "kabir.singh@dayjoy.ai",
    role: "KNOWLEDGE_ADMIN",
    permissions: makePermissions("KNOWLEDGE_ADMIN"),
    status: "active",
    lastActiveAt: new Date(Date.now() - 7200_000).toISOString(),
    createdAt: "2026-03-04T00:00:00.000Z",
  },
  {
    id: "usr_meera",
    name: "Meera Iyer",
    email: "meera.iyer@dayjoy.ai",
    role: "AUTOMATION_ADMIN",
    permissions: makePermissions("AUTOMATION_ADMIN"),
    status: "invited",
    lastActiveAt: null,
    createdAt: new Date(Date.now() - 86400_000).toISOString(),
  },
];

interface AdminState {
  admins: AdminUser[];
  currentUserId: string;
  create: (data: Omit<AdminUser, "id" | "permissions" | "createdAt" | "lastActiveAt">) => AdminUser;
  update: (id: string, patch: Partial<Pick<AdminUser, "name" | "email" | "role" | "status">>) => void;
  remove: (id: string) => void;
  setCurrent: (id: string) => void;
  hasPermission: (resource: ResourceType, permission: Permission) => boolean;
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      admins: SEED_ADMINS,
      currentUserId: "usr_admin",
      create: (data) => {
        const admin: AdminUser = {
          ...data,
          id: `usr_${Date.now().toString(36)}`,
          permissions: makePermissions(data.role),
          lastActiveAt: null,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ admins: [...s.admins, admin] }));
        logAudit({
          action: "INSERT",
          resourceType: "admin",
          resourceId: admin.id,
          resourceName: admin.email,
          newValues: { name: admin.name, email: admin.email, role: admin.role },
        });
        return admin;
      },
      update: (id, patch) => {
        const old = get().admins.find((a) => a.id === id);
        if (!old) return;
        const next: AdminUser = {
          ...old,
          ...patch,
          permissions: patch.role ? makePermissions(patch.role) : old.permissions,
        };
        set((s) => ({ admins: s.admins.map((a) => (a.id === id ? next : a)) }));
        logAudit({
          action: "UPDATE",
          resourceType: "admin",
          resourceId: id,
          resourceName: old.email,
          oldValues: { name: old.name, role: old.role, status: old.status },
          newValues: patch,
        });
      },
      remove: (id) => {
        const old = get().admins.find((a) => a.id === id);
        if (!old) return;
        set((s) => ({ admins: s.admins.filter((a) => a.id !== id) }));
        logAudit({
          action: "DELETE",
          resourceType: "admin",
          resourceId: id,
          resourceName: old.email,
        });
      },
      setCurrent: (id) => set({ currentUserId: id }),
      hasPermission: (resource, permission) => {
        const admin = get().admins.find((a) => a.id === get().currentUserId);
        if (!admin) return false;
        const perms = admin.permissions[resource] ?? [];
        return admin.role === "SUPER_ADMIN" || perms.includes(permission);
      },
    }),
    { name: "dayjoy_admins" },
  ),
);

export function useCurrentUser(): AdminUser | null {
  return useAdminStore((s) => s.admins.find((a) => a.id === s.currentUserId) ?? null);
}

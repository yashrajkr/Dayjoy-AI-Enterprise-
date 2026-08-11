"use client";

import type { AdminUser, Permission, ResourceType, RoleName } from "@/types/domain";

/** Role → default permission map. SUPER_ADMIN has everything. */
export const ROLE_PERMISSIONS: Record<RoleName, Partial<Record<ResourceType, Permission[]>>> = {
  SUPER_ADMIN: {
    assistant: ["view", "create", "edit", "delete", "configure", "test", "execute"],
    knowledge: ["view", "create", "edit", "delete", "export", "configure"],
    tool: ["view", "create", "edit", "delete", "test", "configure"],
    memory: ["view", "create", "edit", "delete", "configure", "test"],
    prompt: ["view", "create", "edit", "delete", "test", "configure"],
    voice: ["view", "configure", "execute"],
    whatsapp: ["view", "configure", "execute"],
    website: ["view", "configure", "execute"],
    automation: ["view", "create", "edit", "delete", "execute", "configure"],
    admin: ["view", "create", "edit", "delete", "configure"],
    audit: ["view", "export"],
    config: ["view", "configure"],
  },
  AI_ADMIN: {
    assistant: ["view", "create", "edit", "delete", "configure", "test"],
    tool: ["view", "create", "edit", "delete", "test"],
    memory: ["view", "create", "edit", "delete", "test"],
    prompt: ["view", "create", "edit", "delete", "test"],
    voice: ["view", "configure"],
    whatsapp: ["view", "configure"],
    website: ["view", "configure"],
    automation: ["view"],
    audit: ["view"],
    config: ["view"],
  },
  KNOWLEDGE_ADMIN: {
    knowledge: ["view", "create", "edit", "delete", "export", "configure"],
    prompt: ["view", "create", "edit", "test"],
    audit: ["view"],
    config: ["view"],
  },
  AUTOMATION_ADMIN: {
    automation: ["view", "create", "edit", "delete", "execute", "configure"],
    audit: ["view"],
    config: ["view"],
  },
  ANALYTICS_ADMIN: {
    audit: ["view", "export"],
    config: ["view"],
  },
  SUPPORT_ADMIN: {
    assistant: ["view", "test"],
    knowledge: ["view"],
    audit: ["view"],
    config: ["view"],
  },
};

export function hasPermission(
  user: Pick<AdminUser, "role"> | null,
  resource: ResourceType,
  permission: Permission,
): boolean {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  const perms = ROLE_PERMISSIONS[user.role]?.[resource] ?? [];
  return perms.includes(permission);
}

export const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: "Super Admin",
  AI_ADMIN: "AI Admin",
  KNOWLEDGE_ADMIN: "Knowledge Admin",
  AUTOMATION_ADMIN: "Automation Admin",
  ANALYTICS_ADMIN: "Analytics Admin",
  SUPPORT_ADMIN: "Support Admin",
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  SUPER_ADMIN: "Full access to every module and setting.",
  AI_ADMIN: "Manage assistants, tools, memory, prompts, and channel configurations.",
  KNOWLEDGE_ADMIN: "Manage knowledge base documents and RAG pipeline.",
  AUTOMATION_ADMIN: "Manage workflows and automation rules.",
  ANALYTICS_ADMIN: "View analytics, audit logs, and export reports.",
  SUPPORT_ADMIN: "View assistants and knowledge; run tests only.",
};

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuditEntry, AuditAction, ResourceType } from "@/types/domain";

interface AuditState {
  entries: AuditEntry[];
  log: (entry: Omit<AuditEntry, "id" | "createdAt" | "ipAddress">) => void;
  clear: () => void;
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set) => ({
      entries: [],
      log: (entry) =>
        set((s) => ({
          entries: [
            {
              ...entry,
              id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              createdAt: new Date().toISOString(),
              ipAddress: "127.0.0.1", // client-side placeholder; backend captures real IP
            },
            ...s.entries,
          ].slice(0, 1000), // cap at 1000 entries
        })),
      clear: () => set({ entries: [] }),
    }),
    { name: "dayjoy_audit" },
  ),
);

/** Convenience helper for stores to log mutations. */
export function logAudit(params: {
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string | null;
  resourceName?: string | null;
  userId?: string;
  userEmail?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("dayjoy_auth");
    const auth = raw ? JSON.parse(raw) : null;
    useAuditStore.getState().log({
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      resourceName: params.resourceName ?? null,
      userId: params.userId ?? auth?.email ?? "system",
      userEmail: params.userEmail ?? auth?.email ?? "system",
      oldValues: params.oldValues ?? null,
      newValues: params.newValues ?? null,
      metadata: params.metadata ?? null,
    });
  } catch {
    // ignore
  }
}

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MemoryRecord } from "@/types/domain";
import { logAudit } from "@/store/audit-store";

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const SEED_MEMORIES: MemoryRecord[] = [
  {
    id: "mem_pref_language",
    key: "pref:language",
    type: "PREFERENCE",
    scope: "customer",
    value: "Prefers Hindi for voice calls, English for WhatsApp messages.",
    importance: 8,
    agentId: "ast_sarah",
    expiresAt: null,
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-03-15T08:00:00.000Z",
    updatedAt: "2026-03-15T08:00:00.000Z",
  },
  {
    id: "mem_fact_order_history",
    key: "fact:order_history",
    type: "FACT",
    scope: "customer",
    value: "Last order #ORD-4821 placed on 2026-03-08 for ₹4,800 (Wellness Bundle).",
    importance: 9,
    agentId: "ast_priya",
    expiresAt: null,
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-03-12T10:30:00.000Z",
    updatedAt: "2026-03-12T10:30:00.000Z",
  },
  {
    id: "mem_summary_conversation",
    key: "summary:conversation",
    type: "HISTORY",
    scope: "session",
    value: "Discussed return process for skincare set; customer agreed to keep product after ₹500 goodwill credit.",
    importance: 6,
    agentId: "ast_sarah",
    expiresAt: "2026-03-22T10:00:00.000Z",
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-03-14T18:42:00.000Z",
    updatedAt: "2026-03-14T18:42:00.000Z",
  },
  {
    id: "mem_pref_contact_window",
    key: "pref:contact_window",
    type: "PREFERENCE",
    scope: "customer",
    value: "Available for calls between 18:00–21:00 IST on weekdays only.",
    importance: 7,
    agentId: "ast_sarah",
    expiresAt: null,
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-03-10T12:15:00.000Z",
    updatedAt: "2026-03-10T12:15:00.000Z",
  },
  {
    id: "mem_fact_distributor_tier",
    key: "fact:distributor_tier",
    type: "FACT",
    scope: "distributor",
    value: "Sunrise Wellness (DJ-1042) — Platinum tier, eligible for 22% margin and quarterly rebate.",
    importance: 9,
    agentId: "ast_priya",
    expiresAt: null,
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-03-05T09:20:00.000Z",
    updatedAt: "2026-03-05T09:20:00.000Z",
  },
];

type MemoryCreateInput = Omit<
  MemoryRecord,
  "id" | "createdBy" | "createdAt" | "updatedAt"
>;

interface MemoryState {
  memories: MemoryRecord[];
  create: (data: MemoryCreateInput) => MemoryRecord;
  update: (id: string, patch: Partial<MemoryRecord>) => void;
  remove: (id: string) => void;
  search: (query: string) => MemoryRecord[];
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      memories: SEED_MEMORIES,
      create: (data) => {
        const now = new Date().toISOString();
        const record: MemoryRecord = {
          ...data,
          id: genId("mem"),
          createdBy: "admin@dayjoy.ai",
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ memories: [record, ...s.memories] }));
        logAudit({
          action: "INSERT",
          resourceType: "memory",
          resourceId: record.id,
          resourceName: record.key,
          newValues: {
            key: record.key,
            type: record.type,
            scope: record.scope,
            importance: record.importance,
          },
        });
        return record;
      },
      update: (id, patch) => {
        const old = get().memories.find((m) => m.id === id);
        if (!old) return;
        const next: MemoryRecord = { ...old, ...patch, updatedAt: new Date().toISOString() };
        set((s) => ({ memories: s.memories.map((m) => (m.id === id ? next : m)) }));
        logAudit({
          action: "UPDATE",
          resourceType: "memory",
          resourceId: id,
          resourceName: old.key,
          oldValues: {
            key: old.key,
            value: old.value,
            importance: old.importance,
          },
          newValues: patch,
        });
      },
      remove: (id) => {
        const old = get().memories.find((m) => m.id === id);
        if (!old) return;
        set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
        logAudit({
          action: "DELETE",
          resourceType: "memory",
          resourceId: id,
          resourceName: old.key,
        });
      },
      search: (query) => {
        const q = query.trim().toLowerCase();
        const all = get().memories;
        if (!q) return [...all].sort((a, b) => b.importance - a.importance);
        return all
          .filter(
            (m) =>
              m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q),
          )
          .sort((a, b) => b.importance - a.importance);
      },
    }),
    { name: "dayjoy_memory" },
  ),
);

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Tool } from "@/types/domain";
import { logAudit } from "@/store/audit-store";

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Shared JSON-schema string used by tools that take a single string query. */
function querySchema(description: string): string {
  return JSON.stringify(
    {
      type: "object",
      properties: {
        query: { type: "string", description },
        topK: { type: "integer", default: 4 },
      },
      required: ["query"],
    },
    null,
    0,
  );
}

const SEED_TOOLS: Tool[] = [
  {
    id: "tool_search_knowledge",
    name: "search_knowledge",
    description: "Semantic search across the RAG knowledge base",
    category: "knowledge",
    executionType: "function",
    schema: querySchema("Natural language search query against the knowledge base."),
    enabled: true,
    calls: 12480,
    successRate: 98,
    avgLatencyMs: 240,
    assistantIds: ["ast_sarah", "ast_priya", "ast_raj"],
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-05T09:00:00.000Z",
    updatedAt: "2026-03-12T11:30:00.000Z",
  },
  {
    id: "tool_search_products",
    name: "search_products",
    description: "Look up catalog products, pricing and stock",
    category: "catalog",
    executionType: "function",
    schema: JSON.stringify(
      {
        type: "object",
        properties: {
          query: { type: "string", description: "Product name, SKU or category filter" },
          region: { type: "string", description: "Optional region code e.g. IN-MH" },
        },
        required: ["query"],
      },
      null,
      0,
    ),
    enabled: true,
    calls: 8120,
    successRate: 99,
    avgLatencyMs: 180,
    assistantIds: ["ast_sarah", "ast_priya", "ast_raj"],
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-06T10:00:00.000Z",
    updatedAt: "2026-03-11T15:10:00.000Z",
  },
  {
    id: "tool_customer_lookup",
    name: "customer_lookup",
    description: "Fetch customer profile, orders and LTV",
    category: "crm",
    executionType: "function",
    schema: JSON.stringify(
      {
        type: "object",
        properties: {
          phone: { type: "string", description: "Customer phone in E.164 format e.g. +919820041122" },
          email: { type: "string", description: "Customer email (alternative identifier)" },
        },
        required: [],
      },
      null,
      0,
    ),
    enabled: true,
    calls: 6940,
    successRate: 97,
    avgLatencyMs: 320,
    assistantIds: ["ast_sarah", "ast_priya"],
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-07T11:30:00.000Z",
    updatedAt: "2026-03-10T13:45:00.000Z",
  },
  {
    id: "tool_distributor_lookup",
    name: "distributor_lookup",
    description: "Resolve distributor code, tier and team",
    category: "crm",
    executionType: "function",
    schema: JSON.stringify(
      {
        type: "object",
        properties: {
          code: { type: "string", description: "Distributor code e.g. DJ-1042" },
          phone: { type: "string", description: "Distributor phone (alternative identifier)" },
        },
        required: [],
      },
      null,
      0,
    ),
    enabled: true,
    calls: 2310,
    successRate: 100,
    avgLatencyMs: 210,
    assistantIds: ["ast_sarah", "ast_priya"],
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-09T09:15:00.000Z",
    updatedAt: "2026-03-09T17:20:00.000Z",
  },
  {
    id: "tool_create_lead",
    name: "create_lead",
    description: "Create and score a new CRM lead",
    category: "crm",
    executionType: "function",
    schema: JSON.stringify(
      {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          source: { type: "string", enum: ["voice", "whatsapp", "website", "referral"] },
          intent: { type: "string", description: "Free-text intent summary" },
        },
        required: ["name", "phone", "source"],
      },
      null,
      0,
    ),
    enabled: true,
    calls: 3150,
    successRate: 96,
    avgLatencyMs: 410,
    assistantIds: ["ast_priya", "ast_raj"],
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-03-08T18:05:00.000Z",
  },
  {
    id: "tool_book_appointment",
    name: "book_appointment",
    description: "Book a slot on the sales calendar",
    category: "calendar",
    executionType: "function",
    schema: JSON.stringify(
      {
        type: "object",
        properties: {
          customerPhone: { type: "string" },
          slotIso: { type: "string", description: "ISO 8601 timestamp for the requested slot" },
          topic: { type: "string" },
        },
        required: ["customerPhone", "slotIso"],
      },
      null,
      0,
    ),
    enabled: true,
    calls: 1480,
    successRate: 94,
    avgLatencyMs: 540,
    assistantIds: ["ast_priya", "ast_raj"],
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-12T14:30:00.000Z",
    updatedAt: "2026-03-07T16:50:00.000Z",
  },
  {
    id: "tool_create_support_ticket",
    name: "create_support_ticket",
    description: "Open a support ticket with context",
    category: "communication",
    executionType: "function",
    schema: JSON.stringify(
      {
        type: "object",
        properties: {
          customerPhone: { type: "string" },
          subject: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          context: { type: "string", description: "Conversation summary" },
        },
        required: ["customerPhone", "subject"],
      },
      null,
      0,
    ),
    enabled: true,
    calls: 2020,
    successRate: 99,
    avgLatencyMs: 360,
    assistantIds: ["ast_sarah", "ast_raj"],
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-14T10:45:00.000Z",
    updatedAt: "2026-03-06T19:15:00.000Z",
  },
  {
    id: "tool_human_transfer",
    name: "human_transfer",
    description: "Warm transfer the conversation to an agent",
    category: "communication",
    executionType: "function",
    schema: JSON.stringify(
      {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why the transfer is being requested" },
          queue: { type: "string", enum: ["sales", "support", "billing"], default: "support" },
        },
        required: ["reason"],
      },
      null,
      0,
    ),
    enabled: true,
    calls: 670,
    successRate: 100,
    avgLatencyMs: 920,
    assistantIds: ["ast_sarah", "ast_priya", "ast_raj"],
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-16T11:00:00.000Z",
    updatedAt: "2026-03-05T20:30:00.000Z",
  },
];

type ToolCreateInput = Omit<
  Tool,
  "id" | "calls" | "successRate" | "avgLatencyMs" | "createdBy" | "createdAt" | "updatedAt"
> & {
  calls?: number;
  successRate?: number;
  avgLatencyMs?: number;
};

interface ToolState {
  tools: Tool[];
  create: (data: ToolCreateInput) => Tool;
  update: (id: string, patch: Partial<Tool>) => void;
  remove: (id: string) => void;
  toggleEnabled: (id: string) => void;
  recordCall: (id: string, success: boolean) => void;
}

export const useToolStore = create<ToolState>()(
  persist(
    (set, get) => ({
      tools: SEED_TOOLS,
      create: (data) => {
        const now = new Date().toISOString();
        const tool: Tool = {
          calls: 0,
          successRate: 100,
          avgLatencyMs: 0,
          ...data,
          id: genId("tool"),
          createdBy: "admin@dayjoy.ai",
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ tools: [...s.tools, tool] }));
        logAudit({
          action: "INSERT",
          resourceType: "tool",
          resourceId: tool.id,
          resourceName: tool.name,
          newValues: {
            name: tool.name,
            category: tool.category,
            executionType: tool.executionType,
            enabled: tool.enabled,
          },
        });
        return tool;
      },
      update: (id, patch) => {
        const old = get().tools.find((t) => t.id === id);
        if (!old) return;
        const next: Tool = { ...old, ...patch, updatedAt: new Date().toISOString() };
        set((s) => ({ tools: s.tools.map((t) => (t.id === id ? next : t)) }));
        logAudit({
          action: "UPDATE",
          resourceType: "tool",
          resourceId: id,
          resourceName: old.name,
          oldValues: {
            name: old.name,
            category: old.category,
            enabled: old.enabled,
            schema: old.schema,
          },
          newValues: patch,
        });
      },
      remove: (id) => {
        const old = get().tools.find((t) => t.id === id);
        if (!old) return;
        set((s) => ({ tools: s.tools.filter((t) => t.id !== id) }));
        logAudit({
          action: "DELETE",
          resourceType: "tool",
          resourceId: id,
          resourceName: old.name,
        });
      },
      toggleEnabled: (id) => {
        const old = get().tools.find((t) => t.id === id);
        if (!old) return;
        const next: Tool = { ...old, enabled: !old.enabled, updatedAt: new Date().toISOString() };
        set((s) => ({ tools: s.tools.map((t) => (t.id === id ? next : t)) }));
        logAudit({
          action: "UPDATE",
          resourceType: "tool",
          resourceId: id,
          resourceName: old.name,
          oldValues: { enabled: old.enabled },
          newValues: { enabled: next.enabled },
        });
      },
      recordCall: (id, success) => {
        const old = get().tools.find((t) => t.id === id);
        if (!old) return;
        const nextCalls = old.calls + 1;
        // Running average: weight previous rate by total calls, add 100 (or 0), divide by new total.
        const nextRate =
          (old.successRate * old.calls + (success ? 100 : 0)) / nextCalls;
        const next: Tool = {
          ...old,
          calls: nextCalls,
          successRate: Math.round(nextRate * 10) / 10,
          updatedAt: new Date().toISOString(),
        };
        set((s) => ({ tools: s.tools.map((t) => (t.id === id ? next : t)) }));
        logAudit({
          action: "UPDATE",
          resourceType: "tool",
          resourceId: id,
          resourceName: old.name,
          oldValues: { calls: old.calls, successRate: old.successRate },
          newValues: { calls: nextCalls, successRate: next.successRate, success },
        });
      },
    }),
    { name: "dayjoy_tools" },
  ),
);

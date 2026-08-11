"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Assistant } from "@/types/domain";
import { logAudit } from "@/store/audit-store";

/** Generates a sortable, collision-resistant id with a domain prefix. */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const SEED_ASSISTANTS: Assistant[] = [
  {
    id: "ast_sarah",
    name: "Sarah",
    type: "VOICE",
    description: "Primary inbound voice agent for customer support and order enquiries.",
    systemPrompt:
      "You are Sarah, the Dayjoy AI voice assistant. Speak in clear, warm Indian English. Always greet the caller by name when known, confirm order numbers before sharing status, and escalate to a human agent if the caller sounds frustrated or asks for a supervisor. Never quote medical advice without citing the source document.",
    model: "gpt-4o",
    temperature: 0.7,
    knowledgeSourceIds: ["doc_catalog", "doc_returns", "doc_voice_playbook"],
    toolIds: [
      "tool_search_knowledge",
      "tool_search_products",
      "tool_customer_lookup",
      "tool_human_transfer",
    ],
    memoryEnabled: true,
    memoryRetentionDays: 30,
    allowedChannels: ["voice"],
    status: "active",
    conversations: 4120,
    accuracy: 94,
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-05T09:00:00.000Z",
    updatedAt: "2026-03-12T11:30:00.000Z",
  },
  {
    id: "ast_priya",
    name: "Priya",
    type: "WHATSAPP",
    description: "WhatsApp assistant handling catalog queries, order placement and lead capture.",
    systemPrompt:
      "You are Priya, the Dayjoy WhatsApp assistant. Reply in concise messages under 60 words. Use emoji sparingly. Always share product prices in INR (₹) and confirm the customer's PIN code before quoting delivery dates. Capture the lead into the CRM when intent is high and offer to book a callback slot.",
    model: "gpt-4o",
    temperature: 0.7,
    knowledgeSourceIds: ["doc_catalog", "doc_pricing", "doc_distributor_policy"],
    toolIds: [
      "tool_search_products",
      "tool_create_lead",
      "tool_book_appointment",
      "tool_customer_lookup",
    ],
    memoryEnabled: true,
    memoryRetentionDays: 60,
    allowedChannels: ["whatsapp"],
    status: "active",
    conversations: 6480,
    accuracy: 92,
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-08T10:15:00.000Z",
    updatedAt: "2026-03-10T14:45:00.000Z",
  },
  {
    id: "ast_raj",
    name: "Raj",
    type: "WEB",
    description: "Website chat assistant for product discovery and appointment booking.",
    systemPrompt:
      "You are Raj, the Dayjoy website assistant. Help visitors find products, understand ingredients and book consultations. Always cite the source document for any health claim. Offer to escalate to a human agent for medical questions or bulk-order enquiries above ₹50,000.",
    model: "gpt-4o",
    temperature: 0.7,
    knowledgeSourceIds: ["doc_catalog", "doc_ingredient_compliance", "doc_pricing"],
    toolIds: [
      "tool_search_knowledge",
      "tool_search_products",
      "tool_book_appointment",
      "tool_create_support_ticket",
    ],
    memoryEnabled: true,
    memoryRetentionDays: 14,
    allowedChannels: ["website"],
    status: "active",
    conversations: 3240,
    accuracy: 90,
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-01-12T12:00:00.000Z",
    updatedAt: "2026-03-09T16:20:00.000Z",
  },
];

type AssistantCreateInput = Omit<
  Assistant,
  "id" | "conversations" | "accuracy" | "createdBy" | "createdAt" | "updatedAt"
>;

interface AssistantState {
  assistants: Assistant[];
  create: (data: AssistantCreateInput) => Assistant;
  update: (id: string, patch: Partial<Assistant>) => void;
  remove: (id: string) => void;
  getById: (id: string) => Assistant | undefined;
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set, get) => ({
      assistants: SEED_ASSISTANTS,
      create: (data) => {
        const now = new Date().toISOString();
        const assistant: Assistant = {
          ...data,
          id: genId("ast"),
          conversations: 0,
          accuracy: 0,
          createdBy: "admin@dayjoy.ai",
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ assistants: [...s.assistants, assistant] }));
        logAudit({
          action: "INSERT",
          resourceType: "assistant",
          resourceId: assistant.id,
          resourceName: assistant.name,
          newValues: {
            name: assistant.name,
            type: assistant.type,
            model: assistant.model,
            allowedChannels: assistant.allowedChannels,
          },
        });
        return assistant;
      },
      update: (id, patch) => {
        const old = get().assistants.find((a) => a.id === id);
        if (!old) return;
        const next: Assistant = { ...old, ...patch, updatedAt: new Date().toISOString() };
        set((s) => ({
          assistants: s.assistants.map((a) => (a.id === id ? next : a)),
        }));
        logAudit({
          action: "UPDATE",
          resourceType: "assistant",
          resourceId: id,
          resourceName: old.name,
          oldValues: {
            name: old.name,
            status: old.status,
            model: old.model,
            temperature: old.temperature,
          },
          newValues: patch,
        });
      },
      remove: (id) => {
        const old = get().assistants.find((a) => a.id === id);
        if (!old) return;
        set((s) => ({ assistants: s.assistants.filter((a) => a.id !== id) }));
        logAudit({
          action: "DELETE",
          resourceType: "assistant",
          resourceId: id,
          resourceName: old.name,
        });
      },
      getById: (id) => get().assistants.find((a) => a.id === id),
    }),
    { name: "dayjoy_assistants" },
  ),
);
